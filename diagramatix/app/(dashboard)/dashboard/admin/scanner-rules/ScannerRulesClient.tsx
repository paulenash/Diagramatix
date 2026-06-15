"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type MergedRule = {
  code: string;
  title: string;
  description: string;
  severity: "error" | "warning";
  category: string;
  status: "live" | "proposed" | "pending-delete";
  hasOverride: boolean; // a DB row backs this (vs pure code rule)
  fromCode: boolean;    // a code-defined check exists for this number
};

type Draft = { title: string; description: string; severity: "error" | "warning"; category: string };

export function ScannerRulesClient({ rules }: { rules: MergedRule[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null); // code being edited ("" = new)
  const [draft, setDraft] = useState<Draft>({ title: "", description: "", severity: "warning", category: "custom" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalRules = rules.length;
  const proposed = rules.filter((r) => r.status === "proposed").length;
  const pending = rules.filter((r) => r.status === "pending-delete").length;

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/scanner-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setErr(`Action failed (${res.status}). ${t}`.trim());
        return;
      }
      setEditing(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(r: MergedRule | null) {
    if (r) {
      setEditing(r.code);
      setDraft({ title: r.title, description: r.description, severity: r.severity, category: r.category });
    } else {
      setEditing("");
      setDraft({ title: "", description: "", severity: "warning", category: "custom" });
    }
  }

  const statusChip = (s: MergedRule["status"]) =>
    s === "proposed" ? (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">[PROPOSED]</span>
    ) : s === "pending-delete" ? (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">[PENDING]</span>
    ) : (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">live</span>
    );

  const btn = "text-[10px] px-1.5 py-0.5 rounded border";

  const editor = (codeLabel: string) => (
    <div className="space-y-1.5 mt-1">
      <input
        autoFocus
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        placeholder="Rule title"
        className="w-full text-xs border border-gray-300 rounded px-2 py-1"
      />
      <textarea
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        placeholder="Description — what the rule flags and why"
        rows={3}
        className="w-full text-[11px] border border-gray-300 rounded px-2 py-1 resize-y"
      />
      <div className="flex items-center gap-2">
        <select
          value={draft.severity}
          onChange={(e) => setDraft({ ...draft, severity: e.target.value as "error" | "warning" })}
          className="text-[11px] border border-gray-300 rounded px-1.5 py-0.5"
        >
          <option value="warning">warning</option>
          <option value="error">error</option>
        </select>
        <input
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          placeholder="category"
          className="text-[11px] border border-gray-300 rounded px-1.5 py-0.5 w-40"
        />
        <div className="ml-auto flex items-center gap-1">
          <button disabled={busy} className={`${btn} text-gray-600 border-gray-300 hover:bg-gray-50`}
            onClick={() => setEditing(null)}>Cancel</button>
          <button disabled={busy} className={`${btn} text-white bg-blue-600 border-blue-600 hover:bg-blue-700`}
            onClick={() => call(codeLabel ? { action: "save", code: codeLabel, ...draft } : { action: "create", ...draft })}>
            {codeLabel ? "Save (proposes)" : "Add rule"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen dgx-dashboard-bg flex flex-col overflow-hidden">
      <header className="shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
            <span>&larr;</span>
            <span className="underline">SuperAdmin</span>
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="text-lg font-semibold text-gray-900">BPMN Scanner Rules</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            Code checks in <code className="text-[10px] bg-gray-100 px-1 rounded">diagramChecks.ts</code>; lifecycle in the registry.
          </p>
          <Link href="/help" className="text-xs text-blue-600 hover:underline shrink-0">User Guide</Link>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col p-4 max-w-5xl w-full mx-auto">
        <div className="shrink-0 flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            All BPMN rules
            <span className="ml-2 text-xs text-gray-400 font-normal">
              ({totalRules} — {proposed} proposed, {pending} pending removal)
            </span>
          </h2>
          <button disabled={busy} onClick={() => startEdit(null)}
            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            + Add rule
          </button>
        </div>
        {err && (
          <div className="shrink-0 mb-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            {err}
          </div>
        )}

        <ul className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
          {editing === "" && (
            <li className="border border-blue-200 rounded px-3 py-2 bg-blue-50/40">
              <span className="text-[10px] font-semibold text-gray-500 uppercase">New rule (next B-number assigned on save)</span>
              {editor("")}
            </li>
          )}
          {rules.map((r) => (
            <li key={r.code} className={`border rounded px-3 py-2 ${r.status === "pending-delete" ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-white"}`}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-gray-900 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">{r.code}</span>
                {statusChip(r.status)}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>{r.severity}</span>
                <span className="text-sm font-medium text-gray-900">{r.title}</span>
                {!r.fromCode && <span className="text-[9px] text-gray-400 uppercase">custom</span>}
                {editing !== r.code && (
                  <span className="ml-auto flex items-center gap-1">
                    {r.status !== "pending-delete" && (
                      <button disabled={busy} className={`${btn} text-blue-600 border-blue-300 hover:bg-blue-50`} onClick={() => startEdit(r)}>Edit</button>
                    )}
                    {r.status === "proposed" && (
                      <button disabled={busy} className={`${btn} text-green-700 border-green-300 hover:bg-green-50`} onClick={() => call({ action: "markImplemented", code: r.code })}>Mark implemented</button>
                    )}
                    {r.status !== "pending-delete" && (
                      <button disabled={busy} className={`${btn} text-red-600 border-red-300 hover:bg-red-50`} onClick={() => call({ action: "requestDelete", code: r.code })}>Delete</button>
                    )}
                    {r.status === "pending-delete" && (
                      <>
                        <button disabled={busy} className={`${btn} text-gray-600 border-gray-300 hover:bg-gray-50`} onClick={() => call({ action: "restore", code: r.code })}>Restore</button>
                        <button disabled={busy} className={`${btn} text-white bg-red-600 border-red-600 hover:bg-red-700`} onClick={() => call({ action: "confirmDelete", code: r.code })}>Confirm removal</button>
                      </>
                    )}
                  </span>
                )}
              </div>
              {editing === r.code ? editor(r.code) : (
                <p className="text-[11px] text-gray-600 mt-1.5 whitespace-pre-line">{r.description}</p>
              )}
            </li>
          ))}
          {rules.length === 0 && <li className="text-xs text-gray-500 italic">No rules defined.</li>}
        </ul>
      </main>
    </div>
  );
}
