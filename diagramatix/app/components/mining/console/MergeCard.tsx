"use client";

/**
 * Merging several systems' exports into one lifecycle.
 *
 * Everything shown here is read off ONE `mergeSources()` result — the same call
 * whose rows get imported. There is deliberately no second calculation for "the
 * summary", because the failure this phase exists to prevent is a merge that
 * looks like it worked.
 */

import { SOURCE_COLUMN, type MergeResult, type MergeSource } from "@/app/lib/mining/mergeSources";
import { INPUT_CLASS as inp } from "./shared";

export interface MergeCardProps {
  /** Committed sources, then the file still being mapped (if it is usable). */
  sources: MergeSource[];
  /** Index of the file still in the staging area, or -1. */
  stagingIdx: number;
  onRename: (idx: number, name: string) => void;
  onSetLink: (idx: number, column: string) => void;
  onRemove: (idx: number) => void;
  crosswalkName: string | null;
  crosswalkPairs: number;
  onCrosswalkFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearCrosswalk: () => void;
  /** null until there are two sources to merge. */
  merge: MergeResult | null;
}

const DAY = 86_400_000;
function gap(ms: number): string {
  if (ms >= DAY) return `${(ms / DAY).toFixed(1)} days`;
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)} hours`;
  return `${Math.round(ms / 60_000)} min`;
}

export function MergeCard({
  sources, stagingIdx, onRename, onSetLink, onRemove,
  crosswalkName, crosswalkPairs, onCrosswalkFile, onClearCrosswalk, merge,
}: MergeCardProps) {
  const a = merge?.assessment ?? null;
  const tone =
    a?.verdict === "no-overlap" ? "border-rose-500/60 bg-rose-950/20"
    : a?.verdict === "thin-overlap" ? "border-amber-500/60 bg-amber-950/20"
    : "border-emerald-500/40 bg-emerald-950/20";

  return (
    <div className={`mt-3 rounded border p-3 flex flex-col gap-2 ${merge ? tone : "border-stone-600 bg-stone-900/40"}`}>
      <div className="text-[11px] text-stone-200">
        <span className="font-semibold">Merging {sources.length} export{sources.length === 1 ? "" : "s"}</span>
        {sources.length === 1 && <span className="text-stone-400"> — add a second to merge them into one lifecycle.</span>}
      </div>

      {/* One row per source: what it is called, how it links, and how much it brought. */}
      <div className="flex flex-col gap-1">
        {sources.map((s, i) => {
          const c = a?.sources[i];
          return (
            <div key={s.id} className="flex items-center gap-2 flex-wrap text-[11px]">
              <input
                value={s.name}
                onChange={(e) => onRename(i, e.target.value)}
                className={`${inp} py-0.5 w-32`}
                title={`The system's name — written into the "${SOURCE_COLUMN}" column on every one of its events`}
              />
              <span className="text-stone-500">links on</span>
              <select value={s.linkColumn ?? ""} onChange={(e) => onSetLink(i, e.target.value)} className={`${inp} py-0.5`}
                title="A column in THIS file holding a key the other system also quotes. Leave as the case id when both systems use the same ids.">
                <option value="">its case id</option>
                {s.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              {c && <span className="text-stone-400">{c.cases.toLocaleString()} cases · {c.events.toLocaleString()} events{c.droppedRows > 0 ? ` · ${c.droppedRows} unusable` : ""}</span>}
              {i === stagingIdx && <span className="text-amber-300/80">(still being mapped)</span>}
              <button onClick={() => onRemove(i)} className="text-rose-400/70 hover:text-rose-300 px-1" title="Remove this export from the merge">✕</button>
            </div>
          );
        })}
      </div>

      {/* The crosswalk — only worth offering once there is something to cross. */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] pt-1 border-t border-stone-700/60">
        <span className="text-stone-400">Id crosswalk:</span>
        {crosswalkName ? (
          <>
            <span className="text-stone-300">{crosswalkName}</span>
            <span className={crosswalkPairs > 0 ? "text-emerald-300" : "text-rose-300"}>{crosswalkPairs.toLocaleString()} pairs</span>
            <button onClick={onClearCrosswalk} className="text-rose-400/70 hover:text-rose-300">✕</button>
          </>
        ) : (
          <label className="inline-block cursor-pointer text-amber-300 hover:text-amber-200 underline">
            attach a two-column file…
            <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onCrosswalkFile} className="hidden" />
          </label>
        )}
        <span className="text-stone-500">— for when one system says <span className="text-stone-400">OPP-123</span> and the other says <span className="text-stone-400">SO-456</span>.</span>
      </div>

      {a && (
        <>
          <div className={`text-[11px] ${a.verdict === "no-overlap" ? "text-rose-200" : a.verdict === "thin-overlap" ? "text-amber-200" : "text-emerald-200"}`}>
            {a.verdict === "no-overlap" ? "✕ " : a.verdict === "thin-overlap" ? "⚠ " : "✓ "}{a.message}
          </div>

          {/* The payoff. Neither export can show this on its own: the days a case
              spends between two systems, which is where the worst delay usually
              is and which nobody owns. */}
          {a.handovers.length > 0 && (
            <div className="rounded bg-stone-900/60 border border-stone-700 p-2 flex flex-col gap-0.5">
              <div className="text-[10px] uppercase tracking-wide text-stone-400">Between the systems</div>
              {a.handovers.slice(0, 6).map((h, i) => (
                <div key={i} className="text-[11px] text-stone-300">
                  <span className="text-stone-100">{h.from}</span> → <span className="text-stone-100">{h.to}</span>
                  {" · "}{h.count.toLocaleString()} time{h.count === 1 ? "" : "s"}
                  {" · "}median <span className="text-amber-200">{gap(h.medianGapMs)}</span> waiting
                </div>
              ))}
              <div className="text-[10px] text-stone-500">Measured across the join, before anything is stored — neither export contains it.</div>
            </div>
          )}

          {a.warnings.map((w, i) => <div key={i} className="text-[11px] text-amber-300/90">⚠ {w}</div>)}

          <div className="text-[10px] text-stone-500 leading-snug">
            Every event keeps a <span className="text-stone-400">{SOURCE_COLUMN}</span> column. After import, the
            system a case <em>started</em> in is available as a filterable attribute; per-event provenance lives in
            the log and its XES/OCEL export, but is not yet in the analytics index.
          </div>
        </>
      )}
    </div>
  );
}
