/**
 * Audit log — recordAudit writes an append-only, attributable row with meta as a
 * JSON string (Phase A2, ENT-03). app/lib/audit.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { recordAudit, AUDIT } from "@/app/lib/audit";

beforeEach(async () => { await truncateAll(); });

describe("audit log", () => {
  it("T0923 — records a privileged action with actor, target and stringified meta", async () => {
    await recordAudit({
      actorUserId: "u1", actorEmail: "admin@example.com",
      effectiveUserId: "u2",
      action: AUDIT.ImpersonateStart, targetType: "user", targetId: "u2",
      meta: { mode: "edit", targetEmail: "victim@example.com" }, ip: "203.0.113.5",
    });
    const rows = await prisma.auditLog.findMany();
    expect(rows.length).toBe(1);
    const r = rows[0];
    expect(r.action).toBe("impersonate.start");
    expect(r.actorEmail).toBe("admin@example.com");
    expect(r.effectiveUserId).toBe("u2");
    expect(r.ip).toBe("203.0.113.5");
    expect(JSON.parse(r.meta)).toEqual({ mode: "edit", targetEmail: "victim@example.com" });
  });

  it("T0924 — meta defaults to {} and the call never throws", async () => {
    await expect(recordAudit({ action: AUDIT.RestoreWipe })).resolves.toBeUndefined();
    const rows = await prisma.auditLog.findMany();
    expect(rows.length).toBe(1);
    expect(rows[0].meta).toBe("{}");
    expect(rows[0].actorUserId).toBeNull();
  });
});
