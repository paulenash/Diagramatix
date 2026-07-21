"use client";

import { useRouter } from "next/navigation";
import type { Entitlements, FeatureKey } from "@/app/lib/subscription";
import { useFeatureColors } from "@/app/lib/theme/useFeatureColors";
import { tonesFor, readableTextOn, type FeatureColorKey } from "@/app/lib/theme/featureColors";

interface MenuCard {
  href: string;
  title: string;
  description: string;
  /** When set, the tile is greyed + non-clickable unless the Org's
   *  subscription includes this feature. */
  featureKey?: FeatureKey;
  /** Feature Colour; unset → the orgAdmin (orange) fallback. */
  feature?: FeatureColorKey;
}

const CARDS: MenuCard[] = [
  {
    href: "/dashboard/admin?from=/dashboard/org-admin",
    title: "Registered Users",
    description:
      "Every user in your Org. View / Edit their session for support purposes.",
  },
  {
    href: "/dashboard/admin/org-settings?from=/dashboard/org-admin",
    title: "Org Settings",
    description:
      "Cross-Org sharing toggle and the list of OrgAdmins for this Org.",
  },
  {
    href: "/dashboard/admin/sharing?from=/dashboard/org-admin",
    title: "Project Sharing",
    description:
      "See every shared project in your Org plus the editors / viewers on each.",
    feature: "projectSharing",
  },
  {
    href: "/notifications?from=/dashboard/org-admin",
    title: "Notifications & Feedback",
    description:
      "Inspect any Org member's notification feed — reviews, publishing, feedback. Filter by user.",
  },
  {
    href: "/dashboard/org-admin/team-membership",
    title: "Team Membership",
    description:
      "Assign Org members to teams / roles (from your Org-Structure Entity List). Powers the Process Portal's “Involving me” view.",
    feature: "entityLists",
  },
  {
    href: "/dashboard/org-admin/backup",
    title: "Backup & Restore",
    description:
      "Download a backup of your whole Org, or selectively restore an Org member's projects / diagrams.",
  },
  {
    href: "/dashboard/prompts?from=/dashboard/org-admin",
    title: "AI Prompt Maintenance",
    description:
      "Maintain your own saved AI generation prompts.",
    feature: "ai",
  },
  {
    href: "/dashboard/admin/entity-lists?from=/dashboard/org-admin",
    title: "Entity Lists",
    description:
      "Organisation structures, external participants and IT systems used to name BPMN pools and lanes.",
    feature: "entityLists",
  },
  {
    href: "/dashboard/admin/risk-controls?from=/dashboard/org-admin",
    title: "Risk & Control Catalog",
    description:
      "Master library of Risks and Controls that projects adopt, attach to process steps and export as a Risk-Control Matrix.",
    featureKey: "riskControl",
    feature: "riskControl",
  },
  {
    href: "/dashboard/compliance?from=/dashboard/org-admin",
    title: "Compliance Monitoring",
    description:
      "How well your controls are operating over time — effectiveness trends and alerts assembled from DiagramatixMINER runs across every project.",
    featureKey: "riskControl",
    feature: "riskControl",
  },
  {
    href: "/dashboard/admin/pcf?from=/dashboard/org-admin",
    title: "Process Classification (APQC PCF)",
    description:
      "Browse the APQC Process Classification Framework — the Cross-Industry standard and industry variants — to classify and structure your processes.",
    featureKey: "apqc",
    feature: "apqc",
  },
  {
    href: "/dashboard/diagram-type-sort-order?from=/dashboard/org-admin",
    title: "Diagram Type Sort Order",
    description:
      "The order diagram types are listed across the app and in the project Diagram Type sort.",
  },
];

/**
 * Pure presentation. The page-level server component handles auth +
 * role gating; this just renders the menu and the back link.
 */
export function OrgAdminClient({ orgName, entitlements }: { orgName: string; entitlements?: Entitlements }) {
  const router = useRouter();
  const scheme = useFeatureColors();
  const ent: Entitlements = entitlements ?? { simulator: true, processMining: true, riskControl: true, apqc: true };

  return (
    <div className="h-screen dgx-dashboard-bg flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
          title="Return to Dashboard"
        >
          <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"←"}</span>
          <span className="underline">Dashboard</span>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
        <h1 className="font-semibold text-gray-900">
          OrgAdmin &mdash; {orgName}
        </h1>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto max-w-4xl mx-auto px-6 py-8">
        <p className="text-sm text-gray-600 mb-6">
          Pick a management surface. Each option opens its own page; the
          back link there returns you here.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card) => {
            // Grey + disable a tile whose feature isn't in the Org's subscription.
            const locked = card.featureKey ? !ent[card.featureKey] : false;
            if (locked) {
              return (
                <div
                  key={card.href}
                  className="block bg-gray-50 border border-gray-200 rounded-md p-4 opacity-60 cursor-not-allowed select-none"
                  title="Not included in your subscription"
                  aria-disabled="true"
                >
                  <h2 className="text-sm font-semibold text-gray-500">
                    {card.title}
                  </h2>
                  <p className="text-xs text-gray-400 mt-1.5 leading-snug">
                    {card.description}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-2 italic">Not included in your subscription</p>
                </div>
              );
            }
            // Contrast-guaranteed text (see AdminClient): a customised palette can't
            // make a tile dark-on-dark; default palettes are unaffected.
            const tones = card.feature ? tonesFor(scheme, card.feature) : null;
            const readable = tones ? readableTextOn(tones.bg, tones.text) : undefined;
            const fv: Record<string, string> | undefined = tones ? { "--fb": tones.bg, "--ft": readable!, "--fh": tones.hi } : undefined;
            const descFixed = !!tones && readable !== tones.text;
            return (
              <a
                key={card.href}
                href={card.href}
                style={fv}
                className={`block rounded-md p-4 border transition-colors ${
                  card.feature
                    ? "feature-tile"
                    : "bg-white border-orange-300 hover:bg-orange-50 hover:border-orange-400"
                }`}
              >
                <h2 className={`text-sm font-semibold ${card.feature ? "" : "text-orange-700"}`}>
                  {card.title}
                </h2>
                <p className={`text-xs mt-1.5 leading-snug ${descFixed ? "" : "text-gray-600"}`}
                   style={descFixed ? { color: readable, opacity: 0.85 } : undefined}>
                  {card.description}
                </p>
              </a>
            );
          })}
        </div>
      </main>
    </div>
  );
}
