/**
 * "Every feature, by plan" — the comparison the public pages show, built from
 * the Feature Availability matrix itself, so editing a cell in the SuperAdmin
 * grid changes what the public sees on the next request (no copy to keep in step).
 *
 * What is SHOWN, per plan (the state a customer would really get, prerequisites
 * applied — Mobile Access is not "included" on a plan that lacks Voice Assist):
 *   included  ✓     the feature is Available
 *   soon      …     Disabled: visible on that plan but not yet usable
 *   no        —     Not Available
 * What is LEFT OUT: features that are switched off on every plan (nothing to
 * compare) and informational entries (a statement about the product, e.g. an
 * audit certificate — showing it as a plan tick would make a claim the FAQ
 * doesn't make).
 *
 * `buildPublicMatrix` is pure; `getPublicMatrix` reads the database.
 */
import { prisma } from "@/app/lib/db";
import { FEATURES, type FeatureDef } from "./registry";
import { FEATURE_GATES, type FeatureGateInfo } from "./gateMap";
import { applyDependencies, type DepState } from "./dependencies";

export type Cell = "included" | "soon" | "no";

export interface PublicMatrix {
  levels: { id: string; name: string }[];
  groups: { category: string; rows: { key: string; label: string; cells: Record<string, Cell> }[] }[];
}

const CELL: Record<DepState, Cell> = { available: "included", disabled: "soon", hidden: "no" };
const VALID = new Set<string>(["available", "disabled", "hidden"]);

export function buildPublicMatrix(
  levels: { id: string; name: string; sortOrder: number }[],
  rows: { levelId: string; featureKey: string; state: string }[],
  defs: readonly FeatureDef[] = FEATURES,
  gates: Record<string, FeatureGateInfo> = FEATURE_GATES,
): PublicMatrix {
  const sorted = [...levels].sort((a, b) => a.sortOrder - b.sortOrder);
  // Per level: every feature fail-open Available unless a row says otherwise (as the app resolves it), then prerequisites.
  const effective: Record<string, Record<string, DepState>> = {};
  for (const l of sorted) {
    const m: Record<string, DepState> = {};
    for (const f of defs) m[f.key] = "available";
    for (const r of rows) if (r.levelId === l.id && m[r.featureKey] !== undefined) m[r.featureKey] = (VALID.has(r.state) ? r.state : "hidden") as DepState;
    effective[l.id] = applyDependencies(m, Object.fromEntries(defs.map((f) => [f.key, f])));
  }

  const byCat = new Map<string, PublicMatrix["groups"][number]["rows"]>();
  for (const f of defs) {
    if (gates[f.key]?.status === "informational") continue;
    const cells: Record<string, Cell> = {};
    for (const l of sorted) cells[l.id] = CELL[effective[l.id][f.key]];
    if (Object.values(cells).every((c) => c === "no")) continue;
    (byCat.get(f.category) ?? byCat.set(f.category, []).get(f.category)!).push({ key: f.key, label: f.label, cells });
  }
  return {
    levels: sorted.map((l) => ({ id: l.id, name: l.name })),
    groups: [...byCat.entries()].map(([category, r]) => ({ category, rows: r })),
  };
}

export async function getPublicMatrix(): Promise<PublicMatrix> {
  const [levels, rows] = await Promise.all([
    prisma.subscriptionLevel.findMany({ select: { id: true, name: true, sortOrder: true } }),
    prisma.featureAvailability.findMany({ select: { levelId: true, featureKey: true, state: true } }),
  ]);
  return buildPublicMatrix(levels, rows);
}

/** The trial length of the plan people start on (Free), from the plan's own row — null when it has none. */
export async function getStartingTrialDays(): Promise<number | null> {
  const free = await prisma.subscriptionLevel.findUnique({ where: { id: "free" }, select: { trialDays: true } });
  return free?.trialDays ?? null;
}
