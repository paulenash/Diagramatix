"use client";

/**
 * SuperAdmin — Process API usage.
 *
 * The screen you open when a partner says "it doesn't work". Every HTTP call is
 * here, including the ones that never reached a handler, and any of them opens
 * into the full request and response.
 *
 * The search box takes a `ref`. That is the whole support story: the partner
 * quotes eight characters from their error, you paste them, and you are on the
 * exact call.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { highlightJson, PEACEFUL } from "@/app/lib/preview/highlight";

interface CallRow {
  id: string; ref: string; at: string; method: string; path: string; status: number;
  durationMs: number; errorCode: string | null; jobId: string | null;
  keyName: string | null; keyPrefix: string | null; phase: string | null;
}
interface KeyRow { id: string; name: string; keyPrefix: string; phase: string }
interface Summary { calls: number; errors: number; p50: number; p95: number }

interface Detail {
  call: CallRow & { ip: string | null; userAgent: string | null; requestBytes: number; responseBytes: number };
  bodies: { requestBody: string | null; responseBody: string | null; requestHeaders: string | null } | null;
  bodiesReason: string | null;
  job: Record<string, unknown> | null;
  ai: { model: string; inputTokens: number; outputTokens: number; latencyMs: number | null; status: string }[];
}

const statusClass = (s: number) =>
  s >= 500 ? "text-red-700 bg-red-50" : s >= 400 ? "text-amber-800 bg-amber-50" : "text-emerald-700 bg-emerald-50";

const time = (s: string) => new Date(s).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Pretty-print JSON with the app's own dependency-free highlighter. */
function Json({ text }: { text: string }) {
  let pretty = text;
  try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* show it raw */ }
  return (
    <pre
      className="text-[11px] leading-relaxed whitespace-pre-wrap break-all font-mono rounded p-3 overflow-auto max-h-80"
      style={{ background: PEACEFUL.bg, color: PEACEFUL.text }}
      dangerouslySetInnerHTML={{ __html: highlightJson(pretty) }}
    />
  );
}

export function PartnerApiClient() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [refQuery, setRefQuery] = useState("");
  const [keyId, setKeyId] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (refQuery.trim()) qs.set("ref", refQuery.trim());
      if (keyId) qs.set("keyId", keyId);
      if (errorsOnly) qs.set("errors", "1");
      const res = await fetch(`/api/admin/partner-api?${qs}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Could not load the traffic"); return; }
      setCalls(j.calls ?? []); setKeys(j.keys ?? []); setSummary(j.summary ?? null); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the traffic");
    } finally { setLoading(false); }
  }, [refQuery, keyId, errorsOnly]);

  useEffect(() => { void load(); }, [load]);

  async function open(id: string) {
    const res = await fetch(`/api/admin/partner-api?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.ok) setDetail(await res.json());
  }

  const errorRate = summary && summary.calls > 0 ? Math.round((summary.errors / summary.calls) * 100) : 0;

  return (
    <div className="max-w-[92rem] mx-auto p-6">
      <Link href="/dashboard/admin" className="text-sm text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      <div className="flex items-baseline justify-between mt-2">
        <h1 className="text-lg font-semibold text-gray-900">Process API usage</h1>
        <Link href="/dashboard/admin/partner-keys" className="text-xs text-teal-700 hover:underline">Manage keys →</Link>
      </div>
      <p className="text-sm text-gray-600 mt-1">
        Every call, including the ones that never reached a handler. Paste a <code className="font-mono text-xs">ref</code> from
        a partner&apos;s error to land on the exact request.
      </p>

      {summary && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Calls today", value: String(summary.calls) },
            { label: "Errors", value: `${summary.errors} (${errorRate}%)`, warn: summary.errors > 0 },
            { label: "p50", value: `${summary.p50} ms` },
            { label: "p95", value: `${summary.p95} ms` },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-gray-200 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">{s.label}</div>
              <div className={`text-lg font-semibold ${s.warn ? "text-amber-700" : "text-gray-900"}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={refQuery} onChange={(e) => setRefQuery(e.target.value)} placeholder="ref (8 characters)"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono w-44" />
        <select value={keyId} onChange={(e) => setKeyId(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white">
          <option value="">All keys</option>
          {keys.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.phase})</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)}
            className="rounded border-gray-300 text-teal-700 focus:ring-teal-400" />
          Errors only
        </label>
        <button onClick={() => void load()} className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          Refresh
        </button>
      </div>

      {error && <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 rounded-lg border border-gray-200 divide-y divide-gray-100">
        {loading ? (
          <p className="px-3 py-3 text-sm text-gray-400">Loading…</p>
        ) : calls.length === 0 ? (
          <p className="px-3 py-3 text-sm text-gray-500">No calls yet.</p>
        ) : calls.map((c) => (
          <button key={c.id} onClick={() => void open(c.id)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-3">
            <span className="text-xs text-gray-400 tabular-nums w-20">{time(c.at)}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded tabular-nums ${statusClass(c.status)}`}>{c.status}</span>
            <span className="text-xs font-medium text-gray-600 w-12">{c.method}</span>
            <span className="flex-1 truncate text-gray-800 font-mono text-xs">{c.path}</span>
            <span className="text-xs text-gray-500 truncate max-w-[10rem]">{c.keyName ?? "—"}</span>
            {c.errorCode && <span className="text-[10px] text-amber-700">{c.errorCode}</span>}
            <span className="text-xs text-gray-400 tabular-nums w-16 text-right">{c.durationMs} ms</span>
            <code className="text-[10px] text-gray-400 font-mono w-16">{c.ref}</code>
          </button>
        ))}
      </div>

      {/* One call, in full */}
      {detail && (
        <div className="fixed inset-0 bg-black/20 flex items-start justify-center z-50 p-6 overflow-y-auto"
          onClick={() => setDetail(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {detail.call.method} {detail.call.path}
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${statusClass(detail.call.status)}`}>{detail.call.status}</span>
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  ref <code className="font-mono">{detail.call.ref}</code> · {detail.call.durationMs} ms ·
                  {" "}{detail.call.keyName ?? "no key"} ({detail.call.phase ?? "—"}) · {detail.call.ip ?? "no ip"}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
            </div>

            <div className="p-4 space-y-4">
              {detail.job && (
                <div className="rounded border border-gray-200 p-3">
                  <h3 className="text-xs font-semibold text-gray-800 mb-1.5">The run</h3>
                  <p className="text-xs text-gray-600">
                    {String(detail.job.status)} · stage {String(detail.job.stage)} · {String(detail.job.model ?? "—")}
                    {detail.ai.length > 0 && (
                      <> · {detail.ai.reduce((t, a) => t + a.inputTokens + a.outputTokens, 0).toLocaleString()} tokens</>
                    )}
                  </p>
                  {detail.job.diagramId ? (
                    <Link href={`/diagram/${String(detail.job.diagramId)}?from=${encodeURIComponent("/dashboard/admin/partner-api")}`}
                      className="text-xs text-teal-700 hover:underline">Open the diagram →</Link>
                  ) : null}
                </div>
              )}

              {detail.bodies ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold text-gray-800 mb-1">Request</h3>
                    <Json text={detail.bodies.requestBody ?? "(empty)"} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-gray-800 mb-1">Response</h3>
                    <Json text={detail.bodies.responseBody ?? "(empty)"} />
                  </div>
                </div>
              ) : (
                // Saying WHY beats an empty panel that looks like a bug.
                <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  <span className="font-medium">Request content was not kept.</span> {detail.bodiesReason}
                  {" "}Sizes and hashes are still recorded: {detail.call.requestBytes} bytes in,{" "}
                  {detail.call.responseBytes} out.
                </div>
              )}

              {detail.job ? (
                <details className="rounded border border-gray-200 p-3">
                  <summary className="text-xs font-semibold text-gray-800 cursor-pointer">The job record</summary>
                  <div className="mt-2"><Json text={JSON.stringify(detail.job)} /></div>
                </details>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
