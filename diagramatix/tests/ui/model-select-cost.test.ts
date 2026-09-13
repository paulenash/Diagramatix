/**
 * Paul, 2026-09-14: "Don't include the cost on the AI Model dropdown lists
 * available to the normal user eg on the Diagram Properties Panel."
 *
 * The per-generation cost is a SuperAdmin detail. `ModelSelect` therefore
 * appends it only when told to (`showCost`), and the Properties-panel picker —
 * which a SuperAdmin still sees while presenting in a customer view mode — is
 * told from the editor's ACTING-SuperAdmin flag, not the raw one.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { ModelSelect, type AllowedModel } from "@/app/(dashboard)/diagram/[id]/ModelSelect";

const models: AllowedModel[] = [
  { id: "claude-opus-5", label: "Opus 5", costUsd: 0.412 },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", costUsd: 0.027 },
];
const render = (showCost?: boolean) =>
  renderToStaticMarkup(createElement(ModelSelect, { value: "claude-opus-5", onChange: () => {}, models, showCost }));

const src = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", "..", p), "utf8");

describe("model picker cost is a SuperAdmin detail", () => {
  it("T4382 — ModelSelect omits the cost unless showCost is set", () => {
    const plain = render();
    expect(plain).toContain("Opus 5");
    expect(plain).toContain("Haiku 4.5");
    expect(plain, "no price on a default picker").not.toMatch(/\$0\.\d{3}/);
    expect(render(false)).not.toMatch(/\$0\.\d{3}/);

    const priced = render(true);
    expect(priced).toContain("Opus 5 (~$0.412)");
    expect(priced).toContain("Haiku 4.5 (~$0.027)");
  });

  it("T4383 — the Properties panel's picker takes its cost flag from the ACTING-SuperAdmin flag", () => {
    // The panel is visible to a SuperAdmin in every view mode (canSeeModel =
    // isAdmin); the customer view modes exist to show what a normal user sees,
    // so the price must follow isActingAdmin, which is false there.
    const editor = src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(editor).toContain("showModelCost={isActingAdmin}");
    expect(editor, "the raw flag must not leak the price into a customer view").not.toContain("showModelCost={isAdmin}");

    const panel = src("app/components/canvas/PropertiesPanel.tsx");
    expect(panel).toContain("showCost={showModelCost}");

    // The three pickers that are already behind `isAdmin && !superAdminHidden`
    // (or the SuperAdmin options modal) keep the price — that is where it belongs.
    for (const f of ["app/(dashboard)/diagram/[id]/AiPanel.tsx", "app/(dashboard)/diagram/[id]/PlanPanel.tsx", "app/(dashboard)/diagram/[id]/ai-generate/SuperAdminOptionsModal.tsx"]) {
      expect(src(f), `${f} is SuperAdmin-only and keeps the cost`).toMatch(/<ModelSelect [^>]*\bshowCost\b/);
    }
  });
});
