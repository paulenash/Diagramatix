"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { refresh as refreshFeatureStore } from "@/app/lib/features/featureStateStore";

/**
 * SuperAdmin "view mode" — double-clicking the Diagramatix logo (top-left) cycles
 * a SuperAdmin through five views so they can use / demo / screenshot the app as
 * different roles AND at each customer subscription tier:
 *
 *   superadmin → orgadmin → enterprise → expert → professional → introductory → free → (back to) superadmin
 *
 *   • superadmin   — full SuperAdmin chrome (chips, Org-reassign, SuperAdmin AI
 *     options), tier shows normally, and enterprise Org policy is BYPASSED.
 *   • orgadmin     — SuperAdmin chrome hidden, the OrgAdmin button shown, behaves
 *     as an OrgAdmin for the active org; Org policy APPLIES.
 *   • expert       — ordinary member on the Expert tier; no admin chrome.
 *   • professional — ordinary member on the Professional tier.
 *   • introductory — ordinary member on the Introductory tier.
 *   (all three "tier" views: no admin chrome, Org policy APPLIES.)
 *
 * The mode is persisted in localStorage (survives navigation, synced across tabs /
 * components via a window event) AND mirrored to the `dgx_sa_mode` cookie so the
 * SERVER can apply policy accordingly (see app/lib/auth/orgPolicy.ts).
 *
 * `hidden` = "hide SuperAdmin chrome" = mode !== "superadmin", so every existing
 * consumer that reads `hidden` keeps working (SuperAdmin chrome shows only in the
 * superadmin view). Strictly a no-op for non-SuperAdmins.
 */
export type AdminViewMode = "superadmin" | "orgadmin" | "enterprise" | "expert" | "professional" | "introductory" | "free";

/** The subscription tier a given view mode previews as — used to relabel the
 *  tier chip. null = show the real tier (superadmin / orgadmin aren't tier views). */
export const VIEW_MODE_TIER: Record<AdminViewMode, string | null> = {
  superadmin: null,
  orgadmin: null,
  enterprise: "Enterprise",
  expert: "Expert",
  professional: "Professional",
  introductory: "Introductory",
  free: "Free",
};

/** The four allocatable feature flags (mirrors subscription.ts `Entitlements`,
 *  redeclared here so this client hook needs no server import). */
export interface ViewModeEntitlements {
  simulator: boolean;
  processMining: boolean;
  riskControl: boolean;
  apqc: boolean;
}

/**
 * There used to be a hand-written table here of which features each TIER view showed. It never read
 * the Feature Availability matrix, so it drifted from it, and it only hid buttons — every API gate
 * still passed as a SuperAdmin. The SERVER now evaluates as the previewed level (the `dgx_sa_mode`
 * cookie, app/lib/features/actAs.ts), so the real entitlements and feature states already ARE the
 * previewed level's, and there is nothing left to overlay. These two remain only so their callers
 * keep compiling.
 */
export function viewModeEntitlements(_mode: AdminViewMode): ViewModeEntitlements | null {
  return null;
}

export function effectiveEntitlements<T extends ViewModeEntitlements>(_mode: AdminViewMode, base: T): T {
  return base;
}

const KEY = "dgx.superAdminViewMode";
const VER_KEY = "dgx.superAdminViewModeBuild";
const EVENT = "dgx:superadmin-chrome";
const COOKIE = "dgx_sa_mode";
const ORDER: AdminViewMode[] = ["superadmin", "orgadmin", "enterprise", "expert", "professional", "introductory", "free"];
// Build stamp (commit count, baked in per deploy). A new build resets the view
// mode to "superadmin" so the demo mode never survives a deployment (local or prod).
const BUILD = process.env.NEXT_PUBLIC_COMMIT_COUNT ?? "0";

function readMode(): AdminViewMode {
  try {
    if (localStorage.getItem(VER_KEY) !== BUILD) {
      localStorage.setItem(VER_KEY, BUILD);
      localStorage.setItem(KEY, "superadmin");
      return "superadmin";
    }
    const v = localStorage.getItem(KEY);
    // Migrate the legacy "user" value to the equivalent top tier ("expert").
    if (v === "user") return "expert";
    return v && (ORDER as string[]).includes(v) ? (v as AdminViewMode) : "superadmin";
  } catch { return "superadmin"; }
}

function writeCookie(mode: AdminViewMode): void {
  try { document.cookie = `${COOKIE}=${mode}; path=/; samesite=lax; max-age=31536000`; } catch { /* ignore */ }
}

export function useSuperAdminChrome(isSuperAdmin: boolean): { mode: AdminViewMode; hidden: boolean; toggle: () => void } {
  const [mode, setMode] = useState<AdminViewMode>("superadmin");
  const router = useRouter();

  useEffect(() => {
    if (!isSuperAdmin) { setMode("superadmin"); writeCookie("superadmin"); return; }
    const m = readMode();
    setMode(m);
    writeCookie(m); // keep the server-readable cookie in sync with stored state
    const sync = () => { const v = readMode(); setMode(v); writeCookie(v); };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, [isSuperAdmin]);

  const toggle = useCallback(() => {
    if (!isSuperAdmin) return;
    const next = ORDER[(ORDER.indexOf(readMode()) + 1) % ORDER.length];
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
    writeCookie(next);
    window.dispatchEvent(new Event(EVENT));
    // The server now evaluates as the previewed level: re-read the feature states and re-render the
    // server components (router.refresh keeps client state, so an open editor is not lost).
    void refreshFeatureStore();
    router.refresh();
  }, [isSuperAdmin, router]);

  const effective: AdminViewMode = isSuperAdmin ? mode : "superadmin";
  return { mode: effective, hidden: isSuperAdmin && effective !== "superadmin", toggle };
}
