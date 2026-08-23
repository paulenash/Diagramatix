import { describe, it, expect } from "vitest";
import { autofillProject, linkedChildIds, reachableDiagramIds } from "@/app/lib/simulation/autofillProject";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * T2865 — Fill reaches the WHOLE drill-down tree, not just the diagram on screen.
 *
 * A run splices linked sub-processes in, so their tasks are real work in the
 * result. Filling only the open diagram left every level below it empty and the
 * assembler quietly substituted its own defaults — the deeper the process, the
 * more of the answer came from values the user could never see. Opening each
 * child by hand to fill it is not a reasonable thing to ask.
 *
 * A child's START event is a pass-through (the parent's token enters it), so it
 * is filled as a fixed ZERO rather than given an arrival rate.
 */
const lane = (id: string, label: string, parentId?: string) =>
  ({ id, type: "lane", parentId, x: 40, y: 0, width: 800, height: 200, label, properties: {} } as never);
const diagram = (laneName: string, taskId: string, childId?: string): DiagramData => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    { id: "P", type: "pool", x: 0, y: 0, width: 900, height: 200, label: "Co", properties: {} },
    lane("L", laneName, "P"),
    { id: "s", type: "start-event", parentId: "L", x: 60, y: 60, width: 40, height: 40, label: "Start", properties: {} },
    { id: taskId, type: "task", parentId: "L", x: 200, y: 60, width: 90, height: 50, label: taskId, properties: {} },
    ...(childId ? [{ id: "sub", type: "subprocess", parentId: "L", x: 400, y: 60, width: 120, height: 60, label: "Sub", properties: { linkedDiagramId: childId } }] : []),
  ],
  connectors: [],
} as unknown as DiagramData);

describe("autofillProject", () => {
  const byId = new Map<string, DiagramData>([
    ["root", diagram("Sales Team", "T1", "child")],
    ["child", diagram("Sales Manager", "T2", "grandchild")],
    ["grandchild", diagram("Approvers", "T3")],
  ]);

  it("fills every level, taking each level's OWN lane as its resource", () => {
    const { changed, filled } = autofillProject("root", byId);
    expect(changed.size, "all three levels changed").toBe(3);
    expect(filled).toBeGreaterThan(0);
    const teamOf = (id: string, taskId: string) => getSimParams(changed.get(id)!.elements.find((e) => e.id === taskId)!).teamId;
    expect(teamOf("root", "T1")).toBe("Sales Team");
    expect(teamOf("child", "T2"), "level 2 uses its own lane").toBe("Sales Manager");
    expect(teamOf("grandchild", "T3"), "level 3 too").toBe("Approvers");
    // And every level got a duration.
    for (const [id, t] of [["root", "T1"], ["child", "T2"], ["grandchild", "T3"]] as const) {
      expect(getSimParams(changed.get(id)!.elements.find((e) => e.id === t)!).cycleTime, `${id} cycle time`).toBeDefined();
    }
  });

  it("a CHILD's start event is a pass-through (fixed 0), the root's is a real arrival", () => {
    const { changed } = autofillProject("root", byId);
    const start = (id: string) => getSimParams(changed.get(id)!.elements.find((e) => e.id === "s")!).arrival;
    expect(start("root"), "the root process really does have arrivals").toMatchObject({ kind: "exponential" });
    expect(start("child")).toEqual({ kind: "fixed", value: 0 });
    expect(start("grandchild")).toEqual({ kind: "fixed", value: 0 });
  });

  it("never overwrites a value the user set", () => {
    const mine = new Map(byId);
    const child = structuredClone(byId.get("child")!);
    child.elements = child.elements.map((e) => (e.id === "s" ? { ...e, properties: { sim: { arrival: { kind: "fixed", value: 7 } } } } : e));
    mine.set("child", child);
    const { changed } = autofillProject("root", mine);
    expect(getSimParams(changed.get("child")!.elements.find((e) => e.id === "s")!).arrival).toEqual({ kind: "fixed", value: 7 });
  });

  it("is cycle-safe when two diagrams link to each other", () => {
    const a = diagram("A", "TA", "b");
    const b = diagram("B", "TB", "a");
    const looped = new Map<string, DiagramData>([["a", a], ["b", b]]);
    expect(() => autofillProject("a", looped)).not.toThrow();
    expect(linkedChildIds(a)).toEqual(["b"]);
  });

  /**
   * T2866 — a start event inside an EXPANDED subprocess is entered, not triggered.
   *
   * The assembler already turns it into a fixed-zero pass-through delay, but
   * nothing wrote that down: it is not an arrival source, so no fill touched it
   * and it sat blank, reading as a value the user still owed. It exists at every
   * level, INCLUDING the root diagram, which is why this is not part of the
   * child-only rule above.
   */
  it("zeroes an EP-body start event even in the ROOT diagram", () => {
    const root = diagram("Sales Team", "T1");
    root.elements.push(
      { id: "ep", type: "subprocess-expanded", parentId: "L", x: 300, y: 40, width: 300, height: 140, label: "Repeat until done", properties: {} } as never,
      { id: "eps", type: "start-event", parentId: "ep", x: 320, y: 90, width: 36, height: 36, label: "", properties: {} } as never,
    );
    const { changed } = autofillProject("solo", new Map([["solo", root]]));
    const arr = (id: string) => getSimParams(changed.get("solo")!.elements.find((e) => e.id === id)!).arrival;
    expect(arr("eps"), "the EP body is entered by a token that already exists").toEqual({ kind: "fixed", value: 0 });
    expect(arr("s"), "the real process start keeps its arrival").toMatchObject({ kind: "exponential" });
  });

  it("leaves an EVENT subprocess start alone — that one is a trigger", () => {
    const root = diagram("Sales Team", "T1");
    root.elements.push(
      { id: "ev", type: "subprocess-expanded", parentId: "L", x: 300, y: 40, width: 300, height: 140, label: "On error", properties: { subprocessType: "event" } } as never,
      { id: "evs", type: "start-event", parentId: "ev", x: 320, y: 90, width: 36, height: 36, label: "", properties: { eventType: "error" } } as never,
    );
    const { changed } = autofillProject("solo", new Map([["solo", root]]));
    const el = (changed.get("solo") ?? root).elements.find((e) => e.id === "evs")!;
    expect(getSimParams(el).arrival, "an error trigger is not a pass-through").toBeUndefined();
  });

  /**
   * T2867 — resource seeding is scoped to ONE process tree.
   *
   * Seeding harvested from every BPMN diagram in the project, so opening one
   * process provisioned the teams of every unrelated process alongside it.
   */
  it("reachableDiagramIds covers the tree and stops at it", () => {
    const withStranger = new Map(byId);
    withStranger.set("unrelated", diagram("Finance Team", "TX"));
    expect(reachableDiagramIds("root", withStranger)).toEqual(["root", "child", "grandchild"]);
    expect(reachableDiagramIds("child", withStranger), "entering mid-tree covers only what IT links into").toEqual(["child", "grandchild"]);
  });
});
