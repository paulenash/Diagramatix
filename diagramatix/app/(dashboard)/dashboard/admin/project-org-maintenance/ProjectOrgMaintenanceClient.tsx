"use client";

/**
 * Project Org Maintenance (SuperAdmin). Re-home a project under a different owning
 * Org. Flow: pick a project from a filterable, collapsible Org → Project tree →
 * pick the new Org from a type-ahead list → Confirm to run the re-home + the two
 * Risk & Control renumbers (new org required, old org tidied). Accented with the
 * Risk & Control feature colour.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFeatureColors } from "@/app/lib/theme/useFeatureColors";

export interface OrgWithProjects {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
}

type SelectedProject = { id: string; name: string; orgId: string; orgName: string };
type RenumberResult = { groups: number; items: number; diagrams: number };
type RehomeResult = {
  project: { id: string; name: string };
  newOrg: { id: string; name: string; result: RenumberResult };
  oldOrg: { id: string; name: string; result: RenumberResult } | null;
};

export function ProjectOrgMaintenanceClient({ orgs: initialOrgs }: { orgs: OrgWithProjects[] }) {
  const scheme = useFeatureColors();
  const rc = scheme.colors.riskControl;

  const [orgs, setOrgs] = useState(initialOrgs);
  const [orgFilter, setOrgFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<SelectedProject | null>(null);

  const [newOrgQuery, setNewOrgQuery] = useState("");
  const [newOrg, setNewOrg] = useState<{ id: string; name: string } | null>(null);
  const [showOrgList, setShowOrgList] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RehomeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Step 1: filtered, collapsible Org → Project tree ──────────────────────
  const of = orgFilter.trim().toLowerCase();
  const pf = projectFilter.trim().toLowerCase();
  const tree = useMemo(() => {
    return orgs
      .map((o) => {
        const projects = pf ? o.projects.filter((p) => p.name.toLowerCase().includes(pf)) : o.projects;
        return { ...o, projects };
      })
      .filter((o) => {
        const orgMatch = !of || o.name.toLowerCase().includes(of);
        // When a project filter is active, keep only orgs that still have a match.
        return orgMatch && (!pf || o.projects.length > 0);
      });
  }, [orgs, of, pf]);

  const isOpen = (orgId: string) => expanded.has(orgId) || !!pf; // project filter auto-expands
  const toggle = (orgId: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(orgId) ? n.delete(orgId) : n.add(orgId); return n; });

  const pickProject = (o: OrgWithProjects, p: { id: string; name: string }) => {
    setSelected({ id: p.id, name: p.name, orgId: o.id, orgName: o.name });
    setNewOrg(null); setNewOrgQuery(""); setResult(null); setError(null);
  };

  // ── Step 2: type-ahead new-Org list (excludes the current owner) ──────────
  const nq = newOrgQuery.trim().toLowerCase();
  const orgCandidates = useMemo(() => {
    if (!selected) return [];
    return orgs
      .filter((o) => o.id !== selected.orgId)
      .filter((o) => !nq || o.name.toLowerCase().includes(nq))
      .slice(0, 50);
  }, [orgs, selected, nq]);

  const canConfirm = !!selected && !!newOrg && !submitting;

  async function confirm() {
    if (!selected || !newOrg) return;
    setSubmitting(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/admin/project-org-maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selected.id, newOrgId: newOrg.id }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Re-home failed"); return; }
      setResult(json as RehomeResult);
      // Reflect the move locally: shift the project between orgs in the tree.
      setOrgs((prev) => prev.map((o) => {
        if (o.id === selected.orgId) return { ...o, projects: o.projects.filter((p) => p.id !== selected.id) };
        if (o.id === newOrg.id) return { ...o, projects: [...o.projects, { id: selected.id, name: selected.name }].sort((a, b) => a.name.localeCompare(b.name)) };
        return o;
      }));
      setSelected(null); setNewOrg(null); setNewOrgQuery("");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function cancel() {
    setSelected(null); setNewOrg(null); setNewOrgQuery(""); setError(null); setResult(null);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: rc.text }}>Project Org Maintenance</h1>
          <p className="text-xs text-gray-500 mt-0.5">Re-home a project under a different owning Org.</p>
        </div>
        <Link href="/dashboard/admin" className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">← SuperAdmin Tools</Link>
      </div>

      {/* Reminder — what re-homing affects */}
      <div className="rounded-md border p-4 mb-6 text-[13px] leading-relaxed"
           style={{ background: rc.bg, color: rc.text, borderColor: rc.text }}>
        <p className="font-semibold mb-1">What happens when you re-home a project</p>
        <p className="mb-2">The owning <strong>Org Owner</strong> drives org-wide Risk &amp; Control code numbering and the compliance roll-up. Moving a project changes the catalog of <em>both</em> orgs, so on Confirm this will:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Set the project&rsquo;s Org Owner to the new Org.</li>
          <li><strong>Renumber the new Org</strong> (required) — the moved risks/controls are integrated into that org&rsquo;s single code sequence, resolving any duplicate codes.</li>
          <li><strong>Renumber the old Org</strong> (tidy) — closing the gaps the departed items leave behind.</li>
          <li>Re-home the project&rsquo;s <strong>compliance evidence</strong> — its mining runs now roll up under the new Org&rsquo;s Compliance Monitoring.</li>
          <li>Update the cached codes on diagram attachments. Traceability links are keyed by id and are <strong>preserved</strong>.</li>
        </ul>
        <p className="mt-2 text-[12px] opacity-80">SuperAdmin only. The action is recorded in the Audit Log.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* ── Step 1 — choose a project ── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-800 mb-2">1 · Choose a project</h2>
          <div className="flex gap-2 mb-2">
            <input value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} placeholder="Filter orgs…"
                   className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-gray-400" />
            <input value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} placeholder="Filter projects…"
                   className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-gray-400" />
          </div>
          <div className="border border-gray-200 rounded max-h-[420px] overflow-auto divide-y divide-gray-100">
            {tree.length === 0 && <p className="text-xs text-gray-400 italic px-3 py-3">No orgs match.</p>}
            {tree.map((o) => (
              <div key={o.id}>
                <button onClick={() => toggle(o.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50">
                  <span className="text-xs font-medium text-gray-800 truncate">
                    <span className="inline-block w-3 text-gray-400">{isOpen(o.id) ? "▾" : "▸"}</span> {o.name}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">{o.projects.length}</span>
                </button>
                {isOpen(o.id) && (
                  <div className="pl-6 pr-2 pb-1">
                    {o.projects.length === 0
                      ? <p className="text-[11px] text-gray-400 italic px-2 py-1">No projects.</p>
                      : o.projects.map((p) => {
                          const sel = selected?.id === p.id;
                          return (
                            <button key={p.id} onClick={() => pickProject(o, p)}
                                    className="w-full text-left text-xs rounded px-2 py-1 my-0.5 truncate"
                                    style={sel ? { background: rc.bg, color: rc.text, fontWeight: 600 } : undefined}>
                              {p.name}
                            </button>
                          );
                        })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Step 2 — choose the new org ── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-800 mb-2">2 · Choose the new Org</h2>
          {!selected ? (
            <p className="text-xs text-gray-400 italic border border-dashed border-gray-200 rounded px-3 py-6 text-center">
              Choose a project first.
            </p>
          ) : (
            <>
              <div className="text-xs text-gray-600 mb-2">
                Moving <strong className="text-gray-900">{selected.name}</strong> from <strong>{selected.orgName}</strong>.
              </div>
              <div className="relative">
                <input
                  value={newOrgQuery}
                  onChange={(e) => { setNewOrgQuery(e.target.value); setNewOrg(null); setShowOrgList(true); }}
                  onFocus={() => setShowOrgList(true)}
                  placeholder="Type the new Org name…"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-gray-400"
                />
                {showOrgList && !newOrg && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-56 overflow-auto">
                    {orgCandidates.length === 0
                      ? <p className="text-[11px] text-gray-400 italic px-3 py-2">No matching Orgs.</p>
                      : orgCandidates.map((o) => (
                          <button key={o.id}
                                  onClick={() => { setNewOrg({ id: o.id, name: o.name }); setNewOrgQuery(o.name); setShowOrgList(false); }}
                                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50 truncate">
                            {o.name}
                          </button>
                        ))}
                  </div>
                )}
              </div>

              {/* ── Step 3 — confirm / cancel ── */}
              {newOrg && (
                <div className="mt-4 rounded-md border border-gray-200 p-3">
                  <p className="text-xs text-gray-700 mb-3">
                    Move <strong className="text-gray-900">{selected.name}</strong> from <strong>{selected.orgName}</strong> to{" "}
                    <strong style={{ color: rc.text }}>{newOrg.name}</strong> and renumber both Orgs?
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={confirm} disabled={!canConfirm}
                            className="text-xs rounded px-3 py-1.5 text-white disabled:opacity-50"
                            style={{ background: rc.text }}>
                      {submitting ? "Working…" : "Confirm"}
                    </button>
                    <button onClick={cancel} disabled={submitting}
                            className="text-xs rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

          {result && (
            <div className="mt-4 rounded-md border p-3 text-xs" style={{ background: rc.bg, color: rc.text, borderColor: rc.text }}>
              <p className="font-semibold mb-1">✓ Re-homed “{result.project.name}”.</p>
              <p><strong>{result.newOrg.name}</strong> (new): renumbered {result.newOrg.result.items} items across {result.newOrg.result.diagrams} diagrams.</p>
              {result.oldOrg && (
                <p><strong>{result.oldOrg.name}</strong> (old): renumbered {result.oldOrg.result.items} items across {result.oldOrg.result.diagrams} diagrams.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
