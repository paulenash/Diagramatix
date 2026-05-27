"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional client-side validator. Return an error string to block
   *  the confirm and surface the message; return null to accept. */
  validate?: (value: string) => string | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * Diagramatix-native replacement for `window.prompt`. Single text input
 * with title / optional message / OK / Cancel. Enter submits, Escape
 * cancels. Use this — NEVER use `window.prompt` (see
 * feedback_no_browser_dialogs memory).
 */
export function PromptDialog({
  title,
  message,
  defaultValue = "",
  placeholder,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  validate,
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(handle);
  }, []);

  function handleConfirm() {
    const v = value.trim();
    const err = validate ? validate(v) : null;
    if (err) { setError(err); return; }
    onConfirm(v);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
          {message && <p className="text-xs text-gray-600 leading-relaxed mb-2">{message}</p>}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleConfirm(); }
              if (e.key === "Escape") { e.preventDefault(); onCancel(); }
            }}
            placeholder={placeholder}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400"
          />
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
