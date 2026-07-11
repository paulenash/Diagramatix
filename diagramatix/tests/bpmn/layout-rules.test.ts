/**
 * BPMN code-enforced layout rules — behavioural registry (Tier-1 "B").
 *
 * The red ("code-backed") BPMN rules are a PROMISE that the layout engine
 * enforces a geometric invariant. This file makes that promise executable: a
 * single registry of rules, each carrying a `check()` that drives the real
 * `layoutBpmnDiagram` and asserts the invariant on the output. A meta-test pins
 * the registry — every entry must carry a check, so a new code-enforced rule
 * can't be added without proof, and a refactor that breaks a rule fails its
 * named test. Add a rule here whenever you add a red layout rule in
 * bpmnLayout.ts (R5.09, R8.04, R8.11/12, …).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const layout = (elements: AiElement[], connections: AiConnection[]) =>
  layoutBpmnDiagram(elements, connections);

type LayoutRule = { id: string; title: string; check: () => void };

const BPMN_LAYOUT_RULES: LayoutRule[] = [
  {
    id: "R5.09",
    title: "gateway labels sit top-left of the diamond, never on the right",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "Start" },
          { id: "g", type: "gateway", label: "Approved?" },
          { id: "a", type: "task", label: "Ship" },
          { id: "b", type: "task", label: "Reject" },
          { id: "e1", type: "end-event", label: "Done" },
          { id: "e2", type: "end-event", label: "Stop" },
        ],
        [
          { sourceId: "s", targetId: "g" },
          { sourceId: "g", targetId: "a", label: "Yes" },
          { sourceId: "g", targetId: "b", label: "No" },
          { sourceId: "a", targetId: "e1" },
          { sourceId: "b", targetId: "e2" },
        ],
      );
      const g = out.elements.find((e) => e.id === "g")!;
      const ox = (g.properties?.labelOffsetX as number) ?? 0;
      const oy = (g.properties?.labelOffsetY as number) ?? 0;
      // The label centre is left of the gateway centre (R5.09 never places it
      // on the right) and above it (top-left placement for a clear gateway).
      expect(ox, "gateway label should sit LEFT of the diamond").toBeLessThan(0);
      expect(oy, "gateway label should sit ABOVE the diamond").toBeLessThan(0);
    },
  },
  {
    id: "R6.02c",
    title: "a Pool/Lane hugs its content — ~1/2 Task-height of clearance above the top element and below the bottom element (was 2×; elements no longer float in a tall, mostly-empty lane)",
    check: () => {
      const TASK_H = 65; // symbols/definitions.ts: task defaultHeight
      const out = layout(
        [
          { id: "p", type: "pool", label: "Sales", poolType: "white-box" },
          { id: "L", type: "lane", label: "Rep", parentPool: "p", pool: "p" },
          { id: "t1", type: "task", label: "Receive", pool: "p", lane: "L" },
          { id: "t2", type: "task", label: "Process", pool: "p", lane: "L" },
        ],
        [{ sourceId: "t1", targetId: "t2" }],
      );
      const lane = out.elements.find((e) => e.id === "L")!;
      const laneEls = out.elements.filter((e) => e.parentId === "L");
      expect(laneEls.length, "lane should contain its tasks").toBeGreaterThan(0);
      const topMost = Math.min(...laneEls.map((e) => e.y));
      const bottomMost = Math.max(...laneEls.map((e) => e.y + e.height));
      const topClearance = topMost - lane.y;
      const bottomClearance = lane.y + lane.height - bottomMost;
      // Compact: some clearance each side, but STRICTLY under the old 2× floor
      // (the whole point of the change — lanes hug their content now).
      expect(topClearance, `top clearance ${topClearance}`).toBeGreaterThanOrEqual(0.2 * TASK_H);
      expect(topClearance, `top clearance ${topClearance} must be under the old 2× buffer`).toBeLessThan(2 * TASK_H);
      expect(bottomClearance, `bottom clearance ${bottomClearance}`).toBeGreaterThanOrEqual(0.2 * TASK_H);
      expect(bottomClearance, `bottom clearance ${bottomClearance} must be under the old 2× buffer`).toBeLessThan(2 * TASK_H);
    },
  },
  {
    id: "R8.04",
    title: "right-to-left loop-back flows route via top/bottom, never the left face",
    check: () => {
      const out = layout(
        [
          { id: "a", type: "task", label: "A" },
          { id: "b", type: "task", label: "B" },
          { id: "c", type: "task", label: "C" },
        ],
        [
          { sourceId: "a", targetId: "b" },
          { sourceId: "b", targetId: "c" },
          { sourceId: "c", targetId: "a", label: "rework" }, // backward edge
        ],
      );
      const back = out.connectors.find((c) => c.sourceId === "c" && c.targetId === "a")!;
      expect(["top", "bottom"], `source side was ${back.sourceSide}`).toContain(back.sourceSide);
      expect(["top", "bottom"], `target side was ${back.targetSide}`).toContain(back.targetSide);
    },
  },
  {
    id: "R8.11",
    title: "sequence connectors on the same element+face never share a connection point",
    check: () => {
      const out = layout(
        [
          { id: "a", type: "task", label: "A" },
          { id: "b", type: "task", label: "B" },
          { id: "c", type: "task", label: "C" },
        ],
        [
          { sourceId: "a", targetId: "c" },
          { sourceId: "b", targetId: "c" }, // two flows converge on C
        ],
      );
      const into = out.connectors.filter((c) => c.targetId === "c");
      // No two incoming flows may share the SAME (face, offset) attachment point.
      const points = into.map((c) => `${c.targetSide}:${(c.targetOffsetAlong ?? 0.5).toFixed(3)}`);
      expect(new Set(points).size, `shared attachment point(s): ${points.join(", ")}`).toBe(points.length);
    },
  },
  {
    id: "R3.06",
    title: "a flow to/from an Event attaches on the event's facing side",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "Start" },
          { id: "t", type: "task", label: "Work" },
          { id: "e", type: "end-event", label: "End" },
        ],
        [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }],
      );
      // Start sits left of the task it points to → its flow exits the RIGHT face;
      // the end sits right of the task → its flow enters the LEFT face.
      expect(out.connectors.find((c) => c.sourceId === "s")!.sourceSide).toBe("right");
      expect(out.connectors.find((c) => c.targetId === "e")!.targetSide).toBe("left");
    },
  },
  {
    id: "R6.16",
    title: "a decision gateway takes its incoming flow on the LEFT face",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "Start" },
          { id: "g", type: "gateway", label: "OK?" },
          { id: "a", type: "task", label: "A" },
          { id: "b", type: "task", label: "B" },
        ],
        [
          { sourceId: "s", targetId: "g" },
          { sourceId: "g", targetId: "a", label: "Yes" },
          { sourceId: "g", targetId: "b", label: "No" },
        ],
      );
      expect(out.connectors.find((c) => c.targetId === "g")!.targetSide).toBe("left");
    },
  },
  {
    id: "R3.10",
    title: "a decision gateway's branches fan out across distinct faces",
    check: () => {
      const out = layout(
        [
          { id: "g", type: "gateway", label: "Route?" },
          { id: "a", type: "task", label: "A" },
          { id: "b", type: "task", label: "B" },
          { id: "c", type: "task", label: "C" },
        ],
        [
          { sourceId: "g", targetId: "a" },
          { sourceId: "g", targetId: "b" },
          { sourceId: "g", targetId: "c" },
        ],
      );
      const sides = out.connectors.filter((c) => c.sourceId === "g").map((c) => c.sourceSide).sort();
      // Three branches must not pile onto one face.
      expect(new Set(sides).size, `branch sides: ${sides.join(", ")}`).toBe(3);
    },
  },
  {
    id: "R6.19",
    title: "a merge gateway emits its outgoing flow from the RIGHT face",
    check: () => {
      const out = layout(
        [
          { id: "a", type: "task", label: "A" },
          { id: "b", type: "task", label: "B" },
          { id: "m", type: "gateway", label: "" },
          { id: "e", type: "end-event", label: "End" },
        ],
        [
          { sourceId: "a", targetId: "m" },
          { sourceId: "b", targetId: "m" },
          { sourceId: "m", targetId: "e" },
        ],
      );
      expect(out.connectors.find((c) => c.sourceId === "m")!.sourceSide).toBe("right");
    },
  },
  {
    id: "R6.25",
    title: "a merge gateway is placed to the RIGHT of all its source elements",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "S" },
          { id: "split", type: "gateway", label: "" },
          { id: "a", type: "task", label: "A" },
          { id: "b", type: "task", label: "B" },
          { id: "m", type: "gateway", label: "" },
          { id: "e", type: "end-event", label: "End" },
        ],
        [
          { sourceId: "s", targetId: "split" },
          { sourceId: "split", targetId: "a" },
          { sourceId: "split", targetId: "b" },
          { sourceId: "a", targetId: "m" },
          { sourceId: "b", targetId: "m" },
          { sourceId: "m", targetId: "e" },
        ],
      );
      const m = out.elements.find((e) => e.id === "m")!;
      const a = out.elements.find((e) => e.id === "a")!;
      const b = out.elements.find((e) => e.id === "b")!;
      expect(m.x, "merge must be right of source A").toBeGreaterThan(a.x + a.width);
      expect(m.x, "merge must be right of source B").toBeGreaterThan(b.x + b.width);
    },
  },
  {
    id: "R8.10",
    title: "a boundary intermediate event emits from its OUTER face (away from the host)",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "S" },
          { id: "t", type: "task", label: "Do work" },
          { id: "be", type: "intermediate-event", label: "Timeout", eventType: "timer", boundaryHost: "t", boundarySide: "bottom" },
          { id: "h", type: "task", label: "Recover" },
          { id: "e", type: "end-event", label: "End" },
        ],
        [
          { sourceId: "s", targetId: "t" },
          { sourceId: "t", targetId: "e" },
          { sourceId: "be", targetId: "h" },
          { sourceId: "h", targetId: "e" },
        ],
      );
      // Mounted on the host's bottom edge → exits from the event's bottom (outer).
      const exit = out.connectors.find((c) => c.sourceId === "be")!;
      expect(exit.sourceSide, `boundary exit side was ${exit.sourceSide}`).toBe("bottom");
    },
  },
  {
    id: "R5.06",
    title: "two message flows on the same pool/task face don't share a connection point",
    check: () => {
      const out = layout(
        [
          { id: "p1", type: "pool", label: "Us", poolType: "white-box" },
          { id: "p2", type: "pool", label: "Them", poolType: "black-box" },
          { id: "s", type: "start-event", label: "S", pool: "p1" },
          { id: "t", type: "task", label: "Exchange", pool: "p1" },
          { id: "e", type: "end-event", label: "E", pool: "p1" },
        ],
        [
          { sourceId: "s", targetId: "t" },
          { sourceId: "t", targetId: "e" },
          { sourceId: "t", targetId: "p2", type: "message" },
          { sourceId: "p2", targetId: "t", type: "message" },
        ],
      );
      const msgsAtT = out.connectors.filter(
        (c) => c.type === "messageBPMN" && (c.sourceId === "t" || c.targetId === "t"),
      );
      const pts = msgsAtT.map((c) => {
        const atSource = c.sourceId === "t";
        return `${atSource ? c.sourceSide : c.targetSide}:${((atSource ? c.sourceOffsetAlong : c.targetOffsetAlong) ?? 0.5).toFixed(3)}`;
      });
      expect(pts.length, "expected two message flows at the task").toBe(2);
      expect(new Set(pts).size, `messages share a point: ${pts.join(", ")}`).toBe(pts.length);
    },
  },
  {
    id: "R5.08",
    title: "every generated pool is rendered at the same (uniform) width",
    check: () => {
      const out = layout(
        [
          { id: "p1", type: "pool", label: "Short", poolType: "white-box" },
          { id: "s1", type: "start-event", label: "S", pool: "p1" },
          { id: "t1", type: "task", label: "Go", pool: "p1" },
          { id: "e1", type: "end-event", label: "E", pool: "p1" },
          { id: "p2", type: "pool", label: "Long", poolType: "white-box" },
          { id: "s2", type: "start-event", label: "S", pool: "p2" },
          { id: "t2", type: "task", label: "A much longer task label here", pool: "p2" },
          { id: "u2", type: "task", label: "Another step", pool: "p2" },
          { id: "e2", type: "end-event", label: "E", pool: "p2" },
        ],
        [
          { sourceId: "s1", targetId: "t1" },
          { sourceId: "t1", targetId: "e1" },
          { sourceId: "s2", targetId: "t2" },
          { sourceId: "t2", targetId: "u2" },
          { sourceId: "u2", targetId: "e2" },
        ],
      );
      const pools = out.elements.filter((e) => e.type === "pool");
      expect(pools.length, "expected two pools").toBe(2);
      const widths = [...new Set(pools.map((p) => Math.round(p.width)))];
      expect(widths.length, `pool widths differ: ${pools.map((p) => Math.round(p.width)).join(", ")}`).toBe(1);
    },
  },
  {
    id: "R6.18",
    title: "event-based gateway branches enter the target event on its LEFT face",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "S" },
          { id: "g", type: "gateway", label: "", gatewayType: "event-based" },
          { id: "ev1", type: "intermediate-event", label: "Message", eventType: "message" },
          { id: "ev2", type: "intermediate-event", label: "Timeout", eventType: "timer" },
          { id: "t1", type: "task", label: "A" },
          { id: "t2", type: "task", label: "B" },
          { id: "e", type: "end-event", label: "E" },
        ],
        [
          { sourceId: "s", targetId: "g" },
          { sourceId: "g", targetId: "ev1" },
          { sourceId: "g", targetId: "ev2" },
          { sourceId: "ev1", targetId: "t1" },
          { sourceId: "ev2", targetId: "t2" },
          { sourceId: "t1", targetId: "e" },
          { sourceId: "t2", targetId: "e" },
        ],
      );
      const branches = out.connectors.filter((c) => c.sourceId === "g");
      expect(branches.length, "expected two event branches").toBe(2);
      for (const b of branches) {
        expect(b.targetSide, `branch into ${b.targetId} entered ${b.targetSide}`).toBe("left");
      }
    },
  },
  {
    id: "R6.17",
    title: "a decision gateway's top/bottom branches map to its top/bottom-most targets",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "S" },
          { id: "g", type: "gateway", label: "Route?" },
          { id: "a", type: "task", label: "A" },
          { id: "b", type: "task", label: "B" },
          { id: "c", type: "task", label: "C" },
          { id: "e", type: "end-event", label: "E" },
        ],
        [
          { sourceId: "s", targetId: "g" },
          { sourceId: "g", targetId: "a" },
          { sourceId: "g", targetId: "b" },
          { sourceId: "g", targetId: "c" },
          { sourceId: "a", targetId: "e" },
          { sourceId: "b", targetId: "e" },
          { sourceId: "c", targetId: "e" },
        ],
      );
      const branches = out.connectors.filter((c) => c.sourceId === "g");
      const cy = (id: string) => { const el = out.elements.find((e) => e.id === id)!; return el.y + el.height / 2; };
      const top = branches.reduce((m, c) => (cy(c.targetId) < cy(m.targetId) ? c : m));
      const bot = branches.reduce((m, c) => (cy(c.targetId) > cy(m.targetId) ? c : m));
      expect(top.sourceSide, "top-most branch should exit the gateway TOP").toBe("top");
      expect(bot.sourceSide, "bottom-most branch should exit the gateway BOTTOM").toBe("bottom");
    },
  },
  // R8.02 is compound (input → left, output → right). Two INDEPENDENT facets,
  // so they're split into sub-ids — each gets its own green/red (see README).
  {
    id: "R8.02-input",
    title: "an INPUT data object (data → element) is placed to the LEFT of its element",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "S" },
          { id: "t", type: "task", label: "Process" },
          { id: "e", type: "end-event", label: "E" },
          { id: "d", type: "data-object", label: "Form" },
        ],
        [
          { sourceId: "s", targetId: "t" },
          { sourceId: "t", targetId: "e" },
          { sourceId: "d", targetId: "t" }, // data → element ⇒ INPUT
        ],
      );
      const t = out.elements.find((e) => e.id === "t")!;
      const d = out.elements.find((e) => e.id === "d")!;
      expect(d.x + d.width, "input data object should sit left of its element").toBeLessThanOrEqual(t.x);
      expect(d.properties?.role, "input data object should be tagged role=input").toBe("input");
    },
  },
  {
    id: "R8.02-output",
    title: "an OUTPUT data object (element → data) is placed to the RIGHT of its element",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "S" },
          { id: "t", type: "task", label: "Process" },
          { id: "e", type: "end-event", label: "E" },
          { id: "d", type: "data-object", label: "Receipt" },
        ],
        [
          { sourceId: "s", targetId: "t" },
          { sourceId: "t", targetId: "e" },
          { sourceId: "t", targetId: "d" }, // element → data ⇒ OUTPUT
        ],
      );
      const t = out.elements.find((e) => e.id === "t")!;
      const d = out.elements.find((e) => e.id === "d")!;
      expect(d.x, "output data object should sit right of its element").toBeGreaterThanOrEqual(t.x + t.width);
      expect(d.properties?.role, "output data object should be tagged role=output").toBe("output");
    },
  },
  {
    id: "R8.03",
    title: "a single-link Data Store is centred above/below its element, not beside it",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "S" },
          { id: "t", type: "task", label: "Lookup" },
          { id: "e", type: "end-event", label: "E" },
          { id: "ds", type: "data-store", label: "Records" },
        ],
        [
          { sourceId: "s", targetId: "t" },
          { sourceId: "t", targetId: "e" },
          { sourceId: "t", targetId: "ds" },
        ],
      );
      const t = out.elements.find((e) => e.id === "t")!;
      const ds = out.elements.find((e) => e.id === "ds")!;
      const tcx = t.x + t.width / 2, dscx = ds.x + ds.width / 2;
      expect(Math.abs(dscx - tcx), "data store should be horizontally centred on its element").toBeLessThan(t.width);
      const above = ds.y + ds.height <= t.y;
      const below = ds.y >= t.y + t.height;
      expect(above || below, "data store should sit above or below the element").toBe(true);
    },
  },
];

describe("BPMN layout rules (code-enforced)", () => {
  it("registry is pinned — every rule has a unique id and an executable check", () => {
    const ids = BPMN_LAYOUT_RULES.map((r) => r.id);
    expect(new Set(ids).size, "duplicate rule id in registry").toBe(ids.length);
    for (const r of BPMN_LAYOUT_RULES) {
      expect(typeof r.check, `${r.id} has no executable check`).toBe("function");
      expect(r.title.trim().length, `${r.id} needs a title`).toBeGreaterThan(0);
    }
  });

  // One behavioural proof per registered rule.
  for (const r of BPMN_LAYOUT_RULES) {
    it(`${r.id} — ${r.title}`, () => r.check());
  }
});
