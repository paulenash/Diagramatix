/**
 * Reading the SOURCE side of a Process Repository `.md` — the prose a prompt is
 * generated from, as opposed to the prompts themselves.
 *
 * `parseValueChainMd` extracts the finished prompt blocks, which is what the
 * batch tool consumes. The prompt GENERATOR needs the other half: the seven-part
 * narrative for a chain (teams and roles, external participants, subprocesses, IT
 * systems, policies, and the two information-flow sections) and the list of
 * subprocess headings, so it can write one BPMN prompt per subprocess.
 *
 * A separate module rather than an addition to the parser, deliberately: the
 * parser feeds the batch runner that generates whole projects, and there is no
 * reason for a new feature to risk changing what it returns.
 */

/** A subprocess of a chain, as its heading declares it. */
export interface SubprocessHeading {
  /** e.g. "V01.03" */
  code: string;
  /** e.g. "Check Credit & Pricing" */
  title: string;
}

const normalise = (md: string): string => md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

/**
 * The raw `## <code> …` section for one chain, heading included.
 *
 * Sliced to the next H2 rather than to the next chain code, so a stray H2 inside
 * a chain would truncate the section rather than silently swallow the chain that
 * follows it — a wrong answer that is obvious beats one that is not.
 */
export function chainSection(md: string, code: string): string | null {
  const text = normalise(md);
  const h2 = /^##[ \t]+(.+?)[ \t]*$/gm;
  const heads: { start: number; end: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = h2.exec(text)) !== null) heads.push({ start: m.index, end: h2.lastIndex, text: m[1].trim() });
  const i = heads.findIndex((h) => h.text === code || h.text.startsWith(`${code} `) || h.text.startsWith(`${code} —`) || h.text.startsWith(`${code}—`));
  if (i === -1) return null;
  const end = i + 1 < heads.length ? heads[i + 1].start : text.length;
  return text.slice(heads[i].start, end);
}

/** The chain's title from its `## V01 — Order to Cash` heading. */
export function chainTitle(section: string): string {
  const first = section.split("\n", 1)[0] ?? "";
  const after = first.replace(/^##[ \t]+/, "").trim();
  const dash = after.indexOf("—");
  return (dash === -1 ? after.replace(/^\S+\s*/, "") : after.slice(dash + 1)).trim() || after;
}

/**
 * The chain's subprocess headings, in document order.
 *
 * Read from the `### <code>.<nn> …` headings rather than from the existing
 * prompt blocks, so this works for a chain that has a narrative but no prompts
 * yet — which is precisely the chain the generator exists to serve.
 */
export function subprocessHeadings(section: string, code: string): SubprocessHeading[] {
  const out: SubprocessHeading[] = [];
  const h3 = new RegExp(`^###[ \\t]+(${code}\\.\\d+)[ \\t]*[—–-]?[ \\t]*(.*?)[ \\t]*$`, "gm");
  let m: RegExpExecArray | null;
  while ((m = h3.exec(section)) !== null) {
    const title = m[2].replace(/^[—–-]\s*/, "").trim();
    if (title) out.push({ code: m[1], title });
  }
  return out;
}

/**
 * The chain's narrative with every existing PROMPT stripped out.
 *
 * This is the one thing here that is not obvious, and it matters. If the finished
 * prompts were left in the text handed to the model, it would copy the nearest
 * one almost verbatim — so a template change would appear to do nothing, and the
 * generator would look like it worked while actually just laundering the input.
 * Removing them forces the prompt to be written from the narrative, which is the
 * only way an edit to a template can show up in the output.
 *
 * Both the fenced blocks and their `**X diagram prompt.**` labels go, along with
 * any `> **Prompt used for…**` blockquote.
 */
export function chainNarrative(section: string): string {
  return normalise(section)
    .replace(/^\*\*(?:Value Chain|Context|Process Context|ArchiMate|BPMN) diagram prompt\.\*\*[ \t]*$/gm, "")
    .replace(/```text[ \t]*\n[\s\S]*?\n?```/g, "")
    .replace(/^>[ \t]*\*\*Prompt used[^\n]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Every chain code the document declares, in order. */
export function chainCodes(md: string): string[] {
  const out: string[] = [];
  const h2 = /^##[ \t]+(V\d+)\b/gm;
  let m: RegExpExecArray | null;
  while ((m = h2.exec(normalise(md))) !== null) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
