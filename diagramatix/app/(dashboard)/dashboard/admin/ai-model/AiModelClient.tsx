"use client";

import { useState } from "react";
import Link from "next/link";
import type { AiModel } from "@/app/lib/ai/models";

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
  // Only vision-capable (or unknown) models are valid as the Vision model.
  const visionChoices = models.filter((m) => m.vision !== false);

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
      <h1 className="text-lg font-semibold text-gray-900 mt-2">AI Generate Model</h1>
      <p className="text-sm text-gray-600 mt-1">
        The model used for AI diagram generation (BPMN + flowchart), for every user. Includes
        Moonshot / Kimi models when <code className="text-xs">MOONSHOT_API_KEY</code> is set (reached
        via Kimi&rsquo;s Anthropic-compatible endpoint), plus any local / self-hosted models
        (via <code className="text-xs">AI_CUSTOM_MODELS</code> + <code className="text-xs">ANTHROPIC_BASE_URL</code>).
        The &ldquo;Compare all models&rdquo; tool runs every model listed here (each on its own
        provider&rsquo;s key).
      </p>

      <div className="mt-5 bg-white border border-gray-200 rounded-lg p-4">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Default model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}{m.vision === false ? " — text only" : ""}</option>
          ))}
        </select>
        <p className="text-[11px] text-gray-400 mt-2">Model id: <code>{model}</code></p>
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
