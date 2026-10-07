/**
 * T5275 — the Diagramatix BPMN prompt skill (Paul, 2026-10-07): a standalone skill for Greg that writes a Diagramatix-ready BPMN prompt
 * in the Process Repository's house format, with a refinement stage and a self-check. It is BUILT from the app's own code
 * (scripts/build-prompt-skill.ts), so these tests are the guard that it cannot drift from it:
 *   • the committed skills/dist is exactly what the build writes now;
 *   • its template is the app's template, verbatim, at the app's version;
 *   • its bundled checker agrees with the app's checkers on every BPMN prompt in the Process Repository;
 *   • it is portable — plain Agent Skills files, no reference to this repository.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { buildSkillFiles, SKILL_NAME } from "../../scripts/build-prompt-skill";
import { DEFAULT_MD_PROMPT_BPMN, latestTemplateVersion } from "@/app/lib/valueChain/promptTemplates";
import { checkPromptBranches } from "@/app/lib/valueChain/checkPromptBranches";
import { checkPromptShapes } from "@/app/lib/valueChain/checkPromptShapes";

const ROOT = resolve(__dirname, "..", "..");
const DIST = join(ROOT, "skills", "dist", SKILL_NAME);
const norm = (s: string) => s.replace(/\r\n/g, "\n");

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p, base) : [relative(base, p).split("\\").join("/")];
  }).sort();
}

const built = buildSkillFiles();

describe("T5275 the committed skill is what the build writes", () => {
  it("has exactly the built files, byte for byte (rebuild with: npx tsx scripts/build-prompt-skill.ts)", () => {
    expect(walk(DIST)).toEqual(Object.keys(built).sort());
    for (const [path, body] of Object.entries(built)) {
      expect(norm(readFileSync(join(DIST, path), "utf8")), `${path} is stale — rebuild the skill`).toBe(body);
    }
  });
  it("the zip Greg is given holds the same files", async () => {
    const zip = await JSZip.loadAsync(readFileSync(join(ROOT, "skills", "dist", `${SKILL_NAME}.zip`)));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
    expect(names).toEqual(Object.keys(built).map((p) => `${SKILL_NAME}/${p}`).sort());
    for (const [path, body] of Object.entries(built)) {
      expect(norm(await zip.file(`${SKILL_NAME}/${path}`)!.async("string")), `${path} in the zip is stale`).toBe(body);
    }
  });
});

describe("T5275 the template is the app's template", () => {
  it("references/master-template.md carries DEFAULT_MD_PROMPT_BPMN verbatim", () => {
    expect(built["references/master-template.md"]).toContain(DEFAULT_MD_PROMPT_BPMN);
  });
  it("is stamped with the app's current template version, in the files and in VERSION.json", () => {
    const latest = latestTemplateVersion("bpmn");
    expect(JSON.parse(built["VERSION.json"])).toMatchObject({ skill: SKILL_NAME, templateVersion: latest.version, templateCommit: latest.commit });
    expect(built["SKILL.md"]).toContain(`v${latest.version}`);
    expect(built["references/master-template.md"]).toContain(`Version ${latest.version}`);
  });
  it("the refinement dimensions come from the app's Refine step", () => {
    const src = readFileSync(join(ROOT, "app", "lib", "ai", "refineQuestions.ts"), "utf8");
    const dims = src.match(/export const BPMN_REFINE_DIMENSIONS = `([\s\S]*?)`;/)![1];
    expect(built["references/refine-questions.md"]).toContain(dims.replace(/\r\n/g, "\n"));
  });
});

describe("T5275 it is a portable Agent Skill", () => {
  const skill = built["SKILL.md"];
  const fm = skill.match(/^---\n([\s\S]*?)\n---\n/)!;
  it("has valid frontmatter: only name and description, within the limits every environment enforces", () => {
    expect(fm).not.toBeNull();
    const keys = [...fm[1].matchAll(/^([a-z-]+):/gm)].map((m) => m[1]);
    expect(keys).toEqual(["name", "description"]);
    const name = fm[1].match(/^name:\s*(.+)$/m)![1].trim();
    const description = fm[1].match(/^description:\s*(.+)$/m)![1].trim();
    expect(name).toBe(SKILL_NAME);
    expect(name).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description).not.toMatch(/[<>]/);
    expect(description).toMatch(/Use when/);
  });
  it("is short enough to load whole, and every file it points at exists", () => {
    expect(skill.split("\n").length).toBeLessThan(500);
    for (const ref of new Set([...skill.matchAll(/`((?:references|scripts)\/[A-Za-z0-9_.-]+)`/g)].map((m) => m[1]))) {
      expect(built[ref], `SKILL.md points at ${ref}, which is not in the skill`).toBeDefined();
    }
  });
  it("names no path in this repository and no environment-specific feature", () => {
    for (const [path, body] of Object.entries(built)) {
      if (path === "references/master-template.md") continue;                         // the template is quoted verbatim, whatever it says
      expect(body, path).not.toMatch(/app\/lib|C:\\|allowed-tools|\$\{CLAUDE/);
      if (path !== "README.md") expect(body, path).not.toMatch(/\.claude\//);        // the README's install steps legitimately name Claude Code's folder
    }
    // The checker needs only Node: every module it imports is a node: built-in.
    const imports = [...built["scripts/check_prompt.mjs"].matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    expect(imports.every((i) => i.startsWith("node:")), `non-built-in imports: ${imports.join(", ")}`).toBe(true);
  });
  it("works without code execution: the checklist stands alone and the script is described as optional", () => {
    expect(built["references/self-check.md"]).toContain("optional");
    expect(skill).toContain("If you cannot run code, do the checklist by reading");
  });
  it("has the six stages, including refinement before the draft and a bound on the questions", () => {
    for (const h of ["### 1. Intake", "### 2. Refine", "### 3. Draft", "### 4. Customise", "### 5. Self-check", "### 6. Deliver"]) expect(skill).toContain(h);
    expect(skill).toContain("**at most six** questions");
  });
  it("ships house rules that start with none active", () => {
    const hr = built["references/house-rules.md"];
    expect(hr).toContain("## ACTIVE RULES\n\n(none yet)");
    expect(hr).toContain("## EXAMPLES — NOT ACTIVE");
  });
});

/** Every BPMN prompt in the Process Repository: the text inside the fence under each "BPMN diagram prompt." label. */
function repositoryPrompts(): string[] {
  const md = norm(readFileSync(join(ROOT, "new features", "Process Repository Final.md"), "utf8"));
  const out: string[] = [];
  const re = /\*\*BPMN diagram prompt\.\*\*\s*\n+```text\n([\s\S]*?)\n```/g;
  for (let m = re.exec(md); m; m = re.exec(md)) out.push(m[1]);
  return out;
}

describe("T5275 the bundled checker agrees with the app's", () => {
  it("returns the same findings as checkPromptShapes and checkPromptBranches on every repository BPMN prompt", async () => {
    const mod = await import(pathToFileURL(join(DIST, "scripts", "check_prompt.mjs")).href) as {
      checkPromptShapes: typeof checkPromptShapes; checkPromptBranches: typeof checkPromptBranches;
    };
    const prompts = repositoryPrompts();
    expect(prompts.length).toBeGreaterThan(50);
    let flagged = 0;
    for (const [i, p] of prompts.entries()) {
      const a = { shapes: checkPromptShapes(p), branches: checkPromptBranches(p) };
      const b = { shapes: mod.checkPromptShapes(p), branches: mod.checkPromptBranches(p) };
      expect(b, `prompt #${i + 1} differs between the bundled checker and the app's`).toEqual(a);
      if (a.shapes.length || a.branches.length) flagged++;
    }
    expect(flagged, "the corpus should contain some flagged prompts, or this proves nothing").toBeGreaterThan(0);
  });
  it("passes the example prompt it ships, and flags each kind of defect in a bad one", async () => {
    const { runChecks } = await import(pathToFileURL(join(DIST, "scripts", "check_prompt.mjs")).href) as {
      runChecks: (p: string) => { line: number; kind: string }[];
    };
    const examples = [...built["references/example-prompt.md"].matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    expect(examples).toHaveLength(2);
    for (const e of examples) expect(runChecks(e)).toEqual([]);
    const bad = [
      "Here is a prompt", "", "1. Pools & Lanes", 'Pool "A" — x', "4. Lane contents in flow order (A)",
      '  Exclusive gateway "OK?"', '  - branch "No": User task "x"', "  - branch \"Yes\": continues to the next task",
      'Data Store "Ledger"', 'then back to "Capture"', "non-interrupting timer boundary event",
    ].join("\n");
    const kinds = new Set(runChecks(bad).map((i) => i.kind));
    for (const k of ["opening-line", "missing-section", "branch-without-destination", "destination-not-an-element", "data-store", "loop-back", "non-interrupting"]) {
      expect(kinds.has(k), `a ${k} defect should be reported`).toBe(true);
    }
  });
});
