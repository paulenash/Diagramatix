/**
 * Is what I am looking at written to a standard that has since moved?
 *
 * There are three artefacts in a chain, each generated from the one before it:
 *
 *     master prompt template  →  value-chain prompt  →  generated diagram
 *
 * Change the template and every prompt below it is out of date. Regenerate a
 * prompt and every diagram below THAT is out of date. Neither said so, and the
 * cost was real: Paul regenerated V22 twice for the same thirteen diagnostics
 * because the prompts predated the fix, and V22.04 and V22.06 cannot be
 * re-measured at all because they were generated minutes before plan storage
 * shipped — a fact only discoverable by comparing a file's timestamp against a
 * deploy log.
 *
 * Paul, 2026-09-06: "Can we mark Value Chains that have not had their prompts
 * regenerated since a Master Prompt change… if a Value Chain is chosen be more
 * specific about which Diagram are in need of new Prompts" and "any existing
 * diagram that was regenerated before the prompt regeneration timestamp must
 * also have a message added in the diagram properties panel."
 *
 * So both directions are answered here, in one place, so the chain badge, the
 * per-prompt badge, the "Needs attention" tick and the diagram's own warning
 * cannot disagree about what "stale" means.
 */
import { promptIsStale, latestTemplateVersion, type MdPromptType } from "./promptTemplates";

// ─────────────────────────────────────────────────────────────────────────────
// Level 1 — a value chain against the master template
// ─────────────────────────────────────────────────────────────────────────────

export interface StalenessProcess { code: string; title: string }
export interface StalenessPrompt {
  type: MdPromptType;
  processCode: string;
  generatedAt: string | Date | null;
}

export interface ChainStaleness {
  /** Processes whose BPMN prompt predates the current template. */
  stale: StalenessProcess[];
  /** Processes with no BPMN prompt at all — a different fault, the same remedy. */
  missing: StalenessProcess[];
  /** Chain-level prompts (value-chain, ArchiMate, …) that predate the template. */
  staleChainPrompts: MdPromptType[];
  /** Everything above, as one number for a badge. */
  count: number;
  /** The template version they should have been written to. */
  currentVersion: number;
  currentVersionAt: string;
}

/**
 * Which of a chain's diagrams need new prompts — named, not counted.
 *
 * A count tells you to do something; the names tell you what. Paul's ask was
 * explicitly for the second, because "12 prompts are stale" across 26 chains is
 * a number nobody can act on one diagram at a time.
 */
export function chainStaleness(
  processes: StalenessProcess[],
  prompts: StalenessPrompt[],
  type: MdPromptType = "bpmn",
): ChainStaleness {
  const byProcess = new Map(
    prompts.filter((p) => p.type === type && p.processCode).map((p) => [p.processCode, p]),
  );
  const stale: StalenessProcess[] = [];
  const missing: StalenessProcess[] = [];
  for (const proc of processes) {
    const p = byProcess.get(proc.code);
    if (!p) missing.push(proc);
    else if (promptIsStale(type, p.generatedAt)) stale.push(proc);
  }
  // A chain-level prompt has no processCode. Its staleness matters too — the
  // value-chain prompt is what the whole chain's narrative is drawn from.
  const staleChainPrompts = prompts
    .filter((p) => !p.processCode && promptIsStale(p.type, p.generatedAt))
    .map((p) => p.type);

  const v = latestTemplateVersion(type);
  return {
    stale, missing, staleChainPrompts,
    count: stale.length + missing.length + staleChainPrompts.length,
    currentVersion: v.version,
    currentVersionAt: v.at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Level 2 — a generated diagram against the prompt it came from
// ─────────────────────────────────────────────────────────────────────────────

export interface DiagramFreshnessInput {
  /** When this diagram was generated. */
  diagramGeneratedAt?: string | Date | null;
  /** When the value-chain prompt it came from was LAST regenerated. */
  promptRegeneratedAt?: string | Date | null;
  /** The master template version the diagram's prompt was written to, if stamped. */
  templateVersionAtGeneration?: number | null;
  /** The current master template version. */
  currentTemplateVersion?: number | null;
  /** Whether the diagram stored the AI plan that produced it. */
  hasPlan?: boolean;
  /** The diagram's type, for the template comparison. */
  type?: MdPromptType;
}

export interface FreshnessNote {
  /** `warn` = act on it. `info` = worth knowing, costs nothing to ignore. */
  level: "warn" | "info";
  text: string;
}

/**
 * What the Properties panel should say about a generated diagram, if anything.
 *
 * Returns [] for a diagram that is current — silence is the right answer for
 * the common case, and a panel that always says something trains people to stop
 * reading it.
 */
export function diagramFreshness(input: DiagramFreshnessInput): FreshnessNote[] {
  const notes: FreshnessNote[] = [];
  const at = (v: string | Date | null | undefined) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const made = at(input.diagramGeneratedAt);
  const prompt = at(input.promptRegeneratedAt);

  // The headline: the prompt moved after this diagram was drawn, so the diagram
  // is a picture of an instruction that no longer exists.
  if (made && prompt && prompt.getTime() > made.getTime()) {
    notes.push({
      level: "warn",
      text: `The prompt this diagram came from was regenerated on ${fmt(prompt)}, after this `
        + `diagram was generated on ${fmt(made)}. Regenerate the diagram to pick up the change.`,
    });
  }

  // The template moved but the prompt has not caught up — a level further back,
  // and worth saying separately because the remedy is different: regenerate the
  // PROMPT first, then the diagram.
  const vAt = input.templateVersionAtGeneration;
  const vNow = input.currentTemplateVersion;
  if (typeof vAt === "number" && typeof vNow === "number" && vNow > vAt) {
    notes.push({
      level: "warn",
      text: `Generated from master template v${vAt}; the current template is v${vNow}. `
        + `Regenerate this chain's prompts, then this diagram.`,
    });
  }

  // Not a defect, but the thing that made V22.04 and V22.06 unmeasurable: no
  // stored plan means the diagram cannot be replayed against a changed layout,
  // and the only way to test a fix on it is to spend an AI call.
  if (input.hasPlan === false) {
    notes.push({
      level: "info",
      text: "No AI plan was stored with this diagram, so it cannot be re-laid-out offline "
        + "to test a layout change. Regenerating it stores one.",
    });
  }
  return notes;
}

function fmt(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
