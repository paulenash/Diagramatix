/**
 * Description and/or document → a laid-out BPMN diagram + the partner payload.
 *
 * Deliberately knows nothing about HTTP, jobs, keys or persistence. Everything
 * that can go wrong in the interesting way goes wrong in here, so it is a plain
 * async function that can be unit-tested with a stubbed `planBpmn` — no server,
 * no database, no AI spend. The route around it does auth, quota and storage.
 *
 * The prompt it builds is the other reason this is its own file. A partner sends
 * facts, not a prompt, and turning those facts into an instruction the model
 * follows well is a thing we will tune repeatedly. Keeping it here means tuning
 * it does not mean touching a route.
 */
import type { Attachment } from "@/app/lib/ai/planBpmn";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";
import { generateDiagramData } from "@/app/lib/ai/generateDiagramData";
import { loadAiRulesForType } from "@/app/lib/ai/loadAiRules";
import { shapeResult, type PartnerProcessShape } from "./shapeResult";

export interface RunProcessMapInput {
  /** Prose describing the process. Either this or `attachment` is required. */
  description?: string;
  /** A document or image to work from. */
  attachment?: Attachment;
  /** A name for the process, used as the diagram name and to steer the model. */
  name?: string;
  model: string;
  apiKey: string;
  /** Progress, for a caller that wants to show a stage. */
  onStage?: (stage: RunStage) => void;
  /** Free text from the caller, appended to the prompt (v2/7). */
  instructions?: string;
  /** The raw plan, for storage — see `scripts/replay-diagram.ts`. */
  onPlan?: (plan: unknown) => void;
}

/** No "laying-out" stage: `generateDiagramData` plans and lays out in one
 *  call, so a stage between them could never fire — and a progress UI waiting
 *  for one that never arrives looks stuck. */
export type RunStage = "reading" | "planning" | "shaping";

export interface RunProcessMapResult {
  data: DiagramData;
  shape: PartnerProcessShape;
  diagnostics: LayoutDiagnostic[];
  /** The prompt actually sent, stored on the diagram so the customer can see
   *  what was asked and delete it with the diagram. */
  prompt: string;
}

/** Thrown for the cases a caller can act on; the route maps these to codes. */
export class ProcessMapError extends Error {
  constructor(public readonly code: "missing_input" | "ai_plan_failed", message: string) {
    super(message);
    this.name = "ProcessMapError";
  }
}

/**
 * Compose the instruction.
 *
 * The shape of this matters more than its length. Three things it does:
 *
 *  - It says what the OUTPUT is for. A model told "this feeds an automation
 *    readiness assessment" keeps roles and systems explicit, which is exactly
 *    what the payload reports and what a scorer needs.
 *  - It asks for lanes by name. The commonest disappointing result is one lane,
 *    and the commonest cause is a description that never said who does what —
 *    so the prompt asks for the performer of each step even when it has to be
 *    inferred, and `shapeResult` warns when it still ends up with one.
 *  - It leaves the BPMN rules alone. Those come from `loadAiRulesForType` and
 *    are the same ones the app itself generates under; a partner should not get
 *    a different dialect of our own notation.
 */
export function buildPrompt(input: { description?: string; name?: string; hasDocument: boolean; instructions?: string }): string {
  const parts: string[] = [];
  parts.push(
    "Model this business process as a BPMN diagram. The result is read by an automation-readiness assessment, so be explicit about WHO performs each step and WHICH systems are touched.",
  );
  if (input.name?.trim()) parts.push(`The process is called "${input.name.trim()}".`);
  if (input.hasDocument) {
    parts.push(
      "The attached document describes the process. Follow what it actually says — do not invent steps it does not mention, and do not omit steps it does.",
    );
  }
  if (input.description?.trim()) {
    parts.push(input.hasDocument ? "Additional context from the requester:" : "The process:");
    parts.push(input.description.trim());
  }
  parts.push(
    "Put each participant in their own lane, naming the role rather than a person. Where the narrative does not say who performs a step, infer the most likely role and use it consistently. Show every external party and IT system as its own pool.",
  );
  // The caller's own instructions go LAST, so they qualify everything above
  // rather than being qualified by it — "keep this at a high level" has to beat
  // our own request for explicit detail, or it does nothing (v2/7).
  if (input.instructions?.trim()) {
    parts.push("Additional instructions from the requesting application, which take precedence over the guidance above:");
    parts.push(input.instructions.trim());
  }
  return parts.join("\n\n");
}

export async function runProcessMap(input: RunProcessMapInput): Promise<RunProcessMapResult> {
  const description = input.description?.trim() ?? "";
  if (!description && !input.attachment) {
    throw new ProcessMapError("missing_input", "Supply a description, a document, or both.");
  }

  input.onStage?.("reading");
  // The same green-rule brief the app's own generation uses. A partner getting
  // a different set would produce diagrams that do not match the ones their
  // customer later opens in the editor.
  const rules = await loadAiRulesForType("bpmn");

  const prompt = buildPrompt({
    instructions: input.instructions,
    description,
    name: input.name,
    hasDocument: !!input.attachment,
  });

  input.onStage?.("planning");
  const diagnostics: LayoutDiagnostic[] = [];
  let data: DiagramData;
  try {
    data = await generateDiagramData({
      diagramType: "bpmn",
      prompt,
      attachment: input.attachment,
      model: input.model,
      apiKey: input.apiKey,
      rules,
      promptLabel: input.name ?? "partner process map",
      onDiagnostic: (d) => diagnostics.push(d),
      onPlan: input.onPlan,
    });
  } catch (err) {
    // The model failing to produce a usable plan is a caller-visible outcome,
    // not a bug — they sent something we could not model. Everything else is a
    // 500 and is left to propagate.
    throw new ProcessMapError(
      "ai_plan_failed",
      err instanceof Error && /plan|json|parse/i.test(err.message)
        ? "We could not build a process model from what was supplied. A clearer description, or a document with explicit steps, usually fixes it."
        : "We could not build a process model from what was supplied.",
    );
  }

  input.onStage?.("shaping");
  const shape = shapeResult(data, { diagramName: input.name });

  return { data, shape, diagnostics, prompt };
}
