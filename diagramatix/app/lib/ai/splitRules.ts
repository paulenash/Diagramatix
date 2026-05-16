/**
 * Splits a rules markdown string into two slices based on the group heading:
 *   - aiRules      — sent to the AI model (green rules in the rules editor)
 *   - layoutRules  — enforced by local layout code, NOT sent to the model
 *
 * Contract: a rule line (matching RULE_LINE_RE) belongs to layoutRules if and
 * only if the most recent `## …` group heading matches CODE_REQUIRED_GROUPS.
 * Headings and free-text lines are copied into whichever slice the following
 * rule lines belong to so the output stays valid markdown.
 *
 * Proposed (orange) rules — those carrying a `[PROPOSED]` marker in their
 * body — are TODOs: they sit in a code-backed group but are not yet
 * implemented. They are excluded from BOTH slices so they never reach the
 * AI prompt and never fool the layout-code path into thinking they're live.
 *
 * Rule-id format supported by RULE_LINE_RE:
 *   - `R01:` — standard
 *   - `R04.1:` — dotted sub-rule
 *   - `G07:`, `L23.2:` — any single uppercase letter + digits + optional .digit groups
 *
 * Keep these regexes in sync with
 * app/(dashboard)/dashboard/rules/RulesEditor.tsx — the editor's preview
 * colour-codes rules using the same classifiers.
 */
export const CODE_REQUIRED_GROUPS = /\b(layout|positioning|placement|spacing|sizing|arrangement|connector routing)\b/i;

/** Matches a rule-id line prefix: letter + digits + optional dotted sub-numbers + colon. */
export const RULE_LINE_RE = /^[A-Z]\d+(?:\.\d+)*:/;

/** Body marker indicating a code-backed rule is proposed but not yet implemented. */
export const PROPOSED_RE = /\[PROPOSED\]/i;

/** Body marker indicating a previously-confirmed code-backed rule's text has
 *  been changed by an admin but the layout code has NOT yet been updated to
 *  match. While the marker is present the rule is effectively the same as
 *  [PROPOSED] for downstream purposes — kept out of the AI prompt so the
 *  model is never told to honour text the layout code doesn't enforce. */
export const MODIFIED_RE = /\[MODIFIED\]/i;

export function splitRulesByEnforcement(text: string): { aiRules: string; layoutRules: string } {
  const lines = text.split("\n");
  const aiLines: string[] = [];
  const layoutLines: string[] = [];
  let currentGroupIsLayout = false;
  let currentGroupHeading: string | null = null;
  let currentGroupBuffer: string[] = [];

  function flushGroup() {
    if (currentGroupHeading === null && currentGroupBuffer.length === 0) return;
    const bucket = currentGroupIsLayout ? layoutLines : aiLines;
    if (currentGroupHeading !== null) bucket.push(currentGroupHeading);
    for (const l of currentGroupBuffer) {
      // In layout (code-backed) groups, drop rule lines marked [PROPOSED] OR
      // [MODIFIED] — both are admin tracking flags for rules whose code is
      // not yet caught up to the rule text, and must not flow into either
      // the AI prompt or the layout-code path until the admin marks them
      // implemented.
      if (currentGroupIsLayout && RULE_LINE_RE.test(l.trim()) && (PROPOSED_RE.test(l) || MODIFIED_RE.test(l))) continue;
      bucket.push(l);
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const isGroup = trimmed.startsWith("##");
    if (isGroup) {
      flushGroup();
      currentGroupHeading = line;
      currentGroupIsLayout = CODE_REQUIRED_GROUPS.test(trimmed);
      currentGroupBuffer = [];
    } else {
      currentGroupBuffer.push(line);
    }
  }
  flushGroup();

  return {
    aiRules: aiLines.join("\n").trim(),
    layoutRules: layoutLines.join("\n").trim(),
  };
}
