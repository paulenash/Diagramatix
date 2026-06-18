"use client";

import { useMemo, useRef, useState } from "react";
import {
  childLevelFor, ENTITY_NODE_LEVEL_LABELS,
  type EntitySuggestion, type EntityNodeLevel,
} from "@/app/lib/entityLists/types";

/**
 * Inline pool/lane name editor backed by an entity structure. Shows the
 * whole indented hierarchy (or a flat list), filters as you type, Enter
 * accepts the pre-filled default, ↑/↓ navigate, click/Enter on a row uses
 * it, and a brand-new name opens an app-native placement dialog (for the
 * hierarchy) before persisting. Replaces the pool/lane <textarea> overlay.
 */
export function EntityNameInput({
  box, fontSizePx, suggestions, defaultName, allowNew, flatLevel,
  onCommit, onCommitNew, onCancel,
}: {
  box: { x: number; y: number; width: number; height: number };
  fontSizePx: number;
  suggestions: EntitySuggestion[];
  defaultName?: string;
  allowNew: boolean;
  flatLevel: EntityNodeLevel | null;   // set → flat list (no placement dialog)
  onCommit: (name: string) => void;
  onCommitNew: (name: string, level: EntityNodeLevel, parentId: string | null) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultName ?? "");
  const [touched, setTouched] = useState(false);
  const [hi, setHi] = useState(0);
  const [placing, setPlacing] = useState(false);     // placement dialog open
  const [placeParent, setPlaceParent] = useState<string | "">(""); // "" = top level
  const suppressBlur = useRef(false);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!touched || !q) return suggestions;
    return suggestions.filter(s => s.name.toLowerCase().includes(q));
  }, [value, touched, suggestions]);

  const exact = suggestions.find(s => s.name.toLowerCase() === value.trim().toLowerCase());

  function commit() {
    const v = value.trim();
    if (!v) { onCancel(); return; }
    if (exact) { onCommit(exact.name); return; }
    if (filtered.length && hi >= 0 && hi < filtered.length && touched && v) {
      // fall through only if the highlighted row is what they want — but a
      // typed exact takes priority above; here use highlighted on explicit nav
    }
    if (allowNew) {
      if (flatLevel) { onCommitNew(v, flatLevel, null); return; }
      setPlacing(true); return;       // hierarchy → ask where
    }
    onCommit(v);
  }

  function confirmPlacement() {
    const v = value.trim();
    const parent = placeParent ? suggestions.find(s => s.id === placeParent) ?? null : null;
    const level: EntityNodeLevel = parent ? childLevelFor(parent.level) : "Organisation";
    onCommitNew(v, level, parent?.id ?? null);
  }

  return (
    <>
      <div style={{ position: "absolute", left: box.x, top: box.y, zIndex: 50 }}>
        <input
          autoFocus
          value={value}
          onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0); }}
          onChange={(e) => { setValue(e.target.value); setTouched(true); setHi(0); }}
          onBlur={() => { if (!suppressBlur.current && !placing) commit(); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
            if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); return; }
            if (e.key === "Enter") {
              e.preventDefault();
              // Unmodified default → accept it.
              if (!touched && defaultName) { onCommit(defaultName); return; }
              // Highlighted row wins when the list is showing matches.
              if (touched && filtered[hi]) { onCommit(filtered[hi].name); return; }
              commit();
            }
          }}
          placeholder="Name…"
          style={{
            width: box.width, height: box.height,
            fontSize: fontSizePx, textAlign: "left",
            background: "white", border: "2px solid #7c3a2a", borderRadius: 4,
            outline: "none", padding: "4px", boxSizing: "border-box",
          }}
        />
        {filtered.length > 0 && (
          <div
            onMouseDown={() => { suppressBlur.current = true; }}
            onMouseUp={() => { suppressBlur.current = false; }}
            style={{
              maxHeight: 200, overflowY: "auto", minWidth: Math.max(160, box.width),
              background: "white", border: "1px solid #d1d5db", borderTop: "none",
              borderRadius: "0 0 4px 4px", boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
              fontSize: 12,
            }}
          >
            {filtered.map((s, i) => (
              <div
                key={s.id}
                onMouseEnter={() => setHi(i)}
                onClick={() => onCommit(s.name)}
                style={{
                  paddingLeft: s.depth * 12 + 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
                  cursor: "pointer", whiteSpace: "nowrap",
                  background: i === hi ? "#eef2ff" : "white",
                  color: "#374151",
                }}
              >
                <span style={{ color: "#9ca3af", fontSize: 9, marginRight: 6 }}>{ENTITY_NODE_LEVEL_LABELS[s.level]}</span>
                {s.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {placing && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]"
          onMouseDown={() => { suppressBlur.current = true; }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Add to structure</h3>
            <p className="text-xs text-gray-600 mb-3">Where does <span className="font-medium">“{value.trim()}”</span> belong?</p>
            <label className="block text-xs font-medium text-gray-700 mb-1">Parent</label>
            <select value={placeParent} onChange={(e) => setPlaceParent(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700">
              <option value="">— Top level (Organisation) —</option>
              {suggestions.filter(s => s.level !== "Role").map(s => (
                <option key={s.id} value={s.id}>{" ".repeat(s.depth * 2)}{s.name} ({ENTITY_NODE_LEVEL_LABELS[s.level]})</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              Will be added as {(() => { const p = placeParent ? suggestions.find(s => s.id === placeParent) : null; return ENTITY_NODE_LEVEL_LABELS[p ? childLevelFor(p.level) : "Organisation"]; })()}.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setPlacing(false); suppressBlur.current = false; }} className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={confirmPlacement} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">Add &amp; use</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
