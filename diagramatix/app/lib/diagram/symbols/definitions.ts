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
  { type: "task-user",          label: "User Task",          defaultWidth: 120, defaultHeight: 60, description: "Task performed by a person" },
  { type: "task-service",       label: "Service Task",       defaultWidth: 120, defaultHeight: 60, description: "Automated service task" },
  { type: "task-script",        label: "Script Task",        defaultWidth: 120, defaultHeight: 60, description: "Executed script" },
  { type: "task-send",          label: "Send Task",          defaultWidth: 120, defaultHeight: 60, description: "Sends a message" },
  { type: "task-receive",       label: "Receive Task",       defaultWidth: 120, defaultHeight: 60, description: "Waits for a message" },
  { type: "task-manual",        label: "Manual Task",        defaultWidth: 120, defaultHeight: 60, description: "Manual work item" },
  { type: "task-business-rule", label: "Business Rule Task", defaultWidth: 120, defaultHeight: 60, description: "Evaluates a business rule" },
];

export const PALETTE_BY_DIAGRAM_TYPE: Record<DiagramType, SymbolType[]> = {
  basic: ["task"],
  "process-context": ["use-case", "actor", "team", "system", "hourglass", "system-boundary"],
  "state-machine": ["state", "initial-state", "final-state", "composite-state"],
  bpmn: [
    "task", "task-user", "task-service", "task-script",
    "task-send", "task-receive", "task-manual", "task-business-rule",
    "gateway", "start-event", "end-event",
    "subprocess", "pool", "lane",
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
