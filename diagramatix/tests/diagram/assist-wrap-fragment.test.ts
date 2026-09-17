/**
 * The dropped verb that restructured a diagram.
 *
 * Paul, 2026-09-18, from his command log:
 *
 *   ✨ AI "Selected with a pool." → "put a pool around everything"
 *        → wrapped everything in a pool
 *
 * The recogniser dropped the leading "surround". The grammar needs a verb, so
 * the fragment fell through to the AI, which read it as being about EVERYTHING
 * and returned the whole-diagram wrap. With a pool already present that does not
 * draw a second one — it grows the existing pool and adopts every loose element
 * into it — so the entire diagram was re-homed into a 78px strip called Pool 1,
 * and reported success. Everything after that followed from it: nudging the pool
 * moved the whole diagram, and wrapping a selection was refused for already
 * being in a pool.
 *
 * Two answers, because either alone leaves the hole open. The grammar now takes
 * the fragment, so the AI never sees it. And the whole-diagram wrap asks first
 * when there is an existing pool for it to grow, because it is one dropped word
 * away from restructuring a diagram and it destroys nothing, so nothing else
 * would have stopped it.
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { needsConfirmation } from "@/app/lib/assist/confirm";
import type { DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 102, height: 65, properties: {}, ...extra } as DiagramElement);

describe("T4502 — the fragment is understood instead of guessed at", () => {
  it("takes the selection wrap with the verb dropped", () => {
    for (const said of [
      "Selected with a pool",
      "selected with a pool",
      "selected items with a pool",
      "these with a pool",
      "the selected elements with a pool",
    ]) {
      expect(parseCommand(said), said).toEqual([{ op: "wrapInContainer", container: "pool" }]);
    }
  });

  it("does the same for a lane, and keeps a name", () => {
    expect(parseCommand("selected with a lane")).toEqual([{ op: "wrapInContainer", container: "lane" }]);
    expect(parseCommand("selected with a pool called Finance"))
      .toEqual([{ op: "wrapInContainer", container: "pool", label: "Finance" }]);
  });

  it("still takes the full phrasing", () => {
    expect(parseCommand("surround selected with a pool")).toEqual([{ op: "wrapInContainer", container: "pool" }]);
    expect(parseCommand("wrap these in a pool")).toEqual([{ op: "wrapInContainer", container: "pool" }]);
  });

  it("leaves the whole-diagram wrap meaning what it meant", () => {
    // The rule must not have grown so loose that it swallows this one.
    expect(parseCommand("put a pool around everything")).toEqual([{ op: "wrapInPool" }]);
    expect(parseCommand("wrap everything in a pool")).toEqual([{ op: "wrapInPool" }]);
  });

  it("does not invent a wrap out of an unrelated sentence", () => {
    // It still demands a selection word, a preposition and a container word.
    for (const said of ["selected", "with a pool", "connect selected to Approve", "rename selected to Pool"]) {
      const ops = parseCommand(said);
      expect(ops?.[0]?.op, said).not.toBe("wrapInContainer");
    }
  });
});

describe("T4503 — growing an existing pool asks first", () => {
  const withPool = (): DiagramElement[] => [
    el("P", "pool", { x: 187, y: 788, width: 1112, height: 78 }),
    el("A", "task", { x: 300, y: 200 }),
    el("B", "task", { x: 460, y: 200 }),
    el("C", "task", { x: 620, y: 200 }),
  ];

  it("asks, naming the pool and the count", () => {
    const what = needsConfirmation([{ op: "wrapInPool" }], withPool());
    expect(what).toContain("3 loose elements");
    expect(what).toContain("P");
  });

  it("does not ask when there is no pool to grow", () => {
    // A brand-new pool is easy to see and easy to undo; asking would be noise.
    const noPool = withPool().filter((e) => e.type !== "pool");
    expect(needsConfirmation([{ op: "wrapInPool" }], noPool)).toBeNull();
  });

  it("does not ask when there is nothing loose to adopt", () => {
    const allHoused = withPool().map((e) => (e.type === "pool" ? e : { ...e, parentId: "P" }));
    expect(needsConfirmation([{ op: "wrapInPool" }], allHoused)).toBeNull();
  });

  it("leaves the ordinary selection wrap unasked", () => {
    // Wrapping what you selected is exactly as big as it looks.
    expect(needsConfirmation([{ op: "wrapInContainer", container: "pool" }], withPool())).toBeNull();
  });

  it("has not disturbed the confirmations that were already there", () => {
    expect(needsConfirmation([{ op: "clear" }], withPool())).toContain("clear the whole diagram");
  });
});
