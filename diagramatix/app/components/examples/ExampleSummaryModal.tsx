"use client";

/**
 * "What does this one show me?" — the question a catalog cannot answer with a
 * title and a paragraph.
 *
 * Both galleries offered a card and a Load button, and nothing between. A
 * capability that appears in exactly one example is invisible until you have
 * adopted all of them into projects you then have to clean up, so the cheapest
 * thing a browser could do was guess. This is the answer before the click.
 *
 * ONE COMPONENT, TWO SKINS. The Simulator gallery is black-and-green phosphor
 * and the Miner's is stone-and-amber; they are the same screen wearing
 * different paint, and forking the component would mean fixing every layout
 * bug twice and letting the two drift. `tone` selects the palette and nothing
 * else — no behaviour hangs off it.
 *
 * The feature list is fetched, never computed here: it is derived server-side
 * from the example's own package (and, for the Miner, from mining its sample
 * log), so what this shows and what the example actually does cannot disagree.
 */

import { useCallback, useEffect, useState } from "react";
import type { ExampleSummary } from "@/app/lib/exampleFeature";

export type SummaryTone = "amber" | "green";

interface Skin {
  panel: string;
  header: string;
  title: string;
  concept: string;
  groupTitle: string;
  featureLabel: string;
  featureDetail: string;
  where: string;
  prose: string;
  divider: string;
  close: string;
  primary: string;
  muted: string;
}

const SKIN: Record<SummaryTone, Skin> = {
  amber: {
    panel: "bg-stone-950 border-amber-500/40 shadow-[0_0_40px_rgba(180,83,9,0.25)]",
    header: "border-amber-500/25",
    title: "text-amber-100",
    concept: "text-amber-200/80",
    groupTitle: "text-amber-300/90 border-amber-500/25",
    featureLabel: "text-amber-100",
    featureDetail: "text-amber-200/70",
    where: "border-amber-500/40 text-amber-300/80",
    prose: "text-amber-200/70",
    divider: "border-amber-500/20",
    close: "text-amber-200/60 hover:text-amber-100",
    primary: "border-amber-500/60 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 shadow-[0_0_12px_rgba(180,83,9,0.25)]",
    muted: "text-amber-200/40",
  },
  green: {
    panel: "bg-black border-green-500/40 shadow-[0_0_40px_rgba(34,197,94,0.2)]",
    header: "border-green-500/25",
    title: "text-green-200",
    concept: "text-green-400/80",
    groupTitle: "text-green-300/90 border-green-500/25",
    featureLabel: "text-green-200",
    featureDetail: "text-green-400/70",
    where: "border-green-500/40 text-green-300/80",
    prose: "text-green-400/70",
    divider: "border-green-500/20",
    close: "text-green-400/60 hover:text-green-200",
    primary: "border-green-500/60 bg-green-500/10 text-green-300 hover:bg-green-500/20 shadow-[0_0_12px_rgba(34,197,94,0.2)]",
    muted: "text-green-400/40",
  },
};

export interface ExampleSummaryModalProps {
  /** Where to fetch the summary from — the per-example endpoint. */
  url: string;
  tone: SummaryTone;
  onClose: () => void;
  /** The gallery's own load action, offered here so reading and deciding are
   *  one gesture rather than two. Omitted → the modal is read-only. */
  onLoad?: () => void;
  loadLabel?: string;
  loading?: boolean;
}

export function ExampleSummaryModal({ url, tone, onClose, onLoad, loadLabel = "▶ Load & open", loading }: ExampleSummaryModalProps) {
  const s = SKIN[tone];
  const [data, setData] = useState<ExampleSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const fetchSummary = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Could not load the summary."); return; }
      setData(json as ExampleSummary);
    } catch {
      setErr("Could not load the summary.");
    } finally {
      setBusy(false);
    }
  }, [url]);

  useEffect(() => { void fetchSummary(); }, [fetchSummary]);

  // Escape closes. A modal that can only be dismissed by hitting a small × is
  // a modal people resize the window to escape from.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="What this example illustrates"
    >
      <div
        className={`relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-lg border font-mono flex flex-col ${s.panel}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-start gap-3 px-5 py-4 border-b ${s.header}`}>
          <div className="min-w-0">
            <h2 className={`text-lg font-semibold ${s.title}`}>{data?.title ?? "Loading…"}</h2>
            {data?.concept && <p className={`text-sm mt-1 ${s.concept}`}>{data.concept}</p>}
          </div>
          <button onClick={onClose} className={`ml-auto text-xl leading-none ${s.close}`} aria-label="Close">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {busy && <p className={`text-sm ${s.muted}`}>Reading the example…</p>}
          {err && <p className="text-sm text-red-300">{err}</p>}

          {data?.note && <p className={`text-sm leading-relaxed ${s.prose}`}>{data.note}</p>}

          {data?.groups.map((g) => (
            <section key={g.title}>
              <h3 className={`text-[11px] uppercase tracking-widest pb-1 mb-2 border-b ${s.groupTitle}`}>{g.title}</h3>
              <ul className="flex flex-col gap-3">
                {g.features.map((f) => (
                  <li key={f.id}>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${s.featureLabel}`}>{f.label}</span>
                      {/* Where to look, because a capability nobody can find is
                          the problem this whole screen exists to solve. */}
                      {f.where && (
                        <span className={`text-[10px] rounded border px-1.5 py-0.5 ${s.where}`}>{f.where}</span>
                      )}
                    </div>
                    <p className={`text-xs leading-relaxed mt-0.5 ${s.featureDetail}`}>{f.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {data?.descriptionHtml && (
            <section className={`pt-4 border-t ${s.divider}`}>
              <h3 className={`text-[11px] uppercase tracking-widest pb-1 mb-2 border-b ${s.groupTitle}`}>In full</h3>
              {/* Rendered AND sanitised server-side — see ExampleSummary. */}
              <div
                className={`text-xs leading-relaxed example-prose ${s.prose}`}
                dangerouslySetInnerHTML={{ __html: data.descriptionHtml }}
              />
            </section>
          )}
        </div>

        <div className={`flex items-center gap-2 px-5 py-3 border-t ${s.header}`}>
          {onLoad && (
            <button
              onClick={onLoad}
              disabled={loading}
              className={`rounded border px-3 py-1.5 text-sm disabled:opacity-50 ${s.primary}`}
            >
              {loading ? "◴ Loading…" : loadLabel}
            </button>
          )}
          <button onClick={onClose} className={`ml-auto text-sm ${s.close}`}>Close</button>
        </div>
      </div>

      {/* The catalog prose is markdown — lists and emphasis need spacing the
          surrounding utility classes do not give them. Scoped to this panel. */}
      <style>{`
        .example-prose p { margin: 0 0 0.6em; }
        .example-prose p:last-child { margin-bottom: 0; }
        .example-prose ul, .example-prose ol { margin: 0 0 0.6em 1.1em; list-style: disc; }
        .example-prose ol { list-style: decimal; }
        .example-prose li { margin: 0.2em 0; }
        .example-prose strong { font-weight: 600; }
        .example-prose em { font-style: italic; }
        .example-prose code { font-size: 0.95em; opacity: 0.9; }
      `}</style>
    </div>
  );
}
