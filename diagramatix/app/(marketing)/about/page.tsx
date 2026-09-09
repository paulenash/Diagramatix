import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description:
    "Diagramatix is an AI-powered process platform built in Melbourne by Nash Computer Consultants under founder Dr Paul Nash. Who we are, why we built it, and how to reach us.",
};

const CONTACT_EMAIL = "info@diagramatix.com.au";

/** Inline Diagramatix wordmark, sized to the surrounding text (h-[1em])
 *  and baseline-nudged so it sits on the text line. Used in the page
 *  heading; body prose uses the plain word "Diagramatix". */
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 text-xl font-semibold text-gray-900">{children}</h2>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 text-base text-gray-700 leading-relaxed">{children}</p>
  );
}

export default function AboutPage() {
  return (
    <div className="bg-white">
      <section className="max-w-2xl mx-auto px-6 pt-20 pb-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 flex items-baseline gap-2">
          About <Wordmark />
        </h1>

        <Para>
          Diagramatix is a process platform built for business analysts and
          process owners who need to draw the real thing, not the textbook
          example. It focuses on who does what, with what, and where the
          information comes from and goes to. Describe a process in plain
          English and get a valid BPMN 2.0 model. Then mine the real process
          from your event logs, simulate the fix, and prove your controls
          operate.
        </Para>

        <SectionHeading>Why we built it</SectionHeading>
        <Para>
          Diagramatix was developed by Nash Computer Consultants under the
          direction of our founder, Dr Paul Nash. It comes out of two decades
          of training business analysts and software architects, and of
          guiding organisations through process modelling, process improvement
          and the system design that follows.
        </Para>
        <Para>
          Along the way we used most of the BPMN tools on the market and
          learned their strengths and weaknesses first hand. They fall into two
          camps: generic shape editors that don&apos;t understand BPMN, and
          modeller-only tools that force conventions no business audience
          reads. We built the tool we wished we had: one that runs in a
          browser, imports the formats people already use, and produces output
          that fits straight into a board paper.
        </Para>

        <SectionHeading>Open by design</SectionHeading>
        <Para>
          Diagramatix is not tied to any financial, operational or procedural
          system. It works on open standards instead. Import and export BPMN
          2.0 XML. Round-trip Microsoft Visio in both directions with our
          purpose-built shape file. Bring event logs as CSV, IEEE XES or OCEL.
          Your data is never trapped, and a current commitment to another tool
          is not a barrier to trying this one.
        </Para>
        <Para>
          Alongside BPMN, Diagramatix supports process context, value chain,
          state machine, domain, context and ArchiMate diagrams, so an
          organisation can show the full context of its processes.
        </Para>

        <SectionHeading>Where AI fits</SectionHeading>
        <Para>
          We use AI at the points where it saves real work. It turns a
          description, a whiteboard photo or a dictated explanation into a
          laid-out first draft. It writes a plain-English verdict on a
          simulation, grounded only in the computed numbers. We don&apos;t use
          your content to train AI models.
        </Para>

        <SectionHeading>Our founder</SectionHeading>
        <div className="mt-4 flex flex-col sm:flex-row gap-6 items-start">
          <Image
            src="/about/paul-nash.jpg"
            alt="Dr Paul Nash, founder of Diagramatix"
            width={160}
            height={160}
            className="h-40 w-40 shrink-0 rounded-full object-cover object-top"
          />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Dr Paul Nash</h3>
            <p className="mt-2 text-base text-gray-700 leading-relaxed">
              Paul holds a PhD in mathematics, modelling and simulation from
              Monash University. He was IT Development Director at Keypoint
              Insurance Systems through the 1990s, building insurance broking
              systems for Australia and South-East Asia until the business was
              sold to Telstra in 1999, and later ran a development team in
              Taipei for Clarity International.
            </p>
            <p className="mt-4 text-base text-gray-700 leading-relaxed">
              From 2004 to 2014 he was Supervising Consultant and Principal
              Trainer at Object Consulting, teaching business analysis, data
              modelling, UML and BPMN 2 to analysts around Australia. He then
              spent a decade as a senior business and process analyst for
              organisations including Telstra, Toll, the Australian Tax Office,
              Australian Unity and the Royal Australian Navy.
            </p>
            <p className="mt-4 text-base text-gray-700 leading-relaxed">
              He built Diagramatix with AI coding agents to give those analysts
              the tool he could never hand them in class. He lives in
              Melbourne, where he has been President of the Classical Guitar
              Society of Victoria since 2005.
            </p>
          </div>
        </div>

        <SectionHeading>The company</SectionHeading>
        <Para>
          Diagramatix is built and operated by Nash Computer Consultants Pty
          Ltd (ABN 85 084 745 657), Thornbury, Victoria, Australia.
        </Para>

        <SectionHeading>Get in touch</SectionHeading>
        <Para>
          Sales, support and press:{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-blue-600 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </Para>
        <Para>
          We&apos;d like to hear how Diagramatix is working in your
          organisation.
        </Para>

        <div className="mt-12">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}
