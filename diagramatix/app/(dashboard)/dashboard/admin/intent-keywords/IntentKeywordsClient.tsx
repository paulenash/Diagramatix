"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Editable rows for the assist "semantic template suggestion" catalog. When a
// selected element's NAME contains any keyword, the ghost surfaces this intent
// and attaches the named template (or opens the picker at its category).
type ActionKind = "suggest-template" | "add-input-data-object" | "add-output-data-object";

interface Row {
  id?: string;
  label: string;
  keywordsText: string;      // comma/space separated in the editor
  action: ActionKind;
  diagramType: string;       // "all" or a notation
  defaultLabel: string;      // data-object actions
  targetCategory: string;
  targetTemplateName: string;
  sortOrder: number;
}

const blank = (sortOrder: number): Row => ({ label: "", keywordsText: "", action: "suggest-template", diagramType: "all", defaultLabel: "", targetCategory: "", targetTemplateName: "", sortOrder });

// Read-only reference: the code-enforced (RED) geometry/legality rules, shown so
// admins can see exactly what the assist does even though they're not editable.
const RED_RULES: { id: string; text: string }[] = [
  { id: "R1", text: "Inline placement — new element's near edge 51px right of the source; vertical centres aligned." },
  { id: "R2", text: "Gateway fan-out — 1st branch inline, then ±rows 51px apart (above, below, above², below²…)." },
  { id: "R3", text: "Boundary event — trigger-less intermediate on the host edge, near edge 18px from a corner; bottom-right → top-right → alternate; give up when full." },
  { id: "R4", text: "No overlap — placements move to the nearest free slot keeping edges ≥51px clear." },
  { id: "R5", text: "Connector legality — every suggested connection must pass canConnect." },
  { id: "R6", text: "Template attach — strip a leading Start Event, anchor the entry element inline, free-slot the fragment." },
  { id: "R7", text: "Boundary-follow — a task after a boundary event lands bottom-right (bottom-mounted) or top-right (top-mounted), its near edge 50px beyond the event's outer point; the connector exits the event's outer face into the task's left side." },
];

export function IntentKeywordsClient() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/intent-keywords")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.rows) {
          setRows(j.rows.map((r: { id: string; label: string; keywords: string[]; action?: ActionKind; diagramType?: string; defaultLabel?: string | null; targetCategory: string | null; targetTemplateName: string | null; sortOrder: number }) => ({
            id: r.id, label: r.label, keywordsText: (r.keywords ?? []).join(", "),
            action: r.action ?? "suggest-template", diagramType: r.diagramType ?? "all", defaultLabel: r.defaultLabel ?? "",
            targetCategory: r.targetCategory ?? "", targetTemplateName: r.targetTemplateName ?? "", sortOrder: r.sortOrder,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function add() {
    setRows((prev) => [...prev, blank((prev.at(-1)?.sortOrder ?? 0) + 10)]);
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    const payload = {
      rows: rows.map((r, i) => ({
        label: r.label.trim(),
        keywords: r.keywordsText.split(/[,\n]/).map((k) => k.trim()).filter(Boolean),
        action: r.action,
        diagramType: r.diagramType.trim() || "all",
        defaultLabel: r.defaultLabel.trim() || null,
        targetCategory: r.targetCategory.trim() || null,
        targetTemplateName: r.targetTemplateName.trim() || null,
        sortOrder: Number.isFinite(r.sortOrder) ? r.sortOrder : i * 10,
      })),
    };
    try {
      const res = await fetch("/api/admin/intent-keywords", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) { setStatus(`Error: ${j?.error ?? res.statusText}`); return; }
      setStatus(`Saved ${j.rows.length} intent${j.rows.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const input = "border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400";

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/admin")} className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
            <span style={{ fontSize: "1.5em", lineHeight: 1 }}>←</span><span className="underline">SuperAdmin</span>
          </button>
          <h1 className="font-semibold text-gray-900">Assist / NL Rules</h1>
        </div>
        <div className="flex items-center gap-2">
          {status && <span className={`text-xs ${status.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>{status}</span>}
          <button onClick={add} className="text-xs text-purple-700 border border-purple-300 hover:bg-purple-50 rounded px-2.5 py-1">+ Add</button>
          <button onClick={save} disabled={saving} className="text-xs text-white bg-purple-600 hover:bg-purple-700 rounded px-3 py-1 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="p-6 max-w-5xl space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-green-700 mb-1">🟢 Green rules — editable</h2>
          <p className="text-xs text-gray-500 mb-3">
            When a just-named element&rsquo;s <strong>name</strong> contains any keyword (whole-word, case-insensitive),
            the assist ghost does the row&rsquo;s <strong>action</strong>: suggest a template, or ghost an input/output
            <strong> Data Object</strong> with the default name. These also ground the Abracadabra AI. <strong>Type</strong>
            = <code>all</code> or a notation (bpmn, archimate…).
          </p>

          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
                    <th className="px-2 py-2 w-24">Label</th>
                    <th className="px-2 py-2">Keywords</th>
                    <th className="px-2 py-2 w-44">Action</th>
                    <th className="px-2 py-2 w-16">Type</th>
                    <th className="px-2 py-2 w-40">Category / Default name</th>
                    <th className="px-2 py-2 w-10">Sort</th>
                    <th className="px-2 py-2 w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.length === 0 && (
                    <tr><td colSpan={7} className="px-2 py-4 text-gray-400">No rules yet — click <strong>+ Add</strong>.</td></tr>
                  )}
                  {rows.map((r, i) => {
                    const isTemplate = r.action === "suggest-template";
                    return (
                    <tr key={r.id ?? `new-${i}`} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5"><input className={`${input} w-full`} value={r.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Approval" /></td>
                      <td className="px-2 py-1.5"><input className={`${input} w-full`} value={r.keywordsText} onChange={(e) => update(i, { keywordsText: e.target.value })} placeholder="approve, sign-off" /></td>
                      <td className="px-2 py-1.5">
                        <select className={`${input} w-full`} value={r.action} onChange={(e) => update(i, { action: e.target.value as ActionKind })}>
                          <option value="suggest-template">Suggest template</option>
                          <option value="add-input-data-object">+ Input Data Object</option>
                          <option value="add-output-data-object">+ Output Data Object</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><input className={`${input} w-full`} value={r.diagramType} onChange={(e) => update(i, { diagramType: e.target.value })} placeholder="all" /></td>
                      <td className="px-2 py-1.5">
                        {isTemplate ? (
                          <div className="flex flex-col gap-1">
                            <input className={`${input} w-full`} value={r.targetCategory} onChange={(e) => update(i, { targetCategory: e.target.value })} placeholder="category e.g. Approvals" />
                            <input className={`${input} w-full`} value={r.targetTemplateName} onChange={(e) => update(i, { targetTemplateName: e.target.value })} placeholder="or exact template name" />
                          </div>
                        ) : (
                          <input className={`${input} w-full`} value={r.defaultLabel} onChange={(e) => update(i, { defaultLabel: e.target.value })} placeholder="default name e.g. Instructions" />
                        )}
                      </td>
                      <td className="px-2 py-1.5"><input className={`${input} w-full`} type="number" value={r.sortOrder} onChange={(e) => update(i, { sortOrder: Number(e.target.value) })} /></td>
                      <td className="px-2 py-1.5 text-center"><button onClick={() => remove(i)} className="text-gray-400 hover:text-red-600" title="Remove">×</button></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Read-only reference for the code-enforced geometry/legality. */}
        <div>
          <h2 className="text-sm font-semibold text-red-700 mb-1">🔴 Red rules — code-enforced (read-only)</h2>
          <p className="text-xs text-gray-500 mb-3">The deterministic placement &amp; legality guarantees. These are enforced in code (not sent to the AI) and can&rsquo;t be edited here — listed so you can see exactly what the assist does.</p>
          <div className="bg-white border border-gray-200 rounded divide-y divide-gray-100">
            {RED_RULES.map((r) => (
              <div key={r.id} className="px-3 py-2 text-xs flex gap-2">
                <span className="font-mono text-red-600 shrink-0">{r.id}</span>
                <span className="text-gray-700">{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
