"use client";

/**
 * Connectors list grouped by type (sequence / message / other).
 * Shows source → target with editable label; × removes.
 */
import { useMemo } from "react";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";

interface Props {
  elements: AiElement[];
  connections: AiConnection[];
  onRenameLabel: (idx: number, label: string) => void;
  onDelete: (idx: number) => void;
}

export function ConnectorsByTypeView({ elements, connections, onRenameLabel, onDelete }: Props) {
  const elMap = useMemo(() => {
    const m = new Map<string, AiElement>();
    for (const e of elements) m.set(e.id, e);
    return m;
  }, [elements]);

  // Preserve original index so edits map to the right array slot even after grouping.
  const withIdx = useMemo(() => connections.map((c, idx) => ({ c, idx })), [connections]);
  const byType = useMemo(() => {
    const seq = withIdx.filter(x => (x.c.type ?? "sequence") === "sequence");
    const msg = withIdx.filter(x => x.c.type === "message");
    const other = withIdx.filter(x => x.c.type != null && x.c.type !== "sequence" && x.c.type !== "message");
    return { seq, msg, other };
  }, [withIdx]);

  if (connections.length === 0) {
    return <p className="text-[11px] text-gray-400 italic">No connectors in the plan yet.</p>;
  }

  function describe(id: string): string {
    const el = elMap.get(id);
    if (!el) return `⚠ ${id}`;
    return el.label || `(${el.type})`;
  }

  function Section({ title, tone, items }: { title: string; tone: string; items: typeof withIdx }) {
    if (items.length === 0) return null;
    return (
      <div className="border border-gray-200 rounded overflow-hidden">
        <div className={`px-2 py-1 text-[10px] font-semibold uppercase ${tone}`}>
          {title} <span className="text-[9px] opacity-70">({items.length})</span>
        </div>
        {items.map(({ c, idx }) => (
          <div key={idx} className="flex items-center gap-1.5 px-3 py-1 text-[11px] group hover:bg-gray-50 border-t border-gray-100">
            <span className="text-gray-700 truncate max-w-[30%]" title={c.sourceId}>{describe(c.sourceId)}</span>
            <span className="text-gray-400">→</span>
            <span className="text-gray-700 truncate max-w-[30%]" title={c.targetId}>{describe(c.targetId)}</span>
            <input
              value={c.label ?? ""}
              onChange={e => onRenameLabel(idx, e.target.value)}
              placeholder="label"
              className="flex-1 bg-transparent border-0 border-b border-transparent focus:border-blue-400 outline-none px-0.5 py-0 text-[10px] italic text-gray-600"
              spellCheck={false}
            />
            <button
              onClick={() => onDelete(idx)}
              className="text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 text-xs px-1"
              title="Delete connector"
            >&times;</button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Section title="Sequence" tone="bg-blue-50 text-blue-700" items={byType.seq} />
      <Section title="Message"  tone="bg-green-50 text-green-700" items={byType.msg} />
      <Section title="Other"    tone="bg-gray-50 text-gray-600"  items={byType.other} />
    </div>
  );
}
