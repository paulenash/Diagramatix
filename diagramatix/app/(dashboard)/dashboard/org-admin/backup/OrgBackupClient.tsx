"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Tree shapes (mirror InspectTree from app/lib/full-backup.ts — only the
// fields this UI renders).
interface TreeDiagram { id: string; name: string }
interface TreeProject { id: string; name: string; diagrams: TreeDiagram[] }
interface TreeTemplate { id: string; name: string; diagramType: string }
interface TreeMember {
  userId: string;
  userEmail: string;
  userName: string | null;
  projects: TreeProject[];
  unfiledDiagrams: TreeDiagram[];
  templates: TreeTemplate[];
  promptCount: number;
}
interface Tree {
  meta: { exportedAt: string; exportedBy: string; schemaVersion: string };
  orgs: { id: string; name: string; members: TreeMember[] }[];
}

export function OrgBackupClient({ orgName }: { orgName: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [tree, setTree] = useState<Tree | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultLog, setResultLog] = useState<string[] | null>(null);

  // Selected ids.
  const [diagramIds, setDiagramIds] = useState<Set<string>>(new Set());
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set());
  const [templateIds, setTemplateIds] = useState<Set<string>>(new Set());

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  }

  async function inspect() {
    if (!file) return;
    setBusy(true); setError(null); setResultLog(null); setTree(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("mode", "inspect");
      const res = await fetch("/api/org-admin/backup", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? `Failed (${res.status})`); return; }
      setTree(j.tree);
      setDiagramIds(new Set()); setProjectIds(new Set()); setTemplateIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally { setBusy(false); }
  }

  async function restore() {
    if (!file) return;
    const total = diagramIds.size + projectIds.size + templateIds.size;
    if (total === 0) { setError("Tick at least one diagram, project, or template to restore."); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("mode", "additive");
      fd.set("selections", JSON.stringify({
        diagramIds: Array.from(diagramIds),
        projectIds: Array.from(projectIds),
        templateIds: Array.from(templateIds),
      }));
      const res = await fetch("/api/org-admin/backup", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? `Failed (${res.status})`); return; }
      setResultLog(j.result?.log ?? ["Restore complete."]);
      setTree(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally { setBusy(false); }
  }

  const selectedCount = diagramIds.size + projectIds.size + templateIds.size;

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button onClick={() => router.push("/dashboard/org-admin")} className="text-sm text-orange-600 hover:text-orange-800">
          ← OrgAdmin
        </button>
        <div className="h-4 border-l border-gray-300" />
        <h1 className="text-base font-semibold text-gray-900">Backup &amp; Restore — {orgName}</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Download */}
        <section className="bg-white border border-orange-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-orange-700 mb-1">Download Org backup</h2>
          <p className="text-xs text-gray-600 mb-3">
            Downloads a <code>.diag-full</code> file containing your whole Org — every member&apos;s projects,
            diagrams, history, templates and prompts. Treat the file as sensitive.
          </p>
          <a
            href="/api/org-admin/backup"
            className="inline-block px-3 py-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded"
          >
            Download Org backup
          </a>
        </section>

        {/* Restore */}
        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Selective restore</h2>
          <p className="text-xs text-gray-600 mb-3">
            Upload an Org backup, then tick the projects / diagrams / templates to restore. They&apos;re added
            alongside the live data (never overwritten) and re-attached to the original owner by email; a
            restored project is suffixed &ldquo;(restored)&rdquo;. Only your Org&apos;s data is ever touched.
          </p>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="file"
              accept=".diag-full,application/zip"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setTree(null); setResultLog(null); }}
              className="text-xs"
            />
            <button
              onClick={inspect}
              disabled={!file || busy}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
            >
              {busy && !tree ? "Reading…" : "Inspect"}
            </button>
          </div>

          {error && <div className="text-xs text-red-600 border border-red-200 bg-red-50 rounded px-2 py-1 mb-3">{error}</div>}

          {resultLog && (
            <div className="text-xs bg-green-50 border border-green-200 rounded p-3 mb-3">
              <div className="font-medium text-green-800 mb-1">Restore complete</div>
              <pre className="whitespace-pre-wrap text-green-900 text-[11px]">{resultLog.join("\n")}</pre>
            </div>
          )}

          {tree && (
            <div className="border border-gray-200 rounded">
              <div className="px-3 py-2 border-b border-gray-100 text-[11px] text-gray-500">
                Backup from {new Date(tree.meta.exportedAt).toLocaleString()} · exported by {tree.meta.exportedBy}
              </div>
              <div className="max-h-[50vh] overflow-y-auto p-3 space-y-3">
                {tree.orgs.flatMap(o => o.members).map(m => (
                  <div key={m.userId} className="border border-gray-100 rounded p-2">
                    <div className="text-xs font-medium text-gray-900">
                      {m.userName ?? m.userEmail} <span className="text-gray-500">{m.userEmail}</span>
                    </div>
                    {/* Projects */}
                    {m.projects.map(p => (
                      <div key={p.id} className="ml-2 mt-1.5">
                        <label className="flex items-center gap-1.5 text-xs text-gray-800">
                          <input type="checkbox" checked={projectIds.has(p.id)} onChange={() => toggle(projectIds, p.id, setProjectIds)} />
                          <span className="font-medium">{p.name}</span>
                          <span className="text-[10px] text-gray-400">project · {p.diagrams.length} diagram{p.diagrams.length === 1 ? "" : "s"}</span>
                        </label>
                        <div className="ml-5">
                          {p.diagrams.map(d => (
                            <label key={d.id} className="flex items-center gap-1.5 text-xs text-gray-700">
                              <input type="checkbox" checked={diagramIds.has(d.id)} onChange={() => toggle(diagramIds, d.id, setDiagramIds)} />
                              {d.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    {/* Sandpit / unfiled diagrams */}
                    {m.unfiledDiagrams.length > 0 && (
                      <div className="ml-2 mt-1.5">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">Sandpit</div>
                        <div className="ml-5">
                          {m.unfiledDiagrams.map(d => (
                            <label key={d.id} className="flex items-center gap-1.5 text-xs text-gray-700">
                              <input type="checkbox" checked={diagramIds.has(d.id)} onChange={() => toggle(diagramIds, d.id, setDiagramIds)} />
                              {d.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Templates */}
                    {m.templates.length > 0 && (
                      <div className="ml-2 mt-1.5">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">Templates</div>
                        <div className="ml-5">
                          {m.templates.map(t => (
                            <label key={t.id} className="flex items-center gap-1.5 text-xs text-gray-700">
                              <input type="checkbox" checked={templateIds.has(t.id)} onChange={() => toggle(templateIds, t.id, setTemplateIds)} />
                              {t.name} <span className="text-[10px] text-gray-400">{t.diagramType}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-gray-500">{selectedCount} selected</span>
                <button
                  onClick={restore}
                  disabled={busy || selectedCount === 0}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-40"
                >
                  {busy ? "Restoring…" : `Restore ${selectedCount} item(s)`}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
