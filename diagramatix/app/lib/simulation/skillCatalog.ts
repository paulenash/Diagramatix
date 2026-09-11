/**
 * The master Skills list — one vocabulary per org.
 *
 * Before this, a skill was whatever string somebody typed. A team member's
 * `skills[]` and a task's `requiredSkills[]` are both free text matched by exact
 * string, so "Compliance Accreditation" and "Compliance accreditation" were two
 * different skills and nothing anywhere said so: the task simply never started,
 * and the readiness check could only report that nobody held it — not that it
 * was a typo one character wide.
 *
 * **Skills are referenced BY NAME, not by id.** The catalog constrains what can
 * be CHOSEN; it deliberately does not become a foreign key. `members[].skills`
 * and `requiredSkills` stay string arrays, so BPSim export/import, the ArchiMate
 * label match and every diagram already saved keep working untouched. The price
 * is that a rename has to be applied to the models that use it, which
 * `renameSkill` does explicitly rather than by cascade.
 *
 * Retired, never deleted by default: a skill already written onto a person or a
 * task must keep RESOLVING, or an existing model would quietly lose a constraint
 * and start reporting better numbers than the process can achieve.
 */
import { prisma } from "@/app/lib/db";

export interface SkillRow {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  active: boolean;
  sortOrder: number;
}

/** Case- and space-insensitive identity. Two skills that differ only in these
 *  are the same skill, and treating them as two is the bug this catalog fixes. */
export const normaliseSkill = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The catalog for an org, ordered for a picker. */
export async function listSkills(orgId: string, opts?: { includeInactive?: boolean }): Promise<SkillRow[]> {
  return prisma.skill.findMany({
    where: { orgId, ...(opts?.includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, category: true, description: true, active: true, sortOrder: true },
  });
}

export type SaveResult = { ok: true; skill: SkillRow } | { ok: false; error: string };

/** Add a skill, or report why not. */
export async function createSkill(orgId: string, input: { name: string; category?: string | null; description?: string | null }): Promise<SaveResult> {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "A skill needs a name." };
  if (name.length > 120) return { ok: false, error: "That name is too long (120 characters max)." };

  // Checked here rather than left to the unique index, because the index is
  // case-SENSITIVE and the whole point is that case is not a distinction.
  const clash = (await listSkills(orgId, { includeInactive: true }))
    .find((s) => normaliseSkill(s.name) === normaliseSkill(name));
  if (clash) {
    return { ok: false, error: clash.active
      ? `"${clash.name}" is already in the list.`
      : `"${clash.name}" already exists but is retired — reactivate it rather than adding a second one.` };
  }

  const skill = await prisma.skill.create({
    data: { orgId, name, category: input.category?.trim() || null, description: input.description?.trim() || null },
    select: { id: true, name: true, category: true, description: true, active: true, sortOrder: true },
  });
  return { ok: true, skill };
}

/** Edit a skill's description/category/order/active flag. NOT its name — see
 *  `renameSkill`, which has to touch the models that reference it. */
export async function updateSkill(orgId: string, id: string, patch: {
  category?: string | null; description?: string | null; active?: boolean; sortOrder?: number;
}): Promise<SaveResult> {
  const existing = await prisma.skill.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!existing) return { ok: false, error: "That skill is not in this organisation's list." };
  const skill = await prisma.skill.update({
    where: { id },
    data: {
      ...(patch.category !== undefined ? { category: patch.category?.trim() || null } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
    select: { id: true, name: true, category: true, description: true, active: true, sortOrder: true },
  });
  return { ok: true, skill };
}

/**
 * Delete a skill outright.
 *
 * Separate from retiring, and the caller has to mean it: deleting one that is in
 * use leaves a team member holding a skill the catalog does not know, and a task
 * requiring one nobody can be shown to hold. Retiring is almost always what was
 * wanted, so the count of uses comes back with the refusal.
 */
export async function deleteSkill(orgId: string, id: string, force = false): Promise<{ ok: true } | { ok: false; error: string; inUse?: number }> {
  const skill = await prisma.skill.findFirst({ where: { id, orgId }, select: { id: true, name: true } });
  if (!skill) return { ok: false, error: "That skill is not in this organisation's list." };

  if (!force) {
    const uses = await countSkillUses(orgId, skill.name);
    if (uses > 0) {
      return { ok: false, inUse: uses, error: `"${skill.name}" is used ${uses} time${uses === 1 ? "" : "s"} by people or tasks. Retire it instead, or delete it anyway to leave those references unresolved.` };
    }
  }
  await prisma.skill.delete({ where: { id } });
  return { ok: true };
}

/**
 * How many places name this skill — team members plus task requirements.
 *
 * Counted rather than merely detected, because "is it used?" and "how badly
 * would deleting it hurt?" are different questions and only the second one
 * helps somebody decide.
 */
export async function countSkillUses(orgId: string, name: string): Promise<number> {
  const want = normaliseSkill(name);
  let uses = 0;

  const teams = await prisma.simulationTeam.findMany({ where: { orgId }, select: { members: true } });
  for (const t of teams) {
    for (const m of (t.members as unknown as { skills?: string[] }[] | null) ?? []) {
      if ((m?.skills ?? []).some((s) => normaliseSkill(s) === want)) uses++;
    }
  }

  const diagrams = await prisma.diagram.findMany({ where: { orgId, type: "bpmn" }, select: { data: true } });
  for (const d of diagrams) {
    const data = (d.data ?? {}) as unknown as { elements?: { properties?: { sim?: { requiredSkills?: string[] } } }[] };
    for (const el of data.elements ?? []) {
      if ((el.properties?.sim?.requiredSkills ?? []).some((s) => normaliseSkill(s) === want)) uses++;
    }
  }
  return uses;
}

/**
 * Skill names used by people or tasks that are NOT in the catalog.
 *
 * The catalog arrived after the data, so every existing model holds free text
 * that predates it. This is what lets the maintenance screen offer "adopt these"
 * rather than silently presenting a vocabulary that half the models do not use.
 */
export async function orphanSkillNames(orgId: string): Promise<string[]> {
  const known = new Set((await listSkills(orgId, { includeInactive: true })).map((s) => normaliseSkill(s.name)));
  const found = new Map<string, string>(); // normalised → first spelling seen

  const teams = await prisma.simulationTeam.findMany({ where: { orgId }, select: { members: true } });
  for (const t of teams) {
    for (const m of (t.members as unknown as { skills?: string[] }[] | null) ?? []) {
      for (const s of m?.skills ?? []) if (s?.trim()) found.set(normaliseSkill(s), s.trim());
    }
  }
  const diagrams = await prisma.diagram.findMany({ where: { orgId, type: "bpmn" }, select: { data: true } });
  for (const d of diagrams) {
    const data = (d.data ?? {}) as unknown as { elements?: { properties?: { sim?: { requiredSkills?: string[] } } }[] };
    for (const el of data.elements ?? []) {
      for (const s of el.properties?.sim?.requiredSkills ?? []) if (s?.trim()) found.set(normaliseSkill(s), s.trim());
    }
  }

  return [...found.entries()].filter(([k]) => !known.has(k)).map(([, v]) => v).sort();
}
