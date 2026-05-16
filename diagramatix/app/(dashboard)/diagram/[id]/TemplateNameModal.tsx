"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  onSave: (name: string, group: string | null) => void | Promise<void>;
  onClose: () => void;
  initialName?: string;
  initialGroup?: string | null;
  /** Existing group names in the destination list (user OR builtin). Used to
   *  offer a quick-pick list under the name field so the user re-uses
   *  existing categories instead of re-typing. */
  knownGroups?: string[];
  title?: string;
}

export function TemplateNameModal({ onSave, onClose, initialName, initialGroup, knownGroups, title }: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [group, setGroup] = useState(initialGroup ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const trimmed = group.trim();
      await onSave(name.trim(), trimmed.length > 0 ? trimmed : null);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSave();
  }

  // Dedup + sort known groups for the quick-pick chips.
  const groupSuggestions = (knownGroups ?? []).filter((g, i, arr) => arr.indexOf(g) === i).sort((a, b) => a.localeCompare(b));

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
        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
          <div>
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
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Group <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="e.g. Patterns, Demo, Onboarding"
              list="template-group-suggestions"
            />
            {groupSuggestions.length > 0 && (
              <>
                <datalist id="template-group-suggestions">
                  {groupSuggestions.map((g) => <option key={g} value={g} />)}
                </datalist>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {groupSuggestions.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGroup(g)}
                      className={`px-1.5 py-0.5 text-[10px] rounded border ${
                        group === g
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
