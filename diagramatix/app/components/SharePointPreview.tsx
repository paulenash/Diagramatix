"use client";

import { useEffect, useState } from "react";

interface Props {
  driveId: string;
  itemId: string;
  name: string;
  webUrl?: string;
  onClose: () => void;
}

/**
 * Embedded preview of a SharePoint / OneDrive file. Asks Graph for a
 * short-lived embeddable URL (via /api/sharepoint?action=preview) and shows it
 * in an iframe inside Diagramatix — no leaving the app. Office docs, PDFs and
 * images preview reliably; other types fall back to an "Open in SharePoint" link.
 */
export function SharePointPreview({ driveId, itemId, name, webUrl, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setUrl(null); setError(null);
      try {
        const r = await fetch(`/api/sharepoint?action=preview&driveId=${encodeURIComponent(driveId)}&itemId=${encodeURIComponent(itemId)}`);
        if (r.status === 403) throw new Error("Microsoft account not connected.");
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not load preview");
        const data = await r.json();
        if (cancelled) return;
        if (data?.url) setUrl(data.url);
        else setError("No preview is available for this file type.");
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Could not load preview");
      }
    })();
    return () => { cancelled = true; };
  }, [driveId, itemId]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[70]" onMouseDown={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl flex flex-col w-full max-w-4xl mx-4"
        style={{ height: "85vh" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{name}</h3>
          <div className="flex items-center gap-2">
            {webUrl && (
              <a href={webUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline">Open in SharePoint ↗</a>
            )}
            <button onClick={onClose}
              className="px-2 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50">
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-gray-50">
          {error ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <p className="text-sm text-gray-700 mb-1">{error}</p>
              {webUrl && (
                <a href={webUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline mt-2">Open the file in SharePoint ↗</a>
              )}
            </div>
          ) : url ? (
            <iframe src={url} title={name} className="w-full h-full border-0" />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-400">Loading preview…</div>
          )}
        </div>
      </div>
    </div>
  );
}
