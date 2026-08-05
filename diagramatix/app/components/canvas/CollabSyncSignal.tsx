"use client";
/**
 * Group alignment: broadcast this session's committed diagram version, and when
 * ANY other participant's committed version advances beyond ours, auto-align —
 * pull their committed doc and merge it into ours (no push). So one person's
 * Sync brings the whole group into line. Non-visual.
 */
import { useEffect, useRef } from "react";
import { useOthers, useUpdateMyPresence } from "@liveblocks/react";

export function CollabSyncSignal({ version, onRemoteAdvance }: { version: number; onRemoteAdvance: () => void }) {
  const updateMyPresence = useUpdateMyPresence();
  const others = useOthers();
  const cb = useRef(onRemoteAdvance);
  cb.current = onRemoteAdvance;
  const myVersion = useRef(version);
  myVersion.current = version;
  const lastTriggered = useRef(0);

  // Broadcast our committed version.
  useEffect(() => { updateMyPresence({ syncedVersion: version }); }, [version, updateMyPresence]);

  // Someone else committed a newer version → align once (guard against firing on
  // every presence tick, e.g. cursor moves).
  useEffect(() => {
    let maxOther = 0;
    for (const o of others) maxOther = Math.max(maxOther, o.presence.syncedVersion ?? 0);
    if (maxOther > myVersion.current && maxOther > lastTriggered.current) {
      lastTriggered.current = maxOther;
      cb.current();
    }
  }, [others]);

  return null;
}
