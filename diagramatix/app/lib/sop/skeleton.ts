/**
 * SopSkeleton — the DETERMINISTIC structured extraction from a BPMN diagram that
 * grounds an SOP. Built by `extractSkeleton` (no AI), it is the single source of
 * truth the AI prose pass rewrites into narrative — the AI never invents steps,
 * roles, systems or hand-offs beyond what appears here.
 */

export type SopScope = "whole" | "lane" | "pool" | "subprocess" | "group";

/** A cross-lane hand-off: work entering (`from`) or leaving (`to`) a role, and
 *  the thing passed (`what` = message name or data object, when known). */
export interface SopHandoff {
  from?: string;
  to?: string;
  what?: string;
}

export interface SopDecisionBranch {
  label: string;        // the branch/flow label ("Approved", "Rejected", …)
  toStep?: number;      // global step number the branch leads to, if resolvable
}

export interface SopStep {
  /** The diagram element this step came from. Lets a consumer correlate a step
   *  back to the shape it describes — the partner API returns it so a caller can
   *  point at an activity, and the round-trip comparison matches on it. */
  id: string;
  globalNo: number;             // 1-based position in the WHOLE process order
  label: string;
  role: string;                 // resolved lane (or pool) label = the responsible role
  taskType?: string;            // user/service/script/send/receive/manual/business-rule
  systems: string[];            // IT systems this step touches
  inputs: string[];             // data objects / documents read/used
  outputs: string[];            // data objects written
  decision?: { question: string; branches: SopDecisionBranch[] }; // gateway immediately after this step
  handoffIn?: SopHandoff;       // work received from another lane at this step
  handoffOut?: SopHandoff;      // work handed to another lane after this step
  risks: string[];              // risk codes attached to the element
  controls: string[];           // control codes attached to the element
}

export interface SopSkeletonMeta {
  title: string;
  scope: SopScope;
  scopeLabel?: string;          // the lane/pool/subprocess name when scoped
  diagramId?: string;
  diagramName?: string;
  owner?: { name?: string; email?: string };
  pcf?: { hierarchyId?: string; name?: string; frameworkName?: string };
  version?: string;
}

export interface SopSkeleton {
  meta: SopSkeletonMeta;
  roles: string[];              // distinct roles (lanes/pools) appearing in scope
  steps: SopStep[];             // ordered, scope-filtered, GLOBAL numbers preserved
  inputs: string[];             // distinct inputs across scope
  outputs: string[];            // distinct outputs across scope
  systems: string[];            // distinct systems across scope
  dataObjects: string[];        // distinct BPMN data-object names in scope
  dataStores: string[];         // distinct BPMN data-store names in scope
  businessRules: string[];      // rules extracted from text annotations in scope (author-extendable)
  risksControls: { code: string; label: string; kind: "risk" | "control" }[];
  handoffsIn: SopHandoff[];     // (lane/pool scope) everything the role receives
  handoffsOut: SopHandoff[];    // (lane/pool scope) everything the role hands off
  references: { kind: "subprocess" | "parent"; diagramId: string; label?: string }[];
}
