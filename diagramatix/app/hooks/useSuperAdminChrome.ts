"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * SuperAdmin "view mode" — double-clicking the Diagramatix logo (top-left) cycles
 * a SuperAdmin through three views so they can use / demo / screenshot the app as
 * different roles:
 *
 *   superadmin → orgadmin → user → (back to) superadmin
 *
 *   • superadmin — full SuperAdmin chrome (chips, Org-reassign, SuperAdmin AI
 *     options), tier shows normally, and enterprise Org policy is BYPASSED.
 *   • orgadmin   — SuperAdmin chrome hidden, the OrgAdmin button shown, behaves as
 *     an OrgAdmin for the active org; Org policy APPLIES.
 *   • user       — no admin chrome at all, behaves as an ordinary member; Org
 *     policy APPLIES.
 *
 * The mode is persisted in localStorage (survives navigation, synced across tabs /
 * components via a window event) AND mirrored to the `dgx_sa_mode` cookie so the
 * SERVER can apply policy accordingly (see app/lib/auth/orgPolicy.ts).
 *
 * `hidden` = "hide SuperAdmin chrome" = mode !== "superadmin", so every existing
 * consumer that reads `hidden` keeps working (SuperAdmin chrome shows only in the
 * superadmin view). Strictly a no-op for non-SuperAdmins.
 */
export type AdminViewMode = "superadmin" | "orgadmin" | "user";

const KEY = "dgx.superAdminViewMode";
const VER_KEY = "dgx.superAdminViewModeBuild";
const EVENT = "dgx:superadmin-chrome";
const COOKIE = "dgx_sa_mode";
const ORDER: AdminViewMode[] = ["superadmin", "orgadmin", "user"];
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
    return v === "orgadmin" || v === "user" ? v : "superadmin";
  } catch { return "superadmin"; }
}

function writeCookie(mode: AdminViewMode): void {
  try { document.cookie = `${COOKIE}=${mode}; path=/; samesite=lax; max-age=31536000`; } catch { /* ignore */ }
}

export function useSuperAdminChrome(isSuperAdmin: boolean): { mode: AdminViewMode; hidden: boolean; toggle: () => void } {
  const [mode, setMode] = useState<AdminViewMode>("superadmin");

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
  }, [isSuperAdmin]);

  const effective: AdminViewMode = isSuperAdmin ? mode : "superadmin";
  return { mode: effective, hidden: isSuperAdmin && effective !== "superadmin", toggle };
}
