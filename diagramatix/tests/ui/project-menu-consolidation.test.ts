/**
 * The Project screen's Project ▾ menu is the home for project-scoped things.
 *
 * Paul, 2026-09-14:
 *   1. Move SOP Templates to Project menu.
 *   2. Move Resources to Project menu.
 *   3. Move Org Owner <Org_Name> to Project menu.
 *   4. Move Standard Operating Procedures to Project menu — a small popup with a
 *      scrollable list of the current SOP links and options and a Continue
 *      button at the bottom right outside the scrollable region.
 *   5. Move Project Structure (renamed "Entity Structure") to Project menu —
 *      the same popup shape.
 *
 * The thing that is easy to get wrong, and is checked first: the menu used to
 * render for EDITORS ONLY. Three of the five items were visible to a viewer
 * before the move (the SOP Templates link, the Org Owner chip, the SOP list),
 * so moving them into an editor-only menu would have taken them away from
 * viewers. The menu now renders for everyone and gates the write actions one
 * by one.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const client = () => read("app", "(dashboard)", "dashboard", "projects", "[id]", "ProjectDetailClient.tsx");
const popup = () => read("app", "components", "ListPopup.tsx");

/**
 * The Project ▾ dropdown's JSX. Anchored on the wrapper's ref rather than on
 * the text "Project ▾", which also appears in a code comment 2,000 lines
 * earlier — the first draft of this helper sliced the comment.
 */
function projectMenu(src: string): string {
  const start = src.indexOf("ref={projectMenuRef}");
  expect(start, "the Project ▾ wrapper").toBeGreaterThan(-1);
  const listStart = src.indexOf("{showProjectMenu && (", start);
  expect(listStart, "the dropdown list").toBeGreaterThan(start);
  // The list closes with its own </div>, then the `)}` of the conditional,
  // then the wrapper's </div>.
  const end = src.indexOf("</div>\n              )}\n            </div>", listStart);
  expect(end, "the end of the Project ▾ dropdown").toBeGreaterThan(listStart);
  return src.slice(start, end);
}

describe("the Project ▾ menu holds the five moved items", () => {
  it("T4362 — all five entries are in the menu, and nowhere else in the header", () => {
    const src = client();
    const menu = projectMenu(src);
    expect(menu).toContain("SOP Templates");
    expect(menu).toContain("Resources");
    expect(menu).toContain("Org Owner:");
    expect(menu).toContain("Standard Operating Procedures…");
    expect(menu, 'renamed from "Project Structure"').toContain("Entity Structure…");
    expect(menu, "the old name must not survive alongside the new one").not.toContain("Project Structure");

    // …and the old placements are gone: one header link, one header button,
    // one header chip, two sidebar sections.
    const outsideMenu = src.replace(menu, "");
    expect(outsideMenu, "the header SOP Templates link").not.toMatch(/className="text-xs text-blue-600 hover:underline ml-1"[^>]*>SOP Templates</);
    expect(outsideMenu, "the header Resources button").not.toMatch(/text-green-700 border-green-400 hover:bg-green-50"[\s\S]{0,200}Resources/);
    expect(outsideMenu, "the header Org Owner chip").not.toContain("Org&nbsp;Owner:");
    expect(src, "the sidebar SOP section").not.toContain("<ProjectSopsSection");
    expect(src, "the sidebar structure section").not.toContain("<ProjectStructureSection");
  });

  it("T4363 — the menu renders for viewers; only the write actions are gated", () => {
    const src = client();
    const menu = projectMenu(src);
    // The wrapper is unconditional…
    const before = src.slice(Math.max(0, src.indexOf("Project ▾") - 400), src.indexOf("Project ▾"));
    expect(before, "the menu wrapper must not be behind !readOnly").not.toMatch(/\{!readOnly && \(\s*<div className="relative" ref=\{projectMenuRef\}>/);
    // …the editor-only items are gated inside it…
    expect(menu).toMatch(/\{!readOnly && \(\s*<button[\s\S]{0,400}Configuration/);
    // (the scan button carries a long title attribute before its label)
    expect(menu).toMatch(/\{!readOnly && \(<>[\s\S]{0,900}Scan BPMN Diagrams for Issues/);
    // …and the viewer-visible ones are not.
    for (const label of ["Entity Structure…", "Standard Operating Procedures…", "SOP Templates", "Org Owner:"]) {
      const i = menu.indexOf(label);
      const preceding = menu.slice(Math.max(0, i - 260), i);
      expect(preceding, `${label} must not sit behind !readOnly`).not.toContain("!readOnly");
    }
    // Resources keeps its entitlement gate, which is a different question.
    expect(menu).toMatch(/\{ent\.simulator && \(\s*<button[\s\S]{0,600}Resources/);
  });

  it("T4364 — both popups open from the menu and are mounted as dialogs", () => {
    const src = client();
    expect(src).toContain("setShowSops(true)");
    expect(src).toContain("setShowStructure(true)");
    expect(src).toMatch(/\{showSops && <ProjectSopsDialog projectId=\{project\.id\} canEdit=\{!readOnly\} onClose=/);
    expect(src).toMatch(/\{showStructure && <ProjectStructureDialog projectId=\{project\.id\} canEdit=\{!readOnly\} onClose=/);
  });
});

describe("Risk & Controls has exactly one door on the Project screen", () => {
  it("T4367 — the menu entry opens a launcher popup; the header button and sidebar row are gone", () => {
    // Paul: "I think Risk & Controls is able to be entered from 2 places on the
    // Project Menu. I think they go to the same screen, so … have only one way
    // of getting to this functionality."
    const src = client();
    const menu = projectMenu(src);
    expect(menu).toMatch(/\{ent\.riskControl && \(\s*<button[\s\S]{0,600}Risk &amp; Controls…/);
    expect(menu).toContain("setShowRcmLauncher(true)");
    // The launcher is the only INTERACTIVE way into the console. Two other
    // call sites exist and are not doors: the User Guide return trip (it
    // re-opens the console the reader left) and the ?rcm=1 deep link (adopting
    // a Risk & Control example lands straight in the console). Neither is a
    // menu option, and both are pinned here so a third cannot creep back in.
    expect(src, "no button opens the console directly").not.toMatch(/onClick=\{\(\) => setShowRcm\(true\)\}/);
    const all = src.match(/setShowRcm\(true\)/g)?.length ?? 0;
    const guideReopen = /useReopenFromGuide\("risk-control", \(\) => setShowRcm\(true\)\)/.test(src) ? 1 : 0;
    const deepLink = /get\("rcm"\) === "1"\) setShowRcm\(true\)/.test(src) ? 1 : 0;
    expect(all - guideReopen - deepLink, "exactly one interactive way into the console: the launcher").toBe(1);
    expect(src).toMatch(/<RiskControlDialog[\s\S]{0,300}onOpenConsole=\{\(tab\) => \{ setShowRcmLauncher\(false\); setRcmInitialTab\(tab\); setShowRcm\(true\); \}\}/);
    // The two old doors:
    expect(src, "the header button").not.toMatch(/text-blue-700 border-blue-400 hover:bg-blue-50"[\s\S]{0,200}Risk & Controls/);
    expect(src, "the sidebar row").not.toContain("— catalog + Risk-Control Matrix</span>");
    // …and the console honours the tab the launcher chose.
    expect(src).toContain("initialTab={rcmInitialTab}");
    const console_ = read("app", "components", "riskControls", "RiskControlConsole.tsx");
    expect(console_).toMatch(/useState<"editor" \| "analytics">\(initialTab\)/);
    // The launcher is the popup shape, lists both kinds, and offers both tabs.
    const dlg = read("app", "components", "riskControls", "RiskControlDialog.tsx");
    expect(dlg).toContain("<ListPopup");
    expect(dlg).toContain('onOpenConsole("editor")');
    expect(dlg).toContain('onOpenConsole("analytics")');
    expect(dlg).toMatch(/Risks \(\{risks\.length\}\)/);
    expect(dlg).toMatch(/Controls \(\{controls\.length\}\)/);
  });
});

describe("Project → Configuration covers EPC", () => {
  it("T4368 — an EPC colours tab, every EPC object's colour editable, and typography says it applies to EPC", () => {
    // Paul, 2026-09-14: "Add EPC Diagram Colour and Typography setting feature
    // to the Project->Configuration menu option."
    const modal = read("app", "(dashboard)", "dashboard", "projects", "[id]", "DiagramMaintenanceModal.tsx");
    expect(modal).toMatch(/\{ type: "epc",\s+label: "EPC" \}/);
    // The palette list is what the tab shows. The seven core symbols were
    // there; the eight extended objects were not, so their colours could not
    // be set. The three junctions are deliberately absent (they stay white).
    // Two maps in this file have an `epc:` entry. The canvas palette map lists
    // the junctions and markers too; the COLOUR palette map is the one the
    // Configuration tab reads, so anchor on its name first.
    const defs = read("app", "lib", "diagram", "symbols", "definitions.ts");
    const colourMap = defs.indexOf("export const COLOR_PALETTE_BY_DIAGRAM_TYPE");
    expect(colourMap).toBeGreaterThan(-1);
    const epcStart = defs.indexOf("  epc: [", colourMap);
    const epc = defs.slice(epcStart, defs.indexOf("],", epcStart));
    for (const s of ["epc-event", "epc-function", "epc-org-unit", "epc-position", "epc-data", "epc-application", "epc-interface",
                     "epc-kpi", "epc-risk", "epc-product", "epc-knowledge", "epc-business-rule", "epc-screen", "epc-objective", "epc-machine"]) {
      expect(epc, `${s} must be colour-editable`).toContain(`"${s}"`);
    }
    for (const j of ["epc-xor", "epc-and", "epc-or"]) expect(epc, `${j} stays white`).not.toContain(`"${j}"`);
    // Typography is project-wide; the section must SAY it reaches EPC rather
    // than leave the reader hunting for an EPC tab that does not exist.
    expect(modal).toMatch(/including EPC/);
  });
});

describe("an SOP says who made it and when", () => {
  it("T4369 — the list carries provenance and the popup shows it", () => {
    // Paul, 2026-09-14: "When are the SOPs created for Process Repository
    // Diagrams? They seem to be there without me creating them?" The only
    // writers are Generate SOP and an org-backup restore — but a list that shows
    // neither who nor when leaves the reader guessing. Now it does not.
    const route = read("app", "api", "projects", "[id]", "sop", "route.ts");
    expect(route).toMatch(/createdAt: true, createdById: true, model: true/);
    // createdById is a bare id on the model, so the name is looked up, and a
    // missing user degrades to null rather than throwing.
    expect(route).toMatch(/prisma\.user\.findMany\(\{ where: \{ id: \{ in: creatorIds \} \}/);
    expect(route).toMatch(/createdBy: d\.createdById \? \(creatorName\.get\(d\.createdById\) \?\? null\) : null/);
    const list = read("app", "components", "sop", "ProjectSopsSection.tsx");
    expect(list).toMatch(/r\.createdBy \? `by \$\{r\.createdBy\}` : null/);
    expect(list).toMatch(/when\(r\.createdAt\)/);
    expect(list, "the model used is shown too").toMatch(/r\.model \? ` · \$\{r\.model\}` : ""/);
  });
});

describe("the popup is the shape that was asked for", () => {
  it("T4365 — a scrollable list with Continue in a footer OUTSIDE the scroll region", () => {
    const src = popup();
    const scroll = src.indexOf("overflow-y-auto");
    const scrollEnd = src.indexOf("</div>", src.indexOf("{children}", scroll));
    const footer = src.indexOf("border-t border-gray-100", scrollEnd);
    const button = src.indexOf("{continueLabel}", footer);
    expect(scroll, "the body scrolls").toBeGreaterThan(-1);
    expect(footer, "a footer after the scroll region closes").toBeGreaterThan(scrollEnd);
    expect(button, "the Continue button lives in that footer").toBeGreaterThan(footer);
    expect(src, "bottom RIGHT").toMatch(/flex justify-end[^"]*"[^>]*>\s*<button/);
    expect(src, 'labelled "Continue"').toContain('continueLabel = "Continue"');
    // Only the body scrolls: the card itself is a column with a capped height.
    expect(src).toMatch(/flex flex-col max-h-\[85vh\]/);
    expect(src).toMatch(/overflow-y-auto min-h-0 flex-1/);
  });

  it("T4366 — both dialogs are built on the shared popup, not two copies of it", () => {
    for (const f of [
      ["app", "components", "sop", "ProjectSopsSection.tsx"],
      ["app", "components", "entityLists", "ProjectStructureSection.tsx"],
    ] as const) {
      const src = read(...f);
      expect(src, `${f.join("/")} uses ListPopup`).toMatch(/from "@\/app\/components\/ListPopup"/);
      expect(src).toContain("<ListPopup");
    }
    expect(read("app", "components", "entityLists", "ProjectStructureSection.tsx"), "the dialog title is the new name")
      .toContain('title="Entity Structure"');
  });
});
