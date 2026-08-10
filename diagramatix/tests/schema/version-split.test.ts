/**
 * Version-model split (2026-08-10): SCHEMA_VERSION is now a standalone XSD integer
 * ("45"), PRODUCT_VERSION is the app version ("2.1.1"). Import-compat reads the
 * structural schema version from EITHER the new integer form or the legacy "1.NN"
 * (and "1.NN.build") form, since the old major was always 1 and the minor WAS the
 * structural version. These guards protect back-compat with already-exported files.
 */
import { describe, it, expect } from "vitest";
import { SCHEMA_VERSION, PRODUCT_VERSION, structuralSchemaVersion, checkSchemaCompatibility } from "@/app/lib/diagram/types";

describe("version-model split", () => {
  it("T2258 — the two version constants have their expected shapes", () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+$/);            // bare integer
    expect(PRODUCT_VERSION).toMatch(/^\d+\.\d+\.\d+$/); // major.middle.patch
  });

  it("T2259 — structuralSchemaVersion reads new integer AND legacy 1.NN forms", () => {
    expect(structuralSchemaVersion("45")).toBe(45);       // new
    expect(structuralSchemaVersion("1.45")).toBe(45);     // legacy major.minor
    expect(structuralSchemaVersion("1.45.2153")).toBe(45); // legacy with build
    expect(structuralSchemaVersion("1.30")).toBe(30);     // older legacy
    expect(structuralSchemaVersion("")).toBe(0);
  });

  it("T2260 — compat accepts equal/older, blocks newer, tolerant of legacy tags", () => {
    // A legacy "1.45" file is structurally identical to the current integer 45.
    expect(checkSchemaCompatibility("1.45").ok).toBe(true);
    expect(checkSchemaCompatibility("45").ok).toBe(true);
    // An older file imports (with an upgrade note).
    const older = checkSchemaCompatibility("1.30");
    expect(older.ok).toBe(true);
    expect(older.message).toMatch(/older/i);
    // A newer-than-app file is blocked.
    const newer = checkSchemaCompatibility(String(structuralSchemaVersion(SCHEMA_VERSION) + 1));
    expect(newer.ok).toBe(false);
    expect(newer.message).toMatch(/newer/i);
  });
});
