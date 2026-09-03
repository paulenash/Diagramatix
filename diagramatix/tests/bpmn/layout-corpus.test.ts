/**
 * The layout regression corpus — a ratchet on generated readability.
 *
 * Paul, 2026-09-03: one-pass generation has to produce a PDF a third party can
 * read, with nobody to tidy it. So "how readable is a generated diagram" needs
 * to be a number that cannot silently get worse.
 *
 * The fixtures are real AI plans, one BPMN process per chain, captured from the
 * CURRENT repository prompts by scripts/build-layout-corpus.ts. The plan is the
 * expensive half; replaying it exercises the whole layout for free, and — the
 * point Paul made about scanning whatever was in Downloads — a fixed corpus
 * means a number that moved says something about the CHANGE rather than about
 * which files happened to be in the set.
 *
 * The budget below is a high-water mark, not an approval. Lower it whenever a
 * fix lands; never raise it to make a change fit.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { findLayoutViolations, findReadabilityViolations } from "@/app/lib/diagram/checks/layoutViolations";
import { pruneRedundantBpmnConnectors } from "@/app/lib/ai/planBpmn";
import type { DiagramData } from "@/app/lib/diagram/types";

const DIR = path.join(process.cwd(), "tests", "fixtures", "layout-corpus");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".plan.json")) : [];

/**
 * Measured 2026-09-03. Ratchet DOWN only, never up to make a change fit.
 *
 *   107  the honest starting point, once Paul narrowed the branch-label class
 *        to what actually reads badly (72 measured + 35 that class was hiding)
 *    36  after R5.12: a connector label is moved off an element body, and a
 *        BRANCH label off the horizontal run it names
 *    17  after R5.12 also treats a label ON another label as a defect in its
 *        own right, not merely something to avoid when moving for another reason
 */
const BUDGET = 17;

describe("layout corpus — generated diagrams stay readable", () => {
  it("T3152 — the corpus is present and every plan still lays out", () => {
    expect(files.length, "no corpus — run scripts/build-layout-corpus.ts --all").toBeGreaterThanOrEqual(20);
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
      expect(plan?.elements?.length, `${f} has no plan`).toBeGreaterThan(0);
      expect(() => layoutBpmnDiagram(plan.elements, plan.connections), `${f} threw`).not.toThrow();
    }
  });

  it("T3153 — total readability violations do not exceed the budget", () => {
    let total = 0;
    const worst: string[] = [];
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
      const r = layoutBpmnDiagram(plan.elements, plan.connections);
      const data = { elements: r.elements, connectors: r.connectors } as DiagramData;
      const vs = [...findLayoutViolations(data), ...findReadabilityViolations(data)];
      total += vs.length;
      if (vs.length) worst.push(`${f}: ${vs.length}`);
    }
    expect(total,
      `readability regressed — was ${BUDGET}, now ${total}. Worst: ${worst.slice(0, 6).join(", ")}. `
      + `Lower BUDGET when you fix some; never raise it.`).toBeLessThanOrEqual(BUDGET);
  });
});

describe("a plan with no sequence flow is reported, not passed", () => {
  /**
   * Paul, 2026-09-03, from a prod run: "V01.01 Receive Order ✓ 12el / 0conn" —
   * a tick against a diagram whose activities are joined by nothing. The batch
   * tool shows ✓ for anything the layout did not throw on, so a plan that
   * describes no process at all sails through. On the unattended path nobody
   * looks at it afterwards.
   */
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Co", poolType: "white-box" },
    { id: "s", type: "start-event", label: "Order received", pool: "p" },
    { id: "t1", type: "task", label: "Capture order", pool: "p" },
    { id: "t2", type: "task", label: "Acknowledge order", pool: "p" },
    { id: "e", type: "end-event", label: "Order captured", pool: "p" },
  ];

  it("T3154 — flow elements with no sequence flow raise a diagnostic", () => {
    const seen: string[] = [];
    layoutBpmnDiagram(els, [], { onDiagnostic: (d) => seen.push(d.kind) });
    expect(seen, "a process with nothing joining it must not pass silently")
      .toContain("no-sequence-flow");
  });

  it("T3155 — a properly connected plan raises nothing (the negative control)", () => {
    const conns: AiConnection[] = [
      { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" }, { sourceId: "t2", targetId: "e" },
    ];
    const seen: string[] = [];
    layoutBpmnDiagram(els, conns, { onDiagnostic: (d) => seen.push(d.kind) });
    expect(seen).not.toContain("no-sequence-flow");
  });

  it("T3156 — message flows alone do not count as a process", () => {
    // A plan can carry message flows to a black-box pool and still describe no
    // sequence at all; counting any connection would miss exactly that case.
    const withPool: AiElement[] = [...els, { id: "sys", type: "pool", label: "ERP", poolType: "black-box", isSystem: true }];
    const msgOnly: AiConnection[] = [{ sourceId: "t1", targetId: "sys", type: "message", label: "order" }];
    const seen: string[] = [];
    layoutBpmnDiagram(withPool, msgOnly, { onDiagnostic: (d) => seen.push(d.kind) });
    expect(seen).toContain("no-sequence-flow");
  });
});

describe("a decision that decides nothing never reaches the diagram", () => {
  /**
   * Paul, 2026-09-03, "Decisions, Decisions!!": two gateways in a row inside a
   * loop subprocess, in V02.02, V02.03 and V02.04 alike — "It seems a
   * systematic error?"
   *
   * The shape is always the same: a decision with ONE outgoing branch running
   * straight into its own merge. Neither gateway decides or joins anything. It
   * comes of the model half-following two rules at once — every diverging
   * gateway needs a named merge, but a loop condition must never be tested with
   * a gateway — so it emits the pair and omits the branch that would have been
   * the loop-back.
   *
   * pruneRedundantBpmnConnectors has collapsed 1-in/1-out gateways since
   * 2026-08-19 and does so correctly here, which is what makes the prod
   * diagrams so odd. These pin the behaviour so a regression in the pruner
   * cannot pass unnoticed while that is chased.
   */
  const loopPlan = () => ({
    elements: [
      { id: "p", type: "pool", label: "Co", poolType: "white-box" },
      { id: "s", type: "start-event", label: "Requisition raised", pool: "p" },
      { id: "ep", type: "subprocess-expanded", label: "Repeat Until Details Complete", pool: "p", repeatType: "loop" },
      { id: "eps", type: "start-event", label: "", parentSubprocess: "ep" },
      { id: "t1", type: "task", label: "Correct Requisition Details", parentSubprocess: "ep" },
      { id: "gwd", type: "gateway", label: "Details Now Complete?", gatewayType: "exclusive", parentSubprocess: "ep" },
      { id: "gwm", type: "gateway", label: "Details Checked", parentSubprocess: "ep" },
      { id: "epe", type: "end-event", label: "", parentSubprocess: "ep" },
      { id: "e", type: "end-event", label: "Requisition complete", pool: "p" },
    ],
    connections: [
      { sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "e" },
      { sourceId: "eps", targetId: "t1" },
      { sourceId: "t1", targetId: "gwd" },
      { sourceId: "gwd", targetId: "gwm", label: "Yes" },   // the ONLY branch
      { sourceId: "gwm", targetId: "epe" },
    ],
  });

  it("T3157 — a decision with one branch and its merge are both collapsed", () => {
    const plan = loopPlan();
    pruneRedundantBpmnConnectors(plan as never);
    const gws = plan.elements.filter((e) => e.type === "gateway").map((e) => e.label);
    expect(gws, `both are no-ops, yet ${gws.join(" and ")} survived`).toEqual([]);
    // …and the flow is rejoined, not severed: the task now reaches the end.
    expect(plan.connections.some((c) => c.sourceId === "t1" && c.targetId === "epe")).toBe(true);
  });

  it("T3158 — a REAL decision is left alone (the negative control)", () => {
    const plan = loopPlan();
    // The second branch must lead somewhere ELSE. Pointing it at the same end
    // event makes the gateway a genuine no-op — both branches going to one
    // place is not a decision — and the pruner is right to collapse it. That
    // caught this fixture first time round.
    plan.elements.push({ id: "t2", type: "task", label: "Escalate to buyer", parentSubprocess: "ep" } as never);
    plan.connections.push({ sourceId: "gwd", targetId: "t2", label: "No" } as never);
    plan.connections.push({ sourceId: "t2", targetId: "epe" } as never);
    pruneRedundantBpmnConnectors(plan as never);
    const gws = plan.elements.filter((e) => e.type === "gateway").map((e) => e.label);
    expect(gws, "a two-branch decision must survive").toContain("Details Now Complete?");
  });

  it("T3159 — the guard holds at the point of generation, not only in the parser", () => {
    // The prune is re-asserted immediately before layout, so an unpruned plan
    // from any source still produces a clean diagram.
    const plan = loopPlan();
    pruneRedundantBpmnConnectors(plan as never);
    const out = layoutBpmnDiagram(plan.elements as never, plan.connections as never);
    const noop = out.elements.filter((el) => {
      if (el.type !== "gateway") return false;
      const ins = out.connectors.filter((c) => c.targetId === el.id && c.type !== "messageBPMN");
      const outs = out.connectors.filter((c) => c.sourceId === el.id && c.type !== "messageBPMN");
      return ins.length === 1 && outs.length === 1;
    });
    expect(noop.map((g) => g.label)).toEqual([]);
  });
});

describe("every connector still reaches both of its endpoints", () => {
  /**
   * The class that has now bitten twice, both times the same way: a pass that
   * moves an element AFTER the waypoints are computed, without re-routing what
   * it moved. R8.30 detached 18 of 38 connectors in V23.04 on 2026-08-31, and
   * R8.36 — added on 2026-09-03 — left "Escalation Summary" floating in V22.05
   * with its two associations pointing at where it used to be.
   *
   * The layout's own diagnostics cannot see this: the connectors exist, the
   * plan is intact, and only the geometry disagrees. So it is measured across
   * the whole corpus, where a pass that forgets to re-route shows up at once.
   */
  const near = (p: { x: number; y: number }, e: { x: number; y: number; width: number; height: number }) =>
    p.x >= e.x - 6 && p.x <= e.x + e.width + 6 && p.y >= e.y - 6 && p.y <= e.y + e.height + 6;

  it("T3162 — no connector in the corpus is left pointing at empty space", () => {
    const detached: string[] = [];
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
      const r = layoutBpmnDiagram(plan.elements, plan.connections);
      const byId = new Map(r.elements.map((e) => [e.id, e]));
      for (const c of r.connectors) {
        const w = c.waypoints ?? [];
        if (w.length < 2) continue;
        const s = byId.get(c.sourceId), t = byId.get(c.targetId);
        if (!s || !t) continue;
        if (!near(w[0], s) || !near(w[w.length - 1], t)) {
          detached.push(`${f}: ${c.type} ${String(s.label ?? s.id).slice(0, 24)} → ${String(t.label ?? t.id).slice(0, 24)}`);
        }
      }
    }
    expect(detached.slice(0, 8),
      "a pass moved an element after routing and did not re-route it").toEqual([]);
  });
});

describe("two plan shapes no layout can rescue", () => {
  /**
   * Paul, 2026-09-03 on V22.07 (generated by kimi-k3 while Anthropic was
   * overloaded): a message "in the middle of nowhere … A missing Black-box
   * Pool???", and an intermediate event that "should be an EMIE on Task
   * 'Escalate to delegated approver' probably?".
   *
   * Both are the model describing something real in a way BPMN does not allow.
   * The drawing is then faithful to nonsense, and on an unattended run nobody
   * is there to notice. They fire on 3 of the 26 corpus diagrams too, so this
   * is a live class rather than one bad generation.
   */
  const base = (): { elements: AiElement[]; connections: AiConnection[] } => ({
    elements: [
      { id: "p", type: "pool", label: "Insurer", poolType: "white-box",
        lanes: [{ id: "l1", name: "Assessment" }, { id: "l2", name: "Management" }] },
      { id: "s", type: "start-event", label: "Claim received", pool: "p", lane: "l1" },
      { id: "t1", type: "task", label: "Escalate to delegated approver", pool: "p", lane: "l1" },
      { id: "t2", type: "task", label: "Chase delegated approver", pool: "p", lane: "l2" },
      { id: "e", type: "end-event", label: "Decided", pool: "p", lane: "l2" },
    ],
    connections: [
      { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" }, { sourceId: "t2", targetId: "e" },
    ],
  });
  const kinds = (p: { elements: AiElement[]; connections: AiConnection[] }) => {
    const seen: string[] = [];
    layoutBpmnDiagram(p.elements, p.connections, { onDiagnostic: (d) => seen.push(d.kind) });
    return seen;
  };

  it("T3168 — an event nothing leads to, with flow leaving it, is reported", () => {
    const p = base();
    p.elements.push({ id: "ie", type: "intermediate-event", label: "Escalation response overdue", eventType: "timer", pool: "p", lane: "l1" });
    p.connections.push({ sourceId: "ie", targetId: "t2" });
    expect(kinds(p)).toContain("unreachable-event");
  });

  it("T3169 — a reachable event, and a properly mounted one, are NOT reported", () => {
    const withIn = base();
    withIn.elements.push({ id: "ie", type: "intermediate-event", label: "Response received", eventType: "message", pool: "p", lane: "l1" });
    withIn.connections.push({ sourceId: "t1", targetId: "ie" }, { sourceId: "ie", targetId: "t2" });
    expect(kinds(withIn)).not.toContain("unreachable-event");

    const mounted = base();
    mounted.elements.push({ id: "ev", type: "intermediate-event", label: "Overdue", eventType: "timer", boundaryHost: "t1", boundarySide: "bottom" });
    mounted.connections.push({ sourceId: "ev", targetId: "t2" });
    expect(kinds(mounted), "a boundary event legitimately has no inbound flow").not.toContain("unreachable-event");
  });

  it("T3170 — a message flow with both ends in one pool is reported", () => {
    // Between two LANES of the same pool it should be a sequence flow; the
    // participant the model had in mind was never declared.
    const p = base();
    p.connections.push({ sourceId: "t1", targetId: "t2", type: "message", label: "Escalation package" });
    expect(kinds(p)).toContain("message-within-pool");
  });

  it("T3171 — a message flow that genuinely crosses to another pool is fine", () => {
    const p = base();
    p.elements.push({ id: "sys", type: "pool", label: "Claims Platform", poolType: "black-box", isSystem: true });
    p.connections.push({ sourceId: "t1", targetId: "sys", type: "message", label: "Record decision" });
    expect(kinds(p)).not.toContain("message-within-pool");
  });
});
