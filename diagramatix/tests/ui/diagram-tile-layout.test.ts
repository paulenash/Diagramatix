/**
 * The Project screen's diagram tiles: 2-wide (large) or 4-wide (compact), in a
 * scrollable region.
 *
 * Paul, 2026-09-27: "Display Diagram tiles 2-wide and 2 x height and 2 x width
 * with an large diagram icon to match, in the Project screen, in a scrollable
 * region. Allow user to choose 2-wide or 4-wide format."
 *
 * The rule (columns, legibility floor, gap, per-browser memory) is a pure
 * module, app/lib/project/tileLayout.ts, tested as one. The component checks
 * pin the wiring: the toggle drives the layout, the grid draws the layout's
 * columns and gap, and the tile area — not the page — is what scrolls.
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_TILE_LAYOUT, TILE_LAYOUTS, TILE_LAYOUT_KEY, TILE_LAYOUT_SPEC,
  isTileLayout, tileColumnsFor, readTileLayout, writeTileLayout,
  type TileLayoutStore,
} from "@/app/lib/project/tileLayout";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const CLIENT = ["app", "(dashboard)", "dashboard", "projects", "[id]", "ProjectDetailClient.tsx"];

/** A Map-backed stand-in for localStorage. */
function memoryStore(init: Record<string, string> = {}): TileLayoutStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}

/** Storage as a private window / blocked-site-data browser presents it. */
const blockedStore: TileLayoutStore = {
  getItem: () => { throw new Error("SecurityError: storage is disabled"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
};

describe("T4950 — the layouts", () => {
  it("offers exactly 2-wide and 4-wide, and 2-wide is the default", () => {
    expect([...TILE_LAYOUTS]).toEqual(["2-wide", "4-wide"]);
    expect(DEFAULT_TILE_LAYOUT).toBe("2-wide");
    expect(TILE_LAYOUT_SPEC["2-wide"].columns).toBe(2);
    expect(TILE_LAYOUT_SPEC["4-wide"].columns).toBe(4);
  });

  it("only 2-wide draws the large tile", () => {
    expect(TILE_LAYOUT_SPEC["2-wide"].large).toBe(true);
    expect(TILE_LAYOUT_SPEC["4-wide"].large).toBe(false);
  });

  it("recognises its own values and nothing else", () => {
    expect(isTileLayout("2-wide")).toBe(true);
    expect(isTileLayout("4-wide")).toBe(true);
    for (const junk of ["3-wide", "2", "4", "", "2-WIDE", null, undefined, 2, {}]) {
      expect(isTileLayout(junk), String(junk)).toBe(false);
    }
  });
});

describe("T4951 — column count", () => {
  it("before the pane is measured, the first paint is already the chosen layout", () => {
    expect(tileColumnsFor("2-wide", null)).toBe(2);
    expect(tileColumnsFor("4-wide", null)).toBe(4);
    expect(tileColumnsFor("4-wide", undefined)).toBe(4);
    expect(tileColumnsFor("4-wide", Number.NaN)).toBe(4);
  });

  it("a wide pane shows exactly the chosen count — never more", () => {
    for (const w of [1200, 1920, 5000]) {
      expect(tileColumnsFor("2-wide", w), `2-wide at ${w}`).toBe(2);
      expect(tileColumnsFor("4-wide", w), `4-wide at ${w}`).toBe(4);
    }
  });

  it("drops a column exactly when the tiles (and the gaps between them) stop fitting", () => {
    const two = TILE_LAYOUT_SPEC["2-wide"];
    const fitsTwo = 2 * two.minTileWidth + two.gap;
    expect(tileColumnsFor("2-wide", fitsTwo)).toBe(2);
    expect(tileColumnsFor("2-wide", fitsTwo - 1)).toBe(1);

    const four = TILE_LAYOUT_SPEC["4-wide"];
    const fitsFour = 4 * four.minTileWidth + 3 * four.gap;
    expect(tileColumnsFor("4-wide", fitsFour)).toBe(4);
    expect(tileColumnsFor("4-wide", fitsFour - 1)).toBe(3);
  });

  it("never goes below one column, however narrow (a phone, a dragged-wide tree)", () => {
    for (const w of [0, 1, 120, 199, -50]) {
      expect(tileColumnsFor("2-wide", w)).toBe(1);
      expect(tileColumnsFor("4-wide", w)).toBe(1);
    }
  });

  it("a multi-column row always fits the pane, so the tile area never scrolls sideways", () => {
    for (const layout of TILE_LAYOUTS) {
      const { minTileWidth, gap, columns } = TILE_LAYOUT_SPEC[layout];
      for (let w = 0; w <= 3000; w++) {
        const n = tileColumnsFor(layout, w);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(columns);
        if (n > 1) expect(n * minTileWidth + (n - 1) * gap, `${layout} at ${w}px`).toBeLessThanOrEqual(w);
      }
    }
  });
});

describe("T4952 — remembered per browser", () => {
  const realDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  afterEach(() => {
    if (realDescriptor) Object.defineProperty(globalThis, "localStorage", realDescriptor);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("a fresh browser gets the default", () => {
    expect(readTileLayout(memoryStore())).toBe("2-wide");
    expect(readTileLayout(null), "no storage at all").toBe("2-wide");
  });

  it("writes and reads back under one key", () => {
    const s = memoryStore();
    writeTileLayout("4-wide", s);
    expect(s.data.get(TILE_LAYOUT_KEY)).toBe("4-wide");
    expect(readTileLayout(s)).toBe("4-wide");
    writeTileLayout("2-wide", s);
    expect(readTileLayout(s)).toBe("2-wide");
    expect([...s.data.keys()]).toEqual([TILE_LAYOUT_KEY]);
  });

  it("a stored value it does not recognise falls back to the default", () => {
    for (const junk of ["3-wide", "4", "", "{}", "null"]) {
      expect(readTileLayout(memoryStore({ [TILE_LAYOUT_KEY]: junk })), junk).toBe("2-wide");
    }
  });

  it("never writes a value it could not read back", () => {
    const s = memoryStore();
    writeTileLayout("3-wide" as never, s);
    expect(s.data.size).toBe(0);
  });

  it("blocked storage never throws: reads give the default, writes are dropped", () => {
    expect(readTileLayout(blockedStore)).toBe("2-wide");
    expect(() => writeTileLayout("4-wide", blockedStore)).not.toThrow();
    expect(() => writeTileLayout("4-wide", null)).not.toThrow();
  });

  it("with no store passed, it uses the browser's localStorage", () => {
    const s = memoryStore({ [TILE_LAYOUT_KEY]: "4-wide" });
    Object.defineProperty(globalThis, "localStorage", { value: s, configurable: true, writable: true });
    expect(readTileLayout()).toBe("4-wide");
    writeTileLayout("2-wide");
    expect(s.data.get(TILE_LAYOUT_KEY)).toBe("2-wide");
  });

  it("…and survives a browser where merely touching localStorage throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() { throw new Error("SecurityError: The operation is insecure."); },
    });
    expect(readTileLayout()).toBe("2-wide");
    expect(() => writeTileLayout("4-wide")).not.toThrow();
  });
});

describe("T4953 — the Project screen wiring", () => {
  const src = read(...CLIENT);
  const main = src.slice(src.indexOf("{/* Right: Diagram tiles."), src.indexOf("</main>"));
  const scrollAt = main.indexOf("ref={tileScrollRef}");

  it("the choice starts at the default, adopts the stored one, and a click saves it", () => {
    expect(src).toContain('from "@/app/lib/project/tileLayout"');
    expect(src).toMatch(/useState<TileLayout>\(DEFAULT_TILE_LAYOUT\)/);
    expect(src).toMatch(/useEffect\(\(\) => \{ setTileLayout\(readTileLayout\(\)\); \}, \[\]\);/);
    const choose = src.slice(src.indexOf("function chooseTileLayout"), src.indexOf("function chooseTileLayout") + 200);
    expect(choose).toContain("setTileLayout(next)");
    expect(choose).toContain("writeTileLayout(next)");
  });

  it("the toggle sits in the tile toolbar, one button per layout, in the header buttons' style", () => {
    expect(scrollAt, "the tile pane has a scroll region").toBeGreaterThan(0);
    const toolbar = main.slice(0, scrollAt);
    expect(toolbar).toContain("TILE_LAYOUTS.map((layout)");
    expect(toolbar).toContain("onClick={() => chooseTileLayout(layout)}");
    expect(toolbar).toContain("aria-pressed={on}");
    expect(toolbar).toContain('role="group"');
    expect(toolbar).toContain("{TILE_LAYOUT_SPEC[layout].label}");
    // Same face as File ▾ / Project ▾ in the header; active = the blue fill
    // the File button uses while busy.
    expect(toolbar).toContain("px-3 py-1 text-xs font-medium rounded-md border");
    expect(toolbar).toContain('"bg-blue-600 text-white border-blue-600"');
    // Plain Tailwind — Paul's rule: no shadcn/Radix.
    expect(src).not.toMatch(/@radix-ui|components\/ui\//);
  });

  it("the grid draws the chosen layout's columns and gap, and the card its size", () => {
    expect(src).toMatch(/const tileColumns = tileColumnsFor\(tileLayout, tileAreaWidth\);/);
    const grid = main.slice(scrollAt);
    expect(grid).toContain("gridTemplateColumns: `repeat(${tileColumns}, minmax(0, 1fr))`, gap: tileSpec.gap");
    expect(grid).toContain("large={tileSpec.large}");
    // The old fixed 240px column maths is gone — the helper is the only rule.
    expect(src).not.toMatch(/TILE_MIN|setTileColumns/);
  });

  it("the tile area is the scrollable region; the toolbar above it stays put", () => {
    const scrollTag = main.slice(main.lastIndexOf("<div", scrollAt), main.indexOf(">", scrollAt) + 1);
    expect(scrollTag).toMatch(/flex-1 min-h-0 overflow-y-auto overflow-x-hidden/);
    expect(scrollTag).toContain("[scrollbar-gutter:stable]");
    // The grid and the empty state live inside it; the toggle does not.
    expect(main.indexOf("gridTemplateColumns")).toBeGreaterThan(scrollAt);
    expect(main.indexOf("No diagrams in this folder")).toBeGreaterThan(scrollAt);
    expect(main.indexOf("chooseTileLayout(layout)")).toBeLessThan(scrollAt);
    // The pane is a non-scrolling column that can shrink (min-w-0), so a
    // narrow window never pushes the page sideways.
    expect(src).toContain('<main className="flex-1 min-w-0 flex flex-col overflow-hidden">');
    // The column count follows the scroll region's own width.
    const measure = src.slice(src.indexOf("const tileScrollRef"), src.indexOf("const tileSpec"));
    expect(measure).toContain("ro.observe(el)");
    expect(measure).toContain("setTileAreaWidth(ent.contentRect.width)");
  });

  it("the screen is viewport-high, so the region is bounded and the header does not scroll away", () => {
    const shell = src.slice(src.indexOf("  return (\n    // A viewport-high screen"));
    const rootTag = shell.slice(shell.indexOf("<div"), shell.indexOf(">", shell.indexOf("<div")) + 1);
    expect(rootTag).toContain("h-dvh");
    expect(rootTag).toContain("flex flex-col overflow-hidden");
    expect(rootTag).not.toContain("min-h-screen");
  });

  it("the large tile doubles the compact one and grows the thumbnail to match", () => {
    const card = src.slice(src.indexOf("function DiagramCard("));
    expect(card).toContain("large = false,");
    const sizes = card.slice(card.indexOf("const sz = large"), card.indexOf("return ("));
    const [largeSz, compactSz] = sizes.split("\n    : ");
    // Compact = the original tile, unchanged.
    expect(compactSz).toContain('card: "px-2 py-1.5"');
    expect(compactSz).toContain('thumb: "w-14 h-8"');
    // Large = double padding and a thumbnail three times the size, same aspect
    // (56×32 → 168×96), which is what takes the tile to double height.
    expect(largeSz).toContain('card: "px-4 py-3"');
    expect(largeSz).toContain('thumb: "w-42 h-24"');
    expect(card).toContain("${sz.thumb}");
    expect(card).toContain("${sz.card}");
  });

  it("uses no browser dialogs", () => {
    const helper = read("app", "lib", "project", "tileLayout.ts");
    for (const s of [main, helper]) {
      expect(s).not.toMatch(/\b(?:window\.)?(?:alert|confirm|prompt)\(/);
    }
  });
});
