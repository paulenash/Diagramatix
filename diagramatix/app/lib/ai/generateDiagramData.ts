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
import { planBpmn, pruneRedundantBpmnConnectors, type Attachment } from "./planBpmn";
import { planGeneric } from "./planGeneric";
import { layoutBpmnDiagram, type LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";
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
  /**
   * Anything the layout could not take at face value — a reference that names
   * nothing, an empty subprocess, an element nothing placed.
   *
   * A caller that ignores this gets the old behaviour: a diagram that looks
   * successful whatever went wrong. A caller generating fifteen diagrams
   * unattended should not ignore it.
   */
  onDiagnostic?: (d: LayoutDiagnostic) => void;
  /**
   * The RAW plan the model returned, before layout touched it.
   *
   * A saved diagram is the layout OUTPUT, and the input cannot be recovered from
   * it — most sharply for the thing that goes wrong most often. When the model
   * says `parentSubprocess: <EP>` and the layout fails to honour it, the saved
   * element's parentId is the LANE, so reconstructing a plan from the saved
   * diagram says "this task belongs to the lane" and the engine obliges. The
   * defect is erased by the act of saving it. Keeping the plan makes a bad
   * generation replayable offline, exactly, with no AI call.
   */
  onPlan?: (plan: unknown) => void;
  /**
   * A document or image to generate FROM, rather than only prose.
   *
   * `planBpmn` has always accepted one — a PDF as a native document block, an
   * image through the vision path, anything else as text — but this wrapper
   * did not forward it, so only callers reaching past it could send a
   * document. The partner API takes an SOP as its primary input, which is
   * what made the omission matter.
   */
  attachment?: Attachment;
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
  const { diagramType, prompt, model, apiKey, rules, promptLabel, onDiagnostic, onPlan, attachment } = input;

  if (diagramType === "bpmn") {
    const res = await planBpmn({ apiKey, prompt, rules, model, attachment });
    if (!res.ok) throw new Error(res.error || "BPMN plan failed");
    // Belt and braces on the redundant-gateway prune.
    //
    // planBpmn already runs it inside normaliseAiPlan, and it demonstrably
    // works: replaying V02.02's own stored plan through it removes both
    // gateways, and regenerating that prompt here with the same model produces
    // none. Yet the diagrams Paul generated in prod on 2026-09-03 carry the
    // shape — a decision with ONE outgoing branch running straight into its own
    // merge, in V02.02, V02.03 and V02.04 alike.
    //
    // I could not reconcile that by reading the code, so rather than leave it
    // to a theory this re-asserts the invariant at the last moment before
    // layout. The prune is idempotent, so on a healthy plan it is a no-op; if
    // something upstream ever hands over an unpruned plan again, the diagram is
    // still right. The plan is captured AFTER it, so what gets stored is what
    // was actually drawn.
    pruneRedundantBpmnConnectors(res.plan);
    onPlan?.(res.plan);
    return layoutBpmnDiagram(res.plan.elements, res.plan.connections, { promptLabel, onDiagnostic });
  }

  const parsed = await planGeneric({
    apiKey, model, diagramType, rules, prompt,
    // planGeneric takes pdf/text only — the vision path is BPMN-only today.
    attachment: attachment && attachment.type !== "image" ? attachment : undefined,
  });
  if (!Array.isArray(parsed.elements)) parsed.elements = [];
  if (!Array.isArray(parsed.connections)) parsed.connections = [];
  if (diagramType === "process-context") normaliseProcessContext(parsed.elements);
  onPlan?.(parsed);
  return layoutGenericDiagram(parsed, diagramType, {});
}
