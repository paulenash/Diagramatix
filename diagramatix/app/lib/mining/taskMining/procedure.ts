/**
 * Task Mining — "as-actually-done" SOP. Turns a discovered task routine into a
 * human Standard Operating Procedure: purpose, apps used, the most-common steps,
 * the rework/exceptions actually observed, and an automation note. Unlike the RPA
 * spec (a bot recipe), this reads as a procedure a person would follow. Markdown
 * out (feeds the existing .docx builder / the editor). Pure.
 */
import type { Variant } from "../types";
import { automationOpportunities, taskAutomationScore } from "./automation";
import { detectReworkActivities } from "./insights";

/** The application a step happened in, from its label. */
function appOf(activity: string): string | null {
  if (activity.startsWith("Switch to ")) return activity.slice("Switch to ".length);
  if (activity.startsWith("Open ")) return activity.slice("Open ".length);
  const m = activity.match(/^([^:]+):/);
  return m ? m[1] : null;
}

export function buildTaskProcedure(variants: Variant[], taskName: string): string {
  const opps = automationOpportunities(variants);
  if (!opps.length) return `# Standard Operating Procedure — ${taskName}\n\nNo routine observed.`;
  const top = opps[0];
  const total = variants.reduce((n, v) => n + v.count, 0);
  const rework = detectReworkActivities(variants);
  const score = taskAutomationScore(variants);

  // Distinct apps in first-seen order.
  const apps: string[] = [];
  for (const s of top.steps) { const a = appOf(s); if (a && !apps.includes(a)) apps.push(a); }
  // The "doing" steps (drop the pure app-switch hops from the numbered procedure).
  const doSteps = top.steps.filter((s) => !s.startsWith("Switch to ") && !s.startsWith("Open "));

  const lines: string[] = [];
  lines.push(`# Standard Operating Procedure — ${taskName}`);
  lines.push(`_As actually done — discovered from ${total} observed execution${total === 1 ? "" : "s"} (DiagramatixMINER Task Mining)._`);
  lines.push("");
  lines.push("## Purpose");
  lines.push(`Perform "${taskName}" as it is currently carried out by the team, across ${apps.join(" and ") || "the applications used"}.`);
  lines.push("");
  lines.push("## Applications used");
  lines.push(apps.length ? apps.map((a) => `- ${a}`).join("\n") : "- (none identified)");
  lines.push("");
  lines.push(`## Procedure (most-common routine — ${top.cases} of ${total} executions)`);
  doSteps.forEach((s, i) => lines.push(`${i + 1}. ${s.replace(/^[^:]+:\s*/, "")}${appTag(s)}`));
  lines.push("");
  lines.push("## Exceptions / rework observed");
  if (rework.length) {
    for (const r of rework) lines.push(`- **${r.activity}** was redone in ${r.cases} case${r.cases === 1 ? "" : "s"} (e.g. after a failed check).`);
  } else {
    lines.push("- None observed — every execution ran clean.");
  }
  lines.push("");
  lines.push("## Automation note");
  lines.push(`This task scores **${(score.score * 100).toFixed(0)}% (${score.verdict})** for automation — ${top.reason}. See the exported RPA spec for the step-by-step bot recipe.`);
  return lines.join("\n");
}

/** " (in <App>)" tag for a doing-step, so the reader knows where each step happens. */
function appTag(step: string): string {
  const a = appOf(step);
  return a ? ` _(in ${a})_` : "";
}
