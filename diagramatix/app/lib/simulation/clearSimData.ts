/**
 * Strip ALL simulation data from a diagram — the inverse of autofill. Removes
 * `properties.sim` from every element and the decision-branch fields
 * (`branchProbability` / `branchCondition` / `isDefaultFlow`) from every
 * connector, leaving the rest of the diagram untouched. Used by the Simulation
 * Data panel's "Clear all" action.
 */

import type { DiagramData, Connector } from "@/app/lib/diagram/types";

export function clearSimData(data: DiagramData): { data: DiagramData; cleared: number } {
  let cleared = 0;

  const elements = data.elements.map((el) => {
    if (el.properties && Object.prototype.hasOwnProperty.call(el.properties, "sim")) {
      cleared++;
      // Drop the `sim` key, keep every other property.
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(el.properties)) if (k !== "sim") next[k] = v;
      return { ...el, properties: next };
    }
    return el;
  });

  const connectors = data.connectors.map((c) => {
    if (c.branchProbability !== undefined || c.branchCondition !== undefined || c.isDefaultFlow !== undefined) {
      cleared++;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { branchProbability, branchCondition, isDefaultFlow, ...rest } = c;
      return rest as Connector;
    }
    return c;
  });

  return { data: { ...data, elements, connectors }, cleared };
}
