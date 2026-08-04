/**
 * Semantic template suggestion: match an element's name against the editable
 * IntentKeywordMap catalog. Pure + shared (client fetches the catalog and calls
 * this per selected element). Word-boundary, case-insensitive; first row (by
 * caller's order) whose any keyword hits wins.
 */
export interface IntentRow {
  label: string;
  keywords: string[];
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

/** First catalog row whose any keyword hits the label, or null. */
export function matchIntent(label: string | undefined | null, catalog: IntentRow[]): IntentMatch | null {
  const name = (label ?? "").trim();
  if (!name) return null;
  for (const row of catalog) {
    if (row.keywords.some((k) => keywordHits(name, k))) {
      return { label: row.label, category: row.targetCategory ?? null, templateName: row.targetTemplateName ?? null };
    }
  }
  return null;
}
