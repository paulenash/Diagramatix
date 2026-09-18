/**
 * T4532 / T4533 — the right-click menu on a black-box pool.
 *
 * Paul, 2026-09-18: "Do not display the right-click Generate SOP for this pool
 * for a black-box pool. instead display a right-click popup menu to select /
 * deselect IT System and Collection."
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isBlackBoxPool,
  blackBoxPoolMenuItems,
  blackBoxPoolFlagOn,
  toggleBlackBoxPoolFlag,
} from "@/app/lib/diagram/blackBoxPoolMenu";
import type { DiagramElement } from "@/app/lib/diagram/types";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const pool = (properties: Record<string, unknown>): DiagramElement =>
  ({ id: "p1", type: "pool", label: "Customer", x: 0, y: 0, width: 800, height: 78, properties }) as unknown as DiagramElement;

describe("T4532 — the two flags a black-box pool carries", () => {
  it("knows a black-box pool from a white-box one", () => {
    expect(isBlackBoxPool(pool({ poolType: "black-box" }))).toBe(true);
    expect(isBlackBoxPool(pool({ poolType: "white-box" }))).toBe(false);
    // A pool with no poolType at all is a white-box pool on the canvas — it
    // holds lanes — so it keeps the SOP action.
    expect(isBlackBoxPool(pool({}))).toBe(false);
  });

  it("offers IT System and Collection, and nothing on anything else", () => {
    expect(blackBoxPoolMenuItems(pool({ poolType: "black-box" })).map((i) => i.label))
      .toEqual(["IT System", "Collection"]);
    expect(blackBoxPoolMenuItems(pool({ poolType: "white-box" }))).toEqual([]);
  });

  it("ticks each item from the element it is drawn for", () => {
    const el = pool({ poolType: "black-box", isSystem: true, multiplicity: "collection" });
    expect(blackBoxPoolMenuItems(el).map((i) => i.checked)).toEqual([true, true]);
    expect(blackBoxPoolMenuItems(pool({ poolType: "black-box" })).map((i) => i.checked))
      .toEqual([false, false]);
  });

  it("reads Collection from the value the rest of the app tests for", () => {
    // "single" is not "collection" — the Visio exporter and the canvas glyph
    // both compare against the literal, so a truthy-but-wrong value must read
    // as off or the menu tick and the drawing would disagree.
    expect(blackBoxPoolFlagOn(pool({ poolType: "black-box", multiplicity: "single" }), "collection")).toBe(false);
    expect(blackBoxPoolFlagOn(pool({ poolType: "black-box", multiplicity: "collection" }), "collection")).toBe(true);
  });

  it("turns a flag on, and off again, with the patch the panel writes", () => {
    const off = pool({ poolType: "black-box" });
    expect(toggleBlackBoxPoolFlag(off, "isSystem")).toEqual({ isSystem: true });
    expect(toggleBlackBoxPoolFlag(off, "collection")).toEqual({ multiplicity: "collection" });

    const on = pool({ poolType: "black-box", isSystem: true, multiplicity: "collection" });
    expect(toggleBlackBoxPoolFlag(on, "isSystem")).toEqual({ isSystem: false });
    // Deselecting clears the key rather than writing "single", matching the
    // Properties panel — the two surfaces must leave the same shape behind.
    expect(toggleBlackBoxPoolFlag(on, "collection")).toEqual({ multiplicity: undefined });
  });

  it("changes only its own flag", () => {
    const el = pool({ poolType: "black-box", isSystem: true });
    expect(toggleBlackBoxPoolFlag(el, "collection")).not.toHaveProperty("isSystem");
    expect(toggleBlackBoxPoolFlag(el, "isSystem")).not.toHaveProperty("multiplicity");
  });
});

describe("T4533 — the menu shows the flags instead of Generate SOP", () => {
  const menu = read("app", "components", "canvas", "ElementContextMenu.tsx");
  const canvas = read("app", "components", "canvas", "Canvas.tsx");

  it("hides Generate SOP on a black-box pool", () => {
    // The SOP block's own condition has to exclude it — a black-box pool has
    // no internals, so the role SOP it would write is empty.
    expect(menu).toContain('(el.type === "lane" || (el.type === "pool" && !isBlackBoxPool(el))) && onAction');
  });

  it("renders the two flags from the shared module", () => {
    expect(menu).toContain("blackBoxPoolMenuItems(el).map");
    expect(menu).toContain("toggleBlackBoxPoolFlag(el, item.flag)");
    expect(menu).toContain('role="menuitemcheckbox"');
  });

  it("keeps the menu open so both flags can be set in one right-click", () => {
    // onSelect closes; the flags deliberately use their own callback. If they
    // went through onSelect, setting both would need two right-clicks.
    expect(menu).toContain("onToggle(toggleBlackBoxPoolFlag(el, item.flag))");
    expect(canvas).toContain("onToggle={(patch) => { onUpdateProperties?.(el.id, patch); }}");
    expect(canvas).not.toMatch(/onToggle=\{[^}]*setElementContextMenu\(null\)/);
  });

  it("opens the menu on a black-box pool even where SOP generation is not offered", () => {
    // The old gate was `onGenerateSopForElement && bpmn` — with SOP gone from
    // this pool that gate would leave it with no menu at all.
    expect(canvas).toContain('(onGenerateSopForElement || onUpdateProperties) && diagramType === "bpmn"');
    expect(canvas).toContain("isBlackBoxPool(target) ? !!onUpdateProperties : !!onGenerateSopForElement");
  });
});
