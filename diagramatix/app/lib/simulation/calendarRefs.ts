/**
 * Re-point a diagram's SOURCE operating-hours calendars after a copy.
 *
 * A start/intermediate event stores its working calendar as a bare reference in
 * `properties.sim.calendarId`, resolved at run time against the project's
 * calendars. Adopting, importing or restoring a project mints NEW calendar rows
 * with new ids, and nothing rewrote that reference — so it dangled, and because
 * an unresolved calendar is treated as ALWAYS OPEN, arrivals that were confined
 * to business hours silently became 24/7 in the copy. Same model on the face of
 * it, quietly different answers.
 *
 * Team calendars never had this problem: a team references its calendar by NAME
 * through the package, and the library replay relinks it. This does the same for
 * sources, resolving a reference by name first and falling back to the captured
 * original id, so it works both for a package (whose diagram data we rewrite to
 * names at capture) and for a scoped-backup restore (whose diagrams come from
 * raw rows still holding the original ids).
 */

import type { DiagramData } from "@/app/lib/diagram/types";

/** Resolve a stored calendar reference to the id it should now point at.
 *  Return undefined to leave the reference alone. */
export type CalendarResolver = (ref: string) => string | undefined;

/** Build a resolver from the two things a copy knows: the new calendars by name,
 *  and (when the package recorded them) their original ids. */
export function calendarResolver(
  nameToId: Map<string, string>,
  oldIdToNewId?: Map<string, string>,
): CalendarResolver {
  return (ref: string) => nameToId.get(ref) ?? oldIdToNewId?.get(ref);
}

/**
 * Rewrite every `sim.calendarId` in `data` through `resolve`. Returns the data
 * unchanged (same object) when nothing referenced a calendar, so callers can
 * skip a write.
 */
export function remapCalendarRefs(
  data: DiagramData,
  resolve: CalendarResolver,
): { data: DiagramData; changed: number } {
  let changed = 0;
  const elements = data.elements.map((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = (el.properties as any)?.sim;
    const ref = sim?.calendarId;
    if (typeof ref !== "string" || !ref) return el;
    const next = resolve(ref);
    if (!next || next === ref) return el;
    changed++;
    return { ...el, properties: { ...el.properties, sim: { ...sim, calendarId: next } } };
  });
  return changed ? { data: { ...data, elements }, changed } : { data, changed: 0 };
}

/**
 * Capture-side counterpart: rewrite `sim.calendarId` from a project calendar id
 * to that calendar's NAME, so the package is self-describing and portable rather
 * than carrying ids that mean nothing outside the source project.
 */
export function calendarRefsToNames(
  data: DiagramData,
  idToName: Map<string, string>,
): DiagramData {
  return remapCalendarRefs(data, (ref) => idToName.get(ref)).data;
}
