"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UserGuideLink } from "@/app/components/UserGuideLink";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { PromptUsageSummary } from "./PromptUsageSummary";

interface Prompt {
  id: string;
  name: string;
  text: string;
  diagramType: string;
  createdAt: string;
  updatedAt: string;
  /** Present only on prompts read through the org-wide (admin) endpoint. */
  ownerId?: string;
  ownerLabel?: string;
  /** "typed" | "dictated" | null. NULL means NOT RECORDED — every prompt saved
   *  before this existed is genuinely unknown, and showing those as "typed"
   *  would be inventing a fact about how somebody worked. */
  source?: string | null;
  /** When the clarifying-questions Refine pass last contributed to the text. */
  refinedAt?: string | null;
  /** Written against an image. The image is not kept — this says where the
   *  words came from, not that there is a file to open. */
  fromImage?: boolean;
  modelUsed?: string | null;
  lastUsedAt?: string | null;
  useCount?: number;
  /** Set when the prompt carries an edited two-phase plan. A prompt with one
   *  re-applies with NO AI call, which is the most useful thing about it. */
  planUpdatedAt?: string | null;
}

/** The attribute filters. "any" means the filter is off. */
type Tri = "any" | "yes" | "no";
interface AttrFilter {
  source: "any" | "typed" | "dictated" | "unrecorded";
  refined: Tri;
  image: Tri;
  plan: Tri;
  used: "any" | "used" | "never";
  /** ISO yyyy-mm-dd, inclusive. Empty = open-ended. */
  createdFrom: string;
  createdTo: string;
  modifiedFrom: string;
  modifiedTo: string;
}

const NO_FILTERS: AttrFilter = {
  source: "any", refined: "any", image: "any", plan: "any", used: "any",
  createdFrom: "", createdTo: "", modifiedFrom: "", modifiedTo: "",
};

/** dd/mm/yyyy — the format the rest of the product uses. */
function shortDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const triMatch = (f: Tri, v: boolean) => f === "any" || (f === "yes") === v;

/** Inclusive to the END of the "to" day — a date range that silently excluded
 *  everything saved after midnight would be quietly wrong all day. */
function inRange(iso: string | undefined | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && t > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
}

const DIAGRAM_TYPES: { value: string; label: string }[] = [
  { value: "bpmn", label: "BPMN" },
  { value: "epc", label: "EPC" },
  { value: "state-machine", label: "State Machine" },
  { value: "value-chain", label: "Value Chain" },
  { value: "domain", label: "Domain Model" },
  { value: "context", label: "Context Diagram" },
  { value: "process-context", label: "Process Context" },
  { value: "archimate", label: "ArchiMate" },
  { value: "flowchart", label: "Standard Flowchart" },
];

/** A branch of the tree: the User's own, or one colleague's under Org. */
interface Group {
  key: string;
  label: string;
  items: Prompt[];
  /** Someone else's — deleting these needs the org-admin door. */
  foreign: boolean;
}

export function PromptMaintenance() {
  // Back link honours ?from= so this same UI serves the user dashboard,
  // the OrgAdmin area, and the SuperAdmin area. Reject protocol-relative URLs (SEC-15).
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get("from");
  const backHref = rawFrom && rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/dashboard";
  const backLabel = backHref === "/dashboard/admin"
    ? "SuperAdmin"
    : backHref === "/dashboard/org-admin"
      ? "OrgAdmin"
      : backHref.startsWith("/diagram/")
        ? "Diagram"
        : "Dashboard";

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  /**
   * Everybody else's prompts, when the caller may see them.
   *
   * Whether they MAY is discovered by CALLING the gated endpoint rather than by
   * asking separately what role they hold. A parallel claim about permission is
   * a claim that can disagree with the gate — this way the branch appears
   * exactly when the API will serve it.
   */
  const [orgPrompts, setOrgPrompts] = useState<Prompt[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState("bpmn");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  // ── Filter, selection, and which branches are open ──────────────────────
  const [filter, setFilter] = useState("");
  const [attr, setAttr] = useState<AttrFilter>(NO_FILTERS);
  const [attrOpen, setAttrOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{ ids: string[]; label: string } | null>(null);
  const [busyBulk, setBusyBulk] = useState(false);

  const loadPrompts = useCallback(async () => {
    try {
      const res = await fetch("/api/prompts");
      if (res.ok) setPrompts(await res.json());
    } catch { /* ignore */ }
    // 403 here is the ordinary case, not a failure: most people are not an
    // OrgAdmin, and they simply do not get the Org branch.
    try {
      const res = await fetch("/api/prompts/org");
      setOrgPrompts(res.ok ? await res.json() : null);
    } catch { setOrgPrompts(null); }
    setLoading(false);
  }, []);

  useEffect(() => { loadPrompts(); }, [loadPrompts]);

  // Deep-link from a diagram's "Generated from: <prompt>" link.
  const focusPromptId = searchParams.get("promptId");
  const [focusDone, setFocusDone] = useState(false);
  useEffect(() => {
    if (focusDone || !focusPromptId || prompts.length === 0) return;
    const p = prompts.find(x => x.id === focusPromptId);
    if (p) { setActiveType(p.diagramType); startEdit(p); }
    setFocusDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPromptId, prompts, focusDone]);

  function startEdit(p: Prompt) {
    setEditingId(p.id); setEditName(p.name); setEditText(p.text); setShowNew(false);
  }
  function cancelEdit() {
    setEditingId(null); setShowNew(false); setEditName(""); setEditText("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editingId ? `/api/prompts/${editingId}` : "/api/prompts";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), text: editText.trim(), diagramType: activeType }),
      });
      if (res.ok) {
        setMessage({ text: editingId ? "Prompt saved" : "Prompt created", type: "success" });
        cancelEdit(); await loadPrompts();
      } else {
        setMessage({ text: (await res.json().catch(() => ({}))).error ?? "Save failed", type: "error" });
      }
    } catch { setMessage({ text: "Network error", type: "error" }); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const foreign = !prompts.some(p => p.id === id);
    try {
      const res = foreign
        ? await fetch("/api/prompts/org", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [id] }),
          })
        : await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      if (res.ok) { setMessage({ text: "Prompt deleted", type: "success" }); await loadPrompts(); }
      else setMessage({ text: "Delete failed", type: "error" });
    } catch { setMessage({ text: "Network error", type: "error" }); }
    setConfirmDeleteId(null);
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  // ── The tree for the active diagram type ────────────────────────────────
  const matches = useCallback((p: Prompt) => {
    const q = filter.trim().toLowerCase();
    // Title OR contents — someone looking for a prompt usually remembers a
    // phrase from inside it, not what they called it.
    if (q && !(p.name.toLowerCase().includes(q) || p.text.toLowerCase().includes(q))) return false;

    // Each attribute filters in the way its TYPE allows: a flag is yes/no, a
    // timestamp is a range, and "how it was written" has a third answer —
    // not recorded — which is not the same as "typed".
    if (attr.source !== "any") {
      const actual = p.source ?? "unrecorded";
      if (actual !== attr.source) return false;
    }
    if (!triMatch(attr.refined, !!p.refinedAt)) return false;
    if (!triMatch(attr.image, !!p.fromImage)) return false;
    if (!triMatch(attr.plan, !!p.planUpdatedAt)) return false;
    if (attr.used !== "any") {
      const used = (p.useCount ?? 0) > 0;
      if ((attr.used === "used") !== used) return false;
    }
    if (!inRange(p.createdAt, attr.createdFrom, attr.createdTo)) return false;
    if (!inRange(p.updatedAt, attr.modifiedFrom, attr.modifiedTo)) return false;
    return true;
  }, [filter, attr]);

  const attrActive =
    attr.source !== "any" || attr.refined !== "any" || attr.image !== "any" ||
    attr.plan !== "any" || attr.used !== "any" ||
    !!(attr.createdFrom || attr.createdTo || attr.modifiedFrom || attr.modifiedTo);

  const groups = useMemo<Group[]>(() => {
    const mine = prompts.filter(p => p.diagramType === activeType && matches(p));
    const out: Group[] = [{ key: "user", label: "User", items: mine, foreign: false }];

    if (orgPrompts) {
      const mineIds = new Set(prompts.map(p => p.id));
      // Everyone ELSE. My own prompts are the User branch; listing them again
      // under Org would make the two branches overlap, and a count that
      // double-counts is a count nobody can act on.
      const others = orgPrompts.filter(p => p.diagramType === activeType && !mineIds.has(p.id) && matches(p));
      const byOwner = new Map<string, Prompt[]>();
      for (const p of others) {
        const k = p.ownerId ?? "unknown";
        (byOwner.get(k) ?? byOwner.set(k, []).get(k)!).push(p);
      }
      for (const [ownerId, items] of [...byOwner.entries()].sort(
        (a, b) => (a[1][0].ownerLabel ?? "").localeCompare(b[1][0].ownerLabel ?? ""),
      )) {
        out.push({ key: `org:${ownerId}`, label: items[0].ownerLabel ?? "(unknown)", items, foreign: true });
      }
    }
    return out;
  }, [prompts, orgPrompts, activeType, matches]);

  const visibleIds = useMemo(() => groups.flatMap(g => g.items.map(i => i.id)), [groups]);
  const selectedVisible = useMemo(() => visibleIds.filter(id => selected.has(id)), [visibleIds, selected]);
  const orgCount = groups.filter(g => g.foreign).reduce((n, g) => n + g.items.length, 0);

  // Switching type or changing the filter clears the selection. Carrying a
  // selection across a filter change is how somebody deletes a prompt they
  // cannot currently see.
  useEffect(() => { setSelected(new Set()); }, [activeType, filter, attr]);

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleGroup = (g: Group) => setSelected(prev => {
    const n = new Set(prev);
    const all = g.items.every(i => n.has(i.id));
    for (const i of g.items) all ? n.delete(i.id) : n.add(i.id);
    return n;
  });
  const toggleOpen = (key: string) => setCollapsed(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
  });

  async function runBulkDelete(ids: string[]) {
    setBusyBulk(true);
    const mineIds = new Set(prompts.map(p => p.id));
    const own = ids.filter(id => mineIds.has(id));
    const foreign = ids.filter(id => !mineIds.has(id));
    let deleted = 0;
    try {
      // Two doors, because they are two different permissions: your own
      // prompts, and — for an OrgAdmin — a colleague's.
      if (own.length) {
        const r = await fetch("/api/prompts/bulk-delete", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: own }),
        });
        if (r.ok) deleted += (await r.json()).deleted ?? 0;
      }
      if (foreign.length) {
        const r = await fetch("/api/prompts/org", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: foreign }),
        });
        if (r.ok) deleted += (await r.json()).deleted ?? 0;
      }
      setMessage(
        deleted === ids.length
          ? { text: `Deleted ${deleted} prompt${deleted === 1 ? "" : "s"}`, type: "success" }
          // Say what did NOT happen. A count that silently falls short reads as
          // success to anyone who does not compare it with what they asked for.
          : { text: `Deleted ${deleted} of ${ids.length} — the rest could not be removed`, type: "error" },
      );
      setSelected(new Set());
      await loadPrompts();
    } catch { setMessage({ text: "Network error", type: "error" }); }
    setBusyBulk(false);
    setBulkConfirm(null);
  }

  if (loading) return <div className="p-8 text-gray-500">Loading prompts...</div>;

  const typeLabel = DIAGRAM_TYPES.find(d => d.value === activeType)?.label ?? activeType;

  return (
    // h-screen (not min-h-screen) + min-h-0 on the flex children: the header and
    // the type list stay put and only the prompt list scrolls. With
    // min-h-screen the page itself grew and took the header off the top.
    <div className="h-screen dgx-dashboard-bg flex flex-col overflow-hidden">
      <header className="shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={backHref} className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
            <span>&larr;</span>
            <span className="underline">{backLabel}</span>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">AI Prompt Maintenance</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            {orgPrompts ? "Manage saved prompts across this organisation" : "Manage your saved prompts for AI diagram generation"}
          </p>
          <button
            onClick={() => setSummaryOpen(true)}
            className="text-xs px-2 py-0.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 shrink-0"
            title="How these prompts are actually being used"
          >Summary</button>
          <UserGuideLink className="text-xs text-blue-600 hover:underline shrink-0">User Guide</UserGuideLink>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar — diagram type list. Scrolls on its own so a long list never
            pushes the header off. */}
        <nav className="w-52 shrink-0 bg-white border-r border-gray-200 p-3 overflow-y-auto">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2">Diagram Types</p>
          <div className="space-y-1">
            {DIAGRAM_TYPES.map(dt => {
              const mine = prompts.filter(p => p.diagramType === dt.value).length;
              const all = orgPrompts ? orgPrompts.filter(p => p.diagramType === dt.value).length : mine;
              return (
                <button key={dt.value}
                  onClick={() => { setActiveType(dt.value); cancelEdit(); setMessage(null); }}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs ${
                    activeType === dt.value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {dt.label}
                  <span className="ml-1 text-gray-400">({orgPrompts ? all : mine})</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 p-4 flex flex-col min-h-0">
          <div className="shrink-0">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900">{typeLabel} Prompts</h2>
                <p className="text-[10px] text-gray-400">
                  {groups[0].items.length} yours{orgPrompts ? ` · ${orgCount} from others` : ""}
                  {filter.trim() || attrActive ? " (filtered)" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <input
                    type="search" value={filter} onChange={e => setFilter(e.target.value)}
                    placeholder="Filter by title or contents…"
                    aria-label="Filter prompts by title or contents"
                    className="w-64 text-xs border border-gray-300 rounded px-2 py-1 pr-6 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {filter && (
                    <button onClick={() => setFilter("")} title="Clear filter"
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs px-1">×</button>
                  )}
                </div>
                <button
                  onClick={() => setAttrOpen(v => !v)}
                  aria-expanded={attrOpen}
                  className={`px-2 py-1 text-xs rounded border whitespace-nowrap ${
                    attrActive ? "border-blue-400 bg-blue-50 text-blue-700 font-medium" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >Attributes{attrActive ? " ✓" : ""}</button>
                <button
                  onClick={() => { setShowNew(true); setEditingId(null); setEditName(""); setEditText(""); }}
                  className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 whitespace-nowrap"
                >+ New Prompt</button>
              </div>
            </div>

            {/* Attribute filters. Each one filters in the way its TYPE allows:
                a flag is yes/no, a timestamp is a range, and "how it was
                written" has a third answer — not recorded. */}
            {attrOpen && (
              <div className="mb-3 bg-white border border-gray-200 rounded-lg p-3 grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                <label className="text-[10px] text-gray-600">
                  <span className="block font-medium mb-0.5">Written</span>
                  <select value={attr.source} onChange={e => setAttr(a => ({ ...a, source: e.target.value as AttrFilter["source"] }))}
                    className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 bg-white">
                    <option value="any">Any</option>
                    <option value="typed">Typed</option>
                    <option value="dictated">Dictated</option>
                    {/* Not the same as "typed". Everything saved before this
                        was recorded is genuinely unknown. */}
                    <option value="unrecorded">Not recorded</option>
                  </select>
                </label>

                {([
                  ["refined", "Refined", "Went through the clarifying-questions pass"],
                  ["image", "From an image", "Written against a photo or screenshot"],
                  ["plan", "Has a saved plan", "Re-applies with NO AI call"],
                ] as const).map(([key, label, title]) => (
                  <label key={key} className="text-[10px] text-gray-600" title={title}>
                    <span className="block font-medium mb-0.5">{label}</span>
                    <select value={attr[key]} onChange={e => setAttr(a => ({ ...a, [key]: e.target.value as Tri }))}
                      className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 bg-white">
                      <option value="any">Any</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                ))}

                <label className="text-[10px] text-gray-600" title="Whether a diagram was ever generated from it">
                  <span className="block font-medium mb-0.5">Used</span>
                  <select value={attr.used} onChange={e => setAttr(a => ({ ...a, used: e.target.value as AttrFilter["used"] }))}
                    className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 bg-white">
                    <option value="any">Any</option>
                    <option value="used">Used at least once</option>
                    <option value="never">Never used</option>
                  </select>
                </label>

                {([
                  ["createdFrom", "createdTo", "Created"],
                  ["modifiedFrom", "modifiedTo", "Last modified"],
                ] as const).map(([from, to, label]) => (
                  <div key={label} className="text-[10px] text-gray-600">
                    <span className="block font-medium mb-0.5">{label}</span>
                    <div className="flex items-center gap-1">
                      <input type="date" value={attr[from]} onChange={e => setAttr(a => ({ ...a, [from]: e.target.value }))}
                        aria-label={`${label} from`}
                        className="w-full text-[11px] border border-gray-300 rounded px-1 py-1 bg-white" />
                      <span className="text-gray-400">–</span>
                      <input type="date" value={attr[to]} onChange={e => setAttr(a => ({ ...a, [to]: e.target.value }))}
                        aria-label={`${label} to`}
                        className="w-full text-[11px] border border-gray-300 rounded px-1 py-1 bg-white" />
                    </div>
                  </div>
                ))}

                <div className="col-span-full flex justify-end">
                  <button onClick={() => setAttr(NO_FILTERS)} disabled={!attrActive}
                    className="text-[10px] px-2 py-0.5 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
                    Clear attribute filters
                  </button>
                </div>
              </div>
            )}

            {/* Bulk bar — only once something is selected or filtered, so it is
                never in the way of the ordinary job of editing one prompt. */}
            {(selectedVisible.length > 0 || ((filter.trim() || attrActive) && visibleIds.length > 0)) && (
              <div className="mb-3 flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs">
                <span className="text-amber-800">
                  {selectedVisible.length > 0
                    ? `${selectedVisible.length} selected`
                    : `${visibleIds.length} match${visibleIds.length === 1 ? "" : "es"}`}
                </span>
                {selectedVisible.length > 0 && (
                  <button
                    onClick={() => setBulkConfirm({ ids: selectedVisible, label: `${selectedVisible.length} selected prompt${selectedVisible.length === 1 ? "" : "s"}` })}
                    className="px-2 py-0.5 text-red-700 border border-red-300 rounded hover:bg-red-50 font-medium"
                  >Delete selected</button>
                )}
                {(filter.trim() || attrActive) && visibleIds.length > 0 && (
                  <button
                    onClick={() => setBulkConfirm({ ids: visibleIds, label: `all ${visibleIds.length} filtered prompt${visibleIds.length === 1 ? "" : "s"}` })}
                    className="px-2 py-0.5 text-red-700 border border-red-300 rounded hover:bg-red-50"
                  >Delete all filtered</button>
                )}
                {selectedVisible.length > 0 && (
                  <button onClick={() => setSelected(new Set())}
                    className="px-2 py-0.5 text-gray-600 border border-gray-300 rounded hover:bg-gray-100">Clear</button>
                )}
                <span className="ml-auto text-amber-700">
                  {typeLabel} only — other diagram types are not touched
                </span>
              </div>
            )}

            {message && (
              <div className={`mb-3 px-3 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {message.text}
              </div>
            )}

            {/* New prompt form */}
            {showNew && !editingId && (
              <div className="mb-3 bg-white border border-blue-200 rounded-lg p-3 space-y-2">
                <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide">New {typeLabel} Prompt</p>
                <input
                  type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Prompt name"
                />
                <textarea
                  value={editText} onChange={e => setEditText(e.target.value)} rows={6}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed font-mono"
                  placeholder="Prompt text — describe the diagram you want to generate"
                />
                <div className="flex gap-1.5">
                  <button onClick={handleSave} disabled={saving || !editName.trim() || !editText.trim()}
                    className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                    {saving ? "Creating…" : "Create"}
                  </button>
                  <button onClick={cancelEdit}
                    className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* The tree. This is the ONLY thing that scrolls. */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
            {visibleIds.length === 0 && !showNew && (
              <p className="text-xs text-gray-400 italic py-4">
                {filter.trim() ? `No ${typeLabel} prompts match “${filter.trim()}”` : "No saved prompts for this diagram type"}
              </p>
            )}

            {groups.map((g, gi) => {
              if (g.items.length === 0 && g.key === "user" && filter.trim()) return null;
              if (g.items.length === 0 && g.key !== "user") return null;
              const open = !collapsed.has(g.key);
              const allSelected = g.items.length > 0 && g.items.every(i => selected.has(i.id));
              // The Org heading sits above the first colleague's branch, so the
              // tree reads User / Org rather than a flat list of names.
              const showOrgHeading = g.foreign && !groups[gi - 1]?.foreign;
              return (
                <div key={g.key}>
                  {showOrgHeading && (
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 mt-2">
                      Org — {orgCount} prompt{orgCount === 1 ? "" : "s"} from other people
                    </p>
                  )}
                  <div className={`rounded-lg border ${g.foreign ? "border-gray-200 bg-gray-50/60" : "border-gray-200 bg-white"}`}>
                    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-100">
                      <button onClick={() => toggleOpen(g.key)} aria-expanded={open}
                        title={open ? "Collapse" : "Expand"}
                        className="text-[9px] text-gray-400 hover:text-gray-700 w-3 shrink-0">
                        {open ? "▼" : "▶"}
                      </button>
                      <input
                        type="checkbox" checked={allSelected} onChange={() => toggleGroup(g)}
                        aria-label={`Select all ${g.label} prompts`}
                        className="cursor-pointer w-3 h-3 accent-blue-600"
                      />
                      <span className="text-xs font-medium text-gray-700">{g.label}</span>
                      <span className="text-[10px] text-gray-400">({g.items.length})</span>
                      {g.foreign && <span className="text-[9px] text-gray-400 italic ml-1">another user</span>}
                    </div>

                    {open && (
                      <div className="divide-y divide-gray-100">
                        {g.items.length === 0 && (
                          <p className="text-[10px] text-gray-400 italic px-3 py-2">None</p>
                        )}
                        {g.items.map(p => (
                          <div key={p.id} className={editingId === p.id ? "bg-blue-50/40" : ""}>
                            {editingId === p.id ? (
                              <div className="p-3 space-y-2">
                                <input
                                  type="text" value={editName} onChange={e => setEditName(e.target.value)}
                                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="Prompt name"
                                />
                                <textarea
                                  value={editText} onChange={e => setEditText(e.target.value)} rows={6}
                                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed font-mono"
                                  placeholder="Prompt text"
                                />
                                <div className="flex gap-1.5">
                                  <button onClick={handleSave} disabled={saving || !editName.trim() || !editText.trim()}
                                    className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                                    {saving ? "Saving…" : "Save"}
                                  </button>
                                  <button onClick={cancelEdit}
                                    className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div className="px-3 py-2 flex items-start gap-2.5">
                                <input
                                  type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)}
                                  aria-label={`Select ${p.name}`}
                                  className="cursor-pointer w-3 h-3 mt-0.5 shrink-0 accent-blue-600"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-800">{p.name}</p>
                                  <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{p.text}</p>
                                  {/* What is true of this prompt, in the order
                                      somebody deciding what to keep would want
                                      it: how often it has earned its place,
                                      then how it was made. */}
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[9px] text-gray-400">
                                    <span title={`Created ${shortDate(p.createdAt)}`}>Created {shortDate(p.createdAt)}</span>
                                    <span title={`Last modified ${shortDate(p.updatedAt)}`}>· Modified {shortDate(p.updatedAt)}</span>
                                    {(p.useCount ?? 0) > 0 ? (
                                      <span className="text-gray-500" title={`Last used ${shortDate(p.lastUsedAt)}${p.modelUsed ? ` on ${p.modelUsed}` : ""}`}>
                                        · Used {p.useCount}× ({shortDate(p.lastUsedAt)})
                                      </span>
                                    ) : (
                                      // The clear-out candidate, said plainly.
                                      <span className="text-amber-600" title="No diagram has been generated from this prompt">· Never used</span>
                                    )}
                                    {p.planUpdatedAt && (
                                      <span className="px-1 rounded bg-green-50 text-green-700" title="Has a saved plan — re-applies with no AI call">Plan</span>
                                    )}
                                    {p.source === "dictated" && (
                                      <span className="px-1 rounded bg-purple-50 text-purple-700" title="Dictated">Dictated</span>
                                    )}
                                    {p.source === "typed" && <span className="px-1 rounded bg-gray-100">Typed</span>}
                                    {p.refinedAt && (
                                      <span className="px-1 rounded bg-blue-50 text-blue-700" title={`Refined ${shortDate(p.refinedAt)}`}>Refined</span>
                                    )}
                                    {p.fromImage && (
                                      <span className="px-1 rounded bg-amber-50 text-amber-700" title="Written against an image — the image itself is not kept">From image</span>
                                    )}
                                    {p.modelUsed && <span className="text-gray-400">· {p.modelUsed}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                                  {/* Someone else's prompt is not editable here — an
                                      OrgAdmin may remove one, not rewrite it under
                                      its author's name. */}
                                  {!g.foreign && (
                                    <button onClick={() => startEdit(p)}
                                      className="text-[10px] px-2 py-0.5 text-blue-600 border border-blue-200 rounded hover:bg-blue-50">Edit</button>
                                  )}
                                  {confirmDeleteId === p.id ? (
                                    <>
                                      <span className="text-[10px] text-red-600">Delete?</span>
                                      <button onClick={() => handleDelete(p.id)}
                                        className="text-[10px] px-2 py-0.5 text-red-600 font-medium border border-red-300 rounded hover:bg-red-50">Yes</button>
                                      <button onClick={() => setConfirmDeleteId(null)}
                                        className="text-[10px] px-2 py-0.5 text-gray-500 border border-gray-300 rounded hover:bg-gray-50">No</button>
                                    </>
                                  ) : (
                                    <button onClick={() => setConfirmDeleteId(p.id)}
                                      className="text-[10px] px-2 py-0.5 text-red-500 border border-red-200 rounded hover:bg-red-50">Delete</button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {summaryOpen && (
        <PromptUsageSummary
          // EVERYTHING the caller can see, across all diagram types — not the
          // filtered list. A summary that moved with the filter would answer a
          // different question every time you looked at it, and the question it
          // exists for ("what is not earning its place?") is about the library.
          prompts={orgPrompts ?? prompts}
          scopeLabel={orgPrompts
            ? `Every saved prompt in this organisation — ${orgPrompts.length} across all diagram types`
            : `Your saved prompts — ${prompts.length} across all diagram types`}
          typeLabels={Object.fromEntries(DIAGRAM_TYPES.map(d => [d.value, d.label]))}
          onClose={() => setSummaryOpen(false)}
        />
      )}

      {bulkConfirm && (
        <ConfirmDialog
          title="Delete prompts"
          message={
            `Delete ${bulkConfirm.label}?\n\n` +
            `Only ${typeLabel} prompts are affected — no other diagram type is touched.` +
            (bulkConfirm.ids.some(id => !prompts.some(p => p.id === id))
              ? "\n\nSome of these belong to other people in your organisation."
              : "") +
            "\n\nThis cannot be undone."
          }
          confirmLabel={busyBulk ? "Deleting…" : `Delete ${bulkConfirm.ids.length}`}
          onConfirm={() => { if (!busyBulk) runBulkDelete(bulkConfirm.ids); }}
          onCancel={() => setBulkConfirm(null)}
        />
      )}
    </div>
  );
}
