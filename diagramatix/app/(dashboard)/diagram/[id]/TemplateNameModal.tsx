"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  onSave: (name: string) => void | Promise<void>;
  onClose: () => void;
  initialName?: string;
  title?: string;
}

export function TemplateNameModal({ onSave, onClose, initialName, title }: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(name.trim());
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSave();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-sm flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-800">{title ?? "Save Template"}</h2>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 text-lg leading-none disabled:opacity-30">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-4 py-4">
          <label className="block text-xs text-gray-600 mb-1">Template Name</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            placeholder="Enter template name..."
          />
        </form>
        <div className="flex justify-end gap-2 px-4 py-3 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className={`px-3 py-1.5 text-xs rounded ${
              saving
                ? "bg-green-600 text-white"
                : "bg-blue-600 text-white hover:bg-blue-700"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {saving ? "Saving\u2026" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
