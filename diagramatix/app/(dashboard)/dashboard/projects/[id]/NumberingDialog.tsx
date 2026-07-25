"use client";
/**
 * Project re-numbering — configuration + preview + apply, in one dialog (three-row
 * scrollable modal, modelled on LinkScanDialog). Config step picks the mode +
 * prefix and saves it; "Preview" fetches the old→new diff; "Confirm" applies it.
 */
import { useState } from "react";

interface ElementDiff { id: string; oldLabel: string; oldCode: string; newCode: string; newLabel: string; isApqc: boolean; }
interface DiagramDiff { id: string; oldName: string; newName: string; code: string; elements: ElementDiff[]; }
interface FolderDiff { id: string; oldName: string; newName: string; code: string; }
interface RenumberDiff { folders: FolderDiff[]; diagrams: DiagramDiff[]; counters: { folders: number; diagrams: number; elements: number }; }
export interface NumberingConfig { mode: "apqc" | "full"; prefix: string; applied: boolean; showNonApqc: boolean; lastAppliedAt?: string; }

export function NumberingDialog({ projectId, hasPcf, initialConfig, onClose, onApplied }: {
  projectId: string; hasPcf: boolean; initialConfig: NumberingConfig;
  onClose: () => void; onApplied: () => void;
}) {
  const [mode, setMode] = useState<"apqc" | "full">(hasPcf ? initialConfig.mode : "full");
  const [prefix, setPrefix] = useState(initialConfig.prefix ?? "");
  const [view, setView] = useState<"config" | "preview">("config");
  const [diff, setDiff] = useState<RenumberDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function saveConfig(): Promise<boolean> {
    const cfg = { ...initialConfig, mode, prefix };
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numberingConfig: cfg }),
    });
    return res.ok;
  }

  async function preview() {
    setBusy(true); setErr(null);
    try {
      if (!(await saveConfig())) { setErr("Could not save settings"); return; }
      const res = await fetch(`/api/projects/${projectId}/renumber`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Preview failed"); return; }
      setDiff(j.diff); setView("preview");
    } catch { setErr("Network error"); } finally { setBusy(false); }
  }

  async function apply() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/renumber`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Apply failed"); return; }
      onApplied(); onClose();
    } catch { setErr("Network error"); } finally { setBusy(false); }
  }

  const total = diff ? diff.counters.folders + diff.counters.diagrams + diff.counters.elements : 0;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 shrink-0 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Project Numbering{view === "preview" ? " — Preview" : ""}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {view === "config" ? (
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Renumbering mode</div>
                <label className={`flex items-start gap-2 p-2 rounded border ${mode === "apqc" ? "border-indigo-300 bg-indigo-50" : "border-gray-200"} ${!hasPcf ? "opacity-40" : ""}`}>
                  <input type="radio" name="mode" disabled={!hasPcf} checked={mode === "apqc"} onChange={() => setMode("apqc")} className="mt-0.5" />
                  <span><strong>APQC-preserving</strong> (Option 1) — keep the APQC folder structure &amp; diagram names; renumber each diagram&rsquo;s activities contiguously (non-APQC appended; deleted-APQC gaps close). {!hasPcf && <em className="text-gray-500">— not an APQC project</em>}</span>
                </label>
                <label className={`flex items-start gap-2 p-2 rounded border mt-2 ${mode === "full" ? "border-indigo-300 bg-indigo-50" : "border-gray-200"}`}>
                  <input type="radio" name="mode" checked={mode === "full"} onChange={() => setMode("full")} className="mt-0.5" />
                  <span><strong>Full renumber</strong> (Option 2) — renumber the whole project from the root: folders, diagrams and activities, with the pattern <code>PREFIX n.m.k…</code>.</span>
                </label>
              </div>
              {mode === "full" && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Alpha prefix (0–3 uppercase letters)</div>
                  <input value={prefix} maxLength={3}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
                    placeholder="e.g. ABC"
                    className="w-40 text-sm border border-gray-300 rounded px-2 py-1 tracking-wider" />
                  <p className="text-[11px] text-gray-400 mt-1">Fixed for the project; attaches to the top-level number, e.g. <code>{(prefix || "")}1.2.3</code>. ≤9 items → 1 digit, ≥10 → 2 (zero-padded).</p>
                </div>
              )}
              <p className="text-[11px] text-gray-500">Preview shows every change before anything is written. Activity codes render on the first line of the activity name.</p>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {total === 0 && <p className="text-gray-500">No changes — the project is already numbered to this scheme.</p>}
              {!!diff?.folders.length && (
                <section>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Folders ({diff.folders.length})</div>
                  {diff.folders.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 py-0.5">
                      <span className="text-gray-400 line-through truncate flex-1">{f.oldName}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-gray-800 truncate flex-1">{f.newName}</span>
                    </div>
                  ))}
                </section>
              )}
              {diff?.diagrams.map((d) => (
                <section key={d.id} className="border border-gray-100 rounded p-2">
                  <div className="flex items-center gap-2 font-medium text-gray-800">
                    <span className="text-gray-400 line-through truncate flex-1">{d.oldName}</span>
                    <span className="text-gray-300">→</span>
                    <span className="truncate flex-1">{d.newName}</span>
                  </div>
                  {d.elements.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 pl-3 py-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.isApqc ? "bg-indigo-400" : "bg-amber-400"}`} title={e.isApqc ? "APQC" : "non-APQC"} />
                      <span className="text-gray-400 truncate flex-1">{e.oldCode || "(none)"} {e.oldLabel.split("\n").slice(-1)[0]}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-gray-800 truncate flex-1"><strong>{e.newCode}</strong> {e.newLabel.split("\n").slice(1).join(" ")}</span>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 shrink-0 flex items-center gap-3">
          {err && <span className="text-xs text-red-600">{err}</span>}
          {view === "config" ? (
            <>
              <button onClick={onClose} className="ml-auto px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={async () => { if (await saveConfig()) onClose(); }} disabled={busy} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">Save settings</button>
              <button onClick={preview} disabled={busy} className="px-3 py-1.5 text-sm text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50">{busy ? "Working…" : "Preview renumber…"}</button>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-500">{diff?.counters.diagrams ?? 0} diagrams · {diff?.counters.elements ?? 0} activities · {diff?.counters.folders ?? 0} folders</span>
              <button onClick={() => setView("config")} className="ml-auto px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Back</button>
              <button onClick={apply} disabled={busy || total === 0} className="px-3 py-1.5 text-sm text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50">{busy ? "Applying…" : "Confirm renumber"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
