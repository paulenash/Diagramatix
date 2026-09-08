"use client";

/**
 * Fill the skills matrix from an ArchiMate diagram.
 *
 * Business Architects already model who can do what. This reads it rather than
 * asking for it twice.
 *
 * READ-ONCE, NOT A LIVE LINK: the source and date are shown so a re-pull is a
 * decision, and a run's results never change because someone edited an
 * architecture diagram last Tuesday.
 *
 * The unmatched report is the HEADLINE, not a footnote. A fill that quietly
 * matched nothing looks exactly like a fill that worked.
 */

import { useCallback, useEffect, useState } from "react";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";

interface Option {
  id: string; name: string;
  actors: number; skills: number;
  wouldFillMembers: number; wouldFillTasks: number;
}
interface FillResult {
  filledFrom: { diagramName: string; at: string };
  membersUpdated: number;
  tasksUpdated: number;
  unmatchedActors: string[];
  unmatchedMembers: string[];
  unmatchedWork: string[];
  warnings: string[];
  skills: string[];
}

export function SkillsFillPanel({ baseUrl, onFilled }: {
  /** `/api/projects/:id/simulation-teams/fill-skills` */
  baseUrl: string;
  onFilled?: () => void;
}) {
  const [options, setOptions] = useState<Option[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [result, setResult] = useState<FillResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(baseUrl)
      .then((r) => (r.ok ? r.json() : { options: [] }))
      .then((j) => { setOptions(j.options ?? []); setChosen(j.options?.[0]?.id ?? ""); })
      .catch(() => setOptions([]));
  }, [baseUrl]);

  const fill = useCallback(async () => {
    if (!chosen) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(baseUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagramId: chosen }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "The fill failed"); return; }
      setResult(json as FillResult);
      onFilled?.();
    } catch {
      setErr("The fill failed");
    } finally { setBusy(false); }
  }, [baseUrl, chosen, onFilled]);

  if (options === null) return <p className="text-green-400/50 text-[10px]">Loading…</p>;
  if (options.length === 0) {
    return (
      <p className="text-green-400/50 text-[10px] leading-relaxed">
        No ArchiMate diagram in this project. Skills can be typed in directly — or draw the actors and
        the roles they are assigned to, and they can be read straight off it.
      </p>
    );
  }

  const picked = options.find((o) => o.id === chosen);

  return (
    <div className="flex flex-col gap-2 text-[10px]">
      <div className="flex items-end gap-2 flex-wrap">
        <label className="flex flex-col gap-0.5">
          <span className="text-green-400/60">Fill skills from</span>
          <select value={chosen} onChange={(e) => { setChosen(e.target.value); setResult(null); }}
            className="bg-black/40 border border-green-500/40 rounded px-1.5 py-0.5 text-green-200 text-[10px]">
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <button onClick={fill} disabled={busy || !chosen}
          className="rounded px-2 py-0.5 border border-green-400/60 text-green-200 hover:bg-green-400/10 disabled:opacity-40">
          {busy ? "Filling…" : "✨ Fill from ArchiMate"}
        </button>
        {busy && <DiagramatixThrobber size={14} tone="amber" />}
      </div>

      {/* A preview, so nobody has to run a fill to find out it would match nothing. */}
      {picked && !result && (
        <p className="text-green-400/50">
          {picked.actors} actor{picked.actors === 1 ? "" : "s"}, {picked.skills} skill{picked.skills === 1 ? "" : "s"} ·
          would fill <span className={picked.wouldFillMembers ? "text-green-300" : "text-amber-300"}>{picked.wouldFillMembers}</span> team
          member{picked.wouldFillMembers === 1 ? "" : "s"} and <span className={picked.wouldFillTasks ? "text-green-300" : "text-amber-300"}>{picked.wouldFillTasks}</span> task{picked.wouldFillTasks === 1 ? "" : "s"}.
          {picked.wouldFillMembers === 0 && picked.wouldFillTasks === 0 &&
            " Nothing matches by name — check the actor and task labels are the same in both."}
        </p>
      )}

      {err && <p className="text-red-400">{err}</p>}

      {result && (
        <div className="flex flex-col gap-1.5">
          <p className="text-green-200">
            Filled {result.membersUpdated} member{result.membersUpdated === 1 ? "" : "s"} and {result.tasksUpdated} task
            {result.tasksUpdated === 1 ? "" : "s"} from <span className="text-green-300">{result.filledFrom.diagramName}</span>{" "}
            on {new Date(result.filledFrom.at).toLocaleDateString()}.
          </p>
          <p className="text-green-400/50">
            Read once — edit freely from here. Nothing changes again until you fill from the diagram again.
          </p>

          <Unmatched label="In the diagram, not on any team" names={result.unmatchedActors} />
          <Unmatched label="On a team, not in the diagram" names={result.unmatchedMembers} />
          <Unmatched label="In the diagram, matching no task" names={result.unmatchedWork} />

          {result.warnings.map((w, i) => (
            <p key={i} className="text-amber-300/80 leading-relaxed">⚠ {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Unmatched names are shown even when the list is long — truncating the thing
 *  the reader most needs to fix would defeat the point of reporting it. */
function Unmatched({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="text-amber-300/80 leading-relaxed">
      <span className="text-green-400/60">{label}:</span> {names.join(", ")}
    </p>
  );
}
