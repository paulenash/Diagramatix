/**
 * The portable bundle stored on RiskControlExample.package — everything needed to
 * recreate a worked Risk & Control (GRC) example in a fresh project: the process
 * diagrams, a GRC library (risks/controls/policies/… + traceability links), a
 * label→codes map that attaches the library onto the real steps, and an optional
 * mining run (event log + reference State Machine) so control operating-
 * effectiveness lights up. Mirrors app/lib/mining/examplePackage.ts.
 */
import type { DiagramData } from "../diagram/types";
import type { LogMapping, MiningStats, Variant, Performance, GovernanceStats } from "../mining/types";
import type { SampleItem, SampleLink } from "./o2cSample";

export interface RcExampleDiagram {
  name: string;
  type: string;                 // bpmn | value-chain | process-context | archimate | context | state-machine …
  data: DiagramData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colorConfig?: any;
  displayMode?: string;
}

export interface RcExampleLibrary { name: string; items: SampleItem[]; links: SampleLink[]; }

export interface RcExampleMining {
  /** Which of the package's diagrams is the reference State Machine to conform
   *  against (matched by name; falls back to the first state-machine diagram). */
  referenceDiagramName: string;
  run: { name: string; mapping: LogMapping; stats: MiningStats; variants: Variant[]; performance: Performance; governance?: GovernanceStats };
}

export interface RiskControlExamplePackage {
  version: 1;
  diagrams: RcExampleDiagram[];
  library: RcExampleLibrary;
  /** step label → the Risk/Control codes to attach to it on adopt. */
  attach: Record<string, { risks?: string[]; controls?: string[] }>;
  mining?: RcExampleMining;
}

/** Structural validation — human-readable problems (empty = valid). */
export function validateRiskControlExamplePackage(pkg: unknown): string[] {
  const errs: string[] = [];
  if (!pkg || typeof pkg !== "object") return ["Package is not an object"];
  const p = pkg as Partial<RiskControlExamplePackage>;
  if (p.version !== 1) errs.push("Unsupported or missing package version");
  if (!Array.isArray(p.diagrams) || p.diagrams.length === 0) errs.push("`diagrams` must be a non-empty array");
  if (!p.library || typeof p.library !== "object") { errs.push("`library` is required"); return errs; }
  if (!Array.isArray(p.library.items) || p.library.items.length === 0) errs.push("`library.items` must be a non-empty array");
  const codes = new Set((p.library.items ?? []).map((i) => i.code));
  for (const ln of p.library.links ?? []) {
    if (!codes.has(ln.source) || !codes.has(ln.target)) errs.push(`link ${ln.source}→${ln.target} references an unknown item`);
  }
  if (p.mining) {
    if (!p.mining.referenceDiagramName) errs.push("`mining.referenceDiagramName` is required when mining is present");
    else if (!(p.diagrams ?? []).some((d) => d.name === p.mining!.referenceDiagramName && d.type === "state-machine")) {
      errs.push(`mining.referenceDiagramName "${p.mining.referenceDiagramName}" doesn't match a state-machine diagram`);
    }
    if (!Array.isArray(p.mining.run?.variants) || p.mining.run.variants.length === 0) errs.push("`mining.run.variants` must be non-empty");
  }
  return errs;
}

/** A small display summary for gallery cards. Tolerates a partial package. */
export function summarizeRiskControlPackage(pkg: Partial<RiskControlExamplePackage>): { diagrams: number; risks: number; controls: number; items: number; links: number; hasMining: boolean } {
  const items = pkg.library?.items ?? [];
  return {
    diagrams: pkg.diagrams?.length ?? 0,
    risks: items.filter((i) => i.kind === "Risk").length,
    controls: items.filter((i) => i.kind === "Control").length,
    items: items.length,
    links: pkg.library?.links?.length ?? 0,
    hasMining: !!pkg.mining,
  };
}
