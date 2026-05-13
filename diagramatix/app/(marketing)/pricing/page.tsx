import Link from "next/link";
import { auth } from "@/auth";

interface Tier {
  name: string;
  price: string;
  cadence?: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
  // CTA differs by signed-in state — resolved at render time.
  ctaKey: "free" | "pro" | "enterprise";
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "AU$0",
    cadence: "forever",
    blurb: "For individuals exploring Diagramatix.",
    features: [
      "1 user",
      "1 project",
      "Up to 10 diagrams",
      "BPMN, Process Context, State Machine, Domain diagrams",
      "Visio + BPMN 2.0 import",
    ],
    ctaKey: "free",
  },
  {
    name: "Pro",
    price: "AU$19",
    cadence: "per user / month",
    blurb: "For teams that need real collaboration.",
    features: [
      "Up to 25 users",
      "Unlimited projects",
      "Unlimited diagrams",
      "AI-assisted diagram generation",
      "Diagram version history",
      "Priority email support",
    ],
    highlight: true,
    ctaKey: "pro",
  },
  {
    name: "Enterprise",
    price: "Contact us",
    blurb: "For larger orgs with custom requirements.",
    features: [
      "Unlimited everything",
      "SSO (Microsoft Entra ID)",
      "Audit log + role granularity",
      "Custom data residency",
      "Dedicated onboarding",
    ],
    ctaKey: "enterprise",
  },
];

function ctaFor(tier: Tier, signedIn: boolean): { label: string; href: string; disabled?: boolean } {
  if (tier.ctaKey === "enterprise") {
    return { label: "Contact sales", href: "mailto:sales@diagramatix.com.au" };
  }
  if (tier.ctaKey === "free") {
    return signedIn
      ? { label: "Current plan", href: "/dashboard/billing", disabled: true }
      : { label: "Start free", href: "/register" };
  }
  // Pro
  return signedIn
    ? { label: "Upgrade to Pro", href: "/dashboard/billing" }
    : { label: "Start Pro", href: "/register?plan=pro" };
}

export default async function PricingPage() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="bg-white">
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-10 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Pricing</h1>
        <p className="mt-3 text-sm text-gray-600">
          Start free. Upgrade when your team grows.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TIERS.map((t) => {
            const cta = ctaFor(t, signedIn);
            return (
              <div
                key={t.name}
                className={`rounded-lg border p-6 flex flex-col ${
                  t.highlight
                    ? "border-blue-500 shadow-md bg-white relative"
                    : "border-gray-200 bg-white"
                }`}
              >
                {t.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-blue-600 text-white text-[10px] uppercase tracking-wide font-semibold rounded">
                    Most popular
                  </span>
                )}
                <h2 className="text-lg font-semibold text-gray-900">{t.name}</h2>
                <p className="mt-1 text-xs text-gray-500">{t.blurb}</p>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-gray-900">{t.price}</span>
                  {t.cadence && (
                    <span className="text-xs text-gray-500">{t.cadence}</span>
                  )}
                </div>
                <ul className="mt-5 space-y-2 text-sm text-gray-700 flex-1">
                  {t.features.map((f) => (
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
                  {cta.disabled ? (
                    <span className="block text-center px-4 py-2 text-sm font-medium text-gray-500 bg-gray-100 rounded-md cursor-default">
                      {cta.label}
                    </span>
                  ) : (
                    <Link
                      href={cta.href}
                      className={`block text-center px-4 py-2 text-sm font-medium rounded-md ${
                        t.highlight
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {cta.label}
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
    </div>
  );
}
