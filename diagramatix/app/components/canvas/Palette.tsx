"use client";

import type { DiagramType, SymbolType } from "@/app/lib/diagram/types";
import {
  ALL_SYMBOLS,
  PALETTE_BY_DIAGRAM_TYPE,
} from "@/app/lib/diagram/symbols/definitions";

interface Props {
  diagramType: DiagramType;
  onDragStart: (symbolType: SymbolType) => void;
}

function PaletteSymbolPreview({ type }: { type: SymbolType }) {
  switch (type) {
    case "gateway":
      return (
        <svg width={32} height={32} viewBox="0 0 32 32">
          <polygon points="16,2 30,16 16,30 2,16" fill="white" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "start-event":
      return (
        <svg width={28} height={28} viewBox="0 0 28 28">
          <circle cx={14} cy={14} r={12} fill="white" stroke="#16a34a" strokeWidth={2} />
        </svg>
      );
    case "end-event":
      return (
        <svg width={28} height={28} viewBox="0 0 28 28">
          <circle cx={14} cy={14} r={12} fill="white" stroke="#dc2626" strokeWidth={3} />
        </svg>
      );
    case "use-case":
      return (
        <svg width={48} height={28} viewBox="0 0 48 28">
          <ellipse cx={24} cy={14} rx={22} ry={12} fill="white" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "actor":
      return (
        <svg width={24} height={40} viewBox="0 0 24 40">
          <circle cx={12} cy={6} r={5} fill="white" stroke="#374151" strokeWidth={1.5} />
          <line x1={12} y1={11} x2={12} y2={28} stroke="#374151" strokeWidth={1.5} />
          <line x1={4} y1={18} x2={20} y2={18} stroke="#374151" strokeWidth={1.5} />
          <line x1={12} y1={28} x2={4} y2={38} stroke="#374151" strokeWidth={1.5} />
          <line x1={12} y1={28} x2={20} y2={38} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "state":
      return (
        <svg width={48} height={28} viewBox="0 0 48 28">
          <rect x={2} y={2} width={44} height={24} rx={8} fill="white" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "initial-state":
      return (
        <svg width={24} height={24} viewBox="0 0 24 24">
          <circle cx={12} cy={12} r={10} fill="#374151" />
        </svg>
      );
    case "final-state":
      return (
        <svg width={24} height={24} viewBox="0 0 24 24">
          <circle cx={12} cy={12} r={10} fill="white" stroke="#374151" strokeWidth={2} />
          <circle cx={12} cy={12} r={6} fill="#374151" />
        </svg>
      );
    default:
      return (
        <svg width={48} height={28} viewBox="0 0 48 28">
          <rect x={2} y={2} width={44} height={24} rx={3} fill="white" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
  }
}

export function Palette({ diagramType, onDragStart }: Props) {
  const paletteTypes = PALETTE_BY_DIAGRAM_TYPE[diagramType] ?? ["task"];
  const symbols = ALL_SYMBOLS.filter((s) => paletteTypes.includes(s.type));

  return (
    <div className="w-48 border-r border-gray-200 bg-white flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Symbols
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {symbols.map((sym) => (
          <div
            key={sym.type}
            draggable
            onDragStart={() => onDragStart(sym.type)}
            className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-50 cursor-grab active:cursor-grabbing select-none"
            title={sym.description}
          >
            <div className="flex items-center justify-center w-12 h-8">
              <PaletteSymbolPreview type={sym.type} />
            </div>
            <span className="text-xs text-gray-700">{sym.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
