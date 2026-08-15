/**
 * Wave D data-integrity fixes.
 *  DATA-08  restore remaps `data.parentDiagramIds` (a cross-diagram back-ref),
 *           not only subprocess `linkedDiagramId`.
 *  DATA-10  user-controlled values interpolated into an email Subject are
 *           stripped of CR/LF so they can't inject extra headers.
 *  DATA-30  a malformed restore payload is a clean 400 (typed error), and a
 *           non-array/non-object table value doesn't crash the batch.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg, createProject } from "../_setup/factories";
import { buildUserBackup, restoreUserBackup } from "@/app/lib/backup";
import { restoreFullBackupTables, BackupValidationError, type FullBackupPayload } from "@/app/lib/full-backup";
import { mailHeader } from "@/app/lib/email";

// ── DATA-10 ─────────────────────────────────────────────────────────────────
describe("DATA-10 — mailHeader strips header-injection vectors", () => {
  it("collapses CR/LF/tabs to a single space", () => {
    expect(mailHeader("Greg\r\nBcc: evil@x.com")).toBe("Greg Bcc: evil@x.com");
    expect(mailHeader("a\tb\nc")).toBe("a b c");
  });
  it("trims, collapses runs, and caps length; tolerates null", () => {
    expect(mailHeader("  hi   there  ")).toBe("hi there");
    expect(mailHeader(null)).toBe("");
    expect(mailHeader("x".repeat(500)).length).toBe(200);
  });
});

// ── DATA-30 ─────────────────────────────────────────────────────────────────
describe("DATA-30 — per-table restore rejects a malformed payload cleanly", () => {
  it("throws a typed BackupValidationError (→ 400) when `tables` is missing", async () => {
    await expect(restoreFullBackupTables({} as unknown as FullBackupPayload, ["User"]))
      .rejects.toBeInstanceOf(BackupValidationError);
    await expect(restoreFullBackupTables({ tables: null } as unknown as FullBackupPayload, ["User"]))
      .rejects.toBeInstanceOf(BackupValidationError);
  });
});

// ── DATA-08 ─────────────────────────────────────────────────────────────────
describe("DATA-08 — restore remaps data.parentDiagramIds", () => {
  beforeEach(async () => { await truncateAll(); });

  it("rewrites a diagram's parentDiagramIds to the restored ids", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await createProject({ userId: user.id, orgId: org.id });
    const parent = await prisma.diagram.create({
      data: { name: "Parent", type: "bpmn", userId: user.id, orgId: org.id, projectId: project.id, data: { elements: [], connectors: [] } },
    });
    const child = await prisma.diagram.create({
      // child records `parent` as one of its parentDiagramIds — a cross-diagram back-ref.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { name: "Child", type: "bpmn", userId: user.id, orgId: org.id, projectId: project.id, data: { elements: [], connectors: [], parentDiagramIds: [parent.id] } as any },
    });

    const bytes = await buildUserBackup(user.id, "test");
    await restoreUserBackup(bytes, user.id, org.id, "Owner");

    // The restored child sits in the "(restored)" project; its parentDiagramIds
    // must point at the RESTORED parent, not the original id.
    const restoredProject = await prisma.project.findFirst({ where: { userId: user.id, name: { contains: "(restored)" } }, orderBy: { createdAt: "desc" } });
    const diagrams = await prisma.diagram.findMany({ where: { projectId: restoredProject!.id } });
    const restoredChild = diagrams.find((d) => d.name === "Child");
    const restoredParent = diagrams.find((d) => d.name === "Parent");
    const pids = (restoredChild!.data as { parentDiagramIds?: string[] }).parentDiagramIds ?? [];

    expect(pids).toEqual([restoredParent!.id]);
    expect(pids).not.toContain(parent.id);   // stale id gone
    expect(pids).not.toContain(child.id);
  });
});
