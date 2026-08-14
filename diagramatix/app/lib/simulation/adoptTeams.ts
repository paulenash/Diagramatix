/**
 * Adopt org-master SimulationTeams into a project as its OWN independent COPIES.
 *
 * The data effects of POST /api/projects/[id]/adopt-teams, extracted so they can
 * be unit-tested directly. The auth + impersonation gates stay in the route;
 * this is purely "what happens to the data".
 *
 * KEY INVARIANT (mirroring adoptStructure for EntityLists): the project gets
 * fresh SimulationTeam rows CLONED from the masters. They are physically
 * separate — editing the project copy must never mutate the org master, and
 * editing a master later never retroactively changes an already-adopted copy.
 * `sourceTeamId` records provenance only; it carries no live link.
 *
 * Teams are matched to existing project teams BY NAME, the same identity the
 * package/library replay uses (overrides + interventions reference a team by
 * name, and diagram elements carry a team NAME in `sim.teamId`). So adopting a
 * master whose name a project team already uses UPDATES that team in place
 * rather than creating a second pool the diagrams would ignore.
 */
import { prisma } from "@/app/lib/db";

export class AdoptTeamsError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export interface AdoptTeamsResult {
  /** Teams created in the project. */
  created: number;
  /** Existing project teams updated in place (same name). */
  updated: number;
  /** Names adopted, in order. */
  names: string[];
}

/**
 * Clone the given org-master teams (which must all belong to `projectOrgId`)
 * into project-scoped copies under `projectId`.
 *
 * `teamIds` empty = adopt every master in the org. Throws AdoptTeamsError when a
 * requested master is missing or belongs to another org (404), so a caller can
 * never pull a team across a tenant boundary.
 */
export async function adoptTeams(
  projectId: string,
  projectOrgId: string,
  teamIds: string[],
  opts: { overwriteExisting?: boolean } = {},
): Promise<AdoptTeamsResult> {
  const masters = await prisma.simulationTeam.findMany({
    where: { orgId: projectOrgId, ...(teamIds.length ? { id: { in: teamIds } } : {}) },
    orderBy: { name: "asc" },
  });
  if (teamIds.length && masters.length !== teamIds.length) {
    throw new AdoptTeamsError("One or more teams not found in this organisation", 404);
  }
  if (masters.length === 0) {
    throw new AdoptTeamsError("No organisation teams to adopt", 404);
  }

  const existing = await prisma.simulationTeam.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  const existingByName = new Map(existing.map((t) => [t.name, t.id]));

  let created = 0;
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const m of masters) {
      const hit = existingByName.get(m.name);
      const values = {
        capacity: m.capacity,
        costPerHour: m.costPerHour,
        efficiency: m.efficiency,
        // A master's calendarId points at an ORG-side calendar id that means
        // nothing in this project, so the copy starts with no calendar rather
        // than a dangling reference. The project picks its own.
        calendarId: null,
        sourceTeamId: m.id,
      };
      if (hit) {
        // Same-named team already here: only overwrite when asked, so an adopt
        // can't silently stamp over staffing the project has already tuned.
        if (!opts.overwriteExisting) continue;
        await tx.simulationTeam.update({ where: { id: hit }, data: values });
        updated++;
      } else {
        await tx.simulationTeam.create({ data: { name: m.name, projectId, ...values } });
        created++;
      }
    }
  });

  return { created, updated, names: masters.map((m) => m.name) };
}
