"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";

/** What the caller gets back. For a folder pick, `itemId` is the folder id
 *  (null = drive root) and `webUrl` is the folder URL. For a file pick,
 *  `itemId` is the file id and `webUrl` is the file URL. */
export interface SharePointSelection {
  driveId: string;
  itemId: string | null;
  name: string;
  webUrl: string;
}

interface Props {
  /** "folder" → choose a destination folder (Save here). "file" → choose a
   *  single file (Open / Link). */
  mode: "folder" | "file";
  title?: string;
  /** Only files whose name matches one of these extensions are selectable in
   *  "file" mode (others are shown greyed). e.g. [".json", ".xml", ".vsdx"]. */
  fileExtensions?: string[];
  confirmLabel?: string;
  onPick: (sel: SharePointSelection) => void;
  onCancel: () => void;
}

type Drive = { id: string; name: string; webUrl: string };
type Site = { id: string; name: string; displayName: string; webUrl: string };
type Item = {
  id: string; name: string; webUrl: string; size: number;
  lastModifiedDateTime: string;
  folder?: { childCount: number }; file?: { mimeType: string };
};

// A node in the breadcrumb trail. OneDrive is resolved to its real drive id up
// front and then behaves exactly like a SharePoint drive (no special-casing).
type Crumb =
  | { kind: "root" }
  | { kind: "site"; site: Site }
  | { kind: "drive"; driveId: string; driveName: string; siteId?: string }
  | { kind: "folder"; driveId: string; itemId: string; name: string; webUrl: string };

async function api(qs: string): Promise<any> {
  const r = await fetch(`/api/sharepoint?${qs}`);
  if (r.status === 403) throw new Error("__NOT_CONNECTED__");
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "SharePoint request failed");
  return r.json();
}

export function SharePointPicker({
  mode, title, fileExtensions, confirmLabel, onPick, onCancel,
}: Props) {
  const [trail, setTrail] = useState<Crumb[]>([{ kind: "root" }]);
  const here = trail[trail.length - 1];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);

  const [sites, setSites] = useState<Site[]>([]);
  const [siteQuery, setSiteQuery] = useState("");
  const [drives, setDrives] = useState<Drive[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedFile, setSelectedFile] = useState<Item | null>(null);

  const extOk = useCallback((name: string) => {
    if (!fileExtensions || fileExtensions.length === 0) return true;
    const lower = name.toLowerCase();
    return fileExtensions.some((e) => lower.endsWith(e.toLowerCase()));
  }, [fileExtensions]);

  // Load the contents for the current breadcrumb node.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null); setSelectedFile(null);
      try {
        if (here.kind === "root") {
          const s = await api(`action=sites${siteQuery ? `&q=${encodeURIComponent(siteQuery)}` : ""}`);
          if (!cancelled) setSites(s);
        } else if (here.kind === "site") {
          const d = await api(`action=drives&siteId=${encodeURIComponent(here.site.id)}`);
          if (!cancelled) setDrives(d);
        } else if (here.kind === "drive") {
          const it = await api(`action=files&driveId=${encodeURIComponent(here.driveId)}`);
          if (!cancelled) setItems(it);
        } else if (here.kind === "folder") {
          const it = await api(`action=files&driveId=${encodeURIComponent(here.driveId)}&itemId=${encodeURIComponent(here.itemId)}`);
          if (!cancelled) setItems(it);
        }
      } catch (e: any) {
        if (cancelled) return;
        if (e?.message === "__NOT_CONNECTED__") setNotConnected(true);
        else setError(e?.message ?? "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // siteQuery only matters at root; including it re-runs the site search.
  }, [here, siteQuery]);

  const push = (c: Crumb) => setTrail((t) => [...t, c]);
  const goto = (idx: number) => setTrail((t) => t.slice(0, idx + 1));

  // Resolve OneDrive to its real drive id, then browse it like any other drive.
  async function openOneDrive() {
    setLoading(true); setError(null);
    try {
      const d = await api(`action=mydrive`);
      push({ kind: "drive", driveId: d.id, driveName: d.name ?? "OneDrive" });
    } catch (e: any) {
      if (e?.message === "__NOT_CONNECTED__") setNotConnected(true);
      else setError(e?.message ?? "Failed to open OneDrive");
      setLoading(false);
    }
  }

  // The current drive id (if we're inside a drive/folder) — needed to pick.
  const currentDriveId =
    here.kind === "drive" ? here.driveId : here.kind === "folder" ? here.driveId : null;

  function openItem(it: Item) {
    if (it.folder) {
      if (currentDriveId) {
        push({ kind: "folder", driveId: currentDriveId, itemId: it.id, name: it.name, webUrl: it.webUrl });
      }
    } else if (mode === "file" && extOk(it.name)) {
      setSelectedFile(it);
    }
  }

  function confirmFolder() {
    // Resolve driveId + folder item id for the current location.
    if (here.kind === "drive") {
      onPick({ driveId: here.driveId, itemId: null, name: here.driveName, webUrl: "" });
    } else if (here.kind === "folder") {
      onPick({ driveId: here.driveId, itemId: here.itemId, name: here.name, webUrl: here.webUrl });
    }
  }

  function confirmFile() {
    if (!selectedFile || !currentDriveId) return;
    onPick({ driveId: currentDriveId, itemId: selectedFile.id, name: selectedFile.name, webUrl: selectedFile.webUrl });
  }

  const canPickFolderHere = mode === "folder" && (here.kind === "drive" || here.kind === "folder");
  const heading = title ?? (mode === "folder" ? "Choose a SharePoint folder" : "Choose a SharePoint file");

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col" style={{ maxHeight: "80vh" }}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{heading}</h3>
          {/* Breadcrumbs */}
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-gray-500">
            {trail.map((c, i) => {
              const label =
                c.kind === "root" ? "SharePoint" :
                c.kind === "site" ? c.site.displayName || c.site.name :
                c.kind === "drive" ? c.driveName : c.name;
              const last = i === trail.length - 1;
              return (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-300">/</span>}
                  <button
                    onClick={() => goto(i)}
                    className={last ? "font-medium text-gray-700" : "hover:text-blue-600 hover:underline"}
                  >
                    {label}
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-[16rem]">
          {notConnected ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-gray-700 mb-1">Your Microsoft account isn&apos;t connected.</p>
              <p className="text-xs text-gray-500 mb-4">Sign in with Microsoft to browse SharePoint and OneDrive.</p>
              <button
                onClick={() => signIn("microsoft-entra-id", { callbackUrl: window.location.href })}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Connect Microsoft
              </button>
            </div>
          ) : (
            <>
              {/* Root: OneDrive shortcut + site search */}
              {here.kind === "root" && (
                <>
                  <button
                    onClick={openOneDrive}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-50 text-left text-sm text-gray-800"
                  >
                    <span aria-hidden>☁️</span> My OneDrive
                  </button>
                  <div className="my-2">
                    <input
                      value={siteQuery}
                      onChange={(e) => setSiteQuery(e.target.value)}
                      placeholder="Search SharePoint sites…"
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                </>
              )}

              {loading ? (
                <p className="text-xs text-gray-400 py-6 text-center">Loading…</p>
              ) : error ? (
                <p className="text-xs text-red-600 py-6 text-center">{error}</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {here.kind === "root" && sites.map((s) => (
                    <li key={s.id}>
                      <button onClick={() => push({ kind: "site", site: s })}
                        className="w-full flex items-center gap-2 px-2 py-2 hover:bg-gray-50 text-left text-sm text-gray-800">
                        <span aria-hidden>🏢</span> {s.displayName || s.name}
                      </button>
                    </li>
                  ))}
                  {here.kind === "site" && drives.map((d) => (
                    <li key={d.id}>
                      <button onClick={() => push({ kind: "drive", driveId: d.id, driveName: d.name, siteId: (here as any).site.id })}
                        className="w-full flex items-center gap-2 px-2 py-2 hover:bg-gray-50 text-left text-sm text-gray-800">
                        <span aria-hidden>🗄️</span> {d.name}
                      </button>
                    </li>
                  ))}
                  {(here.kind === "drive" || here.kind === "folder") && items.map((it) => {
                    const isFolder = !!it.folder;
                    const selectable = isFolder || (mode === "file" && extOk(it.name));
                    const isSel = selectedFile?.id === it.id;
                    return (
                      <li key={it.id}>
                        <button
                          onClick={() => openItem(it)}
                          disabled={!selectable}
                          className={`w-full flex items-center gap-2 px-2 py-2 text-left text-sm rounded ${
                            isSel ? "bg-blue-50 text-blue-800" :
                            selectable ? "hover:bg-gray-50 text-gray-800" : "text-gray-300 cursor-default"
                          }`}
                        >
                          <span aria-hidden>{isFolder ? "📁" : "📄"}</span>
                          <span className="flex-1 truncate">{it.name}</span>
                          {!isFolder && (
                            <span className="text-[10px] text-gray-400">
                              {new Date(it.lastModifiedDateTime).toLocaleDateString()}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {!loading && ((here.kind === "drive" || here.kind === "folder") && items.length === 0) && (
                    <li className="text-xs text-gray-400 py-6 text-center">Empty folder</li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100">
          <span className="text-[11px] text-gray-400 truncate">
            {mode === "file" && selectedFile ? `Selected: ${selectedFile.name}` : ""}
          </span>
          <div className="flex gap-2">
            <button onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
            {mode === "folder" ? (
              <button onClick={confirmFolder} disabled={!canPickFolderHere}
                className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {confirmLabel ?? "Save here"}
              </button>
            ) : (
              <button onClick={confirmFile} disabled={!selectedFile}
                className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {confirmLabel ?? "Open"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
