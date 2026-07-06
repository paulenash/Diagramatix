"use client";

/**
 * Full-screen pop-up editor for the AI-generated plan structure — the Pool/Lane,
 * Elements, Connectors and JSON views that used to sit under the AI Generate
 * panel, moved into a Simulator-style console (mono chrome + a MatrixRain
 * backdrop) themed by the configurable Diagram-Type colour so it generalises to
 * other diagram types. Edits mutate the shared plan (usePlanState) and Apply
 * pushes it through the normal layout → canvas path.
 */
import { useMemo, useState } from "react";
import type { Plan } from "./usePlanState";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { PoolsLanesTree } from "./PoolsLanesTree";
import { ElementsByContainerView } from "./ElementsByContainerView";
import { ConnectorsByTypeView } from "./ConnectorsByTypeView";
import { JsonTree } from "./JsonTree";
import { MatrixRain } from "@/app/components/simulation/matrix/MatrixRain";
import { useDiagramTypeStyles } from "@/app/hooks/useDiagramTypeStyles";

interface Props {
  plan: Plan;
  diagramType: string;
  isFlowchart?: boolean;
  applying?: boolean;
  updateElement: (id: string, patch: Partial<AiElement>) => void;
  deleteElement: (id: string) => void;
  updateConnection: (idx: number, patch: Partial<AiConnection>) => void;
  deleteConnection: (idx: number) => void;
  moveElementRelativeTo: (draggedId: string, targetId: string, position: "before" | "after") => void;
  setPlan: (next: Plan) => void;
  onApply: () => void;
  onClose: () => void;
}

function Panel({ title, accent, hint, children }: { title: string; accent: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-0 bg-white/95 rounded-lg overflow-hidden border" style={{ borderColor: accent }}>
      <div className="px-3 py-1.5 shrink-0 flex items-center justify-between" style={{ backgroundColor: accent }}>
        <span className="text-[11px] font-mono uppercase tracking-widest text-black/80 font-semibold">{title}</span>
        {hint && <span className="text-[9px] text-black/55">{hint}</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5">{children}</div>
    </div>
  );
}

export function PlanStructureModal(props: Props) {
  const { plan, diagramType, isFlowchart, applying, updateElement, deleteElement, updateConnection, deleteConnection, moveElementRelativeTo, setPlan, onApply, onClose } = props;
  const getTypeStyle = useDiagramTypeStyles();
  const accent = getTypeStyle(diagramType)?.bgColor || "#93c5fd";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const asJson = useMemo(() => JSON.stringify(plan, null, 2), [plan]);
  const [jsonDraft, setJsonDraft] = useState(asJson);
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [jsonMode, setJsonMode] = useState<"tree" | "raw">("tree");

  const commitJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      if (!parsed || !Array.isArray(parsed.elements) || !Array.isArray(parsed.connections)) {
        setJsonErr("JSON must be { elements: [...], connections: [...] }"); return;
      }
      setPlan(parsed); setJsonErr(null);
    } catch (e) { setJsonErr(e instanceof Error ? e.message : "Invalid JSON"); }
  };

  const btn = "px-3 py-1 text-xs font-mono tracking-wider border rounded transition";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col font-mono" style={{ background: "rgba(8,10,14,0.94)" }}>
      {/* Type-coloured rain backdrop (subtle) */}
      <div className="absolute inset-0 opacity-25 pointer-events-none">
        <MatrixRain fontSize={16} color={accent} headColor="#ffffff" />
      </div>

      {/* Header */}
      <header className="relative shrink-0 flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: `${accent}66` }}>
        <div className="flex items-center gap-3">
          <span className="tracking-[0.25em] text-sm" style={{ color: accent }}>◇ STRUCTURE EDITOR</span>
          <span className="text-xs text-white/50">{diagramType.toUpperCase()} plan · {plan.elements.length} elements · {plan.connections.length} connectors</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onApply} disabled={applying} className={`${btn} disabled:opacity-40`} style={{ color: accent, borderColor: accent }}>
            {applying ? "Applying…" : "▸ Apply to canvas"}
          </button>
          <button onClick={onClose} className={`${btn} text-white/70 border-white/30 hover:bg-white/10`}>✕ Exit</button>
        </div>
      </header>

      {/* Columns */}
      <main className="relative flex-1 min-h-0 p-4 grid gap-4 grid-cols-1 lg:grid-cols-4 overflow-auto">
        {!isFlowchart && (
          <Panel title="Pools / Lanes" accent={accent} hint="drag ⋮⋮ to reorder">
            <PoolsLanesTree
              elements={plan.elements}
              onRename={(id, label) => updateElement(id, { label })}
              onDelete={deleteElement}
              onMove={moveElementRelativeTo}
              onSetSystem={(id, isSystem) => updateElement(id, { isSystem })}
            />
          </Panel>
        )}
        {!isFlowchart && (
          <Panel title="Elements" accent={accent} hint="badge: green=to · orange=from">
            <ElementsByContainerView
              elements={plan.elements}
              connections={plan.connections}
              onRename={(id, label) => updateElement(id, { label })}
              onDelete={deleteElement}
              onMove={moveElementRelativeTo}
              onUpdate={updateElement}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Panel>
        )}
        {!isFlowchart && (
          <Panel title="Connectors" accent={accent} hint="green=seq · blue=msg · purple=assoc">
            <ConnectorsByTypeView
              elements={plan.elements}
              connections={plan.connections}
              onRenameLabel={(idx, label) => updateConnection(idx, { label })}
              onDelete={deleteConnection}
            />
          </Panel>
        )}
        <Panel title="JSON" accent={accent} hint={jsonMode === "tree" ? "click ▸/▾ to fold" : "edit + Apply"}>
          <div className="flex items-center gap-1 mb-2">
            {(["tree", "raw"] as const).map((m) => (
              <button key={m} onClick={() => { setJsonMode(m); if (m === "raw") setJsonDraft(asJson); }}
                className={`text-[10px] px-2 py-0.5 rounded border ${jsonMode === m ? "bg-gray-800 text-white border-gray-800" : "text-gray-600 border-gray-300"}`}>
                {m === "tree" ? "Viewer" : "Raw edit"}
              </button>
            ))}
          </div>
          {jsonMode === "tree" ? (
            <div className="rounded bg-[#0b0e14] p-2 text-white/90">
              <JsonTree value={plan} accent={accent} />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <textarea value={jsonDraft} onChange={(e) => { setJsonDraft(e.target.value); setJsonErr(null); }} spellCheck={false} rows={22}
                className="w-full font-mono text-[10px] border border-gray-300 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <div className="flex items-center gap-2">
                <button onClick={commitJson} disabled={jsonDraft === asJson} className="px-2 py-0.5 text-[10px] text-white bg-gray-700 rounded hover:bg-gray-800 disabled:opacity-50">Apply JSON</button>
                {jsonErr && <span className="text-[10px] text-red-600">{jsonErr}</span>}
              </div>
            </div>
          )}
        </Panel>
      </main>
    </div>
  );
}
