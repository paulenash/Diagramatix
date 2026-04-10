import type { DiagramType, SymbolType } from "../types";

export interface SymbolDefinition {
  type: SymbolType;
  label: string;
  defaultWidth: number;
  defaultHeight: number;
  description: string;
}

export const ALL_SYMBOLS: SymbolDefinition[] = [
  {
    type: "task",
    label: "Task",
    defaultWidth: 102,
    defaultHeight: 65,
    description: "A work item or activity",
  },
  {
    type: "gateway",
    label: "Gateway",
    defaultWidth: 40,
    defaultHeight: 40,
    description: "A decision point",
  },
  {
    type: "start-event",
    label: "Start",
    defaultWidth: 36,
    defaultHeight: 36,
    description: "Start of process",
  },
  {
    type: "end-event",
    label: "End",
    defaultWidth: 36,
    defaultHeight: 36,
    description: "End of process",
  },
  {
    type: "use-case",
    label: "Process",
    defaultWidth: 120,
    defaultHeight: 60,
    description: "A process in the context diagram",
  },
  {
    type: "actor",
    label: "Participant",
    defaultWidth: 40,
    defaultHeight: 52,
    description: "A participant in the process",
  },
  {
    type: "team",
    label: "Team",
    defaultWidth: 96,
    defaultHeight: 52,
    description: "A group of three participants",
  },
  {
    type: "state",
    label: "State",
    defaultWidth: 120,
    defaultHeight: 60,
    description: "A state in a state machine",
  },
  {
    type: "initial-state",
    label: "Initial",
    defaultWidth: 30,
    defaultHeight: 30,
    description: "Starting state",
  },
  {
    type: "final-state",
    label: "Final",
    defaultWidth: 30,
    defaultHeight: 30,
    description: "Ending state",
  },
  {
    type: "system-boundary",
    label: "Process Group Header",
    defaultWidth: 200,
    defaultHeight: 300,
    description: "A system context boundary",
  },
  {
    type: "system-boundary-body",
    label: "Process Group Body",
    defaultWidth: 200,
    defaultHeight: 300,
    description: "Body fill for a process group",
  },
  {
    type: "hourglass",
    label: "Auto Scheduler",
    defaultWidth: 40,
    defaultHeight: 40,
    description: "An hourglass process symbol",
  },
  {
    type: "composite-state",
    label: "Composite",
    defaultWidth: 360,
    defaultHeight: 180,
    description: "A composite state containing sub-states",
  },
  {
    type: "composite-state-body",
    label: "Composite State Body",
    defaultWidth: 360,
    defaultHeight: 180,
    description: "Body fill for a composite state",
  },
  {
    type: "system",
    label: "System",
    defaultWidth: 40,
    defaultHeight: 80,
    description: "A system or application",
  },
  {
    type: "subprocess",
    label: "Subprocess",
    defaultWidth: 108,
    defaultHeight: 72,
    description: "A collapsed subprocess activity",
  },
  {
    type: "subprocess-expanded",
    label: "Expanded Sub",
    defaultWidth: 180,
    defaultHeight: 108,
    description: "An expanded subprocess activity",
  },
  {
    type: "data-object",
    label: "Data Object",
    defaultWidth: 36,
    defaultHeight: 46,
    description: "A data object referenced by the process",
  },
  {
    type: "data-store",
    label: "Data Store",
    defaultWidth: 50,
    defaultHeight: 40,
    description: "A persistent data store or database",
  },
  {
    type: "intermediate-event",
    label: "Intermediate",
    defaultWidth: 36,
    defaultHeight: 36,
    description: "Intermediate event in process",
  },
  {
    type: "pool",
    label: "Pool",
    defaultWidth: 600,
    defaultHeight: 50,
    description: "A BPMN pool (swimlane container)",
  },
  {
    type: "lane",
    label: "Lane",
    defaultWidth: 600,
    defaultHeight: 50,
    description: "A BPMN lane within a pool",
  },
  {
    type: "sublane",
    label: "Sublane",
    defaultWidth: 600,
    defaultHeight: 40,
    description: "A sublane within a lane",
  },
  {
    type: "group",
    label: "Group",
    defaultWidth: 240,
    defaultHeight: 160,
    description: "A BPMN group annotation container",
  },
  {
    type: "text-annotation",
    label: "Annotation",
    defaultWidth: 100,
    defaultHeight: 60,
    description: "A text annotation comment",
  },
  {
    type: "external-entity",
    label: "External Entity",
    defaultWidth: 80,
    defaultHeight: 80,
    description: "An external entity in a context diagram",
  },
  {
    type: "process-system",
    label: "Process",
    defaultWidth: 160,
    defaultHeight: 160,
    description: "A process, system, or organisation in a context diagram",
  },
  {
    type: "submachine",
    label: "SubMachine",
    defaultWidth: 120,
    defaultHeight: 72,
    description: "A sub-machine state with a linked state machine diagram",
  },
  {
    type: "fork-join",
    label: "Fork/Join",
    defaultWidth: 5,
    defaultHeight: 100,
    description: "A fork or join bar in a state machine diagram",
  },
  {
    type: "uml-class",
    label: "Entity",
    defaultWidth: 80,
    defaultHeight: 60,
    description: "A UML entity (class) in a domain diagram",
  },
  {
    type: "uml-enumeration",
    label: "Enumeration",
    defaultWidth: 96,
    defaultHeight: 84,
    description: "A UML enumeration in a domain diagram",
  },
];

export const PALETTE_BY_DIAGRAM_TYPE: Record<DiagramType, SymbolType[]> = {
  context: ["external-entity", "process-system"],
  basic: ["external-entity", "process-system"],  // legacy alias
  "process-context": ["use-case", "actor", "team", "system", "hourglass", "system-boundary"],
  "state-machine": ["state", "submachine", "initial-state", "final-state", "composite-state", "gateway", "fork-join"],
  bpmn: [
    "pool",
    "start-event",
    "task",
    "subprocess",
    "subprocess-expanded",
    "gateway",
    "intermediate-event",
    "data-object",
    "data-store",
    "end-event",
    "group",
    "text-annotation",
  ],
  domain: ["uml-class", "uml-enumeration"],
};

/** Colour-picker palette — includes body colour entries and lane that aren't in the drag palette. */
export const COLOR_PALETTE_BY_DIAGRAM_TYPE: Record<DiagramType, SymbolType[]> = {
  context: ["external-entity", "process-system"],
  basic: ["external-entity", "process-system"],  // legacy alias
  "process-context": ["use-case", "actor", "team", "system", "hourglass", "system-boundary", "system-boundary-body"],
  "state-machine": ["state", "submachine", "initial-state", "final-state", "composite-state", "composite-state-body", "gateway", "fork-join"],
  bpmn: [
    "pool",
    "lane",
    "sublane",
    "start-event",
    "task",
    "subprocess",
    "subprocess-expanded",
    "gateway",
    "intermediate-event",
    "data-object",
    "data-store",
    "end-event",
    "group",
    "text-annotation",
  ],
  domain: ["uml-class", "uml-enumeration"],
};

export function getSymbolDefinition(type: SymbolType): SymbolDefinition {
  const def = ALL_SYMBOLS.find((s) => s.type === type);
  return (
    def ?? {
      type,
      label: type,
      defaultWidth: 120,
      defaultHeight: 60,
      description: "",
    }
  );
}
