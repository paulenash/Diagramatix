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
    defaultHeight: 60,
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
    label: "Initial State",
    defaultWidth: 30,
    defaultHeight: 30,
    description: "Starting state",
  },
  {
    type: "final-state",
    label: "Final State",
    defaultWidth: 30,
    defaultHeight: 30,
    description: "Ending state",
  },
  {
    type: "system-boundary",
    label: "Process Group",
    defaultWidth: 200,
    defaultHeight: 300,
    description: "A system context boundary",
  },
  {
    type: "hourglass",
    label: "AutoTimer",
    defaultWidth: 40,
    defaultHeight: 40,
    description: "An hourglass process symbol",
  },
  {
    type: "composite-state",
    label: "Composite State",
    defaultWidth: 360,
    defaultHeight: 180,
    description: "A composite state containing sub-states",
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
    type: "group",
    label: "Group",
    defaultWidth: 240,
    defaultHeight: 160,
    description: "A BPMN group annotation container",
  },
];

export const PALETTE_BY_DIAGRAM_TYPE: Record<DiagramType, SymbolType[]> = {
  basic: ["task"],
  "process-context": ["use-case", "actor", "team", "system", "hourglass", "system-boundary"],
  "state-machine": ["state", "initial-state", "final-state", "composite-state"],
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
  ],
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
