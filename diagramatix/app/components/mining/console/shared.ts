/**
 * Pieces the MINER console's panels share.
 *
 * Extracted as part of Phase 0.2 (breaking up a 1,183-line single-scroll
 * component). Kept deliberately small: shared UI constants and the two types
 * more than one panel needs — not a dumping ground for anything that is
 * awkward to place.
 */
import type { LogMapping, MiningStats } from "@/app/lib/mining/types";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";

/** The console's one input/select style. */
export const INPUT_CLASS = "bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs";

/** One of an adopted example's sample logs — an example may ship several
 *  periods of the same process, which is what the scenario picker chooses
 *  between. */
export interface SampleScenario {
  scenario?: string; note?: string;
  fileName?: string; runName?: string;
  headers: string[]; rows: string[][]; mapping?: Partial<LogMapping>;
}

/** The nine column roles, in the order the mapping screen shows them. Three are
 *  required; the rest refine what can be mined (a resource enables the handover
 *  and team views, the GRC ids enable control effectiveness). */
export const ROLES: { key: keyof LogMapping; label: string; required: boolean; hint: string }[] = [
  { key: "caseId", label: "Case / entity id", required: true, hint: "The entity instance (e.g. Invoice #123) — the process case" },
  { key: "activity", label: "Activity / event", required: true, hint: "The business event that occurred" },
  { key: "timestamp", label: "Timestamp", required: true, hint: "When it happened (ISO or epoch)" },
  { key: "state", label: "State (optional)", required: false, hint: "The entity's resulting state after the event. Leave blank to map activities → states below." },
  { key: "resource", label: "Resource (optional)", required: false, hint: "Who/what performed it → simulation team" },
  { key: "entityType", label: "Entity type (optional)", required: false, hint: "The entity kind (Invoice, Employee…)" },
  { key: "controlId", label: "Control ID (optional)", required: false, hint: "The Control (RCM) id exercised — mines control operating-effectiveness" },
  { key: "riskId", label: "Risk ID (optional)", required: false, hint: "The Risk id the event relates to — GRC traceability" },
  { key: "policyId", label: "Policy ID (optional)", required: false, hint: "The Policy id the event relates to — GRC traceability" },
];

/** One import in the list. An OCEL import contributes several rows sharing an
 *  `ocelGroupId` — one per object type — and is shown grouped as a study. */
export interface RunRow {
  id: string; name: string; stats: MiningStats; mapping: Partial<LogMapping>;
  discoveredBpmnId: string | null; discoveredSmId: string | null; referenceSmId: string | null;
  conformance: ConformanceResult | null;
  studyId: string | null; createdAt: string; excludeFromCompliance?: boolean;
  ocelGroupId?: string | null; objectType?: string | null; domainDiagramId?: string | null;
}

/** An OCEL study's shared name — the run names are "<study> — <object type>". */
export function studyNameOf(name: string): string {
  const i = name.lastIndexOf(" — ");
  return i >= 0 ? name.slice(0, i) : name;
}
