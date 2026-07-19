"use client";

/**
 * Picker over the help-image library (GET /api/help/images). Lets a SuperAdmin
 * CHOOSE an image for a guide section (sets its `image` to /api/help/images/<id>)
 * or replace the current one. Uploading, deleting, usage inspection, and
 * replace-everywhere live in the SuperAdmin Image Library
 * (/dashboard/admin/image-library) — this dialog only picks.
 */
import { useEffect, useState } from "react";
import Link from "next/link";

type Img = {
  id: string; url: string; filename: string;
  screenName: string; diagramName: string | null; alt: string | null;
  width: number | null; height: number | null; createdAt: string;
};

export function ImagePickerDialog({ onPick, onClose }: { onPick: (url: string, alt: string | null, filename: string) => void; onClose: () => void }) {
  const [images, setImages] = useState<Img[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[52rem] max-w-[94vw] max-h-[82vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Choose an image</h2>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin/image-library" target="_blank" className="text-xs text-blue-600 hover:underline">Manage library ↗</Link>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
          </div>
        </div>
        <div className="p-4 overflow-auto">
          {loading && <p className="text-sm text-gray-500">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && images.length === 0 && (
            <p className="text-sm text-gray-500">
              No images yet. Add them in the <Link href="/dashboard/admin/image-library" target="_blank" className="text-blue-600 hover:underline">Image Library</Link>,
              or use the camera button (bottom-left) on any screen to capture one.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            {images.map((img) => (
              <button key={img.id} onClick={() => onPick(img.url, img.alt, img.filename)}
                className="border border-gray-200 rounded overflow-hidden text-left hover:border-blue-300 hover:ring-1 hover:ring-blue-200" title="Use this image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt ?? img.filename} className="w-full h-32 object-contain bg-gray-50" />
                <div className="px-2 py-1.5">
                  <p className="text-[11px] text-gray-800 truncate" title={img.filename}>{img.screenName}{img.diagramName ? ` — ${img.diagramName}` : ""}</p>
                  <p className="text-[10px] text-gray-400 truncate">{img.width}×{img.height}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
