/**
 * EXAMPLES-ONLY plans (Paul, 2026-10-06).
 *
 * Free and Introductory users may open the Simulator Examples and Process Mining Examples galleries, but:
 *   • only the FIRST N examples of each set can be adopted (Free 1, Introductory 3) — the rest are shown, greyed out;
 *   • the Simulator can be entered only on an adopted simulation example, and Process Mining only on an adopted
 *     mining example — never from the user's own diagrams or projects.
 *
 * Every other plan is unrestricted. A SuperAdmin is unrestricted too, unless acting as a level (then that level's
 * rule bites, like its limits).
 *
 * This is the SINGLE place the rule lives (the galleries, the editor, the Project screen and the API gates all read it).
 * The level table is a constant; if it should become editable it moves to the subscription editor.
 */
import { prisma } from "@/app/lib/db";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { resolveEffectiveLevelId } from "./effectiveLevel";
import { currentActAsLevel } from "./actAs";

export interface ExampleAccess {
  /** The simulator / process mining may be entered only on an adopted example project. */
  examplesOnly: boolean;
  /** How many examples of each set may be adopted, in catalog order; null = all. */
  allowed: number | null;
}

export const EXAMPLES_ONLY_LEVELS: Readonly<Record<string, number>> = { free: 1, introductory: 3 };
export const UNRESTRICTED: ExampleAccess = { examplesOnly: false, allowed: null };

/** Pure. */
export function exampleAccessForLevel(levelId: string | null | undefined): ExampleAccess {
  const n = levelId ? EXAMPLES_ONLY_LEVELS[levelId] : undefined;
  return n === undefined ? UNRESTRICTED : { examplesOnly: true, allowed: n };
}

/** Pure. Is the example at this 0-based catalog position out of reach? */
export function isExampleLocked(access: ExampleAccess, index: number): boolean {
  return access.allowed !== null && index >= access.allowed;
}

/** Which kind of adopted project a gated feature may be entered on. */
export const EXAMPLE_TYPE_FOR_FEATURE: Readonly<Record<string, string>> = { simulator: "simulation", processMining: "mining" };

/** Pure. May `feature` be entered on a project of this exampleType? */
export function mayEnterOnProject(access: ExampleAccess, feature: string, projectExampleType: string | null | undefined): boolean {
  if (!access.examplesOnly) return true;
  const need = EXAMPLE_TYPE_FOR_FEATURE[feature];
  return !need || projectExampleType === need;
}

function isAdminEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").toLowerCase();
  return [...SUPERUSER_EMAILS].some((s) => s.toLowerCase() === e);
}

/** The rule for this user, now. */
export async function getExampleAccess(userId: string): Promise<ExampleAccess> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!u) return UNRESTRICTED;
  if (isAdminEmail(u.email)) {
    const acting = await currentActAsLevel();
    return acting ? exampleAccessForLevel(acting) : UNRESTRICTED;
  }
  return exampleAccessForLevel(await resolveEffectiveLevelId(userId));
}

/** The catalog order the galleries and the adopt gates share. */
export const EXAMPLE_ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }];

/** Is this published example out of reach for this user? (The adopt routes call it; the galleries show it greyed.) */
export async function isExampleLockedFor(userId: string, kind: "simulation" | "mining", exampleId: string): Promise<boolean> {
  const access = await getExampleAccess(userId);
  if (access.allowed === null) return false;
  const rows = kind === "simulation"
    ? await prisma.simulationExample.findMany({ where: { published: true }, orderBy: EXAMPLE_ORDER, select: { id: true } })
    : await prisma.miningExample.findMany({ where: { published: true }, orderBy: EXAMPLE_ORDER, select: { id: true } });
  const idx = rows.findIndex((r) => r.id === exampleId);
  return idx >= 0 && isExampleLocked(access, idx);
}
