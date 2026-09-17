/**
 * Gold flashing — show me what you just changed.
 *
 * Paul, 2026-09-17: with flashing on, finishing an Abracadabra command outlines
 * the items it touched in gold, three times, with gold sparks coming off them.
 * A spoken command can change something off to the side of where you are
 * looking, and the command log tells you what happened in words after the fact;
 * this tells you WHERE, while you are still looking at the diagram.
 *
 * Not every command flashes. Paul named four kinds: added, enclosed, moved and
 * nudged. Deletes have nothing left to outline, and renames are read rather than
 * located — the item is already under your eye because you picked its number.
 *
 * The toggle is deliberately NOT in the user-facing Commands card. It is in the
 * SuperAdmin Abracadabra tile, so it can be turned on for a demo without
 * becoming another line everyone has to read past.
 */
import type { AssistOp } from "./ops";

/** localStorage key. Absent or anything but "true" means off. */
export const GOLD_FLASH_KEY = "abraGoldFlash";

/** How many times the outline pulses. */
export const GOLD_FLASH_PULSES = 3;

/** One pulse, in milliseconds. Three of them is a beat under a second and a half. */
export const GOLD_FLASH_PULSE_MS = 460;

/** Total lifetime of the effect. */
export const GOLD_FLASH_TOTAL_MS = GOLD_FLASH_PULSES * GOLD_FLASH_PULSE_MS;

/** Sparks thrown off each flashing item. */
export const GOLD_FLASH_SPARKS = 10;

export const GOLD = {
  /** The outline and the bright core of a spark. */
  bright: "#ffd34d",
  /** The deeper edge, so the outline reads as metal rather than yellow. */
  deep: "#b8860b",
  /** The glow behind the outline. */
  glow: "#ffb703",
} as const;

/**
 * The ops whose result is worth pointing at: something appeared, something was
 * enclosed, something moved, or something was renamed.
 *
 * Renames were left out at first, on the reasoning that the guided flow has just
 * had you read a number off that very item. Paul overruled it (2026-09-18:
 * "Gold flashing does not work while in Rename tasks etc.") and he is right —
 * you pick a number, say a name, and the badge renumbering pulls your eye away
 * from the thing that actually changed.
 *
 * `delete` is still absent: there is nothing left to outline. So is `undo`,
 * because what it restores varies too much to point at honestly.
 */
const FLASHING_OPS: ReadonlySet<AssistOp["op"]> = new Set<AssistOp["op"]>([
  // added
  "add", "addBoundary", "addPool", "addLanes", "addLaneAt", "addSublanes", "addMessage",
  "addMessageByNumber",
  // enclosed
  "wrapInPool", "wrapInSubprocess", "wrapInContainer",
  // moved / nudged
  "move", "nudgePool", "moveLane", "swapLanes",
  // renamed
  "rename", "labelSelected",
]);

/** True when finishing this op should flash the items it touched. */
export function opFlashes(op: AssistOp["op"]): boolean {
  return FLASHING_OPS.has(op);
}

/** True when any op in the batch is worth flashing. */
export function batchFlashes(ops: readonly AssistOp[]): boolean {
  return ops.some((o) => opFlashes(o.op));
}

/**
 * Read the toggle. ON unless it has been explicitly switched off.
 *
 * It started off-by-default. Paul changed that the same day (2026-09-18: "Turn
 * on Gold Flashing should be the default on initiating Abracadabra mode") —
 * which is right, because nobody turns on a thing they have not seen, and
 * seeing what a spoken command just did is the point of using the voice at all.
 *
 * "Default" and not "forced": an explicit "turn off gold flashing" is
 * remembered and survives closing and reopening the bar. Only an absent setting
 * reads as on.
 *
 * Any failure — private window, blocked storage — reads as ON too, since the
 * default is what someone with no stored preference should get.
 */
export function isGoldFlashOn(storage?: Pick<Storage, "getItem">): boolean {
  try {
    const s = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    const raw = s?.getItem(GOLD_FLASH_KEY);
    return raw !== "false";
  } catch {
    return true;
  }
}

/** Write the toggle. Silently does nothing where storage is unavailable. */
export function setGoldFlash(on: boolean, storage?: Pick<Storage, "setItem">): void {
  try {
    const s = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    s?.setItem(GOLD_FLASH_KEY, on ? "true" : "false");
  } catch {
    /* a viewer with site data blocked simply does not get the effect */
  }
}

/** What the command log says back. */
export function goldFlashSummary(on: boolean): string {
  return on
    ? "gold flashing on — added, enclosed and moved items will flash"
    : "gold flashing off";
}

/** The minimum an element needs for the flash to find and outline it. */
export interface FlashBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  /**
   * Carried so a RENAME can be seen at all. A rename moves nothing and
   * re-parents nothing, so without the label the diff finds no difference and
   * the flash silently does nothing — which is what Paul hit (2026-09-18:
   * "Gold flashing does not work while in Rename tasks").
   */
  label?: string;
}

/**
 * Never outline more than this many items at once. Wrapping a large selection
 * would otherwise cover the screen in gold and say nothing.
 */
export const GOLD_FLASH_MAX_TARGETS = 40;

/** A position has changed if it moved by more than this. Guards float noise. */
const MOVED_EPSILON = 0.5;

/**
 * What to outline, worked out by comparing the diagram before and after.
 *
 * Done as a diff rather than by having each of the thirty-odd op handlers
 * report what it touched: the handlers would drift, and a new op would silently
 * stop flashing with nobody noticing.
 *
 * ADDED AND ENCLOSED WIN OVER MOVED. Surrounding a selection with a subprocess
 * also shoves every element to its right along to make room, and outlining
 * those would point at a dozen things the user did not ask to change. So when
 * anything was added or re-parented, only those are flashed; the moved set is
 * used only when nothing appeared and nothing changed hands, which is exactly
 * the move and nudge case.
 */
export function flashTargets(
  before: readonly FlashBox[],
  after: readonly FlashBox[],
): FlashBox[] {
  const was = new Map(before.map((e) => [e.id, e] as const));

  const added: FlashBox[] = [];
  const reparented: FlashBox[] = [];
  const changed: FlashBox[] = [];

  for (const e of after) {
    const old = was.get(e.id);
    if (!old) { added.push(e); continue; }
    if ((old.parentId ?? null) !== (e.parentId ?? null)) { reparented.push(e); continue; }
    const movedIt = Math.abs(old.x - e.x) > MOVED_EPSILON || Math.abs(old.y - e.y) > MOVED_EPSILON;
    // A rename is a change to that item as much as a nudge is, and it is the
    // only one of the two that leaves the geometry alone.
    const renamed = (old.label ?? "") !== (e.label ?? "");
    if (movedIt || renamed) changed.push(e);
  }

  const chosen = added.length || reparented.length ? [...added, ...reparented] : changed;
  return chosen.slice(0, GOLD_FLASH_MAX_TARGETS);
}

export interface Spark {
  /** Direction from the item's edge, in radians. */
  angle: number;
  /** How far it travels, as a multiple of the item's half-diagonal. */
  reach: number;
  /** 0..1 — staggers the sparks so they do not all leave at once. */
  delay: number;
}

/**
 * Sparks for one item, spread evenly around it with a per-item offset so two
 * items flashing side by side do not throw identical patterns.
 *
 * Deterministic in the item's id: the same item sparks the same way every time,
 * which keeps the effect from looking like noise, and keeps this testable
 * without stubbing a random source.
 */
export function sparksFor(elementId: string, count: number = GOLD_FLASH_SPARKS): Spark[] {
  let hash = 0;
  for (let i = 0; i < elementId.length; i++) hash = (hash * 31 + elementId.charCodeAt(i)) >>> 0;
  const offset = (hash % 360) * (Math.PI / 180);
  const out: Spark[] = [];
  for (let i = 0; i < count; i++) {
    // Even spread, nudged by a per-spark amount derived from the same hash so
    // the ring does not look mechanical.
    const jitter = (((hash >>> (i % 16)) & 0xff) / 255 - 0.5) * (Math.PI / count);
    out.push({
      angle: offset + (i * 2 * Math.PI) / count + jitter,
      reach: 0.55 + (((hash >>> ((i + 5) % 16)) & 0x3f) / 63) * 0.5,
      delay: (((hash >>> ((i + 9) % 16)) & 0x1f) / 31) * 0.35,
    });
  }
  return out;
}
