"use client";

import { useRouter } from "next/navigation";

interface ModelCell {
  model: string;
  label: string;
  ok: boolean;
  ms: number;
  elements?: number;
  connections?: number;
  issues?: number;
  diagramId?: string;
  error?: string;
}
export interface AiComparison {
  generatedAt?: string;
  prompt?: string;
  chosenModel?: string;
  chosenModelId?: string;
  models?: ModelCell[];
}

/**
 * SuperAdmin "AI Comparison Results" — the matrix from a multi-model BPMN
 * generation (Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5). The current diagram was
 * filled with the Opus 4.8 output; this shows per-model conformance + a link to each
 * saved model diagram (with ?from= so the editor's back nav returns here).
 */
export function AiComparisonModal({
  comparison,
  currentDiagramId,
  onClose,
}: {
  comparison: AiComparison;
  currentDiagramId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const models = comparison.models ?? [];
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">AI Comparison Results</h2>
            <p className="text-[11px] text-gray-500">
              The current diagram is filled with the {comparison.chosenModel ?? "Opus 4.8"} output.
              {comparison.generatedAt ? ` Generated ${new Date(comparison.generatedAt).toLocaleString()}.` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none" aria-label="Close">&times;</button>
        </div>

        {comparison.prompt && (
          <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded p-2 mb-3 whitespace-pre-wrap max-h-24 overflow-auto">{comparison.prompt}</p>
        )}

        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-1 pr-2">Model</th>
              <th className="py-1 px-2 text-right">Issues</th>
              <th className="py-1 px-2 text-right">Elements</th>
              <th className="py-1 px-2 text-right">Time</th>
              <th className="py-1 pl-2" />
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.model} className="border-b border-gray-100">
                <td className="py-1 pr-2 font-medium text-gray-800">
                  {m.label}
                  {m.model === comparison.chosenModelId && (
                    <span className="ml-1 text-[9px] text-green-700 bg-green-50 border border-green-200 rounded px-1">filled current</span>
                  )}
                </td>
                <td className="py-1 px-2 text-right">
                  {!m.ok ? "—" : m.issues === 0 ? <span className="text-green-700">0</span> : <span className="text-amber-700">⚠ {m.issues}</span>}
                </td>
                <td className="py-1 px-2 text-right text-gray-600">{m.ok ? m.elements : "—"}</td>
                <td className="py-1 px-2 text-right text-gray-400">{m.ok ? `${Math.round(m.ms / 1000)}s` : "—"}</td>
                <td className="py-1 pl-2 text-right">
                  {m.ok && m.diagramId ? (
                    <button
                      onClick={() => router.push(`/diagram/${m.diagramId}?from=/diagram/${currentDiagramId}`)}
                      className="text-blue-600 hover:underline"
                    >
                      Open →
                    </button>
                  ) : m.error ? (
                    <span className="text-red-500" title={m.error}>failed</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
