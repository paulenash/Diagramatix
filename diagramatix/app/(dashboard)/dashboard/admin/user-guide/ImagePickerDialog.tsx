"use client";

/**
 * Picker over the captured help-image library (GET /api/help/images). Lets a
 * SuperAdmin choose an image for a guide section (sets its `image` to
 * /api/help/images/<id>) or delete library entries.
 */
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { IMAGE_ACCEPT, isAllowedImage, ALLOWED_IMAGE_LABEL } from "@/app/lib/help/imageFormats";

type Img = {
  id: string; url: string; filename: string;
  screenName: string; diagramName: string | null; alt: string | null;
  width: number | null; height: number | null; createdAt: string;
};

export function ImagePickerDialog({ onPick, onClose }: { onPick: (url: string, alt: string | null, filename: string) => void; onClose: () => void }) {
  const [images, setImages] = useState<Img[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Img | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/help/images");
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setImages((await r.json()).images ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function upload(file: File) {
    if (!isAllowedImage(file.type, file.name)) {
      setError(`"${file.name}" isn't a supported image format. Allowed: ${ALLOWED_IMAGE_LABEL}.`);
      return;
    }
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("screenName", "Uploaded image");
      fd.append("filename", file.name);
      fd.append("alt", file.name.replace(/\.[^.]+$/, ""));
      const r = await fetch("/api/help/images", { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  }

  async function del(img: Img) {
    setConfirm(null);
    await fetch(`/api/help/images/${img.id}`, { method: "DELETE" });
    setImages((xs) => xs.filter((x) => x.id !== img.id));
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[52rem] max-w-[94vw] max-h-[82vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Image library</h2>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {uploading ? "Uploading…" : "Upload image…"}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
          </div>
        </div>
        <div className="p-4 overflow-auto">
          {loading && <p className="text-sm text-gray-500">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && images.length === 0 && (
            <p className="text-sm text-gray-500">No captured images yet. Use the camera button (bottom-left) on any screen to capture one.</p>
          )}
          <div className="grid grid-cols-3 gap-3">
            {images.map((img) => (
              <div key={img.id} className="border border-gray-200 rounded overflow-hidden group">
                <button onClick={() => onPick(img.url, img.alt, img.filename)} className="block w-full" title="Use this image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt ?? img.filename} className="w-full h-32 object-contain bg-gray-50" />
                </button>
                <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-800 truncate" title={img.filename}>{img.screenName}{img.diagramName ? ` — ${img.diagramName}` : ""}</p>
                    <p className="text-[10px] text-gray-400 truncate">{img.width}×{img.height}</p>
                  </div>
                  <button onClick={() => setConfirm(img)} className="text-[10px] text-red-400 hover:text-red-600 shrink-0">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {confirm && (
        <ConfirmDialog title="Delete image" message={`Delete "${confirm.filename}" from the library?`} confirmLabel="Delete" cancelLabel="Cancel" destructive
          onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
