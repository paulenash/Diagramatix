"use client";

/**
 * The one place a browser-side file becomes a `planBpmn` Attachment.
 *
 * `handleFileAttach` was duplicated in AiPanel and PlanPanel, byte for byte, and
 * BOTH copies had the same bug: `.docx` is in the accept list but falls through
 * to `file.text()`, so a Word document arrives at the model as stringified ZIP
 * bytes. It does not fail loudly — it produces a diagram from noise.
 *
 * Extracting it fixes that once, gives the harness its uploader free, and mirrors
 * the server-side `attachmentFromFile` so the two paths cannot drift.
 */
import { useCallback, useRef, useState } from "react";
import { arrayBufferToBase64 } from "@/app/lib/base64";
import type { Attachment } from "@/app/lib/ai/planBpmn";

export const MAX_ATTACH_BYTES = 10 * 1024 * 1024;

export const ATTACH_ACCEPT =
  ".pdf,.txt,.md,.csv,.rtf,.docx,.png,.jpg,.jpeg,.webp,.gif,image/*";

/** Browser MIME → the IANA type the vision API wants. */
const IMAGE_TYPES: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface UseFileAttach {
  attachment: NonNullable<Attachment> | null;
  setAttachment: (a: NonNullable<Attachment> | null) => void;
  /** Natural pixel size of an attached image, for aspect-preserving import. */
  imageDims: React.MutableRefObject<{ w: number; h: number } | null>;
  /** Returns an error message, or null on success. */
  attach: (file: File) => Promise<string | null>;
  clear: () => void;
}

export function useFileAttach(): UseFileAttach {
  const [attachment, setAttachment] = useState<NonNullable<Attachment> | null>(null);
  const imageDims = useRef<{ w: number; h: number } | null>(null);

  const attach = useCallback(async (file: File): Promise<string | null> => {
    if (file.size > MAX_ATTACH_BYTES) return "File too large (max 10MB)";
    const name = file.name;
    const lower = name.toLowerCase();

    if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
      setAttachment({ name, type: "pdf", data: arrayBufferToBase64(await file.arrayBuffer()) });
      return null;
    }

    const mediaType = IMAGE_TYPES[file.type];
    if (mediaType) {
      const data = arrayBufferToBase64(await file.arrayBuffer());
      setAttachment({ name, type: "image", data, mediaType });
      imageDims.current = null;
      try {
        const img = new window.Image();
        img.onload = () => { imageDims.current = { w: img.naturalWidth, h: img.naturalHeight }; };
        img.src = `data:${mediaType};base64,${data}`;
      } catch { /* dimensions are an optimisation, not a requirement */ }
      return null;
    }

    // THE BUG THIS EXTRACTION FIXES. Word is a ZIP; reading it as text produces
    // `PK\x03\x04…`. mammoth is already a dependency and loads lazily, so the
    // cost lands only on someone who actually attaches a .docx.
    if (file.type === DOCX_MIME || lower.endsWith(".docx")) {
      try {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        const text = value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        if (!text) return "That Word document has no readable text in it.";
        setAttachment({ name, type: "text", data: text });
        return null;
      } catch {
        return "That Word document could not be read. Save it as a PDF and try again.";
      }
    }

    // Legacy binary Office cannot be read at all — say so rather than sending
    // its bytes as if they were prose.
    if (lower.endsWith(".doc") || lower.endsWith(".xls") || lower.endsWith(".ppt")) {
      return "That is an older Office format we cannot read. Save it as .docx or PDF.";
    }

    setAttachment({ name, type: "text", data: await file.text() });
    return null;
  }, []);

  const clear = useCallback(() => {
    setAttachment(null);
    imageDims.current = null;
  }, []);

  return { attachment, setAttachment, imageDims, attach, clear };
}
