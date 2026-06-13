"use client";

import Link from "next/link";

// Local mirror of the Rule shape the server hands us (no functions, just
// metadata). Keeping it inline avoids dragging the Check type through the
// client bundle.
type RuleMeta = {
  code: string;
  id: string;
  title: string;
  description: string;
  severity: "error" | "warning";
  category: string;
};

export function ScannerRulesClient({ rules }: { rules: RuleMeta[] }) {
  // Single flat list sorted by code so admins can refer to rules as
  // "B07" / "B23" / etc. and find them at the same row every time. Any
  // rule that is missing a code is parked at the bottom alphabetically.
  const sorted = [...rules].sort((a, b) => {
    if (a.code && b.code) return a.code.localeCompare(b.code);
    if (a.code) return -1;
    if (b.code) return 1;
    return a.id.localeCompare(b.id);
  });

  const totalRules = sorted.length;
  const errorCount = sorted.filter((r) => r.severity === "error").length;
  const warningCount = sorted.filter((r) => r.severity === "warning").length;

  return (
    <div className="min-h-screen dgx-dashboard-bg flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
            <span>&larr;</span>
            <span className="underline">SuperAdmin</span>
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="text-lg font-semibold text-gray-900">BPMN Scanner Rules</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            Defined in <code className="text-[10px] bg-gray-100 px-1 rounded">diagramChecks.ts</code> — automatically wired to scans and tests.
          </p>
          <Link href="/help" className="text-xs text-blue-600 hover:underline shrink-0">
            User Guide
          </Link>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-5xl w-full mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            All BPMN rules
            <span className="ml-2 text-xs text-gray-400 font-normal">
              ({totalRules} rule{totalRules === 1 ? "" : "s"} — {errorCount} error{errorCount === 1 ? "" : "s"},{" "}
              {warningCount} warning{warningCount === 1 ? "" : "s"})
            </span>
          </h2>
        </div>
        <ul className="space-y-2">
          {sorted.map((r) => (
            <li key={r.id} className="border border-gray-200 rounded px-3 py-2 bg-white">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-gray-900 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                  {r.code || "—"}
                </span>
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
          {sorted.length === 0 && (
            <li className="text-xs text-gray-500 italic">No rules defined.</li>
          )}
        </ul>
      </main>
    </div>
  );
}
