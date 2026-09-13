/**
 * Two visibility gates, both Paul's, both 2026-09-14:
 *
 *   "Make the Fun Tiles only visible to SuperAdmin paul@nashcc.com.au ONLY"
 *   "Make NEW AI Generation SuperAdmin only"
 *
 * The first is an EMAIL gate, deliberately narrower than SuperAdmin: another
 * SuperAdmin must not see the Fun Extensions tiles. The second is the ordinary
 * acting-SuperAdmin gate on the NEW AI Generate button, so a customer never
 * meets a console that is still being judged against the sidebar it replaces.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tileVisibleTo, FUN_TILE_OWNERS } from "@/app/lib/admin/tileVisibility";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

describe("tileVisibleTo — an exact-email gate, narrower than SuperAdmin", () => {
  it("T4378 — a tile with no owners is for everyone; a tile with owners is for exactly them", () => {
    expect(tileVisibleTo({}, "anyone@example.com")).toBe(true);
    expect(tileVisibleTo({ onlyFor: [] }, "anyone@example.com")).toBe(true);
    const fun = { onlyFor: FUN_TILE_OWNERS };
    expect(tileVisibleTo(fun, "paul@nashcc.com.au")).toBe(true);
    expect(tileVisibleTo(fun, "Paul@NashCC.com.au"), "case does not matter").toBe(true);
    expect(tileVisibleTo(fun, " paul@nashcc.com.au "), "nor whitespace").toBe(true);
    // Another SuperAdmin is exactly who this must exclude.
    expect(tileVisibleTo(fun, "greg.nash@getai.com.au")).toBe(false);
    expect(tileVisibleTo(fun, "")).toBe(false);
    expect(tileVisibleTo(fun, null)).toBe(false);
    expect(tileVisibleTo(fun, undefined)).toBe(false);
  });

  it("T4379 — the owners list is Paul alone, the five Fun tiles carry it, and the grid applies it once", () => {
    expect([...FUN_TILE_OWNERS]).toEqual(["paul@nashcc.com.au"]);
    const src = read("app", "(dashboard)", "dashboard", "admin", "AdminClient.tsx");
    for (const id of ["nimb", "mastermind", "life", "life-3d", "orbit-sim"]) {
      const re = new RegExp(`href: "/dashboard/admin/${id}", feature: "funExtensions", onlyFor: FUN_TILE_OWNERS \\}`);
      expect(src, `${id} names its owners`).toMatch(re);
    }
    // Every funExtensions tile is gated — not just the five known today.
    const funTiles = src.match(/feature: "funExtensions"[^}]*\}/g) ?? [];
    expect(funTiles.length).toBeGreaterThanOrEqual(5);
    for (const t of funTiles) expect(t, `an ungated fun tile: ${t.slice(0, 60)}`).toContain("onlyFor: FUN_TILE_OWNERS");
    // Applied at the one place the grid, the search box and the drag order share.
    expect(src).toMatch(/\.filter\(t => tileVisibleTo\(t, currentUserEmail\)\)/);
    // The email comes from the server session, not from the users table.
    const page = read("app", "(dashboard)", "dashboard", "admin", "page.tsx");
    expect(page).toMatch(/currentUserEmail=\{session\.user\.email \?\? ""\}/);
  });
});

describe("NEW AI Generate is SuperAdmin-only while it is judged", () => {
  it("T4380 — the button is behind isActingAdmin, not merely isAdmin", () => {
    const src = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    const block = src.slice(src.indexOf("NEW AI Generate — the full-screen console"));
    const gate = block.slice(0, block.indexOf("<button"));
    expect(gate).toMatch(/\{!readOnly && diagramType === "bpmn" && aiAllowedHere && isActingAdmin && \(/);
    // isActingAdmin is "a real SuperAdmin who has NOT dropped into a lower view
    // mode" — so presenting as a customer hides it, as it should.
    expect(src).toMatch(/const isActingAdmin = isAdmin && !superAdminHidden;/);
    // The ORIGINAL AI Generate button is untouched: it is the thing customers use.
    const orig = src.slice(src.indexOf("AI Generate — restored to the toolbar"), src.indexOf("NEW AI Generate — the full-screen console"));
    expect(orig).toMatch(/\{!readOnly && diagramType !== "basic" && aiAllowedHere && \(/);
    expect(orig).not.toContain("isActingAdmin &&");
  });
});
