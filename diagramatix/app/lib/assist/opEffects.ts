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
import type { DiagramData, DiagramElement } from "../diagram/types";

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
      const ev = newIn(before, after).filter((e) => e.boundaryHostId === refs.hostRef);
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
      const named = op.labels.filter((l) => /\S/.test(l));
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

    case "compressPool": {
      const b = byId(before, refs.poolRef), a = byId(after, refs.poolRef);
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
      const loose = after.elements.filter((e) => e.type !== "pool" && !isLaneLike(e) && e.type !== "text-annotation" && !inAPool(after, e));
      if (loose.length) return fail(`${loose.length} element${loose.length === 1 ? " is" : "s are"} still outside every pool`);
      const poolsBefore = before.elements.filter((e) => e.type === "pool");
      const whiteBefore = poolsBefore.some((p) => (p.properties?.poolType as string | undefined) === "white-box"
        || before.elements.some((e) => isLaneLike(e) && e.parentId === p.id));
      // A white-box pool was there: it grows and keeps its own name.
      if (whiteBefore) return pass;
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
