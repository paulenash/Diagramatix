"use client";

import { useState } from "react";
import type { DiagramType, SymbolType } from "@/app/lib/diagram/types";
import { DEFAULT_SYMBOL_COLORS, BW_SYMBOL_COLORS, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import { COLOR_PALETTE_BY_DIAGRAM_TYPE, getSymbolDefinition } from "@/app/lib/diagram/symbols/definitions";

/** Project-level typography defaults. New diagrams created in this project
 *  pick these up at creation (see app/api/diagrams/route.ts POST). Existing
 *  diagrams keep their own per-diagram values. */
export interface FontConfig {
  fontSize?: number;          // element labels (tasks, events, gateways, …) — default 12
  connectorFontSize?: number; // connector labels — default 10
  titleFontSize?: number;     // diagram title — default 14
  poolFontSize?: number;      // pool headers — default 12
  laneFontSize?: number;      // lane headers — default 12
}

const FONT_DEFAULTS: Required<FontConfig> = {
  fontSize: 12,
  connectorFontSize: 10,
  titleFontSize: 14,
  poolFontSize: 16,
  laneFontSize: 14,
};

interface FontRow {
  key: keyof FontConfig;
  label: string;
  hint: string;
  min: number;
  max: number;
}

const FONT_ROWS: FontRow[] = [
  { key: "fontSize",          label: "Element labels",   hint: "Tasks, events, gateways, data objects", min: 6, max: 36 },
  { key: "connectorFontSize", label: "Connector labels", hint: "Sequence / message / association",      min: 6, max: 24 },
  { key: "titleFontSize",     label: "Diagram title",    hint: "Top-of-canvas title text",              min: 8, max: 48 },
  { key: "poolFontSize",      label: "Pool headers",     hint: "Pool name strip on the left",           min: 6, max: 36 },
  { key: "laneFontSize",      label: "Lane headers",     hint: "Lane name strip on the left",           min: 6, max: 36 },
];

interface Props {
  projectId: string;
  initialColorConfig: SymbolColorConfig;
  initialFontConfig: FontConfig;
  onClose: () => void;
  onSaved: (config: { colorConfig: SymbolColorConfig; fontConfig: FontConfig }) => void;
}

const TABS: { type: DiagramType; label: string }[] = [
  { type: "bpmn",            label: "BPMN" },
  { type: "process-context", label: "Process Context" },
  { type: "state-machine",   label: "State Machine" },
  { type: "context",           label: "Context" },
  { type: "domain",            label: "Domain" },
  { type: "flowchart",         label: "Standard Flowchart" },
];

type Section = "colours" | "typography";

export function DiagramMaintenanceModal({
  projectId,
  initialColorConfig,
  initialFontConfig,
  onClose,
  onSaved,
}: Props) {
  const [activeSection, setActiveSection] = useState<Section>("colours");
  const [activeTab, setActiveTab] = useState<DiagramType>("bpmn");
  const [workingColors, setWorkingColors] = useState<SymbolColorConfig>({
    ...DEFAULT_SYMBOL_COLORS,
    ...initialColorConfig,
  });
  const [workingFonts, setWorkingFonts] = useState<FontConfig>({ ...initialFontConfig });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const symbols: SymbolType[] = COLOR_PALETTE_BY_DIAGRAM_TYPE[activeTab];

  function handleColorChange(type: SymbolType, color: string) {
    setWorkingColors((prev) => ({ ...prev, [type]: color }));
  }

  function handleResetColours() {
    setWorkingColors({ ...DEFAULT_SYMBOL_COLORS });
  }

  function handleBlackAndWhite() {
    setWorkingColors({ ...BW_SYMBOL_COLORS });
  }

  function handleFontChange(key: keyof FontConfig, raw: string) {
    if (raw === "") {
      setWorkingFonts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    setWorkingFonts((prev) => ({ ...prev, [key]: n }));
  }

  function handleResetFonts() {
    setWorkingFonts({});
  }

  async function handleConfirm() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorConfig: workingColors, fontConfig: workingFonts }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(`Save failed (${res.status})${body?.error ? ": " + body.error : ""}`);
        return;
      }
      onSaved({ colorConfig: workingColors, fontConfig: workingFonts });
      onClose();
    } catch {
      setSaveError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Project Config</h2>
          <div className="flex items-center gap-3">
            {activeSection === "colours" && (
              <>
                <button
                  onClick={handleBlackAndWhite}
                  className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50"
                >
                  Black &amp; White
                </button>
                <button
                  onClick={handleResetColours}
                  className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50"
                >
                  Reset to Defaults
                </button>
              </>
            )}
            {activeSection === "typography" && (
              <button
                onClick={handleResetFonts}
                className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50"
                title="Clear all overrides; new diagrams will use system defaults"
              >
                Use defaults
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex border-b border-gray-200 px-6 flex-shrink-0">
          <button
            onClick={() => setActiveSection("colours")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              activeSection === "colours"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Colours
          </button>
          <button
            onClick={() => setActiveSection("typography")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              activeSection === "typography"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Typography
          </button>
        </div>

        {activeSection === "colours" && (
          <>
            {/* Diagram-type tabs */}
            <div className="flex border-b border-gray-200 px-6 flex-shrink-0 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.type}
                  onClick={() => setActiveTab(tab.type)}
                  className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                    activeTab === tab.type
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {symbols.map((symbolType) => {
                const def = getSymbolDefinition(symbolType);
                const currentColor = (workingColors[symbolType] ?? DEFAULT_SYMBOL_COLORS[symbolType]) as string;
                const isDefault = currentColor === DEFAULT_SYMBOL_COLORS[symbolType];
                return (
                  <div key={symbolType} className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded border border-gray-300 flex-shrink-0"
                      style={{ backgroundColor: currentColor }}
                    />
                    <span className="text-sm text-gray-700 flex-1">{def.label}</span>
                    <button
                      onClick={() => handleColorChange(symbolType, DEFAULT_SYMBOL_COLORS[symbolType])}
                      disabled={isDefault}
                      className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default px-1"
                      title="Revert to default"
                    >
                      ↺
                    </button>
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
          </>
        )}

        {activeSection === "typography" && (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <p className="text-xs text-gray-500 mb-4">
              These sizes (in pixels) are applied to NEW diagrams created in this project.
              Existing diagrams keep their own font sizes. Leave a field blank to use the
              system default.
            </p>
            <div className="space-y-3">
              {FONT_ROWS.map((row) => {
                const value = workingFonts[row.key];
                const defaultValue = FONT_DEFAULTS[row.key];
                return (
                  <div key={row.key} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm text-gray-800">{row.label}</div>
                      <div className="text-[10px] text-gray-500">{row.hint}</div>
                    </div>
                    <button
                      onClick={() => handleFontChange(row.key, "")}
                      disabled={value === undefined}
                      className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default px-1"
                      title="Clear override"
                    >
                      ↺
                    </button>
                    <input
                      type="number"
                      min={row.min}
                      max={row.max}
                      value={value ?? ""}
                      placeholder={String(defaultValue)}
                      onChange={(e) => handleFontChange(row.key, e.target.value)}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400 w-6">px</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
              className={`px-4 py-2 text-sm text-white rounded-md ${
                saving ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"
              } disabled:cursor-not-allowed`}
            >
              {saving ? "Saving…" : "Confirm Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
