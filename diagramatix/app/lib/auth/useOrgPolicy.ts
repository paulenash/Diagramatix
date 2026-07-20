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
let inflight: Promise<OrgPolicy> | null = null;

function load(): Promise<OrgPolicy> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/org/policy")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { cache = normalise(j?.policy); return cache!; })
      .catch(() => { cache = ALL_TRUE; return cache; });
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
