"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DiagramData } from "@/app/lib/diagram/types";
import { MobileDiagramView } from "@/app/components/mobile/MobileDiagramView";

interface Loaded { name: string; data: DiagramData; projectId: string | null }

/**
 * Diagram viewer screen: header (back to project + name) over the read-only
 * pan/zoom viewer, filling the space below the app bar. Works in portrait and
 * landscape (the viewer re-fits on rotation).
 */
export function MobileDiagramScreen({ diagramId }: { diagramId: string }) {
  const router = useRouter();
  const [d, setD] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    fetch(`/api/diagrams/${diagramId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load diagram"))))
      .then((j) => { if (on) setD({ name: j.name, data: (j.data ?? { elements: [], connectors: [] }) as DiagramData, projectId: j.projectId ?? null }); })
      .catch((e) => { if (on) setErr(e.message); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [diagramId]);

  const empty = !!d && (d.data.elements?.length ?? 0) === 0;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-gray-200 bg-white">
        <button onClick={() => router.push(d?.projectId ? `/m/project/${d.projectId}` : "/m")}
          className="text-blue-600 text-sm">‹ Back</button>
        <span className="flex-1 text-sm font-medium text-gray-900 truncate text-center">{d?.name ?? "Diagram"}</span>
        <span className="w-10" />
      </div>
      <div className="flex-1 relative">
        {loading && <p className="text-sm text-gray-500 p-4">Loading…</p>}
        {err && <p className="text-sm text-red-600 p-4">{err}</p>}
        {d && empty && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-sm text-gray-400">This diagram is empty. Generating from a prompt is coming in the next update.</p>
          </div>
        )}
        {d && !empty && <MobileDiagramView data={d.data} />}
      </div>
    </div>
  );
}
