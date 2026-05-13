import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="bg-white">
      <article className="max-w-2xl mx-auto px-6 pt-20 pb-24 text-gray-800">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="mt-2 text-xs text-gray-500">Last updated: 13 May 2026</p>
          <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ⚠️ Placeholder copy. Final privacy policy is pending legal review and
            must be in place before live billing is enabled.
          </p>
        </header>

        <h2 className="text-lg font-semibold text-gray-900 mt-8">1. What we collect</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Account information (name, email, organisation), the diagrams and
          projects you create, and basic usage telemetry (page views, feature
          interactions, error reports).
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">2. How we use it</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          To provide and improve the Service, communicate with you about your
          account, and bill for paid subscriptions. We do not sell your data.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">3. Where data is stored</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Diagramatix data is stored in Microsoft Azure&apos;s Australia East region.
          Backups are geo-replicated to Australia Southeast. Both are Australian
          sovereign data centres.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">4. Subprocessors</h2>
        <ul className="mt-2 text-sm leading-relaxed text-gray-700 list-disc pl-5 space-y-1">
          <li>Microsoft Azure — hosting, database, identity (Australia East/Southeast).</li>
          <li>Stripe — payment processing for paid subscriptions.</li>
          <li>Anthropic — AI-assisted diagram generation (only the prompt text you provide is sent).</li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">5. Your choices</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          You can export your diagrams at any time, delete individual diagrams, or
          request full account deletion. Email us to delete your account and all
          associated data.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">6. Cookies</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          We use a small number of essential cookies to keep you signed in and to
          remember preferences. We do not use third-party tracking cookies.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">7. Contact</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Privacy questions: <a href="mailto:privacy@diagramatix.com.au" className="text-blue-600 hover:underline">privacy@diagramatix.com.au</a>.
        </p>

        <div className="mt-12">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Back to home</Link>
        </div>
      </article>
    </div>
  );
}
