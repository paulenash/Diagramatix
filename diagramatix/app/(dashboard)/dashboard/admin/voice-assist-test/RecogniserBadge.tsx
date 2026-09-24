"use client";
/**
 * What the recogniser key in THIS environment can do — said on the screen.
 *
 * Paul, 2026-09-24: "so when we push to prod I can easily see what type of key
 * is installed there." The question that prompted it cost an hour: local held a
 * restricted key and production held an Owner key, the only symptom was live
 * dictation quietly using the browser engine, and nothing in the product said
 * so. A restricted key is not an error — it transcribes perfectly well — which
 * is exactly why it needs stating rather than erroring.
 *
 * The fingerprint is a one-way hash of the key, so the same strip on prod and
 * on local answers "is it the same key?" without either being disclosed.
 */
import { useEffect, useState } from "react";

interface Status {
  configured: boolean;
  kind: "none" | "invalid" | "restricted" | "owner";
  fingerprint?: string;
  summary: string;
  model: string;
  language: string;
  asrFingerprint: string;
}

const TONE: Record<Status["kind"], string> = {
  owner: "border-green-200 bg-green-50 text-green-900",
  restricted: "border-amber-200 bg-amber-50 text-amber-900",
  invalid: "border-red-200 bg-red-50 text-red-900",
  none: "border-gray-200 bg-gray-50 text-gray-700",
};

const LABEL: Record<Status["kind"], string> = {
  owner: "Owner key",
  restricted: "Restricted key",
  invalid: "Key rejected",
  none: "No key",
};

export function RecogniserBadge() {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin/voice-assist-test/recogniser", { cache: "no-store" });
        if (!res.ok) throw new Error(`recogniser check failed (${res.status})`);
        const j = await res.json() as Status;
        if (live) setS(j);
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : "could not check the recogniser key");
      }
    })();
    return () => { live = false; };
  }, []);

  if (err) return <p className="mb-4 text-xs text-red-700">{err}</p>;
  if (!s) return <p className="mb-4 text-xs text-gray-400">Checking the recogniser key…</p>;

  return (
    <div className={`mb-4 px-3 py-2 rounded border text-xs ${TONE[s.kind]}`}>
      <div className="flex flex-wrap items-center gap-2">
        <strong>Recogniser: {LABEL[s.kind]}</strong>
        {s.fingerprint && (
          <span className="font-mono text-[11px] opacity-70" title="A one-way hash of the key — compare it with another environment to tell whether the same key is installed. The key itself is never sent here.">
            #{s.fingerprint}
          </span>
        )}
        <span className="opacity-60">· {s.model} · {s.language}</span>
      </div>
      <div className="mt-0.5">{s.summary}</div>
    </div>
  );
}
