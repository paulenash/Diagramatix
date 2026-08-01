/**
 * SOP prose generator — the AI companion to the deterministic `extractSkeleton`.
 * Takes a SopSkeleton (the never-hallucinated structured extraction) + the
 * resolved template's section list + an editable briefing, and returns the SOP
 * as an ordered list of { heading, body } markdown sections ready to store as
 * SopSection rows and edit in-app.
 *
 * Mirrors staffNarrative.ts: default briefing in code, admin additions from a
 * DiagramRules row (category="sop"), skeleton as the user message. Keep the
 * Anthropic-facing logic here so the route stays thin.
 */
import { makeAiClient } from "@/app/lib/ai/anthropicClient";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import type { SopSkeleton } from "@/app/lib/sop/skeleton";
import type { SopTemplateSpec } from "@/app/lib/sop/defaultTemplate";

export const DEFAULT_SOP_BRIEFING = `You write clear, professional Standard Operating Procedures (SOPs) for an organisation, from a structured description of a business process.

GROUNDING — CRITICAL
- Use ONLY the facts in the process data provided (the JSON). Do NOT invent steps, roles, systems, inputs, outputs, decisions or hand-offs that are not present.
- Preserve step numbers EXACTLY. Each step carries a global number ("globalNo"); use it verbatim. A role-scoped SOP will show a non-contiguous set (e.g. steps 1, 3, 7) — that is correct; never renumber to 1, 2, 3.

VOICE & STYLE
- Third person, present tense, active voice. Name the responsible role for each step ("The Requester raises …").
- Plain, procedural language. Short sentences. No BPMN jargon — never write "pool", "lane", "gateway", "sequence flow", "message"; describe what actually happens.
- Name IT systems by their product name; name documents/data explicitly.

HAND-OFFS
- Where the data shows a hand-off, state it: "received from <Role>" / "handed off to <Role>", naming what is passed when known. For a role-scoped SOP the Hand-offs section must list both directions.

DECISIONS
- Write gateway decisions as plain "If <condition>, go to step N; otherwise …".

SECTIONS
- Produce exactly the sections listed in the template, in order, using the given headings. Follow each section's guidance. If a section's guidance says it may be omitted and there is no relevant data, return that section with an empty body.

OUTPUT FORMAT
- Return ONLY a JSON object: {"sections":[{"heading":"<exact heading>","body":"<GFM markdown>"}, ...]}.
- Each body is GitHub-flavoured markdown (lists, tables, bold). Do NOT include the heading inside the body. Do NOT wrap the JSON in code fences or add any prose before/after it.`;

/** Assemble the system prompt: default briefing + admin additions + the template's
 *  section list/guidance. Legacy handling isn't needed (new category). */
export function buildSopBriefing(stored: string | null | undefined, template: SopTemplateSpec): string {
  const additions = (stored ?? "").trim();
  const sectionList = template.sections
    .map((s, i) => `${i + 1}. "${s.heading}" — ${s.guidance}`)
    .join("\n");
  const templateBlock = `\n\n## Template — produce these sections in this order\n${sectionList}${template.boilerplate ? `\n\n## House boilerplate\n${template.boilerplate}` : ""}`;
  const additionsBlock = additions ? `\n\n## Additional Rules — house style\n${additions}` : "";
  return `${DEFAULT_SOP_BRIEFING}${templateBlock}${additionsBlock}`;
}

export interface SopSectionOut { heading: string; body: string }
export type GenerateSopResult =
  | { ok: true; sections: SopSectionOut[]; model: string }
  | { ok: false; status: number; error: string };

/** Strip a ```json … ``` fence if the model added one, then parse. */
function parseSections(text: string): SopSectionOut[] | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const obj = JSON.parse(t);
    const arr = Array.isArray(obj) ? obj : obj?.sections;
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((s) => s && typeof s.heading === "string")
      .map((s) => ({ heading: String(s.heading), body: String(s.body ?? "") }));
  } catch {
    return null;
  }
}

export async function generateSop(args: {
  apiKey: string;
  skeleton: SopSkeleton;
  briefing: string;
}): Promise<GenerateSopResult> {
  const { apiKey, skeleton, briefing } = args;
  const model = await getAiGenerateModel();
  const client = makeAiClient(model, apiKey);
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: briefing.trim() || DEFAULT_SOP_BRIEFING,
      messages: [{ role: "user", content: `Process data (JSON):\n\n${JSON.stringify(skeleton, null, 2)}` }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { ok: false, status: 500, error: "No response from AI" };
    }
    const sections = parseSections(textBlock.text);
    if (!sections || sections.length === 0) {
      return { ok: false, status: 502, error: "AI returned an unparseable SOP" };
    }
    return { ok: true, sections, model };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 500, error: `SOP generation failed: ${msg}` };
  }
}
