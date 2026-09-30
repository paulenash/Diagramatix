/**
 * PER-USER overrides — a SuperAdmin changes the features, limits and settings of
 * ONE person without touching the subscription level they are on (so nobody else
 * on that plan is affected), and can revert them to exactly what the level gives.
 *
 * This is IN ADDITION to the comp grant (Grant comp / Revoke comp): a comp moves a
 * person onto another whole plan for a while; overrides change individual values on
 * whatever plan applies. They combine, and each is reverted by its own button.
 *
 * STORAGE (User.limitOverrides / User.featureOverrides / overrideNote / overridesExpireAt):
 *   limitOverrides   { <SubscriptionLevel field>: { v, base } }   v = the override (null = unlimited),
 *                                                                base = what the plan gave WHEN IT WAS SET
 *   featureOverrides { <feature key>: { s, base } | "available"|"disabled"|"hidden" }
 *                                                                a bare string is the older form: always applies
 *
 * THE RULE ("survives a plan change, if it is not already covered by the upgrade"):
 *   • An override that RAISES access above the plan it was set on (a GRANT — v > base) applies only
 *     while the current plan gives less. Once the plan gives at least as much, the plan's value is used
 *     and the override is "covered" (kept on file, shown as covered, doing nothing).
 *   • An override that LOWERS access (a RESTRICTION — v <= base) always applies: it was deliberate.
 *   • Switches (the "reset monthly" flags) always apply.
 *   • Everything stops applying at overridesExpireAt (it reverts by itself, like a comp).
 *
 * Pure: the merge is tested on its own; the resolvers call it.
 */

export type LimitValue = number | boolean | null;
export type LimitOverride = { v: LimitValue; base: LimitValue };
export type LimitOverrides = Record<string, LimitOverride>;

export interface LimitField { key: string; label: string; kind: "count" | "switch" }

/** Every per-plan limit / setting that can be overridden per person, in the order the panel shows them. */
export const LIMIT_FIELDS: readonly LimitField[] = [
  { key: "maxProjects", label: "Projects", kind: "count" },
  { key: "maxDiagramsPerTypePerProject", label: "Diagrams per type per project", kind: "count" },
  { key: "maxArchimateDiagramsTotal", label: "ArchiMate diagrams (total)", kind: "count" },
  { key: "maxBpmnElementsPerDiagram", label: "Elements per BPMN diagram", kind: "count" },
  { key: "maxNonBpmnElementsPerDiagram", label: "Elements per non-BPMN diagram", kind: "count" },
  { key: "maxAiAttempts", label: "AI Generate attempts", kind: "count" },
  { key: "aiAttemptsResetMonthly", label: "AI attempts reset monthly", kind: "switch" },
  { key: "maxIndividualExports", label: "Individual exports", kind: "count" },
  { key: "individualExportsResetMonthly", label: "Individual exports reset monthly", kind: "switch" },
  { key: "maxIndividualImports", label: "Individual imports", kind: "count" },
  { key: "individualImportsResetMonthly", label: "Individual imports reset monthly", kind: "switch" },
  { key: "maxBulkExports", label: "Bulk exports", kind: "count" },
  { key: "maxBulkImports", label: "Bulk imports", kind: "count" },
  { key: "trialDays", label: "Trial days (blank = no expiry)", kind: "count" },
];
export const LIMIT_KEYS: readonly string[] = LIMIT_FIELDS.map((f) => f.key);
const KIND: Record<string, LimitField["kind"]> = Object.fromEntries(LIMIT_FIELDS.map((f) => [f.key, f.kind]));

export type FState = "available" | "disabled" | "hidden";
export type FeatureOverrideEntry = { s: FState; base: FState };
export type FeatureOverrides = Record<string, FeatureOverrideEntry | FState>;

const FRANK: Record<FState, number> = { hidden: 0, disabled: 1, available: 2 };
const isState = (x: unknown): x is FState => x === "available" || x === "disabled" || x === "hidden";

/** True once the overrides' expiry has passed (they then stop applying). */
export function overridesExpired(expiresAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

// ── limits ───────────────────────────────────────────────────────────────────

/** null = unlimited, which compares as the largest number. */
const num = (v: LimitValue): number => (v === null ? Infinity : typeof v === "number" ? v : v ? 1 : 0);

export interface LimitRow {
  key: string;
  label: string;
  kind: "count" | "switch";
  plan: LimitValue;
  /** The override as set, or undefined when the person is on the plan's value. */
  override: LimitValue | undefined;
  effective: LimitValue;
  /** An override exists (whether or not it is doing anything). */
  custom: boolean;
  /** A grant the plan now covers: kept, shown, doing nothing. */
  covered: boolean;
}

export function limitRow(field: LimitField, plan: LimitValue, ov: LimitOverride | undefined, expired: boolean): LimitRow {
  const base = { key: field.key, label: field.label, kind: field.kind, plan };
  if (!ov || expired) return { ...base, override: ov ? ov.v : undefined, effective: plan, custom: !!ov, covered: false };
  if (field.kind === "switch") return { ...base, override: ov.v, effective: ov.v, custom: true, covered: false };
  const grant = num(ov.v) > num(ov.base);
  const covered = grant && num(plan) >= num(ov.v);
  return { ...base, override: ov.v, effective: covered ? plan : ov.v, custom: true, covered };
}

/** A copy of a plan row with the person's limit overrides applied (unknown keys ignored). */
export function applyLimitOverrides<T extends Record<string, unknown>>(
  planRow: T, overrides: unknown, expiresAt?: Date | string | null, now: Date = new Date(),
): T {
  if (!overrides || typeof overrides !== "object") return planRow;
  const expired = overridesExpired(expiresAt, now);
  if (expired) return planRow;
  const out: Record<string, unknown> = { ...planRow };
  let changed = false;
  for (const f of LIMIT_FIELDS) {
    const ov = (overrides as LimitOverrides)[f.key];
    if (!ov || typeof ov !== "object" || !("v" in ov)) continue;
    const row = limitRow(f, (planRow[f.key] as LimitValue) ?? null, ov, false);
    if (row.effective !== planRow[f.key]) { out[f.key] = row.effective; changed = true; }
  }
  return (changed ? out : planRow) as T;
}

export function describeLimits(planRow: Record<string, unknown>, overrides: unknown, expiresAt?: Date | string | null, now: Date = new Date()): LimitRow[] {
  const expired = overridesExpired(expiresAt, now);
  const ovs = (overrides && typeof overrides === "object" ? overrides : {}) as LimitOverrides;
  return LIMIT_FIELDS.map((f) => limitRow(f, (planRow[f.key] as LimitValue) ?? null, ovs[f.key], expired));
}

// ── features ─────────────────────────────────────────────────────────────────

export interface FeatureRow {
  key: string;
  plan: FState;
  override: FState | undefined;
  effective: FState;
  custom: boolean;
  covered: boolean;
}

/** The state a feature override gives, given the plan's own state. */
export function featureRow(key: string, plan: FState, raw: unknown, expired: boolean): FeatureRow {
  const s = typeof raw === "string" ? (isState(raw) ? raw : undefined)
    : raw && typeof raw === "object" && isState((raw as FeatureOverrideEntry).s) ? (raw as FeatureOverrideEntry).s : undefined;
  if (!s) return { key, plan, override: undefined, effective: plan, custom: false, covered: false };
  if (expired) return { key, plan, override: s, effective: plan, custom: true, covered: false };
  const base = raw && typeof raw === "object" && isState((raw as FeatureOverrideEntry).base) ? (raw as FeatureOverrideEntry).base : null;
  // The older bare-string form has no recorded base: always applies.
  const grant = base !== null && FRANK[s] > FRANK[base];
  const covered = grant && FRANK[plan] >= FRANK[s];
  return { key, plan, override: s, effective: covered ? plan : s, custom: true, covered };
}

/** The feature-state map with the person's overrides applied (before prerequisites). Unknown keys ignored. */
export function applyFeatureOverrides<M extends Record<string, string>>(
  map: M, overrides: unknown, expiresAt?: Date | string | null, now: Date = new Date(),
): M {
  if (!overrides || typeof overrides !== "object") return map;
  const expired = overridesExpired(expiresAt, now);
  const out: Record<string, string> = { ...map };
  for (const [k, raw] of Object.entries(overrides as Record<string, unknown>)) {
    if (!(k in map)) continue;
    out[k] = featureRow(k, (isState(map[k]) ? map[k] : "hidden") as FState, raw, expired).effective;
  }
  return out as M;
}

/** The state a stored override entry means, whatever its form (for callers that only need the value). */
export function overrideValue(raw: unknown): FState | undefined {
  if (isState(raw)) return raw;
  if (raw && typeof raw === "object" && isState((raw as FeatureOverrideEntry).s)) return (raw as FeatureOverrideEntry).s;
  return undefined;
}

export function describeFeatures(planMap: Record<string, string>, overrides: unknown, keys: readonly string[], expiresAt?: Date | string | null, now: Date = new Date()): FeatureRow[] {
  const expired = overridesExpired(expiresAt, now);
  const ovs = (overrides && typeof overrides === "object" ? overrides : {}) as Record<string, unknown>;
  return keys.map((k) => featureRow(k, (isState(planMap[k]) ? planMap[k] : "available") as FState, ovs[k], expired));
}

// ── editing ─────────────────────────────────────────────────────────────────

export function isLimitKey(k: string): boolean { return LIMIT_KEYS.includes(k); }
export function limitKind(k: string): "count" | "switch" | undefined { return KIND[k]; }

/** A value the panel or API may send for a limit: whole number >= 0, null (unlimited), or a boolean for a switch. */
export function coerceLimitValue(key: string, raw: unknown): { ok: true; value: LimitValue } | { ok: false; error: string } {
  const kind = KIND[key];
  if (!kind) return { ok: false, error: `Unknown limit "${key}"` };
  if (kind === "switch") return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false, error: `${key} must be true or false` };
  if (raw === null) return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 0 ? { ok: true, value: n } : { ok: false, error: `${key} must be a whole number of 0 or more, or blank for unlimited` };
}

/** True when the person has any override at all (for the "custom" badge). */
export function hasAnyOverride(limitOverrides: unknown, featureOverrides: unknown): boolean {
  const some = (o: unknown) => !!o && typeof o === "object" && Object.keys(o as object).length > 0;
  return some(limitOverrides) || some(featureOverrides);
}
