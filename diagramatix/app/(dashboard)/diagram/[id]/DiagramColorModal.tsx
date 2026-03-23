"use client";

import { useState } from "react";
import type { DiagramType, SymbolType } from "@/app/lib/diagram/types";
import { DEFAULT_SYMBOL_COLORS, BW_SYMBOL_COLORS, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import { COLOR_PALETTE_BY_DIAGRAM_TYPE, getSymbolDefinition } from "@/app/lib/diagram/symbols/definitions";
import type { DisplayMode } from "@/app/lib/diagram/displayMode";

interface Props {
  diagramId: string;
  diagramType: DiagramType;
  projectColors: SymbolColorConfig;
  initialColorConfig: SymbolColorConfig;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  debugMode?: boolean;
  onDebugModeChange?: (on: boolean) => void;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
  connectorFontSize?: number;
  onConnectorFontSizeChange?: (size: number) => void;
  titleFontSize?: number;
  onTitleFontSizeChange?: (size: number) => void;
  onClose: () => void;
  onSaved: (config: SymbolColorConfig) => void;
}

export function DiagramColorModal({
  diagramId,
  diagramType,
  projectColors,
  initialColorConfig,
  displayMode,
  onDisplayModeChange,
  debugMode,
  onDebugModeChange,
  fontSize,
  onFontSizeChange,
  connectorFontSize,
  onConnectorFontSizeChange,
  titleFontSize,
  onTitleFontSizeChange,
  onClose,
  onSaved,
}: Props) {
  const [workingColors, setWorkingColors] = useState<SymbolColorConfig>({
    ...DEFAULT_SYMBOL_COLORS,
    ...projectColors,
    ...initialColorConfig,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const symbols: SymbolType[] = COLOR_PALETTE_BY_DIAGRAM_TYPE[diagramType];

  function handleColorChange(type: SymbolType, color: string) {
    setWorkingColors((prev) => ({ ...prev, [type]: color }));
  }

  function handleRevertToProject() {
    setWorkingColors({ ...DEFAULT_SYMBOL_COLORS, ...projectColors });
  }

  function handleBlackAndWhite() {
    setWorkingColors({ ...BW_SYMBOL_COLORS });
  }

  async function handleConfirm() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/diagrams/${diagramId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorConfig: workingColors }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(`Save failed (${res.status})${body?.error ? ": " + body.error : ""}`);
        return;
      }
      onSaved(workingColors);
      onClose();
    } catch {
      setSaveError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Diagram Maintenance</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Display Mode */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
          <span className="text-sm font-medium text-gray-700">Display Mode</span>
          <button
            onClick={() => onDisplayModeChange(displayMode === "hand-drawn" ? "normal" : "hand-drawn")}
            className={`px-3 py-1.5 text-sm border rounded flex items-center gap-1.5 ${
              displayMode === "hand-drawn"
                ? "bg-gray-800 text-white border-gray-800"
                : "text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 14l3-1L13.5 4.5a1.4 1.4 0 0 0-2-2L3 11l-1 3z" />
              <path d="M11.5 2.5l2 2" />
            </svg>
            {displayMode === "hand-drawn" ? "Hand Drawn" : "Normal"}
          </button>
        </div>

        {/* Debug Mode */}
        {onDebugModeChange && (
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
            <div>
              <span className="text-sm font-medium text-gray-700">Debug Mode</span>
              <p className="text-xs text-gray-400">Show element and connector IDs</p>
            </div>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={debugMode ?? false}
                onChange={(e) => onDebugModeChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </div>
        )}

        {/* Font Sizes */}
        {(onFontSizeChange || onConnectorFontSizeChange || onTitleFontSizeChange) && (
          <div className="px-6 py-3 border-b border-gray-200 flex-shrink-0 space-y-2">
            <span className="text-sm font-medium text-gray-700">Font Sizes</span>
            {onFontSizeChange && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Element Names</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => onFontSizeChange(12)} disabled={(fontSize ?? 12) === 12} title="Revert to default (12px)"
                    className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default">{"\u21BA"}</button>
                  <button onClick={() => onFontSizeChange(Math.max(6, (fontSize ?? 12) - 1))}
                    className="w-6 h-6 flex items-center justify-center text-xs font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">-</button>
                  <span className="text-sm font-mono font-semibold text-gray-800 w-7 text-center">{fontSize ?? 12}</span>
                  <button onClick={() => onFontSizeChange(Math.min(24, (fontSize ?? 12) + 1))}
                    className="w-6 h-6 flex items-center justify-center text-xs font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">+</button>
                  <span className="text-[10px] text-gray-400">px</span>
                </div>
              </div>
            )}
            {onConnectorFontSizeChange && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Connector Labels</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => onConnectorFontSizeChange(10)} disabled={(connectorFontSize ?? 10) === 10} title="Revert to default (10px)"
                    className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default">{"\u21BA"}</button>
                  <button onClick={() => onConnectorFontSizeChange(Math.max(6, (connectorFontSize ?? 10) - 1))}
                    className="w-6 h-6 flex items-center justify-center text-xs font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">-</button>
                  <span className="text-sm font-mono font-semibold text-gray-800 w-7 text-center">{connectorFontSize ?? 10}</span>
                  <button onClick={() => onConnectorFontSizeChange(Math.min(24, (connectorFontSize ?? 10) + 1))}
                    className="w-6 h-6 flex items-center justify-center text-xs font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">+</button>
                  <span className="text-[10px] text-gray-400">px</span>
                </div>
              </div>
            )}
            {onTitleFontSizeChange && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Diagram Title</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => onTitleFontSizeChange(14)} disabled={(titleFontSize ?? 14) === 14} title="Revert to default (14px)"
                    className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default">{"\u21BA"}</button>
                  <button onClick={() => onTitleFontSizeChange(Math.max(8, (titleFontSize ?? 14) - 1))}
                    className="w-6 h-6 flex items-center justify-center text-xs font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">-</button>
                  <span className="text-sm font-mono font-semibold text-gray-800 w-7 text-center">{titleFontSize ?? 14}</span>
                  <button onClick={() => onTitleFontSizeChange(Math.min(30, (titleFontSize ?? 14) + 1))}
                    className="w-6 h-6 flex items-center justify-center text-xs font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">+</button>
                  <span className="text-[10px] text-gray-400">px</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Colour actions */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 flex-shrink-0">
          <span className="text-sm font-medium text-gray-700 flex-1">Colours</span>
          <button
            onClick={handleBlackAndWhite}
            className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50"
          >
            Black &amp; White
          </button>
          <button
            onClick={handleRevertToProject}
            className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50"
          >
            Revert to Project
          </button>
        </div>

        {/* Symbol colour rows */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {symbols.map((symbolType) => {
            const def = getSymbolDefinition(symbolType);
            const currentColor = (workingColors[symbolType] ?? DEFAULT_SYMBOL_COLORS[symbolType]) as string;
            const projectColor = (projectColors[symbolType] ?? DEFAULT_SYMBOL_COLORS[symbolType]) as string;
            const isProjectColor = currentColor === projectColor;
            return (
              <div key={symbolType} className="flex items-center gap-3">
                {/* Colour swatch */}
                <div
                  className="w-6 h-6 rounded border border-gray-300 flex-shrink-0"
                  style={{ backgroundColor: currentColor }}
                />
                {/* Symbol label */}
                <span className="text-sm text-gray-700 flex-1">{def.label}</span>
                {/* Per-symbol revert button */}
                <button
                  onClick={() => handleColorChange(symbolType, projectColor)}
                  disabled={isProjectColor}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default px-1"
                  title="Revert to project colour"
                >
                  ↺
                </button>
                {/* Colour picker */}
                <input
                  type="color"
                  value={currentColor.startsWith("#") ? currentColor : "#374151"}
                  onChange={(e) => handleColorChange(symbolType, e.target.value)}
                  className="w-8 h-8 cursor-pointer rounded border border-gray-200 p-0.5"
                  title={`Change colour for ${def.label}`}
                />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          {saveError ? (
            <p className="text-sm text-red-600">{saveError}</p>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Confirm Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
