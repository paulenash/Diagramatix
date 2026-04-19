"use client";

/**
 * Flow-element view grouped by their container:
 *   pool → (lane → (subprocess →)) elements.
 * Rename inline; delete via ×; boundary events render as an indented child
 * of their host. Non-flow elements (pool, lane) are not listed here — use
 * Pools & Lanes Tree tab for those.
 */
import { useMemo, useState } from "react";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { setDrag, getDrag } from "./dragContext";

interface Props {
  elements: AiElement[];
  connections: AiConnection[];
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onMove: (draggedId: string, targetId: string, position: "before" | "after") => void;
}

const FLOW_TYPES = new Set([
  "task", "gateway", "start-event", "end-event", "intermediate-event",
  "subprocess", "subprocess-expanded", "data-object", "data-store",
  "text-annotation", "group",
]);

const GW_TONE_YELLOW   = "bg-yellow-50 text-yellow-700 border-yellow-200";
const GW_TONE_ORANGE   = "bg-orange-50 text-orange-700 border-orange-200";
const GW_TONE_SKY      = "bg-sky-50 text-sky-700 border-sky-200";
const GW_TONE_PURPLE   = "bg-purple-50 text-purple-700 border-purple-200";
const GW_TONE_FUCHSIA  = "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200";
const GW_TONE_EMERALD  = "bg-emerald-50 text-emerald-700 border-emerald-200";

/**
 * Badge text/tone for a flow element. Gateways distinguish their role
 * (decision / merge, derived from plan topology) and their marker type
 * (exclusive / parallel / inclusive / event-based) so the user can tell
 * apart the different gateway variants at a glance.
 */
function typeBadge(el: AiElement, inCount: number, outCount: number): { short: string; tone: string } {
  if (el.type === "gateway") {
    const gwType = (el.gatewayType ?? (el.properties?.gatewayType as string | undefined) ?? "").toLowerCase();
    const gwRole = (el.properties?.gatewayRole as string | undefined)?.toLowerCase();
    // Derived role from topology — matches R33/R34 so the UI label stays
    // consistent with what the layout engine will classify as.
    const topoRole =
      outCount >= 2 && inCount <= 1 ? "decision" :
      inCount  >= 2 && outCount <= 1 ? "merge"    :
      undefined;
    const role = gwRole ?? topoRole;
    if (gwType === "parallel")    return { short: "parallel",  tone: GW_TONE_SKY };
    if (gwType === "inclusive")   return { short: "inclusive", tone: GW_TONE_FUCHSIA };
    if (gwType === "event-based") return { short: "event-gw",  tone: GW_TONE_EMERALD };
    if (gwType === "exclusive")   return { short: "exclusive", tone: GW_TONE_PURPLE };
    if (role === "decision")      return { short: "decision",  tone: GW_TONE_YELLOW };
    if (role === "merge")         return { short: "merge",     tone: GW_TONE_ORANGE };
    return { short: "gw", tone: GW_TONE_YELLOW };
  }
  const map: Record<string, { short: string; tone: string }> = {
    "task":                { short: "task",    tone: "bg-blue-50 text-blue-700 border-blue-200" },
    "start-event":         { short: "start",   tone: "bg-green-50 text-green-700 border-green-200" },
    "end-event":           { short: "end",     tone: "bg-red-50 text-red-700 border-red-200" },
    "intermediate-event":  { short: "interm",  tone: "bg-orange-50 text-orange-700 border-orange-200" },
    "subprocess":          { short: "subp",    tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    "subprocess-expanded": { short: "subp-ex", tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    "data-object":         { short: "data",    tone: "bg-purple-50 text-purple-700 border-purple-200" },
    "data-store":          { short: "store",   tone: "bg-purple-50 text-purple-700 border-purple-200" },
    "text-annotation":     { short: "anno",    tone: "bg-gray-50 text-gray-600 border-gray-200" },
    "group":               { short: "group",   tone: "bg-gray-50 text-gray-600 border-gray-200" },
  };
  return map[el.type] ?? { short: el.type, tone: "bg-gray-100 text-gray-600 border-gray-200" };
}

export function ElementsByContainerView({ elements, connections, onRename, onDelete, onMove }: Props) {
  // Per-element incoming/outgoing sequence-connector counts, used to classify
  // gateways as decision vs merge in the badge renderer.
  const gwCounts = useMemo(() => {
    const inMap  = new Map<string, number>();
    const outMap = new Map<string, number>();
    for (const c of connections) {
      if (c.type === "message") continue;
      inMap.set(c.targetId,  (inMap.get(c.targetId)  ?? 0) + 1);
      outMap.set(c.sourceId, (outMap.get(c.sourceId) ?? 0) + 1);
    }
    return { inMap, outMap };
  }, [connections]);

  // Grouping: pool → [lane? → [subprocess? → [elements...]]]
  const grouped = useMemo(() => {
    const pools = elements.filter(e => e.type === "pool");
    const flowElements = elements.filter(e => FLOW_TYPES.has(e.type));
    const subs = new Map<string, AiElement>();
    for (const e of flowElements) if (e.type === "subprocess-expanded") subs.set(e.id, e);

    function containerForElement(e: AiElement): { poolId?: string; laneId?: string; subId?: string; hostId?: string } {
      if (e.boundaryHost) return { hostId: e.boundaryHost };
      if (e.parentSubprocess) return { subId: e.parentSubprocess };
      return { poolId: e.pool, laneId: e.lane };
    }

    const poolBuckets = pools.map(pool => {
      const laneMap = new Map<string | undefined, AiElement[]>();
      const unclaimed: AiElement[] = [];
      for (const e of flowElements) {
        const ctr = containerForElement(e);
        if (ctr.poolId !== pool.id) continue;
        const list = laneMap.get(ctr.laneId) ?? [];
        list.push(e);
        laneMap.set(ctr.laneId, list);
      }
      // Lanes inside this pool (for heading names)
      const lanes = elements.filter(e => e.type === "lane" && (e.parentPool ?? e.pool) === pool.id);
      return {
        pool,
        laneGroups: [
          { lane: null as AiElement | null, items: laneMap.get(undefined) ?? [] },
          ...lanes.map(lane => ({ lane, items: laneMap.get(lane.id) ?? [] })),
        ].filter(g => g.items.length > 0 || g.lane),
      };
    });

    // Subprocess buckets: flow elements with parentSubprocess
    const subprocessBuckets = Array.from(subs.values()).map(sp => ({
      sp,
      items: flowElements.filter(e => e.parentSubprocess === sp.id),
    })).filter(b => b.items.length > 0);

    // Boundary-event buckets: elements hosted on an existing element
    const boundaryBuckets = flowElements.filter(e => e.boundaryHost != null);

    return { poolBuckets, subprocessBuckets, boundaryBuckets };
  }, [elements]);

  const { poolBuckets, subprocessBuckets, boundaryBuckets } = grouped;
  if (poolBuckets.length === 0 && subprocessBuckets.length === 0 && boundaryBuckets.length === 0) {
    return <p className="text-[11px] text-gray-400 italic">No elements in the plan yet.</p>;
  }

  return (
    <div className="space-y-3">
      {poolBuckets.map(bucket => (
        <div key={bucket.pool.id} className="border border-gray-200 rounded overflow-hidden">
          <div className="px-2 py-1 bg-gray-50 text-[10px] font-semibold uppercase text-gray-600">
            Pool: {bucket.pool.label}
          </div>
          {bucket.laneGroups.map((g, gi) => (
            <div key={gi}>
              {g.lane && (
                <div className="px-3 py-0.5 bg-amber-50 text-[10px] font-medium text-amber-700 border-t border-b border-amber-100">
                  Lane: {g.lane.label}
                </div>
              )}
              {g.items.length === 0 ? (
                <p className="px-3 py-1 text-[10px] text-gray-400 italic">(empty)</p>
              ) : (
                g.items.map(el => <ElementRow key={el.id} el={el} inCount={gwCounts.inMap.get(el.id) ?? 0} outCount={gwCounts.outMap.get(el.id) ?? 0} groupKey={`elem:${bucket.pool.id}:${g.lane?.id ?? ""}`} onRename={onRename} onDelete={onDelete} onMove={onMove} />)
              )}
            </div>
          ))}
        </div>
      ))}

      {subprocessBuckets.length > 0 && (
        <div className="border border-gray-200 rounded overflow-hidden">
          <div className="px-2 py-1 bg-indigo-50 text-[10px] font-semibold uppercase text-indigo-700">
            Inside Expanded Subprocesses
          </div>
          {subprocessBuckets.map(b => (
            <div key={b.sp.id}>
              <div className="px-3 py-0.5 text-[10px] font-medium text-indigo-700 border-t border-indigo-100">
                {b.sp.label} {b.sp.subprocessType === "event" ? "(Event)" : ""}
              </div>
              {b.items.map(el => <ElementRow key={el.id} el={el} inCount={gwCounts.inMap.get(el.id) ?? 0} outCount={gwCounts.outMap.get(el.id) ?? 0} groupKey={`sp:${b.sp.id}`} onRename={onRename} onDelete={onDelete} onMove={onMove} />)}
            </div>
          ))}
        </div>
      )}

      {boundaryBuckets.length > 0 && (
        <div className="border border-gray-200 rounded overflow-hidden">
          <div className="px-2 py-1 bg-orange-50 text-[10px] font-semibold uppercase text-orange-700">
            Boundary Events
          </div>
          {boundaryBuckets.map(el => (
            <ElementRow key={el.id} el={el} inCount={gwCounts.inMap.get(el.id) ?? 0} outCount={gwCounts.outMap.get(el.id) ?? 0} groupKey={null} onRename={onRename} onDelete={onDelete} onMove={onMove} boundaryInfo={el.boundaryHost} />
          ))}
        </div>
      )}
    </div>
  );
}

function ElementRow({
  el, inCount, outCount, groupKey, onRename, onDelete, onMove, boundaryInfo,
}: {
  el: AiElement;
  inCount: number;
  outCount: number;
  /** Same-group key for drop constraint. Null = not draggable (boundary events). */
  groupKey: string | null;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onMove: (draggedId: string, targetId: string, position: "before" | "after") => void;
  boundaryInfo?: string;
}) {
  const badge = typeBadge(el, inCount, outCount);
  const [dropPos, setDropPos] = useState<null | "before" | "after">(null);
  const [dragging, setDragging] = useState(false);

  const onHandleDragStart = (e: React.DragEvent) => {
    if (!groupKey) return;
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
    if (!groupKey) return;
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
    if (!groupKey) return;
    const drag = getDrag();
    if (!drag || drag.groupKey !== groupKey || drag.id === el.id) return;
    e.preventDefault();
    onMove(drag.id, el.id, dropPos ?? "after");
    setDropPos(null);
  };

  const indicatorCls =
    dropPos === "before" ? "border-t-2 border-t-blue-500"
    : dropPos === "after" ? "border-b-2 border-b-blue-500"
    : "border-t border-gray-100";

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1 text-[11px] group hover:bg-gray-50 ${indicatorCls} ${dragging ? "opacity-40" : ""}`}
      onDragOver={onRowDragOver}
      onDragLeave={onRowDragLeave}
      onDrop={onRowDrop}
    >
      {groupKey ? (
        <span
          draggable
          onDragStart={onHandleDragStart}
          onDragEnd={onHandleDragEnd}
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none px-0.5"
          title="Drag to reorder"
        >⋮⋮</span>
      ) : (
        <span className="px-0.5 text-transparent select-none">⋮⋮</span>
      )}
      <span className={`px-1 py-0.5 rounded border text-[9px] font-mono uppercase ${badge.tone}`}>{badge.short}</span>
      <input
        value={el.label}
        onChange={e => onRename(el.id, e.target.value)}
        className="flex-1 bg-transparent border-0 border-b border-transparent focus:border-blue-400 outline-none px-0.5 py-0"
        spellCheck={false}
        placeholder="(no label)"
      />
      {boundaryInfo && (
        <span className="text-[9px] text-orange-700" title="Hosted on element id">on {boundaryInfo}</span>
      )}
      <button
        onClick={() => onDelete(el.id)}
        className="text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 text-xs px-1"
        title="Delete element"
      >&times;</button>
    </div>
  );
}
