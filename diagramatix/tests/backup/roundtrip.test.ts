/**
 * Full backup → wipe-restore round-trip.
 *
 * Proves the catalog-driven restore actually preserves data end-to-end:
 *   • every seeded table's rows come back with the same count,
 *   • the cyclic Diagram.currentPublishedVersionId pointer is re-linked
 *     after PublishedVersion rows land (the deferred-edge path),
 *   • an EntityNode parent/child tree survives (self-referential FK),
 *   • Date columns round-trip through ISO strings without throwing.
 *
 * Runs against the test DB; the wipe TRUNCATEs it, which is exactly what
 * truncateAll() does between tests anyway.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { buildFullBackup, parseFullBackup, restoreFullBackupWipe } from "@/app/lib/full-backup";

describe("full backup round-trip", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("restores every table, re-links the publish cycle, and rebuilds an entity tree", async () => {
    const { user, org } = await createUserWithOrg();

    const project = await prisma.project.create({
      data: { name: "RT Project", userId: user.id, orgId: org.id },
    });
    const diagram = await prisma.diagram.create({
      data: { name: "RT Diagram", type: "flowchart", userId: user.id, orgId: org.id, projectId: project.id, lifecycle: "PUBLISHED" },
    });
    const pv = await prisma.publishedVersion.create({
      data: { diagramId: diagram.id, versionNumber: 1, name: "RT Diagram", type: "flowchart", data: {}, colorConfig: {}, displayMode: "normal", publishedById: user.id },
    });
    // The cyclic pointer that must survive the deferred-edge restore.
    await prisma.diagram.update({ where: { id: diagram.id }, data: { currentPublishedVersionId: pv.id } });

    // A project-scoped entity list with a parent → child node tree.
    const list = await prisma.entityList.create({
      data: { name: "Org Chart", kind: "OrgStructure", projectId: project.id },
    });
    const root = await prisma.entityNode.create({
      data: { listId: list.id, name: "Company", level: "Organisation", sortOrder: 0 },
    });
    await prisma.entityNode.create({
      data: { listId: list.id, parentId: root.id, name: "Finance", level: "Team", sortOrder: 0 },
    });

    const before = {
      org: await prisma.org.count(),
      user: await prisma.user.count(),
      project: await prisma.project.count(),
      diagram: await prisma.diagram.count(),
      pv: await prisma.publishedVersion.count(),
      list: await prisma.entityList.count(),
      node: await prisma.entityNode.count(),
    };

    const bytes = await buildFullBackup("test@diagramatix.test", "test", undefined);
    const payload = await parseFullBackup(bytes);
    // The backup must carry the entity tables (the original bug).
    expect(payload.tables.EntityList?.length).toBe(1);
    expect(payload.tables.EntityNode?.length).toBe(2);

    const result = await restoreFullBackupWipe(payload);
    expect(result.mode).toBe("wipe");

    // Counts preserved for every seeded table.
    expect(await prisma.org.count()).toBe(before.org);
    expect(await prisma.user.count()).toBe(before.user);
    expect(await prisma.project.count()).toBe(before.project);
    expect(await prisma.diagram.count()).toBe(before.diagram);
    expect(await prisma.publishedVersion.count()).toBe(before.pv);
    expect(await prisma.entityList.count()).toBe(before.list);
    expect(await prisma.entityNode.count()).toBe(before.node);

    // Cyclic pointer re-linked (ids are preserved by a wipe restore).
    const restoredDiagram = await prisma.diagram.findUnique({ where: { id: diagram.id } });
    expect(restoredDiagram?.currentPublishedVersionId).toBe(pv.id);

    // Entity tree intact: the child still points at its parent.
    const child = await prisma.entityNode.findFirst({ where: { name: "Finance" } });
    expect(child?.parentId).toBe(root.id);
    expect(child?.level).toBe("Team");
  });
});
