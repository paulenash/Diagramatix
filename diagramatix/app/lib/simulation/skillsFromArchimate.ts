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

import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { ARCHI_SHAPE } from "@/app/lib/diagram/genericLayout";

/** Business-layer behaviour a Role can be assigned to — i.e. "the work". */
const WORK_TYPES = new Set([
  "business-process", "business-function", "business-interaction", "business-service",
]);

const ACTOR_TYPES = new Set(["business-actor"]);
const ROLE_TYPES = new Set(["business-role"]);
/** Skills, under the pattern Paul specified. ArchiMate has no Skill element and
 *  Capability is defined as an ability an actor POSSESSES, which is the fit. */
const CAPABILITY_TYPES = new Set(["strategy-capability"]);
/** A standing team and an ad-hoc one. Paul's distinction: an Actor is an
 *  organisational team, a Collaboration is a group assembled to do something. */
const TEAM_TYPES = new Set(["business-actor", "business-collaboration"]);
/** "has skill" is an Association — ArchiMate has no relationship meaning
 *  "possesses a capability", and the research on competency modelling
 *  recommends the general Association for exactly this. */
const ASSOCIATION_TYPES = new Set(["archi-association", "archi-association-directed"]);
/** Role → Role, meaning "this role is made up of those". */
const BUNDLE_TYPES = new Set(["archi-aggregation", "archi-composition"]);

/**
 * The ArchiMate concept an element actually is.
 *
 * A diagram drawn in the editor stores EVERY ArchiMate element under the single
 * type "archimate-shape", with the concept in `properties.shapeKey`
 * ("business-business-actor-box"). Matching on `el.type` therefore matched
 * nothing on a real diagram: this reader worked only against synthetic fixtures,
 * and a fill from an actual operating model returned zero actors and zero skills
 * while reporting — correctly, and uselessly — that nothing had matched.
 *
 * The map is inverted from ARCHI_SHAPE so the two cannot drift, and the
 * -box/-icon suffix is dropped because one concept has both forms (a Business
 * Role is drawn icon-first, an Actor box-first, and either can be switched). A
 * bare concept type is still accepted, for models that carry one.
 */
const SHAPE_KEY_TO_TYPE: Map<string, string> = new Map(
  Object.entries(ARCHI_SHAPE).map(([type, def]) => [def.key.replace(/-(box|icon)$/, ""), type]),
);

export function archimateTypeOf(el: Pick<DiagramElement, "type" | "properties">): string {
  if (el.type !== "archimate-shape") return el.type;
  const key = (el.properties as { shapeKey?: unknown } | undefined)?.shapeKey;
  if (typeof key !== "string") return el.type;
  return SHAPE_KEY_TO_TYPE.get(key.replace(/-(box|icon)$/, "")) ?? el.type;
}

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

/**
 * Which of the two readings produced this model.
 *
 * "capability" is the pattern Paul specified (2026-09-11): a person is a
 * Business Actor, a skill is a Capability joined by Association, and a Business
 * Role is the person's JOB rather than a competency.
 *
 * "role-legacy" is what this reader did first, where a Business Role stood in
 * for a skill. Models drawn that way still work — a customer's operating model
 * is not ours to invalidate — but which reading was used has to be SAID, or a
 * diagram drawn half in each silently yields whichever half the code preferred.
 */
export type SkillsPattern = "capability" | "role-legacy" | "none";

/** A team, and the people aggregated into it. */
export interface ArchimateTeam { name: string; members: string[] }

export interface SkillsModel {
  people: ArchimatePerson[];
  work: ArchimateWork[];
  /** Every leaf skill seen anywhere, sorted. */
  skills: string[];
  /** Things that are almost certainly mistakes in the diagram. */
  warnings: string[];
  /** How the diagram was read — see SkillsPattern. */
  pattern: SkillsPattern;
  /** Teams, when the diagram models them (capability pattern only). */
  teams: ArchimateTeam[];
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
/**
 * Read a skills matrix out of an ArchiMate diagram.
 *
 * TWO PATTERNS, tried in order, and the model SAYS which one answered.
 *
 * The capability pattern is the specification (Paul, 2026-09-11). The
 * role-legacy reading is what this did first, where a Business Role stood in
 * for a skill — customers have models drawn that way and a customer's
 * operating model is not ours to invalidate on an upgrade.
 *
 * Preferring the new one is not a guess: readCapabilityPattern returns null
 * unless a person is actually associated with a capability, so a legacy
 * diagram cannot be misread as an empty capability model.
 */
export function skillsFromArchimate(data: DiagramData): SkillsModel {
  const viaCapability = readCapabilityPattern(data);
  if (viaCapability) return viaCapability;
  return skillsFromArchimateLegacy(data);
}

/** The original reading: Business Role AS a skill. See skillsFromArchimate. */
function skillsFromArchimateLegacy(data: DiagramData): SkillsModel {
  const elements = data.elements ?? [];
  const connectors = data.connectors ?? [];
  const warnings: string[] = [];

  const labelOf = new Map<string, string>();
  for (const el of elements) labelOf.set(el.id, (el.label ?? "").replace(/\s+/g, " ").trim());

  const typeOf = new Map(elements.map((e) => [e.id, archimateTypeOf(e)]));
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
    pattern: people.length || work.length ? "role-legacy" : "none",
    teams: [],
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

// ═══════════════════════════════════════════════════════════════════════════
// The CAPABILITY pattern — Paul's specification, 2026-09-11.
//
//   Team       Business Actor            "Data & AI Team"
//   Person     Business Actor            "Jane Smith"        Team ◇— Person
//   Job        Business Role             "Data Architect"    Person —▶ Role
//   Skill      Capability                "Data Modelling"    Person —— Capability
//
// Three things this gets right that the Role-as-skill reading did not:
//
//  1. A ROLE IS A JOB, NOT A COMPETENCY. "Do not use a Business Role to mean a
//     particular employee" — and equally, a role is not a skill. Jane is
//     assigned Enterprise Architect AND Review Board Member; neither is
//     something she can DO, they are positions she holds. Roles are recorded
//     here but never contribute skills.
//  2. TEAMS ARE MODELLED, not inferred from a name match against the Team
//     library. Aggregation rather than composition: a person exists
//     independently of a team and may belong to several.
//  3. CAPABILITY IS THE ARCHIMATE-SANCTIONED FIT. There is no Skill element;
//     Capability is defined as an ability an active structure element
//     possesses.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Individual skill vs organisational capability — Paul's stereotype convention,
 * since both are Capability elements and only one of them is something a PERSON
 * has.
 *
 * TOLERANT BY DESIGN. A model that stereotypes nothing is the common case, and
 * demanding the marker would make such a model yield zero skills while looking
 * perfectly correct. So: if ANY capability is marked as an individual skill,
 * only the marked ones count (the author has clearly opted in); if none is,
 * every capability counts except one explicitly marked as organisational. The
 * report says which rule applied.
 */
const INDIVIDUAL_SKILL_RE = /individual\s*skill|personal\s*skill|competenc/i;
const ORG_CAPABILITY_RE = /business\s*capabilit|organisational\s*capabilit|organizational\s*capabilit/i;

const stereotypeOf = (el: Pick<DiagramElement, "properties">): string =>
  String((el.properties as { stereotype?: unknown } | undefined)?.stereotype ?? "");

/**
 * Read the capability pattern. Returns null when the diagram plainly is not
 * drawn this way — no person is associated with any capability — so the caller
 * can fall back rather than report an empty model as a successful read.
 */
function readCapabilityPattern(data: DiagramData): SkillsModel | null {
  const elements = data.elements ?? [];
  const connectors = data.connectors ?? [];
  const warnings: string[] = [];

  const labelOf = new Map<string, string>();
  for (const el of elements) labelOf.set(el.id, (el.label ?? "").replace(/\s+/g, " ").trim());
  const typeOf = new Map(elements.map((e) => [e.id, archimateTypeOf(e)]));
  const byId = new Map(elements.map((e) => [e.id, e]));

  const isCapability = (id: string) => CAPABILITY_TYPES.has(typeOf.get(id) ?? "");
  const isActor = (id: string) => ACTOR_TYPES.has(typeOf.get(id) ?? "");
  const isRole = (id: string) => ROLE_TYPES.has(typeOf.get(id) ?? "");
  const isTeamish = (id: string) => TEAM_TYPES.has(typeOf.get(id) ?? "");

  const caps = elements.filter((e) => isCapability(e.id));
  const anyMarked = caps.some((e) => INDIVIDUAL_SKILL_RE.test(stereotypeOf(e)));
  const countsAsSkill = (id: string): boolean => {
    const el = byId.get(id);
    if (!el) return false;
    const st = stereotypeOf(el);
    return anyMarked ? INDIVIDUAL_SKILL_RE.test(st) : !ORG_CAPABILITY_RE.test(st);
  };
  if (anyMarked) {
    const skipped = caps.filter((e) => !INDIVIDUAL_SKILL_RE.test(stereotypeOf(e))).length;
    if (skipped > 0) {
      warnings.push(`${skipped} capability element${skipped === 1 ? "" : "s"} not marked as an individual skill — read as organisational capabilities and skipped.`);
    }
  }

  // A capability that aggregates others contributes their leaves instead of
  // itself, so a bundle resolves to what it is actually made of.
  const capChildren = new Map<string, string[]>();
  for (const c of connectors) {
    if (!BUNDLE_TYPES.has(c.type as string) || !c.sourceId || !c.targetId) continue;
    if (!isCapability(c.sourceId) || !isCapability(c.targetId)) continue;
    const list = capChildren.get(c.sourceId) ?? [];
    list.push(c.targetId);
    capChildren.set(c.sourceId, list);
  }
  const cycles = new Set<string>();
  const leavesOf = (id: string): string[] =>
    expandRole(id, capChildren, labelOf, new Set(), cycles).filter(Boolean);

  // Person —— Capability. An Association carries no direction in meaning, so
  // either end may be the actor; a model drawn the other way round is not wrong.
  const skillsOfPerson = new Map<string, Set<string>>();
  for (const c of connectors) {
    if (!ASSOCIATION_TYPES.has(c.type as string) || !c.sourceId || !c.targetId) continue;
    const pair: [string, string] | null =
      isActor(c.sourceId) && isCapability(c.targetId) ? [c.sourceId, c.targetId] :
      isActor(c.targetId) && isCapability(c.sourceId) ? [c.targetId, c.sourceId] : null;
    if (!pair) continue;
    const [person, cap] = pair;
    if (!countsAsSkill(cap)) continue;
    const set = skillsOfPerson.get(person) ?? new Set<string>();
    for (const leaf of leavesOf(cap)) set.add(leaf);
    skillsOfPerson.set(person, set);
  }

  // Not drawn this way at all — let the caller fall back to the legacy reading.
  if (skillsOfPerson.size === 0) return null;

  // Team ◇— Person.
  const teams: ArchimateTeam[] = [];
  const isMember = new Set<string>();
  for (const c of connectors) {
    if (!BUNDLE_TYPES.has(c.type as string) || !c.sourceId || !c.targetId) continue;
    if (!isTeamish(c.sourceId) || !isActor(c.targetId)) continue;
    isMember.add(c.targetId);
    const name = labelOf.get(c.sourceId) ?? "";
    const member = labelOf.get(c.targetId) ?? "";
    const hit = teams.find((t) => t.name === name);
    if (hit) hit.members.push(member);
    else teams.push({ name, members: [member] });
  }

  // Roles are JOBS. Recorded so a reader can see them; never skills.
  const rolesOfPerson = new Map<string, string[]>();
  for (const c of connectors) {
    if (c.type !== "archi-assignment" || !c.sourceId || !c.targetId) continue;
    if (!isActor(c.sourceId) || !isRole(c.targetId)) continue;
    const list = rolesOfPerson.get(c.sourceId) ?? [];
    list.push(labelOf.get(c.targetId) ?? "");
    rolesOfPerson.set(c.sourceId, list);
  }

  const teamNames = new Set(teams.map((t) => t.name));
  const people: ArchimatePerson[] = [];
  for (const el of elements) {
    if (!isActor(el.id)) continue;
    const skills = uniqSorted([...(skillsOfPerson.get(el.id) ?? [])]);
    // A TEAM IS NEVER A PERSON, whatever it is connected to. Offering it as
    // one would put "Data & AI Team" up for matching against the roster,
    // where it matches nothing and is reported as an unmatched actor — noise
    // that reads as a fault in the model.
    //
    // And a capability hung off a TEAM is an organisational capability by
    // construction: that is the very distinction the stereotypes exist to
    // draw, made here by structure instead, so an unstereotyped model gets it
    // right too.
    if (teamNames.has(labelOf.get(el.id) ?? "")) {
      if (skills.length > 0) {
        const who = labelOf.get(el.id) ?? "";
        warnings.push(`"${who}" aggregates people, so it is a team — the ${skills.length} capabilit${skills.length === 1 ? "y" : "ies"} on it were read as organisational, not as somebody's skill.`);
      }
      continue;
    }
    if (skills.length === 0 && !isMember.has(el.id)) continue;
    people.push({ name: labelOf.get(el.id) ?? "", roles: rolesOfPerson.get(el.id) ?? [], skills });
  }

  for (const cycle of cycles) {
    warnings.push(`Capability "${cycle}" aggregates itself, directly or through others — the loop was broken.`);
  }
  const bare = people.filter((p) => p.skills.length === 0).map((p) => p.name);
  if (bare.length > 0) {
    warnings.push(`${bare.length} on a team but holding no skill: ${bare.slice(0, 4).join(", ")}${bare.length > 4 ? "…" : ""}. They can still take work that requires none.`);
  }

  return {
    people,
    // Task requirements are the USER'S choice from the master Skills list
    // (Paul, step 5), so this pattern deliberately reads none from the diagram.
    work: [],
    skills: uniqSorted(people.flatMap((p) => p.skills)),
    warnings,
    pattern: "capability",
    teams,
  };
}
