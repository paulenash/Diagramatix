"use client";

import { useEffect, useState } from "react";
import { DiffRunsDialog } from "./DiffRunsDialog";

/**
 * "Diff Process Results" button for a diagram's properties. Renders on both
 * diagrams involved in a diff; enabled only when the diagram has ≥1 saved run.
 * Opens the run-history popup.
 */
export function DiffRunsButton({ diagramId, className }: { diagramId: string; className?: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  async function refreshCount() {
    try {
      const res = await fetch(`/api/diagrams/${diagramId}/diff-runs`, { cache: "no-store" });
      if (res.ok) setCount(((await res.json()).runs ?? []).length);
    } catch { /* leave as-is */ }
  }
  useEffect(() => { void refreshCount(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [diagramId]);

  const has = (count ?? 0) > 0;
  return (
    <>
      <button
        onClick={() => has && setOpen(true)}
        disabled={!has}
        title={has ? "View saved Diff Process runs for this diagram" : "No saved Diff Process runs yet"}
        className={className ?? `w-full text-left px-2 py-1 text-[11px] rounded border ${has ? "text-blue-700 border-blue-300 hover:bg-blue-50" : "text-gray-400 border-gray-200 cursor-not-allowed"}`}
      >
        Diff Process Results{has ? ` (${count})` : ""}
      </button>
      {open && <DiffRunsDialog diagramId={diagramId} onClose={() => { setOpen(false); void refreshCount(); }} />}
    </>
  );
}
