/**
 * Scoped backup → restore round-trip for SIMULATION CONFIGURATION (item 2).
 *
 * Proves the user + org scoped backups now carry a project's simulation study +
 * scenarios + team/calendar libraries (config only, no run results) and replay
 * them into the restored project with remapped ids. Runs against the test DB.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { buildUserBackup, restoreUserBackup } from "@/app/lib/backup";
import { buildOrgBackup, restoreOrgBackupAdditive } from "@/app/lib/org-backup";
import { parseFullBackup, type AdditiveSelection } from "@/app/lib/full-backup";

async function seedSimulation(userId: string, orgId: string) {
  const project = await prisma.project.create({ data: { name: "Sim Project", userId, orgId } });
  const diagram = await prisma.diagram.create({
    data: { name: "Sim Diagram", type: "bpmn", userId, orgId, projectId: project.id, data: { elements: [], connectors: [] } },
  });
  const calendar = await prisma.simulationCalendar.create({ data: { name: "Business Hours", projectId: project.id } });
  await prisma.simulationTeam.create({ data: { name: "Processors", projectId: project.id, capacity: 3, calendarId: calendar.id } });
  const study = await prisma.simulationStudy.create({ data: { name: "As-is vs To-be", projectId: project.id, createdById: userId } });
  await prisma.simulationStudyRoot.create({ data: { studyId: study.id, diagramId: diagram.id } });
  await prisma.simulationScenario.create({ data: { name: "Baseline", studyId: study.id, isBaseline: true } });
  await prisma.simulationScenario.create({ data: { name: "More staff", studyId: study.id } });
  return { project, diagram, study };
}

describe("scoped backup round-trip — simulation configuration", () => {
  beforeEach(async () => { await truncateAll(); });

  it("user backup carries + restores study + scenarios + team/calendar", async () => {
    const { user, org } = await createUserWithOrg();
    await seedSimulation(user.id, org.id);

    const bytes = await buildUserBackup(user.id, "test");
    await restoreUserBackup(bytes, user.id, org.id, "Owner");

    // The restored study lives in the "(restored)" project — assert it, its two
    // scenarios, and the team+calendar libraries came back.
    const restoredProject = await prisma.project.findFirst({ where: { userId: user.id, name: { contains: "(restored)" } } });
    expect(restoredProject).toBeTruthy();
    const studies = await prisma.simulationStudy.findMany({ where: { projectId: restoredProject!.id }, include: { scenarios: true, roots: true } });
    expect(studies).toHaveLength(1);
    expect(studies[0].name).toBe("As-is vs To-be");
    expect(studies[0].scenarios.map((s) => s.name).sort()).toEqual(["Baseline", "More staff"]);
    expect(studies[0].roots).toHaveLength(1);
    const teams = await prisma.simulationTeam.findMany({ where: { projectId: restoredProject!.id } });
    expect(teams).toHaveLength(1);
    expect(teams[0].calendarId).toBeTruthy(); // team relinked to the restored calendar
    // Root points at a diagram in the SAME (restored) project — id remapped.
    const rootDiag = await prisma.diagram.findUnique({ where: { id: studies[0].roots[0].diagramId } });
    expect(rootDiag?.projectId).toBe(restoredProject!.id);
  });

  it("org backup carries + restores the simulation study", async () => {
    const { user, org } = await createUserWithOrg();
    await seedSimulation(user.id, org.id);

    const bytes = await buildOrgBackup(org.id, "admin@test", "test");
    const payload = await parseFullBackup(bytes);
    // Sanity: the packages rode in the scoped payload (not raw Simulation* tables).
    expect(payload.simulationPackages && Object.keys(payload.simulationPackages).length).toBeTruthy();

    // Restore additively into a fresh org (select the original ids to restore).
    const { org: org2 } = await createUserWithOrg({ email: "two@test.dev" });
    const rows = (t: string) => (payload.tables[t] as Array<{ id: string }> | undefined) ?? [];
    const selection: AdditiveSelection = {
      orgIds: rows("Org").map((o) => o.id),
      userIds: rows("User").map((u) => u.id),
      projectIds: rows("Project").map((p) => p.id),
      diagramIds: rows("Diagram").map((d) => d.id),
    };
    await restoreOrgBackupAdditive(payload, selection, org2.id);

    const studies = await prisma.simulationStudy.findMany({
      where: { project: { orgId: org2.id } }, include: { scenarios: true },
    });
    expect(studies).toHaveLength(1);
    expect(studies[0].scenarios).toHaveLength(2);
  });
});
