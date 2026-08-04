/**
 * Semantic template suggestion: match an element's name against the editable
 * IntentKeywordMap catalog. Pure + shared (client fetches the catalog and calls
 * this per selected element). Word-boundary, case-insensitive; first row (by
 * caller's order) whose any keyword hits wins.
 */
export type AssistAction = "suggest-template" | "add-input-data-object" | "add-output-data-object";

export interface IntentRow {
  label: string;
  keywords: string[];
  action?: AssistAction;
  diagramType?: string;      // "all" or a specific notation
  defaultLabel?: string | null;
  targetCategory?: string | null;
  targetTemplateName?: string | null;
}

export interface IntentMatch {
  label: string;
  category: string | null;
  templateName: string | null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True if `keyword` occurs in `label` on word boundaries, case-insensitive. */
export function keywordHits(label: string, keyword: string): boolean {
  const k = keyword.trim();
  if (!k) return false;
  return new RegExp(`\\b${escapeRe(k)}\\b`, "i").test(label);
}

const rowApplies = (row: IntentRow, diagramType: string) => {
  const dt = row.diagramType ?? "all";
  return dt === "all" || dt === diagramType;
};

/** All catalog rows (of the given action, in-scope for the diagram type) whose
 *  any keyword hits the label. Ordered as the catalog is. */
export function matchAssistRules(
  label: string | undefined | null,
  diagramType: string,
  catalog: IntentRow[],
  action?: AssistAction,
): IntentRow[] {
  const name = (label ?? "").trim();
  if (!name) return [];
  return catalog.filter(
    (row) =>
      rowApplies(row, diagramType) &&
      (action ? (row.action ?? "suggest-template") === action : true) &&
      row.keywords.some((k) => keywordHits(name, k)),
  );
}

/** First suggest-template row whose any keyword hits the label, or null. */
export function matchIntent(label: string | undefined | null, catalog: IntentRow[], diagramType = "bpmn"): IntentMatch | null {
  const hits = matchAssistRules(label, diagramType, catalog, "suggest-template");
  const row = hits[0];
  return row ? { label: row.label, category: row.targetCategory ?? null, templateName: row.targetTemplateName ?? null } : null;
}
