"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

// Local mirror of the Rule shape the server hands us (no functions, just
// metadata). Keeping it inline avoids dragging the Check type through the
// client bundle.
type RuleMeta = {
  id: string;
  title: string;
  description: string;
  severity: "error" | "warning";
  category: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  "pool-lane-connector": "Connectors on Pool/Lane",
  "duplicate-name": "Duplicate names",
  "single-lane-pool": "Single-lane pools",
  "hanging-message": "Hanging messages",
  "bpmn-structure": "BPMN structure",
};
const CATEGORY_ORDER = [
  "pool-lane-connector",
  "duplicate-name",
  "single-lane-pool",
  "hanging-message",
  "bpmn-structure",
];

export function ScannerRulesClient({ rules }: { rules: RuleMeta[] }) {
  // Stable category ordering: the canonical CATEGORY_ORDER, then any
  // categories from the registry we haven't listed (future-proofing).
  const categories = useMemo(() => {
    const known = CATEGORY_ORDER.filter((c) => rules.some((r) => r.category === c));
    const extras = Array.from(new Set(rules.map((r) => r.category))).filter((c) => !known.includes(c));
    return [...known, ...extras];
  }, [rules]);
  const [active, setActive] = useState<string>(categories[0] ?? "");
  const rulesInActive = rules.filter((r) => r.category === active);

  const totalRules = rules.length;
  const errorCount = rules.filter((r) => r.severity === "error").length;
  const warningCount = rules.filter((r) => r.severity === "warning").length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:underline">
            &larr; Admin
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="text-lg font-semibold text-gray-900">Scanner Issues Rules</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            The same registry powers project-wide scans, per-diagram scans, and the layout tests
          </p>
          <Link href="/help" className="text-xs text-blue-600 hover:underline shrink-0">
            User Guide
          </Link>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar — category list */}
        <nav className="w-60 bg-white border-r border-gray-200 p-3 flex flex-col">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2">
            Categories
          </p>
          <div className="space-y-1 flex-1">
            {categories.map((cat) => {
              const count = rules.filter((r) => r.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActive(cat)}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs ${
                    active === cat
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
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2">
              Legend
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                  error
                </span>
                <span className="text-[10px] text-gray-600">Hard failure</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                  warning
                </span>
                <span className="text-[10px] text-gray-600">Advisory</span>
              </div>
              <p className="text-[9px] text-gray-400 mt-2">
                Total: <strong>{totalRules}</strong> rules
                {" — "}
                {errorCount} error{errorCount === 1 ? "" : "s"},{" "}
                {warningCount} warning{warningCount === 1 ? "" : "s"}.
              </p>
              <p className="text-[9px] text-gray-400">
                Rules are defined in{" "}
                <code className="text-[9px] bg-gray-100 px-1 rounded">
                  app/lib/diagram/checks/diagramChecks.ts
                </code>
                . Adding a rule there makes it appear here, in the in-app
                scan, and in the layout test suite automatically.
              </p>
            </div>
          </div>
        </nav>

        {/* Main — rules in active category */}
        <main className="flex-1 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">
              {CATEGORY_LABELS[active] ?? active}
              <span className="ml-2 text-xs text-gray-400 font-normal">
                ({rulesInActive.length} rule{rulesInActive.length === 1 ? "" : "s"})
              </span>
            </h2>
          </div>
          <ul className="space-y-2">
            {rulesInActive.map((r) => (
              <li key={r.id} className="border border-gray-200 rounded px-3 py-2 bg-white">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      r.severity === "warning"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {r.severity}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{r.title}</span>
                  <span className="ml-auto text-[10px] text-gray-400 font-mono">{r.id}</span>
                </div>
                <p className="text-[11px] text-gray-600 mt-1.5">{r.description}</p>
              </li>
            ))}
            {rulesInActive.length === 0 && (
              <li className="text-xs text-gray-500 italic">No rules in this category.</li>
            )}
          </ul>
        </main>
      </div>
    </div>
  );
}
