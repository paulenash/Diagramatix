/**
 * "Link the prompt and save the result" — ONE set of rules for the desktop
 * editor and the phone's server-side generate job (2026-09-28, mobile voice
 * stage 1; plan: "the shared 'link and save' function tested once for both
 * callers"). They used to live only inside DiagramEditor.applyAiResult, and the
 * phone needs exactly the same ones.
 *
 * Pure: no database, no browser. The two I/O halves (fetch for the desktop,
 * Prisma for the server) are tested with a fake fetch here and against the real
 * test database in generate-job.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  autoPromptName, decidePromptLink, mergeGeneratedDiagram, nextAiGeneration,
} from "@/app/lib/ai/applyGeneration";
import { markPromptUsedFetch, runPromptLinkFetch } from "@/app/lib/ai/promptLinkFetch";
import { AI_PROMPT_ANNOTATION_ID } from "@/app/lib/ai/promptAnnotation";
import type { AiApplyMeta, AiGeneration, DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const plan = { elements: [{ id: "t1" }], connections: [] };
const meta = (m: Partial<AiApplyMeta> = {}): AiApplyMeta => ({ promptText: "A customer orders a pizza.", model: "claude-opus-5", ...m });
const prevAuto: AiGeneration = {
  promptId: "p-auto", promptName: "Orders — AI prompt", promptText: "old", model: "m0",
  generatedAt: "2026-09-01T00:00:00.000Z", autoNamed: true,
  source: { kind: "value-chain-library", chainCode: "V1", processCode: "V1.01", promptType: "bpmn", promptGeneratedAt: null, templateVersion: 3 },
};
const el = (id: string, x = 0): DiagramElement => ({ id, type: "task", x, y: 0, width: 100, height: 60, label: id, properties: {} } as unknown as DiagramElement);
const conn = (id: string, sourceId: string, targetId: string): Connector => ({ id, sourceId, targetId, type: "sequence-flow" } as unknown as Connector);

describe("T5005 — which prompt a generation links to (decidePromptLink)", () => {
  it("an UNCHANGED saved prompt is linked as it is — never overwritten", () => {
    const a = decidePromptLink({ meta: meta({ selectedPromptId: "s1", selectedPromptName: "Mine", selectedPromptUnchanged: true }), prev: prevAuto, diagramName: "Orders", diagramType: "bpmn" });
    expect(a.kind).toBe("link");
    if (a.kind !== "link") return;
    expect(a.linked).toEqual({ id: "s1", name: "Mine", autoNamed: false });
    expect(a.orCreate.name, "…with a fresh one ready if it has gone").toBe("Orders — AI prompt");
  });

  it("an edited saved prompt, on a diagram with its own auto-named prompt, UPDATES that one (text + plan)", () => {
    const a = decidePromptLink({ meta: meta({ selectedPromptId: "s1", selectedPromptUnchanged: false, planJson: plan }), prev: prevAuto, diagramName: "Orders", diagramType: "bpmn" });
    expect(a.kind).toBe("update");
    if (a.kind !== "update") return;
    expect(a.linked).toEqual({ id: "p-auto", name: "Orders — AI prompt", autoNamed: true });
    expect(a.text).toBe("A customer orders a pizza.");
    expect(a.planJson).toEqual(plan);
  });

  it("otherwise a new auto-named prompt is created, carrying how the words were written — and nothing it was not told", () => {
    const a = decidePromptLink({ meta: meta({ promptSource: "dictated", planJson: plan }), prev: undefined, diagramName: "  Orders  ", diagramType: "bpmn" });
    expect(a).toEqual({ kind: "create", body: { name: "Orders — AI prompt", text: "A customer orders a pizza.", diagramType: "bpmn", planJson: plan, source: "dictated" } });
    const b = decidePromptLink({ meta: meta({ promptFromImage: true, promptRefined: true }), prev: { ...prevAuto, autoNamed: false }, diagramName: "", diagramType: "bpmn" });
    expect(b).toEqual({ kind: "create", body: { name: "Untitled — AI prompt", text: "A customer orders a pizza.", diagramType: "bpmn", fromImage: true, refined: true } });
    expect(autoPromptName("")).toBe("Untitled — AI prompt");
  });
});

describe("T5006 — the diagram's new generation record (nextAiGeneration)", () => {
  const linked = { id: "p9", name: "Orders — AI prompt", autoNamed: true };

  it("no linked prompt keeps the previous record — nothing claims a prompt that was never saved", () => {
    expect(nextAiGeneration({ prev: prevAuto, linked: null, meta: meta({ planJson: plan }), generatedAt: "t" })).toBe(prevAuto);
    expect(nextAiGeneration({ prev: undefined, linked: null, meta: meta(), generatedAt: "t" })).toBeUndefined();
  });

  it("a new record: the prompt, model and time; the plan kept ON THE DIAGRAM; the repository stamp carried over", () => {
    const g = nextAiGeneration({ prev: prevAuto, linked, meta: meta({ planJson: plan }), generatedAt: "2026-09-28T02:00:00.000Z" });
    expect(g).toEqual({
      promptId: "p9", promptName: "Orders — AI prompt", promptText: "A customer orders a pizza.", model: "claude-opus-5",
      generatedAt: "2026-09-28T02:00:00.000Z", autoNamed: true, plan, source: prevAuto.source,
    });
  });

  it("Free Form and from-image are recorded only when the panel said — false included", () => {
    const g = nextAiGeneration({ prev: undefined, linked, meta: meta({ freeForm: false, promptFromImage: false }), generatedAt: "t" });
    expect(g).toMatchObject({ freeForm: false, fromImage: false });
    const h = nextAiGeneration({ prev: undefined, linked, meta: meta(), generatedAt: "t" })!;
    expect("freeForm" in h || "fromImage" in h || "plan" in h || "source" in h).toBe(false);
  });
});

describe("T5007 — the generated diagram merged into the current one (mergeGeneratedDiagram)", () => {
  const current = {
    elements: [el("old"), { ...el(AI_PROMPT_ANNOTATION_ID), type: "text-annotation" } as DiagramElement],
    connectors: [], viewport: { x: 5, y: 6, zoom: 2 },
    title: { text: "Keep me" }, fontSize: 13, relaxedLayout: true,
  } as unknown as DiagramData;
  const generated = {
    elements: [el("a"), el("b", 200), { ...el("_ai_gen_annotation"), type: "text-annotation" } as DiagramElement],
    connectors: [conn("c1", "a", "b"), conn("c2", "_ai_gen_annotation", "a")],
    viewport: undefined,
  } as unknown as DiagramData;
  const gen = { promptId: "p", promptName: "P", promptText: "t", model: "m", generatedAt: "2026-09-28T02:00:00.000Z" };

  it("replaces the content, keeps every other diagram-level field, and drops prompt notes and their lines", () => {
    const out = mergeGeneratedDiagram({ current, generated, aiGeneration: gen, meta: meta() });
    expect(out.elements.map((e) => e.id)).toEqual(["a", "b"]);
    expect(out.connectors.map((c) => c.id)).toEqual(["c1"]);
    expect((out as unknown as { title: unknown }).title).toEqual({ text: "Keep me" });
    expect((out as unknown as { fontSize: number }).fontSize).toBe(13);
    expect(out.viewport, "the old view when the generator gave none").toEqual({ x: 5, y: 6, zoom: 2 });
    expect(out.aiGeneration).toBe(gen);
  });

  it("Free Form: the generator's own flag wins; asked-for Free Form stays on; otherwise an old one is cleared", () => {
    expect(mergeGeneratedDiagram({ current, generated: { ...generated, relaxedLayout: false } as DiagramData, aiGeneration: gen, meta: meta() }).relaxedLayout).toBe(false);
    expect(mergeGeneratedDiagram({ current, generated, aiGeneration: gen, meta: meta({ freeForm: true }) }).relaxedLayout).toBe(true);
    expect(mergeGeneratedDiagram({ current, generated, aiGeneration: gen, meta: meta() }).relaxedLayout).toBeUndefined();
  });

  it("the prompt note is added only when “Show original generation prompt” is ticked, and only for a real generation", () => {
    const shown = { ...current, showAiPromptAnnotation: true } as DiagramData;
    expect(mergeGeneratedDiagram({ current: shown, generated, aiGeneration: gen, meta: meta() }).elements[0].id).toBe(AI_PROMPT_ANNOTATION_ID);
    expect(mergeGeneratedDiagram({ current: shown, generated, aiGeneration: gen, meta: undefined }).elements[0].id).toBe("a");
    expect(mergeGeneratedDiagram({ current, generated, aiGeneration: gen, meta: meta() }).elements[0].id).toBe("a");
  });

  it("a brand-new diagram with no data at all ({}) merges without error — the server job's case", () => {
    const out = mergeGeneratedDiagram({ current: {} as DiagramData, generated, aiGeneration: gen, meta: meta() });
    expect(out.elements.map((e) => e.id)).toEqual(["a", "b"]);
    expect(out.aiGeneration).toBe(gen);
  });
});

describe("T5008 — the desktop's half: the rule carried out through /api/prompts", () => {
  const res = (status: number, body: unknown = {}) => ({ ok: status < 300, status, json: async () => body }) as Response;

  it("a link writes nothing", async () => {
    const f = vi.fn();
    const linked = await runPromptLinkFetch({ kind: "link", linked: { id: "s1", name: "Mine", autoNamed: false }, orCreate: { name: "x", text: "y", diagramType: "bpmn" } }, f as unknown as typeof fetch);
    expect(linked).toEqual({ id: "s1", name: "Mine", autoNamed: false });
    expect(f).not.toHaveBeenCalled();
  });

  it("an update PUTs the text and plan; a prompt that has been DELETED (404 gone) is replaced by a new one, with its provenance", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return url.endsWith("/p-auto") ? res(404, { error: "Not found", gone: true }) : res(201, { id: "p-new", name: "Orders — AI prompt" });
    });
    const linked = await runPromptLinkFetch({
      kind: "update", linked: { id: "p-auto", name: "Orders — AI prompt", autoNamed: true }, text: "t", planJson: plan,
      orCreate: { name: "Orders — AI prompt", text: "t", diagramType: "bpmn", planJson: plan, source: "dictated" },
    }, f as unknown as typeof fetch);
    expect(linked).toEqual({ id: "p-new", name: "Orders — AI prompt", autoNamed: true });
    expect(calls[0].init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: "t", planJson: plan });
    expect(calls[1].url).toBe("/api/prompts");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ name: "Orders — AI prompt", text: "t", diagramType: "bpmn", planJson: plan, source: "dictated" });
  });

  it("another editor's prompt (404, not gone) keeps its link and creates nothing — no copy per regeneration (the 2026-09-28 review)", async () => {
    const f = vi.fn(async () => res(404, { error: "Not found", gone: false }));
    const kept = await runPromptLinkFetch({ kind: "update", linked: { id: "p-owner", name: "P", autoNamed: true }, text: "t", orCreate: { name: "P", text: "t", diagramType: "bpmn" } }, f as unknown as typeof fetch);
    expect(kept?.id).toBe("p-owner");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("an update that succeeds (or fails for another reason) keeps its link; a refused create or a network error is null", async () => {
    const ok = await runPromptLinkFetch({ kind: "update", linked: { id: "p", name: "P", autoNamed: true }, text: "t", orCreate: { name: "P", text: "t", diagramType: "bpmn" } }, (async () => res(500)) as unknown as typeof fetch);
    expect(ok?.id).toBe("p");
    expect(await runPromptLinkFetch({ kind: "create", body: { name: "P", text: "t", diagramType: "bpmn" } }, (async () => res(403)) as unknown as typeof fetch)).toBeNull();
    expect(await runPromptLinkFetch({ kind: "create", body: { name: "P", text: "t", diagramType: "bpmn" } }, (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBeNull();
  });

  it("a generation is counted against its prompt with the model, fire-and-forget", async () => {
    const f = vi.fn(async () => res(200));
    markPromptUsedFetch("p1", "claude-opus-5", f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith("/api/prompts/p1/used", expect.objectContaining({ method: "POST", body: JSON.stringify({ model: "claude-opus-5" }) }));
  });
});

describe("T5009 — both callers use the one rule set", () => {
  const ed = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
  const job = readFileSync("app/lib/ai/generateJob.ts", "utf8");

  it("the desktop editor decides, links, records and merges through applyGeneration.ts", () => {
    expect(ed).toContain("return runPromptLinkFetch(decidePromptLink({ meta, prev: data.aiGeneration, diagramName, diagramType }));");
    expect(ed).toContain("aiGeneration = nextAiGeneration({ prev: data.aiGeneration, linked, meta, generatedAt: new Date().toISOString() });");
    expect(ed).toContain("setData(mergeGeneratedDiagram({ current: data, generated: aiData, aiGeneration, meta }));");
    expect(ed, "no second copy of the record-building rule").not.toContain("promptId: linked.id");
    expect(ed, "no second copy of the create").not.toContain("fetch(`/api/prompts`");
  });

  it("the phone's server job uses the same three rules", () => {
    expect(job).toContain("decidePromptLink({ meta, prev: first.aiGeneration, diagramName: cur.name, diagramType: cur.type })");
    expect(job).toContain("nextAiGeneration({ prev: current.aiGeneration, linked, meta, generatedAt })");
    expect(job).toContain("mergeGeneratedDiagram({ current, generated, aiGeneration, meta })");
  });
});
