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
  /** When false, the Debug Mode toggle is hidden entirely. Restricted to
   *  admin users — the toggle reveals diagnostic internals (element ids,
   *  connector waypoints, etc.) that aren't useful for normal authors. */
  isAdmin?: boolean;
  showValueDisplay?: boolean;
  onShowValueDisplayChange?: (on: boolean) => void;
  showBottleneck?: boolean;
  onShowBottleneckChange?: (on: boolean) => void;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
  connectorFontSize?: number;
  onConnectorFontSizeChange?: (size: number) => void;
  titleFontSize?: number;
  onTitleFontSizeChange?: (size: number) => void;
  poolFontSize?: number;
  onPoolFontSizeChange?: (size: number) => void;
  laneFontSize?: number;
  onLaneFontSizeChange?: (size: number) => void;
  /** Context-Diagram only — independent control over the process-system
   *  (central circle) label font size. */
  processFontSize?: number;
  onProcessFontSizeChange?: (size: number) => void;
  /** Value-Chain only — Value Chain element (process-group) name + Process
   *  description box font sizes. */
  valueChainFontSize?: number;
  onValueChainFontSizeChange?: (size: number) => void;
  descriptionFontSize?: number;
  onDescriptionFontSizeChange?: (size: number) => void;
  onClose: () => void;
  onSaved: (config: SymbolColorConfig, settings?: {
    displayMode?: DisplayMode;
    fontSize?: number;
    connectorFontSize?: number;
    titleFontSize?: number;
    poolFontSize?: number;
    laneFontSize?: number;
    processFontSize?: number;
    valueChainFontSize?: number;
    descriptionFontSize?: number;
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
  isAdmin,
  showValueDisplay,
  onShowValueDisplayChange,
  showBottleneck,
  onShowBottleneckChange,
  fontSize,
  onFontSizeChange,
  connectorFontSize,
  onConnectorFontSizeChange,
  titleFontSize,
  onTitleFontSizeChange,
  poolFontSize,
  onPoolFontSizeChange,
  laneFontSize,
  onLaneFontSizeChange,
  processFontSize,
  onProcessFontSizeChange,
  valueChainFontSize,
  onValueChainFontSizeChange,
  descriptionFontSize,
  onDescriptionFontSizeChange,
  onClose,
  onSaved,
}: Props) {
  const isContext = diagramType === "context" || diagramType === "basic";
  const [workingColors, setWorkingColors] = useState<SymbolColorConfig>({
    ...DEFAULT_SYMBOL_COLORS,
    ...projectColors,
    ...initialColorConfig,
  });
  const [workingDisplayMode, setWorkingDisplayMode] = useState<DisplayMode>(displayMode);
  // Context-Diagram defaults: Entity Names 14 / Process Names 16 / Flow Labels 12.
  // ArchiMate element names also default to 14. Domain (UML) defaults: Elements 14
  // / Connectors 14 / Title 16 — MUST match the canvas defaults in Canvas.tsx, else
  // opening this dialog + applying writes the wrong (smaller) size and the domain
  // fonts appear to "revert".
  const isDomain = diagramType === "domain";
  const defaultElementFontSize = (isContext || diagramType === "archimate" || isDomain) ? 14 : 12;
  const defaultConnectorFontSize = isContext ? 12 : isDomain ? 14 : 10;
  const defaultTitleFontSize = isDomain ? 16 : 14;
  const defaultProcessFontSize = 16;
  const [workingFontSize, setWorkingFontSize] = useState(fontSize ?? defaultElementFontSize);
  const [workingConnectorFontSize, setWorkingConnectorFontSize] = useState(connectorFontSize ?? defaultConnectorFontSize);
  const [workingTitleFontSize, setWorkingTitleFontSize] = useState(titleFontSize ?? defaultTitleFontSize);
  const [workingPoolFontSize, setWorkingPoolFontSize] = useState(poolFontSize ?? 16);
  const [workingLaneFontSize, setWorkingLaneFontSize] = useState(laneFontSize ?? 14);
  const [workingProcessFontSize, setWorkingProcessFontSize] = useState(processFontSize ?? defaultProcessFontSize);
  const [workingValueChainFontSize, setWorkingValueChainFontSize] = useState(valueChainFontSize ?? 16);
  const [workingDescriptionFontSize, setWorkingDescriptionFontSize] = useState(descriptionFontSize ?? 14);
  // saving/saveError no longer needed — save happens in background after modal closes

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

  function handleConfirm() {
    // Apply all pending settings immediately
    onDisplayModeChange(workingDisplayMode);
    if (onFontSizeChange) onFontSizeChange(workingFontSize);
    if (onConnectorFontSizeChange) onConnectorFontSizeChange(workingConnectorFontSize);
    if (onTitleFontSizeChange) onTitleFontSizeChange(workingTitleFontSize);
    if (onPoolFontSizeChange) onPoolFontSizeChange(workingPoolFontSize);
    if (onLaneFontSizeChange) onLaneFontSizeChange(workingLaneFontSize);
    if (onProcessFontSizeChange) onProcessFontSizeChange(workingProcessFontSize);
    if (onValueChainFontSizeChange) onValueChainFontSizeChange(workingValueChainFontSize);
    if (onDescriptionFontSizeChange) onDescriptionFontSizeChange(workingDescriptionFontSize);
    onSaved(workingColors);
    onClose();

    // Save colour config to database in the background
    fetch(`/api/diagrams/${diagramId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colorConfig: workingColors }),
    }).catch(() => {
      // Background save failed — colours still applied locally, will persist on next diagram save
    });
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Diagram Config</h2>
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

        {/* 3. Font Sizes \u2014 every diagram type defines its own list of
            controls so labels match the element vocabulary the user
            actually sees on the canvas. Context-Diagram uses
            Entity / Process / Flow; everything else keeps the legacy
            Elements / Connectors / Title (+ Pools / Lanes for BPMN). */}
        {(onFontSizeChange || onConnectorFontSizeChange || onTitleFontSizeChange || onPoolFontSizeChange || onLaneFontSizeChange || onProcessFontSizeChange) && (() => {
          interface FontControl {
            label: string;
            value: number;
            setValue: (v: number) => void;
            default: number;
            min: number;
            max: number;
            enabled: boolean;
          }
          const controls: FontControl[] = isContext
            ? [
                { label: "Entity Names",  value: workingFontSize,          setValue: setWorkingFontSize,          default: 14, min: 6,  max: 30, enabled: !!onFontSizeChange },
                { label: "Process Names", value: workingProcessFontSize,   setValue: setWorkingProcessFontSize,   default: 16, min: 8,  max: 36, enabled: !!onProcessFontSizeChange },
                { label: "Flow Labels",   value: workingConnectorFontSize, setValue: setWorkingConnectorFontSize, default: 12, min: 6,  max: 24, enabled: !!onConnectorFontSizeChange },
              ]
            : [
                { label: "Elements",   value: workingFontSize,          setValue: setWorkingFontSize,          default: defaultElementFontSize,   min: 6,  max: 24, enabled: !!onFontSizeChange },
                { label: "Connectors", value: workingConnectorFontSize, setValue: setWorkingConnectorFontSize, default: defaultConnectorFontSize, min: 6,  max: 24, enabled: !!onConnectorFontSizeChange },
                { label: "Title",      value: workingTitleFontSize,     setValue: setWorkingTitleFontSize,     default: defaultTitleFontSize,     min: 8,  max: 30, enabled: !!onTitleFontSizeChange },
                { label: "Pools",      value: workingPoolFontSize,      setValue: setWorkingPoolFontSize,      default: 12, min: 6,  max: 24, enabled: !!onPoolFontSizeChange && diagramType === "bpmn" },
                { label: "Lanes",      value: workingLaneFontSize,      setValue: setWorkingLaneFontSize,      default: 12, min: 6,  max: 24, enabled: !!onLaneFontSizeChange && diagramType === "bpmn" },
                { label: "Value Chain Name", value: workingValueChainFontSize,  setValue: setWorkingValueChainFontSize,  default: 16, min: 8, max: 36, enabled: !!onValueChainFontSizeChange && diagramType === "value-chain" },
                { label: "Description",      value: workingDescriptionFontSize, setValue: setWorkingDescriptionFontSize, default: 14, min: 6, max: 30, enabled: !!onDescriptionFontSizeChange && diagramType === "value-chain" },
              ];
          const visible = controls.filter(c => c.enabled);
          if (visible.length === 0) return null;
          return (
            <div className="px-5 py-1.5 border-t border-gray-200 flex-shrink-0 space-y-1">
              <span className="text-xs font-medium text-gray-700">Font Sizes</span>
              {visible.map(c => (
                <div key={c.label} className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">{c.label}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => c.setValue(c.default)} disabled={c.value === c.default} title={`Default (${c.default}px)`}
                      className="text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-30">{"\u21BA"}</button>
                    <button onClick={() => c.setValue(Math.max(c.min, c.value - 1))}
                      className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">-</button>
                    <span className="text-xs font-mono font-semibold text-gray-800 w-6 text-center">{c.value}</span>
                    <button onClick={() => c.setValue(Math.min(c.max, c.value + 1))}
                      className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-gray-700 border border-gray-400 rounded hover:bg-gray-100">+</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* 4. Debug Mode — BPMN-only, and admin-only within BPMN. Hidden
            entirely for non-admin users and for every non-BPMN diagram
            type (those don't have meaningful debug overlays). */}
        {onDebugModeChange && isAdmin && diagramType === "bpmn" && (
          <div className="flex items-center justify-between px-5 py-1.5 border-t border-gray-200 flex-shrink-0">
            <span className="text-xs font-medium text-gray-700">
              Debug Mode <span className="text-[9px] font-normal text-gray-400">(admin)</span>
            </span>
            <label className="flex items-center cursor-pointer">
              <input type="checkbox" checked={debugMode ?? false}
                onChange={(e) => onDebugModeChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            </label>
          </div>
        )}

        {/* 5. Value Display — BPMN-only (value-per-task overlays don't
            apply to other diagram types). */}
        {onShowValueDisplayChange && diagramType === "bpmn" && (
          <div className="flex items-center justify-between px-5 py-1.5 border-t border-gray-200 flex-shrink-0">
            <span className="text-xs font-medium text-gray-700">Value Display</span>
            <label className="flex items-center cursor-pointer">
              <input type="checkbox" checked={showValueDisplay ?? false}
                onChange={(e) => onShowValueDisplayChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            </label>
          </div>
        )}

        {/* 6. Bottleneck Display — BPMN-only (bottleneck is a flow-time
            concept; not meaningful outside BPMN). */}
        {onShowBottleneckChange && diagramType === "bpmn" && (
          <div className="flex items-center justify-between px-5 py-1.5 border-t border-gray-200 flex-shrink-0">
            <span className="text-xs font-medium text-gray-700">Bottleneck Display</span>
            <label className="flex items-center cursor-pointer">
              <input type="checkbox" checked={showBottleneck ?? false}
                onChange={(e) => onShowBottleneckChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            </label>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-2.5 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm text-white rounded-md bg-blue-600 hover:bg-blue-700"
          >
            Confirm Changes
          </button>
        </div>
      </div>
    </div>
  );
}
