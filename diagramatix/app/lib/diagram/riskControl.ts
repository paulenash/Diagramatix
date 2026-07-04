/**
 * Per-element Risk & Control annotations, stored in `element.properties.risk`.
 *
 * A step (task/subprocess/gateway/data object) can carry references to Risks and
 * Controls from the project's Risk & Control catalog. We store a lightweight
 * REFERENCE (catalog item id + cached code/label), like `properties.sharepointLink`,
 * so the Risk-Control Matrix resolves current attributes from the catalog while
 * the diagram stays readable offline. All fields optional + additive (schema 1.33);
 * the open PropertiesType means no XSD change.
 */

import type { DiagramElement } from "./types";

/** A reference to a catalog Risk or Control (id + cached display fields). */
export interface RiskControlRef {
  itemId: string;
  code: string;
  label: string;
}

export interface ElementRiskControl {
  riskRefs?: RiskControlRef[];
  controlRefs?: RiskControlRef[];
}

/** Read the risk/control annotations off an element (never throws; {} if absent). */
export function getRiskControl(el: Pick<DiagramElement, "properties">): ElementRiskControl {
  const rc = el.properties?.risk;
  return rc && typeof rc === "object" ? (rc as ElementRiskControl) : {};
}

/** Build the `{ risk }` properties patch for onUpdateProperties, merging a
 *  partial change over the element's current annotations. The reducer merges
 *  `properties` shallowly, so we spread the whole nested object first. */
export function riskControlPatch(
  el: Pick<DiagramElement, "properties">,
  patch: Partial<ElementRiskControl>,
): { risk: ElementRiskControl } {
  return { risk: { ...getRiskControl(el), ...patch } };
}

/** True when the element carries at least one risk or control reference. */
export function hasRiskControl(el: Pick<DiagramElement, "properties">): boolean {
  const rc = getRiskControl(el);
  return !!(rc.riskRefs?.length || rc.controlRefs?.length);
}
