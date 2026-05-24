import Link from "next/link";
import { prisma } from "@/app/lib/db";

export const metadata = {
  title: "Diagramatix — Features",
  description: "Every feature Diagramatix ships with — from BPMN to ArchiMate, AI generation to Visio round-trip.",
};

// Always render at request time — Next.js can't pre-render this at
// Docker build time because the build environment has no DB. The CDN
// (Azure Front Door / any reverse proxy) handles repeat-visitor
// caching via the response Cache-Control if we want it later.
export const dynamic = "force-dynamic";

export default async function FeaturesPage() {
  const features = await prisma.feature.findMany({
    where: {
      publishedAt: { not: null },
      publishedHidden: { not: true },
    },
    orderBy: { publishedSortOrder: "asc" },
    select: {
      id: true,
      publishedName: true,
      publishedSummary: true,
      publishedDetails: true,
    },
  });

  return (
    <div className="bg-white">
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-10 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Features</h1>
        <p className="mt-3 text-sm text-gray-600 max-w-2xl mx-auto">
          Every diagram type, every editing comfort, every interop format —
          one tool.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24">
        {features.length === 0 ? (
          <p className="text-center text-sm text-gray-500">
            Features coming soon.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {features.map((f) => (
              <FeatureCard
                key={f.id}
                name={f.publishedName ?? ""}
                summary={f.publishedSummary ?? ""}
                details={f.publishedDetails ?? ""}
              />
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <Link
            href="/register"
            className="inline-block px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Start your 30-day free trial
          </Link>
          <p className="mt-3 text-xs text-gray-500">
            Or see <Link href="/pricing" className="text-blue-600 hover:underline">pricing</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}

/** Small card per feature. `details` is rendered as bullet list lines —
 *  we parse leading `- ` only (no full markdown), which is what the
 *  admin editor encourages. Any line without a leading dash renders as
 *  a paragraph below the list. */
function FeatureCard({ name, summary, details }: {
  name: string;
  summary: string;
  details: string;
}) {
  const lines = details.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  const paragraphs = lines.filter((l) => !l.startsWith("- "));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 flex flex-col">
      <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
      {summary && (
        <p className="mt-1 text-sm text-gray-700">{summary}</p>
      )}
      {bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-gray-700 flex-1">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
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
              <RenderInline text={b} />
            </li>
          ))}
        </ul>
      )}
      {paragraphs.length > 0 && (
        <div className="mt-3 space-y-2 text-sm text-gray-700">
          {paragraphs.map((p, i) => (
            <p key={i}><RenderInline text={p} /></p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Very small inline markdown: `code spans` and **bold** only. */
function RenderInline({ text }: { text: string }) {
  const parts: Array<{ type: "text" | "code" | "bold"; value: string }> = [];
  // Split on `code` first, then bold within remaining text. Simple
  // greedy regex tokenisation — no nested handling, which is fine for
  // the kind of copy the admin editor encourages.
  const codeRegex = /`([^`]+)`/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = codeRegex.exec(text)) !== null) {
    if (m.index > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, m.index) });
    }
    parts.push({ type: "code", value: m[1] });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }
  // Pass 2: split text parts on **bold**.
  const finalParts: typeof parts = [];
  for (const p of parts) {
    if (p.type !== "text") {
      finalParts.push(p);
      continue;
    }
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let c = 0;
    let bm: RegExpExecArray | null;
    while ((bm = boldRegex.exec(p.value)) !== null) {
      if (bm.index > c) {
        finalParts.push({ type: "text", value: p.value.slice(c, bm.index) });
      }
      finalParts.push({ type: "bold", value: bm[1] });
      c = bm.index + bm[0].length;
    }
    if (c < p.value.length) {
      finalParts.push({ type: "text", value: p.value.slice(c) });
    }
  }
  return (
    <>
      {finalParts.map((p, i) => {
        if (p.type === "code") {
          return (
            <code key={i} className="text-xs bg-gray-100 text-gray-800 px-1 py-0.5 rounded">
              {p.value}
            </code>
          );
        }
        if (p.type === "bold") {
          return <strong key={i}>{p.value}</strong>;
        }
        return <span key={i}>{p.value}</span>;
      })}
    </>
  );
}
