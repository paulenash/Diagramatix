import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

const FEATURES: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Smart connector routing",
    body: "Connectors find their own path. Move shapes, the lines re-route — no manual tweaking, no overlapping arrows.",
    icon: (
      <svg width={22} height={22} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <rect x={1} y={4} width={6} height={4} rx={1} />
        <rect x={15} y={14} width={6} height={4} rx={1} />
        <path d="M7 6 H11 V16 H15" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
  {
    title: "BPMN 2.0 + Visio import",
    body: "Drop in Signavio .bpmn or Visio .vsdx files and keep working. Lanes, pools, gateways, and message flows preserved.",
    icon: (
      <svg width={22} height={22} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M4 3 H14 L18 7 V19 H4 Z" strokeLinejoin="round" />
        <path d="M14 3 V7 H18" strokeLinejoin="round" />
        <line x1={7} y1={12} x2={15} y2={12} />
        <line x1={7} y1={15} x2={15} y2={15} />
      </svg>
    ),
  },
  {
    title: "AI-assisted generation",
    body: "Describe the process in plain English; Diagramatix lays out a first-draft BPMN diagram you can refine.",
    icon: (
      <svg width={22} height={22} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M11 2 L13 9 L20 11 L13 13 L11 20 L9 13 L2 11 L9 9 Z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Configurable palettes",
    body: "Pick which symbols appear in your sidebar. Hide what you don't use, surface what you do.",
    icon: (
      <svg width={22} height={22} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <circle cx={11} cy={11} r={8} />
        <circle cx={7} cy={9} r={1.2} fill="currentColor" />
        <circle cx={11} cy={6} r={1.2} fill="currentColor" />
        <circle cx={15} cy={9} r={1.2} fill="currentColor" />
        <circle cx={15} cy={13} r={1.2} fill="currentColor" />
      </svg>
    ),
  },
];

export default async function MarketingHome() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
        <p className="text-xs uppercase tracking-widest text-blue-600 font-medium mb-4">
          Diagramatix
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
          BPMN diagramming that just works.
        </h1>
        <p className="mt-5 text-base sm:text-lg text-gray-600 max-w-xl mx-auto">
          Smart connector routing, BPMN&nbsp;2.0 + Visio import, AI-assisted
          generation. Built for business analysts, not draftspeople.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/register"
            className="px-5 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="px-5 py-2.5 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 font-medium text-sm"
          >
            Sign in
          </Link>
        </div>
        <p className="mt-6 text-xs text-gray-400">
          Free plan available · No credit card required to get started
        </p>
      </section>

      {/* Screenshot placeholder */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="aspect-[16/9] rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
          <span className="text-xs text-gray-400">Product screenshot placeholder</span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
            Everything you need to draw real processes
          </h2>
          <p className="mt-3 text-sm text-gray-600 text-center max-w-xl mx-auto">
            Not another generic shape tool. Diagramatix is purpose-built for BPMN
            and the messy, multi-pool reality of business processes.
          </p>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-sm transition-shadow"
              >
                <div className="w-10 h-10 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                  {f.icon}
                </div>
                <h3 className="text-base font-semibold text-gray-900">{f.title}</h3>
                <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Simple, transparent pricing
        </h2>
        <p className="mt-3 text-sm text-gray-600">
          Free for individuals. AU$19 per user per month for teams. Enterprise on request.
        </p>
        <Link
          href="/pricing"
          className="mt-6 inline-block px-5 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm"
        >
          See pricing →
        </Link>
      </section>

      {/* Final CTA */}
      <section className="bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to map a process?</h2>
          <p className="mt-3 text-sm text-gray-300">
            Sign up, draw your first diagram in under a minute.
          </p>
          <Link
            href="/register"
            className="mt-6 inline-block px-5 py-2.5 bg-white text-gray-900 rounded-md hover:bg-gray-100 font-medium text-sm"
          >
            Get started
          </Link>
        </div>
      </section>
    </div>
  );
}
