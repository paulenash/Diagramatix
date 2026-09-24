"use client";
/**
 * Voice Assist UI — a floating command bar. Shows the live-listening caption
 * (Stage 3 voice), a typed-command input, and a scrolling command log (heard →
 * did — one undo per command). Presentational: all state + apply logic live in the
 * editor.
 *
 * Two header buttons (Paul, 2026-09-15): **Commands** opens a movable, scrollable
 * reminder of what can be said (from `commandCatalog.ts`, every example tested
 * to parse); **Cost** asks the editor what this session has cost so far.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { FloatingPanel } from "./FloatingPanel";
import { formatCostReport, type CostReport } from "@/app/lib/assist/usageCost";
import { correctionTally, formatCorrectionTally } from "@/app/lib/assist/correctionPairs";
import { describeTouched, type CommandLogEntry as LogEntry, type CommandVerdict as Verdict } from "@/app/lib/assist/commandLog";

// The log entry shape moved to `app/lib/assist/commandLog.ts` (2026-09-24) so it
// could be tested — the suite is node-only with no jsdom, so nothing in a .tsx
// is reachable from a test. Re-exported here so no import in the tree changed.
export type { CommandLogEntry, CommandVerdict } from "@/app/lib/assist/commandLog";

/** A small floating panel the user can drag by its title bar. */
export function VoiceAssistBar({
  listening,
  engine,
  interim,
  busy,
  log,
  onSubmitText,
  onToggleListen,
  onClear,
  onClose,
  onCost,
  connecting = false,
  isSuperAdmin = false,
  debugOn = false,
  onToggleDebug,
  onAnnotate,
  onSnapshot,
  onDownloadSession,
  onSaveSession,
  saveState = "idle",
  snapshotCount = 0,
}: {
  listening: boolean;
  /** Mic pressed but the recogniser not yet live — shown as "connecting…" so
   *  nobody starts talking into a gap. */
  connecting?: boolean;
  engine: "deepgram" | "browser" | null;
  interim: string;
  busy: boolean;
  log: LogEntry[];
  onSubmitText: (text: string) => void;
  onToggleListen: () => void;
  onClear: () => void;
  onClose: () => void;
  /** Cost of this session so far (AI fallback calls + microphone minutes). */
  onCost?: () => Promise<CostReport | null>;
  /** The debug row only exists for a SuperAdmin; the editor decides. */
  isSuperAdmin?: boolean;
  debugOn?: boolean;
  onToggleDebug?: (on: boolean) => void;
  /** Record the human's opinion of one command. */
  onAnnotate?: (id: string, patch: { note?: string; verdict?: Verdict }) => void;
  /** Take a picture of the canvas — for one entry, or ad-hoc when id is null. */
  onSnapshot?: (entryId: string | null) => void;
  onDownloadSession?: () => void;
  /** Keep this session — saved to the SuperAdmin list, where it outlives the tab. */
  onSaveSession?: () => void;
  saveState?: "idle" | "saving" | "saved" | "error";
  snapshotCount?: number;
}) {
  const [text, setText] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  // The bar itself can be dragged by its header (Paul, 2026-09-15); until it is,
  // it sits bottom-centre as before.
  const [barPos, setBarPos] = useState<{ x: number; y: number } | null>(null);
  const barDrag = useRef<{ dx: number; dy: number } | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const onBarDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return;
    barDrag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };
  const onBarMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!barDrag.current) return;
    setBarPos({
      x: Math.max(0, Math.min(window.innerWidth - 120, e.clientX - barDrag.current.dx)),
      y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - barDrag.current.dy)),
    });
  };
  const onBarUp = () => { barDrag.current = null; };
  const [cost, setCost] = useState<{ state: "idle" | "loading" | "error"; report: CostReport | null }>({ state: "idle", report: null });
  // V3, first half: how the session GOT ON, alongside what it cost. Computed
  // from the log already on screen — nothing is stored, sent or persisted yet.
  // The split between "misheard" and "rephrased" is the measurement that says
  // whether a personal phrase book would have anything to learn.
  const sessionLine = useMemo(() => formatCorrectionTally(correctionTally(log)), [log]);
  const logEnd = useRef<HTMLDivElement | null>(null);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: "end" }); }, [log.length]);
  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    onSubmitText(t);
    setText("");
  };
  const askCost = async () => {
    if (!onCost) return;
    setCost((c) => ({ ...c, state: "loading" }));
    try {
      const r = await onCost();
      setCost({ state: r ? "idle" : "error", report: r });
    } catch {
      setCost({ state: "error", report: null });
    }
  };

  return (
    <>
      {showCommands && (
        <FloatingPanel title="What you can say" onClose={() => setShowCommands(false)}>
          <p className="text-[11px] text-gray-500 mb-2">Say it or type it. <strong>Everything on this card is instant and free</strong> — the log tags it <span className="px-1 rounded bg-emerald-100 text-emerald-700 text-[9px] uppercase">rule</span>. A phrase that is not here goes to the AI (<span className="px-1 rounded bg-fuchsia-100 text-fuchsia-700 text-[9px] uppercase">✨ AI</span>), which rewrites it into one of these.</p>
          {COMMAND_CATALOG.map((fam) => (
            <div key={fam.family} className="mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-700 mb-1">{fam.family}</div>
              {fam.items.map((item) => (
                <div key={item.does} className="mb-1.5">
                  <div className="text-[11px] text-gray-700">{item.does}</div>
                  <div className="text-[11px] text-gray-500 italic">{item.say.map((s) => `“${s}”`).join(" · ")}</div>
                </div>
              ))}
            </div>
          ))}
        </FloatingPanel>
      )}

      <div ref={barRef}
        className={`fixed z-40 w-[440px] max-w-[92vw] bg-white rounded-xl shadow-2xl border border-purple-200 ${barPos ? "" : "left-1/2 -translate-x-1/2 bottom-4"}`}
        style={barPos ? { left: barPos.x, top: barPos.y } : undefined}
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 cursor-move select-none touch-none"
          onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerCancel={onBarUp}
          title="Drag to move">
          <div className="flex items-center gap-2 text-sm font-semibold text-purple-800">
            <span>🪄 Voice Assist</span>
            {listening && (connecting
              ? <span className="text-[10px] font-normal text-amber-600 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />connecting…</span>
              : <span className="text-[10px] font-normal text-red-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />listening{engine === "browser" ? " (browser)" : ""}…</span>)}
            {busy && <span className="text-[10px] font-normal text-gray-400">thinking…</span>}
          </div>
          <div className="flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
            <button onClick={() => setShowCommands((v) => !v)}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${showCommands ? "bg-purple-600 text-white border-purple-600" : "text-purple-700 border-purple-300 hover:bg-purple-50"}`}
              title="What you can say — a movable reminder card">Commands</button>
            {onCost && (
              <button onClick={() => { void askCost(); }} disabled={cost.state === "loading"}
                className="text-[10px] px-1.5 py-0.5 rounded border text-purple-700 border-purple-300 hover:bg-purple-50 disabled:opacity-50"
                title="What this session has cost so far (AI calls + microphone minutes, at list rates)">{cost.state === "loading" ? "Cost…" : "Cost"}</button>
            )}
            {isSuperAdmin && onToggleDebug && (
              <button onClick={() => onToggleDebug(!debugOn)}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${debugOn ? "bg-amber-500 text-white border-amber-500" : "text-amber-700 border-amber-300 hover:bg-amber-50"}`}
                title="Record this session: a verdict and a comment beside each command, and snapshots you can download">debug</button>
            )}
            {log.length > 0 && <button onClick={onClear} className="text-[10px] text-gray-400 hover:text-gray-600" title="Clear the command log">clear</button>}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none" title="Close">×</button>
          </div>
        </div>

        {/* Cost readout — an estimate at list rates; the open mic session is included by the editor. */}
        {(cost.report || cost.state === "error") && (
          <div className="px-3 py-1.5 border-b border-gray-100 text-[11px] text-gray-600 flex items-center gap-2">
            {cost.report ? (
              <>
                <span className="flex-1 min-w-0">{formatCostReport(cost.report)}
                  {cost.report.unpricedModels.length > 0 && <span className="text-amber-600"> · no rate for {cost.report.unpricedModels.join(", ")}</span>}
                </span>
                <span className="text-[9px] text-gray-400 shrink-0" title="List rates from the AI rate catalogue and a per-minute Deepgram estimate; the provider's invoice is the truth">estimate</span>
                <button onClick={() => { void askCost(); }} className="text-gray-400 hover:text-gray-600" title="Refresh">↻</button>
              </>
            ) : (
              <span className="text-amber-600">couldn’t fetch the cost</span>
            )}
          </div>
        )}

        {/* How the session GOT ON — the other half of what it cost you. A
            command that had to be said twice is a cost the dollar figure does
            not show. "Misheard" (said again, worked) and "rephrased" (said
            differently, worked) are different problems: the first is the
            recogniser's, the second is the grammar's, and only the first is
            something a personal phrase book could ever learn. That split is
            what decides whether V3 is worth building. */}
        {cost.report && sessionLine && (
          <div
            className="px-3 py-1.5 border-b border-gray-100 text-[11px] text-gray-500"
            title="A command that had to be said twice is a cost too. Misheard = said again and it worked (the recogniser); rephrased = said differently and it worked (the grammar)."
          >
            {sessionLine}
          </div>
        )}

        {/* Debug session bar — only while recording, so the ordinary bar is unchanged. */}
        {debugOn && isSuperAdmin && (
          <div className="px-3 py-1.5 border-b border-amber-100 bg-amber-50 text-[11px] text-amber-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="flex-1 min-w-0">
              recording — say what each command did
              {snapshotCount > 0 && <span className="text-amber-600"> · {snapshotCount} snapshot{snapshotCount === 1 ? "" : "s"}</span>}
            </span>
            {onSnapshot && (
              <button onClick={() => onSnapshot(null)} className="shrink-0 px-1.5 py-0.5 rounded border border-amber-300 hover:bg-amber-100"
                title="Take a picture of the canvas as it is now">📷 Snapshot</button>
            )}
            {onSaveSession && (
              <button onClick={onSaveSession} disabled={log.length === 0 || saveState === "saving"}
                className={`shrink-0 px-1.5 py-0.5 rounded border disabled:opacity-40 ${
                  saveState === "saved" ? "bg-green-600 text-white border-green-600"
                    : saveState === "error" ? "bg-red-100 text-red-700 border-red-300"
                      : "border-amber-300 hover:bg-amber-100"
                }`}
                title="Keep this session — it appears in the SuperAdmin Voice Assist Debug Sessions list and outlives this tab">
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Save failed" : "Save"}
              </button>
            )}
            {onDownloadSession && (
              <button onClick={onDownloadSession} disabled={log.length === 0}
                className="shrink-0 px-1.5 py-0.5 rounded border border-amber-300 hover:bg-amber-100 disabled:opacity-40"
                title="Download this session — every command, your comments, and the snapshots — as one file">Download</button>
            )}
          </div>
        )}

        {/* Command log */}
        {log.length > 0 && (
          <div className={`${debugOn ? "max-h-72" : "max-h-40"} overflow-y-auto px-3 py-2 space-y-1 border-b border-gray-100`}>
            {log.map((e) => (
              <div key={e.id} className="text-[11px]">
                <div className="flex items-start gap-2">
                  <span className={e.ok ? "text-green-600" : "text-amber-600"}>{e.ok ? "✓" : "…"}</span>
                  <span className="flex-1 min-w-0">
                    {/* Colour-code the interpreter: instant local rule vs metered AI. */}
                    <span
                      className={`inline-block mr-1 px-1 rounded text-[8px] uppercase tracking-wide align-middle ${
                        e.viaAi ? "bg-fuchsia-100 text-fuchsia-700" : "bg-emerald-100 text-emerald-700"
                      }`}
                      title={e.viaAi ? "Interpreted by the AI (metered)" : "Instant local rule (free)"}
                    >
                      {e.viaAi ? "✨ AI" : "rule"}
                    </span>
                    {e.heard && <span className="text-gray-400">“{e.heard}” </span>}
                    <span className="text-gray-700">→ {e.summary}</span>
                    {/* A DISPUTE is the point of the whole feature: the system
                        said it worked and the human says it did not. Marked
                        here so it is visible while still on screen, not only
                        once the session is opened somewhere else. */}
                    {e.ok && e.verdict === "wrong" && (
                      <span className="ml-1 px-1 rounded bg-red-100 text-red-700 text-[8px] uppercase tracking-wide align-middle"
                        title="Reported success, but you said it did the wrong thing">disputed</span>
                    )}
                  </span>
                </div>

                {debugOn && isSuperAdmin && (
                  <div className="ml-5 mt-0.5 mb-1.5 flex items-center gap-1">
                    {onAnnotate && (["worked", "partly", "wrong"] as const).map((v) => (
                      <button key={v} onClick={() => onAnnotate(e.id, { verdict: e.verdict === v ? undefined : v })}
                        className={`px-1 py-0.5 rounded text-[9px] border ${
                          e.verdict === v
                            ? (v === "worked" ? "bg-green-600 text-white border-green-600"
                              : v === "partly" ? "bg-amber-500 text-white border-amber-500"
                                : "bg-red-600 text-white border-red-600")
                            : "text-gray-500 border-gray-300 hover:bg-gray-50"
                        }`}
                        title={v === "worked" ? "It did what I asked"
                          : v === "partly" ? "It half worked" : "It did the wrong thing"}>{v}</button>
                    ))}
                    {onAnnotate && (
                      <input
                        defaultValue={e.note ?? ""}
                        onBlur={(ev) => onAnnotate(e.id, { note: ev.target.value })}
                        onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                        placeholder="what happened…"
                        className="flex-1 min-w-0 text-[10px] border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    )}
                    {onSnapshot && (
                      <button onClick={() => onSnapshot(e.id)}
                        className={`shrink-0 px-1 py-0.5 rounded text-[9px] border ${e.snapshotId ? "bg-amber-100 border-amber-300 text-amber-700" : "text-gray-500 border-gray-300 hover:bg-gray-50"}`}
                        title={e.snapshotId ? "Snapshot taken for this command — click to replace" : "Take a picture of the canvas for this command"}>📷</button>
                    )}
                  </div>
                )}

                {/* What it actually changed. Only while recording — it is
                    evidence, not decoration, and it would be noise otherwise. */}
                {debugOn && isSuperAdmin && e.touched && e.touched.length > 0 && (
                  <div className="ml-5 mb-1.5 text-[10px] text-gray-400 truncate"
                    title={e.touched.map(describeTouched).join(", ")}>
                    changed: {e.touched.map(describeTouched).join(", ")}
                  </div>
                )}
              </div>
            ))}
            <div ref={logEnd} />
          </div>
        )}

        {/* Live caption + input */}
        <div className="px-3 py-2">
          {listening && interim && (
            <div className="text-[11px] text-purple-400 italic mb-1 truncate">“{interim}”</div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleListen}
              className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white ${listening ? "bg-red-500 hover:bg-red-600" : "bg-purple-600 hover:bg-purple-700"}`}
              title={listening ? "Stop listening" : "Start listening"}
            >
              {listening ? "■" : "🎙"}
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder='Type or say: "add a task called Approve after Review"'
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400"
            />
            <button onClick={submit} disabled={busy} className="shrink-0 text-xs text-white bg-purple-600 hover:bg-purple-700 rounded px-3 py-1.5 disabled:opacity-50">Run</button>
          </div>
        </div>
      </div>
    </>
  );
}
