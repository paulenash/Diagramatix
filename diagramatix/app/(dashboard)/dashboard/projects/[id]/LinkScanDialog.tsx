"use client";

import { useEffect, useMemo, useState } from "react";

interface ExistingLink {
  parentDiagramId: string;
  parentDiagramName: string;
  parentElementId: string;
  parentElementLabel: string;
  childDiagramId: string;
  childDiagramName: string;
}

interface Candidate {
  parentDiagramId: string;
  parentDiagramName: string;
  parentElementId: string;
  parentElementLabel: string;
  candidateDiagramId: string;
  candidateDiagramName: string;
}

interface ScanResult {
  existingLinks: ExistingLink[];
  definiteCandidates: Candidate[];
  probableCandidates: Candidate[];
  diagramCount: number;
}

interface Props {
  projectId: string;
  onClose: () => void;
  onApplied: () => void;
}

const candidateKey = (c: Candidate) =>
  `${c.parentDiagramId}::${c.parentElementId}::${c.candidateDiagramId}`;

const existingKey = (e: ExistingLink) =>
  `${e.parentDiagramId}::${e.parentElementId}`;

export function LinkScanDialog({ projectId, onClose, onApplied }: Props) {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Selection state.
  // - addSelected: candidate keys the user wants to add (definites all on by default, probables off).
  // - removeSelected: existingLink keys the user wants to remove.
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());
  const [removeSelected, setRemoveSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/projects/${projectId}/scan-links`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.text()) || r.statusText);
        return r.json();
      })
      .then((data: ScanResult) => {
        setScan(data);
        // Default: every definite candidate selected, no probables, no removes.
        setAddSelected(new Set(data.definiteCandidates.map(candidateKey)));
        setRemoveSelected(new Set());
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [projectId]);

  const definite = scan?.definiteCandidates ?? [];
  const probable = scan?.probableCandidates ?? [];
  const existing = scan?.existingLinks ?? [];

  const totalToAdd = addSelected.size;
  const totalToRemove = removeSelected.size;
  const canConfirm = !busy && (totalToAdd + totalToRemove > 0);

  // Group candidates by parent diagram for display.
  const definiteByParent = useMemo(() => groupByParent(definite), [definite]);
  const probableByParent = useMemo(() => groupByParent(probable), [probable]);
  const existingByParent = useMemo(() => {
    const m = new Map<string, ExistingLink[]>();
    for (const e of existing) {
      const list = m.get(e.parentDiagramName) ?? [];
      list.push(e);
      m.set(e.parentDiagramName, list);
    }
    return m;
  }, [existing]);

  function toggleAdd(c: Candidate) {
    setAddSelected((prev) => {
      const k = candidateKey(c);
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleRemove(e: ExistingLink) {
    setRemoveSelected((prev) => {
      const k = existingKey(e);
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function handleConfirm() {
    if (!scan) return;
    setBusy(true);
    setError("");
    try {
      const adds = [...definite, ...probable]
        .filter((c) => addSelected.has(candidateKey(c)))
        .map((c) => ({
          parentDiagramId: c.parentDiagramId,
          parentElementId: c.parentElementId,
          candidateDiagramId: c.candidateDiagramId,
        }));
      const removes = existing
        .filter((e) => removeSelected.has(existingKey(e)))
        .map((e) => ({
          parentDiagramId: e.parentDiagramId,
          parentElementId: e.parentElementId,
        }));

      const res = await fetch(`/api/projects/${projectId}/scan-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adds, removes }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setError(`Apply failed: ${txt || res.statusText}`);
        return;
      }
      onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Scan Diagrams for Links</h2>
          <p className="text-xs text-gray-500 mt-1">
            Find subprocesses in this project&apos;s BPMN diagrams whose name matches another
            diagram in the project. Confirmed links navigate parent → child on double-click,
            and a return marker is placed on the child diagram pointing back to the parent.
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-h-0">
          {loading && <p className="text-sm text-gray-500">Scanning project diagrams…</p>}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}

          {!loading && scan && (
            <>
              <p className="text-xs text-gray-500">
                Scanned {scan.diagramCount} BPMN diagram{scan.diagramCount === 1 ? "" : "s"}.
                Found {existing.length} existing link{existing.length === 1 ? "" : "s"},
                {" "}{definite.length} definite candidate{definite.length === 1 ? "" : "s"},
                {" "}{probable.length} probable candidate{probable.length === 1 ? "" : "s"}.
              </p>

              {/* Existing links */}
              <Section
                title={`Existing Links (${existing.length})`}
                subtitle="Already linked. Tick to remove the link and its return marker."
                accent="blue"
              >
                {existing.length === 0 ? (
                  <p className="text-xs text-gray-400 italic px-1">None.</p>
                ) : (
                  Array.from(existingByParent.entries()).map(([parentName, items]) => (
                    <div key={parentName} className="mb-2">
                      <div className="text-xs font-medium text-gray-700 px-1">{parentName}</div>
                      {items.map((e) => {
                        const k = existingKey(e);
                        const checked = removeSelected.has(k);
                        return (
                          <label
                            key={k}
                            className={`flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-gray-50 cursor-pointer ${checked ? "bg-red-50" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRemove(e)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-gray-700 flex-1 truncate">
                              <span className="font-medium">{e.parentElementLabel || "(unnamed)"}</span>
                              <span className="text-gray-400 mx-1">→</span>
                              <span>{e.childDiagramName}</span>
                            </span>
                            {checked && <span className="text-[10px] text-red-700 shrink-0">will remove</span>}
                          </label>
                        );
                      })}
                    </div>
                  ))
                )}
              </Section>

              {/* Definite candidates */}
              <Section
                title={`Definite Candidates (${definite.length})`}
                subtitle="Subprocess name matches a diagram name exactly. Ticked by default."
                accent="green"
              >
                {definite.length === 0 ? (
                  <p className="text-xs text-gray-400 italic px-1">None.</p>
                ) : (
                  Array.from(definiteByParent.entries()).map(([parentName, items]) => (
                    <div key={parentName} className="mb-2">
                      <div className="text-xs font-medium text-gray-700 px-1">{parentName}</div>
                      {items.map((c) => {
                        const k = candidateKey(c);
                        const checked = addSelected.has(k);
                        return (
                          <label
                            key={k}
                            className={`flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-gray-50 cursor-pointer ${checked ? "bg-green-50" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAdd(c)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-gray-700 flex-1 truncate">
                              <span className="font-medium">{c.parentElementLabel}</span>
                              <span className="text-gray-400 mx-1">→</span>
                              <span>{c.candidateDiagramName}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))
                )}
              </Section>

              {/* Probable candidates */}
              <Section
                title={`Probable Candidates (${probable.length})`}
                subtitle="Names are similar but not identical. Tick the ones you want to link."
                accent="amber"
              >
                {probable.length === 0 ? (
                  <p className="text-xs text-gray-400 italic px-1">None.</p>
                ) : (
                  Array.from(probableByParent.entries()).map(([parentName, items]) => (
                    <div key={parentName} className="mb-2">
                      <div className="text-xs font-medium text-gray-700 px-1">{parentName}</div>
                      {items.map((c) => {
                        const k = candidateKey(c);
                        const checked = addSelected.has(k);
                        return (
                          <label
                            key={k}
                            className={`flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-gray-50 cursor-pointer ${checked ? "bg-amber-50" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAdd(c)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-gray-700 flex-1 truncate">
                              <span className="font-medium">{c.parentElementLabel}</span>
                              <span className="text-gray-400 mx-1">≈</span>
                              <span>{c.candidateDiagramName}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))
                )}
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 shrink-0 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {totalToAdd > 0 && <>+{totalToAdd} to add</>}
            {totalToAdd > 0 && totalToRemove > 0 && <> · </>}
            {totalToRemove > 0 && <>−{totalToRemove} to remove</>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Applying…" : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function groupByParent(cands: Candidate[]): Map<string, Candidate[]> {
  const m = new Map<string, Candidate[]>();
  for (const c of cands) {
    const list = m.get(c.parentDiagramName) ?? [];
    list.push(c);
    m.set(c.parentDiagramName, list);
  }
  return m;
}

function Section({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  accent: "green" | "amber" | "blue";
  children: React.ReactNode;
}) {
  const accentClass =
    accent === "green" ? "border-green-300" :
    accent === "amber" ? "border-amber-300" :
    "border-blue-300";
  const titleClass =
    accent === "green" ? "text-green-700" :
    accent === "amber" ? "text-amber-700" :
    "text-blue-700";
  return (
    <section className={`border ${accentClass} rounded-md`}>
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
        <div className={`text-xs font-semibold ${titleClass}`}>{title}</div>
        <div className="text-[10px] text-gray-500">{subtitle}</div>
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}
