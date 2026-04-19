"use client";

/**
 * Pools & Lanes structural view for the 2-phase AI Plan panel.
 * Shows pools with nested lanes. Rename label inline; × deletes (and
 * cascades to any connectors referencing the element).
 */
import { useMemo } from "react";
import type { AiElement } from "@/app/lib/diagram/bpmnLayout";

interface Props {
  elements: AiElement[];
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}

export function PoolsLanesTree({ elements, onRename, onDelete }: Props) {
  const tree = useMemo(() => {
    const pools = elements.filter(e => e.type === "pool");
    return pools.map(pool => ({
      pool,
      lanes: elements.filter(e => e.type === "lane" && (e.parentPool ?? e.pool) === pool.id),
    }));
  }, [elements]);

  if (tree.length === 0) {
    return <p className="text-[11px] text-gray-400 italic">No pools in the plan yet. Click Plan to generate one.</p>;
  }

  return (
    <div className="space-y-2">
      {tree.map(({ pool, lanes }) => (
        <div key={pool.id} className="border border-gray-200 rounded">
          <Row
            el={pool}
            badge={(pool.poolType as string | undefined) === "black-box" ? "BB" : "WB"}
            badgeTone={(pool.poolType as string | undefined) === "black-box" ? "gray" : "blue"}
            onRename={onRename}
            onDelete={onDelete}
          />
          {lanes.length > 0 && (
            <div className="pl-4 border-t border-gray-100">
              {lanes.map(lane => (
                <Row key={lane.id} el={lane} badge="lane" badgeTone="amber" onRename={onRename} onDelete={onDelete} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Row({
  el, badge, badgeTone, onRename, onDelete,
}: {
  el: AiElement;
  badge: string;
  badgeTone: "blue" | "gray" | "amber";
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const toneCls = badgeTone === "blue"
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : badgeTone === "amber"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] group hover:bg-gray-50">
      <span className={`px-1 py-0.5 rounded border text-[9px] font-mono uppercase ${toneCls}`}>{badge}</span>
      <input
        value={el.label}
        onChange={e => onRename(el.id, e.target.value)}
        className="flex-1 bg-transparent border-0 border-b border-transparent focus:border-blue-400 outline-none px-0.5 py-0"
        spellCheck={false}
      />
      <button
        onClick={() => onDelete(el.id)}
        className="text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 text-xs px-1"
        title={`Delete ${el.type}`}
      >&times;</button>
    </div>
  );
}
