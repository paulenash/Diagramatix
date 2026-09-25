/**
 * Two rules about "surround selected with a pool" (Paul, 2026-09-19).
 *
 *   1. "It is never correct to grow an existing black-box pool to engulf
 *      elements and become a white-box pool."
 *   2. "Surround ALWAYS should create a new pool."
 *
 * A black-box participant is a deliberate statement that its insides are not
 * being modelled. Putting elements inside it contradicts the one thing it is
 * there to say, and silently changes its type on the way.
 *
 * The second rule is about who decides. The deterministic grammar has always
 * made a new pool for a surround. The AI has not: it keeps canonicalising a
 * surround it did not quite hear — "Selected with a pool" — into "put a pool
 * around everything", which grows an existing pool and re-homes the diagram.
 * Paul noticed the tell himself: "Surround selected with a NEW pool" works,
 * because that phrasing survives the grammar and never reaches the model.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import type { DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 100, y: 0, width: 400, height: 100, properties: {}, ...extra } as DiagramElement);

const drive = async (elements: DiagramElement[]) => {
  const { reducer } = await import("@/app/hooks/useDiagram");
  const before = { elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as unknown as Parameters<typeof reducer>[0];
  return reducer(before, { type: "WRAP_IN_POOL", payload: {} } as never);
};

const poolsOf = (els: DiagramElement[]) => els.filter((e) => e.type === "pool");

describe("T4517 — a black-box pool is never grown to swallow elements", () => {
  const withBlackBox = (): DiagramElement[] => [
    el("BB", "pool", { label: "Customer", y: 600, properties: { poolType: "black-box" } }),
    el("a", "task", { x: 200, y: 100, width: 102, height: 65 }),
    el("b", "task", { x: 360, y: 100, width: 102, height: 65 }),
  ];

  it("creates a new pool rather than engulfing the participant", async () => {
    const after = await drive(withBlackBox());
    const pools = poolsOf(after.elements as DiagramElement[]);
    expect(pools).toHaveLength(2);
    const created = pools.find((p) => p.id !== "BB")!;
    expect(created.properties?.poolType).toBe("white-box");
  });

  it("leaves the black-box pool exactly as it was", async () => {
    const after = await drive(withBlackBox());
    const bb = (after.elements as DiagramElement[]).find((e) => e.id === "BB")!;
    const was = withBlackBox().find((e) => e.id === "BB")!;
    expect(bb.properties?.poolType, "still a participant, not turned white-box").toBe("black-box");
    expect({ x: bb.x, y: bb.y, width: bb.width, height: bb.height })
      .toEqual({ x: was.x, y: was.y, width: was.width, height: was.height });
  });

  it("does not adopt the elements into it", async () => {
    const after = await drive(withBlackBox());
    for (const id of ["a", "b"]) {
      expect((after.elements as DiagramElement[]).find((e) => e.id === id)!.parentId).not.toBe("BB");
    }
  });

  it("treats a pool with no stated type as black-box", async () => {
    // Unset means black-box everywhere else in the app, so it must here too.
    const untyped = withBlackBox().map((e) => (e.id === "BB" ? { ...e, properties: {} } : e));
    const after = await drive(untyped);
    expect(poolsOf(after.elements as DiagramElement[])).toHaveLength(2);
  });
});

describe("T4518 — a white-box pool is still grown, as it was", () => {
  const withWhiteBox = (): DiagramElement[] => [
    el("WB", "pool", { label: "Warehouse", y: 600, properties: { poolType: "white-box" } }),
    el("a", "task", { x: 700, y: 620, width: 102, height: 65 }), // level with the pool: it may only WIDEN (2026-09-25)
  ];

  it("grows it rather than making a second pool", async () => {
    const after = await drive(withWhiteBox());
    expect(poolsOf(after.elements as DiagramElement[]), "no second pool").toHaveLength(1);
    expect((after.elements as DiagramElement[]).find((e) => e.id === "a")!.parentId).toBeTruthy();
  });

  it("counts a pool with lanes as white-box whatever its property says", async () => {
    // Having lanes IS being a white-box pool; the stored flag can lag.
    const laned: DiagramElement[] = [
      el("P", "pool", { label: "Warehouse", y: 600, properties: {} }),
      el("L1", "lane", { parentId: "P", y: 600, height: 100 }),
      el("a", "task", { x: 700, y: 620, width: 102, height: 65 }), // level with the pool: it may only WIDEN (2026-09-25)
    ];
    const after = await drive(laned);
    expect(poolsOf(after.elements as DiagramElement[])).toHaveLength(1);
  });
});

describe("T4519 — a surround always makes a new pool, whatever the AI returns", () => {
  const EDITOR = readFileSync(
    join(process.cwd(), "app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx"),
    "utf8",
  );

  it("rewrites the whole-diagram wrap when the user named the selection", () => {
    expect(EDITOR).toMatch(/op\.op === "wrapInPool" && \/\\b\(\?:selected\|selection\|these\|those\|highlighted\)\\b\//);
    expect(EDITOR).toContain('{ op: "wrapInContainer", container: "pool" as const');
  });

  it("does the rewrite before anything decides whether to ask", () => {
    // Otherwise the confirmation would announce the wrong action, and saying yes
    // would still re-home the diagram.
    const rewrite = EDITOR.indexOf('op.op === "wrapInPool" &&');
    const confirm = EDITOR.indexOf("needsConfirmation(ops,");
    expect(rewrite).toBeGreaterThan(-1);
    expect(confirm).toBeGreaterThan(rewrite);
  });

  it("leaves a genuine whole-diagram wrap alone", () => {
    // "put a pool around everything" names no selection, so nothing is rewritten
    // and it keeps its confirmation.
    expect(parseCommand("put a pool around everything")).toEqual([{ op: "wrapInPool" }]);
    expect(parseCommand("wrap everything in a pool")).toEqual([{ op: "wrapInPool" }]);
  });

  it("still parses both surround phrasings to the selection wrap", () => {
    for (const said of [
      "surround selected with a pool",
      "surround selected with a new pool",
      "selected with a pool",
    ]) {
      expect(parseCommand(said), said).toEqual([{ op: "wrapInContainer", container: "pool" }]);
    }
  });
});
