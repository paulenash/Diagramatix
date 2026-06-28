/**
 * Notifications (#7a).
 *
 * Tests the real notification helpers (`createNotification` / `createNotifications`
 * in app/lib/notifications.ts) against the test DB — no mocks. These are the exact
 * helpers the action routes call (e.g. POST /api/bundles fires `bundle-published`
 * for each audience member via `createNotifications`). We seed users + invoke the
 * helper the way the route does and assert the recipient rows + payload land.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser } from "../_setup/factories";
import { createNotification, createNotifications } from "@/app/lib/notifications";

describe("notifications", () => {
  beforeEach(async () => { await truncateAll(); });

  it("createNotification writes one row for the recipient with type + payload", async () => {
    const recipient = await createUser();
    const actor = await createUser();

    await createNotification(recipient.id, "feedback-received", {
      diagramId: "d1", feedbackId: "f1", fromUserId: actor.id,
    });

    const rows = await prisma.notification.findMany({ where: { userId: recipient.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("feedback-received");
    expect(rows[0].readAt).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = rows[0].payload as any;
    expect(payload.diagramId).toBe("d1");
    expect(payload.feedbackId).toBe("f1");
    expect(payload.fromUserId).toBe(actor.id);

    // No stray notification for the actor.
    expect(await prisma.notification.count({ where: { userId: actor.id } })).toBe(0);
  });

  it("createNotifications fans a bundle-published notification out to every audience member", async () => {
    const owner = await createUser();
    const a = await createUser();
    const b = await createUser();

    // Mirror the POST /api/bundles call: one bundle-published per audience user.
    await createNotifications([a.id, b.id].map(userId => ({
      userId,
      type: "bundle-published" as const,
      payload: { bundleId: "bundle-1", bundleName: "Q4 Release", rootDiagramId: "root-1", fromUserId: owner.id },
    })));

    for (const u of [a, b]) {
      const rows = await prisma.notification.findMany({ where: { userId: u.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe("bundle-published");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((rows[0].payload as any).bundleName).toBe("Q4 Release");
    }
    // The publisher gets nothing — they're not in their own audience.
    expect(await prisma.notification.count({ where: { userId: owner.id } })).toBe(0);
    // Exactly two notifications total.
    expect(await prisma.notification.count()).toBe(2);
  });

  it("createNotifications with an empty list is a no-op", async () => {
    await createNotifications([]);
    expect(await prisma.notification.count()).toBe(0);
  });
});
