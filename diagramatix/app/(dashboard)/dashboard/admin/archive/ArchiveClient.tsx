"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface ArchivedDiagram {
  id: string;
  name: string;
  type: string;
  archivedAt: string;
  originalUserId: string | null;
  originalUserEmail: string;
  originalProjectId: string | null;
  originalProjectName: string | null;
  originalFolderId: string | null;
  originalFolderName: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  context: "Context",
  basic: "Context",
  "process-context": "Process Context",
  "state-machine": "State Machine",
  bpmn: "BPMN",
  domain: "Domain",
};

// Sentinel keys for the synthetic groupings used when metadata is missing.
const UNORG_PROJECT_KEY = "__unorganised__";
const ROOT_FOLDER_KEY = "__project_root__";

interface FolderBucket {
  folderId: string;
  folderName: string;
  diagrams: ArchivedDiagram[];
}
interface ProjectBucket {
  projectId: string;
  projectName: string;
  folders: FolderBucket[];
}
interface UserBucket {
  userId: string;
  userEmail: string;
  projects: ProjectBucket[];
}

function buildTree(diagrams: ArchivedDiagram[]): UserBucket[] {
  const users = new Map<string, UserBucket>();
  for (const d of diagrams) {
    const userKey = d.originalUserId ?? d.originalUserEmail ?? "unknown";
    let user = users.get(userKey);
    if (!user) {
      user = { userId: userKey, userEmail: d.originalUserEmail || "Unknown", projects: [] };
      users.set(userKey, user);
    }
    const projectKey = d.originalProjectId ?? UNORG_PROJECT_KEY;
    let project = user.projects.find((p) => p.projectId === projectKey);
    if (!project) {
      project = {
        projectId: projectKey,
        projectName: d.originalProjectName ?? "Sandpit",
        folders: [],
      };
      user.projects.push(project);
    }
    const folderKey = d.originalFolderId ?? ROOT_FOLDER_KEY;
    let folder = project.folders.find((f) => f.folderId === folderKey);
    if (!folder) {
      folder = {
        folderId: folderKey,
        folderName: d.originalFolderName ?? "(project root)",
        diagrams: [],
      };
      project.folders.push(folder);
    }
    folder.diagrams.push(d);
  }
  // Sort: user email, project name, folder name, diagram archivedAt desc.
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  const sorted = Array.from(users.values()).sort((a, b) => collator.compare(a.userEmail, b.userEmail));
  for (const u of sorted) {
    u.projects.sort((a, b) => collator.compare(a.projectName, b.projectName));
    for (const p of u.projects) {
      p.folders.sort((a, b) => collator.compare(a.folderName, b.folderName));
      for (const f of p.folders) {
        f.diagrams.sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : -1));
      }
    }
  }
  return sorted;
}

export function ArchiveClient() {
  const router = useRouter();
  const [diagrams, setDiagrams] = useState<ArchivedDiagram[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/archive")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ArchivedDiagram[]) => setDiagrams(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tree = useMemo(() => buildTree(diagrams), [diagrams]);
  const totalCount = diagrams.length;

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setGroupSelection(ids: string[], shouldSelect: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (shouldSelect) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleRestore(diagramId: string) {
    const diag = diagrams.find((d) => d.id === diagramId);
    setConfirmDialog({
      title: "Restore Diagram",
      message:
        `Restore "${diag?.name ?? "this diagram"}" to ${diag?.originalUserEmail ?? "the original user"}?` +
        (diag?.originalProjectName
          ? ` It will be placed back in "${diag.originalProjectName}" if the project still exists, otherwise it will appear in the Sandpit.`
          : " It will appear in the user's Sandpit."),
      confirmLabel: "Restore",
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await fetch("/api/admin/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diagramId }),
        });
        if (res.ok) {
          setDiagrams((prev) => prev.filter((d) => d.id !== diagramId));
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(diagramId);
            return next;
          });
        }
      },
    });
  }

  function handleDeleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setConfirmDialog({
      title: "Permanently Delete Selected",
      message:
        `Permanently delete ${ids.length} archived diagram${ids.length === 1 ? "" : "s"}?\n\n` +
        `This cannot be undone. Diagrams are NOT recoverable.`,
      confirmLabel: `Delete ${ids.length} forever`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setBusy(true);
        try {
          const res = await fetch("/api/admin/archive", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
          if (!res.ok) {
            const txt = await res.text();
            setConfirmDialog({
              title: "Delete failed",
              message: txt || res.statusText,
              confirmLabel: "OK",
              onConfirm: () => setConfirmDialog(null),
            });
            return;
          }
          setDiagrams((prev) => prev.filter((d) => !selected.has(d.id)));
          setSelected(new Set());
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function handleDeleteAll() {
    if (totalCount === 0) return;
    setConfirmDialog({
      title: "Permanently Delete EVERY archived diagram",
      message:
        `Permanently delete all ${totalCount} archived diagram${totalCount === 1 ? "" : "s"} ` +
        `across every user, project, and folder?\n\n` +
        `This cannot be undone. The system archive will be emptied.`,
      confirmLabel: `Delete all ${totalCount}`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setBusy(true);
        try {
          const res = await fetch("/api/admin/archive", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ all: true }),
          });
          if (!res.ok) {
            const txt = await res.text();
            setConfirmDialog({
              title: "Delete failed",
              message: txt || res.statusText,
              confirmLabel: "OK",
              onConfirm: () => setConfirmDialog(null),
            });
            return;
          }
          setDiagrams([]);
          setSelected(new Set());
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function groupCheckboxState(ids: string[]): "none" | "some" | "all" {
    if (ids.length === 0) return "none";
    let on = 0;
    for (const id of ids) if (selected.has(id)) on++;
    if (on === 0) return "none";
    if (on === ids.length) return "all";
    return "some";
  }

  function GroupCheckbox({ ids, label }: { ids: string[]; label: string }) {
    const state = groupCheckboxState(ids);
    return (
      <label className="inline-flex items-center gap-2 cursor-pointer" title={label}>
        <input
          type="checkbox"
          className="h-3.5 w-3.5"
          checked={state === "all"}
          ref={(el) => {
            if (el) el.indeterminate = state === "some";
          }}
          onChange={(e) => setGroupSelection(ids, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />
      </label>
    );
  }

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/admin")}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
          >
            <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"←"}</span>
            <span className="underline">SuperAdmin</span>
          </button>
          {/* Brand icon: matches placement on every other admin sub-screen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="font-semibold text-gray-900">System Archive</h1>
          <span className="text-xs text-gray-400">
            {totalCount} diagram{totalCount === 1 ? "" : "s"}
            {selected.size > 0 && <span className="ml-2 text-blue-600">· {selected.size} selected</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDeleteSelected}
            disabled={busy || selected.size === 0}
            className="text-xs text-red-700 border border-red-300 rounded px-2.5 py-1.5 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Delete selected ({selected.size})
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={busy || totalCount === 0}
            className="text-xs text-white bg-red-700 rounded px-2.5 py-1.5 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            title="Permanently delete every archived diagram"
          >
            Delete ALL
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : totalCount === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500 text-sm">No archived diagrams</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {tree.map((user) => {
              const userIds = user.projects.flatMap((p) => p.folders.flatMap((f) => f.diagrams.map((d) => d.id)));
              const userKey = `user:${user.userId}`;
              const userCollapsed = collapsed.has(userKey);
              return (
                <div key={user.userId} className="border-b border-gray-100 last:border-b-0">
                  {/* User row */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <GroupCheckbox ids={userIds} label={`Select all for ${user.userEmail}`} />
                    <button
                      onClick={() => toggleCollapsed(userKey)}
                      className="text-gray-400 hover:text-gray-600 text-xs w-4"
                    >
                      {userCollapsed ? "▶" : "▼"}
                    </button>
                    <span className="text-sm font-semibold text-gray-900 flex-1 truncate">{user.userEmail}</span>
                    <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
                      {userIds.length} diagram{userIds.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {!userCollapsed &&
                    user.projects.map((project) => {
                      const projectIds = project.folders.flatMap((f) => f.diagrams.map((d) => d.id));
                      const projectKey = `proj:${user.userId}:${project.projectId}`;
                      const projectCollapsed = collapsed.has(projectKey);
                      return (
                        <div key={project.projectId}>
                          {/* Project row */}
                          <div className="flex items-center gap-2 pl-8 pr-3 py-1.5 bg-white border-b border-gray-100">
                            <GroupCheckbox ids={projectIds} label={`Select all in ${project.projectName}`} />
                            <button
                              onClick={() => toggleCollapsed(projectKey)}
                              className="text-gray-400 hover:text-gray-600 text-xs w-4"
                            >
                              {projectCollapsed ? "▶" : "▼"}
                            </button>
                            <span className={`text-sm flex-1 truncate ${project.projectId === UNORG_PROJECT_KEY ? "text-gray-500 italic" : "text-gray-800 font-medium"}`}>
                              {project.projectName}
                            </span>
                            <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                              {projectIds.length}
                            </span>
                          </div>

                          {!projectCollapsed &&
                            project.folders.map((folder) => {
                              const folderIds = folder.diagrams.map((d) => d.id);
                              const folderKey = `fld:${user.userId}:${project.projectId}:${folder.folderId}`;
                              const folderCollapsed = collapsed.has(folderKey);
                              return (
                                <div key={folder.folderId}>
                                  {/* Folder row */}
                                  <div className="flex items-center gap-2 pl-14 pr-3 py-1.5 bg-white border-b border-gray-100">
                                    <GroupCheckbox ids={folderIds} label={`Select all in folder ${folder.folderName}`} />
                                    <button
                                      onClick={() => toggleCollapsed(folderKey)}
                                      className="text-gray-400 hover:text-gray-600 text-[10px] w-4"
                                    >
                                      {folderCollapsed ? "▶" : "▼"}
                                    </button>
                                    <span className={`text-xs flex-1 truncate ${folder.folderId === ROOT_FOLDER_KEY ? "text-gray-400 italic" : "text-gray-700"}`}>
                                      {folder.folderName}
                                    </span>
                                    <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                                      {folderIds.length}
                                    </span>
                                  </div>

                                  {!folderCollapsed &&
                                    folder.diagrams.map((d) => (
                                      <div
                                        key={d.id}
                                        className={`flex items-center gap-2 pl-20 pr-3 py-1.5 border-b border-gray-50 hover:bg-blue-50/40 ${selected.has(d.id) ? "bg-blue-50/60" : ""}`}
                                      >
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5"
                                          checked={selected.has(d.id)}
                                          onChange={() => toggleSelected(d.id)}
                                        />
                                        <span className="text-xs text-gray-900 flex-1 truncate font-medium">{d.name}</span>
                                        <span className="text-[10px] text-gray-500 shrink-0 px-1.5 py-0.5 bg-gray-100 rounded">
                                          {TYPE_LABELS[d.type] ?? d.type}
                                        </span>
                                        <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
                                          {new Date(d.archivedAt).toLocaleDateString()}
                                        </span>
                                        <button
                                          onClick={() => handleRestore(d.id)}
                                          className="text-[10px] text-green-700 border border-green-300 rounded px-1.5 py-0.5 hover:bg-green-50 font-medium shrink-0"
                                        >
                                          Restore
                                        </button>
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

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel ?? "Delete"}
          destructive={confirmDialog.title.toLowerCase().includes("delete")}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
