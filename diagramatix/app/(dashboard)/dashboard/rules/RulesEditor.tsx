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

export function RulesEditor({ isAdmin }: { isAdmin: boolean }) {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [activeCategory, setActiveCategory] = useState("general");
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

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
        // Update local state
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
      // Reload
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
  const ruleCount = editText.split("\n").filter(l => /^[A-Z]\d+:/.test(l.trim())).length;

  if (loading) return <div className="p-8 text-gray-500">Loading rules...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">AI Rules & Preferences</h1>
        </div>
        <p className="text-xs text-gray-400">
          Rules are sent with every AI generation request to guide diagram creation
        </p>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar — category list */}
        <nav className="w-52 bg-white border-r border-gray-200 p-3">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2">Categories</p>
          <div className="space-y-1">
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
                  {rs && !rs.isDefault && (
                    <span className="ml-1 text-blue-500 text-[9px]">customised</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Editor */}
        <main className="flex-1 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {CATEGORY_LABELS[activeCategory] ?? activeCategory} Rules
              </h2>
              <p className="text-[10px] text-gray-400">
                {ruleCount} rules · {activeRuleSet?.isDefault ? "System default" : "Your customisation"}
              </p>
            </div>
            <div className="flex gap-2">
              {!activeRuleSet?.isDefault && (
                <button onClick={handleReset} disabled={saving}
                  className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
                  Reset to Default
                </button>
              )}
              <button onClick={() => handleSave(false)} disabled={saving}
                className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save My Rules"}
              </button>
              {isAdmin && (
                <button onClick={() => handleSave(true)} disabled={saving}
                  className="px-3 py-1 text-xs text-white bg-orange-600 rounded hover:bg-orange-700 disabled:opacity-50">
                  Save as Default
                </button>
              )}
            </div>
          </div>

          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            className="flex-1 w-full font-mono text-xs border border-gray-300 rounded p-3 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
            placeholder="Enter rules here. Use ## Group N: Name for groups and R01: for individual rules."
          />

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
