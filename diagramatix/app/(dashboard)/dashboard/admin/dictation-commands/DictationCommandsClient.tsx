"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DICTATION_ACTION_LABELS, POSITIONAL_ACTIONS, type DictationAction } from "@/app/lib/dictation/commands";

interface Row { action: string; phrases: string[]; positional?: boolean }

/**
 * SuperAdmin editor for the rich-text dictation command catalogue — the spoken
 * phrases the Review Comment mic recognises. One card per formatting action,
 * laid out four-across; positional cards keep a `{n}` number placeholder.
 * Phrases are edited one per line and saved via PUT /api/ai/dictation/commands.
 * Save is enabled only while there are unsaved changes.
 */
export function DictationCommandsClient() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  // `saved` is the last-persisted snapshot; `drafts` is the live edit buffer.
  // Dirty = they differ, which drives the Save button's enabled state (item 3).
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai/dictation/commands")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const rs: Row[] = Array.isArray(j?.commands) ? j.commands : [];
        setRows(rs);
        const snap = Object.fromEntries(rs.map((r) => [r.action, r.phrases.join("\n")]));
        setSaved(snap);
        setDrafts(snap);
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(
    () => rows.some((r) => (drafts[r.action] ?? "") !== (saved[r.action] ?? "")),
    [rows, drafts, saved],
  );

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const commands = rows.map((r) => ({
        action: r.action,
        phrases: (drafts[r.action] ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
      }));
      const res = await fetch("/api/ai/dictation/commands", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands }),
      });
      if (res.ok) {
        setSaved({ ...drafts }); // new baseline → Save disables until next change
        setMsg("Saved.");
      } else {
        setMsg("Save failed.");
      }
    } catch { setMsg("Save failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/admin")} className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
            <span style={{ fontSize: "1.5em", lineHeight: 1 }}>←</span><span className="underline">SuperAdmin</span>
          </button>
          <h1 className="font-semibold text-gray-900">Dictation Commands</h1>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-gray-600">{msg}</span>}
          <button onClick={save} disabled={!dirty || saving}
            className="text-xs text-white bg-blue-600 hover:bg-blue-700 rounded px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="p-6">
        <p className="text-xs text-gray-500 mb-4 max-w-3xl">
          The spoken phrases the Review Comment dictation mic recognises for formatting. One phrase per line.
          Positional commands must keep the <code className="bg-gray-100 px-1 rounded">{"{n}"}</code> placeholder
          (the spoken number — digit or word). Anything a user says that doesn&apos;t match a phrase is dictated in as text.
        </p>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {rows.map((r) => {
              const positional = r.positional || POSITIONAL_ACTIONS.has(r.action as DictationAction);
              const label = DICTATION_ACTION_LABELS[r.action as DictationAction] ?? r.action;
              return (
                <div key={r.action} className="border border-gray-200 rounded p-2 bg-white">
                  <div className="flex items-center justify-between mb-1 gap-1">
                    <span className="text-[11px] font-semibold text-gray-800 truncate" title={label}>
                      <span className="text-gray-400 font-normal">Action:</span> {label}
                    </span>
                    {positional && <span className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 shrink-0">keep {"{n}"}</span>}
                  </div>
                  <textarea
                    value={drafts[r.action] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.action]: e.target.value }))}
                    rows={Math.max(3, (drafts[r.action] ?? "").split("\n").length)}
                    className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
