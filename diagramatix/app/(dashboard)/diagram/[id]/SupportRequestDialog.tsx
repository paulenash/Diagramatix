"use client";

import { useEffect, useState } from "react";

interface Props {
  diagramId: string;
  diagramName: string;
  // The live canvas SVG element. We snapshot it to SVG on send. Can be null
  // if the canvas isn't mounted (the send still works — the SVG is omitted and
  // support gets the JSON only).
  getSvgEl: () => SVGSVGElement | null;
  onClose: () => void;
  onSent: () => void;
}

// SupportRequestDialog — "Get help with this diagram".
//
// Two-field form (subject + message) plus an automatic SVG snapshot of
// the current canvas. Submits to /api/support/diagram, which emails
// support@diagramatix.com.au with the user's email as Reply-To.
//
// The subject is pre-filled as "Help with: <diagram name>" so single-
// click sending is fast; the user can edit it.
export function SupportRequestDialog({
  diagramId,
  diagramName,
  getSvgEl,
  onClose,
  onSent,
}: Props) {
  const [subject, setSubject] = useState(`Help with: ${diagramName}`);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-focus the message textarea when the dialog opens — the subject
  // already has a sensible default, so the user wants to start typing
  // their question.
  useEffect(() => {
    const el = document.getElementById("support-message");
    if (el instanceof HTMLTextAreaElement) {
      // Small delay so the focus call wins against any browser-level
      // focus restoration from the trigger button.
      setTimeout(() => el.focus(), 50);
    }
  }, []);

  async function handleSubmit() {
    if (submitting) return;
    if (!message.trim()) {
      setError("Tell support what you need help with.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Snapshot the canvas to SVG. Best-effort — if serialisation fails
      // (e.g. missing SVG element), we still send the JSON-only email so the
      // user's request isn't lost.
      let svgBase64: string | null = null;
      try {
        svgBase64 = await snapshotCanvasToSvg(getSvgEl());
      } catch (err) {
        console.warn("[support] SVG snapshot failed; sending JSON only:", err);
      }

      const res = await fetch("/api/support/diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagramId,
          subject: subject.trim(),
          message: message.trim(),
          svgBase64,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setError(err.error ?? `Send failed (${res.status})`);
        return;
      }
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Send to support</h3>
          <p className="text-xs text-gray-600 mt-1">
            We&apos;ll email <strong>support@diagramatix.com.au</strong> with your message, an SVG
            of this diagram, and its JSON. Replies come back to you.
          </p>
        </div>

        <div className="px-5 py-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label htmlFor="support-message" className="block text-xs font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs resize-y"
              placeholder="What do you need help with?"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 border border-red-200 bg-red-50 rounded px-2 py-1">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !message.trim()}
            autoFocus
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
          >
            {submitting ? "Sending…" : "Send to support"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Serialize the canvas SVG and return it base64-encoded (no `data:` prefix,
// matching the JSON transport so the server can Buffer-decode directly).
//
// Returns null if there's no SVG to snapshot. Unlike the former PNG path this
// keeps the diagram as true vector art — crisp at any zoom and editable.
async function snapshotCanvasToSvg(svgEl: SVGSVGElement | null): Promise<string | null> {
  if (!svgEl) return null;

  // Clone + strip interactive overlays so the snapshot matches what's visible
  // on the canvas, not the editor's hover affordances.
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("tabindex");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.querySelectorAll("[data-interactive]").forEach((n) => n.remove());

  const serialized = new XMLSerializer().serializeToString(clone);
  // UTF-8-safe base64 (handles any unicode in labels).
  return btoa(unescape(encodeURIComponent(serialized)));
}
