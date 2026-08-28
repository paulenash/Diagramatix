/**
 * The Process Repository as data — importing a `.md` into the library, and
 * rendering the library back out.
 *
 * The document stops being the source of truth and becomes the seed and
 * interchange format. Everything here is PURE: shaping only, no database, so the
 * round trip (import → export → import) can be tested without one. The DB writes
 * live in the API route.
 *
 * WHY THE NAMES MATTER. A prompt's `name` becomes the generated diagram's name,
 * and the link scan matches subprocess element labels against diagram names. So
 * the names produced here must be byte-identical to the ones `parseValueChainMd`
 * produces from the same document — otherwise importing the library would
 * silently break linking for every project generated from it. `T2900` pins that
 * against the real document rather than against a copy of the rule.
 */
import { chainCodes, chainSection, chainTitle, chainNarrative, subprocessHeadings } from "./chainSource";
import { findBlocks, blocksOfChain } from "./spliceBlocks";
import { type MdPromptType, MD_PROMPT_LABEL, renderPromptBlock } from "./promptTemplates";

/** label → type, matching `parseValueChainMd`'s `LABEL_TO_TYPE`. */
const TYPE_OF_LABEL: Record<string, MdPromptType> = {
  "Value Chain": "value-chain",
  Context: "context",
  "Process Context": "process-context",
  ArchiMate: "archimate",
  BPMN: "bpmn",
};

export interface ImportedProcess { code: string; title: string; sortOrder: number }

export interface ImportedPrompt {
  type: MdPromptType;
  /** "V01.03" for BPMN; "" for a chain-level prompt. */
  processCode: string;
  name: string;
  prompt: string;
}

export interface ImportedChain {
  code: string;
  title: string;
  groupName: string;
  sortOrder: number;
  narrative: string;
  processes: ImportedProcess[];
  prompts: ImportedPrompt[];
}

/**
 * Which catalogue group each chain sits under.
 *
 * Read from the `### <Group>` headings and `- **Vnn**` lines of the numbered
 * catalogue, so the grouping the document already states is carried across
 * rather than re-invented here. A chain the catalogue does not mention simply
 * gets an empty group, which the maintenance screen can then set.
 */
export function groupsFromMd(md: string): Map<string, string> {
  const out = new Map<string, string>();
  const text = md.replace(/\r\n/g, "\n");
  const start = text.indexOf("## The Numbered Catalogue");
  if (start < 0) return out;
  const end = text.indexOf("\n## ", start + 4);
  const section = text.slice(start, end < 0 ? undefined : end);
  let group = "";
  for (const line of section.split("\n")) {
    const h = /^###[ \t]+(.+?)[ \t\r]*$/.exec(line);
    if (h) { group = h[1].trim(); continue; }
    const c = /^-[ \t]+\*\*(V\d+)\*\*/.exec(line);
    if (c && group) out.set(c[1], group);
  }
  return out;
}

/** The whole document, shaped for the library. */
export function parseLibraryFromMd(md: string): ImportedChain[] {
  const groups = groupsFromMd(md);
  const blocks = findBlocks(md);
  const out: ImportedChain[] = [];

  chainCodes(md).forEach((code, i) => {
    const section = chainSection(md, code);
    if (!section) return;
    const title = chainTitle(section);
    const subs = subprocessHeadings(section, code);
    const byCode = new Map(subs.map((s) => [s.code, s.title]));

    const prompts: ImportedPrompt[] = [];
    for (const b of blocksOfChain(blocks, code)) {
      const type = TYPE_OF_LABEL[b.label];
      if (!type || !b.text.trim()) continue;
      if (type === "bpmn") {
        // The heading is what identifies the process — same rule the splice uses.
        const heading = (b.under ?? "").trim();
        const pCode = heading.split(/[—–-]/)[0].trim();
        prompts.push({
          type,
          // Only accept a code the chain actually declares; a BPMN block under no
          // heading (or a stray one) is chain-level rather than silently claiming
          // a process that does not exist.
          processCode: byCode.has(pCode) ? pCode : "",
          // Matches parseValueChainMd's `tidyHeading(head.text)` for a real
          // heading, and its fallback when there is none.
          name: heading ? tidyHeading(heading) : `${code} ${title} — BPMN`,
          prompt: b.text,
        });
      } else {
        prompts.push({ type, processCode: "", name: `${code} ${title} — ${MD_PROMPT_LABEL[type]}`, prompt: b.text });
      }
    }

    out.push({
      code, title,
      groupName: groups.get(code) ?? "",
      sortOrder: i,
      narrative: chainNarrative(section),
      processes: subs.map((s, k) => ({ code: s.code, title: s.title, sortOrder: k })),
      prompts,
    });
  });
  return out;
}

/** `### V01.02 — Validate Customer` → `V01.02 Validate Customer`. */
export function tidyHeading(text: string): string {
  return text.replace(/[—–]/g, "-").replace(/\s*-\s*/, " ").replace(/\s+/g, " ").trim();
}

/**
 * A chain rendered back as markdown, in the document's own shape.
 *
 * Narrative, then the chain-level prompts, then a `### code — title` section per
 * process carrying its BPMN prompt. Not a byte-identical reproduction of the
 * original file — the original interleaves the matrix between prompts, and
 * chains differ from each other in that ordering — but a document that
 * `parseValueChainMd` reads back to exactly the same chains, names, types and
 * prompts. That equivalence is what `T2900` checks, and it is the property that
 * actually matters.
 */
export function renderChainMd(chain: ImportedChain, eol = "\n"): string {
  const parts: string[] = [`## ${chain.code} — ${chain.title}`, "", chain.narrative.replace(/^##[^\n]*\n+/, "").trim(), ""];
  const chainLevel: MdPromptType[] = ["value-chain", "context", "process-context", "archimate"];
  for (const type of chainLevel) {
    const p = chain.prompts.find((x) => x.type === type && !x.processCode);
    if (p) parts.push(renderPromptBlock(type, p.prompt), "");
  }
  for (const proc of [...chain.processes].sort((a, z) => a.sortOrder - z.sortOrder)) {
    parts.push(`### ${proc.code} — ${proc.title}`, "");
    const p = chain.prompts.find((x) => x.type === "bpmn" && x.processCode === proc.code);
    if (p) parts.push(renderPromptBlock("bpmn", p.prompt), "");
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n/g, eol);
}

/** The whole library as one document, ready to download. */
export function renderLibraryMd(chains: ImportedChain[], eol = "\n"): string {
  const head = ["# Process Repository", "", "Exported from the Diagramatix library.", "", "---", ""].join("\n");
  return (head + chains.map((c) => renderChainMd(c, "\n")).join("\n")).replace(/\n/g, eol);
}

/**
 * Renumber a chain's processes to `<code>.01`, `.02`, … in sort order.
 *
 * Returns the mapping so a caller can move each process's prompt with it. Codes
 * are LOCAL: nothing outside a process's own prompt quotes them, because prompt
 * cross-references are by name (see `promptTemplates`). That is what makes
 * inserting or removing a process a small operation rather than a cascade.
 */
export function renumber(chainCode: string, processes: ImportedProcess[]): Map<string, string> {
  const map = new Map<string, string>();
  [...processes]
    .sort((a, z) => a.sortOrder - z.sortOrder)
    .forEach((p, i) => map.set(p.code, `${chainCode}.${String(i + 1).padStart(2, "0")}`));
  return map;
}
