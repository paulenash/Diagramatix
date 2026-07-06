"use client";

/**
 * Collapsible read-only JSON viewer for the Plan Structure editor. Objects and
 * arrays can be expanded/collapsed per node for easy scanning of a large plan.
 * Auto-reflects the live plan (it renders a value, not text), so it updates as
 * the structured columns are edited. Pure presentational.
 */
import { useState } from "react";

function Node({ k, value, depth, accent, defaultOpen }: { k?: string | number; value: unknown; depth: number; accent: string; defaultOpen?: boolean }) {
  const isObj = value !== null && typeof value === "object";
  const isArr = Array.isArray(value);
  const [open, setOpen] = useState(defaultOpen ?? depth < 2);

  const keyLabel = k !== undefined ? <span className="text-white/70">{typeof k === "number" ? `[${k}]` : `"${k}"`}: </span> : null;

  if (!isObj) {
    const v = value as string | number | boolean | null;
    const cls = typeof v === "string" ? "text-emerald-300" : typeof v === "number" ? "text-sky-300" : v === null ? "text-white/40" : "text-amber-300";
    return (
      <div className="whitespace-pre" style={{ paddingLeft: depth * 12 }}>
        {keyLabel}<span className={cls}>{JSON.stringify(v)}</span>
      </div>
    );
  }

  const entries = isArr ? (value as unknown[]).map((v, i) => [i, v] as const) : Object.entries(value as Record<string, unknown>);
  const open_ = isArr ? "[" : "{";
  const close_ = isArr ? "]" : "}";
  const summary = isArr ? `${entries.length} item${entries.length === 1 ? "" : "s"}` : `${entries.length} key${entries.length === 1 ? "" : "s"}`;

  return (
    <div className="whitespace-pre" style={{ paddingLeft: depth * 12 }}>
      <button onClick={() => setOpen((o) => !o)} className="text-left hover:opacity-80">
        <span style={{ color: accent }}>{open ? "▾" : "▸"}</span> {keyLabel}
        <span className="text-white/50">{open_}</span>
        {!open && <span className="text-white/30"> {summary} {close_}</span>}
      </button>
      {open && (
        <>
          {entries.map(([ck, cv]) => (
            <Node key={String(ck)} k={ck} value={cv} depth={depth + 1} accent={accent} />
          ))}
          <div style={{ paddingLeft: depth * 12 }}><span className="text-white/50">{close_}</span></div>
        </>
      )}
    </div>
  );
}

export function JsonTree({ value, accent = "#7dd3fc" }: { value: unknown; accent?: string }) {
  return (
    <div className="font-mono text-[10px] leading-relaxed">
      <Node value={value} depth={0} accent={accent} defaultOpen />
    </div>
  );
}
