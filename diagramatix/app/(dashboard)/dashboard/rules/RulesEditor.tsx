"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CODE_REQUIRED_GROUPS,
  RULE_LINE_RE,
  PROPOSED_RE,
} from "@/app/lib/ai/splitRules";

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
};

const CATEGORY_ORDER = ["general", "bpmn", "state-machine", "value-chain", "domain", "context", "process-context"];

interface ClassifiedLine {
  index: number;       // original line index
  line: string;
  isGroup: boolean;
  isRule: boolean;
  codeRequired: boolean;
  proposed: boolean;   // [PROPOSED] marker present (only meaningful for code-required rules)
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

    // Find existing rule lines, their letter prefix, and the max top-level number.
    let prefix = "R";
    let maxNum = 0;
    for (const ln of body) {
      const m = ln.trim().match(/^([A-Z])(\d+)(?:\.\d+)*:/);
      if (m) {
        prefix = m[1];
        const n = parseInt(m[2], 10);
        if (Number.isFinite(n) && n > maxNum) maxNum = n;
      }
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

    let n = maxNum;
    for (const c of candidates) {
      n += 1;
      const body = isCode ? `[PROPOSED] ${c}` : c;
      out.push(`${prefix}${String(n).padStart(2, "0")}: ${body}`);
    }

    // Restore one trailing blank line if there was at least one originally
    // (keeps the spacing between sections sane).
    if (trailingBlanks > 0) out.push("");
  }

  return out.join("\n");
}

/** Remove the `[PROPOSED]` marker from the line at `lineIndex` of `text`. */
function markRuleImplemented(text: string, lineIndex: number): string {
  const lines = text.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return text;
  // Strip any `[PROPOSED]` token (case-insensitive) plus the single whitespace
  // that follows it, leaving the rest of the rule body intact.
  lines[lineIndex] = lines[lineIndex].replace(/\s*\[PROPOSED\]\s*/i, " ").replace(/:\s+/, ": ");
  return lines.join("\n");
}

export function RulesEditor({ isAdmin: _isAdmin }: { isAdmin: boolean }) {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [activeCategory, setActiveCategory] = useState("general");
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    fetch("/api/bpmn-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    })
      .then(r => r.json())
      .then(data => {
        setRuleSets(data);
        const active = data.find((r: RuleSet) => r.category === "general") ?? data[0];
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
    const numbered = autoNumberRules(editText);
    await persistText(numbered, "Rules saved");
  }

  async function handleMarkImplemented(lineIndex: number) {
    const next = markRuleImplemented(editText, lineIndex);
    await persistText(next, "Rule marked implemented");
  }

  async function handleReset() {
    if (!confirm("Reset to system defaults? Your customisations for this category will be deleted.")) return;
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
  const codeCount = classified.filter(l => l.isRule && l.codeRequired && !l.proposed).length;
  const proposedCount = classified.filter(l => l.proposed).length;
  const aiCount = ruleCount - codeCount - proposedCount;

  if (loading) return <div className="p-8 text-gray-500">Loading rules...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            &larr; Dashboard
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">AI Rules &amp; Preferences</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            Rules are sent with every AI generation request to guide diagram creation
          </p>
          <Link href="/help" className="text-xs text-blue-600 hover:underline shrink-0">User Guide</Link>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar — category list */}
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
              <p className="text-[9px] text-gray-400 mt-1">
                Type a new rule on its own line (no number needed) and press Save.
                In layout groups, new rules start as <span className="text-orange-600">proposed</span> until
                you mark them implemented.
              </p>
            </div>
          </div>
        </nav>

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
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showPreview} onChange={e => setShowPreview(e.target.checked)} className="w-3 h-3" />
                Preview
              </label>
              <button onClick={handleReset} disabled={saving}
                className="px-3 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
                Reset
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save Rules"}
              </button>
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
                      const dotColour = cl.proposed
                        ? "bg-orange-500"
                        : cl.codeRequired
                          ? "bg-red-500"
                          : "bg-green-500";
                      const textColour = cl.proposed
                        ? "text-orange-700"
                        : cl.codeRequired
                          ? "text-red-700"
                          : "text-green-800";
                      return (
                        <div key={i} className="flex items-start gap-2 py-0.5">
                          <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dotColour}`} />
                          <p className={`text-[11px] leading-snug flex-1 ${textColour}`}>
                            {cl.line}
                          </p>
                          {cl.proposed && (
                            <button
                              onClick={() => handleMarkImplemented(cl.index)}
                              disabled={saving}
                              className="shrink-0 text-[9px] text-orange-700 border border-orange-300 rounded px-1.5 py-0.5 hover:bg-orange-50 disabled:opacity-50"
                              title="Mark this rule as implemented in code"
                            >
                              Mark implemented
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
            Format: <code>## Group N: Name</code> for sections, <code>R01:</code> or <code>R04.1:</code> for rules.
            New rules can be typed without a number — they will be appended at the end of their section and
            numbered on Save. Rules in <span className="text-red-600">layout</span> groups start as
            <span className="text-orange-600"> proposed</span> until you mark them implemented.
          </p>
        </main>
      </div>
    </div>
  );
}
