/**
 * APQC PCF attribution (licence compliance). APQC's PCF is licensed royalty-free
 * to use / copy / modify / redistribute — including inside this paid SaaS and in
 * derivative (tailored) frameworks — PROVIDED every copy and derivative carries a
 * copy of APQC's notice. So any artefact that leaves the app carrying PCF-derived
 * content (a classification code/name, or an element tagged with a pcfId) must
 * include this notice. Keep this text verbatim.
 */
export const APQC_ATTRIBUTION =
  "©2026 APQC. ALL RIGHTS RESERVED. This Process Classification Framework® (“PCF”) is the copyrighted " +
  "intellectual property of APQC. APQC hereby grants you a perpetual, worldwide, royalty-free license to use, copy, " +
  "publish, modify, and create derivative works of the PCF, provided that all copies of the PCF and any derivative " +
  "works contain a copy of this notice. Process Classification Framework and PCF are registered trademarks of APQC.";

/** Does a single diagram's data carry PCF-derived content? True if it has a
 *  diagram-level classification, or any element tagged with a pcfId / code. */
export function dataHasPcf(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as { pcf?: unknown; elements?: { properties?: Record<string, unknown> | null }[] };
  if (d.pcf && typeof d.pcf === "object" && Object.keys(d.pcf as object).length > 0) return true;
  return (d.elements ?? []).some((e) => {
    const p = e?.properties;
    return !!p && (p.pcfHierarchyId != null || p.pcfId != null);
  });
}

/** True if any diagram in an export payload carries PCF-derived content. */
export function anyDiagramHasPcf(diagrams: { data?: unknown }[]): boolean {
  return diagrams.some((d) => dataHasPcf(d.data));
}
