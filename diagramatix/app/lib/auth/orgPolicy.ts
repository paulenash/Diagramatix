// Server-only. Enterprise governance policy — per-org switches a customer sets so
// the platform enforces THEIR policy (disable AI, block external export, etc.).
// Mirrors the Org.allowCrossOrgSharing precedent. Phase A1c; see diagramatix/enterprise/.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/db";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { isSuperuser } from "@/app/lib/superuser";

type Session = Parameters<typeof tryGetCurrentOrgId>[0];

/** Cookie mirroring the SuperAdmin view mode (see app/hooks/useSuperAdminChrome.ts):
 *  "superadmin" | "orgadmin" | "user". Lets the server apply policy as the mode dictates. */
export const SA_MODE_COOKIE = "dgx_sa_mode";

/**
 * Whether org policy binds THIS caller. It binds everyone EXCEPT a SuperAdmin in
 * the full "superadmin" view — the vendor operator keeps full access there. When
 * a SuperAdmin switches to the "orgadmin" or "user" view (by cycling the logo),
 * they experience the app as that role and the org's policy applies (this is also
 * how a SuperAdmin demonstrates the policy).
 */
async function policyBindsCaller(session: Session): Promise<boolean> {
  if (!isSuperuser(session ?? null)) return true;
  const mode = (await cookies()).get(SA_MODE_COOKIE)?.value;
  return mode === "orgadmin" || mode === "user"; // absent/"superadmin" → bypass
}

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

/** Non-throwing check for the caller's active org. No active org → allowed.
 *  A non-presenting SuperAdmin is never bound (returns true). */
export async function orgPolicyAllows(session: Session, key: OrgPolicyKey): Promise<boolean> {
  if (!(await policyBindsCaller(session))) return true;
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
