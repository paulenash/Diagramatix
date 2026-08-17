/**
 * CONNECTOR HIGHLIGHT MATRIX — an exhaustive regression grid for the BPMN
 * drop-target coloring rules (classifyDragTarget). Every SOURCE kind × TARGET
 * kind is evaluated in each relevant spatial CONTEXT and rendered to a compact
 * grid, snapshotted so any future rule change surfaces as an explicit diff.
 *
 *   Legend:  seq = green sequence   msg = blue message
 *            asc = purple association   cmp = dark-yellow compensation
 *            .   = no highlight
 *
 * The "invisible unnamed pool" (a pool-less element, poolId === null) is a real
 * participant shared by every floating element. Policy (b): a mix of pooled +
 * floating elements is unsupported and stays silent — floating↔floating flows,
 * floating↔pooled shows nothing. Config Y (a named pool coexists) and Config X
 * (no pools at all) are both covered.
 */
import { describe, it, expect } from "vitest";
import type { DiagramElement } from "@/app/lib/diagram/types";
import { computeDragContext, classifyDragTarget } from "@/app/lib/diagram/connectorHighlight";

const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 60, height: 40, properties: {}, ...extra });

const CONNS: never[] = [];

/** classify → 3-char cell code. */
function cell(source: DiagramElement, target: DiagramElement, world: DiagramElement[]): string {
  if (source.id === target.id) return " · ";
  const ctx = computeDragContext(source, world, CONNS as never, source.id);
  const h = classifyDragTarget(source, target, ctx, world, CONNS as never, "bpmn");
  // A cell can carry more than one colour (e.g. a data association + sequence);
  // show the primary, but flag combos.
  const on = [h.sequence && "seq", h.message && "msg", h.association && "asc", h.compensation && "cmp"].filter(Boolean);
  return on.length === 0 ? " . " : on.length === 1 ? on[0] as string : (on.join("+"));
}

/** Render a source×target grid as a readable string. */
function grid(sources: Array<[string, DiagramElement]>, targets: Array<[string, DiagramElement]>, world: DiagramElement[]): string {
  const col = 5;
  const head = "src \\ tgt".padEnd(16) + targets.map(([n]) => n.padStart(col)).join("");
  const rows = sources.map(([sn, s]) =>
    sn.padEnd(16) + targets.map(([, t]) => cell(s, t, world).padStart(col)).join("")
  );
  return [head, ...rows].join("\n");
}

// ─── Fixture 1: FLAT type matrix ────────────────────────────────────────────
// All plain elements top-level; edge-mounted events sit on a shared top-level
// host EP so their scope rules are exercised. No pools → single invisible pool.
const hostEP = el("hostEP", "subprocess-expanded", { x: 0, y: 0, width: 400, height: 300 });
const childOfHost = el("childOfHost", "task", { parentId: "hostEP", x: 50, y: 50 });

const flatSources: Array<[string, DiagramElement]> = [
  ["task", el("s_task", "task")],
  ["subP", el("s_subp", "subprocess")],
  ["EP", el("s_ep", "subprocess-expanded", { x: 900, y: 0, width: 120, height: 90 })],
  ["evEP", el("s_evep", "subprocess-expanded", { x: 900, y: 200, width: 120, height: 90, properties: { subprocessType: "event" } })],
  ["gw", el("s_gw", "gateway")],
  ["start", el("s_start", "start-event")],
  ["eStart", el("s_estart", "start-event", { boundaryHostId: "hostEP" })],
  ["inter", el("s_inter", "intermediate-event")],
  ["eSend", el("s_esend", "intermediate-event", { boundaryHostId: "hostEP", flowType: "throwing" })],
  ["eRecv", el("s_erecv", "intermediate-event", { boundaryHostId: "hostEP", flowType: "catching" })],
  ["eComp", el("s_ecomp", "intermediate-event", { boundaryHostId: "hostEP", eventType: "compensation" })],
  ["end", el("s_end", "end-event")],
  ["eEnd", el("s_eend", "end-event", { boundaryHostId: "hostEP" })],
  ["data", el("s_data", "data-object")],
  ["annot", el("s_annot", "text-annotation")],
  ["compAct", el("s_compact", "task", { properties: { isForCompensation: true } })],
];
const flatTargets: Array<[string, DiagramElement]> = [
  ["task", el("t_task", "task")],
  ["subP", el("t_subp", "subprocess")],
  ["EP", hostEP],
  ["evEP", el("t_evep", "subprocess-expanded", { x: 1100, y: 200, width: 120, height: 90, properties: { subprocessType: "event" } })],
  ["gw", el("t_gw", "gateway")],
  ["start", el("t_start", "start-event")],
  ["inter", el("t_inter", "intermediate-event")],
  ["end", el("t_end", "end-event")],
  ["hostCh", childOfHost],
  ["data", el("t_data", "data-object")],
  ["annot", el("t_annot", "text-annotation")],
  ["compAct", el("t_compact", "task", { properties: { isForCompensation: true } })],
];
const flatWorld = [hostEP, childOfHost, ...flatSources.map(([, e]) => e), ...flatTargets.map(([, e]) => e)]
  .filter((e, i, a) => a.findIndex(x => x.id === e.id) === i);

// ─── Fixture 2: INVISIBLE POOL, config Y (a named white-box pool coexists) ──
const namedPool = el("namedPool", "pool", { x: 5000, y: 0, width: 500, height: 300, properties: { poolType: "white-box" } });
const namedBlack = el("namedBlack", "pool", { x: 5000, y: 400, width: 500, height: 200, properties: { poolType: "black-box" } });
const pooledTask = el("pooledTask", "task", { parentId: "namedPool", x: 5050, y: 60 });
const pooledEP = el("pooledEP", "subprocess-expanded", { parentId: "namedPool", x: 5050, y: 150, width: 120, height: 90 });
const blackContent = el("blackContent", "task", { parentId: "namedBlack", x: 5050, y: 450 });
const floatA = el("floatA", "task", { x: 0, y: 900 });     // outside every pool
const floatB = el("floatB", "task", { x: 200, y: 900 });   // outside every pool
const floatEP = el("floatEP", "subprocess-expanded", { x: 400, y: 900, width: 120, height: 90 });
const invYWorld = [namedPool, namedBlack, pooledTask, pooledEP, blackContent, floatA, floatB, floatEP];

const invYSources: Array<[string, DiagramElement]> = [
  ["floatTask", floatA],
  ["floatEP", floatEP],
  ["pooledTask", pooledTask],
];
const invYTargets: Array<[string, DiagramElement]> = [
  ["floatTask", floatB],
  ["floatEP", floatEP],
  ["pooledTask", pooledTask],
  ["pooledEP", pooledEP],
  ["wbPoolShape", namedPool],
  ["bbPoolShape", namedBlack],
  ["bbContent", blackContent],
];

// ─── Fixture 3: INVISIBLE POOL, config X (no pools at all) ───────────────────
const noPoolA = el("noPoolA", "task", { x: 0, y: 0 });
const noPoolB = el("noPoolB", "task", { x: 200, y: 0 });
const noPoolEP = el("noPoolEP", "subprocess-expanded", { x: 400, y: 0, width: 120, height: 90 });
const invXWorld = [noPoolA, noPoolB, noPoolEP];

describe("connector highlight — FLAT type matrix (single invisible pool)", () => {
  it("grid", () => {
    expect("\n" + grid(flatSources, flatTargets, flatWorld) + "\n").toMatchSnapshot();
  });
});

describe("connector highlight — invisible pool, Config Y (named pool coexists)", () => {
  it("grid", () => {
    expect("\n" + grid(invYSources, invYTargets, invYWorld) + "\n").toMatchSnapshot();
  });
});

describe("connector highlight — invisible pool, Config X (no pools)", () => {
  it("floating↔floating flows; identical to Config Y floating↔floating", () => {
    expect(cell(noPoolA, noPoolB, invXWorld)).toBe("seq");
    expect(cell(noPoolA, noPoolEP, invXWorld)).toBe("seq");
    // Same pair in Config Y (floating ends, named pool present) must match.
    expect(cell(floatA, floatB, invYWorld)).toBe("seq");
    expect(cell(floatA, floatEP, invYWorld)).toBe("seq");
  });
});
