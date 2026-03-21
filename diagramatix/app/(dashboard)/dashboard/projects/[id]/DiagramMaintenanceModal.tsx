"use client";

import { useState } from "react";
import type { DiagramType, SymbolType } from "@/app/lib/diagram/types";
import { DEFAULT_SYMBOL_COLORS, BW_SYMBOL_COLORS, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import { COLOR_PALETTE_BY_DIAGRAM_TYPE, getSymbolDefinition } from "@/app/lib/diagram/symbols/definitions";

interface Props {
  projectId: string;
  initialColorConfig: SymbolColorConfig;
  debugMode?: boolean;
  onClose: () => void;
  onSaved: (config: SymbolColorConfig, debugMode?: boolean) => void;
}

const TABS: { type: DiagramType; label: string }[] = [
  { type: "bpmn",            label: "BPMN" },
  { type: "process-context", label: "Process Context" },
  { type: "state-machine",   label: "State Machine" },
  { type: "context",           label: "Context Diagram" },
];

export function DiagramMaintenanceModal({ projectId, initialColorConfig, debugMode: initialDebugMode, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<DiagramType>("bpmn");
  const [workingColors, setWorkingColors] = useState<SymbolColorConfig>({
    ...DEFAULT_SYMBOL_COLORS,
    ...initialColorConfig,
  });
  const [debugOn, setDebugOn] = useState(initialDebugMode ?? false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const symbols: SymbolType[] = COLOR_PALETTE_BY_DIAGRAM_TYPE[activeTab];

  function handleColorChange(type: SymbolType, color: string) {
    setWorkingColors((prev) => ({ ...prev, [type]: color }));
  }

  function handleResetToDefaults() {
    setWorkingColors({ ...DEFAULT_SYMBOL_COLORS });
  }

  function handleBlackAndWhite() {
    setWorkingColors({ ...BW_SYMBOL_COLORS });
  }

  async function handleConfirm() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorConfig: workingColors }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(`Save failed (${res.status})${body?.error ? ": " + body.error : ""}`);
        return;
      }
      onSaved(workingColors, debugOn);
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
          <h2 className="text-lg font-semibold text-gray-900">Project Diagram Maintenance</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBlackAndWhite}
              className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50"
            >
              Black &amp; White
            </button>
            <button
              onClick={handleResetToDefaults}
              className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50"
            >
              Reset to Defaults
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.type}
              onClick={() => setActiveTab(tab.type)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.type
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Symbol colour rows */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {symbols.map((symbolType) => {
            const def = getSymbolDefinition(symbolType);
            const currentColor = (workingColors[symbolType] ?? DEFAULT_SYMBOL_COLORS[symbolType]) as string;
            const isDefault = currentColor === DEFAULT_SYMBOL_COLORS[symbolType];
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
                  onClick={() => handleColorChange(symbolType, DEFAULT_SYMBOL_COLORS[symbolType])}
                  disabled={isDefault}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default px-1"
                  title="Revert to default"
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

        {/* Debug Mode Toggle */}
        <div className="flex items-center gap-3 px-6 py-3 border-t border-gray-200 flex-shrink-0">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={debugOn}
              onChange={(e) => setDebugOn(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Debug Mode</span>
          </label>
          <span className="text-xs text-gray-400">Show element and connector IDs</span>
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
