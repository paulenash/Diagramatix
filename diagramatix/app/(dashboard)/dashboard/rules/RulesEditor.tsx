"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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

/** Group headings that indicate code-backed (layout) rules */
const CODE_REQUIRED_GROUPS = /\b(layout|positioning|placement|spacing|sizing|arrangement|connector routing)\b/i;

/** Determine if a rule line is under a code-required group */
function classifyLines(text: string): Array<{ line: string; isGroup: boolean; isRule: boolean; codeRequired: boolean }> {
  const lines = text.split("\n");
  let currentGroupIsCode = false;
  return lines.map(line => {
    const trimmed = line.trim();
    const isGroup = trimmed.startsWith("##");
    const isRule = /^[A-Z]\d+:/.test(trimmed);
    if (isGroup) {
      currentGroupIsCode = CODE_REQUIRED_GROUPS.test(trimmed);
    }
    return { line, isGroup, isRule, codeRequired: isRule ? currentGroupIsCode : false };
  });
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

  async function handleSave(asDefault: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/bpmn-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: asDefault ? "save-default" : "save",
          category: activeCategory,
          rules: editText,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setMessage({ text: err.error ?? "Save failed", ok: false });
      } else {
        setMessage({ text: asDefault ? "Default rules updated" : "Your rules saved", ok: true });
        setRuleSets(prev => prev.map(r =>
          r.category === activeCategory ? { ...r, rules: editText } : r
        ));
      }
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setSaving(false);
    }
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

  const activeRuleSet = ruleSets.find(r => r.category === activeCategory);
  const classified = classifyLines(editText);
  const ruleCount = classified.filter(l => l.isRule).length;
  const codeCount = classified.filter(l => l.isRule && l.codeRequired).length;
  const aiCount = ruleCount - codeCount;

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
              const count = (rs?.rules ?? "").split("\n").filter(l => /^[A-Z]\d+:/.test(l.trim())).length;
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
              <p className="text-[9px] text-gray-400 mt-1">
                Rules under Layout groups require code implementation and are shown in red.
                All other rules are enforced by the AI model and shown in green.
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
                {codeCount > 0 && <> &middot; <span className="text-red-500">{codeCount} code-backed</span></>}
                {aiCount > 0 && <> &middot; <span className="text-green-600">{aiCount} AI-enforced</span></>}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showPreview} onChange={e => setShowPreview(e.target.checked)} className="w-3 h-3" />
                Preview
              </label>
              <button onClick={() => handleSave(true)} disabled={saving}
                className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving\u2026" : "Save Rules"}
              </button>
            </div>
          </div>

          <div className={`flex-1 flex ${showPreview ? "gap-3" : ""}`}>
            {/* Textarea editor */}
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className={`${showPreview ? "w-1/2" : "w-full"} font-mono text-xs border border-gray-300 rounded p-3 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed`}
              placeholder="Enter rules here. Use ## Group N: Name for groups and R01: for individual rules."
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
                      return (
                        <div key={i} className="flex items-start gap-2 py-0.5">
                          <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${cl.codeRequired ? "bg-red-500" : "bg-green-500"}`} />
                          <p className={`text-[11px] leading-snug ${cl.codeRequired ? "text-red-700" : "text-green-800"}`}>
                            {cl.line}
                          </p>
                        </div>
                      );
                    }
                    if (cl.line.trim()) {
                      return <p key={i} className="text-[11px] text-gray-500 leading-snug">{cl.line}</p>;
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
            Format: Use <code>## Group N: Name</code> for section headings and <code>R01:</code> for numbered rules.
            General rules apply to all diagram types. Category-specific rules apply only to that diagram type.
          </p>
        </main>
      </div>
    </div>
  );
}
