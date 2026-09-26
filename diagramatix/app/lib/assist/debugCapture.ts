/**
 * Voice debug recording: WHEN the diagram is saved, and WHAT a saved state holds.
 *
 * Paul, 2026-09-26: "Make the snapshots in Voice Assist JSON, not SVG. These
 * can be better used for diagnosis." And, asked when a recording should save
 * the diagram, he chose AUTOMATIC: once when recording starts, after every
 * command that changed the diagram, and before a command if the diagram changed
 * (the mouse) since the last saved state. 📷 becomes "mark this moment", which
 * also saves the numbered badges and the selection.
 *
 * Why automatic: no "before" state was ever saved, and a click-time picture
 * could land two commands late — the "add template" one was taken 114 s after
 * its command. Every disputed command now has the diagram it ran against,
 * which is what a replay needs.
 *
 * The editor holds the reducer's state by REFERENCE — it is immutable, so
 * keeping it costs nothing — and this module decides whether a state is worth
 * keeping. Pure: no React, no DOM, so the policy is testable in the node suite.
 */
import type { DiagramData } from "../diagram/types";
import type { RenameTarget } from "./renameTargets";
import {
  SNAPSHOT_SHAPE_VERSION,
  type SnapshotDiagramJson, type VoiceDebugFlow, type VoiceDebugMeta,
} from "./debugSessionFile";

/**
 * Past this, automatic saving stops and says so. The save route refuses a
 * session over 40 MB (`sessions/route.ts` MAX_BYTES); the gap leaves room for
 * the commands and for 📷, which still saves — a person asked for that one.
 */
export const AUTO_CAPTURE_LIMIT_BYTES = 30 * 1024 * 1024;

/**
 * The numbered badges on the canvas: the rename pick's, else the message
 * pick's, else the disambiguation picker's. The canvas and the recording both
 * read this, so what is saved is what was drawn.
 */
export function badgesOnScreen(
  rename: { phase: string; targets?: RenameTarget[] } | null,
  message: { targets: RenameTarget[] } | null,
  pick: { targets: RenameTarget[] } | null,
): RenameTarget[] | undefined {
  return rename?.phase === "pick" ? rename.targets : (message?.targets ?? pick?.targets);
}

/** The editor's open flows, in the shapes they have there (only the fields read here). */
export interface OpenFlows {
  template: {
    anchorId?: string;
    anchorName?: string;
    cards: readonly unknown[];
    provisional: { card: { id: string; name: string; n: number }; ids: { elements: readonly string[]; connectors: readonly string[] } } | null;
  } | null;
  pick: { ref: string; prompt: string; targets: readonly RenameTarget[] } | null;
  rename: { phase: "pick"; itemType: string; targets: readonly RenameTarget[] } | { phase: "name"; itemType: string; targetId: string } | null;
  message: { mode: "pair"; targets: readonly RenameTarget[] } | { mode: "one"; targets: readonly RenameTarget[]; anchorId: string } | null;
}

/**
 * The open flow, copied field by field — never spread. A template card carries
 * its `thumbnailSvg` and the preview carries `base`, a whole second diagram;
 * a spread would put both in every saved state. In the order the command
 * runner hands an utterance to them.
 */
export function projectFlow(open: OpenFlows): VoiceDebugFlow | null {
  const ids = (targets: readonly RenameTarget[]) => targets.map((t) => t.id);
  if (open.template) {
    const t = open.template;
    const p = t.provisional;
    return {
      kind: "template",
      ...(t.anchorId ? { anchorId: t.anchorId } : {}),
      ...(t.anchorName ? { anchorName: t.anchorName } : {}),
      cardCount: t.cards.length,
      provisional: p
        ? { cardId: p.card.id, name: p.card.name, n: p.card.n, elementIds: [...p.ids.elements], connectorIds: [...p.ids.connectors] }
        : null,
    };
  }
  if (open.pick) return { kind: "pick", ref: open.pick.ref, prompt: open.pick.prompt, targetIds: ids(open.pick.targets) };
  if (open.rename) {
    const r = open.rename;
    return r.phase === "pick"
      ? { kind: "rename", phase: "pick", targetIds: ids(r.targets) }
      : { kind: "rename", phase: "name", targetId: r.targetId };
  }
  if (open.message) {
    const m = open.message;
    return { kind: "message", mode: m.mode, targetIds: ids(m.targets), ...(m.mode === "one" ? { anchorId: m.anchorId } : {}) };
  }
  return null;
}

/**
 * Never saved: `aiGeneration` holds the customer's prompt text (up to 24 KB,
 * no use to a voice command) and `_archive` holds user emails and ids. The
 * rest of `DiagramData` is saved whole — fonts and `relaxedLayout` change what
 * a replayed command does.
 */
const NEVER_SAVED: ReadonlySet<string> = new Set(["aiGeneration", "_archive"]);

function stripped(data: DiagramData): Omit<DiagramData, "aiGeneration"> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!NEVER_SAVED.has(k)) out[k] = v;
  return out as unknown as Omit<DiagramData, "aiGeneration">;
}

// ─────────────────────────────────────────────────────────────────────────────
// The ledger: at most one copy per distinct state, and a running size total
// ─────────────────────────────────────────────────────────────────────────────

export interface CaptureLedger {
  /** The state last saved, by reference: the reducer's state is immutable, so "the same object" is "unchanged" for free. */
  last: object | null;
  /** Its text, for a new object holding the same diagram. */
  lastText: string | null;
  /** Every saved state's JSON, added up. */
  bytes: number;
  /** Automatic saving has hit the limit. */
  stopped: boolean;
}

export function newCaptureLedger(): CaptureLedger {
  return { last: null, lastText: null, bytes: 0, stopped: false };
}

const encoder = new TextEncoder();
const utf8Bytes = (text: string) => encoder.encode(text).length;

export type CaptureResult =
  | { ledger: CaptureLedger; diagramJson: SnapshotDiagramJson; bytes: number }
  | { ledger: CaptureLedger; skipped: "unchanged" | "stopped" | "limit"; stoppedNow: boolean };

/**
 * Should this state be saved, and as what?
 *
 * "marked" (📷) is always saved: the person asked, and the badges or the
 * selection may be what they are pointing at, with the diagram unchanged. The
 * automatic roles are saved only when the diagram differs from the last saved
 * state — the after-state of one command is the before-state of the next — and
 * only until the running total would pass the limit. `stoppedNow` is true
 * exactly once, so the editor writes its log line once.
 */
export function captureState(
  ledger: CaptureLedger,
  data: DiagramData,
  meta: Omit<VoiceDebugMeta, "v">,
): CaptureResult {
  const marked = meta.role === "marked";
  if (!marked && ledger.stopped) return { ledger, skipped: "stopped", stoppedNow: false };
  if (!marked && data === ledger.last) return { ledger, skipped: "unchanged", stoppedNow: false };
  const base = stripped(data);
  const text = JSON.stringify(base);
  if (!marked && text === ledger.lastText) return { ledger: { ...ledger, last: data }, skipped: "unchanged", stoppedNow: false };
  const diagramJson = { ...base, _voiceDebug: { v: SNAPSHOT_SHAPE_VERSION, ...meta } } as SnapshotDiagramJson;
  // The diagram's text plus what `_voiceDebug` adds: the size the saved file
  // will carry, in UTF-8 BYTES — what the route's content-length cap counts. A
  // string's length counts UTF-16 units, and a diagram labelled in accented or
  // CJK text would pass 40 MB while the total still read under 30.
  const bytes = utf8Bytes(text) + utf8Bytes(JSON.stringify(diagramJson._voiceDebug)) + 16;
  if (!marked && ledger.bytes + bytes > AUTO_CAPTURE_LIMIT_BYTES) {
    return { ledger: { ...ledger, stopped: true }, skipped: "limit", stoppedNow: true };
  }
  return { ledger: { ...ledger, last: data, lastText: text, bytes: ledger.bytes + bytes }, diagramJson, bytes };
}

// ─────────────────────────────────────────────────────────────────────────────
// A command's own states: armed when it applies, settled once it has rendered
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A command in flight: the diagram it started from, and the "before" saved for
 * it — null when the last saved state already was that diagram.
 */
export interface ArmedCapture {
  before: DiagramData;
  beforeShotId: string | null;
}

/** What to tie to the command's log line once its "after" has been dealt with. */
export interface ArmSettlement {
  /** The "before" joins the command's line. */
  linkBefore: { snapshotId: string; entryId: string } | null;
  /** The line's own snapshot: its "after", else its "before". */
  entrySnapshot: { entryId: string; snapshotId: string } | null;
}

/**
 * The command has re-rendered. Save its "after" — only when the diagram is no
 * longer the one it started from — and tie both states to its line.
 *
 * `saveAfter` is the editor's save (it goes through the ledger, so it may still
 * skip: the same content, or past the limit); the "after" is saved even with no
 * line to tie it to, because the next command's "before" is that state. A
 * command that changed nothing keeps the "before" the mouse's changes earned it.
 */
export function settleArm(
  armed: ArmedCapture,
  data: DiagramData,
  entryId: string | null,
  saveAfter: (entryId: string | null) => string | null,
): ArmSettlement {
  const afterId = data === armed.before ? null : saveAfter(entryId);
  if (!entryId) return { linkBefore: null, entrySnapshot: null };
  const { beforeShotId } = armed;
  const snapshotId = afterId ?? beforeShotId;
  return {
    linkBefore: beforeShotId ? { snapshotId: beforeShotId, entryId } : null,
    entrySnapshot: snapshotId ? { entryId, snapshotId } : null,
  };
}

/** The log line for the moment automatic saving stops. */
export function captureStoppedSummary(ledger: CaptureLedger): string {
  const mb = Math.round(ledger.bytes / (1024 * 1024));
  return `automatic saving stopped — this recording holds about ${mb} MB of diagram states, and the limit is ${AUTO_CAPTURE_LIMIT_BYTES / (1024 * 1024)} MB. 📷 still saves one; Save or Download the session now`;
}
