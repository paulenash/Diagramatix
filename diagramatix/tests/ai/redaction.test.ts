/**
 * Pre-egress AI redaction (ENT-06). The redactor must (a) hide sensitive
 * literals behind opaque tokens before a prompt leaves the tenant, and
 * (b) round-trip perfectly on the way back — including model-added
 * possessives and without mangling overlapping / substring names.
 */
import { describe, it, expect } from "vitest";
import { makeRedactor, IDENTITY_REDACTOR } from "@/app/lib/ai/redaction";

describe("redaction — makeRedactor", () => {
  it("T0938 — redacts known names to opaque tokens; no real name crosses the wire", () => {
    const r = makeRedactor(["Jane Smith", "Accounts Payable", "SAP"]);
    const sent = r.redact("Jane Smith in Accounts Payable posts to SAP.");
    expect(sent).not.toMatch(/Jane|Accounts Payable|SAP/);
    expect(sent).toBe("Entity_1 in Entity_2 posts to Entity_3.");
  });

  it("T0939 — restore is an exact inverse (round-trips the model's reply)", () => {
    const r = makeRedactor(["Jane Smith", "Accounts Payable", "SAP"]);
    const model = "Entity_1 handles it; Entity_2 is the bottleneck; data sits in Entity_3.";
    expect(r.restore(model)).toBe("Jane Smith handles it; Accounts Payable is the bottleneck; data sits in SAP.");
  });

  it("T0940 — longest-first: an overlapping name doesn't get half-replaced", () => {
    const r = makeRedactor(["Accounts Payable", "Accounts Payable Clerk"]);
    const sent = r.redact("The Accounts Payable Clerk works in Accounts Payable.");
    // "Accounts Payable Clerk" must map whole, not become "<AP token> Clerk".
    expect(sent).toBe("The Entity_2 works in Entity_1.");
    expect(r.restore(sent)).toBe("The Accounts Payable Clerk works in Accounts Payable.");
  });

  it("T0941 — boundary-aware: substrings of larger words are left alone", () => {
    const r = makeRedactor(["IT"]);
    // "IT" the team is redacted, but WAIT / ITEM are not touched.
    const sent = r.redact("IT will WAIT for the ITEM. IT knows.");
    expect(sent).toBe("Entity_1 will WAIT for the ITEM. Entity_1 knows.");
  });

  it("T0942 — restore handles a model-added possessive and doesn't clip Entity_10", () => {
    const many = Array.from({ length: 12 }, (_, i) => `Name${i}Team`);
    const r = makeRedactor(many);
    // token 1 possessive + token 10 must survive (no Entity_1-inside-Entity_10 bug)
    const model = "Entity_1's report went to Entity_10.";
    expect(r.restore(model)).toBe("Name0Team's report went to Name9Team.");
  });

  it("T0943 — filters junk (blank, single char, pure numbers) and dedupes", () => {
    const r = makeRedactor(["", " ", "A", "42", "Bob", "Bob", null, undefined]);
    expect(r.size).toBe(1); // only "Bob"
    expect(r.redact("Bob and Bob")).toBe("Entity_1 and Entity_1");
  });

  it("T0944 — an empty vocabulary yields the identity redactor (no-op)", () => {
    const r = makeRedactor([null, "", "7"]);
    expect(r).toBe(IDENTITY_REDACTOR);
    expect(r.redact("nothing changes")).toBe("nothing changes");
    expect(r.size).toBe(0);
  });
});
