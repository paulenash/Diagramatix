"use client";

/**
 * Repository Master Template and .md Upload — the other end of "Create Project
 * Diagrams from .md": edit the master templates, and write prompts INTO a chain.
 *
 * That tool CONSUMES the prompt blocks inside a Process Repository document; this
 * one WRITES them, from the chain's narrative and an editable master template per
 * diagram type. Upload the `.md`, pick a chain and which diagram types you want,
 * and the finished blocks come back ready to paste into the document.
 *
 * THE COLUMN THAT MATTERS IS "PARSES". Every generated block is read straight
 * back through `parseValueChainMd` — the same function the batch runner uses —
 * before it appears here. A prompt that reads perfectly but the batch tool cannot
 * find is worse than no prompt at all, because the failure would otherwise only
 * surface when someone asked for 140 diagrams.
 *
 * The templates themselves are edited in the Rules editor, under the five
 * "Repository Prompt — …" categories: a read-only built-in that ships with the
 * app, plus your own additions. Change the additions, regenerate one prompt, and
 * the difference is visible immediately — which is the point of the whole thing.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MD_PROMPT_TYPES, MD_PROMPT_LABEL, MD_PROMPT_TEMPLATE_HISTORY,
  latestTemplateVersion, mdPromptCategory, type MdPromptType,
} from "@/app/lib/valueChain/promptTemplates";

interface ChainInfo { code: string; title: string; subprocesses: number; narrativeChars: number }

interface Row {
  index: number;
  code: string;
  title: string;
  type: MdPromptType;
  status: "generating" | "done" | "error";
  block?: string;
  roundTrips?: boolean;
  message?: string;
  ms?: number;
}

export function MdPromptsClient() {
  const [md, setMd] = useState("");
  const [fileName, setFileName] = useState("");
  const [chains, setChains] = useState<ChainInfo[]>([]);
  const [selected, setSelected] = useState("");
  const [types, setTypes] = useState<MdPromptType[]>([...MD_PROMPT_TYPES]);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ written: number; failed: number; roundTripFailures: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Which template's change history is on show. */
  const [historyType, setHistoryType] = useState<MdPromptType>("bpmn");

  const chain = useMemo(() => chains.find((c) => c.code === selected) ?? null, [chains, selected]);

  /** How many prompts the current selection would produce — the cost, up front. */
  const plannedCount = useMemo(() => {
    if (!chain) return 0;
    const chainLevel = types.filter((t) => t !== "bpmn").length;
    return chainLevel + (types.includes("bpmn") ? chain.subprocesses : 0);
  }, [chain, types]);

  const onFile = useCallback(async (file: File) => {
    setError(null); setRows([]); setSummary(null); setChains([]); setSelected("");
    const text = await file.text();
    setMd(text);
    setFileName(file.name);
    try {
      const res = await fetch("/api/admin/md-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "inspect", md: text }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? `Could not read that file (${res.status})`); return; }
      setChains(j.chains ?? []);
      if (j.chains?.length === 1) setSelected(j.chains[0].code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file");
    }
  }, []);

  const run = useCallback(async () => {
    if (!chain || running || types.length === 0) return;
    setRunning(true); setError(null); setRows([]); setSummary(null); setCopied(false);
    try {
      const res = await fetch("/api/admin/md-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ md, chainCode: chain.code, types }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Generation failed (${res.status})`);
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg: Record<string, unknown>;
          try { msg = JSON.parse(line); } catch { continue; }
          handle(msg);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setRunning(false);
    }
  }, [chain, running, md, types]);

  function handle(msg: Record<string, unknown>) {
    if (msg.t === "error") { setError(String(msg.message ?? "Failed")); return; }
    if (msg.t === "done") {
      setSummary({
        written: Number(msg.written ?? 0),
        failed: Number(msg.failed ?? 0),
        roundTripFailures: Number(msg.roundTripFailures ?? 0),
      });
      return;
    }
    if (msg.t !== "prompt") return;
    const row: Row = {
      index: Number(msg.index),
      code: String(msg.code),
      title: String(msg.title),
      type: msg.type as MdPromptType,
      status: msg.status as Row["status"],
      block: typeof msg.block === "string" ? msg.block : undefined,
      roundTrips: typeof msg.roundTrips === "boolean" ? msg.roundTrips : undefined,
      message: typeof msg.message === "string" ? msg.message : undefined,
      ms: typeof msg.ms === "number" ? msg.ms : undefined,
    };
    setRows((r) => {
      const at = r.findIndex((x) => x.index === row.index);
      if (at === -1) return [...r, row];
      const next = [...r]; next[at] = row; return next;
    });
  }

  /** Everything generated, in document order, ready to paste. */
  const assembled = useMemo(() => {
    const done = rows.filter((r) => r.status === "done" && r.block);
    if (done.length === 0) return "";
    return done.map((r) => {
      const heading = r.type === "bpmn" ? `### ${r.code} — ${r.title}\n\n` : "";
      return `${heading}${r.block}`;
    }).join("\n\n");
  }, [rows]);

  const download = useCallback(() => {
    const blob = new Blob([assembled], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chain?.code ?? "chain"}-prompts.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [assembled, chain]);

  const toggleType = (t: MdPromptType) =>
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 underline">← SuperAdmin</Link>
        <h1 className="text-lg font-semibold text-gray-900">Repository Master Template and .md Upload</h1>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-4">
        {/* The master templates are the more consequential half of this screen —
            they decide what EVERY generated prompt says — and they were a small
            underlined link in the header, easy to miss entirely. Paul,
            2026-09-05: "improve the visibility of Edit the Master Templates to a
            tile". Given its own card, above the upload, because editing the
            template is what you come here to do most often. */}
        <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">The master templates</h2>
          <p className="text-[11px] text-gray-500 mb-3">
            One per diagram type — the house standard every generated prompt is written to.
            A change here reaches every prompt regenerated afterwards, and nothing before it.
          </p>

          {/* Which type's history is on show. Master prompt templates only —
              the Rules editor carries other categories, and mixing them here
              would make "when did the template change" unanswerable. */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {MD_PROMPT_TYPES.map((t) => (
              <button key={t} onClick={() => setHistoryType(t)}
                className={"px-2 py-1 rounded border text-[11px] "
                  + (historyType === t
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50")}>
                {MD_PROMPT_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-xs text-gray-800">
              <b>v{latestTemplateVersion(historyType).version}</b>
              <span className="text-gray-500"> · last changed {latestTemplateVersion(historyType).at}</span>
            </span>
            <Link href={`/dashboard/rules?category=${mdPromptCategory(historyType)}`}
              className="ml-auto px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
              Edit the master templates →
            </Link>
          </div>

          {/* The history. Newest first, because "what changed most recently" is
              the question being asked — a prompt generated before that date is
              working to a standard that has moved. */}
          <details className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-medium text-gray-700">
              {MD_PROMPT_TEMPLATE_HISTORY[historyType].length} change{MD_PROMPT_TEMPLATE_HISTORY[historyType].length === 1 ? "" : "s"} to the {MD_PROMPT_LABEL[historyType]} template
            </summary>
            <ol className="mt-2 space-y-1.5">
              {[...MD_PROMPT_TEMPLATE_HISTORY[historyType]].reverse().map((v) => (
                <li key={v.version} className="text-[11px] text-gray-700">
                  <span className="font-medium text-gray-900">v{v.version}</span>
                  <span className="text-gray-500"> · {v.at} · {v.commit}</span>
                  <div className="text-gray-600">{v.description}</div>
                </li>
              ))}
            </ol>
          </details>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Upload Value Chain .md File</h2>
          <p className="text-[11px] text-gray-500 mb-3">
            A Process Repository markdown. The chain&rsquo;s seven-part narrative is what the prompts are
            written from — any prompt blocks already in the file are stripped out first, so a template
            change genuinely shows up instead of the model copying what is already there.
          </p>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".md,text/markdown,text/plain" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            <button onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
              Choose a .md file
            </button>
            {fileName && (
              <span className="text-xs text-gray-700">
                {fileName} · <span className="text-gray-500">{(md.length / 1024).toFixed(0)} KB · {chains.length} chain{chains.length === 1 ? "" : "s"}</span>
              </span>
            )}
          </div>
        </section>

        {chains.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">The chain</h2>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 mb-4">
              {chains.map((c) => (
                <button key={c.code} onClick={() => setSelected(c.code)} disabled={running}
                  className={"text-left px-3 py-2 rounded border transition-colors disabled:opacity-50 " +
                    (selected === c.code ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white hover:border-blue-300")}>
                  <span className="block text-xs font-medium text-gray-900">{c.code} — {c.title}</span>
                  <span className="block text-[11px] text-gray-500">
                    {c.subprocesses} subprocess{c.subprocesses === 1 ? "" : "es"} ·{" "}
                    {c.narrativeChars > 0
                      ? `${(c.narrativeChars / 1024).toFixed(1)} KB of narrative`
                      : <span className="text-amber-700">no narrative — nothing to generate from</span>}
                  </span>
                </button>
              ))}
            </div>

            <h2 className="text-sm font-semibold text-gray-900 mb-2">Diagram types</h2>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {MD_PROMPT_TYPES.map((t) => (
                <button key={t} onClick={() => toggleType(t)} disabled={running}
                  className={"px-2.5 py-1.5 rounded border text-xs transition-colors disabled:opacity-50 " +
                    (types.includes(t) ? "border-blue-500 bg-blue-50 text-blue-900" : "border-gray-300 bg-white text-gray-600 hover:border-blue-300")}>
                  {MD_PROMPT_LABEL[t]}
                  {t === "bpmn" && chain && <span className="text-gray-400"> ×{chain.subprocesses}</span>}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={run} disabled={running || !chain || plannedCount === 0 || (chain?.narrativeChars ?? 0) === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300">
                {running ? "Generating…" : `Generate ${plannedCount} prompt${plannedCount === 1 ? "" : "s"}`}
              </button>
              {plannedCount > 0 && !running && (
                <span className="text-[11px] text-gray-500">
                  {plannedCount} AI call{plannedCount === 1 ? "" : "s"}, one per prompt.
                </span>
              )}
            </div>
            {error && <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-300 rounded px-2.5 py-1.5">{error}</p>}
          </section>
        )}

        {rows.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900">Prompts</h2>
              <span className="text-[11px] text-gray-500">
                {rows.filter((r) => r.status === "done").length} of {rows.length} done
              </span>
            </div>

            {summary && (
              <p className={"text-xs rounded px-2.5 py-1.5 mb-3 border " +
                (summary.failed === 0 && summary.roundTripFailures === 0
                  ? "text-green-900 bg-green-50 border-green-300"
                  : "text-amber-900 bg-amber-50 border-amber-300")}>
                <strong>{summary.written} written</strong>
                {summary.failed > 0 && <>, {summary.failed} failed</>}
                {summary.roundTripFailures > 0
                  ? <>, and <strong>{summary.roundTripFailures} did not parse back</strong> — those blocks would be invisible to the batch tool. Regenerate them, or fix the template.</>
                  : <> — every block parses back through the same reader the batch tool uses.</>}
              </p>
            )}

            <table className="w-full text-[11px] mb-3">
              <thead>
                <tr className="text-gray-500 uppercase tracking-wide text-[10px] border-b border-gray-200">
                  <th className="text-left font-semibold pb-1">Diagram</th>
                  <th className="text-left font-semibold pb-1">Type</th>
                  <th className="text-left font-semibold pb-1" title="Whether the generated block parses back through parseValueChainMd — the reader the batch tool uses">Parses</th>
                  <th className="text-right font-semibold pb-1">Size</th>
                  <th className="text-right font-semibold pb-1">Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.index} className="border-b border-gray-100 align-top">
                    <td className="py-1 pr-2">
                      <span className="font-medium text-gray-900">{r.code}</span>{" "}
                      <span className="text-gray-600">{r.title}</span>
                      {r.status === "error" && <span className="block text-red-700">{r.message}</span>}
                    </td>
                    <td className="py-1 pr-2 text-gray-600">{MD_PROMPT_LABEL[r.type]}</td>
                    <td className="py-1 pr-2">
                      {r.status === "generating" ? <span className="text-gray-400">…</span>
                        : r.status === "error" ? <span className="text-red-700 font-semibold">failed</span>
                        : r.roundTrips ? <span className="text-green-700 font-semibold">yes</span>
                        : <span className="text-red-700 font-semibold">NO</span>}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-gray-500">
                      {r.block ? `${r.block.length.toLocaleString()} ch` : "—"}
                    </td>
                    <td className="py-1 text-right tabular-nums text-gray-500">{r.ms ? `${(r.ms / 1000).toFixed(1)}s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {assembled && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => { void navigator.clipboard.writeText(assembled); setCopied(true); }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
                    {copied ? "Copied" : "Copy all"}
                  </button>
                  <button onClick={download}
                    className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
                    Download .md
                  </button>
                  <span className="text-[11px] text-gray-500">
                    Paste into the chain&rsquo;s section, replacing the prompt blocks that are there.
                  </span>
                </div>
                <pre className="text-[11px] font-mono whitespace-pre-wrap border border-gray-200 rounded p-3 max-h-[32rem] overflow-y-auto bg-gray-50 text-gray-800 leading-relaxed">
                  {assembled}
                </pre>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
