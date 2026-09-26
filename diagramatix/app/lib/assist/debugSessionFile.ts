/**
 * One annotated Voice Assist session, as a file.
 *
 * Paul, 2026-09-24, wanted sessions both saved and downloadable. This is the
 * downloadable half — and deliberately **the same payload the save route will
 * accept**, so the two cannot drift into different shapes. A session written to
 * disk, reopened and posted must be the session that was saved.
 *
 * One file, not a bundle: `.dgx-voice.json`. It can be read in any editor,
 * mailed as an attachment, and parsed back. The same one-artifact choice
 * `.diag-rules` already makes for moving content between environments.
 *
 * SNAPSHOTS ARE THE DIAGRAM AS JSON, WITH NO PICTURE (Paul, 2026-09-26: "Make
 * the snapshots in Voice Assist JSON, not SVG. These can be better used for
 * diagnosis."). This reverses the 24 Sep decision that a snapshot captures the
 * JSON *and* a PNG. The JSON was always there, but the pictures were 78–89 % of
 * every file and could not be replayed, searched or diffed; the diagram behind
 * them can be, and it reloads in `headlessDiagram` in milliseconds. Files and
 * rows saved before then keep their pictures, and `png` stays on the type so
 * they still read.
 *
 * Pure: no DOM, no network. The round trip is therefore testable.
 */
import type { CommandLogEntry } from "./commandLog";
import type { RenameTarget } from "./renameTargets";
import type { DiagramData, DiagramType } from "../diagram/types";
import type { SymbolColorConfig } from "../diagram/colors";
import type { DisplayMode } from "../diagram/displayMode";
import { singleDiagramEnvelope, type SingleDiagramEnvelope } from "../diagram/exportEnvelope";

export const DEBUG_SESSION_FORMAT = "dgx-voice-debug";
/**
 * The FILE's shape, which the JSON snapshots did not change. There is no
 * version column, and the GET stamps this constant on every stored session, so
 * raising it would relabel every older session too. A snapshot carries its own
 * version inside `diagramJson._voiceDebug.v`.
 */
export const DEBUG_SESSION_VERSION = 1;

export interface DebugSnapshot {
  id: string;
  /** The log entry this was taken for; null for one taken on its own. */
  entryId: string | null;
  takenAt: number;
  label?: string;
  /** `data:image/png;base64,…` — only in sessions recorded before 26 Sep 2026. Never written now. */
  png?: string;
  width?: number;
  height?: number;
  /**
   * The diagram at that moment. Since 26 Sep 2026: the full `DiagramData`, flat,
   * minus `aiGeneration` (customer prompt text) and `_archive` (user emails and
   * ids), with one reserved key, `_voiceDebug` — see `SnapshotDiagramJson`.
   * Flat, so `.elements` / `.connectors` / `.viewport` stay at the top and every
   * reader of the older `{ elements, connectors }` shape still works.
   */
  diagramJson: unknown;
  elementCount: number;
  connectorCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// What a snapshot's `_voiceDebug` holds
// ─────────────────────────────────────────────────────────────────────────────

/** The snapshot shape inside `diagramJson`. 1 = `{ elements, connectors }`, no `_voiceDebug`. */
export const SNAPSHOT_SHAPE_VERSION = 2;

/**
 * Why this state was saved (Paul's Q1 answer, 2026-09-26: automatic).
 *   start  — when recording started;
 *   before — before a command, because the diagram had changed (the mouse)
 *            since the last saved state; otherwise the last "after" is it;
 *   after  — after a command that changed the diagram;
 *   marked — 📷: "mark this moment", whatever changed or did not.
 */
export type SnapshotRole = "start" | "before" | "after" | "marked";

/**
 * The guided flow open at the time, as a PROJECTION. Never the flow itself: a
 * template window's cards carry `thumbnailSvg` (about 100 KB of SVG across the
 * built-ins) and its preview carries `base`, a whole second copy of the
 * diagram — copying the flow would bring the pictures straight back.
 */
export interface VoiceDebugFlow {
  kind: "rename" | "message" | "pick" | "template";
  /** rename: numbered pick, or waiting for the name. */
  phase?: "pick" | "name";
  /** message: two numbers ("pair") or one end fixed ("one"). */
  mode?: "pair" | "one";
  /** pick: the reference that matched more than one thing. */
  ref?: string;
  prompt?: string;
  /** message "one": the fixed end. template: the element the picks go after. */
  anchorId?: string;
  anchorName?: string;
  /** The numbered targets' ids, in number order. */
  targetIds?: string[];
  /** rename "name": the item waiting for its name. */
  targetId?: string;
  /** template: how many cards the window offers. */
  cardCount?: number;
  /** template: the one showing on the diagram, waiting for "yes". */
  provisional?: { cardId: string; name: string; n: number; elementIds: string[]; connectorIds: string[] } | null;
}

/** What was on screen, beyond the diagram: what a replay of the NEXT command needs. */
export interface VoiceDebugUi {
  selectedIds: string[];
  selectedConnectorId: string | null;
  /** Where the mouse last was, in world coordinates — "put a task here". */
  pointer: { x: number; y: number } | null;
  /** What "it" means. */
  voiceLastId: string | null;
  /** The numbered badges, exactly as the canvas drew them (`renameBadges`). */
  badges: RenameTarget[] | null;
  flow: VoiceDebugFlow | null;
}

export interface VoiceDebugMeta {
  v: typeof SNAPSHOT_SHAPE_VERSION;
  role: SnapshotRole;
  /** Diagram-row fields, not in DiagramData — what the canvas was drawn with. */
  diagramType: DiagramType;
  colorConfig: SymbolColorConfig;
  displayMode: DisplayMode;
  ui: VoiceDebugUi;
}

/** A shape-2 snapshot's `diagramJson`. */
export type SnapshotDiagramJson = Omit<DiagramData, "aiGeneration"> & { _voiceDebug: VoiceDebugMeta };

// ─────────────────────────────────────────────────────────────────────────────
// The session file
// ─────────────────────────────────────────────────────────────────────────────

export interface DebugSessionFile {
  format: typeof DEBUG_SESSION_FORMAT;
  version: number;
  savedAt: number;
  appVersion?: string;
  /**
   * Which recogniser configuration produced the `heard` text in this session.
   * Absent until the shared ASR-params module lands (Phase 4); present after,
   * so "this got worse" can be answered by looking rather than remembering.
   */
  asrFingerprint?: string;
  diagram: { id: string | null; name: string | null };
  title: string;
  notes?: string;
  entries: CommandLogEntry[];
  snapshots: DebugSnapshot[];
}

/** Counts lifted out of the entries, so a listing never has to parse the document. */
export interface DebugSessionCounts {
  entryCount: number;
  failureCount: number;
  /** `ok: true` with a human verdict of "wrong" — the silent wrong answers. */
  disputeCount: number;
}

export function sessionCounts(entries: readonly CommandLogEntry[]): DebugSessionCounts {
  return {
    entryCount: entries.length,
    failureCount: entries.filter((e) => !e.ok).length,
    disputeCount: entries.filter((e) => e.ok === true && e.verdict === "wrong").length,
  };
}

export function buildDebugSessionFile(input: {
  title: string;
  diagramId?: string | null;
  diagramName?: string | null;
  entries: readonly CommandLogEntry[];
  snapshots?: readonly DebugSnapshot[];
  savedAt: number;
  appVersion?: string;
  asrFingerprint?: string;
  notes?: string;
}): DebugSessionFile {
  return {
    format: DEBUG_SESSION_FORMAT,
    version: DEBUG_SESSION_VERSION,
    savedAt: input.savedAt,
    ...(input.appVersion ? { appVersion: input.appVersion } : {}),
    ...(input.asrFingerprint ? { asrFingerprint: input.asrFingerprint } : {}),
    diagram: { id: input.diagramId ?? null, name: input.diagramName ?? null },
    title: input.title,
    ...(input.notes ? { notes: input.notes } : {}),
    entries: [...input.entries],
    snapshots: [...(input.snapshots ?? [])],
  };
}

/**
 * The file text: the envelope and the commands pretty-printed, because a person
 * reads them; each snapshot on ONE line, because nobody reads a diagram
 * indented, and indenting it doubled its size. Recording saves the diagram
 * around every command, so the snapshots are most of the file.
 */
export function serialiseDebugSession(file: DebugSessionFile): string {
  const { snapshots, ...rest } = file;
  const head = JSON.stringify({ ...rest, snapshots: [] }, null, 2);
  if (!snapshots.length) return head;
  // `snapshots` is the last key, so the last "[]" in the text is its value.
  const cut = head.lastIndexOf("[]");
  const body = snapshots.map((s) => `    ${JSON.stringify(s)}`).join(",\n");
  return `${head.slice(0, cut)}[\n${body}\n  ]${head.slice(cut + 2)}`;
}

/**
 * Read a session file back.
 *
 * Returns null rather than throwing on anything that is not one of ours: this
 * parses a file a person chose from their disk, and "that is not a session
 * file" is a message, not a stack trace. The format tag is checked because a
 * plain `.json` full of something else would otherwise half-load.
 */
export function parseDebugSession(text: string): DebugSessionFile | null {
  try {
    const raw = JSON.parse(text) as Partial<DebugSessionFile>;
    if (!raw || raw.format !== DEBUG_SESSION_FORMAT) return null;
    if (!Array.isArray(raw.entries)) return null;
    return {
      format: DEBUG_SESSION_FORMAT,
      version: typeof raw.version === "number" ? raw.version : DEBUG_SESSION_VERSION,
      savedAt: typeof raw.savedAt === "number" ? raw.savedAt : 0,
      ...(raw.appVersion ? { appVersion: raw.appVersion } : {}),
      ...(raw.asrFingerprint ? { asrFingerprint: raw.asrFingerprint } : {}),
      diagram: {
        id: raw.diagram?.id ?? null,
        name: raw.diagram?.name ?? null,
      },
      title: typeof raw.title === "string" ? raw.title : "Voice Assist session",
      ...(raw.notes ? { notes: raw.notes } : {}),
      entries: raw.entries as CommandLogEntry[],
      snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
    };
  } catch {
    return null;
  }
}

/** A diagram name made safe for a file name. */
function fileStem(diagramName: string | null | undefined): string {
  return (diagramName ?? "diagram").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "diagram";
}

/**
 * The file name. Dated, because the second thing anyone does with one of these
 * is put it next to the last one.
 */
export function debugSessionFilename(diagramName: string | null | undefined, savedAtIso: string): string {
  return `${fileStem(diagramName)}-voice-debug-${savedAtIso.slice(0, 10)}.dgx-voice.json`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading one snapshot back
// ─────────────────────────────────────────────────────────────────────────────

/** A snapshot, ready to draw, replay or import. */
export interface SnapshotReading {
  /** The diagram, without `_voiceDebug`. */
  data: DiagramData;
  /** Null for a shape-1 snapshot, which recorded nothing but the diagram. */
  meta: VoiceDebugMeta | null;
  diagramType: DiagramType;
  colorConfig: SymbolColorConfig;
  displayMode: DisplayMode;
}

/**
 * Any snapshot's `diagramJson`, old or new, as a diagram plus what was on
 * screen. A missing `_voiceDebug` is shape 1: it gets BPMN, because the Voice
 * Assist bar only ever opens on a BPMN diagram, and the default colours and
 * display. Null when there is no diagram in it at all.
 */
export function readSnapshotDiagram(diagramJson: unknown): SnapshotReading | null {
  if (!diagramJson || typeof diagramJson !== "object") return null;
  const raw = diagramJson as Record<string, unknown>;
  if (!Array.isArray(raw.elements) || !Array.isArray(raw.connectors)) return null;
  const { _voiceDebug, ...rest } = raw;
  const meta = _voiceDebug && typeof _voiceDebug === "object" && typeof (_voiceDebug as VoiceDebugMeta).v === "number"
    ? _voiceDebug as VoiceDebugMeta
    : null;
  return {
    // A shape-1 snapshot has no viewport; the type needs one and nothing reads it.
    data: { viewport: { x: 0, y: 0, zoom: 1 }, ...rest } as unknown as DiagramData,
    meta,
    diagramType: meta?.diagramType ?? "bpmn",
    colorConfig: meta?.colorConfig ?? {},
    displayMode: meta?.displayMode ?? "normal",
  };
}

/**
 * The picture to show for a snapshot, or null. Only a session saved before
 * 26 Sep 2026 has one, and the GET says which (`hasPicture`). The viewer used
 * to draw an `<img>` for every snapshot, which showed a broken image for any
 * snapshot whose capture had failed.
 */
export function snapshotPicture(s: { hasPicture?: boolean | null; url?: string | null }): string | null {
  return s.hasPicture === true && s.url ? s.url : null;
}

/**
 * One snapshot as an ordinary diagram file — the standard export envelope, so
 * the editor's and a project's Import JSON both open it. `_voiceDebug` is left
 * out of `data` (the import would otherwise save it into the diagram); its
 * diagram type, colours and display go where an export puts them. Copy JSON
 * is the place for the whole snapshot, `_voiceDebug` and all.
 */
export function snapshotDiagramFile(
  s: { takenAt: number; diagramJson: unknown },
  opts: { diagramId: string | null; diagramName: string | null; appVersion: string; exportedAt?: string },
): SingleDiagramEnvelope | null {
  const r = readSnapshotDiagram(s.diagramJson);
  if (!r) return null;
  const at = new Date(s.takenAt).toISOString().replace("T", " ").slice(0, 19);
  return singleDiagramEnvelope({
    originalId: opts.diagramId,
    name: `${opts.diagramName ?? "diagram"} — voice debug ${r.meta?.role ?? "snapshot"} ${at}`,
    type: r.diagramType,
    data: r.data,
    colorConfig: r.colorConfig,
    displayMode: r.displayMode,
  }, { appVersion: opts.appVersion, ...(opts.exportedAt ? { exportedAt: opts.exportedAt } : {}) });
}

/** `<diagram>-voice-debug-<role>-<yyyy-mm-dd>-<hhmmss>.json` — a plain `.json`, because it IS a diagram file. */
export function snapshotFilename(diagramName: string | null | undefined, role: string, takenAt: number): string {
  const iso = new Date(takenAt).toISOString();
  return `${fileStem(diagramName)}-voice-debug-${role}-${iso.slice(0, 10)}-${iso.slice(11, 19).replace(/:/g, "")}.json`;
}
