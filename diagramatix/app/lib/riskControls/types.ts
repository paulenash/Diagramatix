/**
 * Client-safe types + constants for the Risk & Control catalog. Mirrors the
 * Prisma enums as plain string unions so client components never import the
 * generated Prisma client. Mirrors app/lib/entityLists/types.ts.
 *
 * A library holds Risks and Controls; a Control MITIGATES one or more Risks
 * (RiskControlLink). An Org holds a master library; a Project adopts a COPY.
 */

export type RiskControlKind = "Risk" | "Control" | "Policy" | "Regulation" | "AuditFinding" | "KRI" | "KPI";
export const RISK_CONTROL_KINDS: RiskControlKind[] = ["Risk", "Control", "Policy", "Regulation", "AuditFinding", "KRI", "KPI"];

export const KIND_LABEL: Record<RiskControlKind, string> = {
  Risk: "Risk", Control: "Control", Policy: "Policy", Regulation: "Regulation",
  AuditFinding: "Audit Finding", KRI: "KRI", KPI: "KPI",
};
export const KIND_LABEL_PLURAL: Record<RiskControlKind, string> = {
  Risk: "Risks", Control: "Controls", Policy: "Policies", Regulation: "Regulations",
  AuditFinding: "Audit Findings", KRI: "KRIs", KPI: "KPIs",
};
export const KIND_PREFIX: Record<RiskControlKind, string> = {
  Risk: "R", Control: "C", Policy: "P", Regulation: "REG", AuditFinding: "AF", KRI: "KRI", KPI: "KPI",
};

/** The verb a directed link implies, inferred from the two kinds (source→target). */
const REL_VERBS: Record<string, string> = {
  "Control>Risk": "mitigates", "Policy>Control": "governs", "Policy>Risk": "addresses",
  "Regulation>Policy": "requires", "Regulation>Control": "mandates", "Regulation>Risk": "drives",
  "AuditFinding>Control": "raised against", "AuditFinding>Risk": "raised against",
  "KRI>Risk": "monitors", "KRI>Control": "monitors", "KPI>Control": "measures", "KPI>Risk": "measures",
};
export function relationVerb(sourceKind: RiskControlKind, targetKind: RiskControlKind): string {
  return REL_VERBS[`${sourceKind}>${targetKind}`] ?? "relates to";
}

/** Canonical orientation when linking two kinds: true if `a` should be the
 *  SOURCE (e.g. Control→Risk, Policy→Control), so the graph reads consistently
 *  regardless of which item the user linked from. */
export function aIsSource(a: RiskControlKind, b: RiskControlKind): boolean {
  if (REL_VERBS[`${a}>${b}`]) return true;
  if (REL_VERBS[`${b}>${a}`]) return false;
  return true;
}

export type ControlType = "Preventive" | "Detective" | "Corrective";
export const CONTROL_TYPES: ControlType[] = ["Preventive", "Detective", "Corrective"];

export const CONTROL_TYPE_LABELS: Record<ControlType, string> = {
  Preventive: "Preventive",
  Detective: "Detective",
  Corrective: "Corrective",
};

export type ControlAutomation = "Manual" | "Automated" | "ITDependent";
export const CONTROL_AUTOMATIONS: ControlAutomation[] = ["Manual", "Automated", "ITDependent"];
export const CONTROL_AUTOMATION_LABELS: Record<ControlAutomation, string> = {
  Manual: "Manual",
  Automated: "Automated",
  ITDependent: "IT-dependent",
};

/** 1..5 rating scale used for likelihood + impact. */
export const RATING_SCALE = [1, 2, 3, 4, 5] as const;

// ── DTOs returned by the API ────────────────────────────────────────
export interface RiskControlItemDTO {
  id: string;
  libraryId: string;
  kind: RiskControlKind;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  // Risk attributes
  likelihood: number | null;
  impact: number | null;
  riskCategory: string | null;
  residualLikelihood: number | null;
  residualImpact: number | null;
  // Control attributes
  controlType: ControlType | null;
  automation: ControlAutomation | null;
  frequency: string | null;
  owner: string | null;
  frameworkRef: string | null;
  // Audit / assurance
  evidence: string | null;
  testMethod: string | null;
  testFrequency: string | null;
  // Operating effectiveness: the mining-conformance deviation this control guards.
  monitorSignature: string | null;
}

export interface RiskControlLinkDTO {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface RiskControlLibraryDTO {
  id: string;
  name: string;
  orgId: string | null;
  projectId: string | null;
  sourceLibraryId: string | null;
  items: RiskControlItemDTO[];
  links: RiskControlLinkDTO[];
}

/** Inherent risk score (likelihood × impact), or null if unrated. */
export function riskScore(item: Pick<RiskControlItemDTO, "likelihood" | "impact">): number | null {
  return item.likelihood != null && item.impact != null ? item.likelihood * item.impact : null;
}

/** Residual risk score (after controls), or null if unrated. */
export function residualScore(item: Pick<RiskControlItemDTO, "residualLikelihood" | "residualImpact">): number | null {
  return item.residualLikelihood != null && item.residualImpact != null ? item.residualLikelihood * item.residualImpact : null;
}

/** Risk severity band from the 1..25 score, for colour cues. */
export function riskBand(score: number | null): "none" | "low" | "medium" | "high" {
  if (score == null) return "none";
  if (score >= 15) return "high";
  if (score >= 6) return "medium";
  return "low";
}

/** One place a Risk/Control is attached to a process step, with the ids the
 *  Risk & Control screen needs to deep-link to the step on its diagram. */
export interface RcAttachment { diagramId: string; diagramName: string; elementId: string; label: string; }
