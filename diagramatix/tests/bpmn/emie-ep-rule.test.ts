/**
 * T5278 — R8.45 is written down in every place that has to know it (Paul, 2026-10-07): the master prompt template (so a writer is told),
 * the prompt checker (so a prompt that breaks it is caught before it is used), and the BPMN rules (a Red Rule, in the code-backed Group 8:
 * in the seed and in an idempotent SQL patch for the live database). The layout fix that makes generation obey it is T5277.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkPromptShapes } from "@/app/lib/valueChain/checkPromptShapes";
import { DEFAULT_MD_PROMPT_BPMN } from "@/app/lib/valueChain/promptTemplates";

const seed = readFileSync("scripts/seed-diagram-rules.cjs", "utf8");
const sql = readFileSync("scripts/sql/patch-rule-r8-45-emie-stays-in-its-ep.sql", "utf8");

/** The shape that the new prompt skill wrote for "Application Assessment" and that Diagramatix drew wrongly. */
const LEAVING = `4. Lane contents in flow order (Organisation)

Front Office lane:
  Exclusive gateway "Application complete?"
  - branch "No — details missing":
      Expanded Subprocess "Repeat Until Application Complete" (standard
        loop) containing, in order: Send task "Request further details from
        Applicant", Receive task "Await applicant's reply", User task
        "Update application details"
      (continues to exclusive merge gateway "Application complete")

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Receive task "Await applicant's
  reply", labelled "No reply by reminder date", leading to Send task "Send
  reminder to Applicant", then Receive task "Await reply to reminder", then
  (continues to User task "Update application details").
`;
const MOUNTED_ON_EP = LEAVING.replace(
  /Interrupting timer boundary event on Receive task "Await applicant's\n  reply", labelled "No reply by reminder date", leading to Send task "Send\n  reminder to Applicant", then Receive task "Await reply to reminder", then\n  \(continues to User task "Update application details"\)\./,
  `Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Application Complete", labelled "No reply by reminder date", leading to Send
  task "Send reminder to Applicant", then Receive task "Await reply to
  reminder", then (continues to Expanded Subprocess "Repeat Until Application
  Complete").`,
);
const STAYS_INSIDE = LEAVING.replace(
  /leading to Send task "Send\n  reminder to Applicant", then Receive task "Await reply to reminder", then\n  \(continues to User task "Update application details"\)\./,
  `leading to
  (continues to User task "Update application details").`,
);

describe("T5278 the prompt checker catches an exception path that leaves its subprocess", () => {
  it("flags a boundary event on a step inside an Expanded Subprocess whose path leads out", () => {
    const issues = checkPromptShapes(LEAVING).filter((i) => i.kind === "boundary-leaves-subprocess");
    expect(issues).toHaveLength(1);
    expect(issues[0].detail).toContain('"Await applicant\'s reply"');
    expect(issues[0].detail).toContain('"Repeat Until Application Complete"');
    expect(issues[0].detail).toContain('"Send reminder to Applicant"');
    expect(issues[0].detail).toContain("mount the event on the Expanded Subprocess itself");
  });
  it("does not flag the corrected form: the event on the Expanded Subprocess itself", () => {
    expect(MOUNTED_ON_EP).not.toBe(LEAVING);
    expect(checkPromptShapes(MOUNTED_ON_EP).filter((i) => i.kind === "boundary-leaves-subprocess")).toEqual([]);
  });
  it("does not flag a path that stays inside the subprocess", () => {
    expect(STAYS_INSIDE).not.toBe(LEAVING);
    expect(checkPromptShapes(STAYS_INSIDE).filter((i) => i.kind === "boundary-leaves-subprocess")).toEqual([]);
  });
  it("flags an End event outside as well — the path leaves either way", () => {
    const toEnd = LEAVING.replace(/leading to Send task[\s\S]*\(continues to User task "Update application details"\)\./, 'leading to End event "Application lapsed".');
    expect(checkPromptShapes(toEnd).filter((i) => i.kind === "boundary-leaves-subprocess")).toHaveLength(1);
  });
});

describe("T5278 the master template tells the writer", () => {
  it("says a boundary event on a step inside an Expanded Subprocess stays inside it, and how to leave", () => {
    for (const needle of [
      "A BOUNDARY EVENT ON A STEP INSIDE AN EXPANDED SUBPROCESS STAYS INSIDE IT",
      "mount the event on the Expanded Subprocess",
      "boundary event on Expanded Subprocess \"<name>\"",
      "comes back to the\n  subprocess BY NAME, never to a step inside it",
    ]) expect(DEFAULT_MD_PROMPT_BPMN, needle).toContain(needle);
  });
});

function ruleFromSeed(): string {
  const at = seed.indexOf("R8.45:");
  let end = at;
  for (;;) { end = seed.indexOf('"', end + 1); if (seed[end - 1] !== "\\") break; }
  return JSON.parse(`"${seed.slice(at, end)}"`) as string;
}
const ruleFromSql = () => sql.match(/\$NEW\$(R8\.45:[\s\S]*?)\$NEW\$/)?.[1] ?? "";

describe("T5278 R8.45 is a Red Rule in Group 8 of the BPMN rules", () => {
  it("is in the seeded rules, after R8.44, in Group 8", () => {
    expect(seed.indexOf("R8.45:")).toBeGreaterThan(seed.indexOf("R8.44:"));
    expect(seed.indexOf("Group 8: Auto-Layout Placement")).toBeLessThan(seed.indexOf("R8.45:"));
  });
  it("the seed and the SQL patch say exactly the same thing", () => {
    expect(ruleFromSql().trim()).toBe(ruleFromSeed().trim());
  });
  it("states the whole rule: stays inside, mount on the EP itself, the path returns to the EP, B41, generation re-mounts", () => {
    const t = ruleFromSql();
    for (const n of ["NEVER leads to anything outside", "mount the EMIE on the Expanded Subprocess itself", "never to a step inside it", "B41", "Generation re-mounts"]) expect(t, n).toContain(n);
  });
  it("the SQL is safe on the live database: guarded, appends only when Group 8 is last, never a reseed, reports after the commit", () => {
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).toContain("rules NOT LIKE '%R8.45:%'");
    expect(code).toContain("LIKE 'Group 8: Auto-Layout Placement%'");
    expect(code).toContain("WHERE id = 'default-bpmn' AND category = 'bpmn'");
    expect(code).not.toMatch(/^\s*(INSERT|DELETE\s+FROM|DROP\s+|TRUNCATE\s+)/im);
    expect(code.indexOf("COMMIT;")).toBeLessThan(code.indexOf("SELECT CASE"));
  });
});
