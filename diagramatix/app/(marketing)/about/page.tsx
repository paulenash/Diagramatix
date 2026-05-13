import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="bg-white">
      <section className="max-w-2xl mx-auto px-6 pt-20 pb-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">About Diagramatix</h1>

        <p className="mt-6 text-base text-gray-700 leading-relaxed">
          Diagramatix is a process diagramming tool built for business analysts and
          process owners who have to draw the real thing — not the textbook example.
          Pools that span ten lanes, message flows between four participants, BPMN
          imports from Signavio that other tools mangle: that&apos;s what we built it for.
        </p>

        <p className="mt-4 text-base text-gray-700 leading-relaxed">
          We started Diagramatix because the existing tools fall into two camps:
          generic shape editors that don&apos;t understand BPMN, and BPMN-only tools that
          force you into modeller conventions no business audience reads. Our goal is
          a diagram that runs in a browser, imports the formats people already use,
          and produces output that fits straight into a board paper.
        </p>

        <p className="mt-4 text-base text-gray-700 leading-relaxed">
          Built by Paul Nash and Greg Nash. Based in Australia.
        </p>

        <div className="mt-10 flex flex-col gap-2 text-sm">
          <h2 className="text-lg font-semibold text-gray-900">Get in touch</h2>
          <p className="text-gray-600">
            Sales & partnerships: <a href="mailto:sales@diagramatix.com.au" className="text-blue-600 hover:underline">sales@diagramatix.com.au</a>
          </p>
          <p className="text-gray-600">
            Support: <a href="mailto:support@diagramatix.com.au" className="text-blue-600 hover:underline">support@diagramatix.com.au</a>
          </p>
        </div>

        <div className="mt-12">
          <Link
            href="/"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}
