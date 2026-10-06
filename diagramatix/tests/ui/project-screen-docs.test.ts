/**
 * T5263 — the User Guide text for the Project screen's right-click menus, Move-to-project window and Properties panels (Paul, 2026-10-06),
 * as an idempotent SQL patch for the in-app Database tile (proven locally in a rolled-back transaction, run twice: three inserts and one
 * update, then none). What it says must match what the screen does (T5262).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("scripts/sql/patch-ug-project-screen-menus-2026-10-06.sql", "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const screen = readFileSync("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx", "utf8");

describe("T5263 the Project-screen documentation patch", () => {
  it("adds three sections to the Projects & Folders chapter, each only when its heading is not there", () => {
    for (const h of ["Right-click menus on the project screen", "Moving a diagram to another project", "Properties panels on the project screen"]) expect(sql).toContain(`'${h}'`);
    expect(sql).toContain("ch.collection = 'user-guide' AND ch.slug = 'projects-folders'");
    expect(sql.match(/AND NOT EXISTS \(SELECT 1 FROM "HelpSection" s WHERE s\."chapterId" = ch\.id AND s\.heading = /g)?.length).toBe(3);
  });
  it("is safe: a transaction, one guarded wording addition, nothing deleted, report after the commit", () => {
    expect((code.match(/^\s*UPDATE "HelpSection"/gm) ?? []).length).toBe(1);
    expect(code).toContain("NOT LIKE '%Right-click menus on the project screen%'");
    expect(code).not.toMatch(/^\s*(DELETE\s+FROM|DROP\s+|TRUNCATE\s+)/im);
    expect(code.indexOf("COMMIT;")).toBeLessThan(code.indexOf("SELECT\n  (SELECT"));
  });
  it("names exactly the menu items the screen offers", () => {
    for (const item of ["Open", "Rename", "Clone", "Move to project…", "Delete", "New Subfolder", "Expand", "Collapse", "Move up", "Move down", "New Folder", "Refresh", "Expand all", "Collapse all"]) {
      expect(sql).toContain(`**${item}**`);
      expect(screen).toContain(`label: "${item}"`);
    }
  });
  it("describes the Move-to-project window as the screen builds it (wide, scrolling, filter, three ways to close, Sandpit)", () => {
    expect(sql).toContain("**scrolls**");
    expect(sql).toContain("**filter** box");
    expect(sql).toContain("the **✕** at the top, the **Close** button at the bottom, or **Esc**");
    expect(sql).toContain("**Sandpit (no project)**");
    const dlg = readFileSync("app/components/MoveToProjectDialog.tsx", "utf8");
    expect(dlg).toContain("Sandpit (no project)");
    expect(dlg).toContain("Filter projects…");
  });
  it("describes the three Properties panels, and the Folder summary, as built — and never names an AI model", () => {
    for (const t of ["**The project**", "**A diagram**", "**A folder**", "**by diagram type**", "every diagram-level attribute the Diagram screen's Properties panel shows"]) expect(sql).toContain(t);
    expect(sql).not.toMatch(/Opus|Sonnet|Haiku|Fable|drawn by/);
  });
});
