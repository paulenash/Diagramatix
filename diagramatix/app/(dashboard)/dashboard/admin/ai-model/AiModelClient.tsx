"use client";

import { useState } from "react";
import Link from "next/link";
import type { AiModel } from "@/app/lib/ai/models";
import { pricingFor, typicalCost, TYPICAL_GEN, PRICING_SNAPSHOT_DATE } from "@/app/lib/ai/pricing";

const fmtRate = (n: number) => `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
const fmtCost = (n: number) => (n < 0.01 ? `${(n * 100).toFixed(2)}¢` : `$${n.toFixed(3)}`);

export function AiModelClient({ models, initialModel, initialVisionModel }: {
  models: AiModel[];
  initialModel: string;
  initialVisionModel: string;
}) {
  const [model, setModel] = useState(initialModel);
  const [savedModel, setSavedModel] = useState(initialModel);
  const [visionModel, setVisionModel] = useState(initialVisionModel);
  const [savedVision, setSavedVision] = useState(initialVisionModel);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = model !== savedModel || visionModel !== savedVision;

  // The default model can't read images, and there's no vision override → image
  // → diagram will fail. Surface it so the admin sets a vision model.
  const defaultIsTextOnly = models.find((m) => m.id === model)?.vision === false;
  const needsVision = defaultIsTextOnly && !visionModel;
  // Kimi (Moonshot) models are ~3–4 min per generation and exceed Azure's ~230s
  // request limit, so they time out in production. Warn when one is the default.
  const defaultIsMoonshot = models.find((m) => m.id === model)?.provider === "moonshot";
  const hasMoonshot = models.some((m) => m.provider === "moonshot");
  // Only vision-capable (or unknown) models are valid as the Vision model.
  const visionChoices = models.filter((m) => m.vision !== false);

  // Cost comparison — the priced models, scaled to the dearest output rate so the
  // bars read "how expensive relative to the priciest". Models with no known price
  // (e.g. kimi-latest, which floats to Moonshot's flagship) show "varies".
  const priced = models.map((m) => ({ m, p: pricingFor(m.id) }));
  const maxRate = Math.max(1, ...priced.flatMap(({ p }) => (p ? [p.in, p.out] : [])));

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/admin/ai-model", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, visionModel }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Failed to save"); return; }
      if (typeof j.model === "string") setSavedModel(j.model);
      if (typeof j.visionModel === "string") { setSavedVision(j.visionModel); setVisionModel(j.visionModel); }
    } catch {
      setErr("Network error");
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/dashboard/admin" className="text-sm text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      <h1 className="text-lg font-semibold text-gray-900 mt-2">AI Models Selection</h1>
      <p className="text-sm text-gray-600 mt-1">
        The model used for AI diagram generation (BPMN + flowchart), for every user. Includes
        Moonshot / Kimi models when <code className="text-xs">MOONSHOT_API_KEY</code> is set (reached
        via Kimi&rsquo;s Anthropic-compatible endpoint), plus any local / self-hosted models
        (via <code className="text-xs">AI_CUSTOM_MODELS</code> + <code className="text-xs">ANTHROPIC_BASE_URL</code>).
        The &ldquo;Compare selected models&rdquo; tool (in the AI panel) lets you tick which of
        these to run head-to-head, each on its own provider&rsquo;s key.
      </p>

      <div className="mt-5 bg-white border border-gray-200 rounded-lg p-4">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Default model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}{m.provider === "moonshot" ? " — slow (~4 min)" : ""}{m.vision === false ? " — text only" : ""}</option>
          ))}
        </select>
        <p className="text-[11px] text-gray-400 mt-2">Model id: <code>{model}</code></p>
        {defaultIsMoonshot && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
            ⚠ Kimi (Moonshot) models take <strong>~3–4 minutes per generation</strong> and exceed
            Azure&rsquo;s ~230-second request limit, so they <strong>time out in production</strong>.
            Best for local, single generations — not recommended as the production default or in Compare.
          </p>
        )}
      </div>

      {/* Vision model — used ONLY for image → diagram, when the default can't see. */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Vision model <span className="normal-case text-gray-400">(image → diagram only)</span></label>
        <select
          value={visionModel}
          onChange={(e) => setVisionModel(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
        >
          <option value="">— Use the default model —</option>
          {visionChoices.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <p className="text-[11px] text-gray-400 mt-2">
          Only used when a user drops an <strong>image</strong> to reproduce. Leave on
          &ldquo;Use the default model&rdquo; unless your default model can&rsquo;t read images
          (e.g. a text-only Kimi model) — then pick a vision-capable model here.
        </p>
        {needsVision && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
            ⚠ Your default model is <strong>text-only</strong>, so image → diagram will fail. Pick a
            vision model above (or choose a vision-capable default).
          </p>
        )}
      </div>

      {/* Cost comparison — a static reference snapshot so the choice above is made
          with pricing in view. Output tokens dominate generation cost, so the bars
          are scaled to the dearest output rate. */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          Cost comparison <span className="normal-case text-gray-400">(USD per 1M tokens)</span>
        </label>
        <table className="w-full text-[12px] mt-2">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="py-1 pr-2 font-medium">Model</th>
              <th className="py-1 px-2 font-medium w-[38%]">Input</th>
              <th className="py-1 px-2 font-medium w-[38%]">Output</th>
              <th className="py-1 pl-2 font-medium text-right whitespace-nowrap">≈ / generation</th>
            </tr>
          </thead>
          <tbody>
            {priced.map(({ m, p }) => (
              <tr key={m.id} className={`border-b border-gray-50 ${m.id === model ? "bg-green-50/60" : ""}`}>
                <td className="py-1.5 pr-2 font-medium text-gray-800 whitespace-nowrap">
                  {m.label}
                  {m.provider === "moonshot" && <span className="ml-1 text-[9px] text-purple-600 bg-purple-50 border border-purple-200 rounded px-1" title="Kimi/Moonshot: ~3–4 min per generation; times out on Azure (~230s limit). Best for local single generations.">Kimi · slow</span>}
                  {m.id === model && <span className="ml-1 text-[9px] text-green-700">● default</span>}
                </td>
                {p ? (
                  <>
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden"><div className="h-full bg-sky-400" style={{ width: `${(p.in / maxRate) * 100}%` }} /></div>
                        <span className="text-gray-600 tabular-nums w-9 text-right">{fmtRate(p.in)}</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${(p.out / maxRate) * 100}%` }} /></div>
                        <span className="text-gray-600 tabular-nums w-9 text-right">{fmtRate(p.out)}</span>
                      </div>
                    </td>
                    <td className="py-1.5 pl-2 text-right text-gray-800 tabular-nums whitespace-nowrap">{fmtCost(typicalCost(p))}</td>
                  </>
                ) : (
                  <td colSpan={3} className="py-1.5 px-2 text-gray-400 italic">varies — floats to the provider&rsquo;s current rate</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-gray-400 mt-2">
          Static snapshot ({PRICING_SNAPSHOT_DATE}) — verify at anthropic.com/pricing and platform.kimi.ai.
          &ldquo;≈ / generation&rdquo; assumes ~{(TYPICAL_GEN.inTokens / 1000)}K input + {(TYPICAL_GEN.outTokens / 1000)}K output tokens (a typical BPMN prompt);
          output tokens dominate the cost.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || busy}
          className="px-3 py-1.5 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {!dirty && <span className="text-xs text-green-700">✓ Saved</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}
