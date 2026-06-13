"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Backup dialog: optional pre-flight preview (stats + who/what to include),
 * then live per-section progress, then a statistical report + download.
 *
 * - Exports (no selection): pass only `url` (a `?stream=1` endpoint) → runs
 *   immediately, shows progress + report.
 * - Backups: also pass `previewUrl` (a `?preview=1` endpoint). The dialog
 *   shows the pre-filled tables + a selection picker (Org members, or
 *   Org→users for the SuperAdmin) with Cancel / Proceed, then streams the
 *   (optionally scoped) backup.
 */

interface ProgressItem {
  label: string;
  count: number;
}
interface DoneInfo {
  filename: string;
  counts: Record<string, number>;
  bytes: number;
}
interface PreviewUser {
  userId: string;
  email: string;
  name: string | null;
  projects: number;
  diagrams: number;
}
interface PreviewOrg {
  orgId: string;
  name: string;
  users: PreviewUser[];
}
interface BackupPreview {
  scope: "user" | "org" | "full";
  sections: { label: string; count: number }[];
  selectable: "none" | "users" | "orgs";
  users?: PreviewUser[];
  orgs?: PreviewOrg[];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function triggerDownload(b64: string, filename: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
  const dl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = dl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(dl);
}

export function BackupProgressModal({
  url,
  title,
  noun = "Backup",
  previewUrl,
  onClose,
}: {
  url: string;
  title: string;
  noun?: string;
  /** When set, show a pre-flight preview + selection step before running. */
  previewUrl?: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<
    "preview-loading" | "preview" | "running" | "compressing" | "done" | "error"
  >(previewUrl ? "preview-loading" : "running");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  // Selection state
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set()); // org scope
  const [selectedOrgId, setSelectedOrgId] = useState<string>("ALL"); // full scope
  const [selectedOrgUsers, setSelectedOrgUsers] = useState<Set<string>>(new Set());
  // Run state
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runStartedRef = useRef(false);

  // Load preview.
  useEffect(() => {
    if (!previewUrl) return;
    let active = true;
    fetch(previewUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Preview failed (${r.status})`))))
      .then((p: BackupPreview) => {
        if (!active) return;
        setPreview(p);
        if (p.selectable === "users" && p.users) setSelectedUsers(new Set(p.users.map((u) => u.userId)));
        setPhase("preview");
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : "Preview failed");
          setPhase("error");
        }
      });
    return () => {
      active = false;
    };
  }, [previewUrl]);

  // When the SuperAdmin picks a specific org, default its users to all-ticked.
  useEffect(() => {
    if (preview?.selectable === "orgs" && selectedOrgId !== "ALL") {
      const org = preview.orgs?.find((o) => o.orgId === selectedOrgId);
      setSelectedOrgUsers(new Set(org?.users.map((u) => u.userId) ?? []));
    }
  }, [selectedOrgId, preview]);

  function buildRunUrl(): string {
    if (preview?.selectable === "users") {
      return `${url}&userIds=${Array.from(selectedUsers).join(",")}`;
    }
    if (preview?.selectable === "orgs" && selectedOrgId !== "ALL") {
      return `${url}&orgId=${encodeURIComponent(selectedOrgId)}&userIds=${Array.from(selectedOrgUsers).join(",")}`;
    }
    return url;
  }

  // Stream the (optionally scoped) backup once we enter the running phase.
  useEffect(() => {
    if (phase !== "running" || runStartedRef.current) return;
    runStartedRef.current = true;
    const runUrl = buildRunUrl();
    (async () => {
      try {
        const res = await fetch(runUrl);
        if (!res.ok || !res.body) throw new Error(`${noun} failed (${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done: rdone, value } = await reader.read();
          if (rdone) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const lineStr = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!lineStr) continue;
            const msg = JSON.parse(lineStr) as
              | { t: "progress"; label: string; count: number }
              | { t: "done"; filename: string; counts: Record<string, number>; bytes: number; data: string }
              | { t: "error"; message: string };
            if (msg.t === "progress") {
              if (msg.label === "Compressing") setPhase("compressing");
              else setItems((prev) => [...prev, { label: msg.label, count: msg.count }]);
            } else if (msg.t === "done") {
              triggerDownload(msg.data, msg.filename);
              setDone({ filename: msg.filename, counts: msg.counts, bytes: msg.bytes });
              setPhase("done");
            } else if (msg.t === "error") {
              setError(msg.message);
              setPhase("error");
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : `${noun} failed`);
        setPhase("error");
      }
    })();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalRows = done
    ? Object.values(done.counts).reduce((a, b) => a + b, 0)
    : items.reduce((a, b) => a + b.count, 0);
  const nonEmpty = done ? Object.entries(done.counts).filter(([, c]) => c > 0) : [];

  // Whether Proceed is allowed.
  const orgUsers = preview?.orgs?.find((o) => o.orgId === selectedOrgId)?.users ?? [];
  const canProceed =
    preview?.selectable === "users"
      ? selectedUsers.size > 0
      : preview?.selectable === "orgs" && selectedOrgId !== "ALL"
        ? selectedOrgUsers.size > 0
        : true;

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  const isPreview = phase === "preview-loading" || phase === "preview";

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">
            {phase === "done" ? `✔ ${noun} complete` : phase === "error" ? `✘ ${noun} failed` : title}
          </h2>
          {(phase === "done" || phase === "error") && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
              &times;
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {phase === "preview-loading" && (
            <p className="text-xs text-gray-400 italic animate-pulse">Calculating what will be backed up…</p>
          )}

          {phase === "preview" && preview && (
            <div className="text-xs space-y-3">
              {/* Headline stats */}
              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full">
                  <tbody>
                    {preview.sections.map((s) => (
                      <tr key={s.label} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-1 text-gray-700">{s.label}</td>
                        <td className="px-3 py-1 text-right font-mono text-gray-500">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Org member selection (OrgAdmin) */}
              {preview.selectable === "users" && preview.users && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-600 font-medium">Members to back up</span>
                    <span className="flex gap-2">
                      <button className="text-blue-600 hover:underline" onClick={() => setSelectedUsers(new Set(preview.users!.map((u) => u.userId)))}>All</button>
                      <button className="text-blue-600 hover:underline" onClick={() => setSelectedUsers(new Set())}>None</button>
                    </span>
                  </div>
                  <div className="border border-gray-200 rounded max-h-48 overflow-y-auto divide-y divide-gray-100">
                    {preview.users.map((u) => (
                      <label key={u.userId} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={selectedUsers.has(u.userId)} onChange={() => toggle(selectedUsers, u.userId, setSelectedUsers)} />
                        <span className="flex-1 truncate text-gray-700">{u.name || u.email}</span>
                        <span className="text-[10px] text-gray-400 font-mono shrink-0">{u.projects}p · {u.diagrams}d</span>
                      </label>
                    ))}
                    {preview.users.length === 0 && <p className="px-2 py-2 text-gray-400 italic">No members.</p>}
                  </div>
                </div>
              )}

              {/* Org + user selection (SuperAdmin) */}
              {preview.selectable === "orgs" && preview.orgs && (
                <div className="space-y-2">
                  <div>
                    <label className="text-gray-600 font-medium block mb-1">Scope</label>
                    <select
                      value={selectedOrgId}
                      onChange={(e) => setSelectedOrgId(e.target.value)}
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="ALL">All Orgs — full system backup</option>
                      {preview.orgs.map((o) => (
                        <option key={o.orgId} value={o.orgId}>{o.name} ({o.users.length} users)</option>
                      ))}
                    </select>
                  </div>
                  {selectedOrgId !== "ALL" && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gray-600 font-medium">Users in this Org</span>
                        <span className="flex gap-2">
                          <button className="text-blue-600 hover:underline" onClick={() => setSelectedOrgUsers(new Set(orgUsers.map((u) => u.userId)))}>All</button>
                          <button className="text-blue-600 hover:underline" onClick={() => setSelectedOrgUsers(new Set())}>None</button>
                        </span>
                      </div>
                      <div className="border border-gray-200 rounded max-h-48 overflow-y-auto divide-y divide-gray-100">
                        {orgUsers.map((u) => (
                          <label key={u.userId} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={selectedOrgUsers.has(u.userId)} onChange={() => toggle(selectedOrgUsers, u.userId, setSelectedOrgUsers)} />
                            <span className="flex-1 truncate text-gray-700">{u.name || u.email}</span>
                            <span className="text-[10px] text-gray-400 font-mono shrink-0">{u.projects}p · {u.diagrams}d</span>
                          </label>
                        ))}
                        {orgUsers.length === 0 && <p className="px-2 py-2 text-gray-400 italic">No users.</p>}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">A scoped backup also includes system config (tiers, features, bubble-help, diagram-type styles).</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {(phase === "running" || phase === "compressing") && (
            <div className="space-y-0.5 text-xs font-mono">
              {items.map((it, i) => (
                <div key={i} className="flex items-center justify-between text-gray-700">
                  <span><span className="text-green-600">{"✔"}</span> {it.label}</span>
                  <span className={it.count === 0 ? "text-gray-300" : "text-gray-500"}>{it.count}</span>
                </div>
              ))}
              <div className="text-blue-500 animate-pulse pt-1">
                {"●"} {phase === "compressing" ? "Compressing…" : "Backing up…"}
              </div>
            </div>
          )}

          {phase === "done" && done && (
            <div className="text-xs">
              <p className="text-gray-600 mb-2">
                Saved as <span className="font-mono text-gray-800 break-all">{done.filename}</span>
              </p>
              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full">
                  <tbody>
                    {nonEmpty.map(([label, count]) => (
                      <tr key={label} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-1 text-gray-700">{label}</td>
                        <td className="px-3 py-1 text-right text-gray-500 font-mono">{count}</td>
                      </tr>
                    ))}
                    {nonEmpty.length === 0 && (
                      <tr><td className="px-3 py-2 text-gray-400 italic" colSpan={2}>Nothing to back up.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-medium">
                      <td className="px-3 py-1.5 text-gray-800">{totalRows} rows total</td>
                      <td className="px-3 py-1.5 text-right text-gray-600 font-mono">{formatBytes(done.bytes)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">The file has been downloaded to your browser.</p>
            </div>
          )}

          {phase === "error" && <p className="text-xs text-red-700">{error}</p>}
        </div>

        {/* Footer — pinned below the scrollable body. */}
        {isPreview && phase === "preview" && (
          <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 shrink-0">
            <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md text-gray-700 border border-gray-300 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={() => setPhase("running")}
              disabled={!canProceed}
              className="px-4 py-1.5 text-xs rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Proceed with {noun}
            </button>
          </div>
        )}
        {(phase === "done" || phase === "error") && (
          <div className="px-5 py-3 border-t border-gray-200 flex justify-end shrink-0">
            <button onClick={onClose} className="px-4 py-1.5 text-xs rounded-md text-white bg-blue-600 hover:bg-blue-700">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
