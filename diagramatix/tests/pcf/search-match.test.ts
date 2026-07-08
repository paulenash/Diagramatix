import { describe, it, expect } from "vitest";
import { buildPcfNodeWhere } from "@/app/lib/pcf/searchMatch";

/**
 * The APQC node search matcher must resolve all three query shapes the pickers
 * feed it — bare code, bare name, and the "code + name" a seeded folder name or
 * classification label produces — without the user having to reformat.
 */
describe("buildPcfNodeWhere", () => {
  it("empty query matches everything (no filter)", () => {
    expect(buildPcfNodeWhere("")).toEqual({});
    expect(buildPcfNodeWhere("   ")).toEqual({});
  });

  it("a bare code searches by hierarchyId prefix, and a bare integer also matches pcfId", () => {
    const w = buildPcfNodeWhere("1.1.1") as { OR: Record<string, unknown>[] };
    expect(w.OR).toContainEqual({ hierarchyId: { startsWith: "1.1.1" } });

    const n = buildPcfNodeWhere("17") as { OR: Record<string, unknown>[] };
    expect(n.OR).toContainEqual({ pcfId: 17 });
  });

  it("a bare name searches by contains (case-insensitive)", () => {
    const w = buildPcfNodeWhere("Assess") as { OR: Record<string, unknown>[] };
    expect(w.OR).toContainEqual({ name: { contains: "Assess", mode: "insensitive" } });
  });

  it("'code + name' is forgiving — the code prefix OR the name, so the code always surfaces its node", () => {
    const w = buildPcfNodeWhere("1.1.1 Assess the external environment") as { OR: Record<string, unknown>[] };
    expect(w.OR).toContainEqual({ hierarchyId: { startsWith: "1.1.1" } });
    expect(w.OR).toContainEqual({ name: { contains: "Assess the external environment", mode: "insensitive" } });
  });
});
