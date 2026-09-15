/**
 * Paul, 2026-09-15: "When using Assist an option Notification is displayed in
 * orange. What is this?" — an intent chip whose label read like a system alert
 * and whose click only opened the Events template picker. Renamed to
 * "Suggestion" and given a real target, the "Send Notification" template.
 *
 * Both halves are seeds (the catalogue and the template library are DB rows),
 * so the test reads the two seed scripts: the rename must be applied as a
 * RENAME (keeping the row and any admin keyword edits), the row must name the
 * template, and the template must exist with a send task.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", "..", p), "utf8");

describe("the Assist 'Suggestion' chip has a real target", () => {
  it("T4394 — the intent row is renamed in place and points at a template the seed actually defines", () => {
    const intents = read("scripts/seed-intent-keywords.ts");
    // A rename, not a second row: the seed is insert-only by label, so without
    // RENAMES the old "Notification" row would survive beside a new one.
    expect(intents).toMatch(/const RENAMES[^=]*=\s*\{\s*Notification:\s*"Suggestion"\s*\}/);
    expect(intents).toMatch(/for \(const \[from, to\] of Object\.entries\(RENAMES\)\)/);
    expect(intents, "no row may still be labelled Notification").not.toMatch(/label:\s*"Notification"/);
    const row = intents.match(/\{ label: "Suggestion",[^\n]*\}/)?.[0] ?? "";
    expect(row).toContain('targetTemplateName: "Send Notification"');
    for (const k of ["notify", "email", "alert", "remind"]) expect(row, `keyword ${k}`).toContain(`"${k}"`);

    const templates = read("scripts/seed-builtin-templates.ts");
    const frag = templates.match(/\{ name: "Send Notification",[\s\S]*?conns: \[[^\]]*\] \}/)?.[0] ?? "";
    expect(frag, "the template the row names must exist").not.toBe("");
    expect(frag).toContain('group: "Events"');
    expect(frag, "it is a SEND task, not a generic one").toContain('taskType: "send"');
    expect(frag).toContain('eventType: "message"');
    // …and the builder must carry taskType through, or the send marker is silently dropped.
    expect(templates).toContain('...(s.taskType ? { taskType: s.taskType as DiagramElement["taskType"] } : {})');
  });
});
