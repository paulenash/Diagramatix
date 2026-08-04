import { describe, it, expect } from "vitest";
import { matchIntent, keywordHits, type IntentRow } from "@/app/lib/diagram/intentMatch";

const CATALOG: IntentRow[] = [
  { label: "Approval", keywords: ["approve", "sign-off", "authorise"], targetCategory: "Approvals" },
  { label: "Notification", keywords: ["notify", "email"], targetTemplateName: "Send Notification" },
];

describe("keywordHits", () => {
  it("matches on word boundaries, case-insensitively", () => {
    expect(keywordHits("Approve Invoice", "approve")).toBe(true);
    expect(keywordHits("APPROVE", "approve")).toBe(true);
    expect(keywordHits("sign-off the PO", "sign-off")).toBe(true);
  });
  it("does not match substrings inside other words", () => {
    expect(keywordHits("Disapproved", "approve")).toBe(false);
    expect(keywordHits("Emailing", "email")).toBe(false);
  });
});

describe("matchIntent", () => {
  it("returns the first matching row with its target", () => {
    const m = matchIntent("Approve Invoice", CATALOG);
    expect(m?.label).toBe("Approval");
    expect(m?.category).toBe("Approvals");
    expect(m?.templateName).toBeNull();
  });
  it("carries a direct template name when set", () => {
    const m = matchIntent("Notify the customer", CATALOG);
    expect(m?.label).toBe("Notification");
    expect(m?.templateName).toBe("Send Notification");
  });
  it("returns null on no match or empty label", () => {
    expect(matchIntent("Do the thing", CATALOG)).toBeNull();
    expect(matchIntent("", CATALOG)).toBeNull();
    expect(matchIntent(null, CATALOG)).toBeNull();
  });
});
