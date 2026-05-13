import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function MarketingHome() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <section className="max-w-3xl mx-auto px-6 pt-20 pb-24 text-center">
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
  );
}
