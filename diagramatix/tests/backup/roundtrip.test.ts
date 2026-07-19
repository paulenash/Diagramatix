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

    // Simulator tables (Phase 4–6): a team, a study with a root + scenario, and
    // a GLOBAL example. The catalog-driven full backup must carry them all.
    await prisma.simulationTeam.create({ data: { name: "Analysts", projectId: project.id, capacity: 3 } });
    // A working calendar (Tier-1 feature) — the catalog-driven backup must carry it.
    await prisma.simulationCalendar.create({ data: { name: "Business hours", projectId: project.id } });
    const study = await prisma.simulationStudy.create({ data: { name: "RT Study", projectId: project.id } });
    await prisma.simulationStudyRoot.create({ data: { studyId: study.id, diagramId: diagram.id } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.simulationScenario.create({ data: { name: "Baseline", studyId: study.id, isBaseline: true, variantRootIds: [diagram.id] as any } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.simulationExample.create({ data: { slug: "rt-example", title: "RT Example", published: true, package: { version: 1 } as any } });

    // User Guide content — the full (catalog-driven, all-columns) backup must
    // carry the guide tables AND the new HelpChapter.category column + image bytes.
    const helpCh = await prisma.helpChapter.create({ data: { collection: "user-guide", slug: "rt-guide", title: "RT Guide", category: "Getting Started", sortOrder: 0 } });
    await prisma.helpSection.create({ data: { chapterId: helpCh.id, collection: "user-guide", heading: "Intro", bodyMarkdown: "hi", sortOrder: 0 } });
    await prisma.helpImage.create({ data: { filename: "rt.png", screenName: "RT", mimeType: "image/png", bytes: Buffer.from([1, 2, 3, 4]) } });

    const before = {
      org: await prisma.org.count(),
      user: await prisma.user.count(),
      project: await prisma.project.count(),
      diagram: await prisma.diagram.count(),
      pv: await prisma.publishedVersion.count(),
      list: await prisma.entityList.count(),
      node: await prisma.entityNode.count(),
      team: await prisma.simulationTeam.count(),
      calendar: await prisma.simulationCalendar.count(),
      study: await prisma.simulationStudy.count(),
      studyRoot: await prisma.simulationStudyRoot.count(),
      scenario: await prisma.simulationScenario.count(),
      example: await prisma.simulationExample.count(),
      helpChapter: await prisma.helpChapter.count(),
      helpSection: await prisma.helpSection.count(),
      helpImage: await prisma.helpImage.count(),
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
    expect(await prisma.simulationTeam.count()).toBe(before.team);
    expect(await prisma.simulationCalendar.count()).toBe(before.calendar);
    expect(await prisma.simulationStudy.count()).toBe(before.study);
    expect(await prisma.simulationStudyRoot.count()).toBe(before.studyRoot);
    expect(await prisma.simulationScenario.count()).toBe(before.scenario);
    expect(await prisma.simulationExample.count()).toBe(before.example);

    // Cyclic pointer re-linked (ids are preserved by a wipe restore).
    const restoredDiagram = await prisma.diagram.findUnique({ where: { id: diagram.id } });
    expect(restoredDiagram?.currentPublishedVersionId).toBe(pv.id);

    // Simulator relations + JSON survive: the study root still points at its
    // diagram, and the example's package JSON round-trips.
    const restoredRoot = await prisma.simulationStudyRoot.findFirst({ where: { studyId: study.id } });
    expect(restoredRoot?.diagramId).toBe(diagram.id);
    const restoredExample = await prisma.simulationExample.findUnique({ where: { slug: "rt-example" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((restoredExample?.package as any)?.version).toBe(1);
    // Scenario variant roots (As-is/To-be) survive.
    const restoredScenario = await prisma.simulationScenario.findFirst({ where: { studyId: study.id } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((restoredScenario?.variantRootIds as any)?.[0]).toBe(diagram.id);

    // Entity tree intact: the child still points at its parent.
    const child = await prisma.entityNode.findFirst({ where: { name: "Finance" } });
    expect(child?.parentId).toBe(root.id);
    expect(child?.level).toBe("Team");

    // User Guide tables round-trip, and the new category column survives (the
    // full backup dumps all columns, so a new column is carried automatically).
    expect(await prisma.helpChapter.count()).toBe(before.helpChapter);
    expect(await prisma.helpSection.count()).toBe(before.helpSection);
    expect(await prisma.helpImage.count()).toBe(before.helpImage);
    const rtGuide = await prisma.helpChapter.findFirst({ where: { collection: "user-guide", slug: "rt-guide" } });
    expect(rtGuide?.category).toBe("Getting Started");
    const rtImg = await prisma.helpImage.findFirst({ where: { filename: "rt.png" } });
    expect(Buffer.from(rtImg!.bytes as Uint8Array).equals(Buffer.from([1, 2, 3, 4]))).toBe(true);
  });
});
