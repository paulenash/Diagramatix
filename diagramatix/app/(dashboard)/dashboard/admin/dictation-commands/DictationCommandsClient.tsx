"use client";

import { useEffect, useState } from "react";
import { DICTATION_ACTION_LABELS, POSITIONAL_ACTIONS, type DictationAction } from "@/app/lib/dictation/commands";

interface Row { action: string; phrases: string[]; positional?: boolean }

/**
 * SuperAdmin editor for the rich-text dictation command catalogue — the spoken
 * phrases the Review Comment mic recognises. One row per formatting action;
 * positional rows keep a `{n}` number placeholder. Phrases are edited one per
 * line and saved via PUT /api/ai/dictation/commands.
 */
export function DictationCommandsClient() {
  const [rows, setRows] = useState<Row[]>([]);
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
        setDrafts(Object.fromEntries(rs.map((r) => [r.action, r.phrases.join("\n")])));
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
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
      setMsg(res.ok ? "Saved." : "Save failed.");
    } catch { setMsg("Save failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Dictation Commands</h1>
      <p className="text-xs text-gray-500 mb-4">
        The spoken phrases the Review Comment dictation mic recognises for formatting. One phrase per line.
        Positional commands must keep the <code className="bg-gray-100 px-1 rounded">{"{n}"}</code> placeholder
        (the spoken number — digit or word). Anything a user says that doesn&apos;t match a phrase is dictated in as text.
      </p>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="space-y-4">
            {rows.map((r) => {
              const positional = r.positional || POSITIONAL_ACTIONS.has(r.action as DictationAction);
              return (
                <div key={r.action} className="border border-gray-200 rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800">
                      {DICTATION_ACTION_LABELS[r.action as DictationAction] ?? r.action}
                    </span>
                    {positional && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">keep {"{n}"}</span>}
                  </div>
                  <textarea
                    value={drafts[r.action] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.action]: e.target.value }))}
                    rows={Math.max(2, (drafts[r.action] ?? "").split("\n").length)}
                    className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={save} disabled={saving}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            {msg && <span className="text-xs text-gray-600">{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}
