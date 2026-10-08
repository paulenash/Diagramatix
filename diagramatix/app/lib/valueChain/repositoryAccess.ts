/**
 * Who may create what from the Process Repository (Paul, 2026-10-08).
 *
 * Two features in the Feature Availability grid:
 *   • Process Repository — Restricted: only the Order to Cash value chain, V01. Free gets the V01 Value Chain diagram and processes V01.01
 *     and V01.02; Introductory gets all of V01. Everything else is shown but disabled.
 *   • Process Repository — Complete: every value chain. Professional, Expert and Enterprise.
 *
 * Complete wins when both are on; a level with neither has no access. The per-level content limits for Restricted are plain constants here,
 * like the examples-only limits (exampleAccess.ts): a rule about WHAT, where the grid says WHETHER.
 */
import { getFeatureStates, resolveEffectiveLevelId } from "@/app/lib/features/availability";

export const REPO_FEATURE_COMPLETE = "process-repository-complete";
export const REPO_FEATURE_RESTRICTED = "process-repository-restricted";

export type RepositoryMode = "complete" | "restricted" | "none";

/** The only chain the Restricted feature opens. */
export const RESTRICTED_CHAIN = "V01";
/** On the Free subscription, Restricted opens only the chain's Value Chain diagram and these two processes. */
export const FREE_PROCESSES: readonly string[] = ["V01.01", "V01.02"];

/** One thing that can be created from the Repository: a chain-level diagram (processCode "") or one process's diagram. */
export interface RepositoryItem { chainCode: string; type: string; processCode: string }

export interface RepositoryAccess { mode: RepositoryMode; levelId: string | null }

/** Complete wins; Restricted next; otherwise none. Pure, over a feature-state map. */
export function modeFromStates(states: Record<string, string | undefined>): RepositoryMode {
  if (states[REPO_FEATURE_COMPLETE] === "available") return "complete";
  if (states[REPO_FEATURE_RESTRICTED] === "available") return "restricted";
  return "none";
}

/** May this level create this item? Pure. */
export function itemAllowed(access: RepositoryAccess, item: RepositoryItem): boolean {
  if (access.mode === "complete") return true;
  if (access.mode === "none") return false;
  if (item.chainCode !== RESTRICTED_CHAIN) return false;
  if (access.levelId === "free") {
    return (item.type === "value-chain" && !item.processCode) || (item.type === "bpmn" && FREE_PROCESSES.includes(item.processCode));
  }
  return true;                                   // Introductory (and any other level holding Restricted): all of V01
}

/** A person-readable reason an item is disabled, for the dialog. */
export function disabledReason(access: RepositoryAccess, item: RepositoryItem): string | null {
  if (itemAllowed(access, item)) return null;
  if (access.mode === "none") return "Not included in your subscription";
  if (item.chainCode !== RESTRICTED_CHAIN) return "Available on Professional and above";
  return access.levelId === "free" ? "Available on Introductory and above" : "Not available";
}

/** The signed-in user's access, from the Feature Availability grid and their effective subscription level. */
export async function repositoryAccessFor(userId: string): Promise<RepositoryAccess> {
  const featureStates = await getFeatureStates(userId);
  const mode = modeFromStates({
    [REPO_FEATURE_COMPLETE]: featureStates["process-repository-complete"],
    [REPO_FEATURE_RESTRICTED]: featureStates["process-repository-restricted"],
  });
  return { mode, levelId: await resolveEffectiveLevelId(userId) };
}
