/**
 * T5284 — Paul's 2026-10-08 batch from the Application Process capture ("Application Process Generation using the new skill 2"):
 *   1/2  "Silent failure": an edge-mounted event never leads straight to an End Event (a Task between them) and the End Event that finishes
 *        an exception path is a Terminate End Event — scan rules B56 / B57 and Red Rules R8.47 / R8.48 (generation enforces them);
 *   3    edge events on one horizontal edge keep room for the neighbour's label and connector (R8.50);
 *   4    the Terminate trigger's black circle is 15 % smaller;
 *   5    the Plan-ready pop-up has "View AI Response";
 *   6    message flows may be routed through elements and labels without a scanner warning;
 *   7    a sequence flow through a Data Object's label is a warning, not an error;
 *   8    gateway middle vertices only when THREE connectors leave a decision / enter a merge (R8.49);
 *   9    a data association can no longer be drawn to a Pool.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { layoutBpmnDiagram, type AiConnection, type AiElement } from "@/app/lib/diagram/bpmnLayout";
import { enforceSilentFailureRules } from "@/app/lib/diagram/silentFailure";
import { exceptionPath } from "@/app/lib/diagram/exceptionPaths";
import { checkDiagram, RULES } from "@/app/lib/diagram/checks/diagramChecks";
import { canConnect } from "@/app/lib/diagram/canConnect";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: {}, ...extra }) as DiagramElement;
const cn = (id: string, s: string, t: string, type = "sequence"): Connector =>
  ({ id, type, sourceId: s, targetId: t, sourceSide: "right", targetSide: "left", directionType: "directed", routingType: "rectilinear", waypoints: [] }) as Connector;

const plan = JSON.parse(readFileSync("tests/fixtures/application-process-two-timers.plan.json", "utf8")).plan as { elements: AiElement[]; connections: AiConnection[] };

describe("T5284 1/2 — silent failure (R8.47 / R8.48, B56 / B57)", () => {
  const ai: AiElement[] = [
    { id: "t", type: "task", label: "Wait" }, { id: "ev", type: "intermediate-event", label: "Too late", boundaryHost: "t", eventType: "timer" },
    { id: "end", type: "end-event", label: "Lapsed" }, { id: "ok", type: "end-event", label: "Done" },
  ];
  const cs: AiConnection[] = [{ sourceId: "t", targetId: "ok" }, { sourceId: "ev", targetId: "end", label: "No reply" }];

  it("exceptionPath stops where the main line also feeds a step", () => {
    const edges = [{ from: "ev", to: "a" }, { from: "a", to: "m" }, { from: "main", to: "m" }, { from: "m", to: "x" }];
    expect([...exceptionPath("ev", edges)].sort()).toEqual(["a"]);
    expect([...exceptionPath("ev", [{ from: "ev", to: "a" }, { from: "a", to: "b" }, { from: "b", to: "e" }])].sort()).toEqual(["a", "b", "e"]);
  });
  it("generation puts a User task between the event and the End, and makes the End a Terminate End", () => {
    const r = enforceSilentFailureRules(ai, cs);
    expect(r.addedTasks).toHaveLength(1);
    const task = r.elements.find((e) => e.id === r.addedTasks[0].taskId)!;
    expect(task).toMatchObject({ type: "task", taskType: "user", label: "Handle: Too late" });
    expect(r.connections.find((c) => c.sourceId === "ev")).toMatchObject({ targetId: task.id, label: "No reply" });
    expect(r.connections.some((c) => c.sourceId === task.id && c.targetId === "end")).toBe(true);
    expect(r.elements.find((e) => e.id === "end")!.eventType).toBe("terminate");
    expect(r.elements.find((e) => e.id === "ok")!.eventType).toBeUndefined();         // the main flow's own End is untouched
  });
  it("it is idempotent, and an event that already leads to a task only gets the Terminate end", () => {
    const once = enforceSilentFailureRules(ai, cs);
    const twice = enforceSilentFailureRules(once.elements, once.connections);
    expect(twice.addedTasks).toEqual([]);
    expect(twice.terminated).toEqual([]);
    expect(twice.elements).toHaveLength(once.elements.length);
  });
  it("an End Event the main line also reaches is not turned into Terminate", () => {
    const r = enforceSilentFailureRules(ai, [{ sourceId: "t", targetId: "end" }, { sourceId: "ev", targetId: "end" }]);
    expect(r.elements.find((e) => e.id === "end")!.eventType).toBeUndefined();
  });
  it("the layout applies both and says so", () => {
    const kinds: string[] = [];
    const g = layoutBpmnDiagram(plan.elements, plan.connections, { onDiagnostic: (d) => kinds.push(d.kind) });
    expect(kinds).toContain("silent-failure-task-added");
    expect(kinds).toContain("exception-end-terminated");
    expect(g.elements.find((e) => e.id === "endLapsed")!.eventType).toBe("terminate");
    const found = checkDiagram(g as never).map((v) => v.rule);
    expect(found).not.toContain("emie-direct-to-end");
    expect(found).not.toContain("exception-end-terminate");
  });
  it("B56 / B57 report what a person drew, and not a clean diagram", () => {
    const bad = {
      elements: [el("t", "task", 0, 0, 100, 60), el("ev", "intermediate-event", 50, 50, 36, 36, { boundaryHostId: "t", eventType: "timer" }),
        el("end", "end-event", 200, 100, 36, 36, { eventType: "none" })],
      connectors: [cn("c", "ev", "end")],
    };
    const rules = checkDiagram(bad as never).map((v) => v.rule);
    expect(rules).toContain("emie-direct-to-end");
    expect(rules).toContain("exception-end-terminate");
    const good = {
      elements: [bad.elements[0], bad.elements[1], el("h", "task", 120, 100, 100, 60), el("end", "end-event", 260, 100, 36, 36, { eventType: "terminate" })],
      connectors: [cn("c1", "ev", "h"), cn("c2", "h", "end")],
    };
    const goodRules = checkDiagram(good as never).map((v) => v.rule);
    expect(goodRules).not.toContain("emie-direct-to-end");
    expect(goodRules).not.toContain("exception-end-terminate");
    expect(RULES.find((r) => r.code === "B56")!.severity).toBe("warning");
    expect(RULES.find((r) => r.code === "B57")!.severity).toBe("warning");
  });
});

describe("T5284 3 — edge events on one horizontal edge keep their distance (R8.50)", () => {
  it("the two timers on the subprocess are at least 36 + 80 px apart, centre to centre", () => {
    const g = layoutBpmnDiagram(plan.elements, plan.connections);
    const a = g.elements.find((e) => e.id === "bTimerReply")!, b = g.elements.find((e) => e.id === "bTimerLapse")!;
    expect(a.boundaryHostId).toBe(b.boundaryHostId);
    expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(36 + 80 - 0.5);
  });
});

describe("T5284 4 — the Terminate circle is 15 % smaller", () => {
  it("r = 0.9945 × s (was 1.17 × s)", () => {
    const src = readFileSync("app/components/canvas/SymbolRenderer.tsx", "utf8");
    expect(src).toContain("r={s * 0.9945}");
    expect(src).not.toContain("r={s * 1.17}");
    expect(0.9945 / 1.17).toBeCloseTo(0.85, 3);
  });
});

describe("T5284 5 — the Plan-ready pop-up offers View AI Response", () => {
  it("the dialog shows the button only when a handler is given, and both consoles open their JSON view", () => {
    const dlg = readFileSync("app/components/ai/PlanSummaryDialog.tsx", "utf8");
    expect(dlg).toContain("onViewResponse && (");
    expect(dlg).toContain("View AI Response");
    expect(readFileSync("app/(dashboard)/diagram/[id]/ai-generate/AiGenerateScreen.tsx", "utf8")).toContain("onViewResponse={() => { setPlanSummary(null); setStructOpen(true); }}");
    expect(readFileSync("app/(dashboard)/diagram/[id]/PlanPanel.tsx", "utf8")).toContain('onViewResponse={() => { setPlanSummary(null); setActiveTab("json"); setTabsExpanded(true); }}');
  });
});

describe("T5284 6/7 — scanner: message flows cross labels freely; a sequence flow through a data label is a warning", () => {
  // A data object whose name box (below it) is crossed by a connector from "a" to "b".
  const base = () => [el("do", "data-object", 100, 100, 36, 46), el("a", "task", 0, 200, 80, 50), el("b", "task", 300, 200, 80, 50)];
  const crossing = (type: string) => ({
    elements: base(),
    connectors: [{ ...cn("c", "a", "b", type), waypoints: [{ x: 80, y: 160 }, { x: 300, y: 160 }] }],
  });
  it("a SEQUENCE flow over the label: data-label-overlap, severity warning", () => {
    const v = checkDiagram(crossing("sequence") as never).filter((x) => x.rule === "data-label-overlap");
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => x.severity === "warning")).toBe(true);
  });
  it("a MESSAGE flow over the label raises nothing", () => {
    expect(checkDiagram(crossing("messageBPMN") as never).filter((x) => x.rule === "data-label-overlap")).toEqual([]);
  });
  it("a MESSAGE flow across an event's label raises nothing", () => {
    const d = {
      elements: [el("ev", "intermediate-event", 100, 100, 36, 36, { eventType: "timer" }), el("a", "task", 0, 300, 80, 50), el("b", "task", 300, 300, 80, 50)],
      connectors: [{ ...cn("m", "a", "b", "messageBPMN"), waypoints: [{ x: 118, y: 90 }, { x: 118, y: 160 }, { x: 300, y: 160 }] }],
    };
    expect(checkDiagram(d as never).filter((x) => x.rule === "event-label-overlap")).toEqual([]);
  });
});

describe("T5284 8 — gateway middle vertices only with THREE connectors (R8.49)", () => {
  const g = layoutBpmnDiagram(plan.elements, plan.connections);
  const out = (id: string) => g.connectors.filter((c) => c.type === "sequence" && c.sourceId === id);
  const into = (id: string) => g.connectors.filter((c) => c.type === "sequence" && c.targetId === id);
  it("a two-way decision leaves by top and bottom", () => {
    expect(out("gwComplete").map((c) => c.sourceSide).sort()).toEqual(["bottom", "top"]);
  });
  it("a two-way merge is entered by top and bottom", () => {
    expect(into("gwCompleteMerge").map((c) => c.targetSide).sort()).toEqual(["bottom", "top"]);
  });
  it("its single exit still leaves by the right vertex", () => {
    expect(out("gwCompleteMerge").map((c) => c.sourceSide)).toEqual(["right"]);
  });
  it("no two-way gateway anywhere in the capture uses a middle vertex for its branches", () => {
    for (const gw of g.elements.filter((e) => e.type === "gateway")) {
      const o = out(gw.id), i = into(gw.id);
      if (o.length === 2) expect(o.map((c) => c.sourceSide), gw.label).not.toContain("right");
      if (i.length === 2 && o.length === 1) expect(i.map((c) => c.targetSide), gw.label).not.toContain("left");
    }
  });
});

describe("T5284 9 — a data association can no longer be drawn to a Pool", () => {
  const data = el("do", "data-object", 0, 0, 36, 46), pool = el("p", "pool", 0, 0, 800, 300, { properties: { poolType: "white-box" } }), task = el("t", "task", 100, 100, 100, 60);
  const all = [data, pool, task];
  it("canConnect refuses data ⇄ pool / lane in either direction, and still allows data ⇄ task", () => {
    expect(canConnect(data, pool, "associationBPMN", all)).toBe(false);
    expect(canConnect(pool, data, "associationBPMN", all)).toBe(false);
    expect(canConnect(data, el("l", "lane", 0, 0, 700, 100), "associationBPMN", all)).toBe(false);
    expect(canConnect(data, task, "associationBPMN", all)).toBe(true);
  });
});

describe("T5284 — the rules are written down", () => {
  it("R8.47–R8.50 are in the seed, after R8.46, and the idempotent patch says the same", () => {
    const seed = readFileSync("scripts/seed-diagram-rules.cjs", "utf8");
    const sql = readFileSync("scripts/sql/patch-rules-r8-47-to-r8-50-silent-failure-and-vertices.sql", "utf8");
    const at = seed.indexOf("R8.47:");
    expect(at).toBeGreaterThan(seed.indexOf("R8.46:"));
    const text = JSON.parse(`"${seed.slice(at, seed.indexOf('"', at))}"`) as string;
    for (const line of text.split("\n")) expect(sql).toContain(line.trim());
    for (const n of [47, 48, 49, 50]) expect(sql).toContain(`AND rules NOT LIKE '%R8.${n}:%'`);
    expect(sql).toContain("LIKE 'Group 8: Auto-Layout Placement%'");
    expect(sql).not.toContain("DELETE FROM");
  });
});
