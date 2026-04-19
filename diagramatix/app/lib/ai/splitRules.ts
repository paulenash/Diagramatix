/**
 * Splits a rules markdown string into two slices based on the group heading:
 *   - aiRules      — sent to the AI model (green rules in the rules editor)
 *   - layoutRules  — enforced by local layout code, NOT sent to the model
 *
 * Contract: a rule line (matching /^[A-Z]\d+:/) belongs to layoutRules if and
 * only if the most recent `## …` group heading matches CODE_REQUIRED_GROUPS.
 * Headings and free-text lines are copied into whichever slice the following
 * rule lines belong to so the output stays valid markdown.
 *
 * Keep this regex in sync with app/(dashboard)/dashboard/rules/RulesEditor.tsx —
 * the editor's preview colour-codes rules using the same classifier.
 */
export const CODE_REQUIRED_GROUPS = /\b(layout|positioning|placement|spacing|sizing|arrangement|connector routing)\b/i;

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
    for (const l of currentGroupBuffer) bucket.push(l);
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
