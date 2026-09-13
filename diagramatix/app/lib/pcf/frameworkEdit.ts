/**
 * What an edit to an APQC framework's identity may change, and how.
 *
 * Paul, 2026-09-14: "Allow the whole APQC Framework Name to be edited and saved
 * not just the Name. Include the Version number as well." Until then `name` was
 * the only field the route accepted, and it silently wrote the same string to
 * `variant` — which is the part every picker actually shows (`variant vversion`).
 * The three are separate now, and each is written only when it is sent.
 *
 * Pure, so the route's rule is testable without a session: the route decides WHO
 * may edit (tailored → the org's Owner/Admin; reference → SuperAdmin only) and
 * this decides WHAT the body is allowed to say.
 *
 * One consequence of an editable version, stated rather than hidden: the import
 * de-duplicates on { familyKey, version, kind, orgId }. Change "8.0" to "8.1" and
 * a later re-import of the 8.0 workbook lands as a SECOND framework instead of
 * being skipped. Upgrade pairing keys on familyKey, not version, so that is
 * unaffected.
 */

export interface FrameworkPatch {
  name?: string;
  variant?: string;
  version?: string;
  division?: string | null;
}

export type FrameworkPatchResult =
  | { ok: true; data: FrameworkPatch }
  | { ok: false; error: string };

const LIMITS = { name: 200, variant: 120, version: 40 } as const;

const trimmed = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

/**
 * Map a request body to the fields to write.
 *
 *   • name / variant / version: written when sent; a field that is sent but
 *     blank is refused, since each is shown somewhere and none may be empty.
 *   • division: tailored frameworks only; blank clears it (it is optional).
 *   • nothing usable → refused, so an empty PATCH is not a silent no-op.
 */
export function frameworkPatchData(body: unknown, opts: { isTailored: boolean }): FrameworkPatchResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data: FrameworkPatch = {};
  for (const key of ["name", "variant", "version"] as const) {
    if (b[key] === undefined) continue;
    const v = trimmed(b[key], LIMITS[key]);
    if (v === undefined) return { ok: false, error: `${key} cannot be blank` };
    data[key] = v;
  }
  if (opts.isTailored && b.division !== undefined) {
    data.division = typeof b.division === "string" && b.division.trim() ? b.division.trim() : null;
  }
  if (Object.keys(data).length === 0) return { ok: false, error: "Nothing to update" };
  return { ok: true, data };
}
