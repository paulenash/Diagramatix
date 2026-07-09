"use client";

import { useEffect, useState } from "react";
import type { PcfClassification } from "@/app/lib/diagram/types";
import { usePcfLevelColors } from "@/app/lib/pcf/usePcfLevelColors";
import { pcfLevelStyle, PCF_LEVEL_NAMES } from "@/app/lib/pcf/levelColors";

interface Framework { id: string; name: string; variant: string; version: string; kind: string; division: string | null }
interface Hit { id: string; pcfId: number; hierarchyId: string; name: string; level: number }

const LEVEL = ["", "Category", "Process Group", "Process", "Activity", "Task"];

/**
 * Diagram-level APQC PCF classification — "which standard process is this?".
 * Self-contained: loads the project's available frameworks and searches nodes
 * itself, so the Properties Panel only wires projectId + value + onChange.
 */
export function PcfClassifySection({ projectId, value, onChange }: {
  projectId: string;
  value?: PcfClassification;
  onChange: (v: PcfClassification | undefined) => void;
}) {
  const pcfColors = usePcfLevelColors();
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [fw, setFw] = useState<string>(value?.frameworkId ?? "");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/pcf`).then((r) => r.json()).then((j) => {
      if (cancelled) return;
      setFrameworks(j.frameworks ?? []);
      setFw((prev) => prev || value?.frameworkId || j.frameworks?.[0]?.id || "");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectId, value?.frameworkId]);

  useEffect(() => {
    if (!open || !fw) return;
    const t = setTimeout(() => {
      fetch(`/api/projects/${projectId}/pcf/search?framework=${fw}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json()).then((j) => setHits(j.nodes ?? [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, fw, open, projectId]);

  const pick = (n: Hit) => {
    const f = frameworks.find((x) => x.id === fw);
    onChange({ nodeId: n.id, pcfId: n.pcfId, hierarchyId: n.hierarchyId, name: n.name, frameworkId: fw, variant: f?.variant ?? "" });
    setOpen(false); setQ("");
  };

  if (frameworks.length === 0 && !value) {
    return <p className="text-[10px] text-gray-400 italic">No PCF frameworks loaded. A SuperAdmin imports them in Process Classification (APQC PCF).</p>;
  }

  return (
    <div className="space-y-1.5">
      {value ? (
        <div className="flex items-start gap-1.5">
          <span className="flex-1 text-[11px] text-gray-900 font-medium">
            <span className="font-mono text-gray-600 font-normal">{value.hierarchyId}</span> {value.name}
            <span className="block text-[10px] text-gray-600 font-normal">
              {value.variant}{value.version ? ` · v${value.version}` : ""}
            </span>
            {(value.numbered || value.generated) && (
              <span className="block text-[9px] text-gray-400 font-normal">
                {value.generated === "decompose" ? "Decomposed to subprocesses" : value.generated === "ai" ? "AI-generated" : ""}
                {value.numbered ? (value.generated ? " · APQC-numbered" : "APQC-numbered") : ""}
              </span>
            )}
          </span>
          <button onClick={() => setOpen((o) => !o)} className="text-[10px] text-blue-600 hover:text-blue-800">Change</button>
          <button onClick={() => onChange(undefined)} className="text-[10px] text-gray-400 hover:text-red-600">Clear</button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="text-[11px] text-blue-600 hover:text-blue-800">＋ Classify against APQC PCF…</button>
      )}

      {open && (
        <div className="border border-gray-200 rounded p-1.5 space-y-1 bg-gray-50/60">
          <select value={fw} onChange={(e) => setFw(e.target.value)} className="w-full text-[10px] border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-800">
            <optgroup label="APQC reference">
              {frameworks.filter((f) => f.kind === "reference").map((f) => <option key={f.id} value={f.id}>{f.variant} v{f.version}</option>)}
            </optgroup>
            {frameworks.some((f) => f.kind === "tailored") && (
              <optgroup label="Tailored">
                {frameworks.filter((f) => f.kind === "tailored").map((f) => <option key={f.id} value={f.id}>{f.name}{f.division ? ` · ${f.division}` : ""}</option>)}
              </optgroup>
            )}
          </select>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search process / code…" className="w-full text-[10px] border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-800" />
          <div className="max-h-40 overflow-y-auto">
            {hits.length === 0 ? <p className="text-[9px] text-gray-400 px-1 py-1">Type to search…</p> : hits.map((n) => (
              <button key={n.id} onClick={() => pick(n)} className="w-full text-left px-1 py-0.5 text-[10px] hover:bg-blue-50 rounded flex items-baseline gap-1">
                <span className="font-mono text-gray-500 shrink-0">{n.hierarchyId}</span>
                <span className="flex-1 text-gray-800">{n.name}</span>
                {(() => { const st = pcfLevelStyle(n.level, pcfColors); return (
                  <span className="text-[8px] px-1 rounded shrink-0 font-medium" style={{ background: st.main, color: st.textOnMain }}>{PCF_LEVEL_NAMES[n.level] ?? LEVEL[n.level]}</span>
                ); })()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
