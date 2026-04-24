"use client";

import { useState, useMemo, useEffect } from "react";
import type { DiagramType, SymbolType } from "@/app/lib/diagram/types";
import {
  ALL_SYMBOLS,
  PALETTE_BY_DIAGRAM_TYPE,
} from "@/app/lib/diagram/symbols/definitions";
import { resolveColor, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import { loadArchimateCatalogue, type ArchimateCatalogue, type ArchimateShapeEntry } from "@/app/lib/archimate/catalogue";
import { getThemeFor } from "@/app/lib/archimate/themes";
import { ICON_DRAWERS } from "@/app/lib/archimate/icons";

interface Props {
  diagramType: DiagramType;
  onDragStart: (symbolType: SymbolType, extras?: { shapeKey?: string; iconOnly?: boolean }) => void;
  disabledSymbols?: SymbolType[];
  colorConfig?: SymbolColorConfig;
}

export function PaletteSymbolPreview({ type, colorConfig }: { type: SymbolType; colorConfig?: SymbolColorConfig }) {
  switch (type) {
    case "task":
      // Aspect ratio matches the default Task element: 102 × 65
      return (
        <svg width={36} height={23} viewBox="0 0 48 31">
          <rect x={2} y={2} width={44} height={27} rx={3} fill={resolveColor("task", colorConfig)} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "subprocess":
      return (
        <svg width={36} height={21} viewBox="0 0 48 28">
          <rect x={2} y={2} width={44} height={24} rx={3} fill={resolveColor("subprocess", colorConfig)} stroke="#374151" strokeWidth={1.5} />
          <rect x={18} y={17} width={12} height={10} rx={2} fill="white" stroke="#374151" strokeWidth={1} />
          <line x1={24} y1={19} x2={24} y2={25} stroke="#374151" strokeWidth={1} />
          <line x1={21} y1={22} x2={27} y2={22} stroke="#374151" strokeWidth={1} />
        </svg>
      );
    case "subprocess-expanded":
      // 75% taller than the standard 36×21 task icon, so it's clearly
      // distinguishable in the palette and quick-add popup.
      return (
        <svg width={36} height={37} viewBox="0 0 48 49">
          <rect x={2} y={2} width={44} height={45} rx={3} fill={resolveColor("subprocess-expanded", colorConfig)} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "gateway":
      return (
        <svg width={24} height={24} viewBox="0 0 32 32">
          <polygon points="16,2 30,16 16,30 2,16" fill={resolveColor("gateway", colorConfig)} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "start-event":
      return (
        <svg width={21} height={21} viewBox="0 0 28 28">
          <circle cx={14} cy={14} r={12} fill={resolveColor("start-event", colorConfig)} stroke="#374151" strokeWidth={2} />
        </svg>
      );
    case "intermediate-event": {
      const c = resolveColor("intermediate-event", colorConfig);
      return (
        <svg width={21} height={21} viewBox="0 0 28 28">
          <circle cx={14} cy={14} r={12} fill={c} stroke="#374151" strokeWidth={2} />
          <circle cx={14} cy={14} r={9} fill={c} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    }
    case "end-event":
      return (
        <svg width={21} height={21} viewBox="0 0 28 28">
          <circle cx={14} cy={14} r={12} fill={resolveColor("end-event", colorConfig)} stroke="#374151" strokeWidth={3} />
        </svg>
      );
    case "use-case":
      return (
        <svg width={36} height={21} viewBox="0 0 48 28">
          <ellipse cx={24} cy={14} rx={22} ry={12} fill={resolveColor("use-case", colorConfig)} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "actor": {
      const c = resolveColor("actor", colorConfig);
      return (
        <svg width={18} height={33} viewBox="0 0 24 44">
          <circle cx={12} cy={6} r={5} fill="white" stroke={c} strokeWidth={1.5} />
          <line x1={12} y1={11} x2={12} y2={27} stroke={c} strokeWidth={1.5} />
          <line x1={4}  y1={19} x2={20} y2={19} stroke={c} strokeWidth={1.5} />
          <line x1={12} y1={27} x2={5}  y2={37} stroke={c} strokeWidth={1.5} />
          <line x1={12} y1={27} x2={19} y2={37} stroke={c} strokeWidth={1.5} />
        </svg>
      );
    }
    case "team": {
      const c = resolveColor("team", colorConfig);
      return (
        <svg width={36} height={25} viewBox="0 0 64 44">
          {/* Left figure (70% height, same width as central) */}
          <circle cx={15} cy={4.5} r={3.5} fill="white" stroke={c} strokeWidth={1.5} />
          <line x1={15} y1={8}  x2={15} y2={19} stroke={c} strokeWidth={1.5} />
          <line x1={7}  y1={14} x2={23} y2={14} stroke={c} strokeWidth={1.5} />
          <line x1={15} y1={19} x2={8}  y2={26} stroke={c} strokeWidth={1.5} />
          <line x1={15} y1={19} x2={22} y2={26} stroke={c} strokeWidth={1.5} />
          {/* Right figure (70% height, same width as central) */}
          <circle cx={49} cy={4.5} r={3.5} fill="white" stroke={c} strokeWidth={1.5} />
          <line x1={49} y1={8}  x2={49} y2={19} stroke={c} strokeWidth={1.5} />
          <line x1={41} y1={14} x2={57} y2={14} stroke={c} strokeWidth={1.5} />
          <line x1={49} y1={19} x2={42} y2={26} stroke={c} strokeWidth={1.5} />
          <line x1={49} y1={19} x2={56} y2={26} stroke={c} strokeWidth={1.5} />
          {/* Central figure (full-size Participant) */}
          <circle cx={32} cy={6} r={5} fill="white" stroke={c} strokeWidth={1.5} />
          <line x1={32} y1={11} x2={32} y2={27} stroke={c} strokeWidth={1.5} />
          <line x1={24} y1={19} x2={40} y2={19} stroke={c} strokeWidth={1.5} />
          <line x1={32} y1={27} x2={25} y2={37} stroke={c} strokeWidth={1.5} />
          <line x1={32} y1={27} x2={39} y2={37} stroke={c} strokeWidth={1.5} />
        </svg>
      );
    }
    case "system":
      return (
        <svg width={15} height={36} viewBox="0 0 20 48">
          <rect x={1} y={1} width={18} height={46} rx={2} fill={resolveColor("system", colorConfig)} stroke="#374151" strokeWidth={1.5} />
          <line x1={4} y1={7}  x2={16} y2={7}  stroke="#374151" strokeWidth={1.5} />
          <line x1={4} y1={11} x2={16} y2={11} stroke="#374151" strokeWidth={1.5} />
          <line x1={4} y1={15} x2={16} y2={15} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "hourglass":
      return (
        <svg width={12} height={14} viewBox="0 0 32 36">
          <polygon points="2,2 30,2 16,18 30,34 2,34 16,18"
            fill={resolveColor("hourglass", colorConfig)} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "system-boundary":
      return (
        <svg width={30} height={39} viewBox="0 0 40 52">
          <rect x={2} y={2} width={36} height={48} fill="white" stroke="#374151" strokeWidth={1.5} rx={2} />
          <rect x={2} y={2} width={36} height={12} fill={resolveColor("system-boundary", colorConfig)} stroke="none" rx={2} />
          <rect x={2} y={12} width={36} height={2} fill={resolveColor("system-boundary", colorConfig)} />
          <line x1={2} y1={14} x2={38} y2={14} stroke="#374151" strokeWidth={1} />
        </svg>
      );
    case "state":
      return (
        <svg width={36} height={21} viewBox="0 0 48 28">
          <rect x={2} y={2} width={44} height={24} rx={8} fill={resolveColor("state", colorConfig)} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "initial-state":
      return (
        <svg width={18} height={18} viewBox="0 0 24 24">
          <circle cx={12} cy={12} r={10} fill={resolveColor("initial-state", colorConfig)} />
        </svg>
      );
    case "final-state": {
      const c = resolveColor("final-state", colorConfig);
      return (
        <svg width={18} height={18} viewBox="0 0 24 24">
          <circle cx={12} cy={12} r={10} fill="white" stroke={c} strokeWidth={2} />
          <circle cx={12} cy={12} r={6} fill={c} />
        </svg>
      );
    }
    case "submachine":
      return (
        <svg width={36} height={25} viewBox="0 0 48 34">
          <rect x={2} y={2} width={44} height={30} rx={8} fill="#bfdbfe" stroke="#374151" strokeWidth={1.5} />
          {/* Marker: two small rounded-rect states connected by line */}
          <rect x={27} y={23} width={7} height={5} rx={1.5} fill="white" stroke="#c0c0c0" strokeWidth={0.8} />
          <line x1={34} y1={25.5} x2={37} y2={25.5} stroke="#c0c0c0" strokeWidth={0.8} />
          <rect x={37} y={23} width={7} height={5} rx={1.5} fill="white" stroke="#c0c0c0" strokeWidth={0.8} />
        </svg>
      );
    case "fork-join":
      return (
        <svg width={6} height={28} viewBox="0 0 6 28">
          <rect x={0} y={0} width={6} height={28} rx={1} fill="#1f2937" />
        </svg>
      );
    case "composite-state":
      return (
        <svg width={36} height={24} viewBox="0 0 48 32">
          <rect x={2} y={2} width={44} height={28} rx={6}
            fill="white" stroke="#374151" strokeWidth={1.5} />
          <rect x={2} y={2} width={44} height={10} fill={resolveColor("composite-state", colorConfig)} rx={6} />
          <rect x={2} y={10} width={44} height={2} fill={resolveColor("composite-state", colorConfig)} />
          <line x1={2} y1={12} x2={46} y2={12} stroke="#374151" strokeWidth={1} />
        </svg>
      );
    case "data-object":
      return (
        <svg width={16} height={21} viewBox="0 0 28 36">
          <polygon points="2,2 20,2 26,8 26,34 2,34"
            fill={resolveColor("data-object", colorConfig)} stroke="#374151" strokeWidth={1.5} />
          <polygon points="20,2 26,8 20,8"
            fill="#93c5fd" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "data-store":
      return (
        <svg width={24} height={21} viewBox="0 0 32 28">
          <path d="M 1 5 L 1 24 A 15 4 0 0 0 31 24 L 31 5"
            fill={resolveColor("data-store", colorConfig)} stroke="#374151" strokeWidth={1.5} />
          <ellipse cx={16} cy={5} rx={15} ry={4} fill={resolveColor("data-store", colorConfig)} stroke="#374151" strokeWidth={1.5} />
          <path d="M 1 10 A 15 4 0 0 0 31 10" fill="none" stroke="#374151" strokeWidth={1.5} />
          <path d="M 1 15 A 15 4 0 0 0 31 15" fill="none" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "pool":
      return (
        <svg width={36} height={21} viewBox="0 0 48 28">
          <rect x={1} y={1} width={46} height={26} fill="#f9fafb" stroke="#374151" strokeWidth={1.5} />
          <rect x={1} y={1} width={10} height={26} fill={resolveColor("pool", colorConfig)} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "group":
      return (
        <svg width={36} height={24} viewBox="0 0 48 32">
          <rect x={2} y={2} width={44} height={28} rx={6}
            fill="none" stroke={resolveColor("group", colorConfig)} strokeWidth={1.5}
            strokeDasharray="6 2.5 1.5 2.5" />
        </svg>
      );
    case "text-annotation": {
      const c = resolveColor("text-annotation", colorConfig);
      return (
        <svg width={36} height={21} viewBox="0 0 48 28">
          <line x1={12} y1={2} x2={4} y2={2} stroke={c} strokeWidth={1.5} />
          <line x1={4} y1={2} x2={4} y2={26} stroke={c} strokeWidth={1.5} />
          <line x1={4} y1={26} x2={12} y2={26} stroke={c} strokeWidth={1.5} />
          <line x1={14} y1={10} x2={40} y2={10} stroke="#9ca3af" strokeWidth={1} />
          <line x1={14} y1={16} x2={34} y2={16} stroke="#9ca3af" strokeWidth={1} />
        </svg>
      );
    }
    case "uml-class":
      return (
        <svg width={36} height={28} viewBox="0 0 48 36">
          <rect x={2} y={2} width={44} height={32} fill={resolveColor("uml-class", colorConfig)} stroke="#374151" strokeWidth={1.5} />
          <line x1={2} y1={12} x2={46} y2={12} stroke="#374151" strokeWidth={1} />
        </svg>
      );
    case "uml-enumeration":
      return (
        <svg width={22} height={20} viewBox="0 0 30 26">
          <rect x={2} y={2} width={26} height={22} fill={resolveColor("uml-enumeration", colorConfig)} stroke="#374151" strokeWidth={1.5} />
          <line x1={2} y1={10} x2={28} y2={10} stroke="#374151" strokeWidth={1} />
          <text x={15} y={8} textAnchor="middle" fontSize={5} fill="#6b7280" fontStyle="italic">{"\u00ABE\u00BB"}</text>
        </svg>
      );
    case "external-entity":
      return (
        <svg width={28} height={28} viewBox="0 0 36 36">
          <rect x={2} y={2} width={32} height={32} fill={resolveColor("external-entity", colorConfig)} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "process-system":
      return (
        <svg width={28} height={28} viewBox="0 0 36 36">
          <circle cx={18} cy={18} r={16} fill={resolveColor("process-system", colorConfig)} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "chevron":
      return (
        <svg width={36} height={21} viewBox="0 0 48 28">
          <polygon points="0,0 38,0 48,14 38,28 0,28 10,14" fill="#fbd7bb" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "chevron-collapsed":
      return (
        <svg width={36} height={21} viewBox="0 0 48 28">
          <polygon points="0,0 38,0 48,14 38,28 0,28 10,14" fill="#fbd7bb" stroke="#374151" strokeWidth={1.5} />
          <rect x={17} y={17} width={10} height={8} rx={1.5} fill="white" stroke="#c0c0c0" strokeWidth={0.8} />
          <line x1={22} y1={19} x2={22} y2={23} stroke="#c0c0c0" strokeWidth={0.8} />
          <line x1={19} y1={21} x2={25} y2={21} stroke="#c0c0c0" strokeWidth={0.8} />
        </svg>
      );
    case "process-group":
      return (
        <svg width={36} height={24} viewBox="0 0 48 32">
          <rect x={2} y={2} width={44} height={28} rx={3} fill="#fcebdd" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    default:
      return (
        <svg width={36} height={21} viewBox="0 0 48 28">
          <rect x={2} y={2} width={44} height={24} rx={3} fill="white" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
  }
}

// ────────────────────────────────────────────────────────────────────
// ArchiMate palette — category accordion fed by the shape catalogue
// ────────────────────────────────────────────────────────────────────

function ArchimateShapePreview({ entry, iconOnly = false }: { entry: ArchimateShapeEntry; iconOnly?: boolean }) {
  const theme = getThemeFor(entry.category);
  const fill = theme?.fill ?? entry.fill ?? "#f5f5f5";
  const stroke = theme?.stroke ?? entry.stroke ?? "#666";
  const iconColour = theme?.iconColour ?? stroke;
  // Larger preview so the icon glyph is clearly identifiable
  const w = 64, h = 38;
  const drawIcon = entry.iconType ? ICON_DRAWERS[entry.iconType] : undefined;

  // Icon-only variant: render the icon glyph itself AS the shape (no box
  // outline, bigger icon) so the user sees the compact iconic form.
  if (iconOnly && drawIcon) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {drawIcon({ cx: w / 2, cy: h / 2, size: Math.min(w, h) * 1.4, colour: iconColour })}
      </svg>
    );
  }

  let outline: React.ReactNode;
  switch (entry.shapeFamily) {
    case "ellipse":
      outline = <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 1} ry={h / 2 - 1} fill={fill} stroke={stroke} strokeWidth={1.2} />;
      break;
    case "rounded-rect":
      outline = <rect x={1} y={1} width={w - 2} height={h - 2} rx={6} ry={6} fill={fill} stroke={stroke} strokeWidth={1.2} />;
      break;
    case "hexagon": {
      const pad = w * 0.15;
      const pts = `${pad},1 ${w - pad},1 ${w - 1},${h / 2} ${w - pad},${h - 1} ${pad},${h - 1} 1,${h / 2}`;
      outline = <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.2} />;
      break;
    }
    default:
      outline = <rect x={1} y={1} width={w - 2} height={h - 2} fill={fill} stroke={stroke} strokeWidth={1.2} />;
  }
  // Box variant: outlined rectangle with the icon glyph in the top-right
  // corner (matching the canvas rendering)
  const cornerSize = 14;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {outline}
      {drawIcon ? drawIcon({
        cx: w - cornerSize / 2 - 4,
        cy: cornerSize / 2 + 4,
        size: cornerSize,
        colour: iconColour,
      }) : null}
    </svg>
  );
}

function ArchimatePalette({
  onDragStart, collapsed, setCollapsed,
}: {
  onDragStart: Props["onDragStart"];
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  const [catalogue, setCatalogue] = useState<ArchimateCatalogue | null>(null);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({ business: true });
  // User-adjustable category order. Persisted to localStorage so it sticks
  // across reloads. Initialised from the catalogue's natural order on first
  // load, with any newly-introduced categories appended at the end.
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);

  useEffect(() => {
    loadArchimateCatalogue().then((cat) => {
      setCatalogue(cat);
      const natural = cat.categories.map(c => c.id);
      let saved: string[] = [];
      try {
        const raw = localStorage.getItem("archimate-category-order");
        if (raw) saved = JSON.parse(raw);
      } catch {}
      const validSaved = saved.filter(id => natural.includes(id));
      const missing = natural.filter(id => !validSaved.includes(id));
      setCategoryOrder([...validSaved, ...missing]);
    }).catch((e: unknown) => {
      console.error("Failed to load ArchiMate catalogue:", e);
    });
  }, []);

  function toggleCategory(id: string) {
    setOpenCategories(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function moveCategory(id: string, direction: -1 | 1) {
    setCategoryOrder(prev => {
      const idx = prev.indexOf(id);
      const swap = idx + direction;
      if (idx < 0 || swap < 0 || swap >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[swap]] = [next[swap], next[idx]];
      try { localStorage.setItem("archimate-category-order", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  if (collapsed) {
    return (
      <div className="border-r border-gray-200 bg-white flex flex-col shrink-0" style={{ width: 52 }}>
        <div className="px-1 py-1 border-b border-gray-200 flex items-center justify-center">
          <button onClick={() => setCollapsed(false)} title="Expand shapes"
            className="text-gray-400 hover:text-gray-600 text-xs">
            {"\u25B6"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-0.5 text-center text-[10px] text-gray-400 py-2">
          ArchiMate
        </div>
      </div>
    );
  }

  return (
    <div className="border-r border-gray-200 bg-white flex flex-col shrink-0" style={{ width: 220 }}>
      <div className="px-2 py-1.5 border-b border-gray-200 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          ArchiMate
        </p>
        <button onClick={() => setCollapsed(true)} title="Collapse shapes"
          className="text-gray-400 hover:text-gray-600 text-xs">
          {"\u25C0"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {catalogue === null ? (
          <p className="text-[11px] text-gray-400 p-2">Loading shapes…</p>
        ) : (() => {
          const byId = new Map(catalogue.categories.map(c => [c.id, c]));
          const orderedCategories = categoryOrder
            .map(id => byId.get(id))
            .filter((c): c is typeof catalogue.categories[number] => !!c);
          return orderedCategories;
        })().map((cat, catIdx, orderedArr) => {
          // One palette entry per distinct element name. When both a
          // "(box)" and an "icon" master exist for the same element, prefer
          // the box form. For Actor, Business Service, and Business Event
          // we ALSO surface the icon-variant as a separate drag source so
          // users can pick the compact icon-only shape.
          const ICON_AS_SEPARATE = new Set<string>(["Business Actor", "Business Service", "Business Event"]);
          const byName = new Map<string, { primary: ArchimateShapeEntry; iconCounterpart?: ArchimateShapeEntry }>();
          for (const s of cat.shapes) {
            const existing = byName.get(s.name);
            if (!existing) {
              byName.set(s.name, { primary: s });
            } else if (existing.primary.variant === "icon" && s.variant === "box") {
              byName.set(s.name, { primary: s, iconCounterpart: existing.primary });
            } else if (existing.primary.variant === "box" && s.variant === "icon") {
              byName.set(s.name, { primary: existing.primary, iconCounterpart: s });
            }
          }
          type PaletteItem = { entry: ArchimateShapeEntry; iconOnly: boolean; label: string };
          const items: PaletteItem[] = [];
          for (const [name, pair] of byName) {
            items.push({ entry: pair.primary, iconOnly: false, label: name });
            if (pair.iconCounterpart && ICON_AS_SEPARATE.has(name)) {
              items.push({ entry: pair.iconCounterpart, iconOnly: true, label: `${name} (icon)` });
            }
          }
          const open = !!openCategories[cat.id];
          const canUp = catIdx > 0;
          const canDown = catIdx < orderedArr.length - 1;
          return (
            <div key={cat.id} className="border-b border-gray-100">
              <div className="w-full flex items-center px-2 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50">
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="flex-1 flex items-center justify-between text-left"
                >
                  <span>{cat.name} <span className="text-gray-400 ml-1">({items.length})</span></span>
                  <span className="text-gray-400">{open ? "\u25BE" : "\u25B8"}</span>
                </button>
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); moveCategory(cat.id, -1); }}
                    disabled={!canUp}
                    title="Move category up"
                    className={`px-1 text-[10px] ${canUp ? "text-gray-500 hover:text-gray-800" : "text-gray-300 cursor-not-allowed"}`}
                  >{"\u25B2"}</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveCategory(cat.id, 1); }}
                    disabled={!canDown}
                    title="Move category down"
                    className={`px-1 text-[10px] ${canDown ? "text-gray-500 hover:text-gray-800" : "text-gray-300 cursor-not-allowed"}`}
                  >{"\u25BC"}</button>
                </div>
              </div>
              {open && (
                <div className="px-1 pb-1 grid grid-cols-2 gap-1">
                  {items.map(item => (
                    <div
                      key={`${item.entry.key}:${item.iconOnly ? "icon" : "box"}`}
                      draggable
                      onDragStart={() => onDragStart("archimate-shape", {
                        shapeKey: item.entry.key,
                        iconOnly: item.iconOnly,
                      })}
                      title={item.entry.description ?? item.entry.name}
                      className="flex flex-col items-center gap-0.5 px-1 py-1 rounded select-none hover:bg-gray-50 cursor-grab active:cursor-grabbing"
                    >
                      <ArchimateShapePreview entry={item.entry} iconOnly={item.iconOnly} />
                      <span className="text-[10px] text-gray-700 leading-tight text-center w-full truncate">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Palette({ diagramType, onDragStart, disabledSymbols = [], colorConfig }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  // ArchiMate gets its own catalogue-driven accordion palette
  if (diagramType === "archimate") {
    return <ArchimatePalette onDragStart={onDragStart} collapsed={collapsed} setCollapsed={setCollapsed} />;
  }
  const paletteTypes = PALETTE_BY_DIAGRAM_TYPE[diagramType] ?? ["task"];
  const symbols = paletteTypes
    .map((t) => ALL_SYMBOLS.find((s) => s.type === t))
    .filter((s): s is (typeof ALL_SYMBOLS)[number] => !!s);

  // Compute expanded width based on longest label
  const expandedWidth = useMemo(() => {
    const avgCharWidth = 6.5; // approx px per char at text-xs
    const iconW = 36 + 8; // icon width + gap
    const pad = 16 + 5; // px padding + 5px margin
    const longest = Math.max(...symbols.map(s => s.label.length));
    return Math.max(100, iconW + longest * avgCharWidth + pad);
  }, [symbols]);

  if (collapsed) {
    return (
      <div className="border-r border-gray-200 bg-white flex flex-col shrink-0" style={{ width: 52 }}>
        <div className="px-1 py-1 border-b border-gray-200 flex items-center justify-center">
          <button onClick={() => setCollapsed(false)} title="Expand symbols"
            className="text-gray-400 hover:text-gray-600 text-xs">
            {"\u25B6"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-0.5 space-y-0.5">
          {symbols.map((sym) => {
            const disabled = disabledSymbols.includes(sym.type);
            return (
              <div
                key={sym.type}
                draggable={!disabled}
                onDragStart={disabled ? undefined : () => onDragStart(sym.type)}
                title={sym.label}
                className={`flex items-center justify-center px-1 py-1 rounded select-none ${
                  disabled
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-gray-50 cursor-grab active:cursor-grabbing"
                }`}
              >
                <PaletteSymbolPreview type={sym.type} colorConfig={colorConfig} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="border-r border-gray-200 bg-white flex flex-col shrink-0" style={{ width: expandedWidth }}>
      <div className="px-2 py-1.5 border-b border-gray-200 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Symbols
        </p>
        <button onClick={() => setCollapsed(true)} title="Collapse symbols"
          className="text-gray-400 hover:text-gray-600 text-xs">
          {"\u25C0"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
        {symbols.map((sym) => {
          const disabled = disabledSymbols.includes(sym.type);
          return (
            <div
              key={sym.type}
              draggable={!disabled}
              onDragStart={disabled ? undefined : () => onDragStart(sym.type)}
              className={`flex items-center gap-2 px-2 py-1 rounded select-none ${
                disabled
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-gray-50 cursor-grab active:cursor-grabbing"
              }`}
            >
              <div className="flex items-center justify-center w-9 shrink-0">
                <PaletteSymbolPreview type={sym.type} colorConfig={colorConfig} />
              </div>
              <span className="text-xs text-gray-700 leading-tight">{sym.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
