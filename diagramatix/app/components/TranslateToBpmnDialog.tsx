"use client";

import { useMemo, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { translateFlowchartToBpmn } from "@/app/lib/diagram/translate/flowchartToBpmn";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";

interface CreatedDiagram {
  id: string;
  name: string;
  type: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Props {
  /** The source flowchart's data. */
  source: DiagramData;
  /** The source flowchart's name (the new diagram is "<name> (BPMN)"). */
  sourceName: string;
  /** Project the new BPMN diagram is created in (null → user sandpit). */
  projectId: string | null;
  onClose: () => void;
  onCreated: (created: CreatedDiagram) => void;
}

/**
 * One-way "Translate to BPMN" preview + create dialog. Translation is
 * deterministic and runs client-side; the optional AI tidy pass refines
 * labels / task types only (structure-locked) and falls back to the
 * deterministic plan on any error.
 */
export function TranslateToBpmnDialog({ source, sourceName, projectId, onClose, onCreated }: Props) {
  const [aiTidy, setAiTidy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Deterministic translation drives the preview report.
  const { report, plan } = useMemo(() => {
    const r = translateFlowchartToBpmn(source, { processName: sourceName });
    return { report: r.report, plan: { aiElements: r.aiElements, aiConnections: r.aiConnections } };
  }, [source, sourceName]);

  async function handleCreate() {
    setBusy(true);
    setError("");
    try {
      let elements = plan.aiElements;
      let connections = plan.aiConnections;

      // Optional AI tidy — refine labels / types only; never structure. Any
      // failure (offline, no key, structure drift) silently keeps the
      // deterministic plan.
      if (aiTidy) {
        try {
          const res = await fetch("/api/ai/flowchart-to-bpmn/refine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ elements, connections }),
          });
          if (res.ok) {
            const refined = await res.json();
            if (refined?.elements && refined?.connections) {
              elements = refined.elements;
              connections = refined.connections;
            }
          }
        } catch {
          /* keep deterministic plan */
        }
      }

      const data: DiagramData = layoutBpmnDiagram(elements, connections);
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${sourceName} (BPMN)`,
          type: "bpmn",
          projectId: projectId ?? undefined,
          data,
        }),
      });
      if (!res.ok) {
        setError(`Could not create the BPMN diagram (${res.status}).`);
        setBusy(false);
        return;
      }
      const created: CreatedDiagram = await res.json();
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const counts: { label: string; n: number }[] = [
    { label: "Tasks", n: report.taskCount },
    { label: "Gateways", n: report.gatewayCount },
    { label: "Events", n: report.eventCount },
    { label: "Sub-processes", n: report.subprocessCount },
    { label: "Data objects", n: report.dataObjectCount },
    { label: "Data stores", n: report.dataStoreCount },
    { label: "Lanes", n: report.laneCount },
  ].filter((c) => c.n > 0);

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Translate to BPMN</h3>
          <p className="text-xs text-gray-600 leading-relaxed mb-3">
            Creates a new BPMN diagram <span className="font-medium">{sourceName} (BPMN)</span> from
            this flowchart. The flowchart is left unchanged.
          </p>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
            {counts.map((c) => (
              <div key={c.label} className="flex justify-between text-xs text-gray-700">
                <span>{c.label}</span>
                <span className="font-medium tabular-nums">{c.n}</span>
              </div>
            ))}
          </div>

          {report.approximations.length > 0 && (
            <Section title="Approximated" items={report.approximations} tone="amber" />
          )}
          {report.splices.length > 0 && (
            <Section title="Spliced connectors" items={report.splices} tone="gray" />
          )}
          {report.drops.length > 0 && (
            <Section title="Dropped" items={report.drops} tone="red" />
          )}

          <label className="flex items-start gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={aiTidy}
              onChange={(e) => setAiTidy(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-gray-700">
              <span className="font-medium">Refine with AI</span> (optional) — tidy labels, task
              types and gateway names. Structure is never changed.
            </span>
          </label>

          {error && <p className="mt-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create BPMN diagram"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, items, tone }: { title: string; items: string[]; tone: "amber" | "gray" | "red" }) {
  const colour =
    tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-600" : "text-gray-500";
  return (
    <div className="mt-2">
      <p className={`text-[10px] uppercase tracking-wide font-medium ${colour}`}>{title}</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="text-xs text-gray-600 leading-snug">• {it}</li>
        ))}
      </ul>
    </div>
  );
}
