/**
 * An APQC framework's whole identity is editable: name, variant AND version.
 *
 * Paul, 2026-09-14: "Allow the whole APQC Framework Name to be edited and saved
 * not just the Name. Include the Version number as well."
 *
 * Until then the route accepted `name` only and wrote the same string to
 * `variant` — which is what every picker shows (`variant vversion`) — and the
 * version could not be changed at all. The mapping is now a pure function
 * (app/lib/pcf/frameworkEdit.ts) the route calls, so its rules are pinned here
 * without a session; a second test writes the mapped data through Prisma to
 * prove the three fields persist independently and that editing the version
 * leaves the family identity alone.
 */
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { truncateAll } from "../_setup/db";
import { prisma } from "@/app/lib/db";
import { frameworkPatchData } from "@/app/lib/pcf/frameworkEdit";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

describe("frameworkPatchData — what an edit may change", () => {
  it("T4370 — name, variant and version are independent fields, each written only when sent", () => {
    const r = frameworkPatchData({ version: "8.1" }, { isTailored: false });
    expect(r).toEqual({ ok: true, data: { version: "8.1" } });
    // The old behaviour — name silently overwriting variant — is gone.
    const n = frameworkPatchData({ name: "APQC PCF — Cross-Industry" }, { isTailored: false });
    expect(n).toEqual({ ok: true, data: { name: "APQC PCF — Cross-Industry" } });
    expect((n as { data: { variant?: string } }).data.variant).toBeUndefined();
    // All three together.
    expect(frameworkPatchData({ name: " N ", variant: " V ", version: " 9.0 " }, { isTailored: false }))
      .toEqual({ ok: true, data: { name: "N", variant: "V", version: "9.0" } });
  });

  it("T4371 — a field sent blank is refused; division is tailored-only and may be cleared", () => {
    expect(frameworkPatchData({ version: "  " }, { isTailored: false })).toEqual({ ok: false, error: "version cannot be blank" });
    expect(frameworkPatchData({ name: "" }, { isTailored: true })).toEqual({ ok: false, error: "name cannot be blank" });
    expect(frameworkPatchData({}, { isTailored: true })).toEqual({ ok: false, error: "Nothing to update" });
    // Division: optional on a tailored framework, so blank CLEARS rather than refuses…
    expect(frameworkPatchData({ division: "" }, { isTailored: true })).toEqual({ ok: true, data: { division: null } });
    expect(frameworkPatchData({ division: " Retail " }, { isTailored: true })).toEqual({ ok: true, data: { division: "Retail" } });
    // …and is ignored entirely on a reference framework (not a reference concept).
    expect(frameworkPatchData({ division: "Retail" }, { isTailored: false })).toEqual({ ok: false, error: "Nothing to update" });
    // Unknown keys are not written.
    expect(frameworkPatchData({ familyKey: "hack", version: "8.0" }, { isTailored: false })).toEqual({ ok: true, data: { version: "8.0" } });
  });
});

describe("the edit persists, field by field", () => {
  beforeEach(async () => { await truncateAll(); });

  it("T4372 — version changes alone; name, variant and the family identity are untouched", async () => {
    const fw = await prisma.pcfFramework.create({
      data: { orgId: null, kind: "reference", familyKey: "cross-industry", name: "APQC PCF — Cross-Industry", variant: "Cross-Industry", version: "8.0", isCurrent: true },
      select: { id: true },
    });
    const patch = frameworkPatchData({ version: "8.1" }, { isTailored: false });
    if (!patch.ok) throw new Error(patch.error);
    await prisma.pcfFramework.update({ where: { id: fw.id }, data: patch.data });
    const after = await prisma.pcfFramework.findUniqueOrThrow({ where: { id: fw.id } });
    expect(after.version).toBe("8.1");
    expect(after.name).toBe("APQC PCF — Cross-Industry");
    expect(after.variant).toBe("Cross-Industry");
    // The upgrade pairing keys on familyKey; an edited version label must not move it.
    expect(after.familyKey).toBe("cross-industry");
    expect(after.isCurrent).toBe(true);

    // And the whole identity at once, as the dialog sends it.
    const all = frameworkPatchData({ name: "APQC PCF — Retail", variant: "Retail", version: "7.3" }, { isTailored: false });
    if (!all.ok) throw new Error(all.error);
    await prisma.pcfFramework.update({ where: { id: fw.id }, data: all.data });
    const final = await prisma.pcfFramework.findUniqueOrThrow({ where: { id: fw.id } });
    expect([final.name, final.variant, final.version]).toEqual(["APQC PCF — Retail", "Retail", "7.3"]);
  });
});

describe("the admin screen offers the whole identity", () => {
  it("T4373 — the Edit dialog has Name, Variant and Version, sends only what changed, and the single-field Rename is gone", () => {
    const ui = read("app", "(dashboard)", "dashboard", "admin", "pcf", "PcfClient.tsx");
    expect(ui).toContain("Edit framework");
    for (const label of [">Name<", ">Variant<", ">Version<"]) expect(ui, `field ${label}`).toContain(label);
    expect(ui, "division stays tailored-only").toMatch(/selected\.kind === "tailored" && \(\s*<div>\s*<label[^>]*>Division/);
    // Only changed fields travel, so an untouched field is never rewritten.
    expect(ui).toMatch(/if \(editName\.trim\(\) !== selected\.name\) body\.name = editName\.trim\(\);/);
    expect(ui).toMatch(/if \(editVersion\.trim\(\) !== selected\.version\) body\.version = editVersion\.trim\(\);/);
    expect(ui, "the old dialog").not.toContain("Rename framework");
    expect(ui, "the old request").not.toContain("body: JSON.stringify({ name: renameValue.trim() })");
    // The route uses the pure helper rather than its own copy of the rules.
    const route = read("app", "api", "orgs", "[id]", "pcf", "[frameworkId]", "route.ts");
    expect(route).toMatch(/frameworkPatchData\(body, \{ isTailored \}\)/);
    expect(route, "no more variant-follows-name").not.toContain("data.variant = body.name.trim()");
  });
});
