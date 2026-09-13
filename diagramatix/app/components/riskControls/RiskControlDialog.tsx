"use client";

import { useEffect, useState } from "react";
import { ListPopup } from "@/app/components/ListPopup";
import type { RiskControlLibraryDTO } from "@/app/lib/riskControls/types";
import { riskScore } from "@/app/lib/riskControls/types";

/**
 * The Project-menu launcher for Risk & Controls.
 *
 * Paul, 2026-09-14: "Move Risk & Controls to Project menu. It should open a
 * popup screen with a scrollable list of the current Risks and Controls
 * functionality and options and a Continue button at the bottom right outside
 * the scrollable region." And: "I think Risk & Controls is able to be entered
 * from 2 places on the Project Menu … have only one way of getting to this
 * functionality." There were three — a header button, a sidebar row and (via
 * the console itself) the tabs. This is now the one door: it shows what the
 * library currently holds and offers the console's functions, and the console
 * opens from here on the tab you chose.
 */
export function RiskControlDialog({
  projectId, projectName, onOpenConsole, onClose,
}: {
  projectId: string;
  projectName?: string;
  onOpenConsole: (tab: "editor" | "analytics") => void;
  onClose: () => void;
}) {
  const basePath = `/api/projects/${projectId}/risk-controls`;
  const [library, setLibrary] = useState<RiskControlLibraryDTO | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let on = true;
    fetch(basePath)
      .then((r) => r.json().catch(() => ({ library: null })))
      .then((j) => { if (on) setLibrary(j.library ?? null); })
      .catch(() => {})
      .finally(() => { if (on) setLoaded(true); });
    return () => { on = false; };
  }, [basePath]);

  const risks = library?.items.filter((i) => i.kind === "Risk") ?? [];
  const controls = library?.items.filter((i) => i.kind === "Control") ?? [];
  const controlOf = new Set(library?.links.map((l) => l.targetId) ?? []);
  const uncovered = risks.filter((r) => !library!.links.some((l) => l.targetId === r.id && controls.some((c) => c.id === l.sourceId)));
  void controlOf;

  const option = "w-full flex items-center justify-between px-3 py-2 text-xs rounded border border-blue-200 text-blue-800 hover:bg-blue-50 text-left";

  return (
    <ListPopup
      title="Risk & Controls"
      subtitle={library
        ? `${library.name} — ${risks.length} risk${risks.length === 1 ? "" : "s"}, ${controls.length} control${controls.length === 1 ? "" : "s"}, ${library.links.length} link${library.links.length === 1 ? "" : "s"}${uncovered.length ? ` · ${uncovered.length} coverage gap${uncovered.length === 1 ? "" : "s"}` : ""}`
        : projectName ?? "This project"}
      onContinue={onClose}
      width="max-w-2xl"
    >
      {/* Functionality — every door the console has, in one place. */}
      <div className="space-y-1.5 mb-4">
        <button onClick={() => onOpenConsole("editor")} className={option}
          title="Adopt or create the library; edit Risks, Controls, Policies, Regulations, Findings, KRIs and KPIs and their traceability">
          <span>◆ Catalog <span className="text-gray-400 ml-1">— adopt, create, edit the library</span></span>
          <span className="text-blue-500">open ⤢</span>
        </button>
        <button onClick={() => onOpenConsole("analytics")} className={option}
          title="Coverage, ratings and control operating-effectiveness from this project's mining conformance">
          <span>📊 Analytics <span className="text-gray-400 ml-1">— coverage, ratings, effectiveness</span></span>
          <span className="text-blue-500">open ⤢</span>
        </button>
        {library && (
          <a href={`${basePath}/export`} className={option} title="Download the Risk-Control Matrix as a spreadsheet">
            <span>⭳ Export Risk-Control Matrix</span>
            <span className="text-blue-500">.xlsx</span>
          </a>
        )}
      </div>

      {/* The current risks and controls. */}
      {!loaded ? (
        <p className="text-[11px] text-gray-400">Loading…</p>
      ) : !library ? (
        <p className="text-[11px] text-gray-500 italic">No Risk &amp; Control library in this project yet. Open the Catalog to adopt one from your organisation or create an empty one.</p>
      ) : (
        <div className="space-y-4">
          <section>
            <h4 className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1">Risks ({risks.length})</h4>
            {risks.length === 0 ? <p className="text-[11px] text-gray-400 italic">None yet.</p> : (
              <ul className="divide-y divide-gray-100">
                {risks.map((r) => {
                  const score = riskScore(r);
                  return (
                    <li key={r.id} className="flex items-center gap-2 py-1 text-xs">
                      <span className="font-mono text-[10px] text-gray-400 shrink-0 w-16 truncate">{r.code}</span>
                      <span className="flex-1 min-w-0 truncate text-gray-800" title={r.description ?? r.name}>{r.name}</span>
                      {r.riskCategory && <span className="text-[9px] text-gray-400 shrink-0">{r.riskCategory}</span>}
                      {score != null && <span className="text-[9px] shrink-0 rounded px-1 border border-gray-200 text-gray-600" title="Inherent score — likelihood × impact">{score}</span>}
                      {uncovered.some((u) => u.id === r.id) && <span className="text-[8px] uppercase text-amber-700 bg-amber-50 border border-amber-300 rounded px-1 shrink-0" title="No control is linked to this risk">gap</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section>
            <h4 className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1">Controls ({controls.length})</h4>
            {controls.length === 0 ? <p className="text-[11px] text-gray-400 italic">None yet.</p> : (
              <ul className="divide-y divide-gray-100">
                {controls.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-1 text-xs">
                    <span className="font-mono text-[10px] text-gray-400 shrink-0 w-16 truncate">{c.code}</span>
                    <span className="flex-1 min-w-0 truncate text-gray-800" title={c.description ?? c.name}>{c.name}</span>
                    {c.controlType && <span className="text-[9px] text-gray-400 shrink-0">{c.controlType}</span>}
                    {c.automation && <span className="text-[9px] text-gray-400 shrink-0">{c.automation}</span>}
                    {c.owner && <span className="text-[9px] text-gray-500 shrink-0 truncate max-w-[10rem]" title={`Owner: ${c.owner}`}>{c.owner}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </ListPopup>
  );
}
