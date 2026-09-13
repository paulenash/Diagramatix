"use client";

/**
 * Item 12 — every elevated AI Generate option, gathered into one pop-up instead
 * of interleaved with the controls everybody uses.
 *
 * The gates are exactly the ones the sidebar applies, not a single "is admin":
 *   • Compare Models / Export AI Package — SuperAdmin only
 *   • AI Model / Technical Description / Staff Narrative — org Admin and above
 * and presentation mode (`hidden`) suppresses the lot. If nothing is permitted
 * the component renders NOTHING — so a non-SuperAdmin who somehow reached it
 * gets an empty result rather than a modal listing what they cannot do.
 */
import { AiPanel, AiButton, AiSpinner, aiTones } from "./AiConsoleChrome";
import { ModelSelect, type AllowedModel } from "../ModelSelect";
import type { AiModel } from "@/app/lib/ai/models";

export function SuperAdminOptionsModal({
  accent, isSuperuser, isAdmin, hidden,
  availModels, pickedModels, onTogglePicked, onSetPicked,
  comparing, exporting, canRun, onCompare, onExport, compareStatus,
  aiModels, model, onModelChange, busy,
  onTechnicalDescription, onStaffNarrative,
  onClose,
}: {
  accent: string;
  isSuperuser: boolean;
  isAdmin: boolean;
  hidden: boolean;
  availModels: AiModel[];
  pickedModels: Set<string>;
  onTogglePicked: (id: string) => void;
  onSetPicked: (next: Set<string>) => void;
  comparing: boolean;
  exporting: boolean;
  /** A prompt or an attachment exists, and there is a diagram to fill. */
  canRun: boolean;
  onCompare: () => void;
  onExport: () => void;
  compareStatus: string | null;
  aiModels: AllowedModel[];
  model: string;
  onModelChange: (id: string) => void;
  busy: boolean;
  onTechnicalDescription: () => void;
  onStaffNarrative: () => void;
  onClose: () => void;
}) {
  const tones = aiTones(accent);
  const showCompare = isSuperuser && !hidden;
  const showAdmin = isAdmin && !hidden;
  if (!showCompare && !showAdmin) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center font-mono p-6"
      style={{ background: "rgba(8,10,14,0.94)" }}>
      <div className="w-full max-w-2xl max-h-full overflow-y-auto flex flex-col gap-3">
        <header className="flex items-center justify-between">
          <span className="tracking-[0.25em] text-sm" style={{ color: tones.bright }}>
            ⚙ SUPERADMIN AI GENERATE OPTIONS
          </span>
          <AiButton tones={tones} variant="muted" onClick={onClose}>✕ Close</AiButton>
        </header>

        {showCompare && (
          <AiPanel title="Model comparison" tones={tones}
            hint={pickedModels.size ? `${pickedModels.size} selected` : "none selected"}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-h-56 overflow-y-auto mb-2">
              {availModels.map((m) => (
                <label key={m.id} className="flex items-center gap-1.5 text-[11px] text-white/75 cursor-pointer">
                  <input type="checkbox" checked={pickedModels.has(m.id)} onChange={() => onTogglePicked(m.id)}
                    className="w-3 h-3" />
                  <span className="truncate" title={m.label}>{m.label}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <button type="button" onClick={() => onSetPicked(new Set(availModels.map((m) => m.id)))}
                className="text-[10px] text-white/45 hover:text-white underline">All</button>
              <button type="button" onClick={() => onSetPicked(new Set())}
                className="text-[10px] text-white/45 hover:text-white underline">None</button>
            </div>
            <div className="flex gap-2">
              <AiButton tones={tones} variant="danger" className="flex-1"
                onClick={onCompare}
                disabled={comparing || exporting || !canRun || pickedModels.size === 0}
                title="SuperAdmin: generate the ticked models from the prompt and/or attachment, fill this diagram with the best result, and save one diagram per model">
                {comparing && <AiSpinner />}
                {comparing ? "Comparing…" : `Compare Models${pickedModels.size ? ` (${pickedModels.size})` : ""}`}
              </AiButton>
              <AiButton tones={tones} variant="muted" className="flex-1"
                onClick={onExport} disabled={comparing || exporting || !canRun}
                title="SuperAdmin: download a ZIP of the exact prompt, rules, image and model params sent to the AI — without running a generation. For local-LLM testing.">
                {exporting && <AiSpinner />}
                {exporting ? "Building…" : "Export AI Package"}
              </AiButton>
            </div>
            {compareStatus && (
              <p className="text-[10px] text-white/55 mt-2 whitespace-pre-wrap">{compareStatus}</p>
            )}
          </AiPanel>
        )}

        {showAdmin && aiModels.length > 0 && (
          <AiPanel title="AI model" tones={tones} hint="used for Plan and Refine">
            <ModelSelect value={model} onChange={onModelChange} models={aiModels} disabled={busy}
              className="w-full text-xs rounded px-2 py-1 bg-black/50 text-white/90 border border-white/25 [color-scheme:dark] disabled:opacity-50" />
          </AiPanel>
        )}

        {showAdmin && (
          <AiPanel title="Create prompt from diagram" tones={tones}
            hint="replaces the text in the description box">
            <div className="flex gap-2">
              <AiButton tones={tones} variant="danger" className="flex-1"
                onClick={onTechnicalDescription} disabled={busy}
                title="Admin only — reverse-engineer the current diagram into a structured Technical Description">
                Technical Description
              </AiButton>
              <AiButton tones={tones} variant="danger" className="flex-1"
                onClick={onStaffNarrative} disabled={busy}
                title="Admin only — ask the AI to rewrite the diagram as a Staff Narrative (uses the editable briefing in /dashboard/rules → Staff Narrative)">
                Staff Narrative
              </AiButton>
            </div>
          </AiPanel>
        )}
      </div>
    </div>
  );
}
