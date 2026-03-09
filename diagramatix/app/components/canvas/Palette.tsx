"use client";

import type { DiagramType, SymbolType } from "@/app/lib/diagram/types";
import {
  ALL_SYMBOLS,
  PALETTE_BY_DIAGRAM_TYPE,
} from "@/app/lib/diagram/symbols/definitions";

interface Props {
  diagramType: DiagramType;
  onDragStart: (symbolType: SymbolType) => void;
  disabledSymbols?: SymbolType[];
}

function PaletteSymbolPreview({ type }: { type: SymbolType }) {
  switch (type) {
    case "task":
      return (
        <svg width={48} height={28} viewBox="0 0 48 28">
          <rect x={2} y={2} width={44} height={24} rx={3} fill="#fef9c3" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "subprocess":
      return (
        <svg width={48} height={28} viewBox="0 0 48 28">
          <rect x={2} y={2} width={44} height={24} rx={3} fill="#fef08a" stroke="#374151" strokeWidth={1.5} />
          <rect x={18} y={17} width={12} height={10} rx={2} fill="white" stroke="#374151" strokeWidth={1} />
          <line x1={24} y1={19} x2={24} y2={25} stroke="#374151" strokeWidth={1} />
          <line x1={21} y1={22} x2={27} y2={22} stroke="#374151" strokeWidth={1} />
        </svg>
      );
    case "subprocess-expanded":
      return (
        <svg width={48} height={28} viewBox="0 0 48 28">
          <rect x={2} y={2} width={44} height={24} rx={3} fill="#fef08a" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "gateway":
      return (
        <svg width={32} height={32} viewBox="0 0 32 32">
          <polygon points="16,2 30,16 16,30 2,16" fill="#f3e8ff" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "start-event":
      return (
        <svg width={28} height={28} viewBox="0 0 28 28">
          <circle cx={14} cy={14} r={12} fill="#dcfce7" stroke="#374151" strokeWidth={2} />
        </svg>
      );
    case "intermediate-event":
      return (
        <svg width={28} height={28} viewBox="0 0 28 28">
          <circle cx={14} cy={14} r={12} fill="#fed7aa" stroke="#374151" strokeWidth={2} />
          <circle cx={14} cy={14} r={9} fill="#fed7aa" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "end-event":
      return (
        <svg width={28} height={28} viewBox="0 0 28 28">
          <circle cx={14} cy={14} r={12} fill="#fca5a5" stroke="#374151" strokeWidth={3} />
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
        <svg width={24} height={44} viewBox="0 0 24 44">
          <circle cx={12} cy={6} r={5} fill="white" stroke="#374151" strokeWidth={1.5} />
          <line x1={12} y1={11} x2={12} y2={27} stroke="#374151" strokeWidth={1.5} />
          <line x1={4}  y1={19} x2={20} y2={19} stroke="#374151" strokeWidth={1.5} />
          <line x1={12} y1={27} x2={5}  y2={37} stroke="#374151" strokeWidth={1.5} />
          <line x1={12} y1={27} x2={19} y2={37} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "team":
      return (
        <svg width={64} height={44} viewBox="0 0 64 44">
          {/* Left figure (70% height, same width as central) */}
          <circle cx={15} cy={4.5} r={3.5} fill="white" stroke="#374151" strokeWidth={1.5} />
          <line x1={15} y1={8}  x2={15} y2={19} stroke="#374151" strokeWidth={1.5} />
          <line x1={7}  y1={14} x2={23} y2={14} stroke="#374151" strokeWidth={1.5} />
          <line x1={15} y1={19} x2={8}  y2={26} stroke="#374151" strokeWidth={1.5} />
          <line x1={15} y1={19} x2={22} y2={26} stroke="#374151" strokeWidth={1.5} />
          {/* Right figure (70% height, same width as central) */}
          <circle cx={49} cy={4.5} r={3.5} fill="white" stroke="#374151" strokeWidth={1.5} />
          <line x1={49} y1={8}  x2={49} y2={19} stroke="#374151" strokeWidth={1.5} />
          <line x1={41} y1={14} x2={57} y2={14} stroke="#374151" strokeWidth={1.5} />
          <line x1={49} y1={19} x2={42} y2={26} stroke="#374151" strokeWidth={1.5} />
          <line x1={49} y1={19} x2={56} y2={26} stroke="#374151" strokeWidth={1.5} />
          {/* Central figure (full-size Participant) */}
          <circle cx={32} cy={6} r={5} fill="white" stroke="#374151" strokeWidth={1.5} />
          <line x1={32} y1={11} x2={32} y2={27} stroke="#374151" strokeWidth={1.5} />
          <line x1={24} y1={19} x2={40} y2={19} stroke="#374151" strokeWidth={1.5} />
          <line x1={32} y1={27} x2={25} y2={37} stroke="#374151" strokeWidth={1.5} />
          <line x1={32} y1={27} x2={39} y2={37} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "system":
      return (
        <svg width={20} height={48} viewBox="0 0 20 48">
          <rect x={1} y={1} width={18} height={46} rx={2} fill="white" stroke="#374151" strokeWidth={1.5} />
          <line x1={4} y1={7}  x2={16} y2={7}  stroke="#374151" strokeWidth={1.5} />
          <line x1={4} y1={11} x2={16} y2={11} stroke="#374151" strokeWidth={1.5} />
          <line x1={4} y1={15} x2={16} y2={15} stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "hourglass":
      return (
        <svg width={16} height={18} viewBox="0 0 32 36">
          <polygon points="2,2 30,2 16,18 30,34 2,34 16,18"
            fill="white" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "system-boundary":
      return (
        <svg width={40} height={52} viewBox="0 0 40 52">
          <rect x={2} y={2} width={36} height={48} fill="rgba(219,234,254,0.5)" stroke="#374151" strokeWidth={1.5} rx={2} />
          <rect x={2} y={2} width={36} height={12} fill="#dbeafe" stroke="none" rx={2} />
          <rect x={2} y={12} width={36} height={2} fill="#dbeafe" />
          <line x1={2} y1={14} x2={38} y2={14} stroke="#374151" strokeWidth={1} />
        </svg>
      );
    case "state":
      return (
        <svg width={48} height={28} viewBox="0 0 48 28">
          <rect x={2} y={2} width={44} height={24} rx={8} fill="#dbeafe" stroke="#374151" strokeWidth={1.5} />
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
    case "composite-state":
      return (
        <svg width={48} height={32} viewBox="0 0 48 32">
          <rect x={2} y={2} width={44} height={28} rx={6}
            fill="rgba(237,233,254,0.5)" stroke="#374151" strokeWidth={1.5} />
          <rect x={2} y={2} width={44} height={10} fill="#ede9fe" rx={6} />
          <rect x={2} y={10} width={44} height={2} fill="#ede9fe" />
          <line x1={2} y1={12} x2={46} y2={12} stroke="#374151" strokeWidth={1} />
        </svg>
      );
    case "data-object":
      return (
        <svg width={22} height={28} viewBox="0 0 28 36">
          <polygon points="2,2 20,2 26,8 26,34 2,34"
            fill="#bfdbfe" stroke="#374151" strokeWidth={1.5} />
          <polygon points="20,2 26,8 20,8"
            fill="#93c5fd" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "data-store":
      return (
        <svg width={32} height={28} viewBox="0 0 32 28">
          <path d="M 1 5 L 1 24 A 15 4 0 0 0 31 24 L 31 5"
            fill="#60a5fa" stroke="#374151" strokeWidth={1.5} />
          <ellipse cx={16} cy={5} rx={15} ry={4} fill="#60a5fa" stroke="#374151" strokeWidth={1.5} />
          <path d="M 1 10 A 15 4 0 0 0 31 10" fill="none" stroke="#374151" strokeWidth={1.5} />
          <path d="M 1 15 A 15 4 0 0 0 31 15" fill="none" stroke="#374151" strokeWidth={1.5} />
        </svg>
      );
    case "pool":
      return (
        <svg width={48} height={28} viewBox="0 0 48 28">
          <rect x={1} y={1} width={46} height={26} fill="#f9fafb" stroke="#374151" strokeWidth={1.5} />
          <rect x={1} y={1} width={10} height={26} fill="#c8956a" stroke="#374151" strokeWidth={1.5} />
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

export function Palette({ diagramType, onDragStart, disabledSymbols = [] }: Props) {
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
        {symbols.map((sym) => {
          const disabled = disabledSymbols.includes(sym.type);
          return (
            <div
              key={sym.type}
              draggable={!disabled}
              onDragStart={disabled ? undefined : () => onDragStart(sym.type)}
              className={`flex items-center gap-3 px-2 py-2 rounded select-none ${
                disabled
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-gray-50 cursor-grab active:cursor-grabbing"
              }`}
              title={disabled ? "Already placed on diagram" : sym.description}
            >
              <div className="flex items-center justify-center w-12 h-10">
                <PaletteSymbolPreview type={sym.type} />
              </div>
              <span className="text-xs text-gray-700">{sym.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
