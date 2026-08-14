/**
 * Org-master simulation teams → project COPIES.
 *
 * The invariant under test is independence: a project adopts a master and then
 * owns its copy outright. Editing the copy must never mutate the master, and
 * editing the master later must never rewrite an already-adopted copy.
 * Mirrors tests for adoptStructure (EntityList org master → project copy).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { adoptTeams, AdoptTeamsError } from "@/app/lib/simulation/adoptTeams";

async function seedMasters(orgId: string) {
  const a = await prisma.simulationTeam.create({
    data: { name: "Assessors", orgId, capacity: 4, costPerHour: 85, efficiency: 0.9 },
  });
  const b = await prisma.simulationTeam.create({
    data: { name: "Underwriters", orgId, capacity: 2, costPerHour: 120 },
  });
  return { a, b };
}

describe("adoptTeams — org master → project copy", () => {
  beforeEach(async () => { await truncateAll(); });

  it("clones every master into the project with its settings + provenance", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    const { a, b } = await seedMasters(org.id);

    const result = await adoptTeams(project.id, org.id, []);
    expect(result).toMatchObject({ created: 2, updated: 0, names: ["Assessors", "Underwriters"] });

    const copies = await prisma.simulationTeam.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } });
    expect(copies).toHaveLength(2);
    expect(copies[0]).toMatchObject({ name: "Assessors", capacity: 4, costPerHour: 85, efficiency: 0.9, sourceTeamId: a.id });
    expect(copies[1]).toMatchObject({ name: "Underwriters", capacity: 2, costPerHour: 120, sourceTeamId: b.id });
    // Copies are project-scoped, never org-scoped.
    for (const c of copies) expect(c.orgId).toBeNull();
  });

  it("adopts only the requested masters", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    const { b } = await seedMasters(org.id);

    const result = await adoptTeams(project.id, org.id, [b.id]);
    expect(result.created).toBe(1);
    const copies = await prisma.simulationTeam.findMany({ where: { projectId: project.id } });
    expect(copies.map((c) => c.name)).toEqual(["Underwriters"]);
  });

  it("editing the project copy never mutates the org master", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    const { a } = await seedMasters(org.id);
    await adoptTeams(project.id, org.id, [a.id]);

    const copy = await prisma.simulationTeam.findFirst({ where: { projectId: project.id, name: "Assessors" } });
    await prisma.simulationTeam.update({ where: { id: copy!.id }, data: { capacity: 99 } });

    const master = await prisma.simulationTeam.findUnique({ where: { id: a.id } });
    expect(master!.capacity).toBe(4);
  });

  it("editing the master never rewrites an already-adopted copy", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    const { a } = await seedMasters(org.id);
    await adoptTeams(project.id, org.id, [a.id]);

    await prisma.simulationTeam.update({ where: { id: a.id }, data: { capacity: 50 } });

    const copy = await prisma.simulationTeam.findFirst({ where: { projectId: project.id, name: "Assessors" } });
    expect(copy!.capacity).toBe(4);
  });

  it("leaves a same-named project team alone unless overwrite is asked for", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    const { a } = await seedMasters(org.id);
    // The project has already tuned its own "Assessors".
    await prisma.simulationTeam.create({ data: { name: "Assessors", projectId: project.id, capacity: 7 } });

    const skipped = await adoptTeams(project.id, org.id, [a.id]);
    expect(skipped).toMatchObject({ created: 0, updated: 0 });
    let copy = await prisma.simulationTeam.findFirst({ where: { projectId: project.id, name: "Assessors" } });
    expect(copy!.capacity).toBe(7);           // tuned staffing preserved
    expect(copy!.sourceTeamId).toBeNull();

    const overwritten = await adoptTeams(project.id, org.id, [a.id], { overwriteExisting: true });
    expect(overwritten).toMatchObject({ created: 0, updated: 1 });
    copy = await prisma.simulationTeam.findFirst({ where: { projectId: project.id, name: "Assessors" } });
    expect(copy!.capacity).toBe(4);
    expect(copy!.sourceTeamId).toBe(a.id);
    // Still exactly one pool of that name — adopting never forks the identity
    // the diagrams reference.
    const all = await prisma.simulationTeam.findMany({ where: { projectId: project.id, name: "Assessors" } });
    expect(all).toHaveLength(1);
  });

  it("re-adopting is idempotent — no duplicate pools", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    await seedMasters(org.id);

    await adoptTeams(project.id, org.id, []);
    await adoptTeams(project.id, org.id, []);

    const copies = await prisma.simulationTeam.findMany({ where: { projectId: project.id } });
    expect(copies).toHaveLength(2);
  });

  it("refuses to pull a master from another org", async () => {
    const { user, org } = await createUserWithOrg();
    const { org: other } = await createUserWithOrg({ email: "two@test.dev" });
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    const foreign = await prisma.simulationTeam.create({ data: { name: "Foreign", orgId: other.id, capacity: 3 } });

    await expect(adoptTeams(project.id, org.id, [foreign.id])).rejects.toBeInstanceOf(AdoptTeamsError);
    const copies = await prisma.simulationTeam.findMany({ where: { projectId: project.id } });
    expect(copies).toHaveLength(0);
  });

  it("reports 404 when the org has no masters at all", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    await expect(adoptTeams(project.id, org.id, [])).rejects.toMatchObject({ status: 404 });
  });

  it("drops the master's calendar reference rather than dangling it", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    // A master pointing at an org-side calendar id that means nothing here.
    const m = await prisma.simulationTeam.create({
      data: { name: "Night crew", orgId: org.id, capacity: 2, calendarId: "cal-from-somewhere-else" },
    });

    await adoptTeams(project.id, org.id, [m.id]);
    const copy = await prisma.simulationTeam.findFirst({ where: { projectId: project.id, name: "Night crew" } });
    expect(copy!.calendarId).toBeNull();
  });
});
