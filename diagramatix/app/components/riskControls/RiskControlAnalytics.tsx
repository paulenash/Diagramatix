"use client";

/**
 * In-screen analytics for a project's Risk & Control library — computed entirely
 * from data the console already holds (library items + links, per-control
 * effectiveness, on-model attachments). Mirrors the .xlsx "Coverage Summary"
 * sheet and adds risk-posture / control-mix / effectiveness distributions.
 */
import { useMemo } from "react";
import type { RiskControlLibraryDTO, RiskControlItemDTO, RcAttachment } from "@/app/lib/riskControls/types";
import { KIND_LABEL, riskScore, residualScore, riskBand } from "@/app/lib/riskControls/types";
import type { ControlEffectiveness } from "@/app/lib/riskControls/controlEffectiveness";

const BAND = ["high", "medium", "low", "none"] as const;
const BAND_LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low", none: "Unscored" };
const BAND_BAR: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-emerald-500", none: "bg-gray-300" };

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-28 shrink-0 text-gray-600 truncate" title={label}>{label}</span>
      <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
      <span className="w-14 text-right text-gray-500 tabular-nums">{value} · {pct}%</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-xs font-semibold text-gray-700 mb-2.5 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-semibold ${tone ?? "text-gray-800"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}

export function RiskControlAnalytics({
  library, effectiveness, attachments,
}: {
  library: RiskControlLibraryDTO;
  effectiveness?: Record<string, ControlEffectiveness>;
  attachments?: Record<string, RcAttachment[]>;
}) {
  const a = useMemo(() => {
    const items = library.items;
    const by = (k: string) => items.filter((i) => i.kind === k);
    const risks = by("Risk"), controls = by("Control");
    const isControl = (id: string) => items.find((i) => i.id === id)?.kind === "Control";
    const covered = (r: RiskControlItemDTO) => library.links.some((l) => l.targetId === r.id && isControl(l.sourceId));
    const gaps = risks.filter((r) => !covered(r));

    const band = (fn: (i: RiskControlItemDTO) => number | null) => {
      const c: Record<string, number> = { high: 0, medium: 0, low: 0, none: 0 };
      for (const r of risks) c[riskBand(fn(r))]++;
      return c;
    };
    const inherent = band(riskScore), residual = band(residualScore);

    const ctlType = (t: string | null) => controls.filter((c) => (c.controlType ?? "—") === t).length;
    const ctlAuto = (t: string | null) => controls.filter((c) => (c.automation ?? "—") === t).length;

    const eff = Object.values(effectiveness ?? {}).filter((e) => e.effectivenessPct != null);
    const avgEff = eff.length ? Math.round(eff.reduce((s, e) => s + (e.effectivenessPct ?? 0), 0) / eff.length) : null;
    const below80 = eff.filter((e) => (e.effectivenessPct ?? 100) < 80).length;

    const attachedIds = new Set(Object.keys(attachments ?? {}).filter((id) => (attachments![id]?.length ?? 0) > 0));
    const attachable = [...risks, ...controls];
    const attachedCount = attachable.filter((i) => attachedIds.has(i.id)).length;

    return { items, risks, controls, gaps, inherent, residual, ctlType, ctlAuto, eff, avgEff, below80, attachedCount, attachable };
  }, [library, effectiveness, attachments]);

  const KINDS = ["Risk", "Control", "Policy", "Regulation", "AuditFinding", "KRI", "KPI"] as const;

  return (
    <div className="space-y-4">
      {/* Headline stats */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-3 sm:grid-cols-6 gap-4">
        <Stat label="Risks" value={a.risks.length} />
        <Stat label="Controls" value={a.controls.length} />
        <Stat label="Links" value={library.links.length} />
        <Stat label="Coverage gaps" value={a.gaps.length} tone={a.gaps.length ? "text-red-600" : "text-emerald-600"} />
        <Stat label="Avg effectiveness" value={a.avgEff == null ? "—" : `${a.avgEff}%`} tone={a.avgEff == null ? "text-gray-400" : a.avgEff >= 95 ? "text-emerald-600" : a.avgEff >= 80 ? "text-amber-600" : "text-red-600"} />
        <Stat label="Controls < 80%" value={a.eff.length ? a.below80 : "—"} tone={a.below80 ? "text-red-600" : "text-gray-800"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Catalog by kind">
          <div className="space-y-1.5">
            {KINDS.map((k) => { const n = a.items.filter((i) => i.kind === k).length; return n ? <Bar key={k} label={KIND_LABEL[k]} value={n} total={a.items.length} color="bg-blue-500" /> : null; })}
          </div>
        </Card>

        <Card title="Control coverage">
          <div className="space-y-1.5">
            <Bar label="Risks with a control" value={a.risks.length - a.gaps.length} total={a.risks.length} color="bg-emerald-500" />
            <Bar label="Coverage gaps" value={a.gaps.length} total={a.risks.length} color="bg-red-500" />
          </div>
          {a.gaps.length > 0 && (
            <div className="mt-2 text-[10px] text-red-600 max-h-24 overflow-y-auto">
              {a.gaps.map((r) => <div key={r.id}>• {r.code} {r.name}</div>)}
            </div>
          )}
        </Card>

        <Card title="Risk posture — inherent">
          <div className="space-y-1.5">{BAND.map((b) => <Bar key={b} label={BAND_LABEL[b]} value={a.inherent[b]} total={a.risks.length} color={BAND_BAR[b]} />)}</div>
        </Card>
        <Card title="Risk posture — residual (after controls)">
          <div className="space-y-1.5">{BAND.map((b) => <Bar key={b} label={BAND_LABEL[b]} value={a.residual[b]} total={a.risks.length} color={BAND_BAR[b]} />)}</div>
        </Card>

        <Card title="Control type">
          <div className="space-y-1.5">
            {["Preventive", "Detective", "Corrective"].map((t) => <Bar key={t} label={t} value={a.ctlType(t)} total={a.controls.length} color="bg-indigo-500" />)}
            {a.ctlType(null) > 0 && <Bar label="Unspecified" value={a.ctlType(null)} total={a.controls.length} color="bg-gray-300" />}
          </div>
        </Card>
        <Card title="Control automation">
          <div className="space-y-1.5">
            {[["Manual", "Manual"], ["Automated", "Automated"], ["ITDependent", "IT-dependent"]].map(([v, l]) => <Bar key={v} label={l} value={a.ctlAuto(v)} total={a.controls.length} color="bg-teal-500" />)}
            {a.ctlAuto(null) > 0 && <Bar label="Unspecified" value={a.ctlAuto(null)} total={a.controls.length} color="bg-gray-300" />}
          </div>
        </Card>

        <Card title="On-model coverage">
          <div className="space-y-1.5">
            <Bar label="Attached to a step" value={a.attachedCount} total={a.attachable.length} color="bg-blue-500" />
            <Bar label="Not on any step" value={a.attachable.length - a.attachedCount} total={a.attachable.length} color="bg-gray-300" />
          </div>
          <p className="mt-2 text-[10px] text-gray-400">Risks &amp; Controls attached to at least one process step.</p>
        </Card>

        <Card title="Operating effectiveness">
          {a.eff.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic">No mining conformance run yet — effectiveness is unmeasured. Import an event log with Control IDs (or run conformance) in the Miner.</p>
          ) : (
            <div className="space-y-1.5">
              <Bar label="≥ 95% (effective)" value={a.eff.filter((e) => (e.effectivenessPct ?? 0) >= 95).length} total={a.eff.length} color="bg-emerald-500" />
              <Bar label="80–95% (watch)" value={a.eff.filter((e) => (e.effectivenessPct ?? 0) >= 80 && (e.effectivenessPct ?? 0) < 95).length} total={a.eff.length} color="bg-amber-500" />
              <Bar label="< 80% (weak)" value={a.eff.filter((e) => (e.effectivenessPct ?? 100) < 80).length} total={a.eff.length} color="bg-red-500" />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
