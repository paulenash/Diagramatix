/**
 * Mobile Access — whether the phone app (/m) is open to a user, and if not, why.
 *
 * It is the `mobile` feature, which REQUIRES Process Review and Voice Assist
 * (registry `requires`, dependencies.ts), so the states handed in here are the
 * resolved ones and already reflect the prerequisites. Pure.
 */
import { blockedBy, type DepState } from "./dependencies";
import { FEATURE_DEF } from "./registry";

export interface MobileAccess {
  allowed: boolean;
  /** The resolved state of the `mobile` feature. */
  state: DepState;
  /** The prerequisite holding it back (its label), when that — not Mobile's own cell — is the reason. */
  blockedByLabel: string | null;
  /** The sentence to show when it is not allowed. */
  message: string;
}

export function mobileAccess(states: Record<string, DepState> | null | undefined): MobileAccess {
  const map = states ?? {};
  const state: DepState = map["mobile"] ?? "hidden";
  if (state === "available") return { allowed: true, state, blockedByLabel: null, message: "" };
  const need = blockedBy(map, "mobile");
  const blockedByLabel = need ? (FEATURE_DEF[need]?.label ?? need) : null;
  const message = blockedByLabel
    ? `Mobile access needs ${blockedByLabel}, which isn’t included in your plan.`
    : "Mobile access isn’t included in your plan.";
  return { allowed: false, state, blockedByLabel, message };
}
