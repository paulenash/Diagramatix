/**
 * Every "On <branch>" in a Technical Description has a matching close.
 *
 * Paul, 2026-09-01, after regenerating a diagram from its own description:
 *
 *   "The text leads to confusion on regenerating the end of the diagram
 *    because the Decisions are not terminated unambiguously. I think On needs
 *    a better matching end."
 *
 * Two faults, one cause. The walk used a visited set to avoid repeating
 * itself, so the FIRST branch to reach a merge kept walking through it and
 * swallowed the whole shared tail — in his diagram the reply and the end event
 * appeared nested under "Medium", as though only that branch ever finished.
 * The remaining branches then just stopped, indistinguishable from a branch
 * that genuinely dead-ends.
 *
 * The structure under test is his "Gateway Lanes generation Test 1
 * (corrected)" shape: a decision whose branches rejoin, containing a nested
 * decision whose branches rejoin, and one sub-branch that ends outright.
 */
import { describe, it, expect } from "vitest";
import { buildBpmnPrompt } from "@/app/lib/diagram/prompt-from-diagram";
import type { DiagramElement, Connector } from "@/app/lib/diagram/types";

let n = 0;
const el = (id: string, type: string, label: string, parentId?: string): DiagramElement =>
  ({ id, type, label, x: 100 * ++n, y: 100, width: 120, height: 60, parentId } as unknown as DiagramElement);
const c = (sourceId: string, targetId: string, label?: string): Connector =>
  ({ id: `c${++n}`, sourceId, targetId, type: "sequence", label } as unknown as Connector);

const elements: DiagramElement[] = [
  el("p", "pool", "Company"),
  el("lnF", "lane", "Front Office", "p"),
  el("lnS", "lane", "Sales Team", "p"),
  el("s", "start-event", "Email Arrives", "lnF"),
  el("d1", "gateway", "Type?", "lnS"),
  el("t5", "task", "Task 5", "lnS"),
  el("d2", "gateway", "Complexity?", "lnS"),
  el("t6", "task", "Task 6", "lnS"),
  el("t11", "task", "Task 11", "lnS"),
  el("t13", "task", "Task 13", "lnS"),
  el("eHard", "end-event", "Complexes Are Too Hard End", "lnS"),
  el("m2", "gateway", "Complexity Merge", "lnS"),
  el("t2", "task", "Task 2", "lnF"),
  el("m1", "gateway", "Decision?", "lnS"),
  el("reply", "task", "Front Office Prepares Reply", "lnF"),
  el("eSend", "end-event", "Send & End", "lnF"),
];
const connectors: Connector[] = [
  c("s", "d1"),
  c("d1", "t5", "Sales Enquiry"), c("d1", "t2", "Simple Enquiry"),
  c("t5", "d2"),
  c("d2", "t6", "Medium"), c("d2", "t11", "Simple"), c("d2", "t13", "Complex"),
  c("t6", "m2"), c("t11", "m2"),
  c("t13", "eHard"),
  c("m2", "m1"), c("t2", "m1"),
  c("m1", "reply"), c("reply", "eSend"),
];

const text = buildBpmnPrompt(elements, connectors);
const lines = text.split("\n");
const branchesIn = (s: string) => [...s.matchAll(/- On \*\*(.+?)\*\*/g)].map((m) => m[1]);

describe("a Technical Description closes every branch it opens", () => {
  it("T3116 — every 'On <branch>' has a matching 'End of <branch>'", () => {
    const opened = branchesIn(text);
    expect(opened.sort()).toEqual(
      ["Complex", "Medium", "Sales Enquiry", "Simple", "Simple Enquiry"]);
    for (const b of opened) {
      expect(text, `"${b}" is opened but never closed`).toContain(`End of **${b}**`);
    }
  });

  it("T3117 — a branch that rejoins NAMES the gateway it rejoins at", () => {
    // "the Decisions are not terminated unambiguously" — a branch that stops
    // and a branch that rejoins used to render identically.
    expect(text).toContain(`End of **Medium** — rejoins the flow at gateway "Complexity Merge".`);
    expect(text).toContain(`End of **Simple** — rejoins the flow at gateway "Complexity Merge".`);
    expect(text).toContain(`End of **Sales Enquiry** — rejoins the flow at gateway "Decision?".`);
    expect(text).toContain(`End of **Simple Enquiry** — rejoins the flow at gateway "Decision?".`);
  });

  it("T3118 — a branch that truly ends says so, and claims no rejoin", () => {
    const i = lines.findIndex((l) => l.includes("End of **Complex**"));
    expect(i).toBeGreaterThan(-1);
    expect(lines[i]).not.toContain("rejoins");
    expect(lines[i - 1]).toContain("The process ends with **Complexes Are Too Hard End**.");
  });

  it("T3119 — the shared tail after a merge is NOT nested inside one branch", () => {
    // The defect Paul hit: "Front Office Prepares Reply" and "Send & End" sat
    // under "Medium", so a regeneration reproduced the ending on that path
    // alone. They belong to the flow after the merge, at the outer level.
    const tail = lines.findIndex((l) => l.includes("Front Office Prepares Reply"));
    expect(tail).toBeGreaterThan(-1);
    const indent = lines[tail].match(/^\s*/)![0].length;
    const decision = lines.findIndex((l) => l.includes(`Decision (gateway "Type?")`));
    const decisionIndent = lines[decision].match(/^\s*/)![0].length;
    expect(indent, `the tail is indented under a branch: "${lines[tail]}"`).toBeLessThanOrEqual(decisionIndent);
    // And it is stated exactly once — not repeated per branch.
    expect(lines.filter((l) => l.includes("Front Office Prepares Reply")).length).toBe(1);
  });

  it("T3120 — the tail is announced as following the merge", () => {
    expect(text).toContain(`After gateway "Decision?", the flow continues:`);
    // A merge leading straight into another merge must not leave a dangling
    // header with nothing beneath it.
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(", the flow continues:")) continue;
      const next = lines.slice(i + 1).find((l) => l.trim().length > 0);
      expect(next, `"${lines[i]}" has nothing under it`).toBeDefined();
      expect(next!.includes("End of **"), `"${lines[i]}" is followed only by a branch close`).toBe(false);
    }
  });
});

describe("an edge-mounted event's exception path is described", () => {
  // Paul, 2026-09-02: "Technical Description does not pick up and include EMIEs
  // and associated sub-path flows." Nothing FLOWS INTO a boundary event, so the
  // sequence walk never reached one and the exception path was simply absent —
  // the most consequential kind of silence, because a diagram regenerated from
  // the text comes back looking complete.
  const els2: DiagramElement[] = [
    ...elements,
    el("ev", "intermediate-event", "Visit overdue", "lnS"),
    el("x1", "task", "Chase the customer", "lnS"),
    el("xEnd", "end-event", "Abandoned", "lnS"),
  ];
  const host = els2.find((e) => e.id === "t5")!;
  (els2.find((e) => e.id === "ev") as unknown as Record<string, unknown>).boundaryHostId = host.id;
  (els2.find((e) => e.id === "ev") as unknown as Record<string, unknown>).eventType = "timer";
  const conns2: Connector[] = [...connectors, c("ev", "x1"), c("x1", "xEnd")];
  const text2 = buildBpmnPrompt(els2, conns2);

  it("T3137 — the event is named, with its host, type and whether it interrupts", () => {
    expect(text2).toMatch(/Edge-mounted interrupting timer event \*\*Visit overdue\*\* on \*\*Task 5\*\*/);
  });

  it("T3138 — the steps it leads to are listed, and the path is closed", () => {
    expect(text2).toContain("Chase the customer");
    expect(text2).toContain("The process ends with **Abandoned**.");
    expect(text2).toContain("End of the **Visit overdue** path.");
  });

  it("T3139 — the exception is nested under its host, not spliced into the main flow", () => {
    const lines2 = text2.split("\n");
    const hostLine = lines2.findIndex((l) => /- Task 5$/.test(l));
    const evLine = lines2.findIndex((l) => l.includes("Edge-mounted"));
    expect(evLine).toBeGreaterThan(hostLine);
    const indent = (i: number) => lines2[i].match(/^\s*/)![0].length;
    expect(indent(evLine), "the exception should sit under its host").toBeGreaterThan(indent(hostLine));
  });

  it("T3140 — a COLLAPSED subprocess does not promise steps it has none of", () => {
    // "see steps below" followed by nothing reads as truncation, and tells a
    // regeneration to expect detail that was never recorded.
    // Its own minimal flow: adding a second outgoing to a task in the shared
    // fixture would make that task a fork, and the walk would never arrive.
    const els3: DiagramElement[] = [
      el("p3", "pool", "Co"), el("ln3", "lane", "Ops", "p3"),
      el("s3", "start-event", "Begin", "ln3"),
      el("sp", "subprocess", "Check the file", "ln3"),
      el("e3", "end-event", "Done", "ln3"),
    ];
    const conns3: Connector[] = [c("s3", "sp"), c("sp", "e3")];
    const t3 = buildBpmnPrompt(els3, conns3);
    expect(t3).toContain("**Check the file** (collapsed subprocess — no inner detail recorded)");
    expect(t3).not.toContain("**Check the file** (subprocess — see steps below)");
  });
});
