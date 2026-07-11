"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * SuperAdmin "presentation mode". Double-clicking the Diagramatix logo (top-left)
 * toggles hiding of SuperAdmin-only UI chrome — the SuperAdmin chips, the project
 * Org-reassign dropdown, and the SuperAdmin AI options — and relabels the
 * subscription tier to "Expert", so a SuperAdmin can demo / screenshot the app as
 * an ordinary user. The state is persisted in localStorage so it survives
 * navigation between the Dashboard, Project and Diagram screens, and is synced
 * live within a page (and across tabs) via a window event.
 *
 * Returns `{ hidden, toggle }`. Only the header component (which renders the logo)
 * wires `toggle` to an onDoubleClick; every other consumer just reads `hidden`.
 * Strictly a no-op for non-SuperAdmins: `toggle` does nothing and `hidden` is
 * always false.
 */
const KEY = "dgx.superAdminChromeHidden";
const EVENT = "dgx:superadmin-chrome";

function read(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function useSuperAdminChrome(isSuperAdmin: boolean): { hidden: boolean; toggle: () => void } {
  const [hidden, setHidden] = useState(false);

  // Initial read (client only) + live sync from the toggle / other tabs / other
  // components mounting this hook on the same page.
  useEffect(() => {
    if (!isSuperAdmin) { setHidden(false); return; }
    setHidden(read());
    const sync = () => setHidden(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, [isSuperAdmin]);

  const toggle = useCallback(() => {
    if (!isSuperAdmin) return;
    try { localStorage.setItem(KEY, read() ? "0" : "1"); } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVENT));
  }, [isSuperAdmin]);

  return { hidden: isSuperAdmin && hidden, toggle };
}
