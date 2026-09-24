/**
 * One annotated Voice Assist session, as a file.
 *
 * Paul, 2026-09-24, wanted sessions both saved and downloadable. This is the
 * downloadable half — and deliberately **the same payload the save route will
 * accept**, so the two cannot drift into different shapes. A session written to
 * disk, reopened and posted must be the session that was saved.
 *
 * One file, not a bundle: `.dgx-voice.json`, with snapshot PNGs inline as data
 * URIs. It can be read in any editor, mailed as an attachment, and parsed back.
 * A hundred entries with ten snapshots is 2–3 MB, which is a mail attachment
 * rather than a problem. The same one-artifact choice `.diag-rules` already
 * makes for moving content between environments.
 *
 * Pure: no DOM, no network. The round trip is therefore testable.
 */
import type { CommandLogEntry } from "./commandLog";

export const DEBUG_SESSION_FORMAT = "dgx-voice-debug";
export const DEBUG_SESSION_VERSION = 1;

export interface DebugSnapshot {
  id: string;
  /** The log entry this was taken for; null for an ad-hoc snapshot. */
  entryId: string | null;
  takenAt: number;
  label?: string;
  /** `data:image/png;base64,…`, or absent if the capture failed. */
  png?: string;
  width?: number;
  height?: number;
  /** The full DiagramData at that moment, so the situation can be replayed. */
  diagramJson: unknown;
  elementCount: number;
  connectorCount: number;
}

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

export function serialiseDebugSession(file: DebugSessionFile): string {
  return JSON.stringify(file, null, 2);
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

/**
 * The file name. Dated, because the second thing anyone does with one of these
 * is put it next to the last one.
 */
export function debugSessionFilename(diagramName: string | null | undefined, savedAtIso: string): string {
  const stem = (diagramName ?? "diagram").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "diagram";
  return `${stem}-voice-debug-${savedAtIso.slice(0, 10)}.dgx-voice.json`;
}
