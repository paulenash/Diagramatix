/**
 * Server-side "AI Generate for one diagram" — takes a diagram type + a prompt and
 * returns a fully laid-out `DiagramData`, branching to the SAME pipeline the editor
 * uses per type:
 *   - BPMN  → planBpmn() → layoutBpmnDiagram()          (as generate-bpmn/compare)
 *   - other → planGeneric() → layoutGenericDiagram()     (as AiPanel + the miner)
 *
 * This is the reusable core the batch "Create Project Diagrams from .md" tool loops
 * over, once per prompt. Rules must already be green-filtered (loadAiRulesForType),
 * and the model + apiKey resolved by the caller — this function is deliberately dumb.
 */
import { planBpmn } from "./planBpmn";
import { planGeneric } from "./planGeneric";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import type { DiagramData } from "@/app/lib/diagram/types";

export interface GenerateDiagramInput {
  diagramType: string;
  prompt: string;
  model: string;
  apiKey: string;
  rules: string;
  /** Shown in BPMN layout tracing / used as the label when captured. */
  promptLabel?: string;
}

// Auto-correct the same process-context cases the generate-diagram route fixes
// inline (planGeneric doesn't, so we replicate it here for parity).
const HOURGLASS_KEYWORDS =
  /\b(scheduler|schedule|scheduled|timer|timed|cron|periodic|recurring|daily|weekly|monthly|yearly|annual|trigger|auto.?schedul)/i;
const SYSTEM_KEYWORDS =
  /\b(system|app|application|platform|database|db|erp|crm|saas|api|server|service|tool|software|engine|portal|gateway)\b/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseProcessContext(elements: any[]): void {
  for (const el of elements) {
    if (typeof el?.label !== "string") continue;
    if ((el.type === "actor" || el.type === "system") && HOURGLASS_KEYWORDS.test(el.label)) {
      el.type = "hourglass";
    } else if (el.type === "actor" && SYSTEM_KEYWORDS.test(el.label)) {
      el.type = "system";
    }
  }
}

/**
 * Generate + lay out a single diagram from a prompt. Throws on failure (no plan,
 * unparseable JSON, BPMN plan error) so the batch loop can record it per-diagram.
 */
export async function generateDiagramData(input: GenerateDiagramInput): Promise<DiagramData> {
  const { diagramType, prompt, model, apiKey, rules, promptLabel } = input;

  if (diagramType === "bpmn") {
    const res = await planBpmn({ apiKey, prompt, rules, model });
    if (!res.ok) throw new Error(res.error || "BPMN plan failed");
    return layoutBpmnDiagram(res.plan.elements, res.plan.connections, { promptLabel });
  }

  const parsed = await planGeneric({ apiKey, model, diagramType, rules, prompt });
  if (!Array.isArray(parsed.elements)) parsed.elements = [];
  if (!Array.isArray(parsed.connections)) parsed.connections = [];
  if (diagramType === "process-context") normaliseProcessContext(parsed.elements);
  return layoutGenericDiagram(parsed, diagramType, {});
}
