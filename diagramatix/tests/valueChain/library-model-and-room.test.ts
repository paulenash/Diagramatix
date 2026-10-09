/**
 * T5293 — the Process Repository (master) generates with the SuperAdmin's remembered model, and a prompt has room to finish.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const lib = readFileSync("app/lib/valueChain/libraryAdmin.ts", "utf8");
const gen = readFileSync("app/lib/valueChain/generatePrompt.ts", "utf8");
const ui = readFileSync("app/(dashboard)/dashboard/admin/value-chain-library/ValueChainLibraryClient.tsx", "utf8");
const menu = readFileSync("app/(dashboard)/dashboard/DashboardClient.tsx", "utf8");

describe("T5293 Process Repository model choice and room", () => {
  it("master scope uses the remembered model for both questions and regeneration; an Org keeps its own", () => {
    expect(lib.match(/scopeOrg \? await resolveOrgModel\(\) : await masterLibraryModel\(\)/g)).toHaveLength(2);
    expect(lib).toContain('LIBRARY_MODEL_KEY = "valueChain.library.model"');
    expect(lib).toMatch(/action === "set-model"[\s\S]{0,200}if \(scopeOrg\) return NextResponse\.json\([^)]*403/);
  });
  it("the screen shows and sets the model for the master only", () => {
    expect(ui).toContain('action: "set-model"');
    expect(ui).toMatch(/scope !== "org" && models\.length > 0/);
  });
  it("prompts have room to finish (8192 truncated V01.05 and V01.07)", () => {
    const ladder = /PROMPT_TOKEN_LIMITS = \[(\d+), (\d+)\]/.exec(gen)!;
    expect(Number(ladder[1])).toBeGreaterThanOrEqual(16000);
    expect(Number(ladder[2])).toBe(Number(ladder[1]) * 2);        // ONE retry with double the room
    expect(gen).toMatch(/for \(const max_tokens of PROMPT_TOKEN_LIMITS\)/);
    expect(gen).toContain("The model ran out of room");           // a run that fails both attempts is still refused, never saved
  });
  it("the duplicate System-menu link to the .md tool is gone (the SuperAdmin tile remains)", () => {
    expect(menu).not.toContain("Create Project Diagrams from .md");
  });
});
