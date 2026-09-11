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
  // Most cases routine, a minority far longer — the shape most human process
  // work actually has, and the one a symmetric distribution cannot produce.
  { value: "lognormal", label: "Lognormal" },
];

// Measured values, written by calibration / BPSim import and never chosen by
// hand. Listed separately so the select can still SHOW one it is holding: a
// picker that cannot render its own value reports the wrong distribution.
const READ_ONLY_KINDS: { value: SimDist["kind"]; label: string }[] = [
  { value: "empirical", label: "Empirical (measured)" },
];

// Explicit bg/text + light color-scheme so the value stays black-on-white even
// when the OS is in dark mode (otherwise the UA renders the control dark and
// the numbers become unreadable).
const inputCls =
  "w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded bg-white text-gray-900 [color-scheme:light] focus:outline-none focus:ring-1 focus:ring-blue-400";

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
      // sd from the mean keeps the spread plausible rather than resetting to 0,
      // which would make a lognormal behave exactly like a fixed value.
      case "lognormal": onChange({ kind, mean: meanGuess(d), sd: Math.max(1, meanGuess(d) / 4) }); break;
      // Not reachable from the select (it is disabled there); a no-op rather
      // than a throw, because discarding measured samples on a mis-click would
      // be unrecoverable.
      case "empirical": break;
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
          {/* Only when it IS the current value — offered to nobody, hidden the
              rest of the time, but never leaving the select showing a kind the
              value is not. */}
          {READ_ONLY_KINDS.filter((k) => k.value === d.kind).map((k) => (
            <option key={k.value} value={k.value} disabled>{k.label}</option>
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
        {d.kind === "lognormal" && (
          <>
            <Num label="mean" value={d.mean} onChange={(mean) => onChange({ ...d, mean })} />
            <Num label="std dev" value={d.sd} onChange={(sd) => onChange({ ...d, sd })} />
          </>
        )}
        {d.kind === "empirical" && (
          // Not editable by hand — these are measured values, and a form that
          // invited someone to type sixty-four numbers would be a form nobody
          // should use. Calibration writes them; this says what is there.
          <span className="text-[11px] text-gray-500">
            {d.samples.length} observed value{d.samples.length === 1 ? "" : "s"}, resampled
            {d.samples.length > 0 && ` (${d.samples[0]}–${d.samples[d.samples.length - 1]})`}
          </span>
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
    case "lognormal": return d.mean;
    case "empirical": return d.samples.length === 0 ? 0 : d.samples.reduce((a, b) => a + b, 0) / d.samples.length;
  }
}
