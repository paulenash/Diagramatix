"use client";

import { type ReactNode } from "react";
import { eventTrigger, type ProcessDiff, type DiffStatus } from "@/app/lib/diagram/diff/processDiff";

/** Inline **bold** → <strong>. */
function inlineMd(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
  );
}

/** Minimal markdown → elements for the AI summary: #/##/### become heading
 *  levels (not literal ## text), `- ` bullets, `**bold**`, blank-line paragraphs. */
function MarkdownLite({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (bullets.length) {
      out.push(<ul key={key} className="list-disc pl-4 my-1 space-y-0.5">{bullets.map((l, i) => <li key={i}>{inlineMd(l)}</li>)}</ul>);
      bullets = [];
    }
  };
  text.split(/\r?\n/).forEach((ln, i) => {
    const h = ln.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(`u${i}`); const lvl = h[1].length; out.push(<div key={i} className={`${lvl <= 1 ? "text-[13px]" : "text-[12px]"} font-semibold text-gray-900 mt-2 mb-0.5`}>{inlineMd(h[2])}</div>); return; }
    const b = ln.match(/^\s*[-*]\s+(.*)$/);
    if (b) { bullets.push(b[1]); return; }
    flush(`u${i}`);
    if (ln.trim() !== "") out.push(<p key={i} className="my-1">{inlineMd(ln)}</p>);
  });
  flush("uend");
  return <>{out}</>;
}

const STATUS_STYLE: Record<DiffStatus, string> = {
  added: "bg-green-50 text-green-700",
  removed: "bg-red-50 text-red-700",
  changed: "bg-amber-50 text-amber-800",
  unchanged: "text-gray-500",
};
const STATUS_LABEL: Record<DiffStatus, string> = {
  added: "Added", removed: "Removed", changed: "Changed", unchanged: "Same",
};

/** Before/after cell — shows a single value if unchanged, else "a → b". */
function Cell({ a, b, changed }: { a?: string; b?: string; changed: boolean }) {
  const A = a || "—", B = b || "—";
  if (!changed || A === B) return <span className="text-gray-600">{A}</span>;
  return (
    <span>
      <span className="text-gray-400 line-through">{A}</span>
      <span className="text-gray-400"> → </span>
      <span className="text-gray-900 font-medium">{B}</span>
    </span>
  );
}

/** Optional merge cherry-pick controls for the activity table (live dialog only). */
export interface MergeControls {
  mergeMode: boolean;
  accepted: Set<number>;
  onToggleRow: (i: number) => void;
}

/**
 * Read-only rendering of a ProcessDiff (all dimensions) + optional AI summary.
 * Shared by the live Diff dialog, the saved-run viewer, and the OrgAdmin /
 * SuperAdmin management screens — so every surface shows an identical report.
 * Pass `merge` only in the live dialog to add the cherry-pick "Take" column.
 */
export function ProcessDiffResults({ diff, aiSummary, merge }: {
  diff: ProcessDiff;
  aiSummary?: string | null;
  merge?: MergeControls;
}) {
  const mergeMode = merge?.mergeMode ?? false;
  return (
    <>
      {/* Direction + summary */}
      <div className="text-xs text-gray-600 mb-2">
        <span className="font-medium">{diff.a.title}</span> (before) →{" "}
        <span className="font-medium">{diff.b.title}</span> (after)
      </div>
      <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
        <span className="px-2 py-0.5 rounded bg-green-50 text-green-700">{diff.summary.added} added</span>
        <span className="px-2 py-0.5 rounded bg-red-50 text-red-700">{diff.summary.removed} removed</span>
        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800">{diff.summary.changed} changed</span>
        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">{diff.summary.unchanged} unchanged</span>
      </div>
      {(diff.roleDiff.added.length > 0 || diff.roleDiff.removed.length > 0 || diff.systemDiff.added.length > 0 || diff.systemDiff.removed.length > 0 || diff.dataObjectDiff.added.length > 0 || diff.dataObjectDiff.removed.length > 0) && (
        <div className="text-[11px] text-gray-600 mb-3 space-y-0.5">
          {(diff.roleDiff.added.length > 0 || diff.roleDiff.removed.length > 0) && (
            <div><span className="font-medium">Roles:</span>{" "}
              {diff.roleDiff.added.map((r) => <span key={r} className="text-green-700">+{r} </span>)}
              {diff.roleDiff.removed.map((r) => <span key={r} className="text-red-600">−{r} </span>)}
            </div>
          )}
          {(diff.systemDiff.added.length > 0 || diff.systemDiff.removed.length > 0) && (
            <div><span className="font-medium">Systems:</span>{" "}
              {diff.systemDiff.added.map((r) => <span key={r} className="text-green-700">+{r} </span>)}
              {diff.systemDiff.removed.map((r) => <span key={r} className="text-red-600">−{r} </span>)}
            </div>
          )}
          {(diff.dataObjectDiff.added.length > 0 || diff.dataObjectDiff.removed.length > 0) && (
            <div><span className="font-medium">Data objects:</span>{" "}
              {diff.dataObjectDiff.added.map((r) => <span key={r} className="text-green-700">+{r} </span>)}
              {diff.dataObjectDiff.removed.map((r) => <span key={r} className="text-red-600">−{r} </span>)}
            </div>
          )}
        </div>
      )}

      {/* Review status */}
      {(() => {
        const rd = diff.reviewDiff;
        const hasAny = rd.added.length || rd.removed.length ||
          Object.values(rd.aCounts).some((n) => n > 0) || Object.values(rd.bCounts).some((n) => n > 0);
        if (!hasAny) return null;
        const kindLabel: Record<string, string> = { "review-comment": "Review Comment", "pain-point": "Pain Point", issue: "Issue", bottleneck: "Bottleneck" };
        return (
          <div className="mb-3 p-2.5 bg-purple-50 border border-purple-100 rounded">
            <div className="text-[11px] font-medium text-purple-800 mb-1">Review status</div>
            <div className="text-[11px] text-gray-700 mb-1.5">{rd.status}</div>
            {(rd.added.length > 0 || rd.removed.length > 0) && (
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="text-gray-500 text-left">
                      <th className="px-1.5 py-1 font-medium"> </th>
                      <th className="px-1.5 py-1 font-medium">Kind</th>
                      <th className="px-1.5 py-1 font-medium">Note</th>
                      <th className="px-1.5 py-1 font-medium">Near</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rd.removed.map((r, i) => (
                      <tr key={`rr${i}`} className="border-t border-purple-100">
                        <td className="px-1.5 py-1"><span className="px-1 py-0.5 rounded bg-red-50 text-red-700">Removed</span></td>
                        <td className="px-1.5 py-1 text-gray-600">{kindLabel[r.kind]}</td>
                        <td className="px-1.5 py-1 text-gray-700">{r.text || "—"}</td>
                        <td className="px-1.5 py-1 text-gray-500">{r.location || "—"}</td>
                      </tr>
                    ))}
                    {rd.added.map((r, i) => (
                      <tr key={`ra${i}`} className="border-t border-purple-100">
                        <td className="px-1.5 py-1"><span className="px-1 py-0.5 rounded bg-green-50 text-green-700">Added</span></td>
                        <td className="px-1.5 py-1 text-gray-600">{kindLabel[r.kind]}</td>
                        <td className="px-1.5 py-1 text-gray-700">{r.text || "—"}</td>
                        <td className="px-1.5 py-1 text-gray-500">{r.location || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Activity table */}
      <div className="overflow-x-auto border border-gray-200 rounded">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-left">
              {mergeMode && <th className="px-2 py-1.5 font-medium w-8" title="Include this change in the merge">Take</th>}
              <th className="px-2 py-1.5 font-medium">Activity</th>
              <th className="px-2 py-1.5 font-medium">Change</th>
              <th className="px-2 py-1.5 font-medium">Who (role)</th>
              <th className="px-2 py-1.5 font-medium">Type</th>
              <th className="px-2 py-1.5 font-medium">Systems</th>
              <th className="px-2 py-1.5 font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {diff.rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100 align-top">
                {mergeMode && (
                  <td className="px-2 py-1.5">
                    {r.status !== "unchanged" && (
                      <input type="checkbox" checked={merge!.accepted.has(i)} onChange={() => merge!.onToggleRow(i)}
                        title="Include this change in the merged diagram" />
                    )}
                  </td>
                )}
                <td className="px-2 py-1.5 text-gray-900">{r.activity}</td>
                <td className="px-2 py-1.5"><span className={`px-1.5 py-0.5 rounded ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                <td className="px-2 py-1.5"><Cell a={r.who.a} b={r.who.b} changed={r.who.changed} /></td>
                <td className="px-2 py-1.5">
                  <Cell a={r.taskType.a} b={r.taskType.b} changed={r.taskType.changed} />
                  {r.automationNote && <div className="text-[10px] text-indigo-600 italic mt-0.5">{r.automationNote}</div>}
                </td>
                <td className="px-2 py-1.5"><Cell a={(r.systems.a ?? []).join(", ")} b={(r.systems.b ?? []).join(", ")} changed={r.systems.changed} /></td>
                <td className="px-2 py-1.5"><Cell a={(r.data.a ?? []).join(", ")} b={(r.data.b ?? []).join(", ")} changed={r.data.changed} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Message flows */}
      {(diff.messageDiff.added.length > 0 || diff.messageDiff.removed.length > 0 || diff.messageDiff.changed.length > 0) && (
        <div className="mt-3">
          <div className="text-[11px] font-medium text-gray-700 mb-1">Message flows</div>
          <div className="overflow-x-auto border border-gray-200 rounded">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-2 py-1.5 font-medium">Change</th>
                  <th className="px-2 py-1.5 font-medium">From</th>
                  <th className="px-2 py-1.5 font-medium">To</th>
                  <th className="px-2 py-1.5 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {diff.messageDiff.removed.map((m, i) => (
                  <tr key={`r${i}`} className="border-t border-gray-100">
                    <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">Removed</span></td>
                    <td className="px-2 py-1.5 text-gray-700">{m.from}</td>
                    <td className="px-2 py-1.5 text-gray-700">{m.to}</td>
                    <td className="px-2 py-1.5 text-gray-600">{m.label || "—"}</td>
                  </tr>
                ))}
                {diff.messageDiff.added.map((m, i) => (
                  <tr key={`a${i}`} className="border-t border-gray-100">
                    <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700">Added</span></td>
                    <td className="px-2 py-1.5 text-gray-700">{m.from}</td>
                    <td className="px-2 py-1.5 text-gray-700">{m.to}</td>
                    <td className="px-2 py-1.5 text-gray-600">{m.label || "—"}</td>
                  </tr>
                ))}
                {diff.messageDiff.changed.map((m, i) => (
                  <tr key={`c${i}`} className="border-t border-gray-100">
                    <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">Changed</span></td>
                    <td className="px-2 py-1.5 text-gray-700">{m.from}</td>
                    <td className="px-2 py-1.5 text-gray-700">{m.to}</td>
                    <td className="px-2 py-1.5"><span className="text-gray-400 line-through">{m.a || "—"}</span><span className="text-gray-400"> → </span><span className="text-gray-900 font-medium">{m.b || "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Intermediate + boundary events */}
      {(diff.eventDiff.added.length > 0 || diff.eventDiff.removed.length > 0 || diff.eventDiff.changed.length > 0) && (
        <div className="mt-3">
          <div className="text-[11px] font-medium text-gray-700 mb-1">Intermediate &amp; boundary events</div>
          <div className="overflow-x-auto border border-gray-200 rounded">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-2 py-1.5 font-medium">Change</th>
                  <th className="px-2 py-1.5 font-medium">Kind</th>
                  <th className="px-2 py-1.5 font-medium">Where</th>
                  <th className="px-2 py-1.5 font-medium">Trigger</th>
                </tr>
              </thead>
              <tbody>
                {diff.eventDiff.removed.map((e, i) => (
                  <tr key={`er${i}`} className="border-t border-gray-100">
                    <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">Removed</span></td>
                    <td className="px-2 py-1.5 text-gray-600">{e.kind === "boundary" ? "Boundary" : "Intermediate"}</td>
                    <td className="px-2 py-1.5 text-gray-700">{e.kind === "boundary" ? `on ${e.host}` : (e.label || "(inline)")}</td>
                    <td className="px-2 py-1.5 text-gray-600">{eventTrigger(e)}</td>
                  </tr>
                ))}
                {diff.eventDiff.added.map((e, i) => (
                  <tr key={`ea${i}`} className="border-t border-gray-100">
                    <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700">Added</span></td>
                    <td className="px-2 py-1.5 text-gray-600">{e.kind === "boundary" ? "Boundary" : "Intermediate"}</td>
                    <td className="px-2 py-1.5 text-gray-700">{e.kind === "boundary" ? `on ${e.host}` : (e.label || "(inline)")}</td>
                    <td className="px-2 py-1.5 text-gray-900 font-medium">{eventTrigger(e)}</td>
                  </tr>
                ))}
                {diff.eventDiff.changed.map((e, i) => (
                  <tr key={`ec${i}`} className="border-t border-gray-100">
                    <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">Changed</span></td>
                    <td className="px-2 py-1.5 text-gray-600">{e.kind === "boundary" ? "Boundary" : "Intermediate"}</td>
                    <td className="px-2 py-1.5 text-gray-700">{e.kind === "boundary" ? `on ${e.where}` : (e.where || "(inline)")}</td>
                    <td className="px-2 py-1.5"><span className="text-gray-400 line-through">{e.a}</span><span className="text-gray-400"> → </span><span className="text-gray-900 font-medium">{e.b}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Automation changes */}
      {diff.automationChanges.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-medium text-gray-700 mb-1">Automation changes</div>
          <div className="overflow-x-auto border border-indigo-100 rounded bg-indigo-50/40">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="text-gray-600 text-left">
                  <th className="px-2 py-1.5 font-medium">Activity</th>
                  <th className="px-2 py-1.5 font-medium">Marker</th>
                  <th className="px-2 py-1.5 font-medium">What it signals</th>
                </tr>
              </thead>
              <tbody>
                {diff.automationChanges.map((c, i) => (
                  <tr key={i} className="border-t border-indigo-100">
                    <td className="px-2 py-1.5 text-gray-900">{c.activity}</td>
                    <td className="px-2 py-1.5 text-gray-600">{c.from} → <span className="text-gray-900 font-medium">{c.to}</span></td>
                    <td className="px-2 py-1.5 text-indigo-700">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aiSummary && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded text-[11px] text-gray-800">
          <div className="font-medium text-blue-800 mb-1">AI summary</div>
          <MarkdownLite text={aiSummary} />
        </div>
      )}
    </>
  );
}
