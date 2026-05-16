/**
 * Stencil profile — encapsulates everything stencil-specific about the V3
 * Visio export so we can support multiple target stencil families from a
 * single export pipeline.
 *
 * A profile bundles:
 *   • The master IDs the export references for each Diagramatix element /
 *     connector type. These IDs identify masters in the **base template's**
 *     `masters.xml` (the resulting .vsdx file's master table) — they may
 *     be original template IDs or new IDs assigned by `mastersToAdd`.
 *   • The list of masters that must be copied from an auxiliary stencil
 *     (.vssx) into the template at export time, each with a remap to its
 *     final ID in the output file.
 *   • The file names for the base template (.vsdx) and auxiliary stencil
 *     (.vssx) the API route should load from `public/`.
 *   • Optional behaviour flags (e.g. skip per-instance body colour bake
 *     for stencils that ship with their own visual styling).
 *
 * Two profiles are defined:
 *   • `bpmnMProfile` — emits files that load cleanly into Microsoft's
 *     standard BPMN_M stencil environment.
 *   • `diagramatixV14Profile` — emits files using the "BPMN Diagramatix
 *     Shapes v1.4" stencil family.
 */

export interface MasterIdMap {
  task: number;
  collapsedSubprocess: number;
  expandedSubprocess: number;
  poolLane: number;
  messageFlow: number;
  startEvent: number;
  endEvent: number;
  /** General-purpose gateway master (Decision / Exclusive). */
  gateway: number;
  /** Optional alternate master for plain Merge gateway (Diagramatix v1.4
   *  ships a separate diamond-without-marker for `gatewayType="none"`).
   *  When undefined, `gateway` is used for both. */
  gatewayMerge?: number;
  intermediateEvent: number;
  sequenceFlow: number;
  association: number;
  dataObject: number;
  dataStore: number;
  textAnnotation: number;
  group: number;
}

export interface MasterCopyEntry {
  /** Source master ID in the auxiliary stencil (.vssx). */
  origId: number;
  /** Target master ID in the resulting .vsdx file's masters.xml. Must
   *  match the corresponding value in `masterIds`. */
  newId: number;
  /** Human-readable name — used only for logging. */
  name: string;
}

export interface StencilProfile {
  /** Short identifier for logs and debug. */
  name: "bpmn-m" | "diagramatix-v1.5";
  /** Filename in `public/` for the base template (.vsdx). */
  templateFile: string;
  /** Filename in `public/` for the auxiliary stencil (.vssx). */
  stencilFile: string;
  /** Master IDs in the OUTPUT file (after `mastersToAdd` has run). */
  masterIds: MasterIdMap;
  /** Masters copied from the auxiliary stencil into the template. */
  mastersToAdd: MasterCopyEntry[];
  /** When true, skip the per-instance master cloning that bakes body
   *  colour and rescales body geometry. The export emits a plain shape
   *  that references the template master directly. Use this for stencils
   *  (like Diagramatix v1.4) whose masters already ship with the desired
   *  visual styling AND whose body geometry handles instance resize via
   *  the standard Visio master-inheritance mechanism. */
  disableBodyColourBake?: boolean;
}

/**
 * BPMN_M profile — the V3 export's original behaviour.
 *
 * The base template (`bpmn-template-v3.vsdx`) already contains a handful
 * of masters: Task=9, Collapsed Sub-Process=33, Pool/Lane=19, Message
 * Flow=24. Other masters are copied from the auxiliary BPMN_M stencil
 * (`bpmn-stencil-v3.vssx`) and remapped to IDs 100+.
 *
 * Note: Template "Start Event" (ID 8) and "End Event" (ID 15) are Phase
 * markers, NOT BPMN events — the real BPMN events come from the
 * auxiliary stencil and land at IDs 107 / 106.
 *
 * `expandedSubprocess` and `collapsedSubprocess` both resolve to the same
 * master ID (33) because the BPMN_M template doesn't carry separate
 * masters for the two variants. The distinction is preserved on the
 * shape via the `BpmnIsCollapsed` property; the import flips the type
 * based on that property.
 */
export const bpmnMProfile: StencilProfile = {
  name: "bpmn-m",
  templateFile: "bpmn-template-v3.vsdx",
  stencilFile: "bpmn-stencil-v3.vssx",
  masterIds: {
    task: 9,
    collapsedSubprocess: 33,
    expandedSubprocess: 33,
    poolLane: 19,
    messageFlow: 24,
    startEvent: 107,
    endEvent: 106,
    gateway: 104,
    intermediateEvent: 105,
    sequenceFlow: 111,
    association: 112,
    dataObject: 115,
    dataStore: 116,
    textAnnotation: 110,
    group: 117,
  },
  mastersToAdd: [
    { origId: 4,  newId: 104, name: "Gateway" },
    { origId: 5,  newId: 105, name: "Intermediate Event" },
    { origId: 6,  newId: 106, name: "End Event" },
    { origId: 7,  newId: 107, name: "Start Event" },
    { origId: 10, newId: 110, name: "Text Annotation" },
    { origId: 11, newId: 111, name: "Sequence Flow" },
    { origId: 12, newId: 112, name: "Association" },
    { origId: 15, newId: 115, name: "Data Object" },
    { origId: 16, newId: 116, name: "Data Store" },
    { origId: 17, newId: 117, name: "Group" },
  ],
};

/**
 * Diagramatix v1.5 profile — emits files using the "BPMN Diagramatix
 * Shapes v1.5" stencil family.
 *
 * v1.5 differs from v1.4 only in the Data Object master: a right-click
 * "Data Object Type" chooser (None / Input / Output) with two marker
 * sub-shapes whose visibility tracks the chosen type. The rest of the
 * stencil is unchanged.
 *
 * Base template (`bpmn-template-v15.vsdx`) already contains the bulk of
 * the masters: Start/Intermediate/End Events, Task, Collapsed and
 * Expanded Sub-Process (separate masters — no `BpmnIsCollapsed` workaround
 * needed), Gateway Decision + Merge, Data Object/Store, Text Annotation,
 * Group. The auxiliary stencil (`BPMN Diagramatix Shapes v1.5.vssx`)
 * provides the missing Pool/Lane, Sequence Flow, Message Flow and
 * Association masters — those are copied in at new IDs (118 / 146 / 147
 * / 152) matching the IDs they already use in the stencil so debug is
 * consistent across the round-trip.
 *
 * `disableBodyColourBake` is true — the v1.5 masters are pre-styled for
 * the Diagramatix aesthetic and re-colouring them per-instance is both
 * unnecessary and risky (the v1.5 sub-shape layout differs from BPMN_M,
 * so the `bakeColourIntoMaster` shape-id targeting would mis-fire).
 */
export const diagramatixV15Profile: StencilProfile = {
  name: "diagramatix-v1.5",
  templateFile: "bpmn-template-v15.vsdx",
  stencilFile: "BPMN Diagramatix Shapes v1.5.vssx",
  masterIds: {
    task: 6,
    collapsedSubprocess: 7,
    expandedSubprocess: 8,
    poolLane: 118,                  // copied from v1.4 stencil ID 18
    messageFlow: 147,               // copied from v1.4 stencil ID 47
    startEvent: 2,
    endEvent: 5,
    gateway: 9,                     // Gateway - Decision (with marker)
    gatewayMerge: 10,               // Gateway - Merge (plain diamond)
    intermediateEvent: 4,
    sequenceFlow: 146,              // copied from v1.4 stencil ID 46
    association: 152,               // copied from v1.4 stencil ID 52
    dataObject: 11,
    dataStore: 12,
    textAnnotation: 13,
    group: 14,
  },
  mastersToAdd: [
    { origId: 18, newId: 118, name: "Pool / Lane" },
    { origId: 46, newId: 146, name: "Sequence Flow" },
    { origId: 47, newId: 147, name: "Message Flow" },
    { origId: 52, newId: 152, name: "Association" },
  ],
  disableBodyColourBake: true,
};

export const DEFAULT_PROFILE = bpmnMProfile;

/** Look up a profile by its `name`. Returns `DEFAULT_PROFILE` if the name
 *  is unrecognised. Used by the API route to honour a `?profile=` query
 *  parameter. Older aliases ("v1.4" / "v14") are accepted and route to
 *  the v1.5 profile — v1.5 is a strict superset (Data Object only). */
export function profileByName(name: string | null | undefined): StencilProfile {
  if (
    name === "diagramatix-v1.5" || name === "diagramatix-v1.4" ||
    name === "v1.5" || name === "v15" ||
    name === "v1.4" || name === "v14" ||
    name === "diagramatix"
  ) {
    return diagramatixV15Profile;
  }
  return bpmnMProfile;
}
