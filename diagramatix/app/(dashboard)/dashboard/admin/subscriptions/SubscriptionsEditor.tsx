"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Editable subscription-tier row. Mirrors SubscriptionLevel in the
 * schema, with Date columns omitted (they're server-managed). Null
 * limit values mean "unlimited".
 */
export interface TierRow {
  id: string;
  name: string;
  priceMonthly: number;                 // AUD cents
  sortOrder: number;
  maxProjects: number | null;
  maxDiagramsPerTypePerProject: number | null;
  maxArchimateDiagramsTotal: number | null;
  maxNonBpmnElementsPerDiagram: number | null;
  maxBpmnElementsPerDiagram: number | null;
  maxAiAttempts: number | null;
  aiAttemptsResetMonthly: boolean;
  maxIndividualExports: number | null;
  individualExportsResetMonthly: boolean;
  maxIndividualImports: number | null;
  individualImportsResetMonthly: boolean;
  maxBulkExports: number | null;
  maxBulkImports: number | null;
  trialDays: number | null;
  /** Stripe Price ID (price_…). Null for Free; required for paid
   *  tiers before Checkout can use them. Created in the Stripe
   *  dashboard, then pasted here. */
  stripePriceId: string | null;
}

/** Limit-row metadata. `kind` decides the input type and validation. */
type LimitRow =
  | {
      kind: "money";                    // priceMonthly — stored as cents, displayed as dollars
      label: string;
      key: "priceMonthly";
    }
  | {
      kind: "intNullable";
      label: string;
      key:
        | "maxProjects"
        | "maxDiagramsPerTypePerProject"
        | "maxArchimateDiagramsTotal"
        | "maxNonBpmnElementsPerDiagram"
        | "maxBpmnElementsPerDiagram"
        | "maxAiAttempts"
        | "maxIndividualExports"
        | "maxIndividualImports"
        | "maxBulkExports"
        | "maxBulkImports"
        | "trialDays";
    }
  | {
      kind: "bool";
      label: string;
      key:
        | "aiAttemptsResetMonthly"
        | "individualExportsResetMonthly"
        | "individualImportsResetMonthly";
    }
  | {
      kind: "stringNullable";
      label: string;
      key: "stripePriceId";
    };

const ROWS: LimitRow[] = [
  { kind: "money", label: "Price ($ / month)", key: "priceMonthly" },
  { kind: "stringNullable", label: "Stripe Price ID", key: "stripePriceId" },
  { kind: "intNullable", label: "Projects", key: "maxProjects" },
  { kind: "intNullable", label: "Diagrams per type per project", key: "maxDiagramsPerTypePerProject" },
  { kind: "intNullable", label: "Archimate diagrams (total)", key: "maxArchimateDiagramsTotal" },
  { kind: "intNullable", label: "Elements per non-BPMN diagram", key: "maxNonBpmnElementsPerDiagram" },
  { kind: "intNullable", label: "Elements per BPMN diagram", key: "maxBpmnElementsPerDiagram" },
  { kind: "intNullable", label: "AI Generate attempts", key: "maxAiAttempts" },
  { kind: "bool",        label: "AI attempts reset monthly", key: "aiAttemptsResetMonthly" },
  { kind: "intNullable", label: "Individual diagram exports", key: "maxIndividualExports" },
  { kind: "bool",        label: "Individual exports reset monthly", key: "individualExportsResetMonthly" },
  { kind: "intNullable", label: "Individual diagram imports", key: "maxIndividualImports" },
  { kind: "bool",        label: "Individual imports reset monthly", key: "individualImportsResetMonthly" },
  { kind: "intNullable", label: "Bulk exports", key: "maxBulkExports" },
  { kind: "intNullable", label: "Bulk imports", key: "maxBulkImports" },
  { kind: "intNullable", label: "Trial days (null = no expiry)", key: "trialDays" },
];

export function SubscriptionsEditor({ initialTiers }: { initialTiers: TierRow[] }) {
  const router = useRouter();
  const [tiers, setTiers] = useState<TierRow[]>(initialTiers);
  // Snapshot of what's persisted server-side. Used for dirty detection
  // + Cancel revert.
  const [savedSnapshot, setSavedSnapshot] = useState<TierRow[]>(initialTiers);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Updater that preserves immutability and clears any banners.
  function patch(tierId: string, updates: Partial<TierRow>) {
    setStatusMessage(null);
    setErrorMessage(null);
    setTiers((prev) => prev.map((t) => (t.id === tierId ? { ...t, ...updates } : t)));
  }

  function cancel() {
    setTiers(savedSnapshot);
    setStatusMessage(null);
    setErrorMessage(null);
  }

  const isDirty = JSON.stringify(tiers) !== JSON.stringify(savedSnapshot);

  async function save() {
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMessage(body.error ?? `Save failed (${res.status})`);
        return;
      }
      setStatusMessage("Saved.");
      setSavedSnapshot(tiers);
      // Refresh so SSR-fetched data downstream (admin Subscription column,
      // user popovers) picks up the new limits on next navigation.
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <a href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
            <span>&larr;</span>
            <span className="underline">SuperAdmin</span>
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="text-lg font-semibold text-gray-900">Subscription Prices and Limits</h1>
        </div>
        <div className="flex items-center gap-3">
          {statusMessage && (
            <span className="text-xs text-green-700">{statusMessage}</span>
          )}
          {errorMessage && (
            <span className="text-xs text-red-700">{errorMessage}</span>
          )}
          <button
            onClick={cancel}
            disabled={saving || !isDirty}
            className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isDirty ? "Discard unsaved changes" : "No changes to cancel"}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !isDirty}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            title={isDirty ? "Save changes" : "No changes to save"}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <p className="text-xs text-gray-500 mb-4 max-w-3xl">
          Edit the canonical four tiers and their limits. A blank numeric cell
          means &ldquo;unlimited&rdquo;. The &ldquo;reset monthly&rdquo;
          checkboxes flip a counter between an anniversary-day monthly window
          and a lifetime counter (Free&apos;s AI / exports / imports run as
          lifetime totals). SuperAdmin users (per <code>SUPERUSER_EMAILS</code>)
          are never enforced, regardless of these values.
        </p>

        <div className="bg-white rounded-md border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-medium text-gray-700 px-4 py-2 sticky left-0 bg-gray-50 z-10">
                  Limit
                </th>
                {tiers.map((t) => (
                  <th key={t.id} className="text-left text-xs font-medium text-gray-700 px-4 py-2 min-w-[140px]">
                    <input
                      type="text"
                      value={t.name}
                      onChange={(e) => patch(t.id, { name: e.target.value })}
                      className="w-full font-semibold text-gray-900 bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none rounded px-1 py-0.5"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key} className="border-b border-gray-100 last:border-b-0">
                  <td className="text-xs text-gray-700 px-4 py-1.5 sticky left-0 bg-white font-medium">
                    {row.label}
                  </td>
                  {tiers.map((t) => (
                    <td key={t.id} className="px-4 py-1.5">
                      <Cell row={row} tier={t} onPatch={patch} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function Cell({
  row,
  tier,
  onPatch,
}: {
  row: LimitRow;
  tier: TierRow;
  onPatch: (id: string, updates: Partial<TierRow>) => void;
}) {
  if (row.kind === "bool") {
    const checked = tier[row.key];
    return (
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onPatch(tier.id, { [row.key]: e.target.checked } as Partial<TierRow>)}
        className="h-4 w-4 cursor-pointer"
      />
    );
  }

  if (row.kind === "stringNullable") {
    const current = tier[row.key] as string | null;
    return (
      <input
        type="text"
        value={current ?? ""}
        placeholder={tier.id === "free" ? "(not needed)" : "price_…"}
        onChange={(e) => {
          const raw = e.target.value.trim();
          onPatch(tier.id, { [row.key]: raw === "" ? null : raw } as Partial<TierRow>);
        }}
        className="w-40 px-2 py-1 text-xs font-mono border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
      />
    );
  }

  if (row.kind === "money") {
    // Price is stored as cents; show as dollars for editing.
    const dollars = tier.priceMonthly / 100;
    return (
      <input
        type="number"
        step="1"
        min="0"
        value={Number.isFinite(dollars) ? dollars : 0}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          const cents = Number.isFinite(val) ? Math.round(val * 100) : 0;
          onPatch(tier.id, { priceMonthly: cents });
        }}
        className="w-24 px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
      />
    );
  }

  // intNullable — blank string == null (unlimited)
  const current = tier[row.key] as number | null;
  return (
    <input
      type="number"
      step="1"
      min="0"
      value={current === null ? "" : current}
      placeholder="∞"
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw === "") {
          onPatch(tier.id, { [row.key]: null } as Partial<TierRow>);
          return;
        }
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n >= 0) {
          onPatch(tier.id, { [row.key]: n } as Partial<TierRow>);
        }
      }}
      className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
    />
  );
}
