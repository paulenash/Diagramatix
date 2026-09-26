"use client";
/**
 * Saved Voice Assist debug sessions.
 *
 * The list leads with **disputes** — commands the system reported as successful
 * and the person watching marked wrong. That pair is the reason the feature
 * exists: no generated test can ever find it, because the system believes it
 * passed, so a human saying otherwise is the only signal there is.
 *
 * Plain elements and Tailwind, no component library (house rule).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { CommandLogEntry } from "@/app/lib/assist/commandLog";
import { describeTouched } from "@/app/lib/assist/commandLog";
import {
  debugSessionFilename, readSnapshotDiagram, serialiseDebugSession, snapshotDiagramFile, snapshotFilename, snapshotPicture,
  type DebugSessionFile,
} from "@/app/lib/assist/debugSessionFile";
import { serialiseEnvelope } from "@/app/lib/diagram/exportEnvelope";
import { PRODUCT_VERSION } from "@/app/lib/diagram/types";

// The editor's own canvas, read-only, fetched only when a snapshot is drawn.
const SnapshotCanvas = dynamic(() => import("./SnapshotCanvas"), {
  ssr: false,
  loading: () => <p className="text-[10px] text-gray-400 mt-1">drawing…</p>,
});

interface SessionRow {
  id: string;
  title: string;
  diagramId: string | null;
  diagramName: string | null;
  createdAt: string;
  entryCount: number;
  failureCount: number;
  disputeCount: number;
  snapshotCount: number;
  appVersion: string | null;
  notes: string | null;
}

interface SnapshotView {
  id: string;
  entryId: string | null;
  takenAt: number;
  width: number | null;
  height: number | null;
  url: string;
  /** Only a session saved before 26 Sep 2026 has a picture; the GET says which. */
  hasPicture?: boolean;
  /** The snapshot itself: the diagram as JSON (see debugSessionFile.ts). */
  diagramJson: unknown;
  elementCount: number;
  connectorCount: number;
}

interface SessionDetail {
  id: string;
  title: string;
  savedAt: number;
  diagram: { id: string | null; name: string | null };
  counts: { entryCount: number; failureCount: number; disputeCount: number };
  entries: CommandLogEntry[];
  snapshots: SnapshotView[];
  appVersion?: string;
}

const when = (ms: number) => new Date(ms).toLocaleString();

/** Hand the browser a text file to save. */
function saveText(text: string, filename: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * One saved state of the diagram. JSON since 26 Sep 2026 (Paul: "JSON, not
 * SVG … better used for diagnosis"), so the diagram is drawn on demand by the
 * editor's own read-only canvas, downloaded as a file Import JSON opens, or
 * copied whole for a bug report. An older session's picture still shows — and
 * there is never an <img> without one.
 */
function SnapshotCard({ s, session, drawn, onDraw }: {
  s: SnapshotView;
  session: SessionDetail;
  drawn: boolean;
  onDraw: () => void;
}) {
  const reading = useMemo(() => readSnapshotDiagram(s.diagramJson), [s.diagramJson]);
  const picture = snapshotPicture(s);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const role = reading?.meta?.role ?? (picture ? "picture" : "snapshot");
  const badges = reading?.meta?.ui.badges?.length ?? 0;

  const downloadJson = () => {
    const file = snapshotDiagramFile(s, { diagramId: session.diagram.id, diagramName: session.diagram.name, appVersion: PRODUCT_VERSION });
    if (file) saveText(serialiseEnvelope(file), snapshotFilename(session.diagram.name, role, s.takenAt));
  };
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(s.diagramJson, null, 2));
      setCopied("done");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2000);
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-[10px] text-gray-400">
        <span className="px-1 rounded bg-amber-100 text-amber-800 text-[8px] uppercase tracking-wide"
          title="start: when recording began · before: the mouse had changed the diagram since the last saved state · after: what the command left · marked: 📷">{role}</span>
        <span>{s.elementCount} elements · {s.connectorCount} connectors{badges ? ` · ${badges} numbered badges` : ""} · {when(s.takenAt)}</span>
        {reading && (
          <button onClick={onDraw} className="text-blue-600 hover:underline">{drawn ? "hide" : "draw"}</button>
        )}
        {reading && (
          <button onClick={downloadJson} className="text-blue-600 hover:underline"
            title="The diagram as it was, as a file the editor's or a project's Import JSON opens">Download JSON</button>
        )}
        {s.diagramJson != null && (
          <button onClick={() => { void copyJson(); }} className="text-blue-600 hover:underline"
            title="The whole snapshot, including what was on screen (_voiceDebug)">
            {copied === "done" ? "copied ✓" : copied === "failed" ? "copy failed" : "Copy JSON"}
          </button>
        )}
      </div>
      {picture && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt="canvas snapshot" className="max-w-full mt-1 border border-gray-200 rounded" />
      )}
      {drawn && reading && <SnapshotCanvas reading={reading} />}
    </div>
  );
}

export function VoiceDebugClient() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [disputedOnly, setDisputedOnly] = useState(false);
  const [open, setOpenState] = useState<SessionDetail | null>(null);
  // ONE drawn snapshot at a time: each is a whole editor canvas.
  const [drawnId, setDrawnId] = useState<string | null>(null);
  const setOpen = (d: SessionDetail | null) => { setDrawnId(null); setOpenState(d); };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/admin/voice-debug/sessions${disputedOnly ? "?disputed=1" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`list failed (${res.status})`);
      setRows((await res.json()).sessions as SessionRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not load sessions");
      setRows([]);
    }
  }, [disputedOnly]);

  useEffect(() => { void load(); }, [load]);

  const openSession = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/voice-debug/sessions/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`could not open (${res.status})`);
      setOpen(await res.json() as SessionDetail);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not open that session");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    // House rule: never a browser dialog. The row asks for itself.
    setBusy(true);
    await fetch(`/api/admin/voice-debug/sessions/${id}`, { method: "DELETE" }).catch(() => {});
    setBusy(false);
    if (open?.id === id) setOpen(null);
    void load();
  };

  const [confirmId, setConfirmId] = useState<string | null>(null);

  // The same serialiser and file name as the editor's Download: one diagram
  // per line, and the name the bar gives the file.
  const download = (d: SessionDetail) => {
    saveText(serialiseDebugSession(d as unknown as DebugSessionFile), debugSessionFilename(d.diagram.name, new Date(d.savedAt).toISOString()));
  };

  return (
    // A COLUMN THAT OWNS THE VIEWPORT. The list and the opened session both
    // grow without bound, and a page that only scrolls as a whole pushes the
    // filter and the Back link off the top just when they are wanted. The panel
    // stays put; everything below it scrolls in its own right.
    <div className="flex flex-col h-[calc(100vh-4rem)] p-6 max-w-6xl">
      <div className="shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/dashboard/admin" className="text-xs text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
        </div>
        <h1 className="text-xl font-semibold text-gray-800 mb-1">Voice Assist — debug sessions</h1>
        <p className="text-xs text-gray-500 mb-4 max-w-3xl">
          Sessions recorded from the editor with <strong>debug</strong> on. A <span className="px-1 rounded bg-red-100 text-red-700">dispute</span> is a
          command that reported success and was marked <em>wrong</em> by the person watching — the failure no automated test can find,
          because the system believes it passed.
        </p>

        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-700">
            <input type="checkbox" checked={disputedOnly} onChange={(e) => setDisputedOnly(e.target.checked)} />
            only sessions with disputes
          </label>
          <button onClick={() => { void load(); }} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">Refresh</button>
          {busy && <span className="text-xs text-gray-400">working…</span>}
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
      {rows === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nothing saved yet. Open a BPMN diagram, turn on <strong>debug</strong> in the Voice Assist bar, annotate a few commands and press <strong>Save</strong>.
        </p>
      ) : (
        <table className="w-full text-xs border border-gray-200">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-2 py-1.5 border-b border-gray-200">Session</th>
              <th className="text-left px-2 py-1.5 border-b border-gray-200">Diagram</th>
              <th className="text-left px-2 py-1.5 border-b border-gray-200">When</th>
              <th className="text-right px-2 py-1.5 border-b border-gray-200">Commands</th>
              <th className="text-right px-2 py-1.5 border-b border-gray-200">Failed</th>
              <th className="text-right px-2 py-1.5 border-b border-gray-200">Disputed</th>
              <th className="text-right px-2 py-1.5 border-b border-gray-200">📷</th>
              <th className="px-2 py-1.5 border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-2 py-1.5 border-b border-gray-100">{r.title}</td>
                <td className="px-2 py-1.5 border-b border-gray-100 text-gray-500">{r.diagramName ?? "—"}</td>
                <td className="px-2 py-1.5 border-b border-gray-100 text-gray-500">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-2 py-1.5 border-b border-gray-100 text-right">{r.entryCount}</td>
                <td className="px-2 py-1.5 border-b border-gray-100 text-right text-amber-700">{r.failureCount || ""}</td>
                <td className={`px-2 py-1.5 border-b border-gray-100 text-right font-semibold ${r.disputeCount ? "text-red-700" : "text-gray-300"}`}>{r.disputeCount || "—"}</td>
                <td className="px-2 py-1.5 border-b border-gray-100 text-right text-gray-500">{r.snapshotCount || ""}</td>
                <td className="px-2 py-1.5 border-b border-gray-100 text-right whitespace-nowrap">
                  <button onClick={() => { void openSession(r.id); }} className="text-blue-600 hover:underline mr-2">open</button>
                  {confirmId === r.id ? (
                    <>
                      <button onClick={() => { void remove(r.id); setConfirmId(null); }} className="text-red-600 hover:underline mr-1">delete</button>
                      <button onClick={() => setConfirmId(null)} className="text-gray-400 hover:underline">cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmId(r.id)} className="text-gray-400 hover:text-red-600">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && (
        <div className="mt-6 border border-gray-200 rounded">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-800">{open.title}</span>
            <span className="text-[11px] text-gray-500">{when(open.savedAt)} · {open.counts.entryCount} commands · {open.counts.failureCount} failed · <span className={open.counts.disputeCount ? "text-red-700 font-semibold" : ""}>{open.counts.disputeCount} disputed</span>{open.appVersion ? ` · product ${open.appVersion}` : ""}</span>
            <span className="flex-1" />
            <button onClick={() => download(open)} className="text-xs px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">Download</button>
            <button onClick={() => setOpen(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
          </div>

          <div className="max-h-[40rem] overflow-y-auto p-3 space-y-2">
            {open.entries.map((e) => {
              const shots = open.snapshots.filter((s) => s.entryId === e.id);
              const disputed = e.ok && e.verdict === "wrong";
              return (
                <div key={e.id} className={`text-[11px] border rounded p-2 ${disputed ? "border-red-200 bg-red-50" : "border-gray-100"}`}>
                  <div className="flex items-start gap-2">
                    <span className={e.ok ? "text-green-600" : "text-amber-600"}>{e.ok ? "✓" : "…"}</span>
                    <span className="flex-1 min-w-0">
                      <span className={`inline-block mr-1 px-1 rounded text-[8px] uppercase tracking-wide align-middle ${e.viaAi ? "bg-fuchsia-100 text-fuchsia-700" : "bg-emerald-100 text-emerald-700"}`}>{e.viaAi ? "✨ AI" : "rule"}</span>
                      {e.heard && <span className="text-gray-400">“{e.heard}” </span>}
                      <span className="text-gray-700">→ {e.summary}</span>
                      {e.verdict && (
                        <span className={`ml-1 px-1 rounded text-[8px] uppercase tracking-wide align-middle ${
                          e.verdict === "worked" ? "bg-green-100 text-green-700"
                            : e.verdict === "partly" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        }`}>{e.verdict}</span>
                      )}
                      {disputed && <span className="ml-1 px-1 rounded bg-red-600 text-white text-[8px] uppercase tracking-wide align-middle">disputed</span>}
                    </span>
                    {e.at && <span className="text-[10px] text-gray-300 shrink-0">{new Date(e.at).toLocaleTimeString()}</span>}
                  </div>
                  {e.note && <div className="ml-5 mt-1 text-[11px] text-gray-700 italic">“{e.note}”</div>}
                  {e.touched && e.touched.length > 0 && (
                    <div className="ml-5 mt-1 text-[10px] text-gray-400">changed: {e.touched.map(describeTouched).join(", ")}</div>
                  )}
                  {shots.length > 0 && (
                    <div className="ml-5">
                      {shots.map((s) => (
                        <SnapshotCard key={s.id} s={s} session={open} drawn={drawnId === s.id}
                          onDraw={() => setDrawnId(drawnId === s.id ? null : s.id)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Saved states with no command: the start of recording, and 📷 pressed on its own. */}
            {open.snapshots.filter((s) => !s.entryId).length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <div className="text-[11px] font-semibold text-gray-600 mb-1">Saved on their own — when recording started, or 📷 with no command</div>
                {open.snapshots.filter((s) => !s.entryId).map((s) => (
                  <SnapshotCard key={s.id} s={s} session={open} drawn={drawnId === s.id}
                    onDraw={() => setDrawnId(drawnId === s.id ? null : s.id)} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
