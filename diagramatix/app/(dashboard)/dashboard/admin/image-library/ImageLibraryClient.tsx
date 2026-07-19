"use client";

/**
 * SuperAdmin Image Library — the one place to manage HelpImage entries:
 *   • upload / delete (delete is guarded by a usage list),
 *   • see where each image is used (document → chapter → section),
 *   • drag a (new) image onto a referenced one to re-point every reference to the
 *     new image in the documents you choose — the superseded image is kept, unlinked.
 * Camera capture (bottom-left) also adds images; the editor picker only chooses.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { IMAGE_ACCEPT, isAllowedImage, ALLOWED_IMAGE_LABEL } from "@/app/lib/help/imageFormats";

const COLLECTION_LABEL: Record<string, string> = { "user-guide": "User Guide", "tech-design": "Technical Design Notes" };
const docLabel = (c: string) => COLLECTION_LABEL[c] ?? c;

interface Img {
  id: string; url: string; filename: string; screenName: string; diagramName: string | null;
  alt: string | null; width: number | null; height: number | null; createdAt: string;
  refCount: number; byCollection: Record<string, number>;
}
interface Usage {
  collection: string; chapterSlug: string; chapterTitle: string;
  sectionId: string; sectionHeading: string | null; where: "image" | "inline";
}

export function ImageLibraryClient() {
  const [images, setImages] = useState<Img[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [usagesPopup, setUsagesPopup] = useState<{ img: Img; usages: Usage[] | null } | null>(null);
  const [deletePlain, setDeletePlain] = useState<Img | null>(null);
  const [deleteUsed, setDeleteUsed] = useState<{ img: Img; usages: Usage[] } | null>(null);
  const [replace, setReplace] = useState<{ source: Img; target: Img; collections: Record<string, boolean> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/image-library");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      setImages((await r.json()).images ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function fetchUsages(id: string): Promise<Usage[]> {
    const r = await fetch(`/api/admin/image-library/${id}/usages`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    return (await r.json()).usages ?? [];
  }

  async function upload(file: File) {
    if (!isAllowedImage(file.type, file.name)) { setError(`"${file.name}" isn't a supported image format. Allowed: ${ALLOWED_IMAGE_LABEL}.`); return; }
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("screenName", "Uploaded image");
      fd.append("filename", file.name);
      fd.append("alt", file.name.replace(/\.[^.]+$/, ""));
      const r = await fetch("/api/help/images", { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  }

  async function onDeleteClick(img: Img) {
    setError(null);
    if (img.refCount === 0) { setDeletePlain(img); return; }
    try { setDeleteUsed({ img, usages: await fetchUsages(img.id) }); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load usages"); }
  }
  async function doDelete(img: Img) {
    setBusy(true);
    try {
      const r = await fetch(`/api/help/images/${img.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDeletePlain(null); setDeleteUsed(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setBusy(false); }
  }

  function onDropReplace(target: Img) {
    const source = images.find((i) => i.id === dragId);
    setDragId(null);
    if (!source || source.id === target.id || target.refCount === 0) return;
    const collections: Record<string, boolean> = {};
    for (const c of Object.keys(target.byCollection)) collections[c] = true;
    setReplace({ source, target, collections });
  }
  async function doReplace() {
    if (!replace) return;
    const collections = Object.entries(replace.collections).filter(([, v]) => v).map(([c]) => c);
    if (collections.length === 0) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/image-library/repoint", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: replace.source.id, targetId: replace.target.id, collections }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      setReplace(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Replace failed"); }
    finally { setBusy(false); }
  }

  const isTarget = (img: Img) => !!dragId && dragId !== img.id && img.refCount > 0;

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin" className="text-sm text-red-600 hover:text-red-800">‹ SuperAdmin</Link>
          <h1 className="text-lg font-semibold text-gray-900">Image Library</h1>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {uploading ? "Uploading…" : "Upload image…"}
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <p className="text-xs text-gray-500 mb-4">
          Images are shared across the User Guide and Technical Design Notes. Drag a new image onto a
          <span className="font-medium text-gray-700"> referenced</span> one to replace it everywhere; the superseded image is kept, just unlinked.
        </p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : images.length === 0 ? (
          <p className="text-sm text-gray-500">No images yet. Upload one above, or use the camera button (bottom-left) on any screen to capture one.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {images.map((img) => {
              const target = isTarget(img);
              return (
                <div key={img.id}
                  draggable
                  onDragStart={(e) => { setDragId(img.id); e.dataTransfer.setData("text/plain", img.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => { if (target) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                  onDrop={(e) => { e.preventDefault(); onDropReplace(img); }}
                  className={`border rounded-lg overflow-hidden bg-white cursor-grab active:cursor-grabbing transition-shadow
                    ${target ? "ring-2 ring-blue-400 border-blue-300" : "border-gray-200"} ${dragId === img.id ? "opacity-50" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt ?? img.filename} className="w-full h-32 object-contain bg-gray-50 pointer-events-none" />
                  <div className="px-2.5 py-2">
                    <p className="text-[11px] text-gray-800 truncate" title={img.filename}>{img.screenName}{img.diagramName ? ` — ${img.diagramName}` : ""}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-gray-400">{img.width ?? "?"}×{img.height ?? "?"}</span>
                      {img.refCount > 0 ? (
                        <button onClick={() => setUsagesPopup({ img, usages: null })}
                          className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 hover:bg-green-100"
                          title="See where this image is used">
                          {img.refCount} ref{img.refCount === 1 ? "" : "s"}
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">unused</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex justify-end">
                      <button onClick={() => onDeleteClick(img)} className="text-[10px] text-red-400 hover:text-red-600">Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Usages popup */}
      {usagesPopup && (
        <UsagesModal img={usagesPopup.img} onClose={() => setUsagesPopup(null)} fetchUsages={fetchUsages} />
      )}

      {/* Delete — unreferenced (plain confirm) */}
      {deletePlain && (
        <ConfirmDialog title="Delete image" destructive
          message={`Delete "${deletePlain.filename}" from the library? It is not used anywhere.`}
          confirmLabel="Delete" cancelLabel="Cancel"
          onConfirm={() => void doDelete(deletePlain)} onCancel={() => setDeletePlain(null)} />
      )}

      {/* Delete — referenced (usage warning + delete anyway) */}
      {deleteUsed && (
        <Modal onClose={() => setDeleteUsed(null)} width="max-w-lg">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Delete a used image?</h2>
          </div>
          <div className="p-4 max-h-[50vh] overflow-auto">
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
              “{deleteUsed.img.filename}” is used in <strong>{deleteUsed.usages.length}</strong> place(s). Deleting it will
              leave those references <strong>broken</strong> (they’ll show a missing image). To swap it cleanly, drag a new
              image onto it instead.
            </p>
            <UsageList usages={deleteUsed.usages} />
          </div>
          <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
            <button onClick={() => setDeleteUsed(null)} disabled={busy} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600">Cancel</button>
            <button onClick={() => void doDelete(deleteUsed.img)} disabled={busy} className="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              {busy ? "Deleting…" : "Delete anyway"}
            </button>
          </div>
        </Modal>
      )}

      {/* Replace (drag-to-replace) */}
      {replace && (
        <Modal onClose={() => setReplace(null)} width="max-w-lg">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Replace image everywhere</h2>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-center gap-4 mb-3">
              <figure className="text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={replace.target.url} alt="" className="w-28 h-20 object-contain bg-gray-50 border border-gray-200 rounded" />
                <figcaption className="text-[10px] text-gray-500 mt-1 max-w-28 truncate">old · {replace.target.filename}</figcaption>
              </figure>
              <span className="text-2xl text-gray-400">→</span>
              <figure className="text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={replace.source.url} alt="" className="w-28 h-20 object-contain bg-gray-50 border border-blue-300 rounded" />
                <figcaption className="text-[10px] text-gray-500 mt-1 max-w-28 truncate">new · {replace.source.filename}</figcaption>
              </figure>
            </div>
            <p className="text-xs text-gray-600 mb-2">Re-point references to the new image in these documents:</p>
            <div className="space-y-1">
              {Object.entries(replace.target.byCollection).map(([c, n]) => (
                <label key={c} className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={replace.collections[c] ?? false}
                    onChange={(e) => setReplace((r) => r ? { ...r, collections: { ...r.collections, [c]: e.target.checked } } : r)} />
                  <span className="font-medium">{docLabel(c)}</span>
                  <span className="text-gray-400">— {n} reference{n === 1 ? "" : "s"}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              The old image is <strong>kept in the library</strong> (it just becomes unused) — nothing is deleted.
            </p>
          </div>
          <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
            <button onClick={() => setReplace(null)} disabled={busy} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600">Cancel</button>
            <button onClick={() => void doReplace()} disabled={busy || !Object.values(replace.collections).some(Boolean)}
              className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Replacing…" : "Replace references"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── small building blocks ─────────────────────────────────────────────────
function Modal({ children, onClose, width = "max-w-md" }: { children: React.ReactNode; onClose: () => void; width?: string }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-6" onClick={onClose}>
      <div className={`bg-white rounded-lg shadow-xl w-full ${width}`} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function UsageList({ usages }: { usages: Usage[] }) {
  if (usages.length === 0) return <p className="text-xs text-gray-500">Not used anywhere.</p>;
  // Group by document → chapter.
  const byDoc = new Map<string, Map<string, Usage[]>>();
  for (const u of usages) {
    const d = byDoc.get(u.collection) ?? new Map<string, Usage[]>();
    byDoc.set(u.collection, d);
    const key = u.chapterTitle || u.chapterSlug;
    (d.get(key) ?? d.set(key, []).get(key)!).push(u);
  }
  return (
    <div className="space-y-2">
      {Array.from(byDoc.entries()).map(([doc, chapters]) => (
        <div key={doc}>
          <p className="text-[11px] font-semibold text-gray-700">{docLabel(doc)}</p>
          <ul className="mt-0.5 space-y-0.5">
            {Array.from(chapters.entries()).map(([chapter, us]) => (
              <li key={chapter} className="text-[11px] text-gray-600 pl-2">
                {chapter}
                {us.map((u, i) => (
                  <span key={i} className="text-[10px] text-gray-400"> · {u.sectionHeading || "section"} ({u.where === "image" ? "image" : "inline"})</span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function UsagesModal({ img, onClose, fetchUsages }: { img: Img; onClose: () => void; fetchUsages: (id: string) => Promise<Usage[]> }) {
  const [usages, setUsages] = useState<Usage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchUsages(img.id).then((u) => { if (live) setUsages(u); }).catch((e) => { if (live) setErr(e instanceof Error ? e.message : "Failed"); });
    return () => { live = false; };
  }, [img.id, fetchUsages]);
  return (
    <Modal onClose={onClose} width="max-w-lg">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Where “{img.filename}” is used</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
      </div>
      <div className="p-4 max-h-[60vh] overflow-auto">
        {err && <p className="text-xs text-red-600">{err}</p>}
        {!err && usages === null && <p className="text-xs text-gray-500">Loading…</p>}
        {usages && <UsageList usages={usages} />}
      </div>
    </Modal>
  );
}
