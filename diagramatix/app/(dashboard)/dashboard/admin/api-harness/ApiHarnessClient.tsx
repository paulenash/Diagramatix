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
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  const loadKeys = useCallback(async () => {
    const r = await fetch("/api/admin/partner-keys", { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    const internal: KeyRow[] = (j.keys ?? []).filter((k: { phase: string; revokedAt: string | null }) =>
      k.phase === "internal" && !k.revokedAt);
    setKeys(internal);
    setApiKeyId((cur) => cur || internal[0]?.id || "");
  }, []);

  const loadCases = useCallback(async () => {
    const r = await fetch("/api/admin/api-harness/cases", { cache: "no-store" });
    if (r.ok) setCases((await r.json()).cases ?? []);
  }, []);

  useEffect(() => { void loadKeys(); void loadCases(); }, [loadKeys, loadCases]);
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
      if (!r.ok) { setError(j.error?.message ?? j.error ?? "That call failed"); setRunning(false); return; }
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
        setRunning(false);
        void loadCases();
      } catch {
        setError("Lost contact while polling.");
        setRunning(false);
      }
    }, 2500);
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

            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Process description</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6}
                placeholder="The AP clerk receives the invoice, checks it against the purchase order…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono" />
            </label>

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
              {attachment && (
                <span className="text-xs text-gray-600">
                  {attachment.name} ({attachment.type})
                  <button onClick={clear} className="ml-1.5 text-red-600 hover:underline">remove</button>
                </span>
              )}
              <span className="text-xs text-gray-400">PDF, Word, text or an image of a process</span>
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
                    <a href={result.diagram.deepLink} className="underline font-medium">Open the diagram →</a>
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
