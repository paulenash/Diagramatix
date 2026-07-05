/**
 * Change C — IEEE XES import/export. parseXes maps the standard extensions onto
 * the normalised table (state left unmapped → Activity→State handles it); buildXes
 * reconstructs traces from variants and round-trips back through parseXes.
 */
import { describe, it, expect } from "vitest";
import { parseXes, buildXes } from "@/app/lib/mining/formats/xes";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { Variant, MiningStats } from "@/app/lib/mining/types";

const XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Receive Order"/>
      <date key="time:timestamp" value="2026-01-01T09:00:00.000Z"/>
      <string key="org:resource" value="Nadia"/>
      <string key="lifecycle:transition" value="complete"/>
      <string key="control:id" value="C-01"/>
    </event>
    <event>
      <string key="concept:name" value="Approve Order"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00.000Z"/>
      <string key="org:resource" value="Tom"/>
    </event>
  </trace>
</log>`;

describe("XES interchange (Change C)", () => {
  it("T0643 — parseXes maps concept/time/resource + extra keys, leaves state unmapped", () => {
    const { headers, rows, mapping } = parseXes(XES);
    expect(headers.slice(0, 5)).toEqual(["case", "activity", "timestamp", "resource", "lifecycle"]);
    expect(headers).toContain("control:id");   // custom key kept (prefix not stripped)
    expect(mapping.caseId).toBe("case");
    expect(mapping.activity).toBe("activity");
    expect(mapping.timestamp).toBe("timestamp");
    expect(mapping.resource).toBe("resource");
    expect(mapping.state).toBeUndefined();          // XES has no state → table completes it
    expect(mapping.controlId).toBe("control:id");   // guessed from the extra column
    expect(rows).toHaveLength(2);
    // flows through the normal pipeline
    const log = buildEventLog(headers, rows, { ...mapping } as never);
    expect(log.stats.cases).toBe(1);
    expect(log.traces[0].events.map((e) => e.activity)).toEqual(["Receive Order", "Approve Order"]);
  });

  it("T0644 — buildXes round-trips variants back through parseXes", () => {
    const variants: Variant[] = [{ states: ["Received", "Approved"], events: ["Receive Order", "Approve Order"], count: 3 }];
    const stats: MiningStats = { cases: 3, events: 6, activities: ["Approve Order", "Receive Order"], states: ["Approved", "Received"], variants: 1, from: Date.UTC(2026, 0, 1) };
    const xml = buildXes({ name: "Run", variants, stats });
    const { rows, headers } = parseXes(xml);
    // 3 traces × 2 events
    expect(rows).toHaveLength(6);
    const ai = headers.indexOf("activity");
    expect(rows.map((r) => r[ai])).toEqual(["Receive Order", "Approve Order", "Receive Order", "Approve Order", "Receive Order", "Approve Order"]);
    // state (≠ activity) carried as a custom:state attribute (kept verbatim on re-parse)
    expect(headers).toContain("custom:state");
  });
});
