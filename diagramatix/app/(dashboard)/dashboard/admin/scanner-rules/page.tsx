import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { rulesMetadata } from "@/app/lib/diagram/checks/diagramChecks";

/**
 * Admin-only view of the shared diagram-check registry. The same rules
 * power /api/projects/[id]/scan-pool-connectors (project-wide scan), the
 * Diagram ▾ → Scan Diagram for Issues per-diagram scan, and the layout
 * test harness. Adding a rule in diagramChecks.ts makes it appear here
 * automatically.
 */
export default async function ScannerRulesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");

  const rules = rulesMetadata();
  const CATEGORY_LABELS: Record<string, string> = {
    "pool-lane-connector": "Connectors on Pool/Lane",
    "duplicate-name": "Duplicate names",
    "single-lane-pool": "Single-lane pools",
    "hanging-message": "Hanging messages",
    "bpmn-structure": "BPMN structure",
  };
  const categories = Array.from(new Set(rules.map((r) => r.category)));

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Scanner Issues Rules</h1>
          <a
            href="/dashboard/admin"
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
          >
            ← Admin
          </a>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          These {rules.length} rules are the single source of truth for the
          diagram scanner. The same registry runs in
          &ldquo;Scan Diagrams for Issues&rdquo;, the per-diagram
          &ldquo;Scan Diagram for Issues&rdquo; (Review Mode), and the
          automated layout tests. Adding a rule in{" "}
          <code className="text-[10px] bg-gray-100 px-1 rounded">
            app/lib/diagram/checks/diagramChecks.ts
          </code>{" "}
          makes it appear here automatically.
        </p>
      </header>
      {categories.map((cat) => (
        <section key={cat} className="mb-6">
          <h2 className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
            {CATEGORY_LABELS[cat] ?? cat}
          </h2>
          <ul className="space-y-2">
            {rules
              .filter((r) => r.category === cat)
              .map((r) => (
                <li
                  key={r.id}
                  className="border border-gray-200 rounded px-3 py-2 bg-white"
                >
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
                  <p className="text-[11px] text-gray-600 mt-1">{r.description}</p>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
