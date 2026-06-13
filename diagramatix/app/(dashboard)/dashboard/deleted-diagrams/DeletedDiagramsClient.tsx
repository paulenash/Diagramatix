"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { DiagramTypeBadge } from "@/app/components/DiagramTypeBadge";

interface DeletedDiagram {
  id: string;
  name: string;
  type: string;
  archivedAt: string;
  originalUserId: string | null;
  originalUserEmail: string | null;
  originalProjectId: string | null;
  originalProjectName: string | null;
  originalFolderId: string | null;
  originalFolderName: string | null;
}


function formatDate(iso: string): string {
  const d = new Date(iso);
  try {
    return d.toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return d.toLocaleString(); }
}

const UNORGANISED_PROJECT_KEY = "__unorganised__";
const ROOT_FOLDER_KEY = "__root__";

type Confirm = { title: string; message: string; onConfirm: () => void } | null;

export function DeletedDiagramsClient() {
  const [diagrams, setDiagrams] = useState<DeletedDiagram[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  // Collapsed sets — each holds the key of every collapsed node at that
  // level. A node not in the set is expanded. Default: every node expanded.
  const [collapsedUsers, setCollapsedUsers] = useState<Set<string>>(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/diagrams/deleted");
      if (res.ok) setDiagrams(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build the tree from the flat list. user → project → folder → diagrams.
  type FolderNode = { key: string; name: string; diagrams: DeletedDiagram[] };
  type ProjectNode = { key: string; name: string; folders: FolderNode[]; count: number };
  type UserNode = { key: string; email: string; projects: ProjectNode[]; count: number };
  const tree: UserNode[] = useMemo(() => {
    const byUser = new Map<string, Map<string, Map<string, DeletedDiagram[]>>>();
    const userEmails = new Map<string, string>();
    const projectNames = new Map<string, string>();
    const folderNames = new Map<string, string>();
    for (const d of diagrams) {
      const userKey = d.originalUserId ?? "(unknown user)";
      const userEmail = d.originalUserEmail ?? "(unknown user)";
      userEmails.set(userKey, userEmail);
      const projKey = d.originalProjectId ?? UNORGANISED_PROJECT_KEY;
      const projName = d.originalProjectName ?? "Sandpit";
      projectNames.set(`${userKey}/${projKey}`, projName);
      const folderKey = d.originalFolderId ?? ROOT_FOLDER_KEY;
      const folderName = d.originalFolderName ?? "(no folder)";
      folderNames.set(`${userKey}/${projKey}/${folderKey}`, folderName);
      if (!byUser.has(userKey)) byUser.set(userKey, new Map());
      const userMap = byUser.get(userKey)!;
      if (!userMap.has(projKey)) userMap.set(projKey, new Map());
      const projMap = userMap.get(projKey)!;
      if (!projMap.has(folderKey)) projMap.set(folderKey, []);
      projMap.get(folderKey)!.push(d);
    }
    const users: UserNode[] = [];
    for (const [userKey, userMap] of byUser) {
      const projects: ProjectNode[] = [];
      let userCount = 0;
      for (const [projKey, projMap] of userMap) {
        const folders: FolderNode[] = [];
        let projCount = 0;
        for (const [folderKey, list] of projMap) {
          // Sort diagrams by archivedAt desc within folder.
          const sorted = [...list].sort((a, b) =>
            (b.archivedAt > a.archivedAt ? 1 : -1),
          );
          folders.push({
            key: `${userKey}/${projKey}/${folderKey}`,
            name: folderNames.get(`${userKey}/${projKey}/${folderKey}`) ?? "(no folder)",
            diagrams: sorted,
          });
          projCount += sorted.length;
        }
        folders.sort((a, b) => a.name.localeCompare(b.name));
        projects.push({
          key: `${userKey}/${projKey}`,
          name: projectNames.get(`${userKey}/${projKey}`) ?? "Sandpit",
          folders,
          count: projCount,
        });
        userCount += projCount;
      }
      projects.sort((a, b) => a.name.localeCompare(b.name));
      users.push({
        key: userKey,
        email: userEmails.get(userKey) ?? "(unknown)",
        projects,
        count: userCount,
      });
    }
    users.sort((a, b) => a.email.localeCompare(b.email));
    return users;
  }, [diagrams]);

  function toggle(key: string, set: Set<string>, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    setter(next);
  }

  async function handleRestoreOne(d: DeletedDiagram) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/diagrams/deleted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagramId: d.id }),
      });
      if (res.ok) {
        setDiagrams((prev) => prev.filter((x) => x.id !== d.id));
        setMessage({ text: `"${d.name}" restored.`, ok: true });
      } else {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setMessage({ text: err.error ?? "Restore failed", ok: false });
      }
    } catch {
      setMessage({ text: "Network error", ok: false });
    }
    setBusy(false);
  }

  async function permanentDelete(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/diagrams/deleted", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const result = await res.json();
        const deletedSet = new Set(ids);
        setDiagrams((prev) => prev.filter((x) => !deletedSet.has(x.id)));
        setMessage({
          text: `Permanently deleted ${result.deleted} diagram${result.deleted === 1 ? "" : "s"}.`,
          ok: true,
        });
      } else {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setMessage({ text: err.error ?? "Delete failed", ok: false });
      }
    } catch {
      setMessage({ text: "Network error", ok: false });
    }
    setBusy(false);
  }

  function askDeleteDiagram(d: DeletedDiagram) {
    setConfirm({
      title: "Permanently Delete Diagram",
      message: `"${d.name}" will be permanently deleted from the archive. This cannot be undone.`,
      onConfirm: () => { setConfirm(null); permanentDelete([d.id]); },
    });
  }
  function askDeleteFolder(folder: FolderNode) {
    setConfirm({
      title: "Permanently Delete Folder",
      message: `Permanently delete all ${folder.diagrams.length} diagram${folder.diagrams.length === 1 ? "" : "s"} in "${folder.name}"? This cannot be undone.`,
      onConfirm: () => { setConfirm(null); permanentDelete(folder.diagrams.map((d) => d.id)); },
    });
  }
  function askDeleteProject(project: ProjectNode) {
    setConfirm({
      title: "Permanently Delete Project Archive",
      message: `Permanently delete all ${project.count} diagram${project.count === 1 ? "" : "s"} archived from "${project.name}"? This cannot be undone.`,
      onConfirm: () => {
        setConfirm(null);
        const ids = project.folders.flatMap((f) => f.diagrams.map((d) => d.id));
        permanentDelete(ids);
      },
    });
  }
  function askDeleteUser(user: UserNode) {
    setConfirm({
      title: "Permanently Delete User Archive",
      message: `Permanently delete all ${user.count} diagram${user.count === 1 ? "" : "s"} archived from "${user.email}"? This cannot be undone.`,
      onConfirm: () => {
        setConfirm(null);
        const ids = user.projects.flatMap((p) =>
          p.folders.flatMap((f) => f.diagrams.map((d) => d.id)),
        );
        permanentDelete(ids);
      },
    });
  }

  const hasMultipleUsers = tree.length > 1;

  return (
    <div className="min-h-screen dgx-dashboard-bg flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
            <span>&larr;</span>
            <span className="underline">Dashboard</span>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Deleted Diagrams</h1>
          <span className="text-xs text-gray-400">
            {diagrams.length} diagram{diagrams.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">Restore brings a diagram back to its original project. Permanent delete cannot be undone.</p>
          <Link href="/help" className="text-xs text-blue-600 hover:underline">User Guide</Link>
        </div>
      </header>

      {message && (
        <div className={`mx-6 mt-3 px-3 py-1.5 rounded text-xs ${message.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <div className="flex-1 p-4">
        {loading ? (
          <p className="text-xs text-gray-400 italic">Loading...</p>
        ) : tree.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500 text-sm">You have no deleted diagrams</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {tree.map((user) => {
              const userOpen = !collapsedUsers.has(user.key);
              return (
                <div key={user.key}>
                  {hasMultipleUsers && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                      <button
                        onClick={() => toggle(user.key, collapsedUsers, setCollapsedUsers)}
                        className="text-gray-500 hover:text-gray-700 text-xs w-4"
                      >{userOpen ? "▼" : "▶"}</button>
                      <span className="text-sm font-semibold text-gray-800 flex-1 truncate" title={user.email}>{user.email}</span>
                      <span className="text-[10px] text-gray-500">{user.count}</span>
                      <button
                        onClick={() => askDeleteUser(user)}
                        disabled={busy}
                        className="text-[10px] px-2 py-0.5 text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                      >Delete all</button>
                    </div>
                  )}
                  {userOpen && user.projects.map((project) => {
                    const projOpen = !collapsedProjects.has(project.key);
                    return (
                      <div key={project.key} className={hasMultipleUsers ? "pl-4" : ""}>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50/60 border-t border-gray-100">
                          <button
                            onClick={() => toggle(project.key, collapsedProjects, setCollapsedProjects)}
                            className="text-gray-500 hover:text-gray-700 text-xs w-4"
                          >{projOpen ? "▼" : "▶"}</button>
                          <span className="text-xs font-medium text-gray-700 flex-1 truncate" title={project.name}>{project.name}</span>
                          <span className="text-[10px] text-gray-500">{project.count}</span>
                          <button
                            onClick={() => askDeleteProject(project)}
                            disabled={busy}
                            className="text-[10px] px-2 py-0.5 text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                          >Delete all</button>
                        </div>
                        {projOpen && project.folders.map((folder) => {
                          const folderOpen = !collapsedFolders.has(folder.key);
                          return (
                            <div key={folder.key} className="pl-4">
                              <div className="flex items-center gap-2 px-3 py-1 border-t border-gray-100">
                                <button
                                  onClick={() => toggle(folder.key, collapsedFolders, setCollapsedFolders)}
                                  className="text-gray-400 hover:text-gray-700 text-xs w-4"
                                >{folderOpen ? "▼" : "▶"}</button>
                                <span className="text-[11px] text-gray-600 flex-1 truncate italic">{folder.name}</span>
                                <span className="text-[10px] text-gray-400">{folder.diagrams.length}</span>
                                <button
                                  onClick={() => askDeleteFolder(folder)}
                                  disabled={busy}
                                  className="text-[10px] px-2 py-0.5 text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                                >Delete all</button>
                              </div>
                              {folderOpen && folder.diagrams.map((d) => (
                                <div key={d.id} className="flex items-center gap-2 px-3 py-1 border-t border-gray-50 pl-10">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-gray-900 truncate" title={d.name}>{d.name}</p>
                                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                      <DiagramTypeBadge type={d.type} showLabel />
                                      <span>Deleted {formatDate(d.archivedAt)}</span>
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleRestoreOne(d)}
                                    disabled={busy}
                                    className="text-[10px] px-2 py-0.5 text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                                  >Restore</button>
                                  <button
                                    onClick={() => askDeleteDiagram(d)}
                                    disabled={busy}
                                    className="text-[10px] px-2 py-0.5 text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                                  >Delete</button>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
          confirmLabel="Delete"
          destructive
        />
      )}
    </div>
  );
}
