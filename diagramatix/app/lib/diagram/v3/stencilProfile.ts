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
 *
 * Two profiles are planned:
 *   • `bpmnMProfile` — emits files that load cleanly into Microsoft's
 *     standard BPMN_M stencil environment. This is the existing behaviour.
 *   • `diagramatixV14Profile` — emits files that use the "BPMN Diagramatix
 *     Shapes v1.4" stencil family (different master IDs, separate
 *     Collapsed / Expanded subprocess masters, no `BpmnIsCollapsed`
 *     workaround needed). NOT IMPLEMENTED YET.
 *
 * The deeper stencil-specific quirks the export currently hard-codes —
 * which sub-shape carries body fill, where the task type markers live,
 * Data Store ring spacing, Gateway marker tweaks, Pool master NameU
 * pattern — are NOT in the profile yet. They will be moved here as we
 * add the v1.4 profile and discover which assumptions break.
 */

export interface MasterIdMap {
  task: number;
  collapsedSubprocess: number;
  expandedSubprocess: number;
  poolLane: number;
  messageFlow: number;
  startEvent: number;
  endEvent: number;
  gateway: number;
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
  name: "bpmn-m" | "diagramatix-v1.4";
  /** Master IDs in the OUTPUT file (after `mastersToAdd` has run). */
  masterIds: MasterIdMap;
  /** Masters copied from the auxiliary stencil into the template. */
  mastersToAdd: MasterCopyEntry[];
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

export const DEFAULT_PROFILE = bpmnMProfile;
