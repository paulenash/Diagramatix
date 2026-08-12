"use client";

import { useEffect, useRef, useState } from "react";
import type { LogMapping } from "@/app/lib/mining/types";

interface Batch { label: string; note: string; events: Record<string, string>[] }
interface Demo { name: string; headers: string[]; mapping: LogMapping; batches: Batch[] }

/**
 * Live-source demo control (shown after adopting the "Order Processing — live"
 * example, via the `mining-livedemo:<projectId>` sessionStorage hand-off). Each
 * "Simulate next poll" provisions a REAL webhook MiningSource on the first click,
 * then ingests the next batch through the real ingest endpoint and forces a refresh
 * — so the run grows in place exactly as a scheduled poller would drive it. Calls
 * `onPolled(runId)` so the console reloads + selects the live run to watch it fill in.
 */
export function LiveDemoPanel({ projectId, onPolled }: { projectId: string; onPolled: (runId: string | null) => void }) {
  const [demo, setDemo] = useState<Demo | null>(null);
  const [pollIdx, setPollIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const srcRef = useRef<{ id: string; key: string; runId: string | null } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`mining-livedemo:${projectId}`);
      if (raw) { sessionStorage.removeItem(`mining-livedemo:${projectId}`); setDemo(JSON.parse(raw) as Demo); }
    } catch { /* ignore */ }
  }, [projectId]);

  if (!demo) return null;
  const total = demo.batches.length;
  const done = pollIdx >= total;
  const next = demo.batches[pollIdx];

  async function nextPoll() {
    if (busy || done || !demo) return;
    setBusy(true); setErr(null);
    try {
      // 1. Provision the real webhook source + empty run on the first poll.
      if (!srcRef.current) {
        const r = await fetch(`/api/projects/${projectId}/mining/sources`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Order feed (webhook)", kind: "webhook", mapping: demo.mapping }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.source?.id || !j.key) throw new Error(j.error ?? "Could not create the live source");
        srcRef.current = { id: j.source.id, key: j.key, runId: j.source.runId ?? null };
      }
      const src = srcRef.current!;
      // 2. Ingest this poll's batch through the real ingest endpoint.
      const ig = await fetch(`/api/mining/ingest/${src.id}`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Api-Key": src.key },
        body: JSON.stringify(demo.batches[pollIdx].events),
      });
      if (!ig.ok) throw new Error((await ig.json().catch(() => ({}))).error ?? "Ingest failed");
      // 3. Force a refresh (bypasses the 60s webhook debounce) so the run rebuilds now.
      await fetch(`/api/projects/${projectId}/mining/sources/${src.id}/refresh`, { method: "POST" }).catch(() => {});
      setPollIdx((n) => n + 1);
      onPolled(src.runId);
    } catch (e) { setErr(e instanceof Error ? e.message : "Poll failed"); }
    finally { setBusy(false); }
  }

  return (
    <section className="md:col-span-2 bg-stone-900 border border-amber-700/60 rounded-lg p-4 shadow-[0_0_18px_rgba(217,119,6,0.15)]">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-amber-200">🛰 Live-source demo — {demo.name} <span className="text-[11px] font-normal text-stone-400">— simulate real-time polling</span></h2>
        <span className="text-[11px] text-stone-400 tabular-nums">poll {Math.min(pollIdx, total)}/{total}</span>
      </div>
      <p className="text-[11px] text-stone-400 mb-2">Each poll ingests the next batch of events into a real webhook source and refreshes the run — watch the discovered process, variants and bottlenecks grow. The live run appears on the right; keep it selected to see the map fill in.</p>
      <div className="flex items-center gap-1 mb-2">
        {demo.batches.map((b, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded ${i < pollIdx ? "bg-emerald-500" : "bg-stone-700"}`} title={`${b.label} — ${b.note}`} />
        ))}
      </div>
      {err && <p className="text-[11px] text-red-400 mb-2">{err}</p>}
      {done ? (
        <p className="text-[11px] text-emerald-300">✓ All {total} polls ingested — the full process is mined. The webhook source stays live in “Live sources” below; use “Refresh now” or POST more events to it, or re-adopt the example to replay.</p>
      ) : (
        <div className="flex flex-col gap-1">
          <button onClick={nextPoll} disabled={busy} className="self-start text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded px-3 py-1.5">
            {busy ? "Polling…" : `▶ Simulate next poll — ${next.label}`}
          </button>
          <span className="text-[10px] text-stone-500">{next.note}</span>
        </div>
      )}
    </section>
  );
}
