/**
 * Three toolbar controls moved into the Diagram ▾ menu (Paul, 2026-09-19).
 *
 * NEW AI Generate, Generate SOP and the whole Publish dropdown were separate
 * controls competing for space along the top of the editor. None of them is
 * something you reach for mid-edit, which is what a toolbar is for.
 *
 * These are source-shape checks, which is a real limitation: they prove the menu
 * says the right thing, not that it renders. What they do catch is the thing
 * that actually goes wrong in a move like this — an item left behind in both
 * places, or one that closes the wrong menu and so appears to do nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EDITOR = readFileSync(
  join(process.cwd(), "app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx"),
  "utf8",
);

/** The Diagram ▾ dropdown's body, from its open state to the end of the panel. */
const menu = (() => {
  const start = EDITOR.indexOf("{clearMenuOpen && (");
  expect(start, "the Diagram menu is still there").toBeGreaterThan(-1);
  // Far enough to cover the panel; the assertions below are all about presence.
  return EDITOR.slice(start, start + 9000);
})();

/** Everything before the menu — the toolbar the three items came out of. */
const toolbar = EDITOR.slice(0, EDITOR.indexOf("{clearMenuOpen && ("));

describe("T4520 — the three moved items are in the Diagram menu", () => {
  it("has NEW AI Generate", () => {
    expect(menu).toContain("✨ NEW AI Generate");
  });

  it("has Generate SOP", () => {
    expect(menu).toContain("Generate SOP");
  });

  it("has both publish actions and the version status", () => {
    expect(menu).toContain("Publish v{(currentPublishedVersion?.versionNumber ?? 0) + 1}…");
    expect(menu).toContain("Publish bundle…");
    // The status line is the only place the current version number appears;
    // burying the menu without it would lose that.
    expect(menu).toContain("Draft — not yet published");
    expect(menu).toContain("Example — not publishable");
  });
});

describe("T4521 — and are no longer in the toolbar", () => {
  it("left no copy behind", () => {
    // Two copies would both render, and the toolbar one would still be taking
    // the space the move was meant to free.
    expect(toolbar).not.toContain("✨ NEW AI Generate");
    expect(toolbar).not.toContain("Generate SOP");
    expect(toolbar).not.toContain("Publish ▾");
    expect(toolbar).not.toContain("Publish bundle…");
  });

  it("has nothing left of the old Publish dropdown's plumbing", () => {
    // State that only existed to open and close a control that is gone.
    expect(EDITOR).not.toContain("publishDropdownOpen");
    expect(EDITOR).not.toContain("publishDropdownRef");
  });
});

describe("T4522 — the moved items close the menu they are now in", () => {
  it("every moved action closes the Diagram menu", () => {
    // An item that closes the dropdown it used to live in closes nothing, and
    // the menu stays open over the dialog it just opened.
    expect(menu).not.toContain("setPublishDropdownOpen(false)");
    const actions = [
      "setShowAiGenerateScreen(true)",
      "setShowSopDialog(true)",
      "setShowPublishDialog(true)",
      "setShowPublishBundleDialog(true)",
    ];
    for (const action of actions) {
      const at = menu.indexOf(action);
      expect(at, `${action} is in the menu`).toBeGreaterThan(-1);
      // Its handler closes the menu somewhere in the few lines before it.
      const before = menu.slice(Math.max(0, at - 400), at);
      expect(before, `${action} must close the Diagram menu`).toContain("setClearMenuOpen(false)");
    }
  });

  it("keeps the gates each item had", () => {
    // Moving something must not quietly widen who can see it.
    expect(menu).toContain('!readOnly && diagramType === "bpmn" && aiAllowedHere && isActingAdmin');
    expect(menu).toContain('diagramType === "bpmn" && projectId');
    expect(menu).toContain("!readOnly && isDiagramOwner && !isExampleProject");
  });

  it("still disables the bundle until a version has been published", () => {
    expect(menu).toContain('disabled={lifecycle !== "PUBLISHED" || !projectId}');
  });
});
