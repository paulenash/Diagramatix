"use client";

import { useMemo, useRef, useState } from "react";
import {
  childLevelFor, ENTITY_NODE_LEVEL_LABELS, idsWithChildren, visibleSuggestions,
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
  onCommit, onCommitNew, onNameOnly, onCancel,
}: {
  box: { x: number; y: number; width: number; height: number };
  fontSizePx: number;
  suggestions: EntitySuggestion[];
  defaultName?: string;
  allowNew: boolean;
  flatLevel: EntityNodeLevel | null;   // set → flat list (no placement dialog)
  onCommit: (name: string) => void;
  onCommitNew: (name: string, level: EntityNodeLevel, parentId: string | null) => void;
  // When present, a brand-new name (not already in the list) prompts "Add to
  // list" vs "Name only". "Name only" just labels the element (stays off-list,
  // so Entity Drift flags it). Absent → new names are always added to the list.
  onNameOnly?: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultName ?? "");
  const [touched, setTouched] = useState(false);
  const [hi, setHi] = useState(0);
  const [placing, setPlacing] = useState(false);     // placement dialog open
  const [asking, setAsking] = useState(false);       // "add to list vs name only" prompt
  const [placeParent, setPlaceParent] = useState<string | "">(""); // "" = top level
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); // hierarchy: collapsed ids
  const suppressBlur = useRef(false);
  const toggleCollapse = (id: string) => setCollapsed((prev) => {
    const nx = new Set(prev); if (nx.has(id)) nx.delete(id); else nx.add(id); return nx;
  });

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!touched || !q) return suggestions;
    return suggestions.filter(s => s.name.toLowerCase().includes(q));
  }, [value, touched, suggestions]);

  // While actively filtering by typed text, show the flat matches (collapse is
  // moot); otherwise show the tree with collapsed subtrees hidden. `rows` is the
  // list actually rendered AND the one keyboard nav walks.
  const withKids = useMemo(() => idsWithChildren(suggestions), [suggestions]);
  const filtering = touched && !!value.trim();
  const rows = useMemo(
    () => (filtering ? filtered : visibleSuggestions(suggestions, collapsed)),
    [filtering, filtered, suggestions, collapsed],
  );

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
      // Brand-new name. When onNameOnly is wired, ask whether to add it to the
      // list or just name the element (leaving it as Entity-Drift divergence).
      if (onNameOnly) { setAsking(true); return; }
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
          onBlur={() => { if (!suppressBlur.current && !placing && !asking) commit(); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
            if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, rows.length - 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); return; }
            if (e.key === "Enter") {
              e.preventDefault();
              // Unmodified default → accept it.
              if (!touched && defaultName) { onCommit(defaultName); return; }
              // Highlighted row wins when the list is showing matches.
              if (touched && rows[hi]) { onCommit(rows[hi].name); return; }
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
        {rows.length > 0 && (
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
            {!filtering && withKids.size > 0 && (
              <div style={{ display: "flex", gap: 8, padding: "3px 8px", borderBottom: "1px solid #f3f4f6" }}>
                <button type="button" onClick={() => setCollapsed(new Set())}
                  style={{ fontSize: 10, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Expand all</button>
                <span style={{ color: "#d1d5db", fontSize: 10 }}>·</span>
                <button type="button" onClick={() => setCollapsed(new Set(withKids))}
                  style={{ fontSize: 10, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Collapse all</button>
              </div>
            )}
            {rows.map((s, i) => (
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
                {!filtering && withKids.has(s.id) ? (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); toggleCollapse(s.id); }}
                    title={collapsed.has(s.id) ? "Expand" : "Collapse"}
                    style={{ fontSize: 9, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: 0, marginRight: 4, width: 10 }}>
                    {collapsed.has(s.id) ? "▸" : "▾"}
                  </button>
                ) : (!filtering ? <span style={{ display: "inline-block", width: 10, marginRight: 4 }} /> : null)}
                <span style={{ color: "#9ca3af", fontSize: 9, marginRight: 6 }}>{ENTITY_NODE_LEVEL_LABELS[s.level]}</span>
                {s.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {asking && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]"
          onMouseDown={() => { suppressBlur.current = true; }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              “{value.trim()}” isn’t in the list
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              Add it to the entity list, or just name this element? A name-only
              element stays off-list and shows up under “Highlight Entity List Changes”.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const v = value.trim();
                  setAsking(false);
                  if (flatLevel) { onCommitNew(v, flatLevel, null); }
                  else { setPlacing(true); }   // hierarchy → choose where next
                }}
                className="text-xs px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-left"
              >
                <span className="font-medium">Add to list</span>
                <span className="block text-[10px] text-blue-100">Becomes part of the structure</span>
              </button>
              <button
                onClick={() => { onNameOnly?.(value.trim()); }}
                className="text-xs px-3 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-left"
              >
                <span className="font-medium">Name only</span>
                <span className="block text-[10px] text-gray-400">Off-list — will show as drift</span>
              </button>
              <button
                onClick={() => { setAsking(false); suppressBlur.current = false; }}
                className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-800 self-end mt-1"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

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
