"use client";

import { useEffect, useRef, useState } from "react";

/** A small rename modal (never a browser prompt): used by the right-click menus for diagrams, folders and the project. */
export function RenameDialog({ title, initial, onSave, onClose }: { title: string; initial: string; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const ok = name.trim().length > 0 && name.trim() !== initial.trim();
  const save = () => { if (ok) onSave(name.trim()); };
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={onClose} data-testid="rename-dialog">
      <div role="dialog" aria-label={title} className="w-full max-w-md rounded-xl bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 mb-2">{title}</h2>
        <input ref={input} value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-800" />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={!ok} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Rename</button>
        </div>
      </div>
    </div>
  );
}
