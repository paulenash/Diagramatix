/**
 * The subscription's element cap, in ONE place (mobile voice stage 5,
 * 2026-09-29): the desktop editor and the phone's Voice Assist both refuse an
 * add past it. Artifacts (data objects, data stores, text annotations) do not
 * count, so they are always let through.
 */
export const ARTIFACT_TYPES_GATED: ReadonlySet<string> = new Set(["data-object", "data-store", "text-annotation"]);

/** Why an add of `symbolType` must be refused, or null when it may go ahead. */
export function elementLimitBlock(
  elements: readonly { type: string }[],
  limit: number | null | undefined,
  symbolType: string,
): string | null {
  if (typeof limit !== "number" || ARTIFACT_TYPES_GATED.has(symbolType)) return null;
  const nodes = elements.filter((e) => !ARTIFACT_TYPES_GATED.has(e.type)).length;
  return nodes >= limit ? `Element limit reached (${nodes}/${limit}). Upgrade your subscription to add more.` : null;
}
