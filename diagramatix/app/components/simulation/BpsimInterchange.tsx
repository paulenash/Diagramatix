"use client";

/**
 * Export / import the current diagram's simulation model as standard BPSim XML
 * (OMG/WfMC) — the interchange format other process-sim tools understand.
 * Export builds a <bpsim:BPSimData> file and downloads it; import parses one and
 * applies its parameters back onto the diagram (matched by element id).
 *
 * Round-trips per-element times, arrivals, team+units, branch probabilities and
 * SOURCE operating-hours calendars. Team working-hours calendars live in the
 * project team library (not per-diagram), so they aren't part of this file.
 */

import { useRef, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { ScenarioRunConfig } from "@/app/lib/simulation/types";
import { buildBpsimData } from "@/app/lib/simulation/bpsim/exportBpsim";
import { parseBpsimScenarios } from "@/app/lib/simulation/bpsim/importBpsim";
import { diagramToBpsimScenario, identityIdMap } from "@/app/lib/simulation/bpsim/diagramBpsim";
import { applyBpsimToDiagram } from "@/app/lib/simulation/bpsim/applyBpsimToDiagram";
import type { BpsimScenario } from "@/app/lib/simulation/bpsim/types";
import { MatrixButton } from "./matrix/MatrixChrome";

const slug = (s: string) => (s || "simulation").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "simulation";

export function BpsimInterchange({
  data,
  onApplyData,
  calendars = [],
  runCfg,
  diagramName,
}: {
  data: DiagramData;
  onApplyData?: (next: DiagramData) => void;
  calendars?: { id: string; name?: string; pattern: import("@/app/lib/simulation/types").WorkCalendar }[];
  runCfg?: ScenarioRunConfig | null;
  diagramName?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** A parsed scenario waiting for the user to confirm applying it. */
  const [pending, setPending] = useState<{
    name: string; scenario: BpsimScenario; total: number; matched: number; scenarioCount: number;
  } | null>(null);

  function doExport() {
    setErr(null);
    const scenario = diagramToBpsimScenario(data, {
      name: diagramName, calendars,
      horizon: runCfg?.horizon, warmUp: runCfg?.warmUp, replication: runCfg?.replications,
    });
    const xml = buildBpsimData([scenario], runCfg?.clockUnit ?? "minute");
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${slug(diagramName ?? "simulation")}.bpsim.xml`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    const n = Object.keys(scenario.elements).length;
    const c = scenario.calendars?.length ?? 0;
    setMsg(`Exported ${n} parameterised element${n === 1 ? "" : "s"}${c ? ` + ${c} source calendar${c === 1 ? "" : "s"}` : ""}. (Team calendars stay in the Team library — use the study ⭳ Export for the full simulation bundle.)`);
  }

  // Parse and STAGE — this import overwrites the simulation parameters on the
  // diagram you have open, so show what it would touch before doing it.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !onApplyData) return;
    setErr(null); setMsg(null);
    try {
      const xml = await file.text();
      const scenarios = parseBpsimScenarios(xml, runCfg?.clockUnit ?? "minute");
      if (scenarios.length === 0) { setErr("No BPSim scenario found in that file."); return; }
      // Richest scenario (most parameterised elements).
      const scenario = scenarios.reduce((a, b) => (Object.keys(b.elements).length > Object.keys(a.elements).length ? b : a));
      const refs = Object.keys(scenario.elements);
      const matched = refs.filter((ref) => data.elements.some((el) => el.id === ref) || data.connectors.some((c) => c.id === ref)).length;
      setPending({ name: file.name, scenario, total: refs.length, matched, scenarioCount: scenarios.length });
    } catch {
      setErr("Couldn't read that file as BPSim XML.");
    }
  }

  function confirmImport() {
    if (!pending || !onApplyData) return;
    onApplyData(applyBpsimToDiagram(data, identityIdMap(data), pending.scenario));
    setMsg(`Imported — applied ${pending.matched} of ${pending.total} element(s) to this diagram.`);
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-2 text-[11px]">
      <p className="text-green-400/60">
        Move this diagram&rsquo;s simulation model in/out of <span className="text-green-300">BPSim</span> — the OMG/WfMC standard other
        process-sim tools read. Carries times, arrivals, teams + units, branch probabilities and source operating-hours.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <MatrixButton onClick={doExport}>⭳ Export BPSim</MatrixButton>
        {onApplyData && <MatrixButton onClick={() => fileRef.current?.click()}>⭱ Import BPSim</MatrixButton>}
        <input ref={fileRef} type="file" accept=".xml,.bpmn,.bpsim,text/xml,application/xml" onChange={onFile} className="hidden" />
      </div>
      {!onApplyData && <p className="text-green-400/40">Open this diagram from its editor to import.</p>}

      {/* What the file would do to THIS diagram, before it does it. */}
      {pending && (
        <div className="flex flex-col gap-2 border border-green-500/40 rounded p-2 bg-green-500/5">
          <p className="text-green-300">
            ⭱ <span className="text-green-400/60">{pending.name}</span> — apply to this diagram?
          </p>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10px]">
            <span className="text-green-400/50">Scenario</span>
            <span className="text-green-200 truncate">
              {pending.scenario.name || pending.scenario.id || "unnamed"}
              {pending.scenarioCount > 1 && (
                <span className="text-green-400/40"> (richest of {pending.scenarioCount})</span>
              )}
            </span>
            <span className="text-green-400/50">Matches here</span>
            <span className={pending.matched === 0 ? "text-red-300" : "text-green-200"}>
              {pending.matched} of {pending.total} element(s)
            </span>
            {pending.scenario.horizon !== undefined && (
              <>
                <span className="text-green-400/50">Run</span>
                <span className="text-green-200">
                  horizon {Math.round(pending.scenario.horizon)}
                  {pending.scenario.replication ? ` · ${pending.scenario.replication} replications` : ""}
                </span>
              </>
            )}
          </div>
          {pending.matched === 0 ? (
            <p className="text-red-300 text-[10px]">
              None of the file&rsquo;s ids match this diagram — import matches by element id, so this is
              almost certainly a file from a different process.
            </p>
          ) : (
            <p className="text-green-400/40 text-[10px]">
              Overwrites the simulation parameters on the matching elements. Undo in the editor reverts it.
            </p>
          )}
          <div className="flex items-center gap-2">
            <MatrixButton onClick={confirmImport}>Apply</MatrixButton>
            <button onClick={() => setPending(null)} className="text-green-400/60 hover:text-green-300">cancel</button>
          </div>
        </div>
      )}

      {msg && <p className="text-green-300">{msg}</p>}
      {err && <p className="text-red-400">{err}</p>}
      <p className="text-green-400/40 text-[10px]">Import matches by element id — best on a file exported from this diagram. Team working-hours calendars stay in the Team library (not in the file).</p>
    </div>
  );
}
