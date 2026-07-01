"use client";

/**
 * Simulation Data overview — one place to SEE every element's simulation
 * parameters (and decision-branch percentages) at a glance, edit them inline,
 * spot what's still missing, and bulk fill / clear. Complements the per-element
 * Properties → ◈ Simulation editor. Matrix-themed for the console.
 *
 * Controlled by `data`: every edit produces a new DiagramData and calls
 * onApplyData (the editor's setData), so changes autosave like any other edit.
 */

import { useState } from "react";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";
import { getSimParams, simPatch, DISTRIBUTION_KINDS, type SimDist, type ElementSimParams } from "@/app/lib/diagram/simParams";
import { clearSimData } from "@/app/lib/simulation/clearSimData";
import { MatrixButton } from "./matrix/MatrixChrome";

const SOURCE_TYPES = new Set(["start-event", "intermediate-event"]);
const TASK_TYPES = new Set(["task", "subprocess", "subprocess-expanded"]);
const isEventEP = (e: DiagramElement) => e.type === "subprocess-expanded" && e.properties?.subprocessType === "event";

// ── Compact green distribution editor ──────────────────────────────────────
const KIND_FIELDS: Record<SimDist["kind"], string[]> = {
  fixed: ["value"], uniform: ["min", "max"], triangular: ["min", "mode", "max"], normal: ["mean", "sd"], exponential: ["mean"],
};
function distOfKind(kind: SimDist["kind"]): SimDist {
  switch (kind) {
    case "fixed": return { kind: "fixed", value: 1 };
    case "uniform": return { kind: "uniform", min: 0, max: 2 };
    case "triangular": return { kind: "triangular", min: 0, mode: 1, max: 2 };
    case "normal": return { kind: "normal", mean: 1, sd: 0.5 };
    case "exponential": return { kind: "exponential", mean: 1 };
  }
}
function MatrixDist({ value, onChange }: { value?: SimDist; onChange: (d: SimDist | undefined) => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={value?.kind ?? ""}
        onChange={(e) => onChange(e.target.value ? distOfKind(e.target.value as SimDist["kind"]) : undefined)}
        className="bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 text-[11px] [color-scheme:dark]"
      >
        <option value="">—</option>
        {DISTRIBUTION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      {value && KIND_FIELDS[value.kind].map((f) => (
        <input
          key={f} type="number" title={f}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value={(value as any)[f]}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onChange={(e) => onChange({ ...(value as any), [f]: Number(e.target.value) })}
          className="w-14 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 text-[11px] [color-scheme:dark]"
        />
      ))}
    </span>
  );
}

const num = (v: string) => (v === "" ? undefined : Math.max(0, Number(v) || 0));

export function SimDataPanel({ data, onApplyData, onFillMissing, onOpenDiagram }: {
  data: DiagramData;
  onApplyData: (next: DiagramData) => void;
  onFillMissing?: () => number;
  /** Switch the console to another diagram — used to edit a linked subprocess's
   *  own tasks (its sim data lives in the child diagram). */
  onOpenDiagram?: (diagramId: string) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const patchEl = (id: string, patch: Partial<ElementSimParams>) => {
    onApplyData({
      ...data,
      elements: data.elements.map((el) => (el.id === id ? { ...el, properties: { ...el.properties, ...simPatch(el, patch) } } : el)),
    });
  };
  const patchConn = (id: string, fields: Partial<Connector>) => {
    onApplyData({ ...data, connectors: data.connectors.map((c) => (c.id === id ? { ...c, ...fields } : c)) });
  };

  // A boundary event (timer/message/error attached to a task) is triggered, not
  // fed by an arrival rate — so it's NOT an arrival source. Excluding it keeps
  // the panel in step with the run's readiness check (which ignores it too).
  const sources = data.elements.filter((e) => SOURCE_TYPES.has(e.type) && !e.boundaryHostId);
  const tasks = data.elements.filter((e) => TASK_TYPES.has(e.type) && !isEventEP(e));
  const eventEPs = data.elements.filter(isEventEP);
  const gateways = data.elements.filter((e) => e.type === "gateway" && e.gatewayType !== "parallel");
  const labelOf = (id: string) => data.elements.find((e) => e.id === id)?.label || id;
  const nameOf = (e: DiagramElement) => e.label || e.id;

  // Missing-value flags — collected WITH the element name + what's missing, so
  // the toolbar can say exactly which item to fix (not just a count).
  const branchSum = (g: DiagramElement) => data.connectors.filter((c) => c.sourceId === g.id);
  const missingItems: string[] = [];
  for (const s of sources) if (!getSimParams(s).arrival) missingItems.push(`${nameOf(s)} — arrival`);
  for (const t of tasks) if (!getSimParams(t).cycleTime) missingItems.push(`${nameOf(t)} — cycle time`);
  for (const g of gateways) {
    const edges = branchSum(g);
    const hasCond = edges.some((e) => e.branchCondition);
    const sum = edges.reduce((a, e) => a + (e.branchProbability ?? 0), 0);
    if (edges.length > 1 && !hasCond && Math.abs(sum - 100) > 0.5) missingItems.push(`${nameOf(g)} — branches total ${sum}% (need 100)`);
  }
  const missing = missingItems.length;

  function doFill() { const n = onFillMissing?.() ?? 0; setMsg(`Filled ${n} value(s).`); }
  function doClear() { const r = clearSimData(data); onApplyData(r.data); setConfirmClear(false); setMsg(`Cleared ${r.cleared} item(s).`); }

  const flag = (bad: boolean) => <span className={bad ? "text-red-400" : "text-green-500/40"}>●</span>;

  return (
    <div className="flex flex-col gap-3 text-[10px] overflow-x-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {onFillMissing && <MatrixButton onClick={doFill}>⚙ Fill missing</MatrixButton>}
        {!confirmClear
          ? <MatrixButton variant="danger" onClick={() => setConfirmClear(true)}>🗑 Clear all</MatrixButton>
          : <span className="flex items-center gap-2">
              <span className="text-red-300">Clear ALL simulation data?</span>
              <MatrixButton variant="danger" onClick={doClear}>Yes, clear</MatrixButton>
              <button onClick={() => setConfirmClear(false)} className="text-green-400/60 hover:text-green-300">cancel</button>
            </span>}
        <span className={missing > 0 ? "text-red-300" : "text-green-400/60"} title={missing > 0 ? missingItems.join("\n") : undefined}>
          {missing > 0
            ? `${missing} item(s) need values: ${missingItems.slice(0, 2).join("; ")}${missing > 2 ? ` +${missing - 2} more` : ""}`
            : "all required values set ✓"}
        </span>
        {msg && <span className="text-green-300">{msg}</span>}
      </div>

      {data.elements.length === 0 && <p className="text-green-400/50">This diagram has no elements.</p>}

      {/* Sources */}
      {sources.length > 0 && (
        <Section title="Arrivals (start / intermediate events)" cols={[{ label: "", w: W.flag }, { label: "element", w: W.name }, { label: "inter-arrival", w: W.dist }, { label: "max arrivals", w: W.maxArr }]}>
          {sources.map((s) => {
            const sim = getSimParams(s);
            return (
              <Row key={s.id}>
                <Cell w={W.flag}>{flag(!sim.arrival)}</Cell>
                <Cell w={W.name} truncate>{s.label || s.id}</Cell>
                <Cell w={W.dist}><MatrixDist value={sim.arrival} onChange={(arrival) => patchEl(s.id, { arrival })} /></Cell>
                <Cell w={W.maxArr}><input type="number" value={sim.maxArrivals ?? ""} placeholder="∞" onChange={(e) => patchEl(s.id, { maxArrivals: num(e.target.value) })} className={`${inp} w-20`} /></Cell>
              </Row>
            );
          })}
        </Section>
      )}

      {/* Tasks */}
      {tasks.length > 0 && (
        <Section title="Tasks" cols={[{ label: "", w: W.flag }, { label: "element", w: W.name }, { label: "cycle time", w: W.dist }, { label: "wait", w: W.dist }, { label: "team", w: W.team }, { label: "units", w: W.units }]}>
          {tasks.map((t) => {
            const sim = getSimParams(t);
            return (
              <Row key={t.id}>
                <Cell w={W.flag}>{flag(!sim.cycleTime)}</Cell>
                <Cell w={W.name} truncate>{t.label || t.id}</Cell>
                <Cell w={W.dist}><MatrixDist value={sim.cycleTime} onChange={(cycleTime) => patchEl(t.id, { cycleTime })} /></Cell>
                <Cell w={W.dist}><MatrixDist value={sim.waitTime} onChange={(waitTime) => patchEl(t.id, { waitTime })} /></Cell>
                <Cell w={W.team}>
                  {onOpenDiagram && typeof t.properties?.linkedDiagramId === "string"
                    ? <button onClick={() => onOpenDiagram(t.properties!.linkedDiagramId as string)} className="text-green-300 hover:text-green-200 text-[10px]" title="Open the linked subprocess diagram to edit its tasks">⤢ edit child →</button>
                    : <input type="text" value={sim.teamId ?? ""} placeholder="team" onChange={(e) => patchEl(t.id, { teamId: e.target.value || undefined })} className={`${inp} w-40`} />}
                </Cell>
                <Cell w={W.units}><input type="number" min={1} value={sim.resourceUnits ?? 1} onChange={(e) => patchEl(t.id, { resourceUnits: Math.max(1, parseInt(e.target.value, 10) || 1) })} className={`${inp} w-10`} /></Cell>
              </Row>
            );
          })}
        </Section>
      )}

      {/* Event subprocesses */}
      {eventEPs.length > 0 && (
        <Section title="Event subprocesses" cols={[{ label: "", w: W.flag }, { label: "element", w: W.name }, { label: "trigger (delay after scope start)", w: W.dist }]}>
          {eventEPs.map((e) => {
            const sim = getSimParams(e);
            return (
              <Row key={e.id}>
                <Cell w={W.flag}>{flag(!sim.eventTrigger)}</Cell>
                <Cell w={W.name} truncate>{e.label || e.id}</Cell>
                <Cell w={W.dist}><MatrixDist value={sim.eventTrigger} onChange={(eventTrigger) => patchEl(e.id, { eventTrigger })} /></Cell>
              </Row>
            );
          })}
        </Section>
      )}

      {/* Decision branches */}
      {gateways.length > 0 && (
        <Section title="Decision branches (probability % per outgoing flow)" cols={[{ label: "", w: W.flag }, { label: "gateway → target", w: W.target }, { label: "%", w: W.pct }, { label: "default", w: W.def }, { label: "condition", w: W.cond }]}>
          {gateways.map((g) => {
            const edges = branchSum(g);
            const hasCond = edges.some((e) => e.branchCondition);
            const sum = edges.reduce((a, e) => a + (e.branchProbability ?? 0), 0);
            const bad = edges.length > 1 && !hasCond && Math.abs(sum - 100) > 0.5;
            return (
              <div key={g.id} className="border-t border-green-500/10">
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-green-400/70">{g.label || g.id}</span>
                  {!hasCond && <span className={bad ? "text-red-300" : "text-green-400/50"}>sum {sum}%</span>}
                </div>
                {edges.map((c) => (
                  <Row key={c.id}>
                    <Cell w={W.flag}>{flag(bad)}</Cell>
                    <Cell w={W.target} truncate>→ {labelOf(c.targetId)}</Cell>
                    <Cell w={W.pct}><input type="number" value={c.branchProbability ?? ""} placeholder="—" onChange={(e) => patchConn(c.id, { branchProbability: num(e.target.value) })} className={`${inp} w-14`} /></Cell>
                    <Cell w={W.def}><input type="checkbox" checked={!!c.isDefaultFlow} onChange={(e) => patchConn(c.id, { isDefaultFlow: e.target.checked || undefined })} className="accent-green-500" /></Cell>
                    <Cell w={W.cond}><input type="text" value={c.branchCondition ?? ""} placeholder="expression (optional)" onChange={(e) => patchConn(c.id, { branchCondition: e.target.value || undefined })} className={`${inp} w-36`} /></Cell>
                  </Row>
                ))}
              </div>
            );
          })}
        </Section>
      )}

      <p className="text-green-400/40 text-[9px]">
        Loops / multi-instance live in Properties → ◈ Simulation. Tasks with no team have unlimited capacity. Times are read in the scenario&rsquo;s clock unit.
      </p>
    </div>
  );
}

// [color-scheme:dark] makes the browser render the control (value text +
// number spinners) for a dark background, so the green value stays legible
// regardless of the OS theme.
const inp = "bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 text-[11px] [color-scheme:dark]";

/** Fixed per-column widths, shared by the header + every data cell so the column
 *  names sit left-justified directly over their column. Dist columns are wide
 *  enough for a triangular (select + 3 inputs); `team` fits the longest team /
 *  lane name. */
const W = {
  flag: "w-4 shrink-0",
  name: "w-40 shrink-0",
  dist: "w-60 shrink-0",
  team: "w-44 shrink-0",
  units: "w-12 shrink-0",
  maxArr: "w-24 shrink-0",
  target: "w-52 shrink-0",
  pct: "w-16 shrink-0",
  def: "w-14 shrink-0",
  cond: "w-40 shrink-0",
} as const;

function Section({ title, cols, children }: { title: string; cols: { label: string; w: string }[]; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-green-400/70 uppercase tracking-widest text-[10px] mb-1">{title}</p>
      <div className="flex items-center gap-2 text-green-400/40 pb-0.5 border-b border-green-500/20">
        {cols.map((c, i) => <span key={i} className={`${c.w} text-left`}>{c.label}</span>)}
      </div>
      {children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 py-0.5 border-b border-green-500/10">{children}</div>;
}
function Cell({ children, w, truncate }: { children: React.ReactNode; w: string; truncate?: boolean }) {
  return <span className={`${w} text-left ${truncate ? "text-green-300 truncate" : ""}`}>{children}</span>;
}
