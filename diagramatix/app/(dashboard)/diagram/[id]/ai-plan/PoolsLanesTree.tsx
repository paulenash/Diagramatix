"use client";

/**
 * Pools & Lanes structural view for the 2-phase AI Plan panel.
 * Shows pools with nested lanes. Rename label inline; × deletes (and
 * cascades to any connectors referencing the element). Drag the ⋮⋮ handle
 * to reorder pools, or to reorder lanes within their parent pool.
 */
import { useMemo, useState } from "react";
import type { AiElement } from "@/app/lib/diagram/bpmnLayout";
import { setDrag, getDrag } from "./dragContext";

interface Props {
  elements: AiElement[];
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onMove: (draggedId: string, targetId: string, position: "before" | "after") => void;
}

export function PoolsLanesTree({ elements, onRename, onDelete, onMove }: Props) {
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
            groupKey="pool"
            onRename={onRename}
            onDelete={onDelete}
            onMove={onMove}
          />
          {lanes.length > 0 && (
            <div className="pl-4 border-t border-gray-100">
              {lanes.map(lane => (
                <Row
                  key={lane.id}
                  el={lane}
                  badge="lane"
                  badgeTone="amber"
                  groupKey={`lane:${pool.id}`}
                  onRename={onRename}
                  onDelete={onDelete}
                  onMove={onMove}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Row({
  el, badge, badgeTone, groupKey, onRename, onDelete, onMove,
}: {
  el: AiElement;
  badge: string;
  badgeTone: "blue" | "gray" | "amber";
  groupKey: string;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onMove: (draggedId: string, targetId: string, position: "before" | "after") => void;
}) {
  const toneCls = badgeTone === "blue"
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : badgeTone === "amber"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-gray-100 text-gray-600 border-gray-200";

  const [dropPos, setDropPos] = useState<null | "before" | "after">(null);
  const [dragging, setDragging] = useState(false);

  const onHandleDragStart = (e: React.DragEvent) => {
    setDrag({ id: el.id, groupKey });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", el.id);
    setDragging(true);
  };
  const onHandleDragEnd = () => {
    setDrag(null);
    setDragging(false);
    setDropPos(null);
  };
  const onRowDragOver = (e: React.DragEvent) => {
    const drag = getDrag();
    if (!drag || drag.groupKey !== groupKey || drag.id === el.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropPos(e.clientY < midY ? "before" : "after");
  };
  const onRowDragLeave = () => setDropPos(null);
  const onRowDrop = (e: React.DragEvent) => {
    const drag = getDrag();
    if (!drag || drag.groupKey !== groupKey || drag.id === el.id) return;
    e.preventDefault();
    const pos = dropPos ?? "after";
    onMove(drag.id, el.id, pos);
    setDropPos(null);
  };

  const indicatorCls =
    dropPos === "before" ? "border-t-2 border-t-blue-500"
    : dropPos === "after" ? "border-b-2 border-b-blue-500"
    : "border-t-2 border-t-transparent border-b-2 border-b-transparent";

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 text-[11px] group hover:bg-gray-50 ${indicatorCls} ${dragging ? "opacity-40" : ""}`}
      onDragOver={onRowDragOver}
      onDragLeave={onRowDragLeave}
      onDrop={onRowDrop}
    >
      <span
        draggable
        onDragStart={onHandleDragStart}
        onDragEnd={onHandleDragEnd}
        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none px-0.5"
        title="Drag to reorder"
      >⋮⋮</span>
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
