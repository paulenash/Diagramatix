/**
 * AI flowchart generation layout rules:
 *  - F4.06 — Parallel bars keep their creation thickness (no label inflation).
 *  - F4.07 — flowlines attach only to a Parallel bar's long faces (top/bottom
 *    for a horizontal bar), never its narrow ends.
 *  - F4.08 — Database elements are placed orthogonal to the flow (beside their
 *    anchor) and connected by a horizontal flowline.
 */
import { describe, it, expect } from "vitest";
import { layoutFlowchartDiagram } from "@/app/lib/diagram/layoutFlowchart";
import { getSymbolDefinition } from "@/app/lib/diagram/symbols/definitions";

describe("flowchart layout — F4.06 / F4.07 Parallel bar", () => {
  const out = layoutFlowchartDiagram({
    elements: [
      { id: "s", type: "terminator", label: "Start" },
      { id: "fork", type: "parallel" },
      { id: "a", type: "process", label: "A" },
      { id: "b", type: "process", label: "B" },
    ],
    connections: [
      { sourceId: "s", targetId: "fork" },
      { sourceId: "fork", targetId: "a" },
      { sourceId: "fork", targetId: "b" },
    ],
  });
  const fork = out.elements.find((e) => e.id === "fork")!;
  const conn = (s: string, t: string) => out.connectors.find((c) => c.sourceId === s && c.targetId === t)!;

  it("F4.06 — keeps its default creation thickness", () => {
    const def = getSymbolDefinition("flowchart-parallel");
    expect(fork.type).toBe("flowchart-parallel");
    expect(fork.height).toBe(def.defaultHeight); // 8 — not inflated to a labelled box
    expect(fork.width).toBe(def.defaultWidth);
  });

  it("F4.07 — flowlines attach to the long (top/bottom) faces only", () => {
    expect(conn("s", "fork").targetSide).toBe("top");      // arrives from above
    expect(conn("fork", "a").sourceSide).toBe("bottom");   // leaves downward
    expect(conn("fork", "b").sourceSide).toBe("bottom");
    for (const id of ["a", "b"]) {
      expect(["left", "right"]).not.toContain(conn("fork", id).sourceSide);
    }
    expect(["left", "right"]).not.toContain(conn("s", "fork").targetSide);
  });
});

describe("flowchart layout — F4.08 Database placement", () => {
  const out = layoutFlowchartDiagram({
    elements: [
      { id: "s", type: "terminator", label: "Start" },
      { id: "p", type: "process", label: "Save record" },
      { id: "db", type: "database", label: "Customers" },
      { id: "e", type: "terminator", label: "End" },
    ],
    connections: [
      { sourceId: "s", targetId: "p" },
      { sourceId: "p", targetId: "db" },
      { sourceId: "p", targetId: "e" },
    ],
  });
  const p = out.elements.find((e) => e.id === "p")!;
  const db = out.elements.find((e) => e.id === "db")!;
  const e = out.elements.find((x) => x.id === "e")!;
  const pdb = out.connectors.find((c) => c.sourceId === "p" && c.targetId === "db")!;

  it("places the database to the side of its anchor, vertically centred", () => {
    expect(db).toBeTruthy();
    expect(db.x).toBeGreaterThan(p.x + p.width);                       // to the right of the anchor
    const dbCy = db.y + db.height / 2, pCy = p.y + p.height / 2;
    expect(Math.abs(dbCy - pCy)).toBeLessThanOrEqual(2);              // same row as the anchor
  });

  it("connects the database with a horizontal flowline", () => {
    expect(pdb.sourceSide).toBe("right");
    expect(pdb.targetSide).toBe("left");
  });

  it("keeps the main flow vertical — the database is not in the spine", () => {
    // End sits below the process in the spine; the db sits to the side, so the
    // process→end flow stays vertical (same column).
    expect(Math.abs((p.x + p.width / 2) - (e.x + e.width / 2))).toBeLessThanOrEqual(2);
  });
});
