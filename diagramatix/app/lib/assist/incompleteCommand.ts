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
const VERBS = /^(?:swap|rename|relabel|label|edit|move|slide|nudge|bump|shift|connect|link|join|disconnect|unlink|delete|remove|add|insert|create|put|send|draw|attach|place|compress|shrink|extend|widen|wrap|surround|enclose|unwrap|dissolve|call|change|set)$/;

export function isIncompleteCommand(text: string): boolean {
  const raw = text.trim();
  const t = raw.toLowerCase().replace(/[.?!,]+$/g, "").trim();
  if (!t) return false;

  // A TRAILING COMMA is the recogniser telling us the speaker had not finished.
  // Deepgram punctuates on intonation, so "Surround selected with a pool, called
  // Pool 2" split at the pause arrives as "Surround selected with a pool," and
  // then "called Pool 2." The first half is a complete command on its own, so
  // every rule below passes it, and it ran — making a pool named "Pool" — while
  // the tail went to the AI and made a SECOND pool called Pool 2
  // (Paul, 2026-09-18). The comma is the only thing that distinguishes the two
  // cases, and holding a command that turns out to be finished only delays it by
  // the grace period.
  if (/,$/.test(raw)) return true;

  // A tail that begins with "called X" is the end of somebody else's sentence.
  // On its own it means nothing, and handed to the AI it becomes "add a pool
  // called X" — a whole new element nobody asked for.
  if (/^(?:called|named|labell?ed)\b/.test(t)) return true;
  // A bare verb — "Swap." "Rename." "Move." — is the start of something.
  if (VERBS.test(t)) return true;
  // Ends on a dangling connective / preposition → more is coming.
  if (/\b(to|as|from|and|with|into|onto|labell?ed|called|named|saying|by|above|below|over|under(?:neath)?|of|for|around|the|a|an)$/.test(t)) return true;
  // rename / relabel / change / call / set — missing its "to <target>". ("rename
  // tasks" — the by-number form — and "label selected" are complete as they are.)
  if (/^(rename|relabel|change|set|call)\b/.test(t) && !/\b(to|as)\b\s+\S+/.test(t) && !/^(rename|relabel)\s+(?:a\s+|an\s+|the\s+|all\s+)?\w+s?$/.test(t)) return true;
  // surround / enclose / wrap — "surround selected" is the start of "… with an
  // expanded subprocess called X"; without the "with/in …" part it is held.
  if (/^(surround|enclose|wrap)\b/.test(t) && !/\b(with|in|inside|into|within|using)\b\s+\S+/.test(t)) return true;
  // connect / disconnect — missing the second operand ("connect them" is complete).
  if (/^(connect|link|join|disconnect|unlink)\b/.test(t) && !/\b(to|and|with|from)\b\s+\S+/.test(t) && !/^(connect|link|join)\s+(them|these|those|it up|the last two|the previous two)$/.test(t)) return true;
  // ── "Add two sublanes" … "to shipping called domestic and international." ──
  //
  // THE DOUBLE-UP (Paul, 2026-09-21: "slight hesitations produce interrupted
  // commands that create both a rule based and an AI based outcome. This
  // double-up must be avoided."). "Add two sublanes" is complete on its own —
  // it picks the most recent lane and makes two — so it RAN, putting sublanes
  // in the wrong lane; the tail then reached the AI, which rebuilt it into a
  // whole command and made two more in the right one. Four sublanes from one
  // sentence, and the same thing happened with "Add three lanes".
  //
  // A count of lanes with NEITHER a target NOR names is under-specified: the
  // sentence a person actually says names at least one of them. Holding it
  // costs a grace period and nothing else — if no tail arrives it runs exactly
  // as before.
  //
  // "Add a lane" is deliberately NOT held: it is the one phrasing people
  // genuinely use on its own, and the default target (the pool) is right.
  if (/^(?:add|create|insert|put|make|new)\s+(?:\d+|two|three|four|five|six|seven|eight|nine|ten|some|several)\s+(?:sub-?lanes?|lanes?)$/.test(t)) {
    return true;
  }

  // "add message …": the by-number forms are complete — a bare "add a message" or
  // "add a message to the selected" — anything else needs BOTH a from and a to.
  if (/^(add|create|send|draw|put)\b.*\bmessage\b/.test(t)) {
    if (/^(?:add|create|send|draw|put)\s+(?:a\s+|new\s+)?(?:message|msg)(?:\s+flow)?(?:\s+(?:to|from|for|with|on)\s+(?:the\s+)?(?:selected(?:\s+\w+)?|selection|this|that|these|it))?$/.test(t)) return false;
    if (!(/\bfrom\b\s+\S+/.test(t) && /\bto\b\s+\S+/.test(t))) return true;
  }
  return false;
}
