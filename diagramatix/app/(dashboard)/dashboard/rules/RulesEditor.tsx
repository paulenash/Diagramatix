"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CODE_REQUIRED_GROUPS,
  RULE_LINE_RE,
  PROPOSED_RE,
  MODIFIED_RE,
} from "@/app/lib/ai/splitRules";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface RuleSet {
  id: string | null;
  category: string;
  rules: string;
  isDefault: boolean;
  updatedAt?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  bpmn: "BPMN Process",
  "state-machine": "State Machine",
  "value-chain": "Value Chain",
  domain: "Domain Model",
  context: "Context Diagram",
  "process-context": "Process Context",
  // "staff-narrative" is not a diagram-type rule but the editable
  // briefing the Staff Narrative prompt generator sends to Claude as
  // its system prompt. Lives in the same editor so admins can tune
  // the voice / vocabulary without code changes.
  "staff-narrative": "Staff Narrative Briefing",
};

const CATEGORY_ORDER = ["general", "bpmn", "state-machine", "value-chain", "domain", "context", "process-context", "staff-narrative"];

interface ClassifiedLine {
  index: number;       // original line index
  line: string;
  isGroup: boolean;
  isRule: boolean;
  codeRequired: boolean;
  /** [PROPOSED] marker present — new rule, code not yet written. */
  proposed: boolean;
  /** [MODIFIED] marker present — existing rule's text edited; code may
   *  no longer match. Only meaningful on code-backed (red) rules. */
  modified: boolean;
}

function classifyLines(text: string): ClassifiedLine[] {
  const lines = text.split("\n");
  let currentGroupIsCode = false;
  return lines.map((line, index) => {
    const trimmed = line.trim();
    const isGroup = trimmed.startsWith("##");
    const isRule = RULE_LINE_RE.test(trimmed);
    if (isGroup) {
      currentGroupIsCode = CODE_REQUIRED_GROUPS.test(trimmed);
    }
    return {
      index,
      line,
      isGroup,
      isRule,
      codeRequired: isRule ? currentGroupIsCode : false,
      proposed: isRule && currentGroupIsCode && PROPOSED_RE.test(line),
      modified: isRule && currentGroupIsCode && MODIFIED_RE.test(line) && !PROPOSED_RE.test(line),
    };
  });
}

/** Walk every `##` section in `text`. For each section, any non-empty line
 *  that is NOT a group heading and NOT already a rule line is treated as a
 *  freshly typed rule. Such lines are MOVED to the end of their section and
 *  assigned the next rule number for that section's letter prefix. Rules
 *  added to a code-required (red/orange) section are prepended with
 *  `[PROPOSED]` so they render orange until the user toggles them to
 *  implemented. */
function autoNumberRules(text: string): string {
  const lines = text.split("\n");
  // Identify section spans: index of each `## …` heading.
  const headingIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("##")) headingIdx.push(i);
  }

  // If there are no headings, return text untouched — auto-numbering is
  // section-scoped and we have no section.
  if (headingIdx.length === 0) return text;

  // Category prefix (R / G / S / …) taken from the first existing rule
  // anywhere in the doc, so a brand-new (empty) group still mints the
  // right letter instead of defaulting to "R".
  let docPrefix = "R";
  for (const ln of lines) {
    const m = ln.trim().match(/^([A-Z])\d+(?:\.\d+)*:/);
    if (m) { docPrefix = m[1]; break; }
  }

  // Build sections: [start, end) line ranges. Anything before the first
  // heading is preserved verbatim.
  const out: string[] = [];
  // Preamble (before the first heading).
  for (let i = 0; i < headingIdx[0]; i++) out.push(lines[i]);

  for (let s = 0; s < headingIdx.length; s++) {
    const start = headingIdx[s];
    const end = s + 1 < headingIdx.length ? headingIdx[s + 1] : lines.length;
    const heading = lines[start];
    const isCode = CODE_REQUIRED_GROUPS.test(heading.trim());
    const body = lines.slice(start + 1, end);

    // Group-scoped IDs: "## Group 3: …" → new rules become R3.NN. The
    // group number comes from the heading; the sequence continues this
    // group's own highest number, so IDs stay contiguous within a group
    // and can never collide with another group. Headings without a
    // group number fall back to legacy flat numbering.
    const groupMatch = heading.trim().match(/##\s*Group\s+(\d+)/i);
    const groupNum = groupMatch ? parseInt(groupMatch[1], 10) : null;

    // Find the category prefix and the max sequence already used here.
    let prefix = docPrefix;
    let maxSeq = 0;
    for (const ln of body) {
      const m = ln.trim().match(/^([A-Z])(\d+)(?:\.(\d+))?:/);
      if (!m) continue;
      prefix = m[1];
      // Dotted (R3.05) → seq is after the dot. Legacy flat (R35) → the
      // whole number is the seq for max purposes.
      const seq = m[3] !== undefined ? parseInt(m[3], 10) : parseInt(m[2], 10);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }

    // Partition body into kept lines + candidate new-rule lines.
    const kept: string[] = [];
    const candidates: string[] = [];
    for (const ln of body) {
      const trimmed = ln.trim();
      if (trimmed === "") {
        kept.push(ln);
        continue;
      }
      if (trimmed.startsWith("#")) {
        // Defensive — shouldn't happen given the section split, but keep nested
        // headings in place if any.
        kept.push(ln);
        continue;
      }
      if (RULE_LINE_RE.test(trimmed)) {
        kept.push(ln);
        continue;
      }
      // Unnumbered non-empty content → new rule candidate.
      candidates.push(trimmed);
    }

    // Drop trailing blank lines from `kept` so candidates append cleanly,
    // then we'll re-add a single blank separator at the end of the section
    // if one existed before.
    let trailingBlanks = 0;
    while (kept.length > 0 && kept[kept.length - 1].trim() === "") {
      kept.pop();
      trailingBlanks++;
    }

    out.push(heading);
    for (const ln of kept) out.push(ln);

    let n = maxSeq;
    for (const c of candidates) {
      n += 1;
      const ruleBody = isCode ? `[PROPOSED] ${c}` : c;
      const id = groupNum !== null
        ? `${prefix}${groupNum}.${String(n).padStart(2, "0")}`
        : `${prefix}${String(n).padStart(2, "0")}`;
      out.push(`${id}: ${ruleBody}`);
    }

    // Restore one trailing blank line if there was at least one originally
    // (keeps the spacing between sections sane).
    if (trailingBlanks > 0) out.push("");
  }

  return out.join("\n");
}

/** Remove the `[PROPOSED]` and / or `[MODIFIED]` markers from the line at
 *  `lineIndex` of `text`. Used when the admin clicks "Mark implemented"
 *  after updating the layout code to match the rule. */
function markRuleImplemented(text: string, lineIndex: number): string {
  const lines = text.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return text;
  lines[lineIndex] = lines[lineIndex]
    .replace(/\s*\[PROPOSED\]\s*/gi, " ")
    .replace(/\s*\[MODIFIED\]\s*/gi, " ")
    .replace(/:\s+/, ": ");
  return lines.join("\n");
}

/** Extract numbered-rule bodies from a saved rules text, keyed by rule id
 *  (e.g. "R30", "R04.1"). Used by `tagModifiedRules` to detect when an
 *  admin's edit has changed the body of an existing rule. */
function parseRuleBodies(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^([A-Z]\d+(?:\.\d+)*):\s*(.*)$/);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/** Strip any leading status marker (`[PROPOSED]` / `[MODIFIED]`) so two
 *  rule bodies can be compared on their actual content alone. */
function normaliseRuleBody(body: string): string {
  return body
    .replace(/^\s*\[(?:PROPOSED|MODIFIED)\]\s*/gi, "")
    .trim();
}

/** Compare the saved `oldText` to the in-progress `newText` per rule. Any
 *  Red (code-backed) rule whose body has changed since the last save AND
 *  doesn't already carry a `[PROPOSED]` or `[MODIFIED]` marker gets
 *  prefixed with `[MODIFIED]`. Newly-added rules are left untouched here —
 *  `autoNumberRules` handles them and assigns `[PROPOSED]`. */
function tagModifiedRules(newText: string, oldText: string): string {
  const oldBodies = parseRuleBodies(oldText);
  const lines = newText.split("\n");
  let currentGroupIsCode = false;
  return lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("##")) {
      currentGroupIsCode = CODE_REQUIRED_GROUPS.test(trimmed);
      return line;
    }
    if (!currentGroupIsCode) return line;
    const m = trimmed.match(/^([A-Z]\d+(?:\.\d+)*):\s*(.*)$/);
    if (!m) return line;
    const ruleId = m[1];
    const body = m[2];
    // Already flagged — leave as-is. Saving doesn't clear flags, only
    // "Mark implemented" does.
    if (PROPOSED_RE.test(body) || MODIFIED_RE.test(body)) return line;
    const oldBody = oldBodies.get(ruleId);
    if (oldBody === undefined) return line;        // new rule — autoNumber handles
    if (normaliseRuleBody(oldBody) === normaliseRuleBody(body)) return line;
    // Body genuinely differs from the last saved version.
    const leadingWs = line.match(/^\s*/)![0];
    return `${leadingWs}${ruleId}: [MODIFIED] ${body}`;
  }).join("\n");
}

/** Remove a single rule line from `text`. Used by the per-rule Delete
 *  button on green (AI-enforced) rules. The save flow re-runs
 *  `autoNumberRules` afterwards, which leaves the remaining numbered
 *  rules untouched (no re-numbering on delete — keeps cross-references
 *  in code stable). */
function deleteRuleLine(text: string, lineIndex: number): string {
  const lines = text.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return text;
  lines.splice(lineIndex, 1);
  return lines.join("\n");
}

/** IDs of every rule that sits in a code-backed (red) group. Used by the
 *  Save guard to detect a code-backed rule removed via the raw textarea
 *  (the per-rule Delete button only exists on green rules). */
function codeBackedRuleIds(text: string): Set<string> {
  const ids = new Set<string>();
  let inCode = false;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("##")) { inCode = CODE_REQUIRED_GROUPS.test(trimmed); continue; }
    if (!inCode) continue;
    const m = trimmed.match(/^([A-Z]\d+(?:\.\d+)*):/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

export function RulesEditor({ isAdmin: _isAdmin }: { isAdmin: boolean }) {
  // ?category=<slug> on the URL pins the editor to a single category
  // and hides the sidebar. Used by the per-diagram "AI Rules &
  // Preferences — <Type>" admin link so the admin sees only the rules
  // that apply to the diagram they came from. Without the param the
  // editor renders the full multi-category view as before.
  const searchParams = useSearchParams();
  const scopedCategory = searchParams?.get("category") ?? null;
  const isScoped = !!(scopedCategory && CATEGORY_ORDER.includes(scopedCategory));
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [activeCategory, setActiveCategory] = useState(isScoped ? scopedCategory! : "general");
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [deleteRuleConfirm, setDeleteRuleConfirm] = useState<{ lineIndex: number; ruleId: string } | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  // Pending save that would remove one or more code-backed (red) rules
  // via a raw textarea edit — held until the admin confirms.
  const [pendingRedDelete, setPendingRedDelete] = useState<{ ids: string[]; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/bpmn-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    })
      .then(r => r.json())
      .then(data => {
        setRuleSets(data);
        const preferred = isScoped ? scopedCategory! : "general";
        const active = data.find((r: RuleSet) => r.category === preferred) ?? data[0];
        if (active) setEditText(active.rules);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function selectCategory(cat: string) {
    setActiveCategory(cat);
    const rs = ruleSets.find(r => r.category === cat);
    setEditText(rs?.rules ?? "");
    setMessage(null);
  }

  /** Run auto-numbering, save the result, and update local state. */
  async function persistText(nextText: string, successMessage: string) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/bpmn-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-default",
          category: activeCategory,
          rules: nextText,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setMessage({ text: err.error ?? "Save failed", ok: false });
        return;
      }
      setEditText(nextText);
      setRuleSets(prev => prev.map(r =>
        r.category === activeCategory ? { ...r, rules: nextText } : r
      ));
      setMessage({ text: successMessage, ok: true });
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    // Diff against the last saved version (read from state) BEFORE
    // numbering — autoNumberRules only knows about new rules so it
    // would miss body changes to existing ones. Tag any Red rule whose
    // text changed with [MODIFIED], then run the numberer.
    const lastSaved = ruleSets.find((r) => r.category === activeCategory)?.rules ?? "";
    const tagged = tagModifiedRules(editText, lastSaved);
    const numbered = autoNumberRules(tagged);
    // Guard: a code-backed (red) rule can only disappear through a manual
    // textarea edit (no Delete button exists for red rules). That would
    // leave its layout-engine code undocumented, so confirm first.
    const before = codeBackedRuleIds(lastSaved);
    const after = codeBackedRuleIds(numbered);
    const removed = [...before].filter((id) => !after.has(id));
    if (removed.length > 0) {
      setPendingRedDelete({ ids: removed, text: numbered });
      return;
    }
    await persistText(numbered, "Rules saved");
  }

  async function performGuardedSave() {
    if (!pendingRedDelete) return;
    const { text } = pendingRedDelete;
    setPendingRedDelete(null);
    await persistText(text, "Rules saved");
  }

  async function handleMarkImplemented(lineIndex: number) {
    const next = markRuleImplemented(editText, lineIndex);
    await persistText(next, "Rule marked implemented");
  }

  function handleDeleteRule(lineIndex: number) {
    const line = editText.split("\n")[lineIndex] ?? "";
    const ruleId = line.trim().match(/^([A-Z]\d+(?:\.\d+)*):/)?.[1] ?? "rule";
    setDeleteRuleConfirm({ lineIndex, ruleId });
  }

  async function performDeleteRule() {
    if (!deleteRuleConfirm) return;
    const { lineIndex, ruleId } = deleteRuleConfirm;
    setDeleteRuleConfirm(null);
    const next = deleteRuleLine(editText, lineIndex);
    await persistText(next, `Deleted ${ruleId}`);
  }

  function handleReset() {
    setResetConfirm(true);
  }

  async function performReset() {
    setResetConfirm(false);
    setSaving(true);
    try {
      await fetch("/api/bpmn-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", category: activeCategory }),
      });
      const res = await fetch("/api/bpmn-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const data = await res.json();
      setRuleSets(data);
      const active = data.find((r: RuleSet) => r.category === activeCategory);
      if (active) setEditText(active.rules);
      setMessage({ text: "Reset to defaults", ok: true });
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  const classified = classifyLines(editText);
  const ruleCount = classified.filter(l => l.isRule).length;
  const proposedCount = classified.filter(l => l.proposed).length;
  const modifiedCount = classified.filter(l => l.modified).length;
  // "Confirmed" code-backed = red rule with NO pending status marker.
  const codeCount = classified.filter(l => l.isRule && l.codeRequired && !l.proposed && !l.modified).length;
  const aiCount = ruleCount - codeCount - proposedCount - modifiedCount;

  if (loading) return <div className="p-8 text-gray-500">Loading rules...</div>;

  return (
    <div className="min-h-screen dgx-dashboard-bg flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
            <span>&larr;</span>
            <span className="underline">SuperAdmin</span>
          </Link>
          {/* Brand icon: matches the placement on every other admin sub-screen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="text-lg font-semibold text-gray-900">
            AI Rules &amp; Preferences
            {isScoped && (
              <span className="ml-2 text-base font-normal text-gray-500">
                &mdash; {CATEGORY_LABELS[scopedCategory!] ?? scopedCategory}
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            Rules are sent with every AI generation request to guide diagram creation
          </p>
          {isScoped && (
            <Link href="/dashboard/rules" className="text-xs text-blue-600 hover:underline shrink-0">
              View all categories
            </Link>
          )}
          <Link href="/help" className="text-xs text-blue-600 hover:underline shrink-0">User Guide</Link>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar — category list. Hidden when scoped to a single
            diagram type so the admin sees only the rules they came
            for. Use the "View all categories" link above to return to
            the multi-category view. */}
        {!isScoped && (
        <nav className="w-52 bg-white border-r border-gray-200 p-3 flex flex-col">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2">Categories</p>
          <div className="space-y-1 flex-1">
            {CATEGORY_ORDER.map(cat => {
              const rs = ruleSets.find(r => r.category === cat);
              const count = (rs?.rules ?? "").split("\n").filter(l => RULE_LINE_RE.test(l.trim())).length;
              return (
                <button key={cat}
                  onClick={() => selectCategory(cat)}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs ${
                    activeCategory === cat
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                  <span className="ml-1 text-gray-400">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="border-t border-gray-200 pt-3 mt-3">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2">Legend</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                <span className="text-[10px] text-gray-600">AI-enforced rule</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-[10px] text-gray-600">Code-backed rule</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
                <span className="text-[10px] text-gray-600">Proposed (not yet coded)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[10px] text-gray-600">Modified (code not yet updated)</span>
              </div>
              <p className="text-[9px] text-gray-400 mt-1">
                Type a new rule on its own line (no number needed) and press Save.
                In layout groups, new rules start as <span className="text-orange-600">proposed</span>;
                edits to existing layout rules are flagged <span className="text-amber-600">modified</span> on
                Save. Click <span className="font-semibold">Mark implemented</span> once the layout code is
                updated. Green (AI-enforced) rules can be removed in place with their per-rule
                <span className="font-semibold"> Delete</span> button.
              </p>
            </div>
          </div>
        </nav>
        )}

        {/* Editor + Preview */}
        <main className="flex-1 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {CATEGORY_LABELS[activeCategory] ?? activeCategory} Rules
              </h2>
              <p className="text-[10px] text-gray-400">
                {ruleCount} rules
                {aiCount > 0 && <> &middot; <span className="text-green-600">{aiCount} AI-enforced</span></>}
                {codeCount > 0 && <> &middot; <span className="text-red-500">{codeCount} code-backed</span></>}
                {proposedCount > 0 && <> &middot; <span className="text-orange-600">{proposedCount} proposed</span></>}
                {modifiedCount > 0 && <> &middot; <span className="text-amber-600">{modifiedCount} modified</span></>}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showPreview} onChange={e => setShowPreview(e.target.checked)} className="w-3 h-3" />
                Preview
              </label>
              {(() => {
                const lastSaved = ruleSets.find(r => r.category === activeCategory)?.rules ?? "";
                const isDirty = editText !== lastSaved;
                return (
                  <>
                    <button
                      onClick={handleReset}
                      disabled={saving || !isDirty}
                      className="px-3 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={isDirty ? "Reset to last saved" : "No changes to reset"}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !isDirty}
                      className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      title={isDirty ? "Save changes" : "No changes to save"}
                    >
                      {saving ? "Saving…" : "Save Rules"}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>

          <div className={`flex-1 flex ${showPreview ? "gap-3" : ""}`}>
            {/* Textarea editor */}
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className={`${showPreview ? "w-1/2" : "w-full"} font-mono text-xs border border-gray-300 rounded p-3 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed`}
              placeholder="Enter rules here. Use ## Group N: Name for groups. New rules can be added on their own lines; on Save they will be numbered and appended to their section (proposed in layout groups)."
            />

            {/* Coloured preview */}
            {showPreview && (
              <div className="w-1/2 border border-gray-200 rounded bg-white p-3 overflow-y-auto">
                <div className="space-y-0.5">
                  {classified.map((cl, i) => {
                    if (cl.isGroup) {
                      const isLayoutGroup = CODE_REQUIRED_GROUPS.test(cl.line);
                      return (
                        <div key={i} className="mt-2 first:mt-0">
                          <p className={`text-xs font-semibold ${isLayoutGroup ? "text-red-700" : "text-green-700"}`}>
                            {cl.line}
                            {isLayoutGroup && <span className="ml-2 text-[9px] font-normal text-red-400">(code-backed)</span>}
                          </p>
                        </div>
                      );
                    }
                    if (cl.isRule) {
                      // Priority for visual status: proposed > modified >
                      // confirmed-red > green. [PROPOSED] beats [MODIFIED]
                      // if both somehow appear on the same line.
                      const dotColour = cl.proposed
                        ? "bg-orange-500"
                        : cl.modified
                          ? "bg-amber-500"
                          : cl.codeRequired
                            ? "bg-red-500"
                            : "bg-green-500";
                      const textColour = cl.proposed
                        ? "text-orange-700"
                        : cl.modified
                          ? "text-amber-700"
                          : cl.codeRequired
                            ? "text-red-700"
                            : "text-green-800";
                      const needsImplementing = cl.proposed || cl.modified;
                      const btnTone = cl.proposed
                        ? "text-orange-700 border-orange-300 hover:bg-orange-50"
                        : "text-amber-700 border-amber-300 hover:bg-amber-50";
                      return (
                        <div key={i} className="flex items-start gap-2 py-0.5">
                          <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dotColour}`} />
                          <p className={`text-[11px] leading-snug flex-1 ${textColour}`}>
                            {cl.line}
                          </p>
                          {needsImplementing && (
                            <button
                              onClick={() => handleMarkImplemented(cl.index)}
                              disabled={saving}
                              className={`shrink-0 text-[9px] border rounded px-1.5 py-0.5 disabled:opacity-50 ${btnTone}`}
                              title={cl.proposed
                                ? "Mark this rule as implemented in code"
                                : "Mark this modified rule as re-implemented in code"}
                            >
                              Mark implemented
                            </button>
                          )}
                          {cl.isRule && !cl.codeRequired && (
                            <button
                              onClick={() => handleDeleteRule(cl.index)}
                              disabled={saving}
                              className="shrink-0 text-[9px] text-gray-500 border border-gray-300 rounded px-1.5 py-0.5 hover:bg-red-50 hover:text-red-700 hover:border-red-300 disabled:opacity-50"
                              title="Delete this AI-enforced rule"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      );
                    }
                    if (cl.line.trim()) {
                      return (
                        <div key={i} className="flex items-start gap-2 py-0.5">
                          <span className="w-2 h-2 rounded-full mt-1 shrink-0 bg-gray-300" />
                          <p className="text-[11px] text-gray-500 leading-snug italic">
                            {cl.line} <span className="text-[9px] text-gray-400 not-italic">(unnumbered — will be numbered on save)</span>
                          </p>
                        </div>
                      );
                    }
                    return <div key={i} className="h-2" />;
                  })}
                </div>
              </div>
            )}
          </div>

          {message && (
            <p className={`mt-2 text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}

          <p className="mt-2 text-[10px] text-gray-400">
            Format: <code>## Group N: Name</code> for sections; rule IDs are group-scoped, e.g. <code>R3.01:</code> (BPMN group 3, rule 1).
            New rules can be typed without a number — they will be appended at the end of their section and
            numbered on Save. Rules in <span className="text-red-600">layout</span> groups start as
            <span className="text-orange-600"> proposed</span> until you mark them implemented.
          </p>
        </main>
      </div>

      {deleteRuleConfirm && (
        <ConfirmDialog
          title={`Delete ${deleteRuleConfirm.ruleId}?`}
          message="This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          onCancel={() => setDeleteRuleConfirm(null)}
          onConfirm={performDeleteRule}
        />
      )}

      {pendingRedDelete && (
        <ConfirmDialog
          title={pendingRedDelete.ids.length === 1 ? "Delete code-backed rule?" : "Delete code-backed rules?"}
          message={
            `You're removing ${pendingRedDelete.ids.join(", ")}, which ${pendingRedDelete.ids.length === 1 ? "is" : "are"} enforced by layout-engine code. ` +
            `The code will keep running with no rule documenting it.\n\nDelete anyway?`
          }
          confirmLabel="Delete anyway"
          cancelLabel="Cancel"
          destructive
          onCancel={() => setPendingRedDelete(null)}
          onConfirm={performGuardedSave}
        />
      )}

      {resetConfirm && (
        <ConfirmDialog
          title="Reset to system defaults?"
          message="Your customisations for this category will be deleted."
          confirmLabel="Reset"
          cancelLabel="Cancel"
          destructive
          onCancel={() => setResetConfirm(false)}
          onConfirm={performReset}
        />
      )}
    </div>
  );
}
