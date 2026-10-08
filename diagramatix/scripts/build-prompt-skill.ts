/**
 * Build the "Diagramatix BPMN prompt" skill — the one Greg is given — from the app's own code, so it can never drift from it.
 *
 *   npx tsx scripts/build-prompt-skill.ts
 *
 * Reads the hand-written files in skills/src/diagramatix-bpmn-prompt/ and GENERATES the parts that must match the app:
 *   • references/master-template.md  — DEFAULT_MD_PROMPT_BPMN, the house template, verbatim (app/lib/valueChain/promptTemplates.ts)
 *   • references/example-prompt.md   — a real prompt from the Process Repository (new features/Process Repository Final.md)
 *   • scripts/check_prompt.mjs       — checkPromptShapes + checkPromptBranches, transpiled from the app's TypeScript, plus a few
 *                                      structural checks; dependency-free Node, so it runs anywhere Node does
 *   • VERSION.json                   — the template version it was built from
 * and fills {{TEMPLATE_VERSION}}, {{TEMPLATE_DATE}} and {{DIMENSIONS}} in the hand-written files.
 *
 * Writes skills/dist/diagramatix-bpmn-prompt/ and skills/dist/diagramatix-bpmn-prompt.zip. tests/skills/prompt-skill.test.ts fails when
 * the committed dist is not what this would write now — change the template, the checkers or the Process Repository example without
 * rebuilding and the build breaks, which is the point: one rule, one place.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import JSZip from "jszip";
import { DEFAULT_MD_PROMPT_BPMN, latestTemplateVersion } from "../app/lib/valueChain/promptTemplates";

const ROOT = resolve(__dirname, "..");
export const SKILL_NAME = "diagramatix-bpmn-prompt";
const SRC = join(ROOT, "skills", "src", SKILL_NAME);
const DIST = join(ROOT, "skills", "dist");
const EXAMPLE_FROM = join(ROOT, "new features", "Process Repository Final.md");
/** The repository prompts shipped as examples, by code. V01.01 is simple; V26.05 adds a parallel gateway, nested decisions and boundary events. */
const EXAMPLE_CODES = ["V01.01", "V26.05"];

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** Every file under a directory, as posix-style relative paths. */
function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).split("\\").join("/"));
  }
  return out.sort();
}

/** BPMN_REFINE_DIMENSIONS, read from source rather than imported (the module pulls in the AI client). */
function refineDimensions(): string {
  const src = read(join(ROOT, "app", "lib", "ai", "refineQuestions.ts"));
  const m = src.match(/export const BPMN_REFINE_DIMENSIONS = `([\s\S]*?)`;/);
  if (!m) throw new Error("BPMN_REFINE_DIMENSIONS not found in refineQuestions.ts");
  return m[1];
}

/** A repository prompt by code: its heading, and the text inside its ```text fence under the "BPMN diagram prompt." label. */
function exampleBlock(code: string): { title: string; text: string } {
  const md = read(EXAMPLE_FROM);
  const at = md.indexOf(`\n### ${code} `);
  if (at < 0) throw new Error(`${code} not found in the Process Repository`);
  const title = md.slice(at + 5, md.indexOf("\n", at + 5)).trim();
  const open = md.indexOf("```text\n", at);
  const close = md.indexOf("\n```", open + 8);
  if (open < 0 || close < 0) throw new Error("example prompt fence not found");
  return { title, text: md.slice(open + 8, close).replace(/\s+$/, "") };
}

/** Transpile one of the app's checkers to plain ESM JavaScript. Both are self-contained (no imports). */
function transpile(file: string): string {
  const js = ts.transpileModule(read(join(ROOT, "app", "lib", "valueChain", file)), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, removeComments: false },
  }).outputText;
  if (/^\s*import\s/m.test(js)) throw new Error(`${file} has an import — the bundled checker must stay self-contained`);
  return js;
}

const CHECKER_WRAPPER = String.raw`
// ── Structural checks (not part of the app's checkers) ───────────────────────────────────────────────────────────────────────
const SECTIONS = [
  [/^1\.\s*Pools\s*&\s*Lanes/im, "1. Pools & Lanes"],
  [/^2\.\s*Pool properties/im, "2. Pool properties"],
  [/^3\.\s*Layout/im, "3. Layout"],
  [/^4\.\s*Lane contents/im, "4. Lane contents in flow order"],
  [/^5\.\s*Edge-mounted/im, "5. Edge-mounted (boundary) events"],
  [/^6\.\s*Connectors/im, "6. Connectors"],
  [/^7\.\s*Data objects/im, "7. Data objects"],
];

export function checkStructure(prompt) {
  const issues = [];
  const lines = prompt.split(/\r?\n/);
  const lineOf = (re) => { const i = lines.findIndex((l) => re.test(l)); return i < 0 ? 0 : i + 1; };
  const first = lines.find((l) => l.trim());
  if (!first || !/^BPMN:\s/.test(first.trim())) issues.push({ line: 1, kind: "opening-line", detail: 'the prompt must open with one line: "BPMN: <Process Name> — <one clause>."' });
  let prev = -1;
  for (const [re, name] of SECTIONS) {
    const at = lines.findIndex((l) => re.test(l.trim()));
    if (at < 0) { issues.push({ line: 0, kind: "missing-section", detail: "missing section " + name }); continue; }
    if (at < prev) issues.push({ line: at + 1, kind: "section-order", detail: name + " is out of order" });
    prev = Math.max(prev, at);
  }
  const ds = lineOf(/data store/i);
  if (ds) issues.push({ line: ds, kind: "data-store", detail: "a Data Store is never used — a system of record is the system's black-box pool" });
  const ni = lineOf(/non-interrupting/i);
  if (ni) issues.push({ line: ni, kind: "non-interrupting", detail: "every edge-mounted event is interrupting; do not write non-interrupting" });
  const lb = lineOf(/\b(then|goes?|going)\s+back\s+to\b|\bloops?\s+back\s+to\b/i);
  if (lb) issues.push({ line: lb, kind: "loop-back", detail: "repetition is a standard-loop subprocess, never a flow back to an earlier element" });
  const nx = lineOf(/continues?\s+to\s+(the\s+)?next\s+(task|step|activity)\b/i);
  if (nx) issues.push({ line: nx, kind: "destination-not-an-element", detail: '"continue to the next task" names nothing that can be drawn — name the element' });
  const ln = lineOf(/continues?\s+to\s+the\s+[^"\n]*\blane\b/i);
  if (ln) issues.push({ line: ln, kind: "destination-not-an-element", detail: "a lane is not a destination — name the element it continues to" });
  return issues;
}

// ── Command line ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function runChecks(prompt) {
  return [
    ...checkStructure(prompt),
    ...checkPromptShapes(prompt, true).map((i) => ({ line: i.line, kind: i.kind, detail: i.detail })),
    ...checkPromptBranches(prompt).map((i) => ({ line: i.line, kind: "branch-without-destination", detail: 'gateway "' + i.gateway + '", branch "' + i.condition + '" never says where it goes' })),
  ].sort((a, b) => a.line - b.line);
}

async function main() {
  const { readFileSync } = await import("node:fs");
  const arg = process.argv[2];
  let text;
  if (arg) text = readFileSync(arg, "utf8");
  else { const chunks = []; for await (const c of process.stdin) chunks.push(c); text = Buffer.concat(chunks).toString("utf8"); }
  if (!text.trim()) { console.error("Give a prompt file as the argument, or pipe the prompt in."); process.exit(2); }
  const issues = runChecks(text);
  if (issues.length === 0) { console.log("OK — no issues found."); return; }
  for (const i of issues) console.log((i.line ? "line " + i.line : "prompt").padEnd(9) + " [" + i.kind + "] " + i.detail);
  console.log("\n" + issues.length + " issue" + (issues.length === 1 ? "" : "s") + " found.");
  process.exitCode = 1;
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
`;

function checkerScript(): string {
  return [
    "#!/usr/bin/env node",
    "// GENERATED by scripts/build-prompt-skill.ts in the Diagramatix repository — do not edit by hand.",
    "// The two checkers below (checkPromptShapes and checkPromptBranches) are the ones Diagramatix itself runs on its prompts, transpiled.",
    "// Dependency-free: needs only Node.js 18 or later.   Usage:  node check_prompt.mjs prompt.txt   |   cat prompt.txt | node check_prompt.mjs",
    "",
    transpile("checkPromptShapes.ts"),
    transpile("checkPromptBranches.ts"),
    CHECKER_WRAPPER,
  ].join("\n");
}

function masterTemplate(version: number, date: string): string {
  return [
    "# The Diagramatix BPMN prompt template (house standard)",
    "",
    `Version ${version} (${date}). **This is the authoritative template.** It is copied verbatim from Diagramatix's source (\`DEFAULT_MD_PROMPT_BPMN\`) by the build, so it is exactly what Diagramatix itself uses to write the prompts in its Process Repository.`,
    "",
    "Read it all before drafting: its rules interact and are only correct together (for example, the wait rule and the boundary-event rule must be read as a pair).",
    "",
    "**Reading notes for this skill.** The text speaks to a model writing prompts for one subprocess of a *value chain*, supplied with a *value chain narrative*. For this skill, the \"narrative\" is whatever description the user gave you or answered; a process code in the opening line is optional; and the output contract (\"output ONLY the prompt text\") applies to the prompt itself — the text inside the fence — while your own Assumptions and Checks notes go outside the fence. Everything else applies as written.",
    "",
    "---",
    "",
    DEFAULT_MD_PROMPT_BPMN,
    "",
  ].join("\n");
}

/** Every file of the built skill, by path inside the skill folder. Pure: the same inputs give the same files. */
export function buildSkillFiles(): Record<string, string> {
  const latest = latestTemplateVersion("bpmn");
  const subs: Record<string, string> = {
    "{{TEMPLATE_VERSION}}": `v${latest.version}`,
    "{{TEMPLATE_DATE}}": latest.at,
    "{{DIMENSIONS}}": refineDimensions(),
  };
  const fill = (s: string) => Object.entries(subs).reduce((t, [k, v]) => t.split(k).join(v), s);

  const files: Record<string, string> = {};
  for (const rel of walk(SRC)) files[rel] = fill(read(join(SRC, rel)));

  files["references/master-template.md"] = masterTemplate(latest.version, latest.at);
  const examples = EXAMPLE_CODES.map(exampleBlock);
  files["references/example-prompt.md"] = [
    "# Real prompts of the right shape",
    "",
    "These are two prompts from Diagramatix's Process Repository — prompts it generates diagrams from. Match their **shape and level of detail**; do not copy their content.",
    "",
    "- **Example 1 — simple.** The format; a decision whose branches close at a named merge; a loop written as a standard-loop subprocess; a timer boundary event on that subprocess; message flows that cross pool boundaries (to a customer pool and to a system pool); data objects.",
    "- **Example 2 — richer.** Adds a **parallel** split with its matching **parallel merge**, **nested decisions** (a decision inside a branch of another), several **boundary events**, and branches that end in their own End events.",
    "",
    ...examples.flatMap((ex, i) => [`## Example ${i + 1} — ${ex.title}`, "", "```text", ex.text, "```", ""]),
  ].join("\n");
  files["scripts/check_prompt.mjs"] = checkerScript();
  files["VERSION.json"] = JSON.stringify(
    { skill: SKILL_NAME, templateVersion: latest.version, templateDate: latest.at, templateCommit: latest.commit, shippedAt: latest.shippedAt }, null, 2) + "\n";

  for (const [path, body] of Object.entries(files)) {
    if (/\{\{[A-Z_]+\}\}/.test(body)) throw new Error(`unfilled placeholder in ${path}`);
  }
  return files;
}

export async function buildZip(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  // Fixed dates: the same files give the same bytes, so a rebuild is not a diff.
  const date = new Date("2026-01-01T00:00:00Z");
  for (const path of Object.keys(files).sort()) zip.file(`${SKILL_NAME}/${path}`, files[path], { date });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
}

async function main() {
  const files = buildSkillFiles();
  const out = join(DIST, SKILL_NAME);
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  for (const [path, body] of Object.entries(files)) {
    const full = join(out, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  writeFileSync(join(DIST, `${SKILL_NAME}.zip`), await buildZip(files));
  console.log(`built ${Object.keys(files).length} files → skills/dist/${SKILL_NAME}/ and ${SKILL_NAME}.zip`);
}

if (process.argv[1] && /build-prompt-skill\.ts$/.test(process.argv[1].split("\\").join("/"))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
