/**
 * Strip ALL simulation data from a diagram — the inverse of autofill. Removes
 * `properties.sim` from every element and the decision-branch fields
 * (`branchProbability` / `branchCondition` / `isDefaultFlow`) from every
 * connector, leaving the rest of the diagram untouched. Used by the Simulation
 * Data panel's "Clear all" action.
 */

import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

/**
 * What counts as simulation data, in one place.
 *
 * "Clear all" and "does this diagram HAVE simulation data?" are the same
 * question asked twice, so they are answered by the same predicates. Written
 * out separately they would drift, and the way that shows is a badge saying a
 * diagram has no simulation data that Clear-all then clears.
 */
export const elementHasSimData = (el: Pick<DiagramElement, "properties">): boolean =>
  !!el.properties && Object.prototype.hasOwnProperty.call(el.properties, "sim");

export const connectorHasSimData = (c: Connector): boolean =>
  c.branchProbability !== undefined || c.branchCondition !== undefined || c.isDefaultFlow !== undefined;

/** True when anything in this diagram would be removed by clearSimData. */
export function hasSimData(data: DiagramData): boolean {
  return data.elements.some(elementHasSimData) || data.connectors.some(connectorHasSimData);
}

export function clearSimData(data: DiagramData): { data: DiagramData; cleared: number } {
  let cleared = 0;

  const elements = data.elements.map((el) => {
    if (elementHasSimData(el)) {
      cleared++;
      // Drop the `sim` key, keep every other property.
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(el.properties)) if (k !== "sim") next[k] = v;
      return { ...el, properties: next };
    }
    return el;
  });

  const connectors = data.connectors.map((c) => {
    if (connectorHasSimData(c)) {
      cleared++;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { branchProbability, branchCondition, isDefaultFlow, ...rest } = c;
      return rest as Connector;
    }
    return c;
  });

  return { data: { ...data, elements, connectors }, cleared };
}
