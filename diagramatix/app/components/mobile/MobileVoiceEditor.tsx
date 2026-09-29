"use client";

/**
 * Voice Assist on the phone (mobile voice stage 5, 2026-09-29): tap the mic and
 * say "add task Check invoice after Receive order"; see it; say "undo that"; or
 * type the command instead.
 *
 * It is the desktop's Voice Assist SESSION (app/hooks/useVoiceSession.ts — the
 * utterance router, the guided flows, the microphone loop, moved out of the
 * editor unedited in stage 4) driving the real useDiagram reducer, autosaved by
 * the shared useAutoSave, drawn by the phone's viewer. The bottom sheet holds
 * what the desktop's floating bar holds: a big mic, a live caption, the current
 * question, a 16 px text box and the command list. Everything a command does is
 * the same code that runs on the desktop; only the surface is new.
 *
 * Kept out of the phone's read-only viewer until asked for (next/dynamic in
 * MobileDiagramScreen) — it carries the whole editing reducer.
 *
 * The view keeps where you put it and follows the last edit; a tap selects (and
 * stands in for the mouse: "here" means the last tap); the element cap and the
 * Voice Assist gate are the desktop's.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDiagram } from "@/app/hooks/useDiagram";
import { useAutoSave } from "@/app/hooks/useAutoSave";
import { useVoiceSession } from "@/app/hooks/useVoiceSession";
import { elementLimitBlock } from "@/app/lib/diagram/elementLimit";
import { thumbnailFrameFor } from "@/app/lib/diagram/templateThumbnail";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import {
  VOICE_EXAMPLES, askedYesNo, chipAction, connectorAt, currentQuestion, elementAt, lastEditedBox, phoneWording, selectionAfterTap,
} from "@/app/lib/mobile/voiceEdit";
import { badgePosition } from "@/app/lib/mobile/badgePlace";
import { keepAwake } from "@/app/lib/mobile/wakeLock";
import { GoldFlashOverlay } from "@/app/components/canvas/GoldFlashOverlay";
import { MobileDiagramView } from "./MobileDiagramView";

/** The useDiagram edit actions the session reads (the same 37 the desktop editor hands it). */
const SESSION_ACTIONS = [
  "addConnector", "addLaneAt", "addPool", "alignElements", "clearDiagram", "compressLane", "compressPool",
  "convertTaskSubprocess", "deleteConnector", "reverseConnector", "deleteElement", "elementsMoveEnd", "expandLane", "extendPools",
  "insertSpace", "laneBoundaryMoveEnd", "moveElements", "moveLane", "moveLaneBoundary", "movePoolTo", "removeSpace",
  "resizeElement", "resizeElementEnd", "setEventBoundary", "splitLaneEven", "splitPoolEven", "swapLane", "swapPools",
  "undo", "unwrapSubprocess", "updateConnectorEndpoint", "updateConnectorLabel", "updateLabel", "updateProperties",
  "wrapInContainer", "wrapInPool", "wrapInSubprocess",
] as const;

export function MobileVoiceEditor({
  diagramId, diagramName, initialData, version, colorConfig, elementCountLimit, onClose,
}: {
  diagramId: string;
  diagramName: string;
  initialData: DiagramData;
  /** The version the phone loaded — autosave's optimistic-concurrency token. */
  version: number;
  colorConfig?: SymbolColorConfig;
  /** The subscription's element cap (null: none). */
  elementCountLimit: number | null;
  /** Done: everything is saved; the screen reloads the diagram. */
  onClose: () => void;
}) {
  const d = useDiagram(initialData);
  const { data } = d;

  // ── the editor's glue for the refs the session reads (DiagramEditor.tsx, line for line) ──
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<string[]>([]);
  selectedIdsRef.current = [...selectedElementIds];
  const elementsRef = useRef(data.elements);
  elementsRef.current = data.elements;
  const connectorsRef = useRef(data.connectors);
  connectorsRef.current = data.connectors;
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const selectedConnectorIdRef = useRef<string | null>(null);
  selectedConnectorIdRef.current = selectedConnectorId;
  const nextStepRef = useRef<{ candidates: never[]; accept: (c: never) => void }>({ candidates: [], accept: () => {} });
  // The template window is the desktop's (a bottom-sheet version is a later stage).
  const openTemplateWindowRef = useRef<(o?: { anchorId?: string; at?: { x: number; y: number } }) => string>(
    () => "The template window isn’t on the phone yet — use the desktop for templates",
  );

  // The element cap, as on the desktop (elementLimit.ts).
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!limitMsg) return;
    const t = setTimeout(() => setLimitMsg(null), 4000);
    return () => clearTimeout(t);
  }, [limitMsg]);
  const addElementGated: typeof d.addElement = (symbolType, position, taskType, eventType, id, initial) => {
    const blocked = elementLimitBlock(data.elements, elementCountLimit, symbolType);
    if (blocked) { setLimitMsg(blocked); return; }
    d.addElement(symbolType, position, taskType, eventType, id, initial);
  };

  // "export the diagram to JSON" downloads the file, as on the desktop.
  const dataRef = useRef(data);
  dataRef.current = data;
  const exportJson = () => {
    try {
      const blob = new Blob([JSON.stringify(dataRef.current, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${diagramName || "diagram"}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch { /* nothing more to do */ }
  };

  // Auto-connect: "add a task" joins the selected / last element (the desktop's toggle; remembered on this phone).
  const [autoConnect, setAutoConnect] = useState(true);
  useEffect(() => { try { if (localStorage.getItem("diagramatix.autoConnect") === "off") setAutoConnect(false); } catch { /* default */ } }, []);
  const toggleAutoConnect = () => setAutoConnect((v) => { try { localStorage.setItem("diagramatix.autoConnect", v ? "off" : "on"); } catch { /* not kept */ } return !v; });

  const actions = Object.fromEntries(SESSION_ACTIONS.map((n) => [n, (d as unknown as Record<string, unknown>)[n]]));
  const session = useVoiceSession({
    ...actions,
    addElementGated,
    data, diagramId, diagramName, diagramType: "bpmn",
    diagramColorConfig: colorConfig ?? {}, displayMode: "normal", riskCatalog: [],
    elementsRef, connectorsRef, selectedIdsRef, selectedConnectorIdRef, nextStepRef, openTemplateWindowRef,
    setSelectedElementIds, setSelectedConnectorId,
    beginLabelEdit: d.beginLabelEdit, cancelLabelEdit: d.cancelLabelEdit,
    beginHistoryGroup: d.beginHistoryGroup, endHistoryGroup: d.endHistoryGroup,
    handleExportJson: exportJson,
    autoConnect,
    phone: true,
  } as never);
  // Voice Assist is on while this screen is (the session turns itself off when a diagram opens).
  const { setVoiceAssistOn } = session;
  useEffect(() => { setVoiceAssistOn(true); }, [setVoiceAssistOn]);

  // ── autosave: the desktop's, unchanged — and it never collapses review comments ──
  const auto = useAutoSave(diagramId, data, 1500, false, version);
  const { conflict, acceptMerge } = auto;
  useEffect(() => {
    if (!conflict) return;
    d.setData(conflict.merged);   // another editor saved first: their changes with ours (theirs win a true overlap)
    acceptMerge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict]);

  // ── the picture: review comments and annotations are the reviewer's overlay, not drawn here ──
  const backdrop = useMemo<DiagramData>(() => {
    const hidden = new Set(data.elements.filter((e) => e.type === "review-comment" || e.type === "text-annotation").map((e) => e.id));
    return {
      ...data,
      elements: data.elements.filter((e) => !hidden.has(e.id)),
      connectors: (data.connectors ?? []).filter((c) => c.type !== "review-comment-link" && !hidden.has(c.sourceId) && !hidden.has(c.targetId)),
    };
  }, [data]);
  const frame = useMemo(() => thumbnailFrameFor(backdrop as never, { trueColors: true, fullLabels: true }), [backdrop]);

  // The view follows the last edit.
  const prevData = useRef<DiagramData | null>(null);
  const [focus, setFocus] = useState<{ box: { x: number; y: number; width: number; height: number } | null; key: number }>({ box: null, key: 0 });
  useEffect(() => {
    const box = lastEditedBox(prevData.current, data);
    prevData.current = data;
    if (box) setFocus((f) => ({ box, key: f.key + 1 }));
  }, [data]);

  // A tap selects, and stands in for the mouse ("here" = the last tap).
  const [multi, setMulti] = useState(false);
  const [mark, setMark] = useState<{ x: number; y: number } | null>(null);
  const onTapView = useCallback((svgX: number, svgY: number) => {
    const x = svgX - frame.tx, y = svgY - frame.ty;
    session.pointerWorld.current = { x, y };
    setMark({ x, y });
    // A connector's line is picked before the element under it (a connector runs across a pool or lane).
    const line = connectorAt(data, x, y);
    if (line) {
      setSelectedConnectorId(selectedConnectorIdRef.current === line.id ? null : line.id);
      setSelectedElementIds(new Set());
      return;
    }
    setSelectedConnectorId(null);
    setSelectedElementIds(new Set(selectionAfterTap(selectedIdsRef.current, elementAt(data, x, y), multi)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.tx, frame.ty, data, multi]);

  const selectedConnector = selectedConnectorId ? data.connectors.find((c) => c.id === selectedConnectorId) ?? null : null;
  // In the order picked: "connect these" joins the first to the second.
  const selectedOrder = [...selectedElementIds].map((id) => data.elements.find((e) => e.id === id)).filter((e): e is DiagramElement => !!e);
  const badges = session.onScreenBadges ?? [];
  const rulers = session.onScreenRulers ?? [];
  const overlay = (zoom: number) => (
    <g>
      {rulers.length > 0 && rulers.map((r, i) => (
        <g key={`ruler-${i}`}>
          {r.ticks.map((y) => (
            <line key={y} x1={r.x + frame.tx - 9 / zoom} y1={y + frame.ty} x2={r.x + frame.tx + 9 / zoom} y2={y + frame.ty} stroke="#16a34a" strokeWidth={3 / zoom} strokeLinecap="round" />
          ))}
        </g>
      ))}
      {session.goldFlash.runId > 0 && (
        <g transform={`translate(${frame.tx}, ${frame.ty})`}><GoldFlashOverlay runId={session.goldFlash.runId} targets={session.goldFlash.targets as never} /></g>
      )}
      {selectedConnector && selectedConnector.waypoints.length > 1 && (
        <polyline points={selectedConnector.waypoints.map((p) => `${p.x + frame.tx},${p.y + frame.ty}`).join(" ")}
          fill="none" stroke="#2563eb" strokeWidth={6 / Math.min(1, zoom)} strokeOpacity={0.45} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {selectedOrder.map((e, i) => selectedOrder.length > 1 && (
        <g key={`order-${e.id}`} transform={`translate(${e.x + frame.tx}, ${e.y + frame.ty}) scale(${1 / zoom})`}>
          <circle r={13} fill="#2563eb" stroke="#ffffff" strokeWidth={2} />
          <text x={0} y={1} fontSize={15} fontWeight={800} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontFamily="sans-serif">{i + 1}</text>
        </g>
      ))}
      {data.elements.filter((e) => selectedElementIds.has(e.id)).map((e) => (
        <rect key={e.id} x={e.x + frame.tx - 3} y={e.y + frame.ty - 3} width={e.width + 6} height={e.height + 6}
          fill="none" stroke="#2563eb" strokeWidth={3} strokeDasharray="8 5" rx={6} />
      ))}
      {mark && <circle cx={mark.x + frame.tx} cy={mark.y + frame.ty} r={9 / Math.min(1, zoom)} fill="#2563eb" fillOpacity={0.25} stroke="#2563eb" strokeWidth={2} />}
      {badges.map((b) => {
        // The green numbers, the desktop's (Canvas.tsx): a constant size on screen, at the item.
        const pos = badgePosition(b, data, zoom);
        const rw = 24 + String(b.n).length * 12;
        return (
          <g key={`badge-${b.n}`} transform={`translate(${pos.x + frame.tx}, ${pos.y + frame.ty}) scale(${1 / zoom})`}>
            <rect x={-rw / 2} y={-15} width={rw} height={30} rx={15} fill="#16a34a" stroke="#ffffff" strokeWidth={2} />
            <text x={0} y={1} fontSize={19} fontWeight={800} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontFamily="sans-serif">{b.n}</text>
          </g>
        );
      })}
    </g>
  );

  // ── the sheet ──
  const [text, setText] = useState("");
  const [showExamples, setShowExamples] = useState(false);
  const lines = session.voiceLog;
  const recent = lines.slice(-3);
  const question = currentQuestion(lines);
  // The same numbers as large chips to tap (the badges can be small or off-screen).
  const flowKind = session.renameFlow ? "rename" : session.messageFlow ? ((session.messageFlow as { mode?: string }).mode === "one" ? "message-one" : "message-pair") : session.pickFlow ? (session.pickFlow.many ? "pick-many" : "pick") : "divider";
  async function tapChip(n: number) {
    const a = chipAction(flowKind, n, text);
    if ("text" in a) { setText(a.text); return; }
    await session.runVoiceCommand(a.run);
  }
  const listening = session.voiceListening;
  // The screen stays on while the mic is open: a phone that sleeps mid-sentence loses the microphone.
  useEffect(() => {
    if (!listening) return;
    const lock = keepAwake();
    return () => lock.release();
  }, [listening]);
  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    await session.runVoiceCommand(t);
  }
  async function done() {
    session.stopAbraListening();
    await auto.saveNow();
    onClose();
  }
  const status = auto.saveStatus === "saving" ? "Saving…" : auto.saveStatus === "unsaved" ? "Unsaved" : "Saved ✓";

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-gray-200 bg-white">
        <button onClick={() => void done()} disabled={auto.saveStatus === "saving"} className="text-blue-600 text-sm font-medium disabled:text-gray-300">‹ Done</button>
        <span className="flex-1 text-sm font-medium text-gray-900 truncate text-center">{diagramName}</span>
        <button onClick={() => d.undo()} className="text-gray-600 text-sm px-1" title="Undo">↶</button>
        <span className={`text-xs w-14 text-right ${auto.saveStatus === "unsaved" ? "text-amber-600" : "text-gray-500"}`}>{status}</span>
      </div>

      <div className="flex-1 relative min-h-0">
        {data.elements.length === 0 && (
          <p className="absolute inset-x-0 top-6 z-10 px-8 text-center text-sm text-gray-500 pointer-events-none">
            A blank canvas. Tap 🎤 and say “add a pool called Customer”.
          </p>
        )}
        <MobileDiagramView data={backdrop} colorConfig={colorConfig} onTapView={onTapView} overlay={overlay}
          keepView focusBox={focus.box} focusKey={focus.key} />
        <button onClick={() => setMulti((m) => !m)}
          className={`absolute top-2 right-2 h-9 px-3 rounded-full text-xs font-medium shadow border ${multi ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-200"}`}>
          {multi ? "Selecting several" : "Select several"}
        </button>
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white px-3 pt-2 pb-3 max-h-[46dvh] overflow-y-auto">
        {limitMsg && <p className="text-[12px] text-amber-800 bg-amber-50 rounded-md px-2 py-1.5 mb-2">{limitMsg}</p>}
        {question && <p className="text-sm font-medium text-blue-800 bg-blue-50 rounded-md px-2.5 py-2 mb-2">{question}</p>}
        {(selectedConnector || selectedOrder.length > 1) && (
          <p className="text-[12px] text-gray-600 mb-2" aria-label="What is selected">
            {selectedConnector
              ? `Selected ${selectedConnector.type === "messageBPMN" ? "message" : "connector"}: ${labelOf(data, selectedConnector.sourceId)} → ${labelOf(data, selectedConnector.targetId)} — say “delete this” or “reverse this”`
              : `Selected in order: ${selectedOrder.map((e) => e.label?.trim() || e.type).join(" → ")} — say “connect these”`}
          </p>
        )}
        {askedYesNo(lines) && (
          <div className="flex gap-2 mb-2">
            <button onClick={() => void session.runVoiceCommand("yes")} className="flex-1 h-11 rounded-lg bg-blue-600 text-white text-sm font-medium active:bg-blue-700">Yes</button>
            <button onClick={() => void session.runVoiceCommand("no")} className="flex-1 h-11 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium active:bg-gray-50">No</button>
          </div>
        )}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2" aria-label="Numbers you can say or tap">
            {badges.map((b) => (
              <button key={b.n} onClick={() => void tapChip(b.n)}
                className="h-10 min-w-[2.5rem] px-2.5 rounded-full bg-green-600 text-white text-sm font-bold active:bg-green-700 max-w-[11rem] truncate">
                {b.n}{b.label ? <span className="font-normal"> · {b.label}</span> : null}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-0.5 mb-2 min-h-[2.5rem]">
          {recent.map((e) => (
            <p key={e.id} className={`text-[13px] leading-snug ${e.ok ? "text-gray-800" : "text-amber-700"}`}>
              {e.heard && <span className="text-gray-400">“{e.heard}” </span>}{phoneWording(e.summary)}
            </p>
          ))}
          {recent.length === 0 && !session.voiceInterim && <p className="text-[13px] text-gray-400">Tap the mic and say what to change.</p>}
        </div>
        {(listening || session.abraConnecting) && (
          <p className="text-[13px] text-gray-500 italic mb-2 min-h-[1.25rem]">
            {session.abraConnecting ? "connecting…" : session.voiceInterim || "listening…"}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => void session.toggleAbraListening()}
            aria-label={listening ? "Stop listening" : "Start listening"}
            className={`h-14 w-14 shrink-0 rounded-full text-2xl flex items-center justify-center shadow ${listening ? "bg-red-50 text-red-600 animate-pulse" : "bg-pink-600 text-white active:bg-pink-700"}`}>
            {listening ? "■" : "🎤"}
          </button>
          <form className="flex-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="send" autoComplete="off" autoCapitalize="off"
              placeholder="or type a command…"
              className="flex-1 min-w-0 text-base border border-gray-300 rounded-lg px-3 h-11 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" disabled={!text.trim() || session.voiceBusy}
              className="h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 active:bg-blue-700">
              {session.voiceBusy ? "…" : "Send"}
            </button>
          </form>
        </div>
        <div className="mt-2 flex items-center gap-4">
          <button onClick={() => setShowExamples((v) => !v)} className="text-[12px] text-blue-600 underline">
            {showExamples ? "Hide examples" : "What can I say?"}
          </button>
          <label className="flex items-center gap-1.5 text-[12px] text-gray-700">
            <input type="checkbox" checked={autoConnect} onChange={toggleAutoConnect} className="h-4 w-4" />
            Auto-connect
          </label>
        </div>
        {showExamples && (
          <ul className="mt-1 space-y-0.5">
            {VOICE_EXAMPLES.map((x) => (
              <li key={x}><button onClick={() => setText(x)} className="text-left text-[13px] text-gray-700 active:text-blue-700">“{x}”</button></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** What an element is called on screen, for the sheet's one-line "selected" note. */
function labelOf(data: DiagramData, id: string): string {
  const e = data.elements.find((x) => x.id === id);
  return e?.label?.trim() || e?.type || "?";
}
