"use client";
/**
 * Whether AI Generation is allowed for the current user in their active org — the
 * same rule the Diagram toolbar's AI Generate button uses, so every AI entry point
 * (mining AI-curate, APQC Create Process, …) can hide consistently when an org
 * disables AI. Accounts for the SuperAdmin view-mode bypass (a SuperAdmin in the
 * full "superadmin" view is exempt; orgadmin/user views are bound) and updates
 * live as the SuperAdmin cycles the logo. Server routes enforce it regardless;
 * this is only UX.
 */
import { useSession } from "next-auth/react";
import { useOrgPolicy } from "@/app/lib/auth/useOrgPolicy";
import { useSuperAdminChrome } from "@/app/hooks/useSuperAdminChrome";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";

export function useAiAllowed(): boolean {
  const { data } = useSession();
  const isSuperAdmin = !!data?.user?.email && SUPERUSER_EMAILS.has(data.user.email.toLowerCase());
  const { hidden: superAdminHidden } = useSuperAdminChrome(isSuperAdmin);
  const policy = useOrgPolicy();
  const bound = !isSuperAdmin || superAdminHidden; // policy binds unless a full-view SuperAdmin
  return policy.allowAi || !bound;
}
