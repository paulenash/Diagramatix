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

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArchimateConnectorType } from "@/app/lib/diagram/types";
import { ArchimateConnectorPreview } from "./ArchimateConnectorRenderer";
import { getAllowedRelationships, loadCompatibilityMatrix } from "@/app/lib/archimate/compatibility";

interface Props {
  x: number;              // screen position (anchor) — picker opens near here
  y: number;
  /** ArchiMate name of the source element (e.g. "Business Actor"); used to
   *  filter the relationship list against the spec compatibility matrix. */
  sourceName?: string;
  /** ArchiMate name of the target element. */
  targetName?: string;
  /** Called when the user commits a relationship. For Influence, `extras`
   *  carries the chosen sign so Canvas can store it as the initial label. */
  onSelect: (type: ArchimateConnectorType, extras?: { influenceSign?: "+" | "-" }) => void;
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

export function ArchimateConnectorPicker({ x, y, sourceName, targetName, onSelect, onCancel }: Props) {
  const [hovered, setHovered] = useState<ArchimateConnectorType>(DEFAULT_TYPE);
  const [showDerived, setShowDerived] = useState(false);
  const [matrixReady, setMatrixReady] = useState(false);
  // When the user picks Influence, the picker switches into a sub-step
  // asking for the influence sign (+/-) before committing.
  const [awaitingInfluenceSign, setAwaitingInfluenceSign] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  function commit(type: ArchimateConnectorType) {
    if (type === "archi-influence") {
      setAwaitingInfluenceSign(true);
      return;
    }
    onSelect(type);
  }

  // Trigger matrix load on mount; re-render once it arrives.
  useEffect(() => {
    let cancelled = false;
    loadCompatibilityMatrix().then(() => { if (!cancelled) setMatrixReady(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const compat = useMemo(
    () => getAllowedRelationships(sourceName, targetName),
    // matrixReady toggles when the JSON arrives — recompute then.
    [sourceName, targetName, matrixReady], // eslint-disable-line react-hooks/exhaustive-deps
  );

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
  // While awaiting the influence sign: + and − keys commit; Esc returns
  // to the type picker.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (awaitingInfluenceSign) {
        if (ev.key === "Escape") { ev.preventDefault(); setAwaitingInfluenceSign(false); }
        else if (ev.key === "+" || ev.key === "=") { ev.preventDefault(); onSelect("archi-influence", { influenceSign: "+" }); }
        else if (ev.key === "-" || ev.key === "_") { ev.preventDefault(); onSelect("archi-influence", { influenceSign: "-" }); }
        return;
      }
      if (ev.key === "Escape") { ev.preventDefault(); onCancel(); }
      else if (ev.key === "Enter") { ev.preventDefault(); commit(hovered); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hovered, awaitingInfluenceSign, onSelect, onCancel]);

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
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold text-gray-700">
          {awaitingInfluenceSign ? "Influence — pick sign" : "ArchiMate relationship"}
        </div>
        {!awaitingInfluenceSign && (
          <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer select-none" title="Show relationships permitted via §5.7 derivation rules">
            <input
              type="checkbox"
              checked={showDerived}
              onChange={(e) => setShowDerived(e.target.checked)}
              className="accent-blue-600"
            />
            show derived
          </label>
        )}
      </div>
      {awaitingInfluenceSign && (
        <div>
          <div className="grid grid-cols-2 gap-2 mb-1">
            <button
              type="button"
              autoFocus
              onClick={() => onSelect("archi-influence", { influenceSign: "+" })}
              className="rounded border border-gray-300 px-3 py-3 text-base font-semibold text-gray-900 hover:bg-blue-50 hover:border-blue-400"
              title="Positive influence"
            >+ Positive</button>
            <button
              type="button"
              onClick={() => onSelect("archi-influence", { influenceSign: "-" })}
              className="rounded border border-gray-300 px-3 py-3 text-base font-semibold text-gray-900 hover:bg-blue-50 hover:border-blue-400"
              title="Negative influence"
            >− Negative</button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-gray-500 px-1">
            <span>+ / − keys also work</span>
            <button
              type="button"
              onClick={() => setAwaitingInfluenceSign(false)}
              className="text-gray-500 hover:text-gray-800"
            >back</button>
          </div>
        </div>
      )}
      {!awaitingInfluenceSign && GROUPS.map((g) => {
        const groupEntries = ENTRIES.filter((e) => e.group === g);
        return (
          <div key={g} className="mb-1 last:mb-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-800 mb-0.5 px-1">{g}</div>
            <div className="grid grid-cols-2 gap-1">
              {groupEntries.map((e) => {
                const isHover = hovered === e.type;
                const isAllowed = compat.allowed.has(e.type);
                const isDerived = compat.derived.has(e.type);
                const isPickable = isAllowed || (showDerived && isDerived);
                const tooltip = !sourceName || !targetName
                  ? e.label
                  : isAllowed
                    ? `${e.label} — permitted by spec`
                    : isDerived
                      ? `${e.label} — derived (toggle "show derived" to enable)`
                      : `${e.label} — not permitted between ${sourceName} and ${targetName}`;
                return (
                  <button
                    key={e.type}
                    type="button"
                    disabled={!isPickable}
                    className={`flex items-center gap-2 rounded px-2 py-1 text-left text-xs font-medium transition-colors ${
                      !isPickable
                        ? "text-gray-400 opacity-50 cursor-not-allowed"
                        : isHover
                          ? "bg-blue-50 ring-1 ring-blue-300 text-gray-900"
                          : `text-gray-900 hover:bg-gray-50 ${isDerived ? "italic" : ""}`
                    }`}
                    onMouseEnter={() => isPickable && setHovered(e.type)}
                    onFocus={() => isPickable && setHovered(e.type)}
                    onClick={() => isPickable && commit(e.type)}
                    title={tooltip}
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
      {!awaitingInfluenceSign && (
        <div className="mt-1 border-t border-gray-100 pt-1 text-[10px] text-gray-500 px-1">
          Enter commits · Esc cancels
        </div>
      )}
    </div>
  );
}
