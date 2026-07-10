/**
 * Build a Domain Diagram (the object-model backbone) from an OCEL object-centric
 * parse: each object type → a `uml-class` entity (attributes from the objects'
 * attributes); each object-to-object relationship → a `uml-association` labelled
 * with its qualifier. Behavioural interactions (type pairs bound by shared
 * events) weight the associations — the interaction count as multiplicity + line
 * thickness — and add a DASHED association where two types synchronise via shared
 * events but declare no structural O2O relationship. Optionally links each entity
 * to its discovered state machine (`linkedByType`). Laid out by the shared
 * `layoutGenericDiagram`. Pure.
 */
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import { avoidObstaclesPostLayout } from "@/app/lib/diagram/routing";
import type { OcelObjectCentric, OcelInteraction } from "./formats/ocel";

// Explains the domain diagram's visual language + the editor's red obstacle flag.
const LEGEND =
  "LEGEND — Solid line: a structural relationship (labelled with its qualifier). " +
  "Dashed line: a behavioural link — two object types bound by shared events, with no declared relationship. " +
  "Line thickness and the number near an association end show the interaction strength (how many events touch both types). " +
  "A RED line, or a red-highlighted entity, is not part of the model — it just means the auto-layout routed an association across an entity; drag the entity or the line to clear it.";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "t";
const pairKey = (a: string, b: string) => (a < b ? `${a}${b}` : `${b}${a}`);
// Interaction count → association stroke width (px): 1.5 (light) … 5 (heavy).
const widthFor = (count: number, max: number) => Math.round((1.5 + (max > 0 ? count / max : 0) * 3.5) * 10) / 10;

export function buildDomainFromOcel(oc: OcelObjectCentric, opts: { linkedByType?: Record<string, string> } = {}): DiagramData {
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

  const interByPair = new Map<string, OcelInteraction>();
  for (const it of oc.interactions) interByPair.set(pairKey(it.typeA, it.typeB), it);
  const maxCount = Math.max(1, ...oc.interactions.map((i) => i.count));

  // Structural associations from O2O relationships (dedup by from/to/qualifier).
  const seen = new Set<string>();
  const structural = oc.o2o
    .filter((e) => idByType.has(e.fromType) && idByType.has(e.toType) && e.fromType !== e.toType)
    .filter((e) => { const k = `${e.fromType}>${e.toType}>${e.qualifier}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((e) => ({ fromType: e.fromType, toType: e.toType, label: e.qualifier || "", behavioural: false }));
  const structuralPairs = new Set(structural.map((s) => pairKey(s.fromType, s.toType)));

  // Behavioural edges: interaction pairs with NO structural association → dashed.
  const behavioural = oc.interactions
    .filter((it) => it.typeA !== it.typeB && idByType.has(it.typeA) && idByType.has(it.typeB) && !structuralPairs.has(pairKey(it.typeA, it.typeB)))
    .map((it) => ({ fromType: it.typeA, toType: it.typeB, label: it.topActivity || "", behavioural: true }));

  const meta = [...structural, ...behavioural];
  const connections = meta.map((m) => ({ sourceId: idByType.get(m.fromType)!, targetId: idByType.get(m.toType)!, type: "uml-association", label: m.label }));

  const data = layoutGenericDiagram({ elements, connections }, "domain");
  // Detour any association the grid layout routed across an entity box, so the
  // editor's red obstacle flag stays quiet on a freshly-generated model.
  avoidObstaclesPostLayout(data);

  // Apply weight (thickness) + multiplicity + dashed by matching connectors to
  // meta in order (per source→target), and link entities to their state machines.
  const metaQueue = new Map<string, typeof meta>();
  for (const m of meta) {
    const k = `${idByType.get(m.fromType)}${idByType.get(m.toType)}`;
    (metaQueue.get(k) ?? metaQueue.set(k, []).get(k)!).push(m);
  }
  for (const c of data.connectors) {
    if (c.type !== "uml-association") continue;
    const m = metaQueue.get(`${c.sourceId}${c.targetId}`)?.shift();
    if (!m) continue;
    const inter = interByPair.get(pairKey(m.fromType, m.toType));
    if (inter) { c.weight = widthFor(inter.count, maxCount); c.targetMultiplicity = String(inter.count); }
    if (m.behavioural) c.dashed = true;
  }

  const linked = opts.linkedByType ?? {};
  const typeById = new Map([...idByType.entries()].map(([t, id]) => [id, t] as const));
  for (const el of data.elements) {
    const t = typeById.get(el.id);
    const smId = t ? linked[t] : undefined;
    if (smId) el.properties = { ...el.properties, linkedDiagramId: smId };
  }

  // Boxed legend, top-left above the entities, explaining the visual language.
  const cls = data.elements.filter((e) => e.type === "uml-class");
  if (cls.length) {
    const minX = Math.min(...cls.map((e) => e.x));
    const minY = Math.min(...cls.map((e) => e.y));
    const w = 360;
    const lines = Math.max(1, Math.ceil(LEGEND.length / 50));
    const h = Math.min(340, lines * 15 + 16);
    data.elements.push({
      id: "domain-legend", type: "text-annotation",
      x: minX, y: minY - h - 36, width: w, height: h,
      label: LEGEND, properties: { boxed: true },
    } as DiagramElement);
  }
  return data;
}
