"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ProjectRow { id: string; name: string; _count?: { diagrams?: number } }

/**
 * Mobile Projects list + Create Project (steps 1-2). Tapping a project opens its
 * diagrams screen (slice 2). Create asks only for a name, then opens the new
 * project. Touch-first: big rows, a single primary action.
 */
export function MobileProjectsClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load projects"))))
      .then((arr) => setProjects(Array.isArray(arr) ? arr : []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function createProject() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Create failed");
      router.push(`/m/project/${j.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Create failed"); setBusy(false); }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-semibold text-gray-900">Projects</h1>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg active:bg-blue-700">+ New</button>
        )}
      </div>

      {creating && (
        <div className="mb-4 p-3 bg-white rounded-xl shadow-sm">
          <label className="block text-xs text-gray-500 mb-1">Project name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createProject(); }}
            placeholder="e.g. Order to Cash"
            className="w-full text-base border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex gap-2 mt-3">
            <button onClick={createProject} disabled={!name.trim() || busy}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg active:bg-blue-700 disabled:opacity-50">
              {busy ? "Creating…" : "Create"}
            </button>
            <button onClick={() => { setCreating(false); setName(""); }}
              className="px-4 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-gray-400 mt-6 text-center">No projects yet. Tap “+ New” to create one.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <button onClick={() => router.push(`/m/project/${p.id}`)}
                className="w-full text-left bg-white rounded-xl shadow-sm px-4 py-3.5 active:bg-gray-50 flex items-center justify-between">
                <span className="font-medium text-gray-900 truncate">{p.name}</span>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{p._count?.diagrams ?? 0} diagram{(p._count?.diagrams ?? 0) === 1 ? "" : "s"} ›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
