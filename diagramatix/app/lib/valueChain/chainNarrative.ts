import type { TemplateVersion } from "./promptTemplates";
import { PROCESS_CODE_RE, CHAIN_CODE_RE, processCodeFor } from "./chainCodes";

/**
 * "Create a New Value Chain" — the sixth master template, VALUE CHAIN NARRATIVE (Paul, 2026-10-10: "I want to leverage off the existing
 * Master Prompt functionality").
 *
 * The five prompt generators all read a chain's STRUCTURED NARRATIVE — the nine-part document every Process Repository chain carries
 * (teams and roles, external participants, subprocesses, systems, policies, two information flows, the association matrix and the roll-up,
 * then a write-up of each process). A user does not have that document; they have a description. This template turns the description and the
 * process details into that document, so the five existing generators work from a new chain exactly as they do from a master one.
 *
 * It is a master template in every sense the other five are: a read-only built-in held here (improves for everyone on a deploy), an
 * editable ADDITIONS block per SuperAdmin and per Org (a `DiagramRules` row), and an append-only version history, so what it produced can be
 * traced to the version that wrote it. It is deliberately NOT one of `MD_PROMPT_TYPES`: that list is the five diagram-prompt kinds and drives
 * the staleness badges, which a narrative is not.
 *
 * This file is PURE (no database, no AI, no node-only imports) so the wizard in the browser and the server validate with the same code.
 */
export const CHAIN_NARRATIVE_CATEGORY = "md-prompt-chain-narrative";

/** The bounds Paul set: between 5 and 12 BPMN process prompts. */
export const MIN_PROCESSES = 5;
export const MAX_PROCESSES = 12;
export const MAX_TITLE_CHARS = 120;
export const MAX_NARRATIVE_CHARS = 20_000;
export const MIN_NARRATIVE_CHARS = 40;
export const MAX_DETAIL_CHARS = 4_000;

/** The nine bold labels every chain narrative carries, in order — the same text the Repository's own narratives use. */
export const NARRATIVE_LABELS = [
  "**Teams and roles involved.**",
  "**External participants.**",
  "**High-level subprocesses.**",
  "**Typical IT systems.**",
  "**Policies and procedures.**",
  "**Information flow between external participants and process.**",
  "**Information flow between process and IT systems.**",
  "**Process ↔ Actors / Teams / IT Systems association matrix.**",
  "**Actor / Team / System roll-up**",
] as const;

export interface BriefProcess { title: string; details: string }

export const DEFAULT_CHAIN_NARRATIVE_BRIEFING = `You turn an author's plain description of a business value chain into the STRUCTURED NARRATIVE that Diagramatix's diagram-prompt generators read. You are not drawing anything and you are not writing a diagram prompt: you are writing the reference document the prompts will be written from.

OUTPUT CONTRACT
- Output the narrative as Markdown and NOTHING else: no preamble, no closing remarks, no code fence.
- Begin with the heading line exactly as given in the request: "## <CODE> — <TITLE>".
- Then these nine parts, in this order, each introduced by its bold label on a line of its own, exactly as written here:
  **Teams and roles involved.**
  **External participants.**
  **High-level subprocesses.**
  **Typical IT systems.**
  **Policies and procedures.**
  **Information flow between external participants and process.**
  **Information flow between process and IT systems.**
  **Process ↔ Actors / Teams / IT Systems association matrix.**
  **Actor / Team / System roll-up** (every distinct participant across <CODE>):
- Then ONE subsection per process, in the order given, each headed exactly "### <PROCESS CODE> — <PROCESS NAME>" (the code and name supplied in the request, unchanged).

WHAT EACH PART HOLDS
- Teams and roles involved: one paragraph naming the internal teams and the key roles in them.
- External participants: the parties outside the organisation, and what starts the chain (a customer order, a schedule, a regulator's request…).
- High-level subprocesses: ONE sentence listing the processes supplied, in order, by their exact names. No process may be added, dropped, merged, split or renamed.
- Typical IT systems: the systems the author names, in the author's words.
- Policies and procedures: the policies, controls, rules and standards the author names.
- Information flow between external participants and process: what passes between the outside parties and the chain, in each direction.
- Information flow between process and IT systems: what the chain creates or updates in the systems, and what the systems provide to it.
- Association matrix: one lead-in sentence — "Each row matches the pools, lanes and roles of the corresponding BPMN process prompt below — external actors are the non-organisation pools, teams are the lanes of the organisation's pool (key role in brackets), and IT systems are the System = true black-box pools." — then a Markdown table with the header "| Process | External Actors | Teams (key role) | IT Systems |" and the separator "| --- | --- | --- | --- |", and one row per process, in order, starting with the process code and name.
- Roll-up: three short lists — external actors, teams, IT systems — of every distinct participant across the chain, each appearing once.
- Each process subsection: one to three paragraphs written from THAT process's details — what starts it, the steps in order, who does each, which systems are used, the decisions and the exceptions, and what it hands on. Cover every detail the author gave for it.

RULES
- Everything you write comes from the author's description and process details. Use the author's own names for roles, teams, systems and parties.
- Do NOT invent a named system, product, external party, deadline, threshold or number the author did not give.
- Where the author is silent on something a part needs, write a short, ordinary, generic statement and end it with " (assumed)" so the author can see it and correct it. Never leave a part empty and never pad it with invention.
- Processes keep exactly the names, order and count supplied. Do not write chain or process codes into the prose; they appear only in headings and in the matrix rows.
- Plain business language. No BPMN terms (pool, lane, gateway, task) outside the association-matrix lead-in sentence.`;

/** The editable additions are the whole stored row, exactly as for the five prompt templates. (Not imported from promptTemplates.ts, which is large: the wizard bundles this file.) */
export const extractChainNarrativeAdditions = (stored: string | null | undefined): string => (stored ?? "").trim();

/** The built-in plus the additions, ready to send. */
export function buildChainNarrativeBriefing(additions: string | null | undefined): string {
  const extra = extractChainNarrativeAdditions(additions);
  return extra ? `${DEFAULT_CHAIN_NARRATIVE_BRIEFING}\n\n## Additional Rules — house conventions\n${extra}` : DEFAULT_CHAIN_NARRATIVE_BRIEFING;
}

/**
 * THE VERSION HISTORY of the built-in narrative template — append-only, one entry per change, added in the same commit as the change.
 * Same shape and rules as MD_PROMPT_TEMPLATE_HISTORY (promptTemplates.ts).
 */
export const CHAIN_NARRATIVE_HISTORY: TemplateVersion[] = [
  { version: 1, at: "2026-10-10", commit: "0000000", shippedAt: "2026-10-10T00:00:00Z",
    description: "The template is introduced: a user's description and process details become the nine-part structured narrative the five prompt generators read, with unknown details marked \"(assumed)\" and no invented systems, parties or numbers." },
];

export const latestChainNarrativeVersion = (): TemplateVersion => CHAIN_NARRATIVE_HISTORY[CHAIN_NARRATIVE_HISTORY.length - 1];

// ── What the author typed ────────────────────────────────────────────────────

export interface BriefInput {
  title: string;
  generalNarrative: string;
  processes: BriefProcess[];
}

/** Trim and bound the author's input; returns the cleaned input and every problem found (empty = acceptable). Used by the wizard and the server. */
export function normaliseBrief(raw: unknown): { brief: BriefInput; problems: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = String(r.title ?? "").replace(/\s+/g, " ").trim();
  const generalNarrative = String(r.generalNarrative ?? "").replace(/\r\n/g, "\n").trim();
  const procs = Array.isArray(r.processes) ? r.processes : [];
  const processes: BriefProcess[] = procs.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return { title: String(o.title ?? "").replace(/\s+/g, " ").trim(), details: String(o.details ?? "").replace(/\r\n/g, "\n").trim() };
  });
  const problems: string[] = [];
  if (!title) problems.push("Give the value chain a name.");
  else if (title.length > MAX_TITLE_CHARS) problems.push(`The name is longer than ${MAX_TITLE_CHARS} characters.`);
  if (generalNarrative.length < MIN_NARRATIVE_CHARS) problems.push(`Describe the value chain in a few sentences (at least ${MIN_NARRATIVE_CHARS} characters).`);
  if (generalNarrative.length > MAX_NARRATIVE_CHARS) problems.push(`The description is longer than ${MAX_NARRATIVE_CHARS} characters.`);
  if (processes.length < MIN_PROCESSES) problems.push(`List at least ${MIN_PROCESSES} processes (you have ${processes.length}).`);
  if (processes.length > MAX_PROCESSES) problems.push(`List at most ${MAX_PROCESSES} processes (you have ${processes.length}).`);
  const seen = new Set<string>();
  processes.forEach((p, i) => {
    if (!p.title) problems.push(`Process ${i + 1} needs a name.`);
    else if (p.title.length > MAX_TITLE_CHARS) problems.push(`Process ${i + 1}'s name is longer than ${MAX_TITLE_CHARS} characters.`);
    else {
      const k = p.title.toLowerCase();
      if (seen.has(k)) problems.push(`Two processes are called "${p.title}" — each needs its own name.`);
      seen.add(k);
    }
    if (p.details.length > MAX_DETAIL_CHARS) problems.push(`Process ${i + 1}'s details are longer than ${MAX_DETAIL_CHARS} characters.`);
  });
  return { brief: { title, generalNarrative, processes }, problems };
}

/** The message the narrative builder receives. */
export function chainNarrativeUserMessage(args: { code: string; brief: BriefInput }): string {
  const { code, brief } = args;
  const lines: string[] = [
    `CHAIN CODE: ${code}`,
    `CHAIN TITLE: ${brief.title}`,
    "",
    "AUTHOR'S GENERAL DESCRIPTION OF THE VALUE CHAIN:",
    brief.generalNarrative,
    "",
    "PROCESSES — exactly these, in this order, with these names:",
  ];
  brief.processes.forEach((p, i) => {
    lines.push(`${i + 1}. ${processCodeFor(code, i + 1)} — ${p.title}`);
    lines.push(`   Author's details: ${p.details || "(none given)"}`);
  });
  lines.push("", `Write the structured narrative now, beginning with the line "## ${code} — ${brief.title}".`);
  return lines.join("\n");
}

// ── Checking what came back ──────────────────────────────────────────────────

/**
 * Everything wrong with a built narrative; empty means it can be used. The generators locate a chain by its heading and a process by its
 * "### code — name" line, so those are held to the letter; the prose between is the model's.
 */
export function validateBuiltNarrative(md: string, code: string, brief: BriefInput): string[] {
  const text = (md ?? "").replace(/\r\n/g, "\n");
  const problems: string[] = [];
  const first = text.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  if (first !== `## ${code} — ${brief.title}`) problems.push(`The first line must be exactly "## ${code} — ${brief.title}".`);
  let at = -1;
  for (const label of NARRATIVE_LABELS) {
    const i = text.indexOf(label, at + 1);
    if (i < 0) problems.push(`The part ${label} is missing or out of order.`);
    else at = i;
  }
  const found = [...text.matchAll(/^###[ \t]+(\S+)[ \t]+[—–-][ \t]+(.+?)[ \t]*$/gm)].map((m) => ({ code: m[1], title: m[2] }));
  if (found.length !== brief.processes.length) problems.push(`There must be exactly ${brief.processes.length} process subsections (found ${found.length}).`);
  brief.processes.forEach((p, i) => {
    const want = processCodeFor(code, i + 1);
    const f = found[i];
    if (!f || f.code !== want || f.title !== p.title) problems.push(`Process subsection ${i + 1} must be exactly "### ${want} — ${p.title}".`);
  });
  if (!/\|[ \t]*Process[ \t]*\|[ \t]*External Actors[ \t]*\|/.test(text)) problems.push("The association matrix table is missing.");
  return problems;
}

/** Re-issue a built narrative under a different chain code (the code is only fixed when the chain is created): headings, matrix rows, and prose mentions. */
export function rewriteChainCode(md: string, from: string, to: string): string {
  if (from === to) return md;
  if (!CHAIN_CODE_RE.test(from) || !CHAIN_CODE_RE.test(to)) return md;
  const re = new RegExp(`\\b${from}(?=\\b|\\.\\d)`, "g");
  return md.replace(re, to);
}

// ── Suggested processes ──────────────────────────────────────────────────────

export interface SuggestedProcess { title: string; details: string }

/** Read the model's suggestion list. Tolerant of fences and prose; anything malformed is dropped. Clamped to the allowed bounds; null when there are too few. */
export function parseProcessSuggestions(text: string): SuggestedProcess[] | null {
  let s = (text ?? "").trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  let o: { processes?: unknown };
  try { o = JSON.parse(s); } catch { return null; }
  const list = Array.isArray(o.processes) ? o.processes : [];
  const out: SuggestedProcess[] = [];
  const seen = new Set<string>();
  for (const p of list) {
    const x = (p ?? {}) as Record<string, unknown>;
    const title = String(x.title ?? "").replace(/\s+/g, " ").replace(/^[VC]\d+(?:\.\d+)?\s*[—–:-]\s*/, "").trim();
    if (!title || title.length > MAX_TITLE_CHARS || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push({ title, details: String(x.details ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL_CHARS) });
    if (out.length === MAX_PROCESSES) break;
  }
  return out.length >= MIN_PROCESSES ? out : null;
}

export const SUGGEST_PROCESSES_SYSTEM = `You help an author list the processes inside a business value chain. You are given the chain's name and the author's description.

Propose between ${MIN_PROCESSES} and ${MAX_PROCESSES} processes, in the order the work happens, from the first thing that triggers the chain to the last thing that closes it. Each process is a distinct stretch of work with its own start and finish that one team or a small handful of roles carries out — not a single task, and not the whole chain.

Rules:
- Use the author's own words and names. Do not invent systems, parties or numbers the description does not give.
- A process name is a short noun phrase of two to six words ("Verify Applicant Identity"). No numbering, no codes, no verbs like "Start" or "End".
- "details" is ONE sentence saying what that process covers, drawn from the description.
- Prefer fewer, well-bounded processes to many thin ones; fewer than ${MIN_PROCESSES} is not acceptable and more than ${MAX_PROCESSES} is not allowed.

Return ONLY a JSON object of exactly this shape, nothing else:
{"processes":[{"title":"Receive Application","details":"The applicant submits the form and supporting documents and they are logged."}]}`;
