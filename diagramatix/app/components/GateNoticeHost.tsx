"use client";

import { useEffect, useState } from "react";
import { GATE_NOTICE_EVENT } from "@/app/lib/subscription/gateNotice";
import type { GateNotice } from "@/app/lib/subscription/messages";

/**
 * Shows the notice a subscription gate produced (a limit reached, a feature
 * not in the plan, a trial ended, an organisation's policy) — with the way
 * forward when there is one. Mounted once, in the root layout; anything can
 * raise it through `showGateNotice` (app/lib/subscription/gateNotice.ts).
 * Not a browser dialog: a real modal, dismissible with Escape or the button.
 */
export function GateNoticeHost() {
  const [notice, setNotice] = useState<GateNotice | null>(null);

  useEffect(() => {
    const on = (e: Event) => setNotice((e as CustomEvent<GateNotice>).detail);
    window.addEventListener(GATE_NOTICE_EVENT, on);
    return () => window.removeEventListener(GATE_NOTICE_EVENT, on);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setNotice(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [notice]);

  if (!notice) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setNotice(null)}>
      <div role="alertdialog" aria-labelledby="gate-notice-title" aria-describedby="gate-notice-detail"
        className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 id="gate-notice-title" className="text-base font-semibold text-gray-900 mb-1.5">{notice.title}</h2>
        <p id="gate-notice-detail" className="text-sm text-gray-600 mb-4">{notice.detail}</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setNotice(null)} className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Close</button>
          {notice.upgradeHref && (
            <a href={notice.upgradeHref} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">{notice.upgradeLabel ?? "See plans"}</a>
          )}
        </div>
      </div>
    </div>
  );
}
