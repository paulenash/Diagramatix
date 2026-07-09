/**
 * Build a Domain Diagram (the object-model backbone) from an OCEL object-centric
 * parse: each object type → a `uml-class` entity (attributes from the objects'
 * attributes); each object-to-object relationship → a `uml-association` labelled
 * with its qualifier. Optionally links each entity to its discovered state
 * machine (`linkedByType`: object type → diagram id) so clicking a class opens
 * that type's lifecycle. Laid out by the shared `layoutGenericDiagram`. Pure.
 */
import type { DiagramData } from "@/app/lib/diagram/types";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import type { OcelObjectCentric } from "./formats/ocel";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "t";

export function buildDomainFromOcel(oc: OcelObjectCentric, opts: { linkedByType?: Record<string, string> } = {}): DiagramData {
  // Stable, unique class id per object type.
  const idByType = new Map<string, string>();
  const used = new Set<string>();
  for (const t of oc.objectTypes) {
    let id = `cls_${slug(t)}`, i = 2;
    while (used.has(id)) id = `cls_${slug(t)}_${i++}`;
    used.add(id); idByType.set(t, id);
  }

  const elements = oc.objectTypes.map((t) => ({
    id: idByType.get(t)!,
    type: "uml-class",
    label: t,
    attributes: (oc.perType[t]?.attributes ?? []).map((name) => ({ name, visibility: "+" })),
  }));

  // Object-to-object relationships → associations (dedup by from/to/qualifier;
  // self-relations skipped). Qualifier is the association label.
  const seen = new Set<string>();
  const connections = oc.o2o
    .filter((e) => idByType.has(e.fromType) && idByType.has(e.toType) && e.fromType !== e.toType)
    .filter((e) => { const k = `${e.fromType}>${e.toType}>${e.qualifier}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((e) => ({ sourceId: idByType.get(e.fromType)!, targetId: idByType.get(e.toType)!, type: "uml-association", label: e.qualifier || "" }));

  const data = layoutGenericDiagram({ elements, connections }, "domain");

  // Link each entity to its discovered state machine.
  const linked = opts.linkedByType ?? {};
  const typeById = new Map([...idByType.entries()].map(([t, id]) => [id, t] as const));
  for (const el of data.elements) {
    const t = typeById.get(el.id);
    const smId = t ? linked[t] : undefined;
    if (smId) el.properties = { ...el.properties, linkedDiagramId: smId };
  }
  return data;
}
