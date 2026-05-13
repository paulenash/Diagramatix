import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="bg-white">
      <article className="max-w-2xl mx-auto px-6 pt-20 pb-24 text-gray-800">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
          <p className="mt-2 text-xs text-gray-500">Last updated: 13 May 2026</p>
          <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ⚠️ Placeholder copy. Final terms are pending legal review and must be in
            place before live billing is enabled.
          </p>
        </header>

        <h2 className="text-lg font-semibold text-gray-900 mt-8">1. Agreement</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          By creating a Diagramatix account or using the Diagramatix service
          (the &ldquo;Service&rdquo;), you agree to these Terms of Service. If you do
          not agree, do not use the Service.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">2. Accounts</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          You are responsible for safeguarding your account credentials and for all
          activity that occurs under your account. Notify us immediately of any
          unauthorised use.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">3. Subscriptions and billing</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Paid plans are billed in advance on a recurring basis through Stripe.
          You authorise us to charge the payment method on file for all fees incurred.
          Fees are non-refundable except as required by law or expressly stated by us.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">4. Acceptable use</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          You agree not to use the Service to upload unlawful content, infringe
          third-party rights, distribute malware, or interfere with the operation
          of the Service.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">5. Termination</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          You may cancel your subscription at any time via the billing portal. We
          may suspend or terminate accounts that breach these terms.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">6. Limitation of liability</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          To the maximum extent permitted by law, Diagramatix is not liable for any
          indirect, incidental, or consequential damages arising from your use of
          the Service.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">7. Governing law</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          These terms are governed by the laws of Australia. Any dispute will be
          resolved in the courts of New South Wales.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 mt-6">8. Contact</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Questions: <a href="mailto:legal@diagramatix.com.au" className="text-blue-600 hover:underline">legal@diagramatix.com.au</a>.
        </p>

        <div className="mt-12">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Back to home</Link>
        </div>
      </article>
    </div>
  );
}
