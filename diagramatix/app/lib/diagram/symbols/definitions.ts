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
    defaultWidth: 120,
    defaultHeight: 60,
    description: "A work item or activity",
  },
  {
    type: "gateway",
    label: "Gateway",
    defaultWidth: 50,
    defaultHeight: 50,
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
    label: "Actor",
    defaultWidth: 40,
    defaultHeight: 80,
    description: "A participant in the process",
  },
  {
    type: "team",
    label: "Team",
    defaultWidth: 140,
    defaultHeight: 90,
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
];

export const PALETTE_BY_DIAGRAM_TYPE: Record<DiagramType, SymbolType[]> = {
  basic: ["task"],
  "process-context": ["use-case", "actor", "team"],
  "state-machine": ["state", "initial-state", "final-state"],
  bpmn: [
    "task",
    "gateway",
    "start-event",
    "end-event",
    "subprocess",
    "pool",
    "lane",
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
