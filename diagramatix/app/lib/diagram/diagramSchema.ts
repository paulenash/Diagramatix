/**
 * Zod runtime schema for the persisted Diagram JSON — a PARALLEL validator that
 * MIRRORS `types.ts` (which stays the authoritative source). `types.ts` → XSD →
 * DDL doctrine is unchanged; this is the 5th "keep in sync" artifact.
 *
 * Design (locked via /grill-me):
 *  - `z.object` (NOT strict): validates the TYPES of known fields, and unknown
 *    keys are ignored — never an error. We only ever read `.success`/`.error`;
 *    the ORIGINAL data is what gets persisted, so nothing is stripped. A field
 *    shipped ahead of the schema can never cause a false rejection.
 *  - Enum-typed string fields are validated as `z.string()` (catches "type is a
 *    number/null", not enum membership) — so frequent enum additions (new symbol
 *    types etc.) never trip the drift guard. Enum values remain governed by the
 *    app + XSD.
 *  - `properties` is opaque: `z.record(z.string(), z.unknown())`.
 *  - `.superRefine` adds referential integrity (unique ids, resolvable refs,
 *    parentId cycles) + orphan detection scoped to true flow elements.
 *
 * Drift guard: tests/schema/diagram-schema-types.test.ts asserts the schema's
 * KEY SET equals each interface's — adding a field to one and not the other fails CI.
 */
import { z } from "zod";

const pointSchema = z.object({ x: z.number(), y: z.number() });

// Loose sub-objects — validated as objects, inner fields not drift-guarded.
const looseObj = z.record(z.string(), z.unknown());

export const diagramElementSchema = z.object({
  id: z.string(),
  type: z.string(),                 // SymbolType (~40 values) — string by design
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  label: z.string(),
  properties: z.record(z.string(), z.unknown()),
  parentId: z.string().optional(),
  boundaryHostId: z.string().optional(),
  taskType: z.string().optional(),
  gatewayType: z.string().optional(),
  eventType: z.string().optional(),
  repeatType: z.string().optional(),
  flowType: z.string().optional(),
});

export const connectorSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  sourceSide: z.string(),
  targetSide: z.string(),
  type: z.string(),
  directionType: z.string(),
  routingType: z.string(),
  sourceInvisibleLeader: z.boolean(),
  targetInvisibleLeader: z.boolean(),
  waypoints: z.array(pointSchema),
  label: z.string().optional(),
  labelOffsetX: z.number().optional(),
  labelOffsetY: z.number().optional(),
  labelWidth: z.number().optional(),
  sourceOffsetAlong: z.number().optional(),
  targetOffsetAlong: z.number().optional(),
  sourcePinned: z.boolean().optional(),
  targetPinned: z.boolean().optional(),
  cp1RelOffset: pointSchema.optional(),
  cp2RelOffset: pointSchema.optional(),
  labelAnchor: z.string().optional(),
  labelMode: z.string().optional(),
  transitionEvent: z.string().optional(),
  transitionGuard: z.string().optional(),
  transitionActions: z.string().optional(),
  transitionCount: z.number().optional(),
  transitionIllegal: z.boolean().optional(),
  transitionCountOffset: pointSchema.optional(),
  transitionTouches: z.array(z.string()).optional(),
  weight: z.number().optional(),
  dashed: z.boolean().optional(),
  sourceRole: z.string().optional(),
  sourceMultiplicity: z.string().optional(),
  sourcePropertyString: z.string().optional(),
  sourceOrdered: z.boolean().optional(),
  sourceUnique: z.boolean().optional(),
  sourceReadOnly: z.boolean().optional(),
  sourceUnion: z.boolean().optional(),
  sourceConstraintOther: z.string().optional(),
  sourceDerived: z.boolean().optional(),
  sourceVisibility: z.string().optional(),
  sourceQualifier: z.string().optional(),
  sourceRoleOffset: pointSchema.optional(),
  sourceMultOffset: pointSchema.optional(),
  sourceConstraintOffset: pointSchema.optional(),
  sourceConstraintSize: pointSchema.optional(),
  sourceQualifierOffset: pointSchema.optional(),
  sourceUniqueOffset: pointSchema.optional(),
  targetRole: z.string().optional(),
  targetMultiplicity: z.string().optional(),
  targetPropertyString: z.string().optional(),
  targetOrdered: z.boolean().optional(),
  targetUnique: z.boolean().optional(),
  targetReadOnly: z.boolean().optional(),
  targetUnion: z.boolean().optional(),
  targetConstraintOther: z.string().optional(),
  targetDerived: z.boolean().optional(),
  targetVisibility: z.string().optional(),
  targetQualifier: z.string().optional(),
  targetRoleOffset: pointSchema.optional(),
  targetMultOffset: pointSchema.optional(),
  targetConstraintOffset: pointSchema.optional(),
  targetConstraintSize: pointSchema.optional(),
  targetQualifierOffset: pointSchema.optional(),
  targetUniqueOffset: pointSchema.optional(),
  associationName: z.string().optional(),
  readingDirection: z.string().optional(),
  associationNameOffset: pointSchema.optional(),
  arrowAtSource: z.boolean().optional(),
  selfLoopBulge: z.number().optional(),
  containmentSwapEnd: z.boolean().optional(),
  bottleneck: z.boolean().optional(),
  branchProbability: z.number().optional(),
  branchCondition: z.string().optional(),
  isDefaultFlow: z.boolean().optional(),
});

const viewportSchema = z.object({ x: z.number(), y: z.number(), zoom: z.number() });

// Flow elements that are meaningful only when connected — flagged if stranded.
const FLOW_TYPES = new Set(["task", "gateway", "start-event", "intermediate-event", "end-event", "state"]);

const baseDiagramData = z.object({
  elements: z.array(diagramElementSchema),
  connectors: z.array(connectorSchema),
  viewport: viewportSchema,
  title: looseObj.optional(),
  fontSize: z.number().optional(),
  connectorFontSize: z.number().optional(),
  titleFontSize: z.number().optional(),
  poolFontSize: z.number().optional(),
  laneFontSize: z.number().optional(),
  processFontSize: z.number().optional(),
  valueChainFontSize: z.number().optional(),
  descriptionFontSize: z.number().optional(),
  database: z.string().optional(),
  relaxedLayout: z.boolean().optional(),
  showPainPoints: z.boolean().optional(),
  showPainPointDescriptions: z.boolean().optional(),
  showIssues: z.boolean().optional(),
  showIssueDescriptions: z.boolean().optional(),
  parentDiagramIds: z.array(z.string()).optional(),
  processOwner: looseObj.optional(),
  pcf: looseObj.optional(),
  procedureDoc: looseObj.optional(),
  aiFeedback: looseObj.optional(),
});

/** Referential integrity — each problem surfaces as its own issue. */
function refine(data: z.infer<typeof baseDiagramData>, ctx: z.RefinementCtx) {
  const elIds = new Set<string>();
  const dupEl = new Set<string>();
  for (const e of data.elements) { if (elIds.has(e.id)) dupEl.add(e.id); elIds.add(e.id); }
  for (const id of dupEl) ctx.addIssue({ code: "custom", message: `Duplicate element id: ${id}`, path: ["elements"] });

  const connIds = new Set<string>();
  for (const c of data.connectors) {
    if (connIds.has(c.id)) ctx.addIssue({ code: "custom", message: `Duplicate connector id: ${c.id}`, path: ["connectors"] });
    connIds.add(c.id);
    if (!elIds.has(c.sourceId)) ctx.addIssue({ code: "custom", message: `Connector ${c.id} sourceId ${c.sourceId} not found`, path: ["connectors"] });
    if (!elIds.has(c.targetId)) ctx.addIssue({ code: "custom", message: `Connector ${c.id} targetId ${c.targetId} not found`, path: ["connectors"] });
  }

  // parentId / boundaryHostId resolve; parentId cycle detection.
  const parentOf = new Map<string, string>();
  for (const e of data.elements) {
    if (e.parentId !== undefined) {
      if (!elIds.has(e.parentId)) ctx.addIssue({ code: "custom", message: `Element ${e.id} parentId ${e.parentId} not found`, path: ["elements"] });
      else parentOf.set(e.id, e.parentId);
    }
    if (e.boundaryHostId !== undefined && !elIds.has(e.boundaryHostId))
      ctx.addIssue({ code: "custom", message: `Element ${e.id} boundaryHostId ${e.boundaryHostId} not found`, path: ["elements"] });
  }
  for (const start of parentOf.keys()) {
    const seen = new Set<string>([start]);
    let cur = parentOf.get(start);
    while (cur !== undefined) {
      if (seen.has(cur)) { ctx.addIssue({ code: "custom", message: `parentId cycle at element ${start}`, path: ["elements"] }); break; }
      seen.add(cur); cur = parentOf.get(cur);
    }
  }

  // Orphan flow elements — a flow element with no connector touching it.
  const touched = new Set<string>();
  for (const c of data.connectors) { touched.add(c.sourceId); touched.add(c.targetId); }
  if (data.elements.length > 1) {
    for (const e of data.elements) {
      if (FLOW_TYPES.has(e.type) && !touched.has(e.id))
        ctx.addIssue({ code: "custom", message: `Orphan ${e.type} (${e.id}) — no connectors`, path: ["elements"] });
    }
  }
}

/** The persisted diagram body. */
export const diagramDataSchema = baseDiagramData.superRefine(refine);

/** The export/import envelope — embeds the body schema. */
export const exportEnvelopeSchema = z.object({
  schemaVersion: z.string(),
  appVersion: z.string().optional(),
  exportedAt: z.string().optional(),
  project: looseObj.optional(),
  diagrams: z.array(z.object({
    originalId: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    data: diagramDataSchema,
    colorConfig: z.unknown().optional(),
    displayMode: z.string().optional(),
  })),
});

// For the drift-guard test (key-set equality against types.ts interfaces).
export type InferredDiagramData = z.infer<typeof baseDiagramData>;
export type InferredDiagramElement = z.infer<typeof diagramElementSchema>;
export type InferredConnector = z.infer<typeof connectorSchema>;
