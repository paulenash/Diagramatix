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
import {
  ACTIVITY_LABELS, LANE_LABELS, POOL_LABELS, PARTICIPANT_LABELS, SYSTEM_LABELS,
  EVENT_LABELS, BOUNDARY_LABELS, MESSAGE_LABELS, FIXTURE_IDS,
  fixtureConnectors,
} from "./commandFixture";

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
  /**
   * Only the parse can be judged, and this says why (a ghost suggestion or a
   * library the test diagram cannot supply). Resolution and the edit are not
   * scored, so the case is never failed for what the harness cannot set up.
   */
  parseOnly?: string;
}

/** A view over the fixture that hands out elements by kind, already phrased. */
export interface World {
  task(rng: Rng): Named;
  gateway(rng: Rng): Named;
  event(rng: Rng): Named;
  pool(rng: Rng): Named;
  blackBoxPool(rng: Rng): Named;
  /** A pool that can hold things. Lanes inside a black box are a contradiction
   *  — the notation says its internals are not modelled — and the reducer now
   *  refuses them outright, so the corpus must not ask for one. */
  whiteBoxPool(rng: Rng): Named;
  lane(rng: Rng): Named;
  sublane(rng: Rng): Named;
  /** A lane with no sublanes — one that has room to carve a new lane from.
   *  A lane its sublanes fill has none, and refusing is decided (2026-09-25). */
  laneWithoutSublanes(rng: Rng): Named;
  /** Two elements a flow already joins — "disconnect" asks for nothing otherwise. */
  connectedPair(rng: Rng): [Named, Named] | null;
  /** A lane with a neighbour on BOTH sides, and a direction. A lane move trades
   *  height between those two, so an edge lane cannot move at all; asking
   *  measures a refusal, not a move. */
  laneWithNeighbour(rng: Rng): { lane: Named; dir: "up" | "down" };
  /** Two distinct lanes that are neighbours, for a swap. */
  laneNeighbours(rng: Rng): [Named, Named];
  /** A NEW name, typed by what is being named — an activity is a verb phrase,
   *  a lane is a team, a pool is a department. A lane called "Dispatch" and a
   *  task called "Finance" are both modelling errors, and a corpus full of
   *  them measures sentences nobody would say (Paul, 2026-09-25). */
  activityLabel(rng: Rng): string;
  laneLabel(rng: Rng): string;
  laneLabels(rng: Rng, n: number): string[];
  poolLabel(rng: Rng): string;
  participantLabel(rng: Rng): string;
  systemLabel(rng: Rng): string;
  /** An event is a thing that HAS HAPPENED, not a thing to do. */
  eventLabel(rng: Rng): string;
  /** A boundary event is an interruption — a timeout, an error. */
  boundaryLabel(rng: Rng): string;
  /** A message is a thing sent — a form, an invoice, a notice. */
  messageLabel(rng: Rng): string;
  /** The right KIND of new name for whatever this element is: a verb phrase
   *  for an activity, a team for a lane, a department for a pool. Renaming a
   *  lane to "Send Invoice" is as wrong as renaming a task to "Finance Team",
   *  and the rename template cannot know which it drew. */
  newNameFor(rng: Rng, target: Named): string;
  /** An element nobody has renamed yet — "Task 1", "Subprocess 3", "Lane 3". */
  defaultNamed(rng: Rng): Named | null;
  /** A pool still called what it was born as — "Pool 3". */
  defaultNamedPool(rng: Rng): Named | null;
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
  const white = pools.filter((p) => !black.includes(p));

  return {
    task: (rng) => nameIt(rng, pick(rng, tasks), els, "task"),
    gateway: (rng) => nameIt(rng, pick(rng, gateways), els, "gateway"),
    event: (rng) => nameIt(rng, pick(rng, events), els, "event"),
    pool: (rng) => nameIt(rng, pick(rng, pools), els, "pool"),
    // One pick, used for both halves. Picking twice took the id from one pool
    // and the name from another, so the case asked for "Customer" and expected
    // Salesforce — a corpus row that can never pass however well it is heard.
    blackBoxPool: (rng) => { const p = pick(rng, black); return { id: p.id, spoken: (p.label ?? "").trim() }; },
    whiteBoxPool: (rng) => nameIt(rng, pick(rng, white.length ? white : pools), els, "pool"),
    lane: (rng) => nameIt(rng, pick(rng, lanes), els, "lane"),
    sublane: (rng) => nameIt(rng, pick(rng, subs), els, "sub-lane"),
    laneWithoutSublanes: (rng) => {
      const free = lanes.filter((l) => !els.some((e) => e.type === "lane" && e.parentId === l.id));
      return nameIt(rng, pick(rng, free.length ? free : lanes), els, "lane");
    },
    connectedPair: (rng) => {
      const pairs = fixtureConnectors()
        .map((c) => [els.find((e) => e.id === c.sourceId), els.find((e) => e.id === c.targetId)] as const)
        .filter((p): p is readonly [DiagramElement, DiagramElement] => !!p[0] && !!p[1] && !!p[0].label && !!p[1].label);
      if (!pairs.length) return null;
      const [a, b] = pick(rng, pairs);
      return [{ id: a.id, spoken: (a.label ?? "").trim() }, { id: b.id, spoken: (b.label ?? "").trim() }];
    },
    laneWithNeighbour: (rng) => {
      // A lane move TRADES height between the lanes either side of it — down
      // grows the one above and shrinks the one below — so only a lane with a
      // neighbour on BOTH sides can move at all.
      const sorted = [...lanes].sort((a, b) => a.y - b.y);
      // And the lane that SHRINKS cannot be one its sublanes fill — it has no
      // room to give, and refusing is the decided behaviour (Paul, 2026-09-25:
      // "keep refusing"). So move only toward a neighbour without sublanes.
      const hasSublanes = (l: DiagramElement) => els.some((e) => e.type === "lane" && e.parentId === l.id);
      const moves: Array<{ l: DiagramElement; dir: "up" | "down" }> = [];
      for (let i = 1; i < sorted.length - 1; i++) {
        if (!hasSublanes(sorted[i - 1])) moves.push({ l: sorted[i], dir: "up" });
        if (!hasSublanes(sorted[i + 1])) moves.push({ l: sorted[i], dir: "down" });
      }
      const m = moves.length ? pick(rng, moves) : { l: sorted[Math.min(1, sorted.length - 1)], dir: "down" as const };
      return { lane: nameIt(rng, m.l, els, "lane"), dir: m.dir };
    },
    laneNeighbours: (rng) => {
      const sorted = [...lanes].sort((a, b) => a.y - b.y);
      const i = int(rng, 0, Math.max(0, sorted.length - 2));
      return [
        { id: sorted[i].id, spoken: (sorted[i].label ?? "").trim() },
        { id: sorted[i + 1].id, spoken: (sorted[i + 1].label ?? "").trim() },
      ];
    },
    activityLabel: (rng) => pick(rng, ACTIVITY_LABELS),
    laneLabel: (rng) => pick(rng, LANE_LABELS),
    laneLabels: (rng, n) => {
      const out: string[] = [];
      const bag = [...LANE_LABELS];
      for (let i = 0; i < n && bag.length; i++) out.push(bag.splice(int(rng, 0, bag.length - 1), 1)[0]);
      return out;
    },
    poolLabel: (rng) => pick(rng, POOL_LABELS),
    participantLabel: (rng) => pick(rng, PARTICIPANT_LABELS),
    systemLabel: (rng) => pick(rng, SYSTEM_LABELS),
    eventLabel: (rng) => pick(rng, EVENT_LABELS),
    boundaryLabel: (rng) => pick(rng, BOUNDARY_LABELS),
    messageLabel: (rng) => pick(rng, MESSAGE_LABELS),
    newNameFor: (rng, target) => {
      const e = els.find((x) => x.id === target.id);
      if (!e) return pick(rng, ACTIVITY_LABELS);
      if (e.type === "lane") return pick(rng, LANE_LABELS);
      if (e.type === "pool") {
        const bb = (e.properties as Record<string, unknown> | undefined)?.poolType === "black-box";
        // A black box is renamed to a PARTY or a SYSTEM, never a department.
        return bb
          ? (rng.next() < 0.5 ? pick(rng, PARTICIPANT_LABELS) : pick(rng, SYSTEM_LABELS))
          : pick(rng, POOL_LABELS);
      }
      return pick(rng, ACTIVITY_LABELS);
    },
    defaultNamed: (rng) => {
      // "Rename Task 1 to Review Email" is the commonest real command there is,
      // and its reference ends in a DIGIT — the hardest thing for the
      // recogniser to get right (Paul, 2026-09-25).
      const cands = els.filter((e) => (FIXTURE_IDS.defaultNamed as readonly string[]).includes(e.id));
      if (!cands.length) return null;
      const e = pick(rng, cands);
      return { id: e.id, spoken: (e.label ?? "").trim() };
    },
    defaultNamedPool: (rng) => {
      const born = pools.filter((p) => /^pool \d+$/i.test((p.label ?? "").trim()));
      if (!born.length) return null;
      const p = pick(rng, born);
      return { id: p.id, spoken: (p.label ?? "").trim() };
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

/** A digit as a person says it: "pool 3" → "pool three". */
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const sayNumber = (s: string) => s.replace(/\b\d\b/g, (d) => NUMBER_WORDS[Number(d)]);

/** A name that starts with a kind word of its own — "Pool 3", "Lane 3", "Sub 1". */
const namedByKind = (name: string) => /^(?:pool|lane|sub)\b/i.test(name.trim());

/**
 * How a sentence names a lane WITH its lane word, and the ref the grammar
 * ought to give for it — the kind word at the front, where the resolver reads
 * it: "the Underwriters lane" → "lane Underwriters". A name that already starts
 * with a kind word is said as it is, or with its number spoken: "Lane 3",
 * "lane three", "Sub 1", "sub one".
 */
function laneWordForms(band: Named, word: "lane" | "sublane"): Array<[string, string]> {
  if (namedByKind(band.spoken)) {
    const spoken = sayNumber(band.spoken.toLowerCase());
    return [[band.spoken, band.spoken], [spoken, spoken.replace(/^sub\b/, "sublane")]];
  }
  return [
    [`the ${band.spoken} ${word}`, `${word} ${band.spoken}`],
    [`${word} ${band.spoken}`, `${word} ${band.spoken}`],
  ];
}

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
      // An event is named for what has happened, an activity for what is done.
      const label = word.includes("event") ? w.eventLabel(rng) : w.activityLabel(rng);
      // Nothing flows INTO a start event, so "add a start event after X" asks
      // for a flow that can never be drawn. Say it without the anchor.
      if (!w.has("task") || base.symbolType === "start-event" || rng.next() < 0.4) {
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
      // Only a pair a flow actually joins. A random pair was refused ("no
      // connection between …") — correctly — and L4 counted a right answer as
      // a wrong edit, because the case asked for something impossible.
      const pair = w.connectedPair(rng);
      if (!pair) return null;
      const [a, b] = pair;
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
      // RENAME PREFERS A DEFAULT-NAMED TARGET. "Rename Task 1 to Review Email"
      // is what people actually say, and its reference ends in a digit.
      const dflt = rng.next() < 0.6 ? w.defaultNamed(rng) : null;
      const t = dflt ?? (rng.next() < 0.5 ? w.task(rng) : w.lane(rng));
      const label = w.newNameFor(rng, t);
      // "call X Y" has no word between the two names, so the split is only
      // unambiguous when the OLD name is a single word with no digit on the
      // end. "call Lane 1 Quality Check" splits as either (Lane 1 → Quality
      // Check) or (Lane → 1 Quality Check); "call Pay Claim Send Invoice" is
      // worse again. A person would not say either, and the grammar's reading
      // is a defensible choice between two meanings rather than a defect — so
      // the generator does not manufacture the sentence at all.
      const safeForBareCall = !/\d\s*$/.test(t.spoken) && !/\s/.test(t.spoken);
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
      const label = w.boundaryLabel(rng);
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
      const kind = pick(rng, ["black box", "white box"] as const);
      // A black-box pool is an external party or an IT system; a white-box one
      // is a department.
      const label = kind === "black box"
        ? (rng.next() < 0.5 ? w.participantLabel(rng) : w.systemLabel(rng))
        : w.poolLabel(rng);
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
      const pool = w.whiteBoxPool(rng);
      const labels = w.laneLabels(rng, int(rng, 2, 3));
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
      const labels = w.laneLabels(rng, 2);
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
      const lane = w.laneWithoutSublanes(rng);
      const label = w.laneLabel(rng);
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
      const { lane, dir } = w.laneWithNeighbour(rng);
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
      // The pool nobody renamed, said with its kind word — "compress pool
      // three" asked "Pool 3 or Lane 3?" in Paul's log of 2026-09-23, and a
      // corpus that only ever said "compress <proper name>" never saw it.
      const born = rng.next() < 0.3 ? w.defaultNamedPool(rng) : null;
      if (born) {
        const said = pick(rng, [born.spoken, sayNumber(born.spoken.toLowerCase())]);
        return {
          utterance: `${pick(rng, ["compress", "compact", "shrink"])} ${said}`,
          ops: [{ op: "compressPool", poolRef: said }],
          refs: { [said]: born.id },
        };
      }
      const pool = w.pool(rng);
      // Its name, or its name with the pool word — "the Customer pool" — and
      // the verbs and forms people use: "compact", "compressed the …". A name
      // that is itself a kind word ("Pool 3") is not said twice.
      const forms: Array<[string, string]> = [
        [`compress ${pool.spoken}`, pool.spoken],
        [`compact ${pool.spoken}`, pool.spoken],
      ];
      if (!namedByKind(pool.spoken)) {
        forms.push([`compress the ${pool.spoken} pool`, `pool ${pool.spoken}`]);
        forms.push([`compressed the ${pool.spoken} pool`, `pool ${pool.spoken}`]);
      }
      const [utterance, ref] = pick(rng, forms);
      return {
        utterance,
        ops: [{ op: "compressPool", poolRef: ref }],
        refs: { [ref]: pool.id },
      };
    },
  },
  {
    // Paul, 2026-09-26: "Add commands Compress Lane <lane_name>, and, Expand
    // Lane <lane_name>". Always WITH the lane word — without it the sentence is
    // compressPool, whose apply finds the lane. Claims Team is in the draw, and
    // it has sub-lanes: each is fitted in turn.
    family: "compressLane",
    applicable: (w) => w.has("lane"),
    build: (rng, w) => {
      const sub = w.has("sublane") && rng.next() < 0.35;
      const band = sub ? w.sublane(rng) : w.lane(rng);
      const [said, ref] = pick(rng, laneWordForms(band, sub ? "sublane" : "lane"));
      return {
        utterance: `${pick(rng, ["compress", "compress", "shrink", "compact"])} ${said}`,
        ops: [{ op: "compressLane", laneRef: ref }],
        refs: { [ref]: band.id },
      };
    },
  },
  {
    // One Task row at the bottom, or "by N". Only with the lane word: "expand"
    // alone is the BPMN word for opening a subprocess.
    family: "expandLane",
    applicable: (w) => w.has("lane"),
    build: (rng, w) => {
      const sub = w.has("sublane") && rng.next() < 0.35;
      const band = sub ? w.sublane(rng) : w.lane(rng);
      const [said, ref] = pick(rng, laneWordForms(band, sub ? "sublane" : "lane"));
      const verb = pick(rng, ["expand", "expand", "grow", "enlarge"]);
      if (rng.next() < 0.4) {
        const n = pick(rng, [40, 64, 100, 120]);
        return {
          utterance: `${verb} ${said} by ${n}${pick(rng, ["", " pixels", "px"])}`,
          ops: [{ op: "expandLane", laneRef: ref, distance: n }],
          refs: { [ref]: band.id },
        };
      }
      return {
        utterance: `${verb} ${said}`,
        ops: [{ op: "expandLane", laneRef: ref }],
        refs: { [ref]: band.id },
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
      const label = w.messageLabel(rng);
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
      const label = w.poolLabel(rng);
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
