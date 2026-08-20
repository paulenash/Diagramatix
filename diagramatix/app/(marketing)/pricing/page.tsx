import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Diagramatix pricing in Australian dollars. 30-day free trial, then paid plans for BPMN diagramming with Visio import/export and AI generation. Built in Australia.",
};

const CONTACT_EMAIL = "sales@diagramatix.com.au";

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
    blurb: "For individuals exploring Diagramatix. 30-day free trial.",
    features: [
      "Try every diagram type for 30 days",
      "Visio + BPMN 2.0 import",
      "5 AI Generate attempts during your trial",
      "2 individual exports + 2 imports",
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
  enterprise: {
    blurb: "For organisations that need tailored limits, procurement, and support.",
    features: [
      "Everything in Expert",
      "Unlimited usage",
      "Tailored onboarding & support",
    ],
  },
};

/** FAQ ported from the www landing page (marketing/dist/index.html §10),
 *  with walkthrough / "talk to us" CTAs pointed at the contact mailto. */
const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "We already use Visio. Why add another tool?",
    a: "Keep Visio. Diagramatix works alongside it — generate a valid BPMN model in minutes, then export back to .vsdx for the colleagues who aren't changing anything. Bulk import your existing Visio estate to get started. No IT battle, no displaced standard.",
  },
  {
    q: "Isn't Bizagi free?",
    a: "Free for drawing — on a Windows desktop, with no AI generation, and with collaboration, governance and mining behind a quote-based enterprise bundle. Diagramatix gets you to a shareable, standards-valid model in minutes, then keeps going: mining, simulation, and audit-ready governance in the same subscription.",
  },
  {
    q: "How good is the AI output? Do I still need to edit it?",
    a: "Think of it as a first draft from a junior BA — structurally sound, usually most of the way there, and it needs your review. The AI does the scaffolding and even asks clarifying questions; you apply the domain knowledge. The built-in health checks catch what both of you miss.",
  },
  {
    q: "Do I need a data team for process mining? Does it connect to my systems?",
    a: "No data team — a three-column CSV (Case, Activity, Timestamp) is enough, and worked examples are included. And by design, no live connectors: proper data management and proper process management are two different jobs. If you unify data in a platform like Microsoft Fabric, shape the event log there and drop it in — we meet your data platform at open standards: CSV, IEEE XES, OCEL.",
  },
  {
    q: "Will auditors accept this?",
    a: "The Risk-Control Matrix exports in the standard Activity × Risk × Control format auditors already work with — plus registers, coverage and full traceability. Control operating-effectiveness is computed from your own event logs, and you control exactly which mining runs are included as evidence.",
  },
  {
    q: "Is my process data safe?",
    a: (
      <>
        Your diagrams and logs are encrypted in transit and at rest, and we
        don&apos;t use your content to train AI models. We&apos;re an
        early-stage product: formal certifications (SOC 2, ISO 27001, IRAP)
        are on our roadmap, not on our wall — if your organisation has
        specific requirements,{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">
          contact us
        </a>{" "}
        and we&apos;ll show you exactly where we are.
      </>
    ),
  },
];

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

      <section className="max-w-7xl mx-auto px-6 pb-24">
        {/* 5 tiers: 1 / 2 / 3+2 / 5 across so the grid never orphans a 4+1 row. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          {tiers.map((t) => {
            const copy = TIER_COPY[t.id] ?? {
              blurb: t.name,
              features: [],
            };
            // Enterprise is a "Contact us" tier: no self-serve price or
            // register flow. Special-cased here (not in formatPrice) because
            // Free legitimately renders $0 as the trial.
            const isEnterprise = t.id === "enterprise";
            const { dollars, cadence } = isEnterprise
              ? { dollars: "Custom", cadence: undefined }
              : formatPrice(t.priceMonthly);
            const ctaHref = isEnterprise
              ? `mailto:${CONTACT_EMAIL}?subject=Diagramatix%20Enterprise`
              : signedIn
                ? "/dashboard"
                : "/register";
            const ctaLabel = isEnterprise
              ? "Contact us"
              : signedIn
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
                  {isEnterprise ? (
                    <a
                      href={ctaHref}
                      className="block text-center px-4 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      {ctaLabel}
                    </a>
                  ) : (
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
                  )}
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

      {/* FAQ — server-rendered details/summary accordion, no JS required. */}
      <section className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
            Straight answers, no spin.
          </h2>
          <p className="mt-3 text-sm text-gray-600 text-center">
            Still unsure?{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Diagramatix%20questions`}
              className="text-blue-600 hover:underline font-medium"
            >
              Contact us
            </a>
            .
          </p>
          <div className="mt-8 space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group bg-white border border-gray-200 rounded-lg"
              >
                <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer text-sm font-semibold text-gray-900 list-none [&::-webkit-details-marker]:hidden">
                  <span>{item.q}</span>
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 16 16"
                    fill="none"
                    className="shrink-0 text-gray-400 transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  >
                    <path
                      d="M8 3v10M3 8h10"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
                  </svg>
                </summary>
                <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
