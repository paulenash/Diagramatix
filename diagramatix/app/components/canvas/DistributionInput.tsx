"use client";

/**
 * Editor for a single SimDist (a simulation distribution). Used everywhere a
 * cycle time / wait time / arrival rate is entered. Kind selector + the
 * relevant numeric fields; emits a complete SimDist on every change.
 */

import type { SimDist } from "@/app/lib/diagram/simParams";

const KINDS: { value: SimDist["kind"]; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "uniform", label: "Uniform" },
  { value: "triangular", label: "Triangular" },
  { value: "normal", label: "Normal" },
  { value: "exponential", label: "Exponential" },
];

const inputCls =
  "w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400";

function Num({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-500">{label}</span>
      <input
        type="number"
        className={inputCls}
        value={Number.isFinite(value) ? value : 0}
        step="any"
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}

export function DistributionInput({
  value,
  onChange,
  unitLabel,
}: {
  value?: SimDist;
  onChange: (d: SimDist) => void;
  unitLabel?: string;
}) {
  const d: SimDist = value ?? { kind: "fixed", value: 1 };

  function changeKind(kind: SimDist["kind"]) {
    switch (kind) {
      case "fixed": onChange({ kind, value: meanGuess(d) }); break;
      case "uniform": onChange({ kind, min: 0, max: meanGuess(d) * 2 }); break;
      case "triangular": onChange({ kind, min: 0, mode: meanGuess(d), max: meanGuess(d) * 2 }); break;
      case "normal": onChange({ kind, mean: meanGuess(d), sd: Math.max(1, meanGuess(d) / 4) }); break;
      case "exponential": onChange({ kind, mean: meanGuess(d) }); break;
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <select
          className={`${inputCls} flex-1`}
          value={d.kind}
          onChange={(e) => changeKind(e.target.value as SimDist["kind"])}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        {unitLabel && <span className="text-[10px] text-gray-400 whitespace-nowrap">{unitLabel}</span>}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {d.kind === "fixed" && (
          <Num label="value" value={d.value} onChange={(value) => onChange({ kind: "fixed", value })} />
        )}
        {d.kind === "uniform" && (
          <>
            <Num label="min" value={d.min} onChange={(min) => onChange({ ...d, min })} />
            <Num label="max" value={d.max} onChange={(max) => onChange({ ...d, max })} />
          </>
        )}
        {d.kind === "triangular" && (
          <>
            <Num label="min" value={d.min} onChange={(min) => onChange({ ...d, min })} />
            <Num label="mode" value={d.mode} onChange={(mode) => onChange({ ...d, mode })} />
            <Num label="max" value={d.max} onChange={(max) => onChange({ ...d, max })} />
          </>
        )}
        {d.kind === "normal" && (
          <>
            <Num label="mean" value={d.mean} onChange={(mean) => onChange({ ...d, mean })} />
            <Num label="std dev" value={d.sd} onChange={(sd) => onChange({ ...d, sd })} />
          </>
        )}
        {d.kind === "exponential" && (
          <Num label="mean" value={d.mean} onChange={(mean) => onChange({ kind: "exponential", mean })} />
        )}
      </div>
    </div>
  );
}

/** Best-effort central value of a distribution — used to seed sensible params
 *  when the user switches kind so fields don't reset to 0. */
function meanGuess(d: SimDist): number {
  switch (d.kind) {
    case "fixed": return d.value;
    case "uniform": return (d.min + d.max) / 2;
    case "triangular": return (d.min + d.mode + d.max) / 3;
    case "normal": return d.mean;
    case "exponential": return d.mean;
  }
}
