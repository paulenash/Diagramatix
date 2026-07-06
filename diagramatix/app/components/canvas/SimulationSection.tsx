"use client";

/**
 * Collapsible "Simulation" sub-section for the Properties panel. Renders the
 * baseline simulation parameters relevant to the selected element's type and
 * writes them into `element.properties.sim` via onUpdateProperties. Decision
 * branch probabilities live on connectors and are edited elsewhere.
 */

import { useState } from "react";
import type { DiagramElement } from "@/app/lib/diagram/types";
import { getSimParams, simPatch, defaultDist, type ElementSimParams, type LoopParams, type SimDist } from "@/app/lib/diagram/simParams";
import { DistributionInput } from "./DistributionInput";

const SOURCE_TYPES = new Set(["start-event", "intermediate-event"]);
const TASK_TYPES = new Set(["task", "subprocess", "subprocess-expanded"]);

type LoopKind = "none" | "standard" | "mi-sequential" | "mi-parallel";
function loopKindOf(loop?: LoopParams): LoopKind {
  if (!loop) return "none";
  if (loop.kind === "standard") return "standard";
  return loop.ordering === "parallel" ? "mi-parallel" : "mi-sequential";
}
function loopDist(loop?: LoopParams): SimDist {
  if (loop?.kind === "standard") return loop.iterations ?? { kind: "fixed", value: 2 };
  if (loop?.kind === "multi") return loop.instances ?? { kind: "fixed", value: 3 };
  return { kind: "fixed", value: 2 };
}
function makeLoop(kind: LoopKind, dist: SimDist): LoopParams | undefined {
  switch (kind) {
    case "none": return undefined;
    case "standard": return { kind: "standard", iterations: dist };
    case "mi-sequential": return { kind: "multi", instances: dist, ordering: "sequential" };
    case "mi-parallel": return { kind: "multi", instances: dist, ordering: "parallel" };
  }
}

export function SimulationSection({
  element,
  onUpdateProperties,
}: {
  element: DiagramElement;
  onUpdateProperties: (id: string, props: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false); // collapsed by default (matches Risk & Controls)
  const sim = getSimParams(element);
  const patch = (p: Partial<ElementSimParams>) => onUpdateProperties(element.id, simPatch(element, p));

  const isEP = element.type === "subprocess-expanded";
  const isEventEP = isEP && element.properties?.subprocessType === "event";
  const isLane = element.type === "lane" || element.type === "pool";
  const isSource = SOURCE_TYPES.has(element.type);
  const isTask = TASK_TYPES.has(element.type) && !isEventEP; // event subs use their own controls
  const applicable = isSource || isTask || isEventEP || isLane;

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-green-600">◈</span> Simulation
        </span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2 text-[11px]">
          {!applicable && (
            <p className="text-gray-400 italic">No simulation parameters for this element type.</p>
          )}

          {isSource && (
            <>
              <Field label="Inter-arrival time">
                <DistributionInput value={sim.arrival} onChange={(arrival) => patch({ arrival })} />
              </Field>
              <Field label="Max arrivals (blank = unlimited)">
                <input
                  type="number"
                  className="w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded bg-white text-gray-900 [color-scheme:light]"
                  value={sim.maxArrivals ?? ""}
                  onChange={(e) =>
                    patch({ maxArrivals: e.target.value === "" ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0) })
                  }
                />
              </Field>
            </>
          )}

          {isTask && (
            <>
              <Field label="Cycle time">
                <DistributionInput value={sim.cycleTime} onChange={(cycleTime) => patch({ cycleTime })} />
              </Field>
              <Field label="Wait time (non-resource)">
                <DistributionInput value={sim.waitTime} onChange={(waitTime) => patch({ waitTime })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Team / resource id">
                  <input
                    type="text"
                    className="w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded bg-white text-gray-900 [color-scheme:light]"
                    placeholder="e.g. analysts"
                    value={sim.teamId ?? ""}
                    onChange={(e) => patch({ teamId: e.target.value || undefined })}
                  />
                </Field>
                <Field label="Units required">
                  <input
                    type="number"
                    min={1}
                    className="w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded bg-white text-gray-900 [color-scheme:light]"
                    value={sim.resourceUnits ?? 1}
                    onChange={(e) => patch({ resourceUnits: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                  />
                </Field>
              </div>
            </>
          )}

          {isEP && !isEventEP && (
            <Field label="Loop / multi-instance">
              <div className="flex flex-col gap-1">
                <select
                  className="w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded bg-white text-gray-900 [color-scheme:light]"
                  value={loopKindOf(sim.loop)}
                  onChange={(e) => patch({ loop: makeLoop(e.target.value as LoopKind, loopDist(sim.loop)) })}
                >
                  <option value="none">None (run body once)</option>
                  <option value="standard">Standard loop (Do while…)</option>
                  <option value="mi-sequential">Multi-instance — sequential</option>
                  <option value="mi-parallel">Multi-instance — parallel</option>
                </select>
                {sim.loop && (
                  <div>
                    <span className="text-[10px] text-gray-500">
                      {sim.loop.kind === "standard" ? "Iterations" : "Instance count"}
                    </span>
                    <DistributionInput
                      value={loopDist(sim.loop)}
                      onChange={(dist) => patch({ loop: makeLoop(loopKindOf(sim.loop), dist) })}
                    />
                  </div>
                )}
              </div>
            </Field>
          )}

          {isLane && (
            <Field label="Team for this lane (tasks inside inherit it)">
              <input
                type="text"
                className="w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded bg-white text-gray-900 [color-scheme:light]"
                placeholder="e.g. analysts"
                value={sim.teamId ?? ""}
                onChange={(e) => patch({ teamId: e.target.value || undefined })}
              />
            </Field>
          )}

          {isEventEP && (
            <>
              <Field label="Event trigger (delay after scope starts)">
                <DistributionInput value={sim.eventTrigger ?? defaultDist()} onChange={(eventTrigger) => patch({ eventTrigger })} />
              </Field>
              <p className="text-[10px] text-gray-400">
                {element.properties?.interruptionType === "non-interrupting"
                  ? "Non-interrupting: handler runs alongside the parent."
                  : "Interrupting: cancels the parent scope and diverts to the handler."}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-500">{label}</span>
      {children}
    </label>
  );
}
