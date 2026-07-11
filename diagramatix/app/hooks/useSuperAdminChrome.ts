"use client";

import { useEffect, useState } from "react";

/**
 * SuperAdmin "presentation mode". Ctrl+Shift+S toggles hiding of SuperAdmin-only
 * UI chrome (the SuperAdmin chips, the project Org selector) and relabels the
 * subscription tier to "Expert" — so a SuperAdmin can demo / screenshot the app
 * as an ordinary user. The state is persisted in localStorage so it survives
 * navigation between the Dashboard, Project and Diagram screens, and is synced
 * live within a page (and across tabs) via a window event.
 *
 * Strictly a no-op for non-SuperAdmins: the keyboard toggle isn't even wired up
 * for them, and the returned flag is always false.
 */
const KEY = "dgx.superAdminChromeHidden";
const EVENT = "dgx:superadmin-chrome";

function read(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function useSuperAdminChrome(isSuperAdmin: boolean): boolean {
  const [hidden, setHidden] = useState(false);

  // Initial read (client only) + live sync from the toggle / other tabs.
  useEffect(() => {
    if (!isSuperAdmin) { setHidden(false); return; }
    setHidden(read());
    const sync = () => setHidden(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, [isSuperAdmin]);

  // Ctrl+Shift+S toggles it — SuperAdmins only, so it does nothing for anyone else.
  useEffect(() => {
    if (!isSuperAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      // `e.code === "KeyS"` is keyboard-layout-independent (the physical S key).
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyS") {
        e.preventDefault();
        try { localStorage.setItem(KEY, read() ? "0" : "1"); } catch { /* ignore */ }
        window.dispatchEvent(new Event(EVENT));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSuperAdmin]);

  return isSuperAdmin && hidden;
}
