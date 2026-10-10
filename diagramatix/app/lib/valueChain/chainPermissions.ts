/**
 * Who may manage a value chain a USER created with "Create a New Value Chain" (Paul, 2026-10-10: "managed by the original owner, the
 * OrgAdmin, and the SuperAdmin"). One function per question, used by every route that touches such a chain, so the rule cannot be
 * remembered differently in two places (a source-scan test fails if a user-chain route skips it).
 *
 *   manage  — read the draft, edit the narrative / processes / prompts, regenerate, publish, unpublish, resume a stopped run:
 *             the owner, an OrgAdmin of the chain's Org, and a SuperAdmin.
 *   delete  — the owner (their own work) and a SuperAdmin. An OrgAdmin never deletes (the standing rule: OrgAdmins delete nothing); they
 *             can unpublish a chain, which takes it out of the Org's list.
 *
 * A chain in another Org is invisible to everyone but a SuperAdmin: callers answer "not found", never "forbidden".
 */
export interface ChainActor {
  userId: string;
  orgId: string;
  isSuper: boolean;
  isOrgAdmin: boolean;
}

export interface ChainOwnership {
  /** "" is the master repository. */
  orgId: string;
  createdByUserId: string | null;
}

/** Is this a chain a user created (as opposed to the master's, or one adopted from it)? */
export const isUserChain = (c: ChainOwnership): boolean => !!c.orgId && !!c.createdByUserId;

export function canManageChain(actor: ChainActor, chain: ChainOwnership): boolean {
  if (actor.isSuper) return true;
  if (!chain.orgId || chain.orgId !== actor.orgId) return false;       // the master, or another Org's: never
  if (actor.isOrgAdmin) return true;
  return !!chain.createdByUserId && chain.createdByUserId === actor.userId;
}

export function canDeleteChain(actor: ChainActor, chain: ChainOwnership): boolean {
  if (actor.isSuper) return true;
  if (!chain.orgId || chain.orgId !== actor.orgId) return false;
  return !!chain.createdByUserId && chain.createdByUserId === actor.userId;   // the owner only — not the OrgAdmin
}
