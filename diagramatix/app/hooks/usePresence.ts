/**
 * Co-authoring presence — polls POST /api/diagrams/[id]/presence on a heartbeat
 * (~8 s), sending this client's current selection / editing ids and receiving
 * the live roster + soft-lock map. No server-push infra needed (same "poll a
 * REST route" pattern as the notifications bell).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface PresenceMember {
  userId: string;
  userName: string;
  color: string;
  editingElementIds: string[];
  isSelf: boolean;
}
export interface PresenceLock { userId: string; userName: string; color: string }

export function usePresence(
  diagramId: string,
  opts: {
    enabled: boolean;
    userName?: string;
    selection?: string[];
    editingElementIds?: string[];
    intervalMs?: number;
  },
) {
  const { enabled, userName, intervalMs = 8000 } = opts;
  const [roster, setRoster] = useState<PresenceMember[]>([]);
  const [locks, setLocks] = useState<Record<string, PresenceLock>>({});
  // Latest selection / editing ids live in a ref so each heartbeat sends the
  // current values without re-subscribing the interval on every change.
  const stateRef = useRef<{ selection: string[]; editingElementIds: string[] }>({
    selection: opts.selection ?? [],
    editingElementIds: opts.editingElementIds ?? [],
  });
  stateRef.current = {
    selection: opts.selection ?? [],
    editingElementIds: opts.editingElementIds ?? [],
  };

  const beat = useCallback(async () => {
    try {
      const res = await fetch(`/api/diagrams/${diagramId}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName,
          selection: stateRef.current.selection,
          editingElementIds: stateRef.current.editingElementIds,
        }),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data) return;
      setRoster(Array.isArray(data.roster) ? data.roster : []);
      setLocks(data.locks && typeof data.locks === "object" ? data.locks : {});
    } catch {
      /* transient network error — next heartbeat retries */
    }
  }, [diagramId, userName]);

  useEffect(() => {
    if (!enabled) { setRoster([]); setLocks({}); return; }
    void beat();
    const t = setInterval(() => void beat(), intervalMs);
    const clear = () => {
      try {
        void fetch(`/api/diagrams/${diagramId}/presence`, { method: "DELETE", keepalive: true });
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", clear);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", clear);
      clear();
    };
  }, [enabled, beat, intervalMs, diagramId]);

  return { roster, locks };
}
