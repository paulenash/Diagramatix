/**
 * T5250 — SuperAdmin on EVERY screen (Paul, 2026-10-05: signed in as paul@diagramatix.com.au he was SuperAdmin on the Dashboard and
 * the Project screen but not on the Diagram screen). The editor compared the signed-in address with one literal address; the rest
 * of the app asks the one list (SUPERUSER_EMAILS / isSuperuser). No screen may compare an address with a literal again.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "generated") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("T5250 one list decides who is a SuperAdmin", () => {
  it("the Diagram screen asks SUPERUSER_EMAILS", () => {
    const src = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
    expect(src).toContain("const isAdmin = !!userEmail && SUPERUSER_EMAILS.has(userEmail.toLowerCase());");
    expect(src).toContain('import { SUPERUSER_EMAILS } from "@/app/lib/superuser";');
  });
  it("no screen or route compares an address with one of the SuperAdmin addresses as a literal", () => {
    const allowed = new Set(["app/lib/superuser.ts", "app/lib/superAdminMigration.ts", "app/lib/superAdminOrg.ts", "app/lib/admin/tileVisibility.ts", "app/api/support/diagram/route.ts"]);
    const literal = /["'](?:paul|greg)[.\w]*@[\w.]*(?:nashcc|diagramatix|getai)\.com\.au["']/;
    const bad: string[] = [];
    for (const f of files("app")) {
      const rel = f.split("\\").join("/");
      if (allowed.has(rel)) continue;
      readFileSync(f, "utf8").split("\n").forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;                         // a comment
        if (literal.test(l)) bad.push(`${rel}:${i + 1}: ${l.trim().slice(0, 100)}`);
      });
    }
    expect(bad).toEqual([]);
  });
  it("the Support project is collected by whichever of Paul's accounts holds it (his data moves to the new address)", () => {
    const src = readFileSync("app/api/support/diagram/route.ts", "utf8");
    expect(src).toContain('const SUPPORT_ADMIN_EMAILS = ["paul@diagramatix.com.au", "paul@nashcc.com.au"];');
    expect(src).toContain("where: { userId: c.id, name: SUPPORT_PROJECT_NAME }");
  });
});
