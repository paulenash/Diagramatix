"use client";

/**
 * Process Repository — the value-chain library, and everything you can do to it.
 *
 * The repository used to be a 500 KB markdown file uploaded by hand. It lives
 * here now: 26 chains, their ordered processes, and the diagram prompts generated
 * from the master templates. The `.md` is still the interchange format — import
 * it to seed or restate a chain, export it to diff or archive.
 *
 * DRAFT AND PUBLISHED ARE DIFFERENT THINGS, and the screen says which you are
 * looking at. Everything edited here is a draft; project generation reads only
 * the published snapshot. So a chain can be rewritten, its processes reordered
 * and its prompts regenerated without anything downstream seeing a half-finished
 * state — until Publish.
 *
 * The one operation with a sharp edge is editing processes: removing one deletes
 * its BPMN prompt (a prompt for a process that no longer exists would generate a
 * diagram nothing links to), and the remaining codes renumber. That is safe to do
 * casually only because prompt cross-references are by NAME, not by code — so
 * renumbering cannot leave a neighbour quoting something that moved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MD_PROMPT_TYPES, MD_PROMPT_LABEL, type MdPromptType } from "@/app/lib/valueChain/promptTemplates";
import { tonesFor } from "@/app/lib/theme/featureColors";
import { useFeatureColors } from "@/app/lib/theme/useFeatureColors";

interface Process { id: string; code: string; title: string; sortOrder: number }
interface Prompt {
  id: string; type: MdPromptType; processCode: string; name: string;
  prompt: string; chars: number; roundTripsOk: boolean; generatedAt: string | null; published: boolean;
  /** Gateway branches that never say where they go. 0 is the healthy value. */
  unterminatedBranches: number;
}
interface Chain {
  id: string; code: string; title: string; groupName: string; hidden: boolean; sortOrder: number;
  narrative: string; published: boolean; publishedAt: string | null; dirty: boolean;
  processes: Process[]; prompts: Prompt[];
}

type Row = { index: number; name: string; type: MdPromptType; status: string; message?: string; chars?: number; ms?: number; roundTrips?: boolean };

export function ValueChainLibraryClient() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [genTypes, setGenTypes] = useState<MdPromptType[]>([...MD_PROMPT_TYPES]);
  const fileRef = useRef<HTMLInputElement>(null);

  const scheme = useFeatureColors();
  const tone = tonesFor(scheme, "processRepository");

  const chain = useMemo(() => chains.find((c) => c.id === selected) ?? null, [chains, selected]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/value-chain-library");
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Could not load the library"); return; }
      setChains(j.chains ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the library");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = useCallback(async (payload: Record<string, unknown>, okNote?: string) => {
    setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/admin/value-chain-library", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? `Failed (${res.status})`); return null; }
      if (okNote) setNote(okNote);
      await load();
      return j;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      return null;
    } finally { setBusy(false); }
  }, [load]);

  const onImport = useCallback(async (file: File, replace: boolean) => {
    const md = await file.text();
    const j = await post({ action: "import", md, replace },
      undefined) as { created?: number; updated?: number; prompts?: number; skipped?: number } | null;
    if (j) setNote(`Imported — ${j.created ?? 0} new chain(s), ${j.updated ?? 0} replaced, ${j.prompts ?? 0} prompt(s)${j.skipped ? `, ${j.skipped} left alone (already present)` : ""}.`);
  }, [post]);

  /** Regenerate, streaming progress the way the other AI tools do. */
  const regenerate = useCallback(async (code: string, types: MdPromptType[], processCode?: string) => {
    if (busy) return;
    setBusy(true); setError(null); setNote(null); setRows([]);
    try {
      const res = await fetch("/api/admin/value-chain-library", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate", code, types, processCode }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Regeneration failed (${res.status})`);
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
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          let m: Record<string, unknown>;
          try { m = JSON.parse(line); } catch { continue; }
          if (m.t === "prompt") {
            const row: Row = {
              index: Number(m.index), name: String(m.name), type: m.type as MdPromptType,
              status: String(m.status), message: m.message as string | undefined,
              chars: m.chars as number | undefined, ms: m.ms as number | undefined,
              roundTrips: m.roundTrips as boolean | undefined,
            };
            setRows((r) => { const at = r.findIndex((x) => x.index === row.index); if (at === -1) return [...r, row]; const n = [...r]; n[at] = row; return n; });
          } else if (m.t === "done") {
            const refused = Number(m.refused ?? 0);
            setNote(`${m.written} prompt(s) written${m.failed ? `, ${m.failed} failed` : ""}${refused ? `, ${refused} REFUSED for asking a loop-back` : ""}.`);
          }
        }
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regeneration failed");
    } finally { setBusy(false); }
  }, [busy, load]);

  const totals = useMemo(() => ({
    chains: chains.length,
    published: chains.filter((c) => c.published).length,
    dirty: chains.filter((c) => c.dirty).length,
    processes: chains.reduce((t, c) => t + c.processes.length, 0),
    prompts: chains.reduce((t, c) => t + c.prompts.length, 0),
  }), [chains]);

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 underline">← SuperAdmin</Link>
        <h1 className="text-lg font-semibold text-gray-900">Process Repository</h1>
        <span className="text-xs text-gray-500">
          {totals.chains} chains · {totals.processes} processes · {totals.prompts} prompts ·{" "}
          <strong>{totals.published} published</strong>
          {totals.dirty > 0 && <> · <span className="text-amber-700">{totals.dirty} with unpublished edits</span></>}
        </span>
        <a href="/api/admin/value-chain-library?format=md" className="ml-auto text-xs text-blue-600 hover:text-blue-800 underline">
          Export the whole library as .md
        </a>
      </header>

      <main className="max-w-[100rem] mx-auto p-6 grid gap-5 lg:grid-cols-[22rem_1fr] items-start">
        {/* ── Chains ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Import</h2>
            <p className="text-[11px] text-gray-500 mb-2">
              Seed the library from a Process Repository markdown file. A chain already here is
              left alone unless you choose Replace — an import restates a chain wholesale rather
              than merging, since a half-merged chain would be worse than either version.
            </p>
            <input ref={fileRef} type="file" accept=".md,text/markdown,text/plain" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f, (e.target as HTMLInputElement).dataset.replace === "1"); e.currentTarget.value = ""; }} />
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => { if (fileRef.current) { fileRef.current.dataset.replace = "0"; fileRef.current.click(); } }}
                className="px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50"
                style={{ background: tone.bg, color: tone.text }}>
                Import new chains
              </button>
              <button disabled={busy} onClick={() => { if (fileRef.current) { fileRef.current.dataset.replace = "1"; fileRef.current.click(); } }}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
                Import &amp; replace
              </button>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900">Value chains</h2>
              <button disabled={busy || chains.length === 0}
                onClick={() => void post({ action: "publish" }, "Every chain published.")}
                className="text-[11px] underline text-blue-600 hover:text-blue-800 disabled:opacity-40">
                Publish all
              </button>
            </div>
            {loading ? <p className="text-xs text-gray-500">Loading…</p>
              : chains.length === 0 ? <p className="text-xs text-gray-500">Nothing here yet — import a .md to seed the library.</p>
              : (
                <ul className="space-y-1 max-h-[34rem] overflow-y-auto">
                  {chains.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => { setSelected(c.id); setRows([]); }}
                        className={"w-full text-left px-2.5 py-1.5 rounded border transition-colors "
                          + (selected === c.id ? "border-transparent" : "border-gray-200 bg-white hover:border-gray-300")}
                        style={selected === c.id ? { background: tone.bg, borderColor: tone.text } : undefined}>
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-semibold" style={{ color: selected === c.id ? tone.text : undefined }}>{c.code}</span>
                          <span className="text-xs text-gray-800 flex-1 truncate">{c.title}</span>
                          {c.dirty && <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-800">draft</span>}
                          {c.published && !c.dirty && <span className="text-[9px] px-1 rounded bg-green-100 text-green-800">live</span>}
                        </span>
                        <span className="block text-[10px] text-gray-500">
                          {c.processes.length} processes · {c.prompts.length} prompts
                          {c.groupName && ` · ${c.groupName}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </div>

        {/* ── The selected chain ─────────────────────────────────── */}
        <div className="space-y-4">
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-300 rounded px-3 py-2">{error}</p>}
          {note && <p className="text-xs text-green-800 bg-green-50 border border-green-300 rounded px-3 py-2">{note}</p>}

          {!chain ? (
            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <p className="text-sm text-gray-600">Pick a value chain to edit it.</p>
            </section>
          ) : (
            <>
              <ChainEditor chain={chain} busy={busy} tone={tone}
                onSave={(patch) => void post({ action: "save-chain", id: chain.id, ...patch }, "Saved.")}
                onPublish={() => void post({ action: "publish", code: chain.code }, `${chain.code} published.`)}
                onUnpublish={() => void post({ action: "unpublish", code: chain.code }, `${chain.code} withdrawn.`)}
                onDelete={() => void post({ action: "delete-chain", id: chain.id }, `${chain.code} deleted.`).then(() => setSelected(""))}
              />
              <ProcessEditor chain={chain} busy={busy} tone={tone}
                onSave={(processes) => void post({ action: "save-processes", chainId: chain.id, processes }, "Processes saved and renumbered.")}
              />
              <PromptPanel chain={chain} busy={busy} rows={rows} tone={tone}
                genTypes={genTypes} setGenTypes={setGenTypes}
                onRegenerate={(types, processCode) => void regenerate(chain.code, types, processCode)}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ChainEditor({ chain, busy, tone, onSave, onPublish, onUnpublish, onDelete }: {
  chain: Chain; busy: boolean; tone: { bg: string; text: string };
  onSave: (p: Record<string, unknown>) => void;
  onPublish: () => void; onUnpublish: () => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(chain.title);
  const [groupName, setGroupName] = useState(chain.groupName);
  const [narrative, setNarrative] = useState(chain.narrative);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setTitle(chain.title); setGroupName(chain.groupName); setNarrative(chain.narrative); setConfirmDelete(false); }, [chain.id, chain.title, chain.groupName, chain.narrative]);
  const dirty = title !== chain.title || groupName !== chain.groupName || narrative !== chain.narrative;

  return (
    <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-900">{chain.code}</h2>
        {chain.published
          ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">published {new Date(chain.publishedAt!).toLocaleDateString()}</span>
          : <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">never published</span>}
        {chain.dirty && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">unpublished edits</span>}
        <div className="ml-auto flex gap-2">
          <a href={`/api/admin/value-chain-library?format=md&code=${chain.code}`}
            className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">Export .md</a>
          {chain.published && (
            <button disabled={busy} onClick={onUnpublish}
              className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">Withdraw</button>
          )}
          <button disabled={busy} onClick={onPublish}
            className="px-3 py-1 text-xs font-medium rounded disabled:opacity-50"
            style={{ background: tone.bg, color: tone.text }}>
            Publish
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5" />
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Group</span>
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Customer-facing"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5" />
        </label>
      </div>

      <label className="block">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
          Narrative — what every prompt for this chain is generated from
        </span>
        <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={14}
          className="w-full font-mono text-[11px] border border-gray-300 rounded p-2 leading-relaxed" />
      </label>

      <div className="flex items-center gap-2 mt-3">
        <button disabled={busy || !dirty} onClick={() => onSave({ title, groupName, narrative })}
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300">
          Save
        </button>
        {dirty && <span className="text-[11px] text-amber-700">unsaved changes</span>}
        <button disabled={busy} onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          className={"ml-auto px-2.5 py-1.5 text-xs rounded border disabled:opacity-50 "
            + (confirmDelete ? "border-red-500 bg-red-50 text-red-700" : "border-gray-300 hover:bg-gray-50 text-gray-600")}>
          {confirmDelete ? "Delete this chain — click again" : "Delete chain"}
        </button>
      </div>
    </section>
  );
}

/**
 * Add, rename, reorder and remove processes.
 *
 * Saving renumbers everything to `Vnn.01`, `.02`, … in the order shown, and moves
 * each BPMN prompt with its process. Removing a process deletes its prompt — kept
 * explicit in the UI because it is the one destructive thing on this screen.
 */
function ProcessEditor({ chain, busy, tone, onSave }: {
  chain: Chain; busy: boolean; tone: { bg: string; text: string };
  onSave: (p: { id?: string; title: string }[]) => void;
}) {
  const [items, setItems] = useState<{ id?: string; title: string; code?: string }[]>([]);
  useEffect(() => { setItems(chain.processes.map((p) => ({ id: p.id, title: p.title, code: p.code }))); }, [chain.id, chain.processes]);

  const removedCount = chain.processes.length - items.filter((i) => i.id).length;
  const dirty = items.length !== chain.processes.length
    || items.some((it, i) => it.id !== chain.processes[i]?.id || it.title !== chain.processes[i]?.title);

  const move = (i: number, by: number) => setItems((a) => {
    const j = i + by; if (j < 0 || j >= a.length) return a;
    const n = [...a]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  return (
    <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
      <h2 className="text-sm font-semibold text-gray-900">Processes</h2>
      <p className="text-[11px] text-gray-500 mt-1 mb-3">
        Saving renumbers to {chain.code}.01, .02 … in this order and moves each BPMN prompt with its
        process. Codes are safe to move because prompt cross-references are by <strong>name</strong>,
        never by code — nothing outside a process quotes its number.
      </p>
      <ul className="space-y-1 mb-3">
        {items.map((it, i) => (
          <li key={it.id ?? `new-${i}`} className="flex items-center gap-1.5">
            <span className="w-14 text-[11px] font-mono text-gray-500">
              {chain.code}.{String(i + 1).padStart(2, "0")}
            </span>
            <input value={it.title} onChange={(e) => setItems((a) => a.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1" />
            {!it.id && <span className="text-[10px] px-1 rounded bg-blue-100 text-blue-800">new</span>}
            <button onClick={() => move(i, -1)} disabled={i === 0} className="px-1.5 py-1 text-[11px] border border-gray-300 rounded disabled:opacity-30">↑</button>
            <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="px-1.5 py-1 text-[11px] border border-gray-300 rounded disabled:opacity-30">↓</button>
            <button onClick={() => setItems((a) => a.filter((_, k) => k !== i))}
              className="px-1.5 py-1 text-[11px] border border-gray-300 rounded hover:bg-red-50 hover:border-red-300 text-gray-600">✕</button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button onClick={() => setItems((a) => [...a, { title: "" }])}
          className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Add a process</button>
        <button disabled={busy || !dirty} onClick={() => onSave(items.map((i) => ({ id: i.id, title: i.title })))}
          className="px-3 py-1.5 text-xs font-medium rounded disabled:opacity-40"
          style={{ background: tone.bg, color: tone.text }}>
          Save &amp; renumber
        </button>
        {removedCount > 0 && (
          <span className="text-[11px] text-red-700">
            {removedCount} process{removedCount === 1 ? "" : "es"} will be removed, with {removedCount === 1 ? "its" : "their"} BPMN prompt{removedCount === 1 ? "" : "s"}.
          </span>
        )}
      </div>
    </section>
  );
}

function PromptPanel({ chain, busy, rows, tone, genTypes, setGenTypes, onRegenerate }: {
  chain: Chain; busy: boolean; rows: Row[]; tone: { bg: string; text: string };
  genTypes: MdPromptType[]; setGenTypes: (t: MdPromptType[]) => void;
  onRegenerate: (types: MdPromptType[], processCode?: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(chain.prompts.map((p) => [`${p.type}|${p.processCode}`, p])), [chain.prompts]);
  const missing = useMemo(() => {
    const want = MD_PROMPT_TYPES.filter((t) => t !== "bpmn").length + chain.processes.length;
    return want - chain.prompts.length;
  }, [chain]);

  const toggle = (t: MdPromptType) => setGenTypes(genTypes.includes(t) ? genTypes.filter((x) => x !== t) : [...genTypes, t]);

  return (
    <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-900">Prompts</h2>
        <span className="text-[11px] text-gray-500">
          {chain.prompts.length} of {MD_PROMPT_TYPES.length - 1 + chain.processes.length}
          {missing > 0 && <span className="text-amber-700"> · {missing} missing</span>}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {MD_PROMPT_TYPES.map((t) => (
          <button key={t} onClick={() => toggle(t)} disabled={busy}
            className={"px-2 py-1 rounded border text-[11px] disabled:opacity-50 "
              + (genTypes.includes(t) ? "border-transparent" : "border-gray-300 bg-white text-gray-600")}
            style={genTypes.includes(t) ? { background: tone.bg, color: tone.text } : undefined}>
            {MD_PROMPT_LABEL[t]}{t === "bpmn" && <span className="opacity-60"> ×{chain.processes.length}</span>}
          </button>
        ))}
        <button disabled={busy || genTypes.length === 0} onClick={() => onRegenerate(genTypes)}
          className="ml-2 px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300">
          {busy ? "Generating…" : "Regenerate selected"}
        </button>
      </div>

      {rows.length > 0 && (
        <table className="w-full text-[11px] mb-3">
          <tbody>
            {rows.map((r) => (
              <tr key={r.index} className="border-b border-gray-100">
                <td className="py-1 pr-2 text-gray-800">{r.name}</td>
                <td className="py-1 pr-2 text-gray-500">{MD_PROMPT_LABEL[r.type]}</td>
                <td className="py-1 pr-2">
                  {r.status === "generating" ? <span className="text-gray-400">…</span>
                    : r.status === "done" ? <span className={r.roundTrips ? "text-green-700" : "text-amber-700"}>{r.roundTrips ? "ok" : "does not parse"}</span>
                    : r.status === "refused" ? <span className="text-red-700 font-semibold">refused</span>
                    : <span className="text-red-700">failed</span>}
                </td>
                <td className="py-1 text-right tabular-nums text-gray-500">{r.ms ? `${(r.ms / 1000).toFixed(1)}s` : ""}</td>
                {r.message && <td className="py-1 pl-2 text-red-700">{r.message}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ul className="space-y-1">
        {MD_PROMPT_TYPES.filter((t) => t !== "bpmn").map((t) => (
          <PromptRow key={t} label={MD_PROMPT_LABEL[t]} prompt={byKey.get(`${t}|`)} open={open} setOpen={setOpen}
            onRegenerate={() => onRegenerate([t])} busy={busy} />
        ))}
        {chain.processes.map((p) => (
          <PromptRow key={p.id} label={`${p.code} ${p.title}`} prompt={byKey.get(`bpmn|${p.code}`)} open={open} setOpen={setOpen}
            onRegenerate={() => onRegenerate(["bpmn"], p.code)} busy={busy} />
        ))}
      </ul>
    </section>
  );
}

function PromptRow({ label, prompt, open, setOpen, onRegenerate, busy }: {
  label: string; prompt?: Prompt; open: string | null; setOpen: (s: string | null) => void;
  onRegenerate: () => void; busy: boolean;
}) {
  const key = prompt?.id ?? label;
  const isOpen = open === key;
  return (
    <li className="border border-gray-200 rounded">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button onClick={() => setOpen(isOpen ? null : key)} className="flex-1 text-left text-[11px] text-gray-800">
          {label}
        </button>
        {prompt ? (
          <>
            <span className="text-[10px] tabular-nums text-gray-400">{prompt.chars.toLocaleString()} ch</span>
            {!prompt.roundTripsOk && <span className="text-[10px] text-amber-700">does not parse</span>}
            {prompt.unterminatedBranches > 0 && (
              <span
                className="text-[10px] text-amber-700"
                title={`${prompt.unterminatedBranches} gateway branch(es) never say where they go — a regeneration has to guess, so the diagram stops matching the write-up`}
              >
                {prompt.unterminatedBranches} open branch{prompt.unterminatedBranches === 1 ? "" : "es"}
              </span>
            )}
            {!prompt.published && <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-800">draft</span>}
          </>
        ) : (
          <span className="text-[10px] px-1 rounded bg-gray-100 text-gray-600">none</span>
        )}
        <button disabled={busy} onClick={onRegenerate}
          className="px-2 py-0.5 text-[10px] border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
          {prompt ? "Regenerate" : "Generate"}
        </button>
      </div>
      {isOpen && prompt && (
        <pre className="text-[10px] font-mono whitespace-pre-wrap border-t border-gray-200 bg-gray-50 p-2.5 max-h-80 overflow-y-auto text-gray-800">
          {prompt.prompt}
        </pre>
      )}
    </li>
  );
}
