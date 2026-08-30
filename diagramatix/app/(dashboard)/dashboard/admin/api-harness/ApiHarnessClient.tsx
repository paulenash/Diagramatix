"use client";

/**
 * SuperAdmin — the Process API test harness.
 *
 * Submits exactly what a partner's app submits, and shows exactly what comes
 * back. Everything above it in this feature is a contract we otherwise could not
 * exercise: the first real call would be the partner's, and a defect found then
 * costs a round-trip through somebody else's calendar.
 *
 * Two things it does NOT do, deliberately:
 *  - It never holds a key. It posts to a SuperAdmin proxy which attaches one
 *    server-side. A live key in page JavaScript is a burned key.
 *  - It does not shortcut to the library. It calls the real HTTP API, so header
 *    auth, the request log, rate limits, the job table and polling are all
 *    exercised — and its own calls appear in the Usage screen next to a
 *    partner's, which is what you want when comparing "mine works, theirs
 *    doesn't".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFileAttach, ATTACH_ACCEPT } from "@/app/lib/attachments/useFileAttach";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { highlightJson, PEACEFUL } from "@/app/lib/preview/highlight";
import { startDictation, type DictationHandle } from "@/app/lib/dictation";
import { MicTest } from "@/app/components/mobile/MicTest";

interface KeyRow { id: string; name: string; keyPrefix: string; phase: string }
interface CaseRow {
  id: string; name: string; notes: string | null; starred: boolean;
  description: string; hasDocument: boolean; documentName: string | null;
  runCount: number; lastRunAt: string | null;
}
interface Activity {
  no: number; name: string; pool: string | null; lane: string | null;
  taskType: string | null; systems: string[]; inputs: string[]; outputs: string[];
  decision: { question: string } | null;
}
interface Lane { id: string; name: string; sublanes: Lane[] }
interface Pool { id: string; name: string; external: boolean; lanes: Lane[] }
interface SopRow {
  id: string; title: string; diagramId: string; diagramName: string | null;
  projectName: string | null; scopeLabel: string | null;
}
interface Score {
  score: number; summary: string; orderPreserved: boolean; caveat: string;
  matched: { name: string }[]; missing: { name: string }[]; invented: { name: string }[];
  movedLane: { name: string; from: string | null; to: string | null }[];
}
interface Result {
  status: string; stage?: string; jobId: string;
  diagram?: { id: string; name: string; deepLink: string; elementCount: number; connectorCount: number };
  pools?: Pool[]; activities?: Activity[]; roles?: string[];
  warnings?: { code: string; message: string }[];
  error?: { code: string; message: string };
  durationMs?: number | null; model?: string | null;
  diagnostics?: { kind: string; label: string; detail: string }[];
}

export function ApiHarnessClient() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [apiKeyId, setApiKeyId] = useState("");
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [caseFilter, setCaseFilter] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [minutesPerRun, setMinutesPerRun] = useState("");
  const [runsPerMonth, setRunsPerMonth] = useState("");
  const { attachment, setAttachment, attach, clear } = useFileAttach();

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CaseRow | null>(null);
  // The round trip: an SOP of ours goes in, and its SOURCE diagram is the
  // ground truth the result is scored against. That is what turns this screen
  // from a viewer into a measurement.
  const [sops, setSops] = useState<SopRow[]>([]);
  const [sourceDiagramId, setSourceDiagramId] = useState<string | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [scoring, setScoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  // Dictation, on the same shared client the editor uses. A process
  // description is the kind of thing somebody would rather say than type,
  // and this screen exists to make trying an input cheap.
  const [listening, setListening] = useState(false);
  const [dictEngine, setDictEngine] = useState<"deepgram" | "browser" | null>(null);
  const [micTestOpen, setMicTestOpen] = useState(false);
  const dictRef = useRef<DictationHandle | null>(null);
  // startDictation is async (token fetch + permission prompt). A Stop pressed
  // during that window would otherwise be a no-op against a null ref and leave
  // an orphaned live mic when the handle finally arrives.
  const stopRequestedRef = useRef(false);
  const speechSupported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  async function toggleDictation() {
    if (listening) {
      stopRequestedRef.current = true;
      dictRef.current?.stop();
      dictRef.current = null;
      setListening(false); setDictEngine(null);
      return;
    }
    stopRequestedRef.current = false;
    setListening(true); setError(null);
    const handle = await startDictation({
      onText: (text) => setDescription((prev) => {
        const base = prev && !prev.endsWith(" ") && !prev.endsWith("\n") ? prev + " " : prev;
        return base + text;
      }),
      onError: (msg) => setError(msg),
      onEngine: (e) => setDictEngine(e),
      onEnd: () => { dictRef.current = null; setListening(false); setDictEngine(null); },
    });
    if (!handle) { setListening(false); setDictEngine(null); return; }
    if (stopRequestedRef.current) {
      stopRequestedRef.current = false;
      handle.stop();
      setListening(false); setDictEngine(null);
      return;
    }
    dictRef.current = handle;
  }

  // Never leave a mic open behind a closed screen.
  useEffect(() => () => { dictRef.current?.stop(); }, []);

  /**
   * Remember the screen across a trip to a diagram and back.
   *
   * Opening a result navigates away, which remounts this component with empty
   * state — so the run you had just been reading was gone by the time you
   * returned to it. sessionStorage is the right scope: per tab, cleared when
   * the tab closes, and never shared with another viewer.
   *
   * The ATTACHMENT is the one thing that may not fit. A 10 MB document is
   * base64 and the quota is around 5 MB, so a large one is remembered by NAME
   * only and the screen says it needs re-attaching — which is better than a
   * failed write silently losing everything else too.
   */
  const STATE_KEY = "dgx.api-harness.state";
  const ATTACH_LIMIT = 1_500_000;
  const restored = useRef(false);
  const [attachmentDropped, setAttachmentDropped] = useState<string | null>(null);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw_ = sessionStorage.getItem(STATE_KEY);
      if (!raw_) return;
      const v = JSON.parse(raw_);
      if (typeof v.apiKeyId === "string") setApiKeyId(v.apiKeyId);
      if (typeof v.name === "string") setName(v.name);
      if (typeof v.description === "string") setDescription(v.description);
      if (typeof v.minutesPerRun === "string") setMinutesPerRun(v.minutesPerRun);
      if (typeof v.runsPerMonth === "string") setRunsPerMonth(v.runsPerMonth);
      if (v.result) setResult(v.result);
      if (typeof v.raw === "string") setRaw(v.raw);
      if (v.score) setScore(v.score);
      if (typeof v.sourceDiagramId === "string") setSourceDiagramId(v.sourceDiagramId);
      if (v.attachment) setAttachment(v.attachment);
      else if (typeof v.attachmentName === "string") setAttachmentDropped(v.attachmentName);
    } catch { /* a corrupt or blocked store just means a fresh screen */ }
  }, [setAttachment]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      const big = attachment ? attachment.data.length > ATTACH_LIMIT : false;
      sessionStorage.setItem(STATE_KEY, JSON.stringify({
        apiKeyId, name, description, minutesPerRun, runsPerMonth,
        result, raw, score, sourceDiagramId,
        attachment: attachment && !big ? attachment : null,
        attachmentName: attachment ? attachment.name : null,
      }));
    } catch { /* over quota or blocked — the screen still works */ }
  }, [apiKeyId, name, description, minutesPerRun, runsPerMonth, result, raw, score, sourceDiagramId, attachment]);

  const loadKeys = useCallback(async () => {
    const r = await fetch("/api/admin/partner-keys", { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    const internal: KeyRow[] = (j.keys ?? []).filter((k: { phase: string; revokedAt: string | null }) =>
      k.phase === "internal" && !k.revokedAt);
    setKeys(internal);
    // Never stomp a restored selection.
    setApiKeyId((cur) => cur || internal[0]?.id || "");
  }, []);

  const loadCases = useCallback(async () => {
    const r = await fetch("/api/admin/api-harness/cases", { cache: "no-store" });
    if (r.ok) setCases((await r.json()).cases ?? []);
  }, []);

  const loadSops = useCallback(async () => {
    const r = await fetch("/api/admin/api-harness/sops", { cache: "no-store" });
    if (r.ok) setSops((await r.json()).sops ?? []);
  }, []);

  useEffect(() => { void loadKeys(); void loadCases(); void loadSops(); }, [loadKeys, loadCases, loadSops]);
  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);

  async function loadCase(id: string) {
    const r = await fetch(`/api/admin/api-harness/cases?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) return;
    const { case: c } = await r.json();
    setName(c.name ?? "");
    setDescription(c.description ?? "");
    const v = c.volumetrics ?? {};
    setMinutesPerRun(v.minutesPerRun ? String(v.minutesPerRun) : "");
    setRunsPerMonth(v.runsPerMonth ? String(v.runsPerMonth) : "");
    // A stored case keeps its document base64-encoded whatever it is, so a
    // text one is decoded back on the way into the form — the attachment shape
    // holds text as text and everything else as base64.
    if (!c.documentBase64) {
      setAttachment(null);
    } else if ((c.documentType ?? "").startsWith("image/")) {
      setAttachment({ name: c.documentName ?? "document", type: "image", data: c.documentBase64, mediaType: c.documentType });
    } else if (c.documentType === "application/pdf") {
      setAttachment({ name: c.documentName ?? "document", type: "pdf", data: c.documentBase64 });
    } else {
      setAttachment({ name: c.documentName ?? "document", type: "text", data: atob(c.documentBase64) });
    }
    setResult(null); setRaw(null); setError(null);
  }

  /** Load one of our own SOPs as the input. Its prose goes in as a text
   *  attachment — exporting to .docx and back through LibreOffice would test
   *  our exporter, not the API, and costs a soffice spawn per run. */
  async function useSop(sopId: string) {
    const r = await fetch(`/api/admin/api-harness/sops?id=${encodeURIComponent(sopId)}`, { cache: "no-store" });
    if (!r.ok) return;
    const { sop } = await r.json();
    setName(sop.title ?? "");
    setDescription("");
    setAttachment({ name: `${sop.title}.txt`, type: "text", data: sop.text });
    setSourceDiagramId(sop.diagramId ?? null);
    setResult(null); setRaw(null); setScore(null); setError(null);
  }

  async function runScore(resultDiagramId: string) {
    if (!sourceDiagramId) return;
    setScoring(true);
    try {
      const r = await fetch("/api/admin/api-harness/sops", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceDiagramId, resultDiagramId }),
      });
      if (r.ok) setScore(await r.json());
    } finally { setScoring(false); }
  }

  function payload() {
    const volumetrics =
      minutesPerRun || runsPerMonth
        ? {
            minutesPerRun: minutesPerRun ? Number(minutesPerRun) : undefined,
            runsPerMonth: runsPerMonth ? Number(runsPerMonth) : undefined,
            basis: "business",
          }
        : undefined;
    return {
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      document: attachment
        ? {
            filename: attachment.name,
            mediaType: attachment.type === "pdf" ? "application/pdf"
              : attachment.type === "image" ? (attachment as { mediaType?: string }).mediaType
              : "text/plain",
            // A text attachment is already decoded; the API wants base64 either way.
            data: attachment.type === "text" ? btoa(unescape(encodeURIComponent(attachment.data))) : attachment.data,
          }
        : undefined,
      volumetrics,
    };
  }

  async function run() {
    if (running || !apiKeyId) return;
    if (!description.trim() && !attachment) { setError("Give it a description, a document, or both."); return; }
    setRunning(true); setError(null); setResult(null); setRaw(null);
    try {
      const r = await fetch("/api/admin/api-harness/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeyId, payload: payload() }),
      });
      const j = await r.json();
      setRaw(JSON.stringify(j));
      if (!r.ok) {
        setError([j.error?.message ?? j.error ?? "That call failed", j.hint].filter(Boolean).join(" "));
        setRunning(false); return;
      }
      setResult({ status: "queued", jobId: j.jobId });
      poll(j.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That call failed");
      setRunning(false);
    }
  }

  function poll(jobId: string) {
    pollRef.current = window.setTimeout(async () => {
      try {
        const r = await fetch("/api/admin/api-harness/run", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKeyId, jobId }),
        });
        const j = (await r.json()) as Result;
        setRaw(JSON.stringify(j));
        setResult(j);
        if (j.status === "queued" || j.status === "running") { poll(jobId); return; }
        // A run from one of our SOPs is scorable the moment it lands.
        if (j.status === "succeeded" && sourceDiagramId && j.diagram?.id) void runScore(j.diagram.id);
        setRunning(false);
        void loadCases();
      } catch {
        setError("Lost contact while polling.");
        setRunning(false);
      }
      // The interval the contract tells a partner to use — the harness should
      // behave like the client it stands in for, not faster.
    }, 5000);
  }

  async function saveCase() {
    const r = await fetch("/api/admin/api-harness/cases", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || undefined,
        description: description.trim(),
        documentBase64: attachment && attachment.type !== "text" ? attachment.data
          : attachment ? btoa(unescape(encodeURIComponent(attachment.data))) : null,
        documentName: attachment?.name ?? null,
        documentType: attachment?.type === "pdf" ? "application/pdf"
          : attachment?.type === "image" ? (attachment as { mediaType?: string }).mediaType ?? "image/png"
          : attachment ? "text/plain" : null,
        volumetrics: payload().volumetrics ?? {},
      }),
    });
    if (r.ok) void loadCases(); else setError((await r.json().catch(() => ({}))).error ?? "Could not save the case");
  }

  const shown = cases.filter((c) =>
    !caseFilter.trim() || `${c.name} ${c.description}`.toLowerCase().includes(caseFilter.toLowerCase()));

  return (
    <div className="max-w-[92rem] mx-auto p-6">
      <Link href="/dashboard/admin" className="text-sm text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      <div className="flex items-baseline justify-between mt-2">
        <h1 className="text-lg font-semibold text-gray-900">Process API test harness</h1>
        <Link href="/dashboard/admin/partner-api" className="text-xs text-teal-700 hover:underline">See the traffic →</Link>
      </div>
      <p className="text-sm text-gray-600 mt-1">
        Submits exactly what a partner&apos;s app submits, over the real API. Every run appears in
        the usage screen alongside theirs.
      </p>

      {keys.length === 0 && (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No internal-phase key yet. <Link href="/dashboard/admin/partner-keys" className="underline">Mint one</Link>{" "}
          with the phase set to <b>Internal</b> — the harness rotates its secret to use it, which is
          why it will not drive a partner&apos;s key.
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[20rem_1fr] items-start">
        {/* ── The case library ─────────────────────────────────────────── */}
        <section className="rounded-lg border border-gray-200 p-3">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Saved cases</h2>
            <button onClick={() => void saveCase()} disabled={!description.trim() && !attachment}
              className="text-[11px] text-teal-700 hover:underline disabled:opacity-40">Save current</button>
          </div>
          <input value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} placeholder="Filter…"
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs mb-2" />
          <div className="space-y-1 max-h-[28rem] overflow-y-auto">
            {shown.length === 0 ? (
              <p className="text-xs text-gray-500">Nothing saved yet. Run something, then <i>Save current</i>.</p>
            ) : shown.map((c) => (
              <div key={c.id} className="rounded border border-gray-200 px-2 py-1.5 hover:bg-gray-50">
                <button onClick={() => void loadCase(c.id)} className="w-full text-left">
                  <div className="text-xs font-medium text-gray-900 truncate">
                    {c.starred ? "★ " : ""}{c.name}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {c.hasDocument ? `📎 ${c.documentName} · ` : ""}{c.runCount} run{c.runCount === 1 ? "" : "s"}
                  </div>
                </button>
                <div className="flex gap-2 mt-0.5">
                  <button onClick={() => void fetch("/api/admin/api-harness/cases", {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: c.id, starred: !c.starred }),
                  }).then(loadCases)} className="text-[10px] text-gray-500 hover:underline">
                    {c.starred ? "Unstar" : "Star"}
                  </button>
                  <button onClick={() => setConfirmDelete(c)} className="text-[10px] text-red-600 hover:underline">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── The request ──────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Key</span>
                <select value={apiKeyId} onChange={(e) => setApiKeyId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white">
                  {keys.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.keyPrefix}…)</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Process name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Invoice approval"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
              </label>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-medium text-gray-600">Process description</span>
                {speechSupported && (
                  <>
                    <button type="button" onClick={() => void toggleDictation()}
                      className={`rounded-md border px-2 py-0.5 text-xs transition ${
                        listening
                          ? "border-red-400 bg-red-50 text-red-700 animate-pulse"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}>
                      {listening ? "■ Stop" : "🎤 Dictate"}
                    </button>
                    {listening && dictEngine && (
                      <span className="text-[10px] text-gray-500">{dictEngine}</span>
                    )}
                    <button type="button" onClick={() => setMicTestOpen((v) => !v)}
                      className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50">
                      {micTestOpen ? "Hide mic test" : "Test"}
                    </button>
                  </>
                )}
                {description.trim() && (
                  <button type="button" onClick={() => {
                    // Clears the remembered screen too, or the next mount would
                    // restore what was just cleared.
                    setDescription(""); setName(""); setResult(null); setRaw(null);
                    setScore(null); setSourceDiagramId(null); clear(); setAttachmentDropped(null);
                  }}
                    className="ml-auto text-xs text-gray-500 hover:text-gray-700 hover:underline">
                    Clear all
                  </button>
                )}
              </div>
              {micTestOpen && (
                <div className="mb-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                  <MicTest compact />
                </div>
              )}
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6}
                placeholder="The AP clerk receives the invoice, checks it against the purchase order…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono" />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => fileRef.current?.click()}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Attach a document
              </button>
              <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) { const err = await attach(f); if (err) setError(err); else setError(null); }
                  e.target.value = "";
                }} />
              {attachmentDropped && !attachment && (
                <span className="text-xs text-amber-700">
                  “{attachmentDropped}” was too large to remember — attach it again.
                </span>
              )}
              {attachment && (
                <span className="text-xs text-gray-600">
                  {attachment.name} ({attachment.type})
                  <button onClick={clear} className="ml-1.5 text-red-600 hover:underline">remove</button>
                </span>
              )}
              <span className="text-xs text-gray-400">PDF, Word, text or an image of a process</span>
            </div>

            {/* The round trip. One of OUR SOPs has a source diagram, which makes
                the result measurable rather than merely viewable. */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs font-medium text-gray-600">…or use one of our own SOPs:</label>
              <select
                value=""
                onChange={(e) => { if (e.target.value) void useSop(e.target.value); }}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs bg-white max-w-md">
                <option value="">Choose an SOP…</option>
                {sops.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.title}{sp.projectName ? ` · ${sp.projectName}` : ""}
                  </option>
                ))}
              </select>
              {sourceDiagramId && (
                <span className="text-[11px] text-teal-700">
                  scored against its source diagram
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Minutes per run</span>
                <input value={minutesPerRun} onChange={(e) => setMinutesPerRun(e.target.value)} inputMode="numeric"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Runs per month</span>
                <input value={runsPerMonth} onChange={(e) => setRunsPerMonth(e.target.value)} inputMode="numeric"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
              </label>
            </div>

            <button onClick={() => void run()} disabled={running || !apiKeyId}
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">
              {running ? `Running… ${result?.stage ?? ""}` : "▶ Send to the API"}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* ── What came back ─────────────────────────────────────────── */}
          {result && result.status === "succeeded" && (
            <>
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {result.diagram && (
                  <>
                    <b>{result.diagram.elementCount}</b> elements, <b>{result.diagram.connectorCount}</b> connectors
                    {result.durationMs ? ` in ${(result.durationMs / 1000).toFixed(1)}s` : ""}
                    {result.model ? ` · ${result.model}` : ""}
                    {" · "}
                    {/* Our OWN link carries where it came from, so the editor's
                        back button returns here rather than dumping you in the
                        project. The API's deepLink stays clean — that one goes to
                        a partner's customer, who has never seen this screen. */}
                    <a href={`/diagram/${result.diagram.id}?from=${encodeURIComponent("/dashboard/admin/api-harness")}`}
                      className="underline font-medium">Open the diagram →</a>
                  </>
                )}
              </div>

              {!!result.warnings?.length && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {result.warnings.map((w) => <div key={w.code}><b>{w.code}</b> — {w.message}</div>)}
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-3">
                  <h3 className="text-xs font-semibold text-gray-900 mb-2">Pools and lanes</h3>
                  {(result.pools ?? []).map((p) => (
                    <div key={p.id} className="mb-2">
                      <div className="text-xs font-medium text-gray-800">
                        {p.name}{p.external && <span className="ml-1 text-[10px] text-gray-500">(external)</span>}
                      </div>
                      <ul className="ml-3 text-xs text-gray-600">
                        {p.lanes.map((l) => <li key={l.id}>· {l.name}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <h3 className="text-xs font-semibold text-gray-900 mb-2">
                    Activities ({result.activities?.length ?? 0})
                  </h3>
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-xs">
                      <tbody>
                        {(result.activities ?? []).map((a) => (
                          <tr key={a.no} className="border-b border-gray-100">
                            <td className="py-1 pr-2 text-gray-400 tabular-nums align-top">{a.no}</td>
                            <td className="py-1 pr-2 align-top">
                              <div className="text-gray-900">{a.name}</div>
                              <div className="text-[10px] text-gray-500">
                                {a.lane ?? "—"}{a.taskType ? ` · ${a.taskType}` : ""}
                                {a.systems.length ? ` · ${a.systems.join(", ")}` : ""}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {result && result.status === "failed" && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              <b>{result.error?.code}</b> — {result.error?.message}
            </div>
          )}

          {(score || scoring) && (
            <div className="rounded-lg border border-teal-300 bg-teal-50 px-4 py-3">
              <h3 className="text-xs font-semibold text-teal-900 mb-1">
                Round trip — BPMN → SOP → the API → BPMN
              </h3>
              {scoring ? <p className="text-sm text-teal-800">Scoring…</p> : score && (
                <>
                  <p className="text-2xl font-semibold text-teal-900 tabular-nums">{score.score}<span className="text-sm font-normal">/100</span></p>
                  <p className="text-sm text-teal-800">{score.summary}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3 text-xs">
                    <div>
                      <div className="font-medium text-teal-900">Lost ({score.missing.length})</div>
                      <ul className="text-teal-800">{score.missing.slice(0, 8).map((m) => <li key={m.name}>· {m.name}</li>)}</ul>
                    </div>
                    <div>
                      <div className="font-medium text-teal-900">Invented ({score.invented.length})</div>
                      <ul className="text-teal-800">{score.invented.slice(0, 8).map((m) => <li key={m.name}>· {m.name}</li>)}</ul>
                    </div>
                    <div>
                      <div className="font-medium text-teal-900">Changed lane ({score.movedLane.length})</div>
                      <ul className="text-teal-800">{score.movedLane.slice(0, 8).map((m) => <li key={m.name}>· {m.name}</li>)}</ul>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-teal-700">{score.caveat}</p>
                </>
              )}
            </div>
          )}

          {raw && (
            <details className="rounded-lg border border-gray-200">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-800">
                The raw response — what a partner actually receives
              </summary>
              <div className="p-3">
                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-all font-mono rounded p-3 overflow-auto max-h-96"
                  style={{ background: PEACEFUL.bg, color: PEACEFUL.text }}
                  dangerouslySetInnerHTML={{
                    __html: highlightJson((() => { try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; } })()),
                  }} />
              </div>
            </details>
          )}
        </section>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.name}"?`}
          message="The saved input goes with it. Runs it produced are not affected."
          confirmLabel="Delete"
          onConfirm={() => {
            const id = confirmDelete.id; setConfirmDelete(null);
            void fetch(`/api/admin/api-harness/cases?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(loadCases);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
