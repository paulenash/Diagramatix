/**
 * Does every gateway in a generated prompt say where its branches GO?
 *
 * The master template has always required it — "Every diverging gateway is
 * matched by a named MERGE gateway that the branches rejoin, written as its own
 * line at the point they come together ... A branch that ends in its own End
 * event does not rejoin; say so" — but nothing checked. Paul hit the same
 * ambiguity from the other direction on 2026-09-01, reading a Technical
 * Description: "the Decisions are not terminated unambiguously".
 *
 * It matters because these prompts are the INPUT to regeneration. A branch that
 * simply stops tells the model nothing about whether the path rejoins, ends or
 * loops, so the model invents an answer and the diagram stops being the process
 * that was written down.
 *
 * THE UNIT IS THE GATEWAY, NOT THE BRANCH. The template deliberately puts the
 * merge on its own line AFTER the branch group rather than repeating it inside
 * every branch, so judging branches individually condemns the house style:
 *
 *     Exclusive gateway "Discrepancy type?"
 *     - branch "Quantity discrepancy": User task "Prepare quantity notice"
 *     - branch "Quality or damage discrepancy": User task "Prepare notice"
 *     Exclusive merge gateway "Discrepancy type"      <- resolves both
 *
 * A gateway is resolved when a merge line follows its branches, or when every
 * branch states its own fate. Only where NEITHER holds is a branch ambiguous.
 *
 * Deterministic and free: no AI call, so it can gate every prompt the way
 * `roundTripsOk` already gates parseability.
 */

/** One branch that never states its fate, under a gateway that has no merge. */
export interface BranchIssue {
  /** 1-based line of the `- branch "…":` line within the prompt. */
  line: number;
  condition: string;
  /** The gateway it hangs off, for the report. */
  gateway: string;
  /** The branch's own text, nested sub-branches removed. */
  body: string;
}

/**
 * The ways a branch may finish on its own terms — each names a DESTINATION.
 *
 * Deliberately generous about wording. The catalogue says the same few things
 * several ways — "reach subprocess end" for "(exits subprocess)", "loop
 * continues" for "(loop repeats)", "gateway merge" for "merge gateway" — and
 * flagging a clear statement for its phrasing buries the branches that really
 * are ambiguous.
 *
 * What is NOT accepted is a destination naming no element: "continue to the
 * Finance lane" says which lane but not which step, and that is exactly the gap
 * that leaves a regeneration guessing.
 */
const SELF_TERMINATED: RegExp[] = [
  /\bmerge\s+gateway\b/i,
  /\bgateway\s+merge\b/i,               // the same thing, other word order
  /\bEnd event\b/i,
  /\bloops? (repeats?|continues?)\b/i,
  /\bexits?\b[^.]*\bsubprocess\b/i,
  /\bsubprocess end\b/i,
  /\breturns? to\b/i,
  /\bloops? back\b/i,
];

const BRANCH_RE = /^(\s*)-\s*branch\s*"(.*?)"\s*:/;
const GATEWAY_RE = /\bgateway\s*"(.*?)"/i;
const MERGE_RE = /\bmerge\s+gateway\b/i;

export function checkPromptBranches(prompt: string): BranchIssue[] {
  const lines = prompt.split(/\r?\n/);
  const indentOf = (l: string) => l.match(/^\s*/)![0].length;
  const issues: BranchIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(BRANCH_RE);
    if (!m) continue;
    const base = m[1].length;
    // Only the FIRST branch of a group drives the check; the rest are collected
    // by the walk below. A branch's own body is indented DEEPER than it, so the
    // preceding sibling is found by stepping back over that body — checking
    // merely the previous non-empty line finds a body line and calls every
    // branch a first, which reports the same group once per branch.
    const isFirstOfGroup = (() => {
      for (let k = i - 1; k >= 0; k--) {
        if (lines[k].trim() === "") continue;
        if (indentOf(lines[k]) > base) continue;          // this or a sibling's body
        const pm = lines[k].match(BRANCH_RE);
        return !(pm && pm[1].length === base);
      }
      return true;
    })();
    if (!isFirstOfGroup) continue;

    // The gateway this group hangs off: the nearest preceding line, at a
    // shallower indent, that names a gateway.
    let gateway = "(unnamed gateway)";
    for (let k = i - 1; k >= 0; k--) {
      if (lines[k].trim() === "") continue;
      if (indentOf(lines[k]) >= base && lines[k].match(BRANCH_RE)) continue;
      const g = lines[k].match(GATEWAY_RE);
      if (g) gateway = g[1];
      break;
    }

    // Walk the whole group, gathering each branch's own text.
    const group: { line: number; condition: string; body: string }[] = [];
    let cur: { line: number; condition: string; parts: string[] } | null =
      { line: i + 1, condition: m[2], parts: [lines[i].slice(m[0].length)] };
    let k = i + 1;
    let nestedBelow = -1;
    let resolvedByMerge = false;
    for (; k < lines.length; k++) {
      const line = lines[k];
      if (line.trim() === "") continue;
      const ind = indentOf(line);
      if (nestedBelow >= 0 && ind > nestedBelow) continue;   // inside a sub-branch
      nestedBelow = -1;
      const bm = line.match(BRANCH_RE);
      if (bm && bm[1].length === base) {                     // the next sibling
        if (cur) group.push({ line: cur.line, condition: cur.condition, parts: cur.parts } as never);
        cur = { line: k + 1, condition: bm[2], parts: [line.slice(bm[0].length)] };
        continue;
      }
      if (bm) { nestedBelow = bm[1].length; continue; }      // a nested branch
      if (ind > base) { cur?.parts.push(line); continue; }   // this branch's body
      // Back out to the gateway's own level: this is where a merge would sit.
      if (MERGE_RE.test(line)) resolvedByMerge = true;
      break;
    }
    if (cur) group.push({ line: cur.line, condition: cur.condition, parts: cur.parts } as never);
    if (resolvedByMerge) continue;

    for (const b of group) {
      const body = (b as unknown as { parts: string[] }).parts.join(" ").replace(/\s+/g, " ").trim();
      if (!SELF_TERMINATED.some((re) => re.test(body))) {
        issues.push({ line: b.line, condition: b.condition, gateway, body });
      }
    }
  }
  return issues;
}
