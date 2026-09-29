"use client";

/**
 * Rename a project or a diagram on the phone (2026-09-29). A bottom sheet, as
 * the phone's other sheets — never a browser dialog. The caller does the save
 * (onSave resolves to an error message, or null when saved) so the same sheet
 * serves both.
 */
import { useState } from "react";
import { cleanName } from "@/app/lib/mobile/rename";

export function MobileRenameSheet({
  title, label, initial, note, onSave, onClose,
}: {
  title: string;
  label: string;
  /** The name as it is now. */
  initial: string;
  /** An extra line, when renaming has a side effect worth knowing. */
  note?: string;
  /** Save the new (trimmed) name; resolves to what went wrong, or null when saved. */
  onSave: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const check = cleanName(value, initial);

  async function save() {
    if (!check.ok || busy) return;
    setBusy(true);
    setErr(null);
    const failed = await onSave(check.name);
    setBusy(false);
    if (failed) { setErr(failed); return; }
    onClose();
  }

  function close() {
    if (busy) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={close}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-white rounded-t-2xl shadow-xl p-4 pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button onClick={close} disabled={busy} className="text-gray-400 text-xl leading-none px-1 disabled:opacity-40" aria-label="Close">×</button>
        </div>
        <label className="block text-xs text-gray-500 mb-1">{label}</label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          disabled={busy}
          className="w-full text-base text-gray-900 border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
        {note && <p className="text-[11px] text-gray-500 mt-1.5">{note}</p>}
        {!check.ok && check.reason === "empty" && <p className="text-[11px] text-amber-700 mt-1.5">A name is needed.</p>}
        {err && <p className="text-[12px] text-amber-800 bg-amber-50 rounded-md px-2 py-1.5 mt-2">{err}</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={close} disabled={busy} className="flex-1 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg active:bg-gray-50 disabled:opacity-40">Cancel</button>
          <button onClick={() => void save()} disabled={!check.ok || busy}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg disabled:opacity-40 active:bg-blue-700">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
