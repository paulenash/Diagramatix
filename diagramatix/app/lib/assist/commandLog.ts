/**
 * What the Voice Assist command log remembers about one command.
 *
 * This lived inside `VoiceAssistBar.tsx` until 2026-09-24. It moved for a dull
 * but decisive reason: the suite is `tests/**\/*.test.ts` in a **node**
 * environment with no jsdom anywhere, so a type and its helpers living in a
 * `.tsx` cannot be tested at all — only asserted on as source text, which is
 * what twenty-four of the assist tests currently have to do. The bar re-exports
 * `CommandLogEntry`, so no import anywhere in the tree changed.
 *
 * EVERY FIELD ADDED HERE IS OPTIONAL, and that is load-bearing rather than
 * lazy: `correctionPairs.ts` consumes this shape structurally as `LoggedCommand`
 * ({ heard, ok }), and the session tally it computes is already on screen. A
 * required field would have broken it silently.
 */
import type { AssistOp } from "./ops";

/** The human's opinion of what happened — never the system's. See below. */
export type CommandVerdict = "worked" | "wrong" | "partly";

export interface CommandLogEntry {
  id: string;
  heard: string;
  summary: string;
  /**
   * THE SYSTEM's opinion: did the apply report success? Note that a command
   * parked for a confirmation or a pick is `ok: true` — the user is mid-answer,
   * not in error.
   */
  ok: boolean;
  /** true = interpreted by the AI fallback (metered); false/undefined = instant local rules. */
  viaAi?: boolean;

  // ─── Debug fields (Paul, 2026-09-24). Only populated while the debug toggle
  //     is on; the bar renders them only for a SuperAdmin. ───

  /** Epoch ms. A saved session is unreadable without it. */
  at?: number;
  /** The comment typed beside this command. */
  note?: string;
  /**
   * THE HUMAN's opinion, deliberately kept apart from `ok`.
   *
   * The whole value of this feature is in the disagreements. `ok: true` with a
   * verdict of `"wrong"` is a SILENT WRONG ANSWER — the system reported success
   * and did the wrong thing. It is the most dangerous failure there is, no
   * automated test can find it (the system believes it passed), and it is
   * completely invisible today. Folding the two fields together would throw
   * away the only signal that names it.
   */
  verdict?: CommandVerdict;
  /** What it parsed to, or what the AI returned. */
  ops?: AssistOp[];
  /** Which guided flow handled it, when one did. */
  flow?: "rename" | "message" | "template" | "pick" | "confirm";
  /** What the command actually changed on the canvas — see `touchedFor`. */
  touched?: TouchedElement[];
  /** Links this entry to a snapshot taken for it. */
  snapshotId?: string;
}

/** A command is DISPUTED when the system said it worked and the human says it did not. */
export function isDisputed(e: Pick<CommandLogEntry, "ok" | "verdict">): boolean {
  return e.ok === true && e.verdict === "wrong";
}

/** How many of a log's entries the human contradicted. The number worth watching. */
export function disputeCount(log: readonly Pick<CommandLogEntry, "ok" | "verdict">[]): number {
  return log.filter(isDisputed).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// What a command touched
// ─────────────────────────────────────────────────────────────────────────────

export type TouchKind =
  | "added" | "deleted" | "moved" | "resized" | "renamed" | "reparented" | "remarked";

export interface TouchedElement {
  id: string;
  /** The element's type, so a report reads "task Approve" rather than an id. */
  type?: string;
  label?: string;
  /**
   * EVERY change, not the most interesting one. A command that renames an
   * element AND moves it did both, and evidence that reports one of them sends
   * the reader looking in the wrong place.
   */
  changes: TouchKind[];
}

/** The minimum needed to tell what changed. Mirrors `goldFlash.FlashBox` plus `type`. */
export interface TouchBox {
  id: string;
  type?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  label?: string;
  /** `subtypeFingerprint` — catches "make this a user task", which moves nothing. */
  marks?: string;
}

/** Matches gold flash: a position has changed if it moved by more than this. */
const MOVED_EPSILON = 0.5;

/**
 * What one command changed, by comparing the diagram before and after.
 *
 * The technique is deliberately the same as `goldFlash.flashTargets` — a diff
 * rather than asking each of the thirty-odd op handlers to report what it
 * touched, because handlers drift and a new op would silently stop being
 * recorded. **The editorial policy is the opposite, though, and this is why it
 * is a separate function rather than a call to that one:**
 *
 *   • `flashTargets` DROPS DELETES ("there is nothing left to outline") — this
 *     keeps them, because "it deleted the wrong lane" is exactly the report
 *     somebody needs to file.
 *   • `flashTargets` prefers added-over-moved so the screen is not covered in
 *     gold, and caps at forty — this reports everything, uncapped, because the
 *     reader is a person reading a file rather than a canvas.
 *
 * Delegating to `flashTargets` would have quietly lost every delete from the
 * evidence, which is the one change you can no longer see by looking.
 */
export function touchedFor(
  before: readonly TouchBox[],
  after: readonly TouchBox[],
): TouchedElement[] {
  const was = new Map(before.map((e) => [e.id, e] as const));
  const now = new Map(after.map((e) => [e.id, e] as const));
  const out: TouchedElement[] = [];

  for (const e of after) {
    const old = was.get(e.id);
    if (!old) {
      out.push({ id: e.id, type: e.type, label: e.label, changes: ["added"] });
      continue;
    }
    const changes: TouchKind[] = [];
    if ((old.parentId ?? null) !== (e.parentId ?? null)) changes.push("reparented");
    if ((old.label ?? "") !== (e.label ?? "")) changes.push("renamed");
    if ((old.marks ?? "") !== (e.marks ?? "")) changes.push("remarked");
    if (Math.abs(old.width - e.width) > MOVED_EPSILON
      || Math.abs(old.height - e.height) > MOVED_EPSILON) changes.push("resized");
    if (Math.abs(old.x - e.x) > MOVED_EPSILON
      || Math.abs(old.y - e.y) > MOVED_EPSILON) changes.push("moved");
    if (changes.length) out.push({ id: e.id, type: e.type, label: e.label, changes });
  }

  // The half gold flash throws away.
  for (const e of before) {
    if (!now.has(e.id)) out.push({ id: e.id, type: e.type, label: e.label, changes: ["deleted"] });
  }
  return out;
}

/** One line of plain English for a touched element, for a report or a tooltip. */
export function describeTouched(t: TouchedElement): string {
  const what = t.label?.trim() || t.type || t.id;
  return `${what} ${t.changes.join(" + ")}`;
}
