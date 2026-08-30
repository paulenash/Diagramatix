"use client";

/**
 * SuperAdmin — Process API keys.
 *
 * Mint a key for a partner, see how each is being used, move one between
 * phases, revoke one.
 *
 * The screen has one job it must not get wrong: **the raw key is shown once**.
 * It is stored only as a SHA-256, so a key that is closed without being copied
 * is gone and has to be re-minted. The reveal panel therefore stays until it is
 * dismissed deliberately, and says so in words.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { AlertDialog } from "@/app/components/AlertDialog";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  org: string | null;
  orgId: string;
  serviceUser: string | null;
  project: string | null;
  scopes: string[];
  phase: string;
  captureUntil: string | null;
  rateLimitPerMin: number;
  dailyJobLimit: number;
  revokedAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
}

const PHASES = [
  { id: "internal", label: "Internal", hint: "Our own test harness. Inputs live in the case library." },
  { id: "testing", label: "External test", hint: "A partner's integration window. Their documents ARE kept, until the date you set." },
  { id: "live", label: "Live", hint: "Metadata only — sizes, hashes, timings. Never the content." },
] as const;

const PHASE_STYLE: Record<string, string> = {
  internal: "bg-sky-100 text-sky-800 border-sky-300",
  testing: "bg-amber-100 text-amber-900 border-amber-300",
  live: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export function PartnerKeysClient() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** The one-and-only sighting of a freshly minted key. */
  const [minted, setMinted] = useState<{ key: string; prefix: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  /** Browser dialogs are banned in this codebase — these drive the house ones. */
  const [confirming, setConfirming] = useState<
    { title: string; message: string; confirmLabel: string; run: () => void } | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Mint form
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [serviceUserEmail, setServiceUserEmail] = useState("");
  const [phase, setPhase] = useState<string>("live");
  const [captureUntil, setCaptureUntil] = useState("");
  /** Create a robot account in the chosen org rather than requiring one to
   *  exist. A real partner org has exactly one member — its owner — and an
   *  owner cannot be a service account, so this is the normal path, not the
   *  exception. */
  const [makeAccount, setMakeAccount] = useState(true);
  /** Orgs and their members, so nobody has to know an internal id. Each member
   *  is marked eligible or not WITH the reason, rather than letting the mint
   *  fail afterwards. */
  const [orgs, setOrgs] = useState<{
    id: string; name: string;
    members: { email: string; role: string; eligible: boolean; why: string | null }[];
  }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/partner-keys", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Could not load the keys"); return; }
      setKeys(j.keys ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void fetch("/api/admin/partner-keys?lookup=orgs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { orgs: [] }))
      .then((j) => setOrgs(j.orgs ?? []))
      .catch(() => {});
  }, []);

  /** One click. The harness key needs no choices — see the route: it
   *  provisions its own org and robot account and reuses them after. */
  async function mintHarness() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/partner-keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: "harness", phase: "internal", name: "Harness (scratch)" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Could not mint the harness key"); return; }
      setMinted({ key: j.key, prefix: j.prefix, name: "Harness (scratch)" });
      await load();
    } finally { setBusy(false); }
  }

  async function mint() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/partner-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), orgId: orgId.trim(),
          serviceUserEmail: makeAccount ? undefined : serviceUserEmail.trim(),
          createServiceAccount: makeAccount,
          phase, captureUntil: phase === "testing" && captureUntil ? new Date(captureUntil).toISOString() : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Could not mint the key"); return; }
      setMinted({ key: j.key, prefix: j.prefix, name: name.trim() });
      setOpen(false); setName(""); setOrgId(""); setServiceUserEmail(""); setCaptureUntil("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/partner-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "That did not work"); return; }
      if (typeof j.purgedBodies === "number" && j.purgedBodies > 0) {
        // Not an error — a confirmation worth seeing, because it deleted something.
        setNotice(`Moved to live. Cleared the captured request data on ${j.purgedBodies} call${j.purgedBodies === 1 ? "" : "s"}.`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Link href="/dashboard/admin" className="text-sm text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      <h1 className="text-lg font-semibold text-gray-900 mt-2">Process API keys</h1>
      <p className="text-sm text-gray-600 mt-1">
        Machine access for a partner product. A key is bound to one organisation and one service
        account, and everything it does is done as that account — so a key can never reach a
        project the account cannot.
      </p>

      {/* The one-time reveal. Deliberately loud and deliberately sticky. */}
      {minted && (
        <div className="mt-5 rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            Copy this key now — it is not stored and cannot be shown again
          </h2>
          <p className="text-xs text-amber-800 mt-1">
            We keep only its hash. If you lose it, revoke this one and mint another.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded border border-amber-300 bg-white px-3 py-2 font-mono text-sm break-all">
              {minted.key}
            </code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(minted.key).then(() => {
                  setCopied(true); setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="shrink-0 rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <button onClick={() => setMinted(null)} className="mt-3 text-xs text-amber-900 underline hover:text-amber-950">
            I have copied it — hide
          </button>
        </div>
      )}

      {error && <div className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Mint */}
      <div className="mt-5">
        {!open ? (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void mintHarness()} disabled={busy}
              className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">
              + Key for the test harness
            </button>
            <button onClick={() => setOpen(true)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              + Key for a partner…
            </button>
            <span className="text-xs text-gray-500">
              The harness key needs no choices — it uses its own organisation and a robot account.
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="GETAI — production"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Organisation</span>
                <select value={orgId} onChange={(e) => { setOrgId(e.target.value); setServiceUserEmail(""); }}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white">
                  <option value="">Choose…</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Service account</span>
                <label className="flex items-center gap-1.5 text-xs text-gray-700 mb-1">
                  <input type="checkbox" checked={makeAccount} onChange={(e) => setMakeAccount(e.target.checked)}
                    className="rounded border-gray-300 text-teal-700 focus:ring-teal-400" />
                  Create one for this organisation
                </label>
                <select value={serviceUserEmail} onChange={(e) => setServiceUserEmail(e.target.value)}
                  disabled={!orgId || makeAccount}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white disabled:bg-gray-50">
                  <option value="">Choose…</option>
                  {(orgs.find((o) => o.id === orgId)?.members ?? []).map((m) => (
                    <option key={m.email} value={m.email} disabled={!m.eligible}>
                      {m.email} ({m.role}){m.eligible ? "" : " — not eligible"}
                    </option>
                  ))}
                </select>
                {!makeAccount && orgId && !(orgs.find((o) => o.id === orgId)?.members ?? []).some((m) => m.eligible) && (
                  <span className="block text-xs text-amber-700 mt-1">
                    Nobody in this organisation can act as a service account. Every member is an
                    Owner or Admin, which would give the key owner access to every project in it.
                    Add a ProcessOwner account first.
                  </span>
                )}
              </label>
            </div>

            <div>
              <span className="block text-xs font-medium text-gray-600 mb-1.5">Phase — this decides what is retained</span>
              <div className="flex flex-wrap gap-1.5">
                {PHASES.map((p) => (
                  <button key={p.id} onClick={() => setPhase(p.id)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition ${
                      phase === p.id ? PHASE_STYLE[p.id] + " font-medium" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">{PHASES.find((p) => p.id === phase)?.hint}</p>
            </div>

            {phase === "testing" && (
              <label className="block max-w-xs">
                <span className="block text-xs font-medium text-gray-600 mb-1">
                  Retain until <span className="text-amber-700">(required — max 90 days)</span>
                </span>
                <input type="date" value={captureUntil} onChange={(e) => setCaptureUntil(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
                <span className="block text-xs text-gray-500 mt-1">
                  Tell the partner their request data is being kept, and until when.
                </span>
              </label>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => void mint()} disabled={busy || !name.trim() || !orgId.trim() || (!makeAccount && !serviceUserEmail.trim())}
                className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">
                {busy ? "Minting…" : "Mint"}
              </button>
              <button onClick={() => setOpen(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* The keys */}
      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-500">No keys yet.</p>
        ) : (
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            {keys.map((k) => {
              const dead = !!k.revokedAt || (!!k.expiresAt && new Date(k.expiresAt) <= new Date());
              const expiredWindow = k.phase === "testing" && (!k.captureUntil || new Date(k.captureUntil) <= new Date());
              return (
                <div key={k.id} className={`px-3 py-2.5 text-sm ${dead ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{k.name}</span>
                    <code className="text-xs text-gray-500 font-mono">{k.prefix}…</code>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PHASE_STYLE[k.phase] ?? ""}`}>
                      {PHASES.find((p) => p.id === k.phase)?.label ?? k.phase}
                      {k.phase === "testing" && k.captureUntil && ` → ${fmt(k.captureUntil)}`}
                    </span>
                    {expiredWindow && (
                      <span className="text-[10px] text-amber-700" title="The window has closed, so nothing is being retained — but the key is still marked testing.">
                        window closed
                      </span>
                    )}
                    {dead && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">revoked</span>}
                    <span className="ml-auto text-xs text-gray-400">
                      {k.useCount} call{k.useCount === 1 ? "" : "s"} · last {fmt(k.lastUsedAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {k.org} · acts as {k.serviceUser}
                    {k.project ? ` · into ${k.project}` : ""} · {k.rateLimitPerMin}/min, {k.dailyJobLimit}/day
                  </div>
                  {!dead && (
                    <div className="mt-1.5 flex gap-2 text-xs">
                      {k.phase !== "live" && (
                        <button
                          onClick={() => {
                            const go = () => void patch(k.id, { action: "set-phase", phase: "live" });
                            if (k.phase !== "testing") { go(); return; }
                            setConfirming({
                              title: "Move to live?",
                              message: "This also clears the request bodies and documents captured for this key. That is deliberate — going live retires the test data rather than leaving it lying around.",
                              confirmLabel: "Go live and clear",
                              run: go,
                            });
                          }}
                          className="text-emerald-700 hover:underline">Go live</button>
                      )}
                      <button
                        onClick={() => setConfirming({
                          title: `Revoke "${k.name}"?`,
                          message: "Calls using this key start failing immediately. It cannot be un-revoked — mint a new one instead.",
                          confirmLabel: "Revoke",
                          run: () => void patch(k.id, { action: "revoke" }),
                        })}
                        className="text-red-600 hover:underline">Revoke</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title={confirming.title}
          message={confirming.message}
          confirmLabel={confirming.confirmLabel}
          onConfirm={() => { const r = confirming.run; setConfirming(null); r(); }}
          onCancel={() => setConfirming(null)}
        />
      )}
      {notice && <AlertDialog title="Done" message={notice} tone="info" onClose={() => setNotice(null)} />}

      <p className="mt-6 text-xs text-gray-500">
        Verify a key from a terminal:{" "}
        <code className="font-mono">curl -H &quot;X-Api-Key: dgxk_…&quot; {typeof window !== "undefined" ? window.location.origin : ""}/api/public/v1/whoami</code>
      </p>
    </div>
  );
}
