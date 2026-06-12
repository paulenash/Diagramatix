"use client";

import { useRouter } from "next/navigation";

interface MenuCard {
  href: string;
  title: string;
  description: string;
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
  },
  {
    href: "/notifications?from=/dashboard/org-admin",
    title: "Notifications & Feedback",
    description:
      "Inspect any Org member's notification feed — reviews, publishing, feedback. Filter by user.",
  },
];

/**
 * Pure presentation. The page-level server component handles auth +
 * role gating; this just renders the menu and the back link.
 */
export function OrgAdminClient({ orgName }: { orgName: string }) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
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

      <main className="max-w-4xl mx-auto px-6 py-8">
        <p className="text-sm text-gray-600 mb-6">
          Pick a management surface. Each option opens its own page; the
          back link there returns you here.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card) => (
            <a
              key={card.href}
              href={card.href}
              className="block bg-white border border-orange-300 rounded-md p-4 hover:bg-orange-50 hover:border-orange-400 transition-colors"
            >
              <h2 className="text-sm font-semibold text-orange-700">
                {card.title}
              </h2>
              <p className="text-xs text-gray-600 mt-1.5 leading-snug">
                {card.description}
              </p>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
