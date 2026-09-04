import { describe, it, expect } from "vitest";
import { runMessageMatchesRow, runRowKey } from "@/app/lib/valueChain/runRowMatch";

/**
 * The batch runner attributed every count to the wrong diagram.
 *
 * Paul, 2026-09-05: "V22.01 Receive Notification ✗ 11el / 0conn — no flow" —
 * against a diagram that had generated perfectly well. Earlier, "#13 Process
 * Context ✓ 37el / 44conn", which is a BPMN diagram's size, not a context
 * diagram's, and "#14 Value Chain ✓ 32el / 31conn" when a value chain has no
 * connectors at all.
 *
 * The rows and the run are built by two different code paths that order a
 * chain's diagrams differently:
 *
 *   library GET   orderBy [type asc, processCode asc]
 *                 → archimate, bpmn…, context, process-context, value-chain
 *   run route     chain-level first in a hand-written order, then BPMN
 *                 → value-chain, context, process-context, archimate, bpmn…
 *
 * Both filter by the same picked keys, which preserves EACH ONE'S OWN order. On
 * V22, 14 of 14 positions disagree and BPMN rows are shifted by three.
 *
 * Paul suspected a position error the first time he saw it and I ruled it out,
 * having checked that both sides filter the same list by the same keys — and
 * missed that they BUILD that list separately. Two orderings agree only if one
 * is derived from the other; neither of these was.
 */
const ROWS = [
  { index: 1, type: "archimate", name: "V22 — ArchiMate" },
  { index: 2, type: "bpmn", name: "V22.01 Receive Notification" },
  { index: 3, type: "bpmn", name: "V22.02 Register Claim" },
  { index: 4, type: "context", name: "V22 — Context" },
];

describe("a run message finds its row by identity", () => {
  it("T3231 matches on name and type, not position", () => {
    // The exact shape of the bug: the server calls V22.01 index 5, the screen
    // has it at row 2. Identity must win.
    const msg = { index: 5, type: "bpmn", name: "V22.01 Receive Notification", connectors: 30 };
    const hit = ROWS.filter((r) => runMessageMatchesRow(r, msg));
    expect(hit).toHaveLength(1);
    expect(hit[0].index).toBe(2);
  });

  it("T3232 does not match the row that merely shares the position", () => {
    // Row 5 does not exist here, but the row AT the message's index must not be
    // claimed by it either — that is the defect, stated directly.
    const msg = { index: 4, type: "bpmn", name: "V22.02 Register Claim" };
    const hit = ROWS.filter((r) => runMessageMatchesRow(r, msg));
    expect(hit.map((r) => r.name)).toEqual(["V22.02 Register Claim"]);
    expect(hit[0].index).not.toBe(4);
  });

  it("T3233 distinguishes two diagrams that share a name but not a type", () => {
    // A chain-level prompt and a BPMN prompt can carry the same name; the key
    // has to include the type or the wrong one is updated.
    const rows = [
      { index: 1, type: "context", name: "V22 Claim to Settlement" },
      { index: 2, type: "value-chain", name: "V22 Claim to Settlement" },
    ];
    const hit = rows.filter((r) => runMessageMatchesRow(r, { index: 9, type: "value-chain", name: "V22 Claim to Settlement" }));
    expect(hit).toHaveLength(1);
    expect(hit[0].type).toBe("value-chain");
  });

  it("T3234 falls back to the index only when the message carries no name", () => {
    const hit = ROWS.filter((r) => runMessageMatchesRow(r, { index: 3 }));
    expect(hit.map((r) => r.name)).toEqual(["V22.02 Register Claim"]);
  });

  it("T3235 the key is the same shape the picker uses", () => {
    // The runner filters its selection with `${type}::${name}`. If these ever
    // diverge, a picked diagram and its progress row stop agreeing again.
    expect(runRowKey("bpmn", "V22.01 Receive Notification")).toBe("bpmn::V22.01 Receive Notification");
  });
});
