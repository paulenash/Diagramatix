/**
 * Pull the laid-out diagram ({ elements, connectors }) out of whatever JSON
 * shape we're handed:
 *   - a full project/diagram export:  { diagrams: [ { name, data: {...} } ] }
 *   - a bare DiagramData:             { elements, connectors, ... }
 *
 * Returns one entry per diagram found (a project export can hold several).
 */
import type { DiagramLike } from "./diagramChecks";

export interface NamedDiagram extends DiagramLike {
  name: string;
}

export function extractDiagrams(json: unknown): NamedDiagram[] {
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.diagrams)) {
    return (obj.diagrams as Array<Record<string, unknown>>)
      .map((d) => {
        const data = (d.data ?? d) as Record<string, unknown>;
        return {
          name: (d.name as string) ?? "(unnamed)",
          elements: (data.elements as DiagramLike["elements"]) ?? [],
          connectors: (data.connectors as DiagramLike["connectors"]) ?? [],
        };
      })
      .filter((d) => d.elements.length > 0);
  }
  if (Array.isArray(obj?.elements)) {
    return [{
      name: "(diagram)",
      elements: obj.elements as DiagramLike["elements"],
      connectors: (obj.connectors as DiagramLike["connectors"]) ?? [],
    }];
  }
  return [];
}
