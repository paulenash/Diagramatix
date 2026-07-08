import { describe, it, expect } from "vitest";
import { mintIngestKey, sha256, verifyIngestKey, readIngestKey } from "@/app/lib/mining/sourceAuth";
import { sourceHeaderFields, safeSource } from "@/app/lib/mining/sourceShape";
import { parseAnyLog } from "@/app/lib/mining/parseAnyLog";

describe("live mining sources — key auth (T0673)", () => {
  it("mints a prefixed key and stores only its sha256 hash", () => {
    const k = mintIngestKey();
    expect(k.key).toMatch(/^dgxk_[0-9a-f]{64}$/);
    expect(k.hash).toBe(sha256(k.key));
    expect(k.hash).not.toContain(k.key.slice(5)); // hash is not the raw key
    expect(k.prefix).toBe(k.key.slice(0, 12));
  });
  it("verifies the right key and rejects a wrong or missing one", () => {
    const k = mintIngestKey();
    expect(verifyIngestKey(k.key, k.hash)).toBe(true);
    expect(verifyIngestKey("dgxk_" + "0".repeat(64), k.hash)).toBe(false);
    expect(verifyIngestKey(null, k.hash)).toBe(false);
    expect(verifyIngestKey(k.key, null)).toBe(false);
  });
  it("reads the key from X-Api-Key or Authorization: Bearer", () => {
    expect(readIngestKey(new Headers({ "x-api-key": "abc" }))).toBe("abc");
    expect(readIngestKey(new Headers({ authorization: "Bearer xyz" }))).toBe("xyz");
    expect(readIngestKey(new Headers())).toBeNull();
  });
});

describe("source shape helpers (T0674)", () => {
  it("derives distinct header fields from the role mapping, ignoring blanks", () => {
    expect(sourceHeaderFields({ caseId: "inv", activity: "act", timestamp: "ts", state: "", resource: "who", controlId: "act" }))
      .toEqual(["inv", "act", "ts", "who"]); // dedup (act) + drop blank state
  });
  it("safeSource never leaks the key hash, buffer or secret config", () => {
    const s = safeSource({
      id: "s1", name: "n", kind: "azure-blob", apiKeyPrefix: "dgxk_ab", runId: "r1",
      mapping: { caseId: "c" }, config: { blobListUrl: "https://secret?sig=xxx" }, autoRefresh: true,
      eventCount: 5, lastIngestAt: new Date("2026-07-08T00:00:00Z"), lastRefreshAt: null, createdAt: new Date("2026-07-07T00:00:00Z"),
    });
    expect(s.hasConfig).toBe(true);
    expect(JSON.stringify(s)).not.toContain("secret");
    expect(JSON.stringify(s)).not.toContain("sig=");
    expect("apiKeyHash" in s).toBe(false);
    expect("buffer" in s).toBe(false);
    expect(s.eventCount).toBe(5);
  });
});

describe("parseAnyLog dispatch (T0675)", () => {
  it("parses CSV to headers/rows + a guessed mapping", () => {
    const p = parseAnyLog("case,activity,timestamp\nA,Start,2026-01-01T00:00:00Z\n", "log.csv");
    expect(p.headers).toEqual(["case", "activity", "timestamp"]);
    expect(p.rows).toEqual([["A", "Start", "2026-01-01T00:00:00Z"]]);
    expect(p.mapping.caseId).toBeTruthy();
  });
  it("routes XES-looking content to the XES parser", () => {
    const xes = `<?xml version="1.0"?><log><trace><string key="concept:name" value="A"/><event><string key="concept:name" value="Start"/><date key="time:timestamp" value="2026-01-01T00:00:00Z"/></event></trace></log>`;
    const p = parseAnyLog(xes, "log.xes");
    expect(p.rows.length).toBeGreaterThan(0);
  });
});
