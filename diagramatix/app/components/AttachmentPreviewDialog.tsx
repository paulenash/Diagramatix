"use client";

import { useEffect, useMemo, useState } from "react";

export interface PreviewAttachment {
  name: string;
  type: string;        // "pdf" | "text" | "image"
  data: string;        // base64 for pdf / image; raw text for text
  mediaType?: string;  // image IANA type (image attachments only)
  /** An image served from a URL instead of `data` — a diagram's kept source image. */
  url?: string;
}

/**
 * Preview an AI-generation attachment before it's used. A fixed-height modal:
 * header (file name) + a scrollable body that renders the file by type +
 * a footer with a Continue button OUTSIDE the scroll region.
 */
export function AttachmentPreviewDialog({
  attachment,
  onClose,
  wide = false,
  closeLabel = "Continue",
}: {
  attachment: PreviewAttachment;
  onClose: () => void;
  /** A large picture (a diagram's source image) gets most of the screen. */
  wide?: boolean;
  closeLabel?: string;
}) {
  const { name, type, data, mediaType, url } = attachment;
  // A kept image that can't be reached (moved to another organisation, or
  // gone) says so instead of showing a broken-image icon.
  const [broken, setBroken] = useState(false);

  // PDFs preview most reliably from a blob URL (some browsers block data: PDFs
  // in an iframe). Built once and revoked on unmount.
  const pdfUrl = useMemo(() => {
    if (type !== "pdf") return null;
    try {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    } catch {
      return null;
    }
  }, [type, data]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full ${wide ? "max-w-6xl" : "max-w-2xl"} max-h-[85vh] flex flex-col`}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate" title={name}>{name}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0 ml-2"
            title="Close"
          >
            &times;
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-auto p-4 min-h-0 bg-gray-50">
          {type === "image" && broken && (
            <p className="text-xs text-gray-500 py-10 text-center">This image is no longer available.</p>
          )}
          {type === "image" && !broken && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url ?? `data:${mediaType ?? "image/png"};base64,${data}`}
              alt={name}
              onError={() => setBroken(true)}
              className="max-w-full h-auto mx-auto rounded shadow-sm"
            />
          )}
          {type === "pdf" && (
            pdfUrl ? (
              <iframe src={pdfUrl} title={name} className="w-full h-[60vh] border border-gray-200 rounded bg-white" />
            ) : (
              <p className="text-xs text-gray-500">Couldn&apos;t render this PDF for preview.</p>
            )
          )}
          {type === "text" && (
            <pre className="text-xs text-gray-800 whitespace-pre-wrap break-words font-mono">{data}</pre>
          )}
          {type !== "image" && type !== "pdf" && type !== "text" && (
            <p className="text-xs text-gray-500">No preview available for this file type.</p>
          )}
        </div>

        {/* Footer — outside the scroll region */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end shrink-0">
          <button
            onClick={onClose}
            autoFocus
            className="px-4 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
