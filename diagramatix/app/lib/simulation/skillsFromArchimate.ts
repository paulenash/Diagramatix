/**
 * Reading a skills matrix out of an ArchiMate diagram.
 *
 * Business Architects already model this, and they model it in ArchiMate. So the
 * Simulator reads it rather than asking anyone to type it a second time into a
 * bespoke library screen nobody would keep current.
 *
 * ArchiMate 3.x has NO first-class Skill element. Business Role is the
 * conventional stand-in, and it works because assignment runs both ways:
 *
 *   Actor  —assignment→  Role                      the person HOLDS the skill
 *   Role   —assignment→  Business Process/Function  the work REQUIRES the skill
 *
 * A task needing two skills is two Roles assigned to the same process — ordinary
 * ArchiMate, not a hack.
 *
 * ROLES ARE BUNDLES. A Role that AGGREGATES or COMPOSES finer Roles is a bundle
 * of skills; one that aggregates nothing simply IS a skill. So "Senior Assessor"
 * can be defined once as {assess, approve-limits} and assigned to people wholesale.
 *
 * Capability and Resource (strategy layer) are deliberately NOT read: an
 * organisation has a capability, a person does not, so it is the wrong grain for
 * deciding who may take a task.
 *
 * WHAT DOES NOT MATCH IS THE HEADLINE, not a footnote. An actor with no team
 * member of that name, a member with no actor, work with no matching task — every
 * one is reported. Silent non-matching is this feature's failure mode, and the
 * same lesson as the calendar exceptions: the arithmetic was never the risk.
 *
 * Pure — no DB, no React, safe for a client component.
 */

import type { DiagramData } from "@/app/lib/diagram/types";

/** Business-layer behaviour a Role can be assigned to — i.e. "the work". */
const WORK_TYPES = new Set([
  "business-process", "business-function", "business-interaction", "business-service",
]);

const ACTOR_TYPES = new Set(["business-actor"]);
const ROLE_TYPES = new Set(["business-role"]);
/** Role → Role, meaning "this role is made up of those". */
const BUNDLE_TYPES = new Set(["archi-aggregation", "archi-composition"]);

/** Labels are matched the way every other cross-model link in the product
 *  matches them: trimmed, internal whitespace collapsed, case-insensitive. */
export const normaliseLabel = (s: string | undefined): string =>
  (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export interface ArchimatePerson {
  /** The actor's label, as drawn. */
  name: string;
  /** Roles assigned directly to them. */
  roles: string[];
  /** Leaf skills, after expanding every role bundle. */
  skills: string[];
}

export interface ArchimateWork {
  /** The Business Process/Function label, as drawn. */
  label: string;
  roles: string[];
  requiredSkills: string[];
}

export interface SkillsModel {
  people: ArchimatePerson[];
  work: ArchimateWork[];
  /** Every leaf skill seen anywhere, sorted. */
  skills: string[];
  /** Things that are almost certainly mistakes in the diagram. */
  warnings: string[];
}

/**
 * Expand a role to its LEAF skills. A role that aggregates nothing is itself a
 * skill; one that aggregates others contributes their leaves instead of itself,
 * so "Senior Assessor" resolves to what it is actually made of.
 *
 * Cycle-safe: an aggregation loop (A contains B contains A) is a modelling
 * mistake that would otherwise hang the walk, so it is broken and reported.
 */
function expandRole(
  roleId: string,
  children: Map<string, string[]>,
  labelOf: Map<string, string>,
  seen: Set<string>,
  cycles: Set<string>,
): string[] {
  if (seen.has(roleId)) { cycles.add(labelOf.get(roleId) ?? roleId); return []; }
  const kids = children.get(roleId) ?? [];
  if (kids.length === 0) {
    const label = labelOf.get(roleId);
    return label ? [label] : [];
  }
  seen.add(roleId);
  const out: string[] = [];
  for (const kid of kids) out.push(...expandRole(kid, children, labelOf, seen, cycles));
  seen.delete(roleId);
  return out;
}

const uniqSorted = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));

/** Read the actors, roles and work out of an ArchiMate diagram. */
export function skillsFromArchimate(data: DiagramData): SkillsModel {
  const elements = data.elements ?? [];
  const connectors = data.connectors ?? [];
  const warnings: string[] = [];

  const labelOf = new Map<string, string>();
  for (const el of elements) labelOf.set(el.id, (el.label ?? "").replace(/\s+/g, " ").trim());

  const typeOf = new Map(elements.map((e) => [e.id, e.type as string]));
  const isActor = (id: string) => ACTOR_TYPES.has(typeOf.get(id) ?? "");
  const isRole = (id: string) => ROLE_TYPES.has(typeOf.get(id) ?? "");
  const isWork = (id: string) => WORK_TYPES.has(typeOf.get(id) ?? "");

  // Role → the roles it is made of.
  const children = new Map<string, string[]>();
  for (const c of connectors) {
    if (!BUNDLE_TYPES.has(c.type as string) || !c.sourceId || !c.targetId) continue;
    if (!isRole(c.sourceId) || !isRole(c.targetId)) continue;
    (children.get(c.sourceId) ?? children.set(c.sourceId, []).get(c.sourceId)!).push(c.targetId);
  }

  const cycles = new Set<string>();
  const skillsOfRole = new Map<string, string[]>();
  for (const el of elements) {
    if (!isRole(el.id)) continue;
    skillsOfRole.set(el.id, uniqSorted(expandRole(el.id, children, labelOf, new Set(), cycles)));
  }
  for (const c of cycles) {
    warnings.push(`The role "${c}" is part of a containment loop, so its skills could not be resolved. Break the loop in the diagram.`);
  }

  // Assignments, in both directions.
  const rolesOfActor = new Map<string, string[]>();
  const rolesOfWork = new Map<string, string[]>();
  let strayAssignments = 0;
  for (const c of connectors) {
    if (c.type !== "archi-assignment" || !c.sourceId || !c.targetId) continue;
    if (isActor(c.sourceId) && isRole(c.targetId)) {
      (rolesOfActor.get(c.sourceId) ?? rolesOfActor.set(c.sourceId, []).get(c.sourceId)!).push(c.targetId);
    } else if (isRole(c.sourceId) && isWork(c.targetId)) {
      (rolesOfWork.get(c.targetId) ?? rolesOfWork.set(c.targetId, []).get(c.targetId)!).push(c.sourceId);
    } else {
      strayAssignments++;
    }
  }
  if (strayAssignments > 0) {
    warnings.push(
      `${strayAssignments} assignment${strayAssignments === 1 ? "" : "s"} ${strayAssignments === 1 ? "was" : "were"} ignored: only ` +
      `actor→role (who holds a skill) and role→process (what work needs it) are read.`,
    );
  }

  const people: ArchimatePerson[] = [];
  for (const el of elements) {
    if (!isActor(el.id)) continue;
    const name = labelOf.get(el.id) ?? "";
    if (!name) continue;
    const roleIds = rolesOfActor.get(el.id) ?? [];
    people.push({
      name,
      roles: uniqSorted(roleIds.map((r) => labelOf.get(r) ?? r)),
      skills: uniqSorted(roleIds.flatMap((r) => skillsOfRole.get(r) ?? [])),
    });
  }

  const work: ArchimateWork[] = [];
  for (const el of elements) {
    if (!isWork(el.id)) continue;
    const label = labelOf.get(el.id) ?? "";
    if (!label) continue;
    const roleIds = rolesOfWork.get(el.id) ?? [];
    if (roleIds.length === 0) continue; // work nobody is assigned to says nothing about skills
    work.push({
      label,
      roles: uniqSorted(roleIds.map((r) => labelOf.get(r) ?? r)),
      requiredSkills: uniqSorted(roleIds.flatMap((r) => skillsOfRole.get(r) ?? [])),
    });
  }

  // The diagram is probably not what the reader thinks it is, in these cases.
  const idle = people.filter((p) => p.skills.length === 0).map((p) => p.name);
  if (idle.length > 0) {
    warnings.push(`No role is assigned to ${idle.join(", ")}, so they hold no skills and can take no restricted work.`);
  }
  const usedRoles = new Set(work.flatMap((w) => w.roles));
  const heldRoles = new Set(people.flatMap((p) => p.roles));
  const unusedRoles = [...heldRoles].filter((r) => !usedRoles.has(r));
  if (unusedRoles.length > 0) {
    warnings.push(`No work requires ${unusedRoles.join(", ")} — held by someone, but nothing in the diagram needs it.`);
  }

  return {
    people: people.sort((a, b) => a.name.localeCompare(b.name)),
    work: work.sort((a, b) => a.label.localeCompare(b.label)),
    skills: uniqSorted([...skillsOfRole.values()].flat()),
    warnings,
  };
}

export interface SkillsMatch {
  /** Team members that matched an actor, with the skills to give them. */
  units: { name: string; skills: string[] }[];
  /** Task label → the skills it requires. */
  taskSkills: Record<string, string[]>;
  /** Actors in the diagram with no team member of that name. */
  unmatchedActors: string[];
  /** Team members with no actor of that name — they get no skills. */
  unmatchedMembers: string[];
  /** ArchiMate work with no task of that name. */
  unmatchedWork: string[];
  warnings: string[];
}

/**
 * Match the ArchiMate model onto what the simulation actually has: named team
 * members and BPMN task labels. By NAME, the same label-matching the Miner uses
 * for activity→team from lanes — a third, different rule would be the wrong kind
 * of clever.
 *
 * `memberNames` comes from the team library, which stays the authority on who is
 * in which team; ArchiMate supplies skills, not org structure.
 */
export function matchSkills(model: SkillsModel, memberNames: string[], taskLabels: string[]): SkillsMatch {
  const byActor = new Map(model.people.map((p) => [normaliseLabel(p.name), p]));
  const byWork = new Map(model.work.map((w) => [normaliseLabel(w.label), w]));

  const units: SkillsMatch["units"] = [];
  const unmatchedMembers: string[] = [];
  const matchedActors = new Set<string>();
  for (const name of memberNames) {
    const hit = byActor.get(normaliseLabel(name));
    if (hit) { units.push({ name, skills: hit.skills }); matchedActors.add(normaliseLabel(hit.name)); }
    else unmatchedMembers.push(name);
  }

  const taskSkills: Record<string, string[]> = {};
  const unmatchedWork: string[] = [];
  const matchedWork = new Set<string>();
  for (const label of taskLabels) {
    const hit = byWork.get(normaliseLabel(label));
    if (hit && hit.requiredSkills.length > 0) {
      taskSkills[label] = hit.requiredSkills;
      matchedWork.add(normaliseLabel(hit.label));
    }
  }
  for (const w of model.work) {
    if (!matchedWork.has(normaliseLabel(w.label))) unmatchedWork.push(w.label);
  }

  const unmatchedActors = model.people.filter((p) => !matchedActors.has(normaliseLabel(p.name))).map((p) => p.name);

  // Carry the model's own warnings through, then add the matching ones. A fill
  // that quietly matched nothing is the failure this reports.
  const warnings = [...model.warnings];
  if (units.length === 0 && memberNames.length > 0) {
    warnings.push("No team member matched an actor in the diagram — check that the names are the same in both.");
  }
  if (Object.keys(taskSkills).length === 0 && model.work.length > 0) {
    warnings.push("No task matched work in the diagram, so no task gained a skill requirement. Check the labels match.");
  }

  return { units, taskSkills, unmatchedActors, unmatchedMembers, unmatchedWork, warnings };
}
