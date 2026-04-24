"use client";

/**
 * Popup grid for choosing an ArchiMate relationship type.
 *
 * Opened by Canvas.tsx after the user completes a connector drag on an
 * ArchiMate diagram. The picker is fully independent of the BPMN / Domain
 * connector flow.
 *
 * Keys: Esc cancels; Enter commits the currently-highlighted type.
 * Clicking outside the popup cancels.
 *
 * The default preselection is "archi-triggering" (replaces the old
 * sequence-style default).
 */

import { useEffect, useRef, useState } from "react";
import type { ArchimateConnectorType } from "@/app/lib/diagram/types";
import { ArchimateConnectorPreview } from "./ArchimateConnectorRenderer";

interface Props {
  x: number;              // screen position (anchor) — picker opens near here
  y: number;
  onSelect: (type: ArchimateConnectorType) => void;
  onCancel: () => void;
}

interface Entry {
  type: ArchimateConnectorType;
  label: string;
  group: "Structural" | "Dependency" | "Dynamic" | "Other";
}

const ENTRIES: Entry[] = [
  { type: "archi-composition",    label: "Composition",     group: "Structural" },
  { type: "archi-aggregation",    label: "Aggregation",     group: "Structural" },
  { type: "archi-assignment",     label: "Assignment",      group: "Structural" },
  { type: "archi-realisation",    label: "Realisation",     group: "Structural" },
  { type: "archi-serving",        label: "Serving",         group: "Dependency" },
  { type: "archi-access",         label: "Access",          group: "Dependency" },
  { type: "archi-influence",      label: "Influence",       group: "Dependency" },
  { type: "archi-association",    label: "Association",     group: "Dependency" },
  { type: "archi-triggering",     label: "Triggering",      group: "Dynamic" },
  { type: "archi-flow",           label: "Flow",            group: "Dynamic" },
  { type: "archi-specialisation", label: "Specialisation",  group: "Other" },
];

const GROUPS: Entry["group"][] = ["Structural", "Dependency", "Dynamic", "Other"];
const DEFAULT_TYPE: ArchimateConnectorType = "archi-triggering";

export function ArchimateConnectorPicker({ x, y, onSelect, onCancel }: Props) {
  const [hovered, setHovered] = useState<ArchimateConnectorType>(DEFAULT_TYPE);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the popup on screen: clamp against viewport.
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width > vw - 8) left = vw - rect.width - 8;
    if (top + rect.height > vh - 8) top = vh - rect.height - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    setPos({ left, top });
  }, [x, y]);

  // Keyboard: Esc cancel, Enter commit current hover.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") { ev.preventDefault(); onCancel(); }
      else if (ev.key === "Enter") { ev.preventDefault(); onSelect(hovered); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hovered, onSelect, onCancel]);

  // Dismiss on outside click.
  useEffect(() => {
    function onDown(ev: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(ev.target as Node)) onCancel();
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onCancel]);

  return (
    <div
      ref={rootRef}
      className="fixed z-50 rounded-md border border-gray-300 bg-white shadow-xl"
      style={{ left: pos.left, top: pos.top, padding: 8, minWidth: 300 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="text-xs font-semibold text-gray-700 mb-1">
        ArchiMate relationship
      </div>
      {GROUPS.map((g) => {
        const groupEntries = ENTRIES.filter((e) => e.group === g);
        return (
          <div key={g} className="mb-1 last:mb-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-800 mb-0.5 px-1">{g}</div>
            <div className="grid grid-cols-2 gap-1">
              {groupEntries.map((e) => {
                const isHover = hovered === e.type;
                return (
                  <button
                    key={e.type}
                    type="button"
                    className={`flex items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                      isHover ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-gray-50"
                    }`}
                    onMouseEnter={() => setHovered(e.type)}
                    onFocus={() => setHovered(e.type)}
                    onClick={() => onSelect(e.type)}
                    title={e.label}
                  >
                    <svg width={44} height={14} viewBox="0 0 44 14" className="flex-shrink-0">
                      <ArchimateConnectorPreview type={e.type} width={44} height={14} />
                    </svg>
                    <span className="truncate">{e.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="mt-1 border-t border-gray-100 pt-1 text-[10px] text-gray-500 px-1">
        Enter commits · Esc cancels
      </div>
    </div>
  );
}
