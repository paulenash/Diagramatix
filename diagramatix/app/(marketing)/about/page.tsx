import Link from "next/link";

/** Inline Diagramatix wordmark, sized to the surrounding text (h-[1em])
 *  and baseline-nudged so it sits on the text line. Used in place of the
 *  written word "Diagramatix" across this page. */
function Wordmark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logos/diagramatix-logo.svg"
      alt="Diagramatix"
      className="inline-block h-[1em] w-auto align-[-0.12em]"
    />
  );
}

export default function AboutPage() {
  return (
    <div className="bg-white">
      <section className="max-w-2xl mx-auto px-6 pt-20 pb-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 flex items-baseline gap-2">
          About <Wordmark />
        </h1>

        <p className="mt-6 text-base text-gray-700 leading-relaxed">
          <Wordmark /> is a process diagramming tool built for business analysts
          and process owners who want to draw the real thing — not the textbook
          examples. It focuses on who does what, with what, and where the
          information to perform the task comes from and goes to. <Wordmark />{" "}
          imports and exports BPMN diagrams in a wide variety of formats.
          That&apos;s what we built it for. In particular it can round-trip Visio
          diagrams using its specially designed Visio Shapes file, or just the
          standard BPMN-M shapes stencil.
        </p>

        <p className="mt-4 text-base text-gray-700 leading-relaxed">
          We started <Wordmark /> because the existing tools fall into two camps:
          generic shape editors that don&apos;t understand BPMN, and BPMN-only
          tools that force you into modeller conventions no business audience
          reads. Our goal is a diagram that runs in a browser, imports the
          formats people already use, and produces output that fits straight
          into a board paper! <Wordmark /> also supports a number of important
          related diagram types to allow organisations to show the full context
          of their processes and value chains.
        </p>

        <p className="mt-4 text-base text-gray-700 leading-relaxed">
          Based in Australia.
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
