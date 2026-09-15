/**
 * "Is this spoken command finished, or did Deepgram split it at a pause?"
 *
 * Deepgram finalises a segment after ~0.8 s of silence, so "swap … top and
 * bottom" arrives as "Swap." then "Top and bottom." The editor buffers finals
 * and asks this before running; a `true` holds the buffer for a longer grace
 * period so the rest can arrive. Running a half command ("rename Task 8 to",
 * "Swap.") never does anything useful — it fails, or worse, goes to the AI
 * which guesses ("swap Lane 1 with Lane 3", Paul's log, 2026-09-15).
 *
 * Pure, so every rule here is tested; the editor only imports it.
 */
const VERBS = /^(?:swap|rename|relabel|label|edit|move|slide|nudge|bump|shift|connect|link|join|disconnect|unlink|delete|remove|add|insert|create|put|send|draw|attach|place|compress|shrink|extend|widen|wrap|call|change|set)$/;

export function isIncompleteCommand(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.?!,]+$/g, "").trim();
  if (!t) return false;
  // A bare verb — "Swap." "Rename." "Move." — is the start of something.
  if (VERBS.test(t)) return true;
  // Ends on a dangling connective / preposition → more is coming.
  if (/\b(to|as|from|and|with|into|onto|labell?ed|called|named|saying|by|above|below|over|under(?:neath)?|of|for|around|the|a|an)$/.test(t)) return true;
  // rename / relabel / change / call / set — missing its "to <target>". ("rename
  // tasks" — the by-number form — and "label selected" are complete as they are.)
  if (/^(rename|relabel|change|set|call)\b/.test(t) && !/\b(to|as)\b\s+\S+/.test(t) && !/^(rename|relabel)\s+(?:a\s+|an\s+|the\s+|all\s+)?\w+s?$/.test(t)) return true;
  // connect / disconnect — missing the second operand ("connect them" is complete).
  if (/^(connect|link|join|disconnect|unlink)\b/.test(t) && !/\b(to|and|with|from)\b\s+\S+/.test(t) && !/^(connect|link|join)\s+(them|these|those|it up|the last two|the previous two)$/.test(t)) return true;
  // "add message …": the by-number forms are complete — a bare "add a message" or
  // "add a message to the selected" — anything else needs BOTH a from and a to.
  if (/^(add|create|send|draw|put)\b.*\bmessage\b/.test(t)) {
    if (/^(?:add|create|send|draw|put)\s+(?:a\s+|new\s+)?(?:message|msg)(?:\s+flow)?(?:\s+(?:to|from|for|with|on)\s+(?:the\s+)?(?:selected(?:\s+\w+)?|selection|this|that|these|it))?$/.test(t)) return false;
    if (!(/\bfrom\b\s+\S+/.test(t) && /\bto\b\s+\S+/.test(t))) return true;
  }
  return false;
}
