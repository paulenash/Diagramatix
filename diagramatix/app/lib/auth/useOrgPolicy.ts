"use client";
/**
 * Client hook: the enterprise governance policy for the caller's active org,
 * fetched once and cached at module scope so every view shares one request.
 * Renders immediately as all-allowed, then swaps in the real policy — so a
 * client can hide/disable capabilities the org turned off. The server routes
 * enforce the policy regardless; this is only UX.
 */
import { useEffect, useState } from "react";
import type { OrgPolicy, OrgPolicyKey } from "@/app/lib/auth/orgPolicy";

const ALL_TRUE: OrgPolicy = {
  allowAi: true, allowVoiceAi: true, allowExternalExport: true, allowSharePoint: true, allowSupportDiagram: true,
};

function normalise(raw: unknown): OrgPolicy {
  const p = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const out = { ...ALL_TRUE };
  (Object.keys(ALL_TRUE) as OrgPolicyKey[]).forEach((k) => { if (p[k] === false) out[k] = false; });
  return out;
}

let cache: OrgPolicy | null = null;
// Deployment-level "SharePoint is configured (AZURE_* env present)" flag, from the
// same /api/org/policy fetch. Unknown (pre-load / fetch error) → true, so we never
// falsely grey a working SharePoint (the API enforces regardless).
let spConfigured = true;
let inflight: Promise<OrgPolicy> | null = null;

function load(): Promise<OrgPolicy> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/org/policy")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { cache = normalise(j?.policy); spConfigured = j?.sharePointConfigured !== false; return cache!; })
      .catch(() => { cache = ALL_TRUE; spConfigured = true; return cache; });
  }
  return inflight;
}

export function useOrgPolicy(): OrgPolicy {
  const [policy, setPolicy] = useState<OrgPolicy>(cache ?? ALL_TRUE);
  useEffect(() => {
    let on = true;
    load().then((p) => { if (on) setPolicy(p); });
    return () => { on = false; };
  }, []);
  return policy;
}

/**
 * Whether SharePoint options should be OFFERED to the client — the deployment has
 * Microsoft Entra ID configured AND the active org's policy allows SharePoint.
 * Use to grey out (disable) SharePoint menu items when false.
 */
export function useSharePointAvailable(): boolean {
  const policy = useOrgPolicy();
  const [configured, setConfigured] = useState<boolean>(spConfigured);
  useEffect(() => {
    let on = true;
    load().then(() => { if (on) setConfigured(spConfigured); });
    return () => { on = false; };
  }, []);
  return configured && policy.allowSharePoint;
}
