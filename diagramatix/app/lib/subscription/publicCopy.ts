/**
 * What the public pages say about a plan's LIMITS, generated from the plan's
 * own numbers so it can never be out of date.
 *
 * The pricing page used to carry these as typed text ("5 projects", "5 AI
 * Generate attempts during your trial", "2 individual exports + 2 imports") —
 * true the day they were written, wrong the day someone edited a limit in the
 * SuperAdmin editor, and blank for any tier added later. Now the numbers come
 * from the SubscriptionLevel row (null = unlimited).
 *
 * Pure, so it can be tested and reused (the sign-up TierPicker can share it).
 */

export interface PlanLimits {
  trialDays: number | null;
  maxProjects: number | null;
  maxDiagramsPerTypePerProject: number | null;
  maxArchimateDiagramsTotal: number | null;
  maxBpmnElementsPerDiagram: number | null;
  maxNonBpmnElementsPerDiagram: number | null;
  maxAiAttempts: number | null;
  aiAttemptsResetMonthly: boolean;
  maxIndividualExports: number | null;
  individualExportsResetMonthly: boolean;
  maxIndividualImports: number | null;
  individualImportsResetMonthly: boolean;
  maxBulkExports: number | null;
  maxBulkImports: number | null;
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const per = (monthly: boolean) => (monthly ? "per month" : "in total");

/** The bullet lines for one plan, in the order people look for them. */
export function limitLines(p: PlanLimits): string[] {
  const out: string[] = [];

  if (p.trialDays !== null && p.trialDays > 0) out.push(`${p.trialDays}-day free trial`);

  out.push(p.maxProjects === null ? "Unlimited projects" : plural(p.maxProjects, "project"));

  if (p.maxDiagramsPerTypePerProject !== null) out.push(`Up to ${plural(p.maxDiagramsPerTypePerProject, "diagram")} of each type per project`);

  if (p.maxArchimateDiagramsTotal === null) out.push("Unlimited ArchiMate diagrams");
  else if (p.maxArchimateDiagramsTotal > 0) out.push(`${plural(p.maxArchimateDiagramsTotal, "ArchiMate diagram")}`);

  const b = p.maxBpmnElementsPerDiagram, o = p.maxNonBpmnElementsPerDiagram;
  if (b === null && o === null) out.push("No limit on diagram size");
  else if (b !== null && o !== null && b === o) out.push(`${plural(b, "element")} per diagram`);
  else {
    const parts: string[] = [];
    if (b !== null) parts.push(`${plural(b, "element")} per BPMN diagram`);
    if (o !== null) parts.push(`${o} for other types`);
    out.push(parts.join(", "));
  }

  out.push(p.maxAiAttempts === null ? "Unlimited AI Generate attempts" : `${plural(p.maxAiAttempts, "AI Generate attempt")} ${per(p.aiAttemptsResetMonthly)}`);

  const io = (n: number | null, monthly: boolean, what: string) =>
    n === null ? `Unlimited ${what}s` : `${plural(n, what)} ${per(monthly)}`;
  out.push(io(p.maxIndividualExports, p.individualExportsResetMonthly, "individual export"));
  out.push(io(p.maxIndividualImports, p.individualImportsResetMonthly, "individual import"));

  if (p.maxBulkExports === null && p.maxBulkImports === null) out.push("Unlimited bulk export and import");
  else if ((p.maxBulkExports ?? 0) > 0 || (p.maxBulkImports ?? 0) > 0) {
    const e = p.maxBulkExports === null ? "unlimited" : String(p.maxBulkExports);
    const i = p.maxBulkImports === null ? "unlimited" : String(p.maxBulkImports);
    out.push(`Bulk Visio: ${e} export${p.maxBulkExports === 1 ? "" : "s"} and ${i} import${p.maxBulkImports === 1 ? "" : "s"} per month`);
  }

  return out;
}

/** "30-day free trial" — the trial length of the plan people start on, from data (falls back to no number). */
export function trialPhrase(trialDays: number | null | undefined): string {
  return trialDays && trialDays > 0 ? `${trialDays}-day free trial` : "free trial";
}
