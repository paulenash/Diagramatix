/**
 * T5238 — NL Assist follows the one endpoint rule (slice 4 of new features/connector-endpoints-plan-2026-10-03.md).
 *
 * Every voice command that draws or re-attaches a connector goes through the reducer, which spreads what the command
 * touched (spreadPass.ts) — so these tests drive the real commands and ask the one question: does any Activity or Event
 * end up with two connectors on one point? The old 20 px message spread inside `addMessage` is gone; the rule is the
 * rule's, in one place. Gateway-point refusals ("the X already has one") are Paul's ruling and are NOT touched.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { findLayoutViolations } from "@/app/lib/diagram/checks/layoutViolations";
import { SPREAD } from "@/app/lib/diagram/endpointSpread";
import { EMPTY_DIAGRAM, type Connector, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, label = id, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box" } : {}, ...extra }) as DiagramElement;
const TASK = (id: string, x: number, y: number, label = id) => el(id, "task", x, y, 102, 65, label);
const world = (elements: DiagramElement[], connectors: Connector[] = []): DiagramData => ({ ...EMPTY_DIAGRAM, elements, connectors } as DiagramData);

/** `shared attachment point …` on anything that is not a gateway (gateways are out of scope). */
function sharedPoints(d: DiagramData): string[] {
  const typeOf = new Map(d.elements.map((e) => [e.id, e.type] as const));
  return findLayoutViolations(d).filter((v) => v.startsWith("shared attachment point") && typeOf.get(v.slice("shared attachment point ".length).split("|")[0]) !== "gateway");
}
const run = (h: ReturnType<typeof headlessDiagram>, sentence: string, selected: string[] = []) => {
  const ops = parseCommand(sentence);
  expect(ops, sentence).toBeTruthy();
  const r = applyAssistOps(ops!, h.context({ selectedIds: selected }));
  expect(r.ok, `${sentence} → ${r.summary}`).toBe(true);
  return r;
};
const pools = () => [el("P", "pool", 0, 0, 1200, 300, "Us"), el("C", "pool", 0, 500, 1200, 100, "Customer", { properties: { poolType: "black-box" } })];

describe("T5238 messages by voice", () => {
  it("the old 20 px spread is gone from addMessage (one rule, one place)", () => {
    const src = readFileSync("app/lib/assist/applyAssistOps.ts", "utf8");
    expect(src).not.toContain("const MIN_GAP = 20;");
    expect(src).toContain("is the one endpoint rule's business");
  });

  it("three messages from one Task: 24 px apart, the first stays at the centre, nothing shares a point", () => {
    const h = headlessDiagram(world([...pools(), TASK("t", 300, 100, "Take order")]));
    for (let i = 0; i < 3; i++) run(h, "add a message from Take order to Customer");
    const xs = h.data.connectors.map((c) => c.waypoints[1].x).sort((a, b) => a - b);
    expect(xs).toHaveLength(3);
    const gaps = xs.slice(1).map((v, i) => v - xs[i]);
    expect(Math.min(...gaps), JSON.stringify(gaps)).toBeGreaterThanOrEqual(SPREAD.messageActivity - 0.5);
    expect(xs).toContain(351);                                                   // the first message kept the middle (300 + 102/2)
    expect(sharedPoints(h.data)).toEqual([]);
    for (const c of h.data.connectors) expect(c.waypoints[1].x).toBeCloseTo(c.waypoints[2].x, 3);   // each is one vertical line
  });

  it("messages from an Event: 3 px apart", () => {
    const h = headlessDiagram(world([...pools(), el("e", "intermediate-event", 300, 100, 36, 36, "Notify")]));
    for (let i = 0; i < 2; i++) run(h, "add a message from Notify to Customer");
    const xs = h.data.connectors.map((c) => c.waypoints[1].x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(SPREAD.messageEvent - 0.1);
    expect(sharedPoints(h.data)).toEqual([]);
  });
});

describe("T5238 flows by voice", () => {
  it("“connect A to B” when A already has a flow out of the same face: separated, the first untouched", () => {
    const h = headlessDiagram(world([TASK("a", 0, 100, "Review"), TASK("b", 300, 0, "Pay"), TASK("c", 300, 200, "Refuse")]));
    run(h, "connect Review to Pay");
    const first = { ...h.data.connectors[0] };
    run(h, "connect Review to Refuse");
    expect(h.data.connectors).toHaveLength(2);
    expect(h.data.connectors[0].sourceOffsetAlong).toBe(first.sourceOffsetAlong);
    expect(sharedPoints(h.data)).toEqual([]);
  });

  it("“add a task … after A” three times: three flows leave A, none on another's point", () => {
    const h = headlessDiagram(world([TASK("a", 0, 100, "Start here")]));
    for (const n of ["One", "Two", "Three"]) run(h, `add a task called ${n} after Start here`);
    expect(h.data.connectors.length).toBeGreaterThanOrEqual(3);
    expect(sharedPoints(h.data)).toEqual([]);
  });

  it("a boundary event's two follow-on flows fan 3 px at its point", () => {
    const h = headlessDiagram(world([TASK("host", 0, 100, "Check"), el("be", "intermediate-event", 66, 82, 36, 36, "Timer", { boundaryHostId: "host", properties: { eventType: "timer" } })]));
    for (const n of ["Escalate", "Notify"]) run(h, `add a task called ${n} after Timer`);
    expect(sharedPoints(h.data)).toEqual([]);
  });

  it("wrapping a flow in a subprocess, then adding after it: no shared point", () => {
    const h = headlessDiagram(world([TASK("a", 0, 100, "Intake"), TASK("b", 300, 100, "Assess"), TASK("c", 600, 100, "Decide")]));
    run(h, "connect Intake to Assess");
    run(h, "connect Assess to Decide");
    run(h, "surround selected with an expanded subprocess called Review", ["b"]);
    run(h, "add a task called Archive after Review");
    expect(sharedPoints(h.data)).toEqual([]);
  });
});

describe("T5238 what voice may NOT change", () => {
  it("a gateway's four branches by voice stay on its vertex — gateways are out of scope", () => {
    const h = headlessDiagram(world([el("g", "gateway", 100, 100, 40, 40, "Route"), TASK("a", 300, 0, "A1"), TASK("b", 300, 100, "B1"), TASK("c", 300, 200, "C1"), TASK("d", 300, 300, "D1")]));
    for (const t of ["A1", "B1", "C1", "D1"]) run(h, `connect Route to ${t}`);
    for (const c of h.data.connectors) expect(c.sourceOffsetAlong ?? 0.5).toBe(0.5);
  });

  it("the gateway-point refusal is unchanged (Paul: “keep the gateway refusal for now”)", () => {
    const src = readFileSync("app/lib/assist/applyAssistOps.ts", "utf8");
    expect(src).toMatch(/already has one/);
  });
});
