/**
 * Moving a container must not drag things off the boundaries they are mounted on.
 *
 * Paul's repro (2026-09-18), from "Abracadabra Testing 2": turn Abracadabra on,
 * select "Pool 1" with the mouse, say "nudge selected up", and the Start, the
 * End and three intermediate events all slide up with it — off the edge of the
 * "Document Handling" subprocess they are mounted on, which has not moved.
 *
 * The cause is two reasonable rules meeting a piece of data where they
 * disagree. Moving a container takes its contents; moving an element takes
 * whatever is mounted on its edge. Those five events carried `parentId` =
 * Pool 1 and `boundaryHostId` = the subprocess, so the container rule swept
 * them along while the host stayed put.
 *
 * An edge-mounted element follows its HOST. Sitting on a boundary is a hard
 * geometric commitment — the element is meaningless a few pixels off it —
 * whereas containment is a looser statement about where something lives.
 *
 * The fix is in the move set, not the voice command, so the mouse drag that had
 * the same defect is fixed too.
 */
import { describe, it, expect } from "vitest";
import { expandMoveSet, mountedAwayFromParent } from "@/app/lib/diagram/moveSet";
import type { DiagramElement } from "@/app/lib/diagram/types";

const CONTAINERS = new Set(["pool", "lane", "sublane", "subprocess-expanded", "group"]);
const isContainer = (t: string) => CONTAINERS.has(t);

/** Descendants by parentId, the same closure the reducer uses. */
const descendantsOf = (elements: DiagramElement[], id: string): string[] => {
  const out = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of elements) {
      if (out.has(e.id)) continue;
      if (e.parentId === id || (e.parentId && out.has(e.parentId))) { out.add(e.id); grew = true; }
    }
  }
  return [...out];
};

const el = (
  id: string, type: string,
  extra: Partial<DiagramElement> = {},
): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 36, height: 36, properties: {}, ...extra } as DiagramElement);

/** Paul's shape, reduced to what matters. */
const pauls = (): DiagramElement[] => [
  el("EP", "subprocess-expanded", { x: 300, y: 170, width: 900, height: 420 }),
  el("POOL", "pool", { x: 187, y: 788, width: 1112, height: 78 }),
  el("task", "task", { parentId: "EP", x: 400, y: 241 }),
  // Mounted on the subprocess, but parented to the pool.
  el("Start", "start-event", { parentId: "POOL", boundaryHostId: "EP", x: 383, y: 235 }),
  el("End", "end-event", { parentId: "POOL", boundaryHostId: "EP", x: 991, y: 235 }),
  el("Ev1", "intermediate-event", { parentId: "POOL", boundaryHostId: "EP", x: 955, y: 537 }),
  el("Ev2", "intermediate-event", { parentId: "POOL", boundaryHostId: "EP", x: 947, y: 152 }),
  el("Ev3", "intermediate-event", { parentId: "POOL", boundaryHostId: "EP", x: 753, y: 537 }),
  // Mounted on a task inside the subprocess.
  el("Ev4", "intermediate-event", { parentId: "EP", boundaryHostId: "task", x: 700, y: 288 }),
];

const moving = (els: DiagramElement[], ids: string[]) =>
  [...expandMoveSet(els, ids, isContainer, descendantsOf)].sort();

describe("T4497 — nudging Pool 1 leaves the subprocess's boundary events alone", () => {
  it("moves the pool and nothing mounted elsewhere", () => {
    expect(moving(pauls(), ["POOL"])).toEqual(["POOL"]);
  });

  it("names the five events that used to come along", () => {
    const swept = ["Start", "End", "Ev1", "Ev2", "Ev3"];
    const set = expandMoveSet(pauls(), ["POOL"], isContainer, descendantsOf);
    for (const id of swept) {
      expect(set.has(id), `${id} is mounted on the subprocess and must stay`).toBe(false);
    }
  });
});

describe("T4498 — what a move SHOULD still take with it", () => {
  it("takes a container's ordinary contents", () => {
    expect(moving(pauls(), ["EP"])).toEqual(["EP", "Ev1", "Ev2", "Ev3", "Ev4", "End", "Start", "task"].sort());
  });

  it("takes everything mounted on the thing being moved", () => {
    // Moving the subprocess moves the five events mounted on it, even though
    // their parent is a pool that is standing still.
    const set = expandMoveSet(pauls(), ["EP"], isContainer, descendantsOf);
    for (const id of ["Start", "End", "Ev1", "Ev2", "Ev3"]) expect(set.has(id), id).toBe(true);
  });

  it("follows a chain of mountings", () => {
    // Ev4 is mounted on a task, which is only moving because the subprocess is.
    expect(expandMoveSet(pauls(), ["EP"], isContainer, descendantsOf).has("Ev4")).toBe(true);
  });

  it("moves a boundary event the user picked outright", () => {
    // Selecting one and moving it is a deliberate act, host or no host.
    expect(moving(pauls(), ["Start"])).toEqual(["Start"]);
  });

  it("takes a boundary event whose host moves with its own parent", () => {
    expect(moving(pauls(), ["task"])).toEqual(["Ev4", "task"].sort());
  });

  it("is unbothered by an element with no parent and no host", () => {
    const loose = [el("A", "task"), el("B", "task")];
    expect(moving(loose, ["A"])).toEqual(["A"]);
  });

  it("does not loop forever on a mounting cycle", () => {
    // Not legal state, but a reducer must not hang on it.
    const cyclic = [
      el("X", "intermediate-event", { boundaryHostId: "Y" }),
      el("Y", "intermediate-event", { boundaryHostId: "X" }),
      el("Z", "task"),
    ];
    expect(() => moving(cyclic, ["Z"])).not.toThrow();
    expect(moving(cyclic, ["X"])).toEqual(["X", "Y"]);
  });
});

describe("T4499 — the reducer really uses it, on Paul's actual shape", () => {
  it("nudging the pool up moves the pool and leaves the five events where they were", async () => {
    // The pure rule above is worth nothing if MOVE_ELEMENTS keeps its own copy,
    // so this drives the reducer itself — the same path the mouse drag takes.
    const { reducer } = await import("@/app/hooks/useDiagram");
    const before = {
      elements: pauls(),
      connectors: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as Parameters<typeof reducer>[0];

    const after = reducer(before, {
      type: "MOVE_ELEMENTS",
      payload: { ids: ["POOL"], dx: 0, dy: -20 },
    } as never);

    const was = new Map(pauls().map((e) => [e.id, e] as const));
    const now = new Map(after.elements.map((e) => [e.id, e] as const));

    expect(now.get("POOL")!.y, "the pool moves").toBe(was.get("POOL")!.y - 20);
    for (const id of ["Start", "End", "Ev1", "Ev2", "Ev3"]) {
      expect(now.get(id)!.y, `${id} must stay on the subprocess boundary`).toBe(was.get(id)!.y);
    }
    expect(now.get("EP")!.y, "the host itself never moved").toBe(was.get("EP")!.y);
  });

  it("still carries the boundary events when their host is what moves", () => {
    const set = expandMoveSet(pauls(), ["EP"], isContainer, descendantsOf);
    expect([...set].sort()).toContain("Start");
  });
});

describe("T4500 — the mismatched parentage can be found", () => {
  it("reports exactly the five events whose parent is nowhere near their host", () => {
    expect(mountedAwayFromParent(pauls()).map((e) => e.id).sort())
      .toEqual(["End", "Ev1", "Ev2", "Ev3", "Start"].sort());
  });

  it("says nothing about a boundary event mounted inside its own parent", () => {
    // Ev4's host is a task inside Ev4's parent, which is the ordinary case.
    expect(mountedAwayFromParent(pauls()).map((e) => e.id)).not.toContain("Ev4");
  });

  it("says nothing about an element mounted on its own parent", () => {
    const tidy = [el("H", "task"), el("B", "intermediate-event", { parentId: "H", boundaryHostId: "H" })];
    expect(mountedAwayFromParent(tidy)).toEqual([]);
  });
});
