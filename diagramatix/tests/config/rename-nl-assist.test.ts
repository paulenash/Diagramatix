/**
 * T5217 — "Assist" is "NL Assist" (Paul, 2026-10-02: "Rename 'Assist' to 'NL Assist' and its associated tile, User Guide
 * and Feature entries, and any other references to it"). The 👻 ghost-suggestion feature only: "Voice Assist" keeps its
 * name, and identifiers (AssistOp, applyAssistOps, the ai-assist chapter slug, the nl-assist feature key) are untouched.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FEATURES } from "@/app/lib/features/registry";

const read = (p: string) => readFileSync(p, "utf8");

/** Every standalone "Assist" that is not "Voice Assist" or "NL Assist". */
const bare = (text: string): string[] =>
  [...text.matchAll(/(?<!Voice )(?<!NL )\bAssist\b/g)].map((m) => text.slice(Math.max(0, m.index! - 24), m.index! + 30).replace(/\s+/g, " "));

describe("T5217 what the person sees", () => {
  it("the toolbar button and its tooltips say NL Assist", () => {
    const editor = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(editor).toContain("👻 NL Assist{assistEnabled");
    expect(editor).toContain("NL Assist ON —");
    expect(editor).toContain("NL Assist OFF —");
  });
  it("the admin tile, its page and the link to it say NL Assist Rules", () => {
    expect(read("app/(dashboard)/dashboard/admin/AdminClient.tsx")).toContain('title: "NL Assist Rules"');
    expect(read("app/(dashboard)/dashboard/admin/intent-keywords/IntentKeywordsClient.tsx")).toContain(">NL Assist Rules</h1>");
    expect(read("app/(dashboard)/dashboard/admin/voice-assist-commands/VoiceAssistCommandsClient.tsx")).toContain(">NL Assist Rules</Link>");
  });
  it("the feature registry labels it NL Assist (the key was already nl-assist and does not change)", () => {
    const f = FEATURES.find((x) => x.key === "nl-assist");
    expect(f?.label).toBe("NL Assist");
  });
  it("the rules group, the help tile and the spoken messages say it too", () => {
    expect(read("app/(dashboard)/dashboard/rules/RulesEditor.tsx")).toContain('"NL Assist / Voice Commands"');
    expect(read("app/(dashboard)/dashboard/admin/voice-assist-help/VoiceAssistHelpClient.tsx")).toContain("NL Assist is active");
    expect(read("app/lib/assist/applyAssistOps.ts")).toContain("select an element with NL Assist on");
    expect(read("app/lib/assist/commandCatalog.ts")).toContain("Take an NL Assist ghost suggestion (👻 NL Assist on");
  });
});

describe("T5217 the seeds and the docs carry the new name, so a re-seed does not bring the old one back", () => {
  const files = [
    "scripts/add-guide-ai-assist.ts", "scripts/add-features-ai-assist.ts", "scripts/add-features-ai-assist.sql",
    "scripts/add-tech-notes-ai-assist.ts", "scripts/sql/seed-voice-assist-content.sql", "docs/voice-assist-commands.md",
  ];
  for (const f of files) {
    it(`${f}: no bare “Assist”, no “AI Assist”, no “Assist / NL Rules”`, () => {
      const t = read(f);
      expect(bare(t), "a standalone Assist is left").toEqual([]);
      expect(t).not.toMatch(/\bAI Assist\b/);
      expect(t).not.toContain("Assist / NL Rules");
    });
  }
  it("Voice Assist is untouched where it is named", () => {
    expect(read("scripts/sql/seed-voice-assist-content.sql")).toContain("Voice Assist — Voice-Driven Diagramming");
    expect(read("scripts/sql/seed-voice-assist-content.sql")).toContain("🪄 Voice Assist");
    expect(read("scripts/sql/seed-voice-assist-content.sql")).toContain("Assistant and Staff");   // “Assistant” is not “Assist”
  });
  it("the chapter slug stays ai-assist (it is in URLs and in the seeds' lookups); only the title changed", () => {
    const seed = read("scripts/sql/seed-voice-assist-content.sql");
    expect(seed).toContain("slug = 'ai-assist'");
    expect(seed).toContain("'NL Assist & Voice Assist'");
  });
});

describe("T5217 the production patch for the live rows", () => {
  const sql = read("scripts/sql/patch-rename-assist-to-nl-assist.sql");
  it("is one transaction, with a report after the commit", () => {
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;[\s\S]*SELECT/);
    expect(sql.indexOf("COMMIT;")).toBeLessThan(sql.lastIndexOf("SELECT"));
  });
  it("renames the three old spellings and never Voice Assist", () => {
    expect(sql).toContain("'Assist / NL Rules', 'NL Assist Rules'");
    expect(sql).toContain("'\\mAI Assist\\M', 'NL Assist'");
    expect(sql).toContain("(?<!Voice )(?<!NL )\\mAssist\\M");
  });
  it("limits the bare-word rename to the ai-assist chapters and the one feature; the others are only listed", () => {
    expect(sql).toContain("c.slug = 'ai-assist'");
    expect(sql).toContain("AI Assist%Suggest as You Draw");
    expect(sql).toMatch(/Report — run after the commit/);
  });
  it("is idempotent: each UPDATE acts only on a row its own rename would change", () => {
    expect(sql).toContain("title <> pg_temp.nl_assist(title)");
    expect(sql).toContain('s."bodyMarkdown" <> pg_temp.nl_assist(s."bodyMarkdown")');
  });
});
