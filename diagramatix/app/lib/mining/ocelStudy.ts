/**
 * Orchestrate an OCEL "study": from an OCEL 2.0 log, mine ONE lifecycle per
 * object type (reusing the whole single-entity pipeline) and keep the object
 * model for the Domain Diagram backbone. For each selected object type this
 * produces its variants/stats + performance + governance + a deterministically
 * discovered state machine. Pure — the route persists the diagrams + runs and
 * calls `buildDomainFromOcel` with the created state-machine ids. No DB, no React.
 */
import type { DiagramData } from "@/app/lib/diagram/types";
import type { EventLog, Performance, GovernanceStats, LogMapping } from "./types";
import { parseOcelObjectCentric, type OcelObjectCentric } from "./formats/ocel";
import { buildEventLog } from "./parseEventLog";
import { computePerformance } from "./performance";
import { computeGovernance, hasGovernance } from "./governance";
import { discoverStateMachine } from "./discoverStateMachine";

export interface OcelStudyType {
  objectType: string;
  mapping: LogMapping;                 // the resolved column→role mapping used
  log: EventLog;                       // variants + stats (+ transient traces)
  performance: Performance;
  governance: GovernanceStats | null;
  smData: DiagramData;                 // the discovered state machine (deterministic mirror)
  stateAttr?: string;                  // status attribute used for state, if any
}
export interface OcelStudyPlan {
  oc: OcelObjectCentric;               // object model (types, per-type tables, O2O) for the Domain Diagram
  types: OcelStudyType[];              // one mined lifecycle per selected object type (empty types dropped)
}

/** Build the per-object-type study plan from raw OCEL text. `selectedTypes`
 *  defaults to every type; `activityStateByType` supplies a per-type
 *  activity→state table for types with no status attribute. */
export function buildOcelStudy(text: string, opts: {
  selectedTypes?: string[];
  activityStateByType?: Record<string, Record<string, string>>;
} = {}): OcelStudyPlan {
  const oc = parseOcelObjectCentric(text);
  const chosen = (opts.selectedTypes ?? oc.objectTypes).filter((t) => oc.perType[t]);

  const types: OcelStudyType[] = [];
  for (const t of chosen) {
    const proj = oc.perType[t];
    const mapping: LogMapping = { ...proj.mapping } as LogMapping;
    // No status attribute → fall back to the per-type activity→state table.
    if (!mapping.state && opts.activityStateByType?.[t]) mapping.activityState = opts.activityStateByType[t];

    const log = buildEventLog(proj.headers, proj.rows, mapping);
    if (log.variants.length === 0) continue;   // a type with no usable events → skip

    const performance = computePerformance(log.traces);
    const governance = computeGovernance(log.traces);
    const smData = discoverStateMachine(log.variants);
    types.push({
      objectType: t,
      mapping,
      log,
      performance,
      governance: hasGovernance(governance) ? governance : null,
      smData,
      ...(proj.stateAttr ? { stateAttr: proj.stateAttr } : {}),
    });
  }
  return { oc, types };
}
