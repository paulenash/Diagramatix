"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Status {
  eligible: boolean;
  name?: string | null;
  oldEmail?: string;
  done?: boolean;
  oldFound?: boolean;
  pending?: boolean;
  summary?: string;
}
interface OrgInfo { orgName: string; orgId: string | null; role: string | null; changes: string[] }

const SEEN_KEY = "dgx.superadminWelcome.seen";

/**
 * Welcomes Paul and Greg as SuperAdmin when they sign in with their new addresses, and — once — asks them to confirm moving
 * everything the old address owned (projects, memberships, every other reference) to the new one (Paul, 2026-10-05). Mounted
 * in the root layout ONLY for those two addresses, so nobody else ever fetches it. "Not now" asks again next sign-in; once
 * confirmed the server records it and it never asks again. A real modal, not a browser dialog.
 */
export function SuperAdminWelcome() {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/superadmin/account-migration", { cache: "no-store" });
        if (!r.ok) return;
        const s = (await r.json()) as Status;
        if (!alive || !s.eligible) return;
        setStatus(s);
        // Make the organisation right (Paul: "Diagramatix"; Greg: "GetAI Org"; each its administrator) — idempotent.
        try {
          const o = await fetch("/api/superadmin/account-migration", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ensure-org" }),
          });
          const oj = (await o.json().catch(() => ({}))) as { org?: OrgInfo | null };
          if (alive && oj.org) { setOrg(oj.org); if (oj.org.changes.some((c) => !c.endsWith("was not found"))) router.refresh(); }
        } catch { /* a courtesy */ }
        let seen = false;
        try { seen = sessionStorage.getItem(SEEN_KEY) === "1"; } catch { /* private window: show it */ }
        if (!seen || s.pending) setOpen(true);
      } catch { /* the welcome is a courtesy; never break the page */ }
    })();
    return () => { alive = false; };
  }, []);

  function close() {
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, busy]);

  async function confirmMove() {
    setBusy(true);
    try {
      const r = await fetch("/api/superadmin/account-migration", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; moved?: string; skipped?: string; error?: string };
      if (!r.ok || !j.ok) { setResult({ ok: false, text: j.error ?? "The move did not run — nothing was changed." }); return; }
      setStatus((s) => (s ? { ...s, pending: false, done: true } : s));
      setResult({
        ok: true,
        text: `Moved ${j.moved || "nothing"} to this account.` + (j.skipped ? ` Left with the old account because this one already had an equivalent: ${j.skipped}.` : ""),
      });
    } finally { setBusy(false); }
  }

  if (!open || !status) return null;
  const first = (status.name ?? "").trim().split(/\s+/)[0];
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4" data-testid="superadmin-welcome">
      <div role="dialog" aria-labelledby="sa-welcome-title" className="w-full max-w-md rounded-xl bg-white shadow-xl p-5">
        <h2 id="sa-welcome-title" className="text-base font-semibold text-gray-900 mb-1.5">
          Welcome{first ? `, ${first}` : ""} — you are signed in as a SuperAdmin
        </h2>
        {status.pending && !result && (
          <>
            <p className="text-sm text-gray-600 mb-2">
              Your previous SuperAdmin address, <b>{status.oldEmail}</b>, still holds {status.summary}.
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Move all of it, and every other reference to that account, to this one? The old account is left in place, empty. This asks once.
            </p>
          </>
        )}
        {result && (
          <p className={`text-sm mb-4 ${result.ok ? "text-green-700" : "text-red-600"}`} role="status">{result.text}</p>
        )}
        {org && org.orgId && (
          <p className="text-sm text-gray-600 mb-3" data-testid="superadmin-org">
            Your organisation is <b>{org.orgName}</b>, and you are its {org.role === "Owner" ? "Owner and administrator" : "administrator"}.
          </p>
        )}
        {org && !org.orgId && <p className="text-sm text-amber-700 mb-3">{org.changes[0]}.</p>}
        {!status.pending && !result && <p className="text-sm text-gray-600 mb-4">Everything is in place on this account.</p>}
        <div className="flex justify-end gap-2">
          {status.pending && !result?.ok ? (
            <>
              <button onClick={close} disabled={busy} className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">Not now</button>
              <button onClick={confirmMove} disabled={busy} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {busy ? "Moving…" : "Confirm — move everything"}
              </button>
            </>
          ) : (
            <button onClick={close} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Continue</button>
          )}
        </div>
      </div>
    </div>
  );
}
