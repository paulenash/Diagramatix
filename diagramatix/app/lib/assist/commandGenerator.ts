/**
 * Generated Voice Assist test cases: a sentence, and the ops it ought to
 * produce.
 *
 * THE DIRECTION MATTERS. Cases are built **from the ops outward** — pick an op
 * shape, fill it with names from the fixture, render it to English — so the
 * expected answer comes out by construction and nobody has to label a hundred
 * sentences by hand. That is what makes thousands of cases affordable.
 *
 * ─── The rule that keeps this honest ───────────────────────────────────────
 *
 * **This module must NEVER import `commandGrammar.ts`.** Not its regexes, not
 * its helpers, not its cleaners. It is enforced by a source-level test, and it
 * is the only thing standing between "two implementations that agree" and "one
 * implementation marking its own homework". If the renderer were built from the
 * parser, `parseCommand(render(op)) === op` would be a tautology and the whole
 * corpus would prove nothing.
 *
 * It MAY import `ops.ts`. That is the shared **vocabulary table** —
 * `SYMBOL_SYNONYMS`, `GATEWAY_POINTS`, the op union itself — already used by
 * the grammar, `resolveRef`, `convertPhrase` and the right-click menu. Sharing
 * a noun list is not sharing a parser, and the line goes exactly there.
 *
 * The phrasings below are written from `COMMAND_CATALOG` and from how Paul
 * actually speaks, never from reading the regexes. When the generator and the
 * grammar disagree, that is a FINDING on one side or the other — sometimes the
 * renderer said something no human would, sometimes the grammar refuses
 * something natural. Both are worth knowing.
 *
 * Pure. No DOM, no clock, no `Math.random`.
 */
import type { AssistOp } from "./ops";
import type { DiagramElement } from "../diagram/types";
import { makeRng, pick, int, DEFAULT_CORPUS_SEED, type Rng } from "./rng";
import { FRESH_LABELS } from "./commandFixture";

/** An element the sentence can name, and how it will be named. */
export interface Named {
  id: string;
  /** How a person would SAY it — not always the label. */
  spoken: string;
}

export interface GeneratedCase {
  /** `${seed}#${n}` — stable, and the merge key a results table uses. */
  id: string;
  family: string;
  utterance: string;
  /** What it ought to parse to. Ref fields hold SPOKEN names, as the grammar emits. */
  ops: AssistOp[];
  /** Spoken ref → the element id it must resolve to. */
  refs: Record<string, string>;
  /** Set when the case only makes sense with something selected. */
  needsSelection?: string[];
}

/** A view over the fixture that hands out elements by kind, already phrased. */
export interface World {
  task(rng: Rng): Named;
  gateway(rng: Rng): Named;
  event(rng: Rng): Named;
  pool(rng: Rng): Named;
  blackBoxPool(rng: Rng): Named;
  lane(rng: Rng): Named;
  sublane(rng: Rng): Named;
  /** Two distinct lanes that are neighbours, for a swap. */
  laneNeighbours(rng: Rng): [Named, Named];
  freshLabel(rng: Rng): string;
  freshLabels(rng: Rng, n: number): string[];
  has(kind: "task" | "gateway" | "event" | "pool" | "lane" | "sublane"): boolean;
}

const byType = (els: readonly DiagramElement[], type: string) => els.filter((e) => e.type === type);
const isSublane = (e: DiagramElement, els: readonly DiagramElement[]) =>
  e.type === "lane" && els.some((p) => p.id === e.parentId && p.type === "lane");

/**
 * How an element gets NAMED in a sentence.
 *
 * Variety lives here and nowhere else, so every template inherits it without
 * each one having to remember. Only forms `resolveRef` is meant to handle: the
 * bare label, and "the <kind>" where the fixture has exactly one of that kind
 * (otherwise the picker would open, which is a different test).
 */
function nameIt(rng: Rng, e: DiagramElement, els: readonly DiagramElement[], kindWord: string): Named {
  const label = (e.label ?? "").trim();
  const sameKind = els.filter((o) => o.type === e.type).length;
  const forms: string[] = [label];
  if (label) forms.push(label);                 // weight the plain name
  if (sameKind === 1) forms.push(`the ${kindWord}`);
  return { id: e.id, spoken: pick(rng, forms.filter(Boolean)) || label };
}

export function worldOf(els: readonly DiagramElement[]): World {
  const tasks = byType(els, "task");
  const gateways = byType(els, "gateway");
  const events = [...byType(els, "start-event"), ...byType(els, "end-event")];
  const pools = byType(els, "pool");
  const lanes = byType(els, "lane").filter((e) => !isSublane(e, els));
  const subs = byType(els, "lane").filter((e) => isSublane(e, els));
  const black = pools.filter((p) => (p.properties as Record<string, unknown> | undefined)?.poolType === "black-box");

  return {
    task: (rng) => nameIt(rng, pick(rng, tasks), els, "task"),
    gateway: (rng) => nameIt(rng, pick(rng, gateways), els, "gateway"),
    event: (rng) => nameIt(rng, pick(rng, events), els, "event"),
    pool: (rng) => nameIt(rng, pick(rng, pools), els, "pool"),
    blackBoxPool: (rng) => ({ id: pick(rng, black).id, spoken: (pick(rng, black).label ?? "").trim() }),
    lane: (rng) => nameIt(rng, pick(rng, lanes), els, "lane"),
    sublane: (rng) => nameIt(rng, pick(rng, subs), els, "sub-lane"),
    laneNeighbours: (rng) => {
      const sorted = [...lanes].sort((a, b) => a.y - b.y);
      const i = int(rng, 0, Math.max(0, sorted.length - 2));
      return [
        { id: sorted[i].id, spoken: (sorted[i].label ?? "").trim() },
        { id: sorted[i + 1].id, spoken: (sorted[i + 1].label ?? "").trim() },
      ];
    },
    freshLabel: (rng) => pick(rng, FRESH_LABELS),
    freshLabels: (rng, n) => {
      const out: string[] = [];
      const pool = [...FRESH_LABELS];
      for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(int(rng, 0, pool.length - 1), 1)[0]);
      return out;
    },
    has: (kind) => ({
      task: tasks.length, gateway: gateways.length, event: events.length,
      pool: pools.length, lane: lanes.length, sublane: subs.length,
    })[kind] > 0,
  };
}

interface Built {
  utterance: string;
  ops: AssistOp[];
  refs?: Record<string, string>;
  needsSelection?: string[];
}

export interface OpTemplate {
  family: string;
  applicable(w: World): boolean;
  build(rng: Rng, w: World): Built | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The templates. Phrasings come from the command catalogue and from how Paul
// speaks — never from the grammar's regexes.
// ─────────────────────────────────────────────────────────────────────────────

const ELEMENT_WORDS: Array<[string, AssistOp & { op: "add" }]> = [
  ["a task", { op: "add", symbolType: "task" }],
  ["a start event", { op: "add", symbolType: "start-event" }],
  ["an end event", { op: "add", symbolType: "end-event" }],
  ["a subprocess", { op: "add", symbolType: "subprocess" }],
];

export const GENERATOR_FAMILIES: readonly OpTemplate[] = [
  {
    family: "add",
    applicable: () => true,
    build: (rng, w) => {
      const [word, base] = pick(rng, ELEMENT_WORDS);
      const label = w.freshLabel(rng);
      if (!w.has("task") || rng.next() < 0.4) {
        return {
          utterance: pick(rng, [`add ${word} called ${label}`, `insert ${word} called ${label}`]),
          ops: [{ ...base, label }],
        };
      }
      const after = w.task(rng);
      return {
        utterance: pick(rng, [
          `add ${word} called ${label} after ${after.spoken}`,
          `insert ${word} called ${label} after ${after.spoken}`,
        ]),
        ops: [{ ...base, label, afterRef: after.spoken }],
        refs: { [after.spoken]: after.id },
      };
    },
  },
  {
    family: "connect",
    applicable: (w) => w.has("task"),
    build: (rng, w) => {
      const a = w.task(rng), b = w.task(rng);
      if (a.id === b.id) return null;
      return {
        utterance: pick(rng, [`connect ${a.spoken} to ${b.spoken}`, `join ${a.spoken} to ${b.spoken}`]),
        ops: [{ op: "connect", fromRef: a.spoken, toRef: b.spoken }],
        refs: { [a.spoken]: a.id, [b.spoken]: b.id },
      };
    },
  },
  {
    family: "disconnect",
    applicable: (w) => w.has("task"),
    build: (rng, w) => {
      const a = w.task(rng), b = w.task(rng);
      if (a.id === b.id) return null;
      return {
        utterance: `disconnect ${a.spoken} from ${b.spoken}`,
        ops: [{ op: "disconnect", fromRef: a.spoken, toRef: b.spoken }],
        refs: { [a.spoken]: a.id, [b.spoken]: b.id },
      };
    },
  },
  {
    family: "delete",
    applicable: (w) => w.has("task"),
    build: (rng, w) => {
      const t = w.task(rng);
      const compact = rng.next() < 0.4;
      return {
        utterance: compact
          ? pick(rng, [`delete ${t.spoken} and compact`, `remove ${t.spoken} and close the gap`])
          : pick(rng, [`delete ${t.spoken}`, `remove ${t.spoken}`]),
        ops: [compact ? { op: "delete", ref: t.spoken, compact: true } : { op: "delete", ref: t.spoken }],
        refs: { [t.spoken]: t.id },
      };
    },
  },
  {
    family: "rename",
    applicable: (w) => w.has("task"),
    build: (rng, w) => {
      const t = rng.next() < 0.5 ? w.task(rng) : w.lane(rng);
      const label = w.freshLabel(rng);
      // "call X Y" has no word between the two names, so a target ending in a
      // digit makes it genuinely ambiguous — "call Lane 1 Quality Check" splits
      // as either (Lane 1 → Quality Check) or (Lane → 1 Quality Check), and a
      // person would not say it either. The grammar chooses the second; that is
      // a defensible reading of an ambiguous sentence rather than a defect, so
      // the generator does not manufacture the sentence.
      const safeForBareCall = !/\d\s*$/.test(t.spoken);
      const forms = safeForBareCall
        ? [`rename ${t.spoken} to ${label}`, `call ${t.spoken} ${label}`]
        : [`rename ${t.spoken} to ${label}`];
      return {
        utterance: pick(rng, forms),
        ops: [{ op: "rename", ref: t.spoken, label }],
        refs: { [t.spoken]: t.id },
      };
    },
  },
  {
    family: "renameByType",
    applicable: () => true,
    build: (rng) => {
      // Said plural, recorded singular: the grammar normalises it.
      const kind = pick(rng, ["task", "lane", "gateway", "pool"]);
      return { utterance: `rename ${kind}s`, ops: [{ op: "renameByType", itemType: kind }] };
    },
  },
  {
    family: "move",
    applicable: (w) => w.has("task"),
    build: (rng, w) => {
      const t = w.task(rng);
      const dir = pick(rng, ["left", "right", "up", "down"] as const);
      const n = int(rng, 1, 3);
      if (n === 1) {
        return {
          utterance: `move ${t.spoken} ${dir}`,
          // count is always present, even at one — the grammar does not omit it.
          ops: [{ op: "move", ref: t.spoken, direction: dir, count: 1 }],
          refs: { [t.spoken]: t.id },
        };
      }
      const word = ["", "one", "two", "three"][n];
      return {
        utterance: pick(rng, [
          `move ${t.spoken} ${word} elements ${dir}`,
          `move ${t.spoken} ${word} steps ${dir}`,
        ]),
        ops: [{ op: "move", ref: t.spoken, direction: dir, count: n }],
        refs: { [t.spoken]: t.id },
      };
    },
  },
  {
    family: "nudge",
    applicable: (w) => w.has("task"),
    build: (rng, w) => {
      const t = w.task(rng);
      const dir = pick(rng, ["left", "right", "up", "down"] as const);
      return {
        utterance: pick(rng, [`nudge ${t.spoken} ${dir}`, `bump ${t.spoken} ${dir}`]),
        ops: [{ op: "nudgePool", ref: t.spoken, direction: dir }],
        refs: { [t.spoken]: t.id },
      };
    },
  },
  {
    family: "convert",
    applicable: (w) => w.has("task"),
    build: (rng, w) => {
      const t = w.task(rng);
      const subtype = pick(rng, ["user task", "service task", "manual task", "script task"]);
      return {
        // Spoken with the article, recorded without it — the grammar strips it,
        // and `convertPhrase.ts` matches on the bare phrase.
        utterance: `make ${t.spoken} a ${subtype}`,
        ops: [{ op: "convert", ref: t.spoken, subtype }],
        refs: { [t.spoken]: t.id },
      };
    },
  },
  {
    family: "addBoundary",
    applicable: (w) => w.has("task"),
    build: (rng, w) => {
      const host = w.task(rng);
      const label = w.freshLabel(rng);
      return {
        utterance: `add a boundary event called ${label} to ${host.spoken}`,
        ops: [{ op: "addBoundary", hostRef: host.spoken, label }],
        refs: { [host.spoken]: host.id },
      };
    },
  },
  {
    family: "addPool",
    applicable: (w) => w.has("pool"),
    build: (rng, w) => {
      const label = w.freshLabel(rng);
      const kind = pick(rng, ["black box", "white box"] as const);
      const rel = w.pool(rng);
      const where = pick(rng, ["above", "below"] as const);
      return {
        utterance: `add a ${kind} pool called ${label} ${where} ${rel.spoken}`,
        ops: [{
          op: "addPool", label,
          poolType: kind === "black box" ? "black-box" : "white-box",
          position: where, relativeTo: rel.spoken,
        }],
        refs: { [rel.spoken]: rel.id },
      };
    },
  },
  {
    family: "addLanes",
    applicable: (w) => w.has("pool"),
    build: (rng, w) => {
      const pool = w.pool(rng);
      const labels = w.freshLabels(rng, int(rng, 2, 3));
      const n = ["", "", "two", "three"][labels.length];
      const list = labels.length === 2
        ? `${labels[0]} and ${labels[1]}`
        : `${labels[0]}, ${labels[1]} and ${labels[2]}`;
      return {
        utterance: `add ${n} lanes to ${pool.spoken} called ${list}`,
        ops: [{ op: "addLanes", poolRef: pool.spoken, labels }],
        refs: { [pool.spoken]: pool.id },
      };
    },
  },
  {
    family: "addSublanes",
    applicable: (w) => w.has("lane"),
    build: (rng, w) => {
      const lane = w.lane(rng);
      const labels = w.freshLabels(rng, 2);
      return {
        utterance: `add two sublanes to ${lane.spoken} called ${labels[0]} and ${labels[1]}`,
        ops: [{ op: "addSublanes", laneRef: lane.spoken, labels }],
        refs: { [lane.spoken]: lane.id },
      };
    },
  },
  {
    family: "addLaneAt",
    applicable: (w) => w.has("lane"),
    build: (rng, w) => {
      const lane = w.lane(rng);
      const label = w.freshLabel(rng);
      const where = pick(rng, ["above", "below"] as const);
      return {
        utterance: `add a lane ${where} ${lane.spoken} called ${label}`,
        ops: [{ op: "addLaneAt", poolRef: "the pool", label, position: where, refLane: lane.spoken }],
        refs: { [lane.spoken]: lane.id },
      };
    },
  },
  {
    family: "swapLanes",
    applicable: (w) => w.has("lane"),
    build: (rng, w) => {
      const [a, b] = w.laneNeighbours(rng);
      if (a.id === b.id) return null;
      return {
        utterance: `swap ${a.spoken} with ${b.spoken}`,
        ops: [{ op: "swapLanes", laneA: a.spoken, laneB: b.spoken }],
        refs: { [a.spoken]: a.id, [b.spoken]: b.id },
      };
    },
  },
  {
    family: "moveLane",
    applicable: (w) => w.has("lane"),
    build: (rng, w) => {
      const lane = w.lane(rng);
      const dir = pick(rng, ["up", "down"] as const);
      return {
        utterance: `move the ${lane.spoken} lane ${dir}`,
        ops: [{ op: "moveLane", ref: lane.spoken, direction: dir }],
        refs: { [lane.spoken]: lane.id },
      };
    },
  },
  {
    family: "compressPool",
    applicable: (w) => w.has("pool"),
    build: (rng, w) => {
      const pool = w.pool(rng);
      return {
        utterance: `compress ${pool.spoken}`,
        ops: [{ op: "compressPool", poolRef: pool.spoken }],
        refs: { [pool.spoken]: pool.id },
      };
    },
  },
  {
    family: "movePoolBoundary",
    applicable: (w) => w.has("pool"),
    build: (rng, w) => {
      const pool = w.pool(rng);
      const boundary = pick(rng, ["left", "right", "top", "bottom"] as const);
      const dir = boundary === "left" || boundary === "right"
        ? pick(rng, ["left", "right"] as const)
        : pick(rng, ["up", "down"] as const);
      return {
        utterance: `move ${pool.spoken} ${boundary} boundary ${dir}`,
        ops: [{ op: "movePoolBoundary", ref: pool.spoken, boundary, direction: dir }],
        refs: { [pool.spoken]: pool.id },
      };
    },
  },
  {
    family: "addMessage",
    applicable: (w) => w.has("task") && w.has("pool"),
    build: (rng, w) => {
      const from = w.task(rng);
      const to = w.blackBoxPool(rng);
      const label = w.freshLabel(rng);
      return {
        utterance: `add a message from ${from.spoken} to ${to.spoken} labelled ${label}`,
        ops: [{ op: "addMessage", fromRef: from.spoken, toRef: to.spoken, label }],
        refs: { [from.spoken]: from.id, [to.spoken]: to.id },
      };
    },
  },
  {
    family: "align",
    applicable: () => true,
    build: (rng) => {
      const [phrase, mode] = pick(rng, [
        ["align these in a row", "center"],
        ["line these up in a column", "vcenter"],
        ["align their left edges", "left"],
        ["align their right edges", "right"],
        ["align their top edges", "top"],
      ] as const);
      return { utterance: phrase, ops: [{ op: "alignSelection", mode }], needsSelection: ["t1", "t2"] };
    },
  },
  {
    family: "wrapInPool",
    applicable: () => true,
    build: (rng, w) => {
      const label = w.freshLabel(rng);
      return {
        utterance: pick(rng, [`put a pool around everything called ${label}`, `wrap everything in a pool called ${label}`]),
        ops: [{ op: "wrapInPool", label }],
      };
    },
  },
  {
    family: "extendPools",
    applicable: () => true,
    build: (rng) => ({
      utterance: pick(rng, ["extend the pools", "extend the pools to include all elements"]),
      ops: [{ op: "extendPools" }],
    }),
  },
  {
    family: "goldFlash",
    applicable: () => true,
    build: (rng) => {
      const on = rng.next() < 0.5;
      return { utterance: `turn ${on ? "on" : "off"} gold flashing`, ops: [{ op: "goldFlash", on }] };
    },
  },
  {
    family: "diagram",
    applicable: () => true,
    build: (rng) => pick(rng, [
      { utterance: "undo that", ops: [{ op: "undo" } as AssistOp] },
      { utterance: "do it again", ops: [{ op: "again" } as AssistOp] },
      { utterance: "clear the diagram", ops: [{ op: "clear" } as AssistOp] },
      { utterance: "export the diagram to JSON", ops: [{ op: "export", format: "json" } as AssistOp] },
      { utterance: "add template", ops: [{ op: "pickTemplate" } as AssistOp] },
    ]),
  },
];

/**
 * Op kinds NOT generated, and why. Pinned by a coverage ratchet, so adding a new
 * op to `ops.ts` fails the suite until somebody makes a conscious choice —
 * exactly the discipline `tests/backup/coverage.test.ts` applies to new tables.
 */
export const NOT_GENERATED: Record<string, string> = {
  // Selection-shaped ops whose meaning depends on what the mouse has chosen.
  // A generated sentence can carry `needsSelection`, but scoring them properly
  // needs the apply layer (L4), which is deferred.
  wrapInSubprocess: "needs a selection with exactly one flow in and one out",
  wrapInContainer: "the AI-coerced form of wrapInPool; reached through it, not directly",
  unwrapSubprocess: "needs an expanded subprocess selected",
  labelSelected: "needs a connector selected",
  fillLabels: "needs a selection whose reading order is the answer",
  assignTeam: "needs a simulation team catalogue on the project",
  attachRiskControl: "needs a Risk & Control library on the project",
  acceptGhost: "needs live ghost suggestions on screen",
  // Gateway point ops: the vocabulary is points, not names, and the meaning
  // depends on which connectors are already attached.
  swapGatewayPoints: "depends on which gateway points are occupied",
  moveGatewayPoint: "depends on the destination point being free",
  // Numbered flows: the command opens a picker and the answer is a later
  // utterance, so one case cannot hold the whole exchange.
  addMessageByNumber: "opens a numbered picker; the answer is a second utterance",
  // Pool arrangement ops that need two pools in a known order.
  movePoolTo: "needs two pools and a stable vertical order",
  swapPools: "needs two pools and a stable vertical order",
};

export interface GenerateOptions {
  seed?: string;
  count: number;
  world: readonly DiagramElement[];
  /** Restrict to these families; default is all of them. */
  families?: readonly string[];
}

/**
 * `count` cases, deterministic in the seed.
 *
 * A template that cannot build for this fixture returns null and is skipped;
 * the loop keeps going rather than returning short, but it is bounded so a
 * fixture that suits nothing cannot spin.
 */
export function generateCases(opts: GenerateOptions): GeneratedCase[] {
  const seed = opts.seed ?? DEFAULT_CORPUS_SEED;
  const rng = makeRng(seed);
  const w = worldOf(opts.world);
  const templates = GENERATOR_FAMILIES
    .filter((t) => (opts.families ? opts.families.includes(t.family) : true))
    .filter((t) => t.applicable(w));
  if (templates.length === 0) return [];

  const out: GeneratedCase[] = [];
  let attempts = 0;
  const maxAttempts = opts.count * 20 + 100;
  while (out.length < opts.count && attempts < maxAttempts) {
    attempts++;
    const t = pick(rng, templates);
    const built = t.build(rng, w);
    if (!built) continue;
    out.push({
      id: `${seed}#${out.length + 1}`,
      family: t.family,
      utterance: built.utterance,
      ops: built.ops,
      refs: built.refs ?? {},
      ...(built.needsSelection ? { needsSelection: built.needsSelection } : {}),
    });
  }
  return out;
}

/** Every family a corpus could contain — for a results table's rows. */
export const FAMILY_NAMES: readonly string[] = GENERATOR_FAMILIES.map((t) => t.family);
