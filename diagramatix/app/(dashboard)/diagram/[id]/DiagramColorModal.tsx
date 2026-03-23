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
  onSaved: (config: SymbolColorConfig, settings?: {
    displayMode?: DisplayMode;
    fontSize?: number;
    connectorFontSize?: number;
    titleFontSize?: number;
  }) => void;
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
  const [workingDisplayMode, setWorkingDisplayMode] = useState<DisplayMode>(displayMode);
  const [workingFontSize, setWorkingFontSize] = useState(fontSize ?? 12);
  const [workingConnectorFontSize, setWorkingConnectorFontSize] = useState(connectorFontSize ?? 10);
  const [workingTitleFontSize, setWorkingTitleFontSize] = useState(titleFontSize ?? 14);
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
      // Apply all pending settings
      onDisplayModeChange(workingDisplayMode);
      if (onFontSizeChange) onFontSizeChange(workingFontSize);
      if (onConnectorFontSizeChange) onConnectorFontSizeChange(workingConnectorFontSize);
      if (onTitleFontSizeChange) onTitleFontSizeChange(workingTitleFontSize);
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
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Diagram Maintenance</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* 1. Display Mode */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-gray-200 flex-shrink-0">
          <span className="text-xs font-medium text-gray-700">Display Mode</span>
          <button
            onClick={() => setWorkingDisplayMode(workingDisplayMode === "hand-drawn" ? "normal" : "hand-drawn")}
            className={`px-2.5 py-1 text-xs border rounded flex items-center gap-1.5 ${
              workingDisplayMode === "hand-drawn"
                ? "bg-gray-800 text-white border-gray-800"
                : "text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 14l3-1L13.5 4.5a1.4 1.4 0 0 0-2-2L3 11l-1 3z" />
              <path d="M11.5 2.5l2 2" />
            </svg>
            {workingDisplayMode === "hand-drawn" ? "Hand Drawn" : "Normal"}
          </button>
        </div>

        {/* 2. Colours header + actions */}
        <div className="flex items-center gap-2 px-5 py-1.5 border-b border-gray-200 flex-shrink-0">
          <span className="text-xs font-medium text-gray-700 flex-1">Colours</span>
          <button onClick={handleBlackAndWhite}
            className="text-[10px] text-gray-600 hover:text-gray-800 border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-50">
            Black &amp; White
          </button>
          <button onClick={handleRevertToProject}
            className="text-[10px] text-gray-600 hover:text-gray-800 border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-50">
            Revert to Project Colours
          </button>
        </div>

        {/* 2b. Symbol colour rows */}
        <div className="flex-1 overflow-y-auto px-5 py-1.5 space-y-1">
          {symbols.map((symbolType) => {
            const def = getSymbolDefinition(symbolType);
            const currentColor = (workingColors[symbolType] ?? DEFAULT_SYMBOL_COLORS[symbolType]) as string;
            const projectColor = (projectColors[symbolType] ?? DEFAULT_SYMBOL_COLORS[symbolType]) as string;
            const isProjectColor = currentColor === projectColor;
            return (
              <div key={symbolType} className="flex items-center gap-2">
                <div className="w-5 h-5 rounded border border-gray-300 flex-shrink-0"
                  style={{ backgroundColor: currentColor }} />
                <span className="text-xs text-gray-700 flex-1">{def.label}</span>
                <button onClick={() => handleColorChange(symbolType, projectColor)}
                  disabled={isProjectColor}
                  className="text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default"
                  title="Revert to project colour">{"\u21BA"}</button>
                <input type="color"
                  value={currentColor.startsWith("#") ? currentColor : "#374151"}
                  onChange={(e) => handleColorChange(symbolType, e.target.value)}
                  className="w-6 h-6 cursor-pointer rounded border border-gray-200 p-0"
                  title={`Change colour for ${def.label}`} />
              </div>
            );
          })}
        </div>

        {/* 3. Font Sizes */}
        {(onFontSizeChange || onConnectorFontSizeChange || onTitleFontSizeChange) && (
          <div className="px-5 py-1.5 border-t border-gray-200 flex-shrink-0 space-y-1">
            <span className="text-xs font-medium text-gray-700">Font Sizes</span>
            {onFontSizeChange && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Elements</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setWorkingFontSize(12)} disabled={workingFontSize === 12} title="Default (12px)"
                    className="text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-30">{"\u21BA"}</button>
                  <button onClick={() => setWorkingFontSize(Math.max(6, workingFontSize - 1))}
                    className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">-</button>
                  <span className="text-xs font-mono font-semibold text-gray-800 w-6 text-center">{workingFontSize}</span>
                  <button onClick={() => setWorkingFontSize(Math.min(24, workingFontSize + 1))}
                    className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">+</button>
                </div>
              </div>
            )}
            {onConnectorFontSizeChange && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Connectors</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setWorkingConnectorFontSize(10)} disabled={workingConnectorFontSize === 10} title="Default (10px)"
                    className="text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-30">{"\u21BA"}</button>
                  <button onClick={() => setWorkingConnectorFontSize(Math.max(6, workingConnectorFontSize - 1))}
                    className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">-</button>
                  <span className="text-xs font-mono font-semibold text-gray-800 w-6 text-center">{workingConnectorFontSize}</span>
                  <button onClick={() => setWorkingConnectorFontSize(Math.min(24, workingConnectorFontSize + 1))}
                    className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">+</button>
                </div>
              </div>
            )}
            {onTitleFontSizeChange && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Title</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setWorkingTitleFontSize(14)} disabled={workingTitleFontSize === 14} title="Default (14px)"
                    className="text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-30">{"\u21BA"}</button>
                  <button onClick={() => setWorkingTitleFontSize(Math.max(8, workingTitleFontSize - 1))}
                    className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">-</button>
                  <span className="text-xs font-mono font-semibold text-gray-800 w-6 text-center">{workingTitleFontSize}</span>
                  <button onClick={() => setWorkingTitleFontSize(Math.min(30, workingTitleFontSize + 1))}
                    className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">+</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. Debug Mode */}
        {onDebugModeChange && (
          <div className="flex items-center justify-between px-5 py-1.5 border-t border-gray-200 flex-shrink-0">
            <span className="text-xs font-medium text-gray-700">Debug Mode</span>
            <label className="flex items-center cursor-pointer">
              <input type="checkbox" checked={debugMode ?? false}
                onChange={(e) => onDebugModeChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            </label>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-t border-gray-200 flex-shrink-0">
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
              className={`px-4 py-2 text-sm text-white rounded-md ${
                saving
                  ? "bg-green-600"
                  : "bg-blue-600 hover:bg-blue-700"
              } disabled:cursor-not-allowed`}
            >
              {saving ? "Saving\u2026" : "Confirm Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
