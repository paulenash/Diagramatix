/**
 * L4 — did applying the ops do the right thing?
 *
 * Each check compares the diagram BEFORE and AFTER one op and asks whether the
 * edit the op names really happened: the renamed element carries the new name,
 * the pool the user named exists with that name, the lane count went up by
 * exactly the number asked for.
 *
 * ─── Why this is not written from `applyAssistOps` ─────────────────────────
 *
 * The same discipline as the generator (T4726): a check derived from the code
 * that applies the ops would pass whatever that code did. These are written
 * from what the SENTENCE promises a person — "rename Task 1 to Review Email"
 * promises an element called Review Email where Task 1 was, nothing about how.
 * So each check is deliberately loose about geometry (the reducer owns layout
 * and has thousands of tests of its own) and strict about the one thing the
 * user asked for.
 *
 * `null` means "nothing to check" — a display op, or one whose effect is on the
 * screen rather than the diagram. It never means "passed".
 *
 * Pure.
 */
import type { AssistOp } from "./ops";
import type { Connector, DiagramData, DiagramElement } from "../diagram/types";
import { laneMetrics, poolMetrics } from "../diagram/containerMetrics";
import { isLaneUnowned } from "../diagram/containment";
import { nextContainerLabels } from "../diagram/containerNames";

export interface EffectCheck {
  ok: boolean;
  /** What was expected and what was found, in a sentence. Empty on a pass. */
  detail: string;
}

/** The ids each ref in the op resolved to — the scorer has them from L3. */
export type ResolvedRefs = Record<string, string>;

const pass: EffectCheck = { ok: true, detail: "" };
const fail = (detail: string): EffectCheck => ({ ok: false, detail });

const byId = (d: DiagramData, id: string | undefined) => (id ? d.elements.find((e) => e.id === id) : undefined);
const sameText = (a: string | undefined, b: string | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const nameOf = (e: DiagramElement | undefined) => (e ? (e.label?.trim() || e.type) : "(gone)");
const isLaneLike = (e: DiagramElement) => e.type === "lane" || e.type === "sublane";
const childLanes = (d: DiagramData, parentId: string) => d.elements.filter((e) => isLaneLike(e) && e.parentId === parentId);
const newIn = (before: DiagramData, after: DiagramData) => {
  const had = new Set(before.elements.map((e) => e.id));
  return after.elements.filter((e) => !had.has(e.id));
};
const linked = (d: DiagramData, a: string, b: string, type?: string) =>
  d.connectors.some((c) => ((c.sourceId === a && c.targetId === b) || (c.sourceId === b && c.targetId === a)) && (!type || c.type === type));
const centre = (e: DiagramElement) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });

/** A pool-ancestor walk: is this element inside some pool? */
function inAPool(d: DiagramData, e: DiagramElement): boolean {
  let cur: DiagramElement | undefined = e;
  for (let hops = 0; cur?.parentId && hops < 20; hops++) {
    cur = byId(d, cur.parentId);
    if (cur?.type === "pool") return true;
  }
  return false;
}

/** Is this element inside THIS pool? */
function inAPoolId(d: DiagramData, e: DiagramElement, poolId: string): boolean {
  let cur: DiagramElement | undefined = e;
  for (let hops = 0; cur?.parentId && hops < 20; hops++) {
    if (cur.parentId === poolId) return true;
    cur = byId(d, cur.parentId);
  }
  return false;
}

// ─── Lanes fitted and made taller ──────────────────────────────────────────
//
// Written from Paul's ruling of 2026-09-26 — THE BOTTOM EDGE MOVES — and not
// from laneFit.ts: "compress the X lane" promises the top stays, the content
// sits half a Task under it and the bottom half a Task under the content,
// never below what a name needs; "expand lane X" promises one Task row (or the
// number said) at the bottom, nothing inside moving. Half a Task and a Task row
// are the sentence's measures, written here on purpose rather than imported.

const HALF_TASK = 32;
const ONE_TASK_ROW = 64;
const TOL = 1;

/** What a container's OWN name needs, at the diagram's font sizes. */
const nameNeeds = (e: DiagramElement, d: DiagramData) => (e.type === "pool"
  ? poolMetrics(e.label ?? "", d.poolFontSize ?? 16).minHeight
  : laneMetrics(e.label ?? "", d.laneFontSize ?? 14).minHeight);

/** The containers above an element, nearest first. */
function ancestorsOf(d: DiagramData, e: DiagramElement): DiagramElement[] {
  const out: DiagramElement[] = [];
  let cur = byId(d, e.parentId);
  for (let hops = 0; cur && hops < 20; hops++) { out.push(cur); cur = byId(d, cur.parentId); }
  return out;
}

/** Everything inside a band that is not itself a band: children, theirs, and the events mounted on them. */
function contentOf(d: DiagramData, id: string): DiagramElement[] {
  const ids = new Set<string>([id]);
  for (let pass = 0; pass < 20; pass++) {
    const n = ids.size;
    for (const e of d.elements) {
      if ((e.parentId && ids.has(e.parentId)) || (e.boundaryHostId && ids.has(e.boundaryHostId))) ids.add(e.id);
    }
    if (ids.size === n) break;
  }
  ids.delete(id);
  return d.elements.filter((e) => ids.has(e.id) && !isLaneLike(e));
}

/** The band and every band inside it, top to bottom. */
function bandsOf(d: DiagramData, band: DiagramElement): DiagramElement[] {
  return [band, ...childLanes(d, band.id).sort((a, b) => a.y - b.y).flatMap((k) => bandsOf(d, k))];
}

/** A band's stack fills it exactly, at every depth — the swimlane rule. What breaks it, or "". */
function stackGap(d: DiagramData, band: DiagramElement): string {
  const kids = childLanes(d, band.id).sort((a, b) => a.y - b.y);
  if (!kids.length) return "";
  let y = band.y;
  for (const k of kids) {
    if (Math.abs(k.y - y) > TOL) return `${nameOf(k)} starts at ${k.y}, not at ${y}`;
    y = k.y + k.height;
    const inner = stackGap(d, k);
    if (inner) return inner;
  }
  return Math.abs(y - (band.y + band.height)) > TOL
    ? `the bands in ${nameOf(band)} end at ${y}, not at its bottom (${band.y + band.height})` : "";
}

const within = (e: DiagramElement, band: DiagramElement) =>
  e.y >= band.y - TOL && e.y + e.height <= band.y + band.height + TOL;

/**
 * The drawn routes between two things in `ids`, each as the height it spans. A
 * rework loop dragged under a row is what its band shows as much as the tasks
 * it joins: a compress that left it in the lane below clipped it.
 */
function routeSpans(d: DiagramData, ids: ReadonlySet<string>): Array<{ c: Connector; top: number; bottom: number }> {
  return d.connectors
    .filter((c) => c.waypoints?.length && ids.has(c.sourceId) && ids.has(c.targetId))
    .map((c) => ({ c, top: Math.min(...c.waypoints.map((p) => p.y)), bottom: Math.max(...c.waypoints.map((p) => p.y)) }));
}
const spanWithin = (s: { top: number; bottom: number }, band: DiagramElement) =>
  s.top >= band.y - TOL && s.bottom <= band.y + band.height + TOL;
const flowName = (d: DiagramData, c: Connector) => `the flow from ${nameOf(byId(d, c.sourceId))} to ${nameOf(byId(d, c.targetId))}`;
const centreWithin = (e: DiagramElement, band: DiagramElement) => {
  const c = centre(e);
  return c.x >= band.x && c.x <= band.x + band.width && c.y >= band.y && c.y <= band.y + band.height;
};

/** "compress the X lane" — see the section comment for what it promises. */
function laneWasFitted(before: DiagramData, after: DiagramData, id: string | undefined): EffectCheck {
  const b = byId(before, id), a = byId(after, id);
  if (!a || !b) return fail("the lane went missing");
  if (a.height > b.height + TOL) return fail(`${nameOf(a)} grew from ${b.height} to ${a.height} — a compress never makes a lane taller`);
  const floor = nameNeeds(a, after);
  if (a.height < Math.min(floor, b.height) - TOL) return fail(`${nameOf(a)} is ${a.height} tall, under the ${floor} its name needs`);
  if (Math.abs(a.y - b.y) > TOL) return fail(`the top of ${nameOf(a)} moved (${b.y} → ${a.y})`);

  const poolWas = ancestorsOf(before, b).find((e) => e.type === "pool");
  if (poolWas) {
    // The lanes above it did not move.
    for (const x of before.elements) {
      if (!isLaneLike(x) || x.id === b.id || !inAPoolId(before, x, poolWas.id) || x.y + x.height > b.y + TOL) continue;
      const now = byId(after, x.id);
      if (!now || Math.abs(now.y - x.y) > TOL || Math.abs(now.height - x.height) > TOL) return fail(`${nameOf(x)}, above ${nameOf(a)}, moved`);
    }
    // And the pool is not shorter than its own name.
    const poolNow = byId(after, poolWas.id);
    if (poolNow) {
      const pf = nameNeeds(poolNow, after);
      if (poolNow.height < Math.min(pf, poolWas.height) - TOL) return fail(`${nameOf(poolNow)} is ${poolNow.height} tall, under the ${pf} its name needs`);
    }
  }

  const gap = stackGap(after, a);
  if (gap) return fail(gap);

  // Whatever sat inside a band of it still does.
  for (const band0 of bandsOf(before, b)) {
    const band = byId(after, band0.id);
    if (!band) return fail(`${nameOf(band0)} went missing`);
    const held = contentOf(before, band0.id);
    for (const e of held) {
      const now = byId(after, e.id);
      if (now && within(e, band0) && !within(now, band)) return fail(`${nameOf(now)} is no longer inside ${nameOf(band)}`);
    }
    const spansNow = new Map(routeSpans(after, new Set(held.map((e) => e.id))).map((s) => [s.c.id, s] as const));
    for (const was of routeSpans(before, new Set(held.map((e) => e.id)))) {
      const now = spansNow.get(was.c.id);
      if (now && spanWithin(was, band0) && !spanWithin(now, band)) return fail(`${flowName(after, was.c)} is no longer inside ${nameOf(band)}`);
    }
  }

  // Half a Task round the content of each band, unless a name needs more. The
  // lane's bottom band keeps what the containers above it need.
  const leaves = bandsOf(after, a).filter((x) => childLanes(after, x.id).length === 0);
  const last = leaves[leaves.length - 1];
  const atFloor = (e: DiagramElement) => e.height <= nameNeeds(e, after) + TOL;
  const aboveLast = last ? ancestorsOf(after, last) : [];
  // A band with sub-lanes shows nothing of its own: a step it owns is shown in
  // the sub-lane it lies in (a stamped sub-lane is never given it).
  const stacked = new Set(bandsOf(after, a).filter((x) => childLanes(after, x.id).length > 0).map((x) => x.id));
  for (const leaf of leaves) {
    const governed = atFloor(leaf) || (leaf.id === last?.id && aboveLast.some(atFloor));
    // What the band SHOWS: what it holds; a free note lying in it, though nobody
    // owns it; a step owned by a lane above it that lies in it; and a route
    // drawn between two of those.
    const strays = after.elements.filter((e) => !isLaneLike(e) && !e.boundaryHostId && centreWithin(e, leaf)
      && ((isLaneUnowned(e) && !e.parentId) || (!!e.parentId && stacked.has(e.parentId))));
    const inside = [...contentOf(after, leaf.id), ...strays.flatMap((e) => [e, ...contentOf(after, e.id)])];
    if (!inside.length) {
      if (!governed) return fail(`${nameOf(leaf)} holds nothing and is taller than its name needs`);
      continue;
    }
    const spans = [
      ...inside.map((e) => ({ top: e.y, bottom: e.y + e.height })),
      ...routeSpans(after, new Set(inside.map((e) => e.id))),
    ];
    const top = Math.min(...spans.map((s) => s.top)) - leaf.y;
    const bottom = leaf.y + leaf.height - Math.max(...spans.map((s) => s.bottom));
    if (top > HALF_TASK + TOL) return fail(`${nameOf(leaf)} leaves ${top}px above its content — more than half a Task`);
    if (bottom > HALF_TASK + TOL && !governed) return fail(`${nameOf(leaf)} leaves ${bottom}px under its content — more than half a Task, and no name needs it`);
  }
  return pass;
}

/** "expand lane X [by N]" — taller by exactly that at the bottom, its stack still filling it, nothing inside moved. */
function laneGrewBy(by: number, before: DiagramData, after: DiagramData, id: string | undefined): EffectCheck {
  const b = byId(before, id), a = byId(after, id);
  if (!a || !b) return fail("the lane went missing");
  const grew = a.height - b.height;
  if (Math.abs(grew - by) > TOL) return fail(`${nameOf(a)} grew by ${grew}px, not ${by}px`);
  const gap = stackGap(after, a);
  if (gap) return fail(gap);
  for (const e of contentOf(before, b.id)) {
    const now = byId(after, e.id);
    if (now && Math.abs((now.y - a.y) - (e.y - b.y)) > TOL) return fail(`${nameOf(now)} moved inside ${nameOf(a)}`);
  }
  return pass;
}

/**
 * Check one op. `refs` maps each ref FIELD of the op (`ref`, `fromRef`, …) to
 * the element id it resolved to before the op ran.
 */
export function checkEffect(op: AssistOp, before: DiagramData, after: DiagramData, refs: ResolvedRefs): EffectCheck | null {
  switch (op.op) {
    // The screen, not the diagram.
    case "goldFlash": case "export": case "pickTemplate": case "again":
    case "renameByType": case "addMessageByNumber": case "acceptGhost":
      return null;

    case "undo":
      return null;   // what undo restores depends on what came before the case

    case "clear":
      return after.elements.length === 0 && after.connectors.length === 0
        ? pass : fail(`${after.elements.length} elements left after “clear”`);

    case "add": {
      const added = newIn(before, after).filter((e) => e.type === op.symbolType);
      if (added.length !== 1) return fail(`expected one new ${op.symbolType}, found ${added.length}`);
      const e = added[0];
      if (op.label && !sameText(e.label, op.label)) return fail(`the new ${op.symbolType} is called “${nameOf(e)}”, not “${op.label}”`);
      if (op.afterRef && refs.afterRef && !linked(after, refs.afterRef, e.id)) {
        // A flow out of an end event is illegal, and the command says so; that
        // is the right outcome, not a wrong edit.
        const anchor = byId(before, refs.afterRef);
        if (anchor?.type !== "end-event") return fail(`“${nameOf(e)}” was added but not connected after ${nameOf(anchor)}`);
      }
      return pass;
    }

    case "connect": {
      const [a, b] = [refs.fromRef, refs.toRef];
      return a && b && linked(after, a, b, op.connectorType ?? "sequence")
        ? pass : fail(`no ${op.connectorType ?? "sequence"} flow between ${nameOf(byId(after, a))} and ${nameOf(byId(after, b))}`);
    }

    case "disconnect": {
      const [a, b] = [refs.fromRef, refs.toRef];
      return a && b && !linked(after, a, b) ? pass : fail(`${nameOf(byId(after, a))} and ${nameOf(byId(after, b))} are still connected`);
    }

    case "delete":
      return refs.ref && byId(after, refs.ref) ? fail(`${nameOf(byId(after, refs.ref))} is still there`) : pass;

    case "rename": {
      const e = byId(after, refs.ref);
      // A decision gateway's name is a question, and the reducer adds the "?"
      // — "rename Decision? to Update Policy" rightly gives "Update Policy?".
      const q = (s: string | undefined) => (e?.type === "gateway" ? (s ?? "").trim().replace(/\?+$/, "") : s);
      return e && sameText(q(e.label), q(op.label)) ? pass : fail(`it is called “${nameOf(e)}”, not “${op.label}”`);
    }

    case "move": case "nudgePool": {
      const id = refs.ref;
      const b = byId(before, id), a = byId(after, id);
      if (!b || !a) return id ? fail("the element went missing") : null;
      const dx = a.x - b.x, dy = a.y - b.y;
      const ok = op.direction === "right" ? dx > 0 : op.direction === "left" ? dx < 0 : op.direction === "down" ? dy > 0 : dy < 0;
      return ok ? pass : fail(`${nameOf(a)} moved (${dx}, ${dy}), not ${op.direction}`);
    }

    case "convert": {
      const b = byId(before, refs.ref), a = byId(after, refs.ref);
      if (!a || !b) return fail("the element went missing");
      // The marker lives wherever the element keeps it — `taskType` on the
      // element itself, others in `properties` — so compare everything but
      // the geometry, which the reducer is free to settle.
      const marks = (e: DiagramElement) => { const { x: _x, y: _y, width: _w, height: _h, ...rest } = e; return JSON.stringify(rest); };
      return marks(a) !== marks(b) ? pass : fail(`${nameOf(a)} was not changed to a ${op.subtype}`);
    }

    case "addBoundary": {
      // No host said: the sentence promises one event on the selected task,
      // and the selection is not a ref — so any single new mounted event.
      const ev = newIn(before, after).filter((e) => (refs.hostRef ? e.boundaryHostId === refs.hostRef : !!e.boundaryHostId));
      if (ev.length !== 1) return fail(`expected one boundary event on ${nameOf(byId(after, refs.hostRef))}, found ${ev.length}`);
      return !op.label || sameText(ev[0].label, op.label) ? pass : fail(`the boundary event is called “${nameOf(ev[0])}”, not “${op.label}”`);
    }

    case "addPool": {
      const pools = newIn(before, after).filter((e) => e.type === "pool");
      if (pools.length !== 1) return fail(`expected one new pool, found ${pools.length}`);
      if (op.label && !sameText(pools[0].label, op.label)) return fail(`the new pool is called “${nameOf(pools[0])}”, not “${op.label}”`);
      const bb = (pools[0].properties?.poolType as string | undefined) === "black-box";
      if (op.poolType === "black-box" && !bb) return fail("asked for a black-box pool, got a white-box one");
      return pass;
    }

    case "addLanes": case "addSublanes": {
      const parent = op.op === "addLanes" ? refs.poolRef : refs.laneRef;
      if (!parent) return null;
      const was = childLanes(before, parent).length;
      const now = childLanes(after, parent);
      // Splitting a container with NO lanes yet gives it `labels.length` lanes;
      // splitting one that has them adds that many. Either way the count rises.
      if (now.length <= was) return fail(`${nameOf(byId(after, parent))} has ${now.length} lanes, as before`);
      // The names the reducer GIVES, from the one naming rule — "add a lane to
      // the pool" asks for "Lane" and gets "Lane 4" when Lane 1–3 exist. Held to
      // the words as said, the check failed every unnamed lane (the popup set
      // found it, 2026-09-26).
      const named = nextContainerLabels(before.elements, op.labels.filter((l) => /\S/.test(l)), op.op === "addLanes" ? "Lane" : "Sublane");
      const missing = named.filter((l) => !now.some((e) => sameText(e.label, l)));
      return missing.length ? fail(`no lane called ${missing.map((m) => `“${m}”`).join(", ")}`) : pass;
    }

    case "addLaneAt": {
      const lane = byId(before, refs.refLane);
      const pool = lane?.parentId;
      if (!pool) return null;
      const added = childLanes(after, pool).filter((e) => !before.elements.some((b) => b.id === e.id));
      if (added.length !== 1) return fail(`expected one new lane, found ${added.length}`);
      const ref = byId(after, lane.id)!;
      const ok = op.position === "above" ? added[0].y < ref.y : added[0].y > ref.y;
      if (!ok) return fail(`the new lane is not ${op.position} ${nameOf(ref)}`);
      return !op.label || sameText(added[0].label, op.label) ? pass : fail(`the new lane is called “${nameOf(added[0])}”, not “${op.label}”`);
    }

    case "swapLanes": {
      const a0 = byId(before, refs.laneA), b0 = byId(before, refs.laneB);
      const a1 = byId(after, refs.laneA), b1 = byId(after, refs.laneB);
      if (!a0 || !b0 || !a1 || !b1) return fail("a lane went missing");
      return (a0.y < b0.y) !== (a1.y < b1.y) ? pass : fail(`${nameOf(a1)} and ${nameOf(b1)} are in the same order as before`);
    }

    case "moveLane": {
      const b = byId(before, refs.ref), a = byId(after, refs.ref);
      if (!a || !b) return fail("the lane went missing");
      return (op.direction === "down" ? a.y > b.y : a.y < b.y) ? pass : fail(`${nameOf(a)} did not move ${op.direction}`);
    }

    case "compressLane":
      return laneWasFitted(before, after, refs.laneRef);

    case "expandLane":
      return laneGrewBy(op.distance ?? ONE_TASK_ROW, before, after, refs.laneRef);

    case "compressPool": {
      // No kind word was said, and the name was a LANE's: the sentence then
      // promised what "compress the X lane" promises. Checked as a pool, a lane
      // that did nothing passed — its "pool" had not grown.
      const target = byId(before, refs.poolRef);
      if (target && isLaneLike(target)) return laneWasFitted(before, after, target.id);
      const b = target, a = byId(after, refs.poolRef);
      if (!a || !b) return fail("the pool went missing");
      // "Compress" FITS the pool to what is in it — half a Task height clear
      // above and below — which can mean a little taller when the contents sat
      // closer to the edge than that. What it must never do is leave MORE room
      // than the fit: a pool that grew and is still loose did not compress.
      if (a.height <= b.height) return pass;
      const inside = after.elements.filter((e) => !isLaneLike(e) && e.type !== "pool" && inAPoolId(after, e, a.id));
      if (!inside.length) return pass;   // a black box's height is its name's
      const top = Math.min(...inside.map((e) => e.y)) - a.y;
      const bottom = (a.y + a.height) - Math.max(...inside.map((e) => e.y + e.height));
      const HALF_TASK = 32;
      return top <= HALF_TASK + 1 && bottom <= HALF_TASK + 1 ? pass : fail(`${nameOf(a)} grew, and is not fitted to its contents`);
    }

    case "extendPools": {
      const pools = after.elements.filter((e) => e.type === "pool");
      const rights = new Set(pools.map((p) => Math.round(p.x + p.width)));
      return rights.size <= 1 ? pass : fail(`the pools end at ${rights.size} different right edges`);
    }

    case "movePoolBoundary": {
      const id = refs.ref;
      const b = byId(before, id), a = byId(after, id);
      if (!b || !a) return id ? fail("the pool went missing") : null;
      // An edge that STOPS at content has done its job — the rule is "never
      // through anything". An edge that moves the WRONG WAY has not.
      const edge = (e: DiagramElement) =>
        op.boundary === "left" ? e.x : op.boundary === "right" ? e.x + e.width : op.boundary === "top" ? e.y : e.y + e.height;
      const moved = edge(a) - edge(b);
      const want = op.direction === "right" || op.direction === "down" ? 1 : -1;
      return moved * want >= 0 ? pass : fail(`the ${op.boundary} edge of ${nameOf(a)} moved the wrong way (${moved}px)`);
    }

    case "addMessage": {
      const [a, b] = [refs.fromRef, refs.toRef];
      const c = after.connectors.find((x) => x.type === "messageBPMN" && x.sourceId === a && x.targetId === b
        && !before.connectors.some((y) => y.id === x.id));
      if (!c) return fail(`no new message from ${nameOf(byId(after, a))} to ${nameOf(byId(after, b))}`);
      return !op.label || sameText(c.label, op.label) ? pass : fail(`the message is labelled “${c.label ?? ""}”, not “${op.label}”`);
    }

    case "alignSelection":
      return null;   // needs the selection the case carries; checked by the caller that has it

    case "wrapInPool": {
      // Written from Paul's four cases (2026-09-25), not from the planner the
      // product uses. Refusals (cases 1 and 3) never reach here — the apply
      // layer's own message is the detail. What is checked is the edit.
      // Only the PROCESS is wrapped — events, activities, gateways, data
      // objects and data stores (Paul, 2026-09-25); annotations stay put.
      const PROCESS = new Set(["task", "subprocess", "subprocess-expanded", "gateway", "start-event", "intermediate-event", "end-event", "data-object", "data-store"]);
      const loose = after.elements.filter((e) => PROCESS.has(e.type) && !e.boundaryHostId && !inAPool(after, e));
      if (loose.length) return fail(`${loose.length} element${loose.length === 1 ? " is" : "s are"} still outside every pool`);
      const poolsBefore = before.elements.filter((e) => e.type === "pool");
      const whiteBefore = poolsBefore.some((p) => (p.properties?.poolType as string | undefined) === "white-box"
        || before.elements.some((e) => isLaneLike(e) && e.parentId === p.id));
      // A white-box pool was there: it WIDENS and keeps its own name — never
      // taller (Paul, 2026-09-25: "as long as the elements can be enclosed by
      // widening the existing pool").
      if (whiteBefore) {
        const grown = poolsBefore.map((p) => [p, byId(after, p.id)] as const).find(([b, a]) => a && (a.x !== b.x || a.width !== b.width));
        if (grown && (grown[1]!.y !== grown[0].y || grown[1]!.height !== grown[0].height)) {
          return fail(`${nameOf(grown[1])} grew taller — it may only widen`);
        }
        return pass;
      }
      // Otherwise exactly one NEW pool, carrying the name that was said.
      const made = newIn(before, after).filter((e) => e.type === "pool");
      if (made.length !== 1) return fail(`expected one new pool, found ${made.length}`);
      const p = made[0];
      if (op.label && !sameText(p.label, op.label)) return fail(`the new pool is called “${nameOf(p)}”, not “${op.label}”`);
      // Beside black-box pools: as wide as they are, and they are untouched.
      for (const bb of poolsBefore) {
        const now = byId(after, bb.id);
        if (!now || now.x !== bb.x || now.y !== bb.y || now.width !== bb.width || now.height !== bb.height) {
          return fail(`the black-box pool ${nameOf(bb)} was changed`);
        }
      }
      if (poolsBefore.length) {
        const widest = poolsBefore.reduce((x, y) => (x.width >= y.width ? x : y));
        if (p.x > widest.x || p.x + p.width < widest.x + widest.width) return fail(`the new pool is narrower than ${nameOf(widest)}`);
        const hit = poolsBefore.find((bb) => p.y < bb.y + bb.height && p.y + p.height > bb.y);
        if (hit) return fail(`the new pool overlaps ${nameOf(hit)}`);
      }
      return pass;
    }

    default:
      return null;
  }
}

/** The selection-shaped check that needs the case's selection. */
export function checkAlign(mode: string, selected: string[], after: DiagramData): EffectCheck {
  const els = selected.map((id) => byId(after, id)).filter((e): e is DiagramElement => !!e);
  if (els.length < 2) return fail("the selection went missing");
  const key = (e: DiagramElement): number =>
    mode === "center" ? centre(e).y : mode === "vcenter" ? centre(e).x
      : mode === "left" ? e.x : mode === "right" ? e.x + e.width
        : mode === "top" ? e.y : mode === "bottom" ? e.y + e.height : 0;
  if (mode === "smart") return pass;
  const vals = new Set(els.map((e) => Math.round(key(e))));
  return vals.size === 1 ? pass : fail(`not aligned ${mode}: ${[...vals].join(", ")}`);
}
