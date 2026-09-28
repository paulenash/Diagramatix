/**
 * "Link the prompt and save the result" — what happens when an AI generation
 * lands on a diagram, in ONE place (2026-09-28, mobile voice stage 1).
 *
 * These rules used to live only inside the desktop editor (applyAiResult +
 * ensureLinkedPrompt). The phone's server-side generate job needs exactly the
 * same ones, and a second copy drifts: the partner worker's already has (its
 * aiGeneration has no promptId). So the rules are pure functions here, and each
 * caller keeps only its own I/O:
 *   • desktop — promptLinkFetch.ts (fetch /api/prompts), then setData;
 *   • server  — promptLinkDb.ts (Prisma), then a compare-and-swap write.
 *
 * Rules (Paul, 2026-07-26 — "auto-save a Prompt every time"):
 *   • generated from an UNCHANGED saved Prompt → link to it, never overwrite;
 *   • else reuse this diagram's own auto-created Prompt (update its text) or
 *     create one (auto-named from the diagram title). One linked prompt per diagram.
 */
import type { AiApplyMeta, AiGeneration, DiagramData } from "@/app/lib/diagram/types";
import {
  AI_PROMPT_ANNOTATION_ID, buildPromptAnnotation, contentBBox,
  stripPromptAnnotations, stripPromptAnnotationConnectors,
} from "./promptAnnotation";

export type PlanJson = NonNullable<AiApplyMeta["planJson"]>;

/** The Prompt row a generation ends up linked to. */
export interface LinkedPrompt { id: string; name: string; autoNamed: boolean }

/** What a newly created, auto-named Prompt row holds. */
export interface CreatePromptBody {
  name: string;
  text: string;
  diagramType: string;
  planJson?: PlanJson;
  // How the text was written. Omitted fields stay NULL rather than defaulting
  // to "typed" — an auto-created prompt whose provenance nobody reported is
  // genuinely unknown.
  source?: "typed" | "dictated";
  fromImage?: true;
  refined?: true;
}

/**
 * What to do about the Prompt row. `link` and `update` both carry the create
 * that replaces them when their prompt has been DELETED: a diagram pointing at
 * a prompt nobody can open helps no one. (Another editor's prompt is not gone —
 * it stays linked; see promptLinkFetch.ts / promptLinkDb.ts.)
 */
export type PromptLinkAction =
  | { kind: "link"; linked: LinkedPrompt; orCreate: CreatePromptBody }
  | { kind: "update"; linked: LinkedPrompt; text: string; planJson?: PlanJson; orCreate: CreatePromptBody }
  | { kind: "create"; body: CreatePromptBody };

/** "<diagram title> — AI prompt". */
export function autoPromptName(diagramName: string): string {
  return `${(diagramName || "Untitled").trim()} — AI prompt`;
}

/** Rule 1 — which Prompt row this generation links to. */
export function decidePromptLink(a: {
  meta: AiApplyMeta;
  /** The diagram's CURRENT aiGeneration, before this generation. */
  prev: AiGeneration | undefined;
  diagramName: string;
  diagramType: string;
}): PromptLinkAction {
  const { meta, prev } = a;
  // Auto-persist the generated plan (when the generator supplied one) onto
  // the linked Prompt so the diagram retains its plan for re-layout /
  // inspection without re-calling the model. Only auto-named prompts are
  // (over)written — a user's own saved Prompt is never modified.
  const planField = meta.planJson ? { planJson: meta.planJson } : {};
  const create: CreatePromptBody = {
    name: autoPromptName(a.diagramName), text: meta.promptText, diagramType: a.diagramType, ...planField,
    // Whatever the panel knew.
    ...(meta.promptSource ? { source: meta.promptSource } : {}),
    ...(meta.promptFromImage ? { fromImage: true } : {}),
    ...(meta.promptRefined ? { refined: true } : {}),
  };
  if (meta.selectedPromptId && meta.selectedPromptUnchanged) {
    return {
      kind: "link",
      linked: { id: meta.selectedPromptId, name: meta.selectedPromptName ?? "Saved prompt", autoNamed: false },
      orCreate: create,
    };
  }
  if (prev?.promptId && prev.autoNamed) {
    return {
      kind: "update",
      linked: { id: prev.promptId, name: prev.promptName, autoNamed: true },
      text: meta.promptText, ...planField,
      orCreate: create,
    };
  }
  return { kind: "create", body: create };
}

/**
 * Rule 2 — the diagram's new aiGeneration record. No linked prompt (the link
 * failed) keeps the previous record: the diagram still changes, but nothing
 * claims a prompt that was never saved.
 */
export function nextAiGeneration(a: {
  prev: AiGeneration | undefined;
  linked: LinkedPrompt | null;
  meta: AiApplyMeta;
  /** ISO time of this generation (injected, so the rule stays pure). */
  generatedAt: string;
}): AiGeneration | undefined {
  const { prev, linked, meta } = a;
  if (!linked) return prev;
  return {
    promptId: linked.id, promptName: linked.name, promptText: meta.promptText,
    model: meta.model, generatedAt: a.generatedAt, autoNamed: linked.autoNamed,
    // Keep the plan ON THE DIAGRAM. It was only ever written to the linked
    // Prompt, so regenerating in the editor silently dropped the diagram's
    // own copy — and the Properties panel then said, correctly by its own
    // reading and uselessly to anyone looking at it, that the diagram it
    // had just regenerated had no plan.
    ...(meta.planJson ? { plan: meta.planJson } : {}),
    // A regeneration does not change WHICH repository prompt this diagram
    // came from. Dropping the stamp lost the template-version warning for
    // good the first time anyone regenerated.
    ...(prev?.source ? { source: prev.source } : {}),
    // Free Form and the image travel with the diagram, so a re-generate
    // can offer both again (Paul, 2026-09-28).
    ...(meta.freeForm !== undefined ? { freeForm: meta.freeForm } : {}),
    ...(meta.promptFromImage !== undefined ? { fromImage: meta.promptFromImage } : {}),
    // An image ALREADY kept (it has a stored id) is recorded with the
    // generation — the phone's photo (its run saves on the server), or an image
    // a desktop re-generate re-attached. One still to upload lands afterwards
    // on the desktop (SET_AI_SOURCE_IMAGE, matched by generatedAt).
    ...(meta.sourceImage?.storedId ? {
      sourceImage: {
        id: meta.sourceImage.storedId, name: meta.sourceImage.name, mimeType: meta.sourceImage.mediaType,
        ...(meta.sourceImage.width ? { width: meta.sourceImage.width } : {}),
        ...(meta.sourceImage.height ? { height: meta.sourceImage.height } : {}),
      },
    } : {}),
  };
}

/**
 * Rule 3 — the generated diagram merged into the current one. Replaces the
 * content (elements, connectors, viewport, Free Form, the aiGeneration record)
 * and keeps every other diagram-level field — title, fonts, PCF link, the
 * "show prompt" setting — exactly as it was.
 */
export function mergeGeneratedDiagram(a: {
  current: DiagramData;
  generated: DiagramData;
  aiGeneration: AiGeneration | undefined;
  /** Absent when the result is not a real generation (no prompt to show). */
  meta: AiApplyMeta | undefined;
}): DiagramData {
  const { current: data, generated: aiData, aiGeneration, meta } = a;
  const prevAnnotation = (data.elements ?? []).find((e) => e.id === AI_PROMPT_ANNOTATION_ID) ?? null;
  let elements = stripPromptAnnotations(aiData.elements);
  // The on-canvas prompt annotation is OFF by default now — only add it when the
  // user has explicitly ticked "Show original generation prompt".
  if (aiGeneration && meta && data.showAiPromptAnnotation === true) {
    elements = [buildPromptAnnotation(
      { name: aiGeneration.promptName, text: aiGeneration.promptText, generatedAt: aiGeneration.generatedAt },
      contentBBox(elements),
      prevAnnotation,
    ), ...elements];
  }
  return {
    ...data,
    elements,
    // Drop the legacy R56 association that linked the old "AI Generated" note
    // to the start event — its note element is stripped above, so the line
    // would otherwise dangle.
    connectors: stripPromptAnnotationConnectors(aiData.connectors),
    viewport: aiData.viewport ?? data.viewport,
    // Free Form asked for stays Free Form even when the model returned no
    // positions to reproduce — it used to be overwritten with nothing.
    relaxedLayout: aiData.relaxedLayout ?? (meta?.freeForm ? true : undefined),
    aiGeneration,
  };
}
