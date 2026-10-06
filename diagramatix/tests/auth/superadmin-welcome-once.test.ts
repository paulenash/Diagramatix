/**
 * T5264 — the SuperAdmin welcome is shown ONCE, then never again (Paul, 2026-10-06: "Remove this … Only display it once then never again
 * for Paul"), and greets by first name, not by title ("Welcome, Dr").
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { firstNameOf } from "@/app/lib/auth/firstName";

const welcome = readFileSync("app/components/SuperAdminWelcome.tsx", "utf8");
const route = readFileSync("app/api/superadmin/account-migration/route.ts", "utf8");
const lib = readFileSync("app/lib/superAdminMigration.ts", "utf8");

describe("T5264 greeting by name", () => {
  it("a leading title is not a name", () => {
    expect(firstNameOf("Dr Paul Nash")).toBe("Paul");
    expect(firstNameOf("Dr. Paul Nash")).toBe("Paul");
    expect(firstNameOf("Prof Dr Greg Nash")).toBe("Greg");
    expect(firstNameOf("Paul Nash")).toBe("Paul");
    expect(firstNameOf("Greg")).toBe("Greg");
    expect(firstNameOf("  mr   sam  ")).toBe("sam");
    expect(firstNameOf("Dr")).toBe("");
    expect(firstNameOf(null)).toBe("");
    expect(firstNameOf(undefined)).toBe("");
  });
  it("the dialog uses it", () => {
    expect(welcome).toContain("const first = firstNameOf(status.name);");
  });
});

describe("T5264 once, then never again", () => {
  it("the server records 'welcomed' per account, and reports it", () => {
    expect(lib).toContain('export const welcomedSettingKey = (newUserId: string) => "superadmin.welcomed." + newUserId;');
    expect(route).toContain('if (body.action === "welcomed") {');
    expect(route).toContain("welcomed: !!welcomed,");
    expect(route.indexOf('body.action === "welcomed"')).toBeGreaterThan(route.indexOf("blockReadOnlyImpersonation"));
  });
  it("it opens only when there is something to ask (the account move), or — for an account that has done neither — once", () => {
    expect(welcome).toContain("const wanted = s.pending || (!s.done && !s.welcomed);");
    expect(welcome).toContain("if (wanted && !seen) setOpen(true);");
  });
  it("an account whose move is already done never sees it: Paul's, with the move done and nothing pending", () => {
    // the rule, evaluated: wanted = pending || (!done && !welcomed)
    const wanted = (s: { pending: boolean; done: boolean; welcomed: boolean }) => s.pending || (!s.done && !s.welcomed);
    expect(wanted({ pending: false, done: true, welcomed: false })).toBe(false);     // Paul: move done
    expect(wanted({ pending: true, done: false, welcomed: false })).toBe(true);      // Greg: the move still to confirm
    expect(wanted({ pending: false, done: false, welcomed: false })).toBe(true);     // nothing to move, never welcomed: once
    expect(wanted({ pending: false, done: false, welcomed: true })).toBe(false);     // …and then never again
  });
  it("dismissing the plain welcome (or finishing the move) records it; 'Not now' on a pending move does not", () => {
    expect(welcome).toContain("if (!status?.pending || result?.ok) {");
    expect(welcome).toContain('body: JSON.stringify({ action: "welcomed" })');
  });
});
