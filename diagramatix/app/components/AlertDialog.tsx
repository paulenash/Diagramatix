"use client";

import { useEffect } from "react";

interface Props {
  title?: string;
  message: string;
  /** "info" | "error" — drives the icon + accent colour. */
  tone?: "info" | "error";
  closeLabel?: string;
  onClose: () => void;
}

/**
 * Diagramatix-native replacement for `window.alert`. Title + message +
 * single OK button. Escape and Enter both close. Use this — NEVER use
 * `window.alert` (see feedback_no_browser_dialogs memory).
 */
export function AlertDialog({
  title,
  message,
  tone = "info",
  closeLabel = "OK",
  onClose,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const accent = tone === "error"
    ? "bg-red-600 hover:bg-red-700"
    : "bg-blue-600 hover:bg-blue-700";
  const heading = title ?? (tone === "error" ? "Error" : "Notice");

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="px-5 py-4">
          <h3 className={`text-sm font-semibold mb-2 ${tone === "error" ? "text-red-700" : "text-gray-900"}`}>{heading}</h3>
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{message}</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            autoFocus
            className={`px-3 py-1.5 text-xs font-medium text-white rounded ${accent}`}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
