"use client";

import { useMemo, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { translateEpcToBpmn } from "@/app/lib/diagram/translate/epcToBpmn";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";

interface CreatedDiagram {
  id: string;
  name: string;
  type: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Props {
  /** The source EPC's data. */
  source: DiagramData;
  /** The source EPC's name (the new diagram is "<name> (BPMN)"). */
  sourceName: string;
  /** Project the new BPMN diagram is created in (null → user sandpit). */
  projectId: string | null;
  onClose: () => void;
  onCreated: (created: CreatedDiagram) => void;
}

/**
 * One-way "Convert to BPMN" preview + create dialog.
 *
 * The translation is deterministic and runs client-side, so the report below is
 * the real thing rather than an estimate. The optional AI pass refines labels
 * and sub-types only — structure is locked — and falls back to the deterministic
 * plan on any error.
 *
 * The section that matters is **Needs a person**. Everything else in this dialog
 * describes what happened; that one describes what did not, and it is the reason
 * the conversion is worth trusting. A migration tool that silently tidies an
 * unbalanced branch hands you a model that looks finished and is wrong somewhere
 * you will not look.
 */
export function EpcToBpmnDialog({ source, sourceName, projectId, onClose, onCreated }: Props) {
  const [aiTidy, setAiTidy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const { report, plan } = useMemo(() => {
    const r = translateEpcToBpmn(source, { processName: sourceName });
    return { report: r.report, plan: { aiElements: r.aiElements, aiConnections: r.aiConnections } };
  }, [source, sourceName]);

  const needsPerson = report.refusals.length;

  async function handleCreate() {
    setBusy(true);
    setError("");
    try {
      let elements = plan.aiElements;
      let connections = plan.aiConnections;

      if (aiTidy) {
        try {
          const res = await fetch("/api/ai/epc-to-bpmn/refine", {
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
          /* keep the deterministic plan */
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
      onCreated(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const counts: { label: string; n: number }[] = [
    { label: "Tasks", n: report.taskCount },
    { label: "Gateways", n: report.gatewayCount },
    { label: "Events", n: report.eventCount },
    { label: "Call activities", n: report.callActivityCount },
    { label: "Data objects", n: report.dataObjectCount },
    { label: "System pools", n: report.systemPoolCount },
    { label: "Lanes", n: report.laneCount },
  ].filter((c) => c.n > 0);

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Convert to BPMN</h3>
          <p className="text-xs text-gray-600 leading-relaxed mb-3">
            Creates a new BPMN diagram <span className="font-medium">{sourceName} (BPMN)</span> from
            this EPC. The EPC is left unchanged.
          </p>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
            {counts.map((c) => (
              <div key={c.label} className="flex justify-between text-xs text-gray-700">
                <span>{c.label}</span>
                <span className="font-medium tabular-nums">{c.n}</span>
              </div>
            ))}
          </div>

          {needsPerson > 0 && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide font-medium text-red-700">
                Needs a person — {needsPerson}
              </p>
              <p className="text-[11px] text-red-800/80 leading-snug mt-0.5">
                These are questions only you can answer, so the conversion left them alone rather
                than guessing.
              </p>
              <ul className="mt-1 space-y-1">
                {report.refusals.map((r, i) => (
                  <li key={i} className="text-xs text-red-900 leading-snug">• {r}</li>
                ))}
              </ul>
            </div>
          )}

          {report.branchLabels.length > 0 && (
            <Section
              title="Became branch conditions"
              hint="An event straight after a decision is the name of that branch, so its wording moved onto the sequence flow."
              items={report.branchLabels}
              tone="gray"
            />
          )}
          {report.droppedEvents.length > 0 && (
            <Section
              title="Events dropped"
              hint="An EPC alternates event and function. Keeping the ones in the middle would put a round shape between every two tasks."
              items={report.droppedEvents}
              tone="gray"
            />
          )}
          {report.approximations.length > 0 && (
            <Section title="Approximated" items={report.approximations} tone="amber" />
          )}
          {report.drops.length > 0 && (
            <Section title="Not placed" items={report.drops} tone="red" />
          )}

          <label className="flex items-start gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={aiTidy}
              onChange={(e) => setAiTidy(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-gray-700">
              <span className="font-medium">Refine with AI</span> (optional) — EPC functions are named
              as nouns (&ldquo;Invoice verification&rdquo;); BPMN tasks are named as verbs
              (&ldquo;Verify invoice&rdquo;). Structure is never changed.
            </span>
          </label>

          {needsPerson > 0 && (
            <label className="flex items-start gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs text-gray-700">
                I have read the {needsPerson} item{needsPerson === 1 ? "" : "s"} above and will
                resolve {needsPerson === 1 ? "it" : "them"} in the BPMN.
              </span>
            </label>
          )}

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
            disabled={busy || (needsPerson > 0 && !acknowledged)}
            title={needsPerson > 0 && !acknowledged ? "Read the items above first" : undefined}
            className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create BPMN diagram"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, items, tone, hint }: {
  title: string; items: string[]; tone: "amber" | "gray" | "red"; hint?: string;
}) {
  const colour =
    tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-600" : "text-gray-500";
  return (
    <div className="mt-2">
      <p className={`text-[10px] uppercase tracking-wide font-medium ${colour}`}>{title}</p>
      {hint && <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{hint}</p>}
      <ul className="mt-0.5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="text-xs text-gray-600 leading-snug">• {it}</li>
        ))}
      </ul>
    </div>
  );
}
