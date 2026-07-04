/**
 * Client-safe types + constants for the Risk & Control catalog. Mirrors the
 * Prisma enums as plain string unions so client components never import the
 * generated Prisma client. Mirrors app/lib/entityLists/types.ts.
 *
 * A library holds Risks and Controls; a Control MITIGATES one or more Risks
 * (RiskControlLink). An Org holds a master library; a Project adopts a COPY.
 */

export type RiskControlKind = "Risk" | "Control";
export const RISK_CONTROL_KINDS: RiskControlKind[] = ["Risk", "Control"];

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
}

export interface RiskControlLinkDTO {
  id: string;
  controlId: string;
  riskId: string;
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
