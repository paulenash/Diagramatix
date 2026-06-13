"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IMPLEMENTED_BUBBLE_TOPICS } from "@/app/lib/bubbleHelpTopics";
import type { DiagramType } from "@/app/lib/diagram/types";

interface BubbleHelpRow {
  id?: string;
  topicKey: string;
  conditionLabel: string;
  text: string;
  durationMs: number;
  sortOrder: number;
}

const DIAGRAM_TYPES: { value: DiagramType; label: string }[] = [
  { value: "bpmn",            label: "BPMN Process" },
  { value: "state-machine",   label: "State Machine" },
  { value: "value-chain",     label: "Value Chain" },
  { value: "domain",          label: "Domain Model" },
  { value: "context",         label: "Context Diagram" },
  { value: "process-context", label: "Process Context" },
  { value: "basic",           label: "Basic" },
  { value: "archimate",       label: "ArchiMate" },
];

export function BubbleHelpClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get("from");
  const backHref = rawFrom && rawFrom.startsWith("/") ? rawFrom : "/dashboard/admin";
  const [diagramType, setDiagramType] = useState<DiagramType>("bpmn");
  const [rows, setRows] = useState<BubbleHelpRow[] | null>(null);
  // Snapshot of what's persisted server-side. Cancel restores the row
  // list to this state and collapses any expanded editor.
  const [savedSnapshot, setSavedSnapshot] = useState<BubbleHelpRow[] | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Refetch whenever diagramType changes.
  useEffect(() => {
    setRows(null);
    setSavedSnapshot(null);
    setEditingIndex(null);
    fetch(`/api/bubble-helps?diagramType=${encodeURIComponent(diagramType)}`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then((data: { rows?: BubbleHelpRow[] }) => {
        const list = Array.isArray(data.rows) ? data.rows : [];
        const normalised = list.map((r, i) => ({ ...r, sortOrder: r.sortOrder ?? i }));
        setRows(normalised);
        setSavedSnapshot(normalised);
      })
      .catch(() => { setRows([]); setSavedSnapshot([]); });
  }, [diagramType]);

  async function save() {
    if (!rows) return;
    setSaving(true); setError(null); setStatus(null);
    try {
      const res = await fetch("/api/bubble-helps", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagramType,
          rows: rows.map((r, i) => ({
            topicKey: r.topicKey.trim(),
            conditionLabel: r.conditionLabel,
            text: r.text,
            durationMs: r.durationMs,
            sortOrder: i * 10,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      const json = await res.json();
      const persisted = (json.rows ?? []) as BubbleHelpRow[];
      setRows(persisted);
      setSavedSnapshot(persisted);
      // Collapse the expanded row after a successful save (Paul's
      // 2026-06-08 rule). The user is dropped back to the list view.
      setEditingIndex(null);
      setStatus("Saved");
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    // Revert in-memory rows to the last persisted snapshot and collapse
    // the expanded editor. Mirrors the post-Save UX but throws away
    // unsaved edits.
    if (savedSnapshot) setRows(savedSnapshot);
    setEditingIndex(null);
    setError(null);
    setStatus(null);
  }

  // Dirty-flag: Save + Cancel only enable when the in-memory rows
  // differ from the last persisted snapshot. JSON.stringify is fine
  // here — the row count is small (a few rows per diagram type).
  const isDirty = (() => {
    if (rows === null || savedSnapshot === null) return false;
    return JSON.stringify(rows) !== JSON.stringify(savedSnapshot);
  })();

  function update(index: number, patch: Partial<BubbleHelpRow>) {
    setRows(prev => prev ? prev.map((r, i) => i === index ? { ...r, ...patch } : r) : prev);
  }
  function addRow() {
    setRows(prev => [
      ...(prev ?? []),
      { topicKey: "", conditionLabel: "", text: "", durationMs: 10_000, sortOrder: (prev?.length ?? 0) * 10 },
    ]);
    setEditingIndex((rows?.length ?? 0));
  }
  function deleteRow(index: number) {
    setRows(prev => prev ? prev.filter((_, i) => i !== index) : prev);
    if (editingIndex === index) setEditingIndex(null);
  }
  function move(index: number, dir: -1 | 1) {
    setRows(prev => {
      if (!prev) return prev;
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(backHref)}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
            title={`Return to ${backHref}`}
          >
            <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"←"}</span>
            <span className="underline">
              {backHref === "/dashboard/admin"
                ? "SuperAdmin"
                : backHref === "/dashboard/org-admin"
                  ? "OrgAdmin"
                  : backHref === "/dashboard"
                    ? "Dashboard"
                    : backHref.startsWith("/dashboard/projects")
                      ? "Project"
                      : backHref.startsWith("/dashboard/diagram") || backHref.startsWith("/diagram")
                        ? "Diagram"
                        : "Back"}
            </span>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="font-semibold text-gray-900">Bubble Help Editor</h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Diagram type</label>
          <select
            value={diagramType}
            onChange={(e) => setDiagramType(e.target.value as DiagramType)}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
          >
            {DIAGRAM_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="bg-white border border-gray-200 rounded p-4">
          <p className="text-xs text-gray-500 mb-3">
            Rows whose Topic Key isn&apos;t referenced by code render in orange &mdash; they&apos;re
            staged but won&apos;t fire at runtime until a matching{" "}
            <code className="text-[10px] bg-gray-100 px-1 rounded">showBubbleHelp(&quot;key&quot;, anchor)</code>{" "}
            call is wired in the canvas.
          </p>

          {rows === null ? (
            <p className="text-xs text-gray-400 italic">Loading&hellip;</p>
          ) : (
            <div className="space-y-1">
              {rows.length === 0 && (
                <p className="text-xs text-gray-400 italic">No bubble helps configured for this diagram type yet.</p>
              )}
              {rows.map((row, i) => {
                const expanded = editingIndex === i;
                const isImplemented = IMPLEMENTED_BUBBLE_TOPICS.has(row.topicKey.trim());
                const rowColor = isImplemented ? "text-gray-700" : "text-orange-600";
                return (
                  <div key={row.id ?? `new-${i}`} className="border border-gray-200 rounded bg-gray-50">
                    <button
                      onClick={() => setEditingIndex(expanded ? null : i)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-100"
                    >
                      <span className="text-gray-400 text-xs">{expanded ? "▾" : "▸"}</span>
                      <span className={`text-xs truncate flex-1 ${rowColor}`}>
                        {row.conditionLabel || <em className="text-gray-400">(no trigger label)</em>}
                        <span className="text-gray-400">{" · "}</span>
                        <span className="font-mono">{row.topicKey || <em>(no topic)</em>}</span>
                      </span>
                      {!isImplemented && row.topicKey.trim() && (
                        <span className="text-[9px] uppercase text-orange-600 font-semibold">not wired</span>
                      )}
                    </button>
                    {expanded && (
                      <div className="px-2 pb-2 space-y-1.5 border-t border-gray-200 pt-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => move(i, -1)} disabled={i === 0}
                            className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30 px-1">{"↑"}</button>
                          <button onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                            className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30 px-1">{"↓"}</button>
                          <button
                            onClick={() => deleteRow(i)}
                            className="ml-auto text-xs text-red-700 hover:text-red-800 px-1.5"
                          >
                            {"✕"} delete
                          </button>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 block">Trigger label</label>
                          <input
                            type="text"
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                            value={row.conditionLabel}
                            placeholder="e.g. Click on an Element"
                            onChange={(e) => update(i, { conditionLabel: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 block">Topic key</label>
                          <input
                            type="text"
                            className={`w-full text-xs font-mono border border-gray-300 rounded px-2 py-1 ${isImplemented ? "" : "text-orange-600"}`}
                            value={row.topicKey}
                            placeholder="e.g. create-connector"
                            onChange={(e) => update(i, { topicKey: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 block">
                            Text (Enter / Shift-Enter = newline)
                          </label>
                          <textarea
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 font-mono leading-snug"
                            rows={6}
                            value={row.text}
                            onChange={(e) => update(i, { text: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 block">Duration (seconds)</label>
                          <input type="number" min={0.5} max={60} step={0.5}
                            className="w-24 text-xs border border-gray-300 rounded px-2 py-1"
                            value={(row.durationMs / 1000).toFixed(1)}
                            onChange={(e) => {
                              const s = parseFloat(e.target.value);
                              if (!isNaN(s)) update(i, { durationMs: Math.round(s * 1000) });
                            }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                <button
                  onClick={addRow}
                  className="text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded px-2 py-1"
                >
                  + Add help
                </button>
                <div className="flex-1" />
                <button
                  onClick={cancel}
                  disabled={saving || !isDirty}
                  className="text-xs text-gray-700 border border-gray-300 hover:bg-gray-50 rounded px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={isDirty ? "Discard unsaved changes and collapse the editor" : "No changes to cancel"}
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving || !isDirty}
                  className="text-xs text-white bg-blue-600 hover:bg-blue-700 rounded px-3 py-1 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  title={isDirty ? "Save changes and collapse the editor" : "No changes to save"}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                {status && <span className="text-xs text-green-600">{status}</span>}
                {error && <span className="text-xs text-red-700">{error}</span>}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
