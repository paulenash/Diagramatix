import type { Outcome } from "@/app/lib/assist/commandScore";

/** How each outcome is coloured, wherever a case is shown. */
export const OUTCOME_STYLE: Record<Outcome, string> = {
  "pass": "bg-green-100 text-green-800",
  "pass-despite-mishear": "bg-green-50 text-green-700",
  "misheard": "bg-purple-100 text-purple-800",
  "unparsed": "bg-amber-100 text-amber-800",
  "misparsed": "bg-orange-100 text-orange-800",
  "ambiguous": "bg-blue-100 text-blue-800",
  "wrong-element": "bg-red-100 text-red-800",
  "wrong-edit": "bg-red-200 text-red-900",
  "stale-clip": "bg-gray-100 text-gray-600",
};

/** What each outcome means, in a sentence — the tooltip and the window's key. */
export const OUTCOME_MEANS: Record<Outcome, string> = {
  "pass": "right ops, right elements",
  "pass-despite-mishear": "the words came back wrong and the answer was right anyway — not a failure",
  "misheard": "the recogniser — the words arrived wrong",
  "unparsed": "the grammar refused it; live, this goes to the AI and costs a metered call",
  "misparsed": "the grammar accepted it and built the wrong shape",
  "ambiguous": "the reference named more than one thing; live, the picker opens",
  "wrong-element": "it resolved, to the wrong element",
  "wrong-edit": "the ops were right and the diagram came out wrong",
  "stale-clip": "cannot be judged — the clip names an element today's test diagram no longer has; neither a pass nor a failure",
};
