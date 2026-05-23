import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

/**
 * Marketing pricing page.
 *
 * Renders dynamically from the SubscriptionLevel table so name + price
 * stay in sync with what the app actually charges. The feature list
 * (marketing copy) stays as a small static dictionary keyed by tier id
 * — tier ids are stable ("free" / "introductory" / "professional" /
 * "expert"), so this lookup is robust against price / limit edits in
 * the admin editor.
 *
 * CTAs:
 *   • Signed out → /register (TierPicker on first dashboard visit
 *     lets the user pick a tier and goes through Stripe Checkout).
 *   • Signed in  → /dashboard (the subscription chip + popover give
 *     them Upgrade / Manage Subscription buttons).
 */

const TIER_COPY: Record<
  string,
  { blurb: string; features: string[]; highlight?: boolean }
> = {
  free: {
    blurb: "For individuals exploring Diagramatix. 30-day trial.",
    features: [
      "Try every diagram type",
      "Visio + BPMN 2.0 import",
      "5 AI Generate attempts (lifetime)",
      "Up to 2 individual exports + imports (lifetime)",
    ],
  },
  introductory: {
    blurb: "For solo users who want unlimited diagram building.",
    features: [
      "BPMN, Process Context, State Machine, Domain diagrams",
      "5 projects",
      "Generous monthly AI Generate quota",
      "Monthly individual exports + imports",
    ],
    highlight: true,
  },
  professional: {
    blurb: "For consultants and small teams.",
    features: [
      "Unlimited projects",
      "Higher monthly AI Generate quota",
      "Bulk Visio export + import",
      "Priority email support",
    ],
  },
  expert: {
    blurb: "For power users and larger teams.",
    features: [
      "Everything in Professional",
      "Highest monthly AI Generate quota",
      "Higher bulk export + import caps",
      "Earliest access to new diagram types",
    ],
  },
};

function formatPrice(priceMonthlyCents: number): { dollars: string; cadence?: string } {
  if (priceMonthlyCents === 0) return { dollars: "AU$0", cadence: "for the trial" };
  const dollars = Math.round(priceMonthlyCents / 100);
  return { dollars: `AU$${dollars}`, cadence: "per month" };
}

export default async function PricingPage() {
  const session = await auth();
  const signedIn = !!session?.user;

  const tiers = await prisma.subscriptionLevel.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="bg-white">
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-10 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Pricing</h1>
        <p className="mt-3 text-sm text-gray-600">
          Start free. Upgrade when your needs grow.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {tiers.map((t) => {
            const copy = TIER_COPY[t.id] ?? {
              blurb: t.name,
              features: [],
            };
            const { dollars, cadence } = formatPrice(t.priceMonthly);
            const ctaHref = signedIn ? "/dashboard" : "/register";
            const ctaLabel = signedIn
              ? (t.id === "free" ? "Open dashboard" : `Upgrade to ${t.name}`)
              : (t.id === "free" ? "Start free trial" : `Sign up for ${t.name}`);
            return (
              <div
                key={t.id}
                className={`rounded-lg border p-6 flex flex-col ${
                  copy.highlight
                    ? "border-blue-500 shadow-md bg-white relative"
                    : "border-gray-200 bg-white"
                }`}
              >
                {copy.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-blue-600 text-white text-[10px] uppercase tracking-wide font-semibold rounded">
                    Most popular
                  </span>
                )}
                <h2 className="text-lg font-semibold text-gray-900">{t.name}</h2>
                <p className="mt-1 text-xs text-gray-500">{copy.blurb}</p>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-gray-900">{dollars}</span>
                  {cadence && <span className="text-xs text-gray-500">{cadence}</span>}
                </div>
                <ul className="mt-5 space-y-2 text-sm text-gray-700 flex-1">
                  {copy.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <svg
                        width={14}
                        height={14}
                        viewBox="0 0 14 14"
                        className="mt-1 shrink-0 text-blue-600"
                      >
                        <path
                          d="M2 7 L6 11 L12 3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Link
                    href={ctaHref}
                    className={`block text-center px-4 py-2 text-sm font-medium rounded-md ${
                      copy.highlight
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {ctaLabel}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-xs text-center text-gray-500">
          Prices in Australian dollars. GST will apply where required.
          See <Link href="/terms" className="text-blue-600 hover:underline">Terms</Link>
          {" "}and{" "}
          <Link href="/privacy" className="text-blue-600 hover:underline">Privacy</Link>.
        </p>
      </section>
    </div>
  );
}
