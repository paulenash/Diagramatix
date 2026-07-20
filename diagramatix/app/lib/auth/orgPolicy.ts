// Server-only. Enterprise governance policy — per-org switches a customer sets so
// the platform enforces THEIR policy (disable AI, block external export, etc.).
// Mirrors the Org.allowCrossOrgSharing precedent. Phase A1c; see diagramatix/enterprise/.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/db";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";

type Session = Parameters<typeof tryGetCurrentOrgId>[0];

export type OrgPolicyKey =
  | "allowAi" | "allowVoiceAi" | "allowExternalExport" | "allowSharePoint" | "allowSupportDiagram";

export const ORG_POLICY_KEYS: OrgPolicyKey[] =
  ["allowAi", "allowVoiceAi", "allowExternalExport", "allowSharePoint", "allowSupportDiagram"];

/** User-facing 403 message per policy. */
export const ORG_POLICY_MESSAGES: Record<OrgPolicyKey, string> = {
  allowAi: "AI features are turned off by your organisation's policy.",
  allowVoiceAi: "Voice transcription is turned off by your organisation's policy.",
  allowExternalExport: "Exporting data out of Diagramatix is turned off by your organisation's policy.",
  allowSharePoint: "The SharePoint integration is turned off by your organisation's policy.",
  allowSupportDiagram: "Attaching diagram content to support requests is turned off by your organisation's policy.",
};

export type OrgPolicy = Record<OrgPolicyKey, boolean>;

/** The full policy for an org (all default true when the org isn't found). */
export async function getOrgPolicy(orgId: string): Promise<OrgPolicy> {
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { allowAi: true, allowVoiceAi: true, allowExternalExport: true, allowSharePoint: true, allowSupportDiagram: true },
  });
  return {
    allowAi: org?.allowAi ?? true,
    allowVoiceAi: org?.allowVoiceAi ?? true,
    allowExternalExport: org?.allowExternalExport ?? true,
    allowSharePoint: org?.allowSharePoint ?? true,
    allowSupportDiagram: org?.allowSupportDiagram ?? true,
  };
}

/** Non-throwing check for the caller's active org. No active org → allowed. */
export async function orgPolicyAllows(session: Session, key: OrgPolicyKey): Promise<boolean> {
  const orgId = await tryGetCurrentOrgId(session, await cookies());
  if (!orgId) return true;
  const policy = await getOrgPolicy(orgId);
  return policy[key];
}

/**
 * Route guard: returns a 403 NextResponse when the caller's active org disables
 * `key`, else null. Usage:
 *   const blocked = await gateOrgPolicy(session, "allowAi");
 *   if (blocked) return blocked;
 * Applies to everyone acting in that org (including SuperAdmins) — the policy is
 * the customer's, so we don't bypass it.
 */
export async function gateOrgPolicy(session: Session, key: OrgPolicyKey): Promise<NextResponse | null> {
  const allowed = await orgPolicyAllows(session, key);
  return allowed ? null : NextResponse.json({ error: ORG_POLICY_MESSAGES[key] }, { status: 403 });
}
