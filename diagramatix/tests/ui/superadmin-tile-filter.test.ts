/**
 * Paul, 2026-09-25: "when filtering SuperAdmin tiles keep the existing filter
 * after coming back from entering a tile."
 *
 * sessionStorage, not a `?q=` param: most tile pages return through a
 * "← SuperAdmin" link to the BARE `/dashboard/admin`, which a query param
 * would not survive.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TILE_FILTER_KEY, readTileFilter, writeTileFilter } from "@/app/lib/admin/tileFilter";

const ROOT = path.resolve(__dirname, "..", "..");

function memStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

describe("SuperAdmin tile filter survives a visit to a tile", () => {
  it("T4754 — what is written is read back; a blank filter removes the key", () => {
    const s = memStore();
    expect(readTileFilter(s), "nothing remembered yet").toBe("");
    writeTileFilter(s, "voice");
    expect(readTileFilter(s)).toBe("voice");
    expect(s.m.get(TILE_FILTER_KEY)).toBe("voice");
    writeTileFilter(s, "  ");
    expect(s.m.has(TILE_FILTER_KEY), "clearing the box forgets it").toBe(false);
    expect(readTileFilter(s)).toBe("");
  });

  it("T4755 — unusable storage never breaks the grid: no storage, or storage that throws", () => {
    expect(readTileFilter(null)).toBe("");
    expect(readTileFilter(undefined)).toBe("");
    expect(() => writeTileFilter(null, "x")).not.toThrow();
    const throwing = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    };
    expect(readTileFilter(throwing)).toBe("");
    expect(() => writeTileFilter(throwing, "voice")).not.toThrow();
    expect(() => writeTileFilter(throwing, "")).not.toThrow();
  });

  it("T4756 — the grid reads the remembered filter after mount and writes it on every change", () => {
    const src = fs.readFileSync(path.join(ROOT, "app", "(dashboard)", "dashboard", "admin", "AdminClient.tsx"), "utf8");
    const grid = src.slice(src.indexOf("function SuperAdminToolsGrid"));
    expect(grid).toMatch(/readTileFilter\(sessionStore\(\)\)/);
    expect(grid).toMatch(/writeTileFilter\(sessionStore\(\), v\)/);
    // The input and the clear button both go through the persisting setter,
    // never the raw state setter — otherwise clearing would not be remembered.
    expect(grid).toMatch(/onChange=\{e => setFilter\(e\.target\.value\)\}/);
    expect(grid).toMatch(/onClick=\{\(\) => setFilter\(""\)\}/);
    expect(grid.match(/setFilterState\(/g)?.length, "only the mount read and the setter touch raw state").toBe(2);
  });
});
