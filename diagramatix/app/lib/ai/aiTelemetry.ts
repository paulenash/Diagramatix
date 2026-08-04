// Server-only. AI usage telemetry — records one AiInvocation row per logical AI
// call, written at the makeAiClient seam (app/lib/ai/anthropicClient.ts) so every
// one of the ~13 call sites is captured with no per-site token plumbing.
//
// Provider / model / tokens / retries / latency are known at the seam; the caller
// identity (userId / orgId) and the invocation-point label are supplied by the
// route via an AsyncLocalStorage context (set once with enterAiContext). Like
// recordAudit, recordAiInvocation NEVER throws — telemetry must not break a
// generation. The table is all-scalar, so a plain prisma.create is correct (no
// pgPool / raw SQL).
import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/app/lib/db";

/** Code labels for every place Diagramatix invokes the AI. These are code-defined
 *  call sites (not an admin catalog), so they live here as a const map. */
export const AI_INVOCATION_POINTS = {
  BpmnPlan: "bpmn.plan", // BPMN Plan (also the "Re-send to AI" button)
  BpmnGenerate: "bpmn.generate", // one-shot BPMN generate + layout
  BpmnCompare: "bpmn.compare", // SuperAdmin multi-model comparison (one row per model)
  BpmnRefine: "bpmn.refine", // clarifying-questions refine
  FlowchartPlan: "flowchart.plan",
  FlowchartToBpmnRefine: "flowchart.to-bpmn.refine", // label/subtype tidy
  DiagramGenerate: "diagram.generate", // generic/ArchiMate/context/value-chain/state-machine + vision
  MiningDiscover: "mining.discover", // AI process discovery (BPMN)
  MiningDiscoverSm: "mining.discover-sm", // AI state-machine discovery
  MiningExplain: "mining.explain", // plain-language mining explanation
  SimulationAssess: "simulation.assess", // as-is/to-be assessment
  StaffNarrative: "staff.narrative",
  GenerateSop: "sop.generate", // BPMN → SOP document prose (whole/lane/pool/subprocess)
  DictationRefine: "dictation.refine", // transcript clean-up / anonymise
  LiveCommand: "bpmn.live-command", // Abracadabra Mode: NL edit command → op list (Raw Attempt only)
  IconVectorize: "icon.vectorize", // ArchiMate icon image → editable vector primitives
  // Offline SuperAdmin harness scripts (npm run ai:report / ai:compare). They call
  // planBpmn directly — outside any route — so without their own label the seam
  // records them as "unknown". Distinct labels keep real user usage clean.
  ScriptConformanceReport: "script.ai-conformance", // npm run ai:report
  ScriptModelCompare: "script.ai-model-compare", // npm run ai:compare
} as const;

export type AiInvocationPoint =
  (typeof AI_INVOCATION_POINTS)[keyof typeof AI_INVOCATION_POINTS];

/** All labels, for tests + the report's invocation-point filter. */
export const AI_INVOCATION_POINT_VALUES: string[] = Object.values(AI_INVOCATION_POINTS);

/**
 * Invocation points that CONSUME a "User Attempt" — i.e. the routes that gate +
 * `recordUsage(userId, "aiAttempts")` on success. Used to DERIVE "User Attempts"
 * from AiInvocation rows in the usage report (a success at one of these points =
 * one User Attempt). Everything NOT in this set is a Raw Attempt only: AI Tidy
 * (`dictation.refine`), Icon Vectorize, SuperAdmin Compare, and the offline
 * `script.*` harnesses. MUST stay in lock-step with the routes that call
 * `recordUsage(..., "aiAttempts")` — guarded by a test.
 */
export const AI_USER_METERED_POINTS: ReadonlySet<string> = new Set<string>([
  AI_INVOCATION_POINTS.BpmnPlan,
  AI_INVOCATION_POINTS.BpmnGenerate,
  AI_INVOCATION_POINTS.BpmnRefine,
  AI_INVOCATION_POINTS.FlowchartPlan,
  AI_INVOCATION_POINTS.FlowchartToBpmnRefine,
  AI_INVOCATION_POINTS.DiagramGenerate,
  AI_INVOCATION_POINTS.StaffNarrative,
  AI_INVOCATION_POINTS.GenerateSop,
  AI_INVOCATION_POINTS.MiningDiscover,
  AI_INVOCATION_POINTS.MiningDiscoverSm,
  AI_INVOCATION_POINTS.MiningExplain,
]);

/** Friendly display names for the report, keyed by the stored value. */
export const AI_INVOCATION_POINT_LABELS: Record<string, string> = {
  [AI_INVOCATION_POINTS.BpmnPlan]: "BPMN Plan",
  [AI_INVOCATION_POINTS.BpmnGenerate]: "BPMN Generate",
  [AI_INVOCATION_POINTS.BpmnCompare]: "AI Compare",
  [AI_INVOCATION_POINTS.BpmnRefine]: "BPMN Refine",
  [AI_INVOCATION_POINTS.FlowchartPlan]: "Flowchart Plan",
  [AI_INVOCATION_POINTS.FlowchartToBpmnRefine]: "Flowchart→BPMN Refine",
  [AI_INVOCATION_POINTS.DiagramGenerate]: "Diagram Generate (ArchiMate/generic)",
  [AI_INVOCATION_POINTS.MiningDiscover]: "Mining Discover",
  [AI_INVOCATION_POINTS.MiningDiscoverSm]: "Mining State-Machine Discover",
  [AI_INVOCATION_POINTS.MiningExplain]: "Mining Explain",
  [AI_INVOCATION_POINTS.SimulationAssess]: "Simulation Assessment",
  [AI_INVOCATION_POINTS.StaffNarrative]: "Staff Narrative",
  [AI_INVOCATION_POINTS.GenerateSop]: "SOP Generate",
  [AI_INVOCATION_POINTS.DictationRefine]: "Dictation Refine",
  [AI_INVOCATION_POINTS.LiveCommand]: "Live Command (Abracadabra)",
  [AI_INVOCATION_POINTS.IconVectorize]: "ArchiMate Icon Vectorize",
  [AI_INVOCATION_POINTS.ScriptConformanceReport]: "AI Conformance Report (script)",
  [AI_INVOCATION_POINTS.ScriptModelCompare]: "AI Model Compare (script)",
};

/** Friendly label for a stored invocation-point value (falls back to the raw value). */
export function labelForInvocationPoint(point: string): string {
  return AI_INVOCATION_POINT_LABELS[point] ?? point;
}

export interface AiContext {
  userId?: string | null;
  orgId?: string | null;
  invocationPoint: string;
}

const aiContextStore = new AsyncLocalStorage<AiContext>();

/**
 * Set the AI context for the remainder of the current request. Uses
 * `enterWith` so a route only needs ONE line after it has resolved session +
 * org — no callback wrapper around the handler body. Each Next route handler runs
 * in its own async context, so this can't leak between requests.
 */
export function enterAiContext(ctx: AiContext): void {
  aiContextStore.enterWith(ctx);
}

/** Run `fn` within an explicit AI context (used by tests; routes prefer enterAiContext). */
export function runWithAiContext<T>(ctx: AiContext, fn: () => T): T {
  return aiContextStore.run(ctx, fn);
}

/** The active AI context, if any. */
export function currentAiContext(): AiContext | undefined {
  return aiContextStore.getStore();
}

export interface AiInvocationInput {
  provider: string;
  model: string;
  status: "success" | "failure";
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  retries?: number;
  truncated?: boolean;
  errorCode?: string | null;
  latencyMs?: number | null;
}

/**
 * Write one AiInvocation row, merging caller identity + invocation-point from the
 * AsyncLocalStorage context. NEVER throws. If no context is set (a call outside a
 * wrapped route), the row is still written with null user/org and an "unknown"
 * point — provider/model/tokens are never lost.
 */
export async function recordAiInvocation(row: AiInvocationInput): Promise<void> {
  const ctx = aiContextStore.getStore();
  try {
    await prisma.aiInvocation.create({
      data: {
        provider: row.provider,
        model: row.model,
        userId: ctx?.userId ?? null,
        orgId: ctx?.orgId ?? null,
        invocationPoint: ctx?.invocationPoint ?? "unknown",
        status: row.status,
        inputTokens: row.inputTokens ?? 0,
        outputTokens: row.outputTokens ?? 0,
        cacheReadTokens: row.cacheReadTokens ?? 0,
        cacheWriteTokens: row.cacheWriteTokens ?? 0,
        retries: row.retries ?? 0,
        truncated: row.truncated ?? false,
        errorCode: row.errorCode ?? null,
        latencyMs: row.latencyMs ?? null,
      },
    });
  } catch (e) {
    console.error("[ai-telemetry] failed to record", row.provider, row.model, e instanceof Error ? e.message : e);
  }
}

/** One "# diagrams generated using AI" statistic per generation event. Distinct
 *  from recordAiInvocation (which counts every provider call incl. refine / AI
 *  Tidy / failures): this fires ONLY when the user actually produces a diagram
 *  (one-shot Generate, the Plan-flow Apply step, Compare per model, AI-mode
 *  Mining discover). Counted per event — regenerating / re-applying the same
 *  diagram each add a row. Unlike recordAiInvocation, this has no AsyncLocalStorage
 *  context to read (some chokepoints — e.g. apply-layout — make no AI call), so
 *  the caller passes userId/orgId explicitly. NEVER throws. */
export interface DiagramGeneratedInput {
  userId?: string | null;
  orgId?: string | null;
  diagramType: string;
  /** bpmn-generate | diagram-generate | bpmn-apply | flowchart-apply | compare | mining-discover | mining-discover-sm */
  source: string;
}
export async function recordDiagramGenerated(row: DiagramGeneratedInput): Promise<void> {
  try {
    await prisma.aiDiagramGeneration.create({
      data: {
        userId: row.userId ?? null,
        orgId: row.orgId ?? null,
        diagramType: row.diagramType,
        source: row.source,
      },
    });
  } catch (e) {
    console.error("[ai-telemetry] failed to record diagram generation", row.source, e instanceof Error ? e.message : e);
  }
}
