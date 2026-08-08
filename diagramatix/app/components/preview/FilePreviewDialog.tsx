"use client";

import { useEffect, useMemo, useState } from "react";
import { renderHelpMarkdown } from "@/app/lib/help/renderMarkdown";
import { formatXml } from "@/app/lib/preview/formatXml";
import { highlightJson, highlightXml, highlightSql, PEACEFUL } from "@/app/lib/preview/highlight";

export type PreviewKind = "pdf" | "svg" | "json" | "xml" | "bpmn" | "ddl" | "markdown" | "docx" | "vsdx";

export interface PreviewPayload {
  kind: PreviewKind;
  title: string;
  /** Text for svg/json/xml/bpmn/ddl/markdown, and the diagram SVG string for vsdx. */
  text?: string;
  /** Bytes for pdf / docx. */
  blob?: Blob;
  /** Optional real-file download from the footer. */
  downloadName?: string;
  downloadMime?: string;
}

const MONO = "text-[11px] leading-relaxed whitespace-pre font-mono";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * In-app preview of an exported file, for demonstrating exports on camera during
 * a screencast (no download / external app needed). One modal, switched by
 * `kind`. Carries `data-no-capture` so the preview chrome never leaks into a
 * screen-capture snapshot. Mirrors AttachmentPreviewDialog's 3-row layout.
 *
 * docx (mammoth) and vsdx (fake-Visio) branches are added in later slices; this
 * slice handles pdf / svg / json / xml / bpmn / ddl / markdown.
 */
export function FilePreviewDialog({ payload, onClose }: { payload: PreviewPayload; onClose: () => void }) {
  const { kind, title, text = "", blob } = payload;
  const [copied, setCopied] = useState(false);

  // PDFs render most reliably from a blob URL in an iframe.
  const blobUrl = useMemo(() => {
    if ((kind === "pdf") && blob) return URL.createObjectURL(blob);
    return null;
  }, [kind, blob]);
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // DOCX → HTML via mammoth (lazy-loaded). Content preview only — exact Word
  // template styling / figure pages aren't reproduced.
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxError, setDocxError] = useState(false);
  useEffect(() => {
    if (kind !== "docx" || !blob) return;
    let on = true;
    setDocxHtml(null); setDocxError(false);
    (async () => {
      try {
        const ab = await blob.arrayBuffer();
        const mod = await import("mammoth");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mm: any = (mod as any).default ?? mod;
        const r = await mm.convertToHtml({ arrayBuffer: ab });
        if (on) setDocxHtml(r.value as string);
      } catch { if (on) setDocxError(true); }
    })();
    return () => { on = false; };
  }, [kind, blob]);

  const isText = kind === "json" || kind === "xml" || kind === "bpmn" || kind === "ddl";

  // Pretty (plain) text — used for Copy/Download — and the colour-highlighted HTML.
  const pretty = useMemo(() => {
    if (kind === "json") { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } }
    if (kind === "xml" || kind === "bpmn") return formatXml(text);
    return text;
  }, [kind, text]);
  const highlighted = useMemo(() => {
    if (kind === "json") return highlightJson(pretty);
    if (kind === "xml" || kind === "bpmn") return highlightXml(pretty);
    if (kind === "ddl") return highlightSql(pretty);
    return "";
  }, [kind, pretty]);

  function copy() {
    void navigator.clipboard?.writeText(pretty).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  function doDownload() {
    if (blob) { download(blob, payload.downloadName ?? title); return; }
    if (text) download(new Blob([kind === "json" || kind === "xml" || kind === "bpmn" ? pretty : text], { type: payload.downloadMime ?? "text/plain" }), payload.downloadName ?? title);
  }

  return (
    <div data-no-capture className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[88vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate" title={title}>{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0 ml-2" title="Close">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto min-h-0 bg-gray-50 p-4">
          {kind === "pdf" && (blobUrl
            ? <iframe src={blobUrl} title={title} className="w-full h-[68vh] border border-gray-200 rounded bg-white" />
            : <p className="text-xs text-gray-500">Couldn&apos;t render this PDF for preview.</p>)}

          {kind === "svg" && (
            <div className="bg-white border border-gray-200 rounded p-2 [&_svg]:max-w-full [&_svg]:h-auto flex items-center justify-center overflow-auto"
              dangerouslySetInnerHTML={{ __html: text }} />
          )}

          {isText && (
            <pre className={`${MONO} rounded p-3 overflow-auto`}
              style={{ background: PEACEFUL.bg, color: PEACEFUL.text }}
              dangerouslySetInnerHTML={{ __html: highlighted }} />
          )}

          {kind === "markdown" && (
            <div className="prose prose-sm max-w-none bg-white border border-gray-200 rounded p-4"
              dangerouslySetInnerHTML={{ __html: renderHelpMarkdown(text) }} />
          )}

          {kind === "docx" && (
            docxError ? <p className="text-xs text-red-600">Couldn&apos;t render this document for preview.</p>
            : docxHtml == null ? <p className="text-xs text-gray-500">Rendering document…</p>
            : <div className="prose prose-sm max-w-none bg-white border border-gray-200 rounded p-6"
                dangerouslySetInnerHTML={{ __html: docxHtml }} />
          )}

          {kind === "vsdx" && (
            <p className="text-xs text-gray-500">Preview for this type is added in a later update.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
          {isText && (
            <button onClick={copy} className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">
              {copied ? "Copied ✓" : "Copy"}
            </button>
          )}
          <button onClick={doDownload} className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Download</button>
          <button onClick={onClose} className="px-4 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700">Continue</button>
        </div>
      </div>
    </div>
  );
}
