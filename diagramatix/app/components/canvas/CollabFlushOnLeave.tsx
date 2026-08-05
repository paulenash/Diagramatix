"use client";
/**
 * Hard-flush the co-authoring room when this session ends. Beacons the flush
 * route on tab close (`pagehide`) AND on component unmount (SPA navigation away
 * from the diagram), so an abrupt exit can't leave zombie presence behind for
 * the next joint session. Deleting a presence-only room is safe — everyone
 * auto-reconnects into a fresh one. Non-visual.
 */
import { useEffect, useRef } from "react";

export function CollabFlushOnLeave({ diagramId }: { diagramId: string }) {
  const idRef = useRef(diagramId);
  idRef.current = diagramId;

  useEffect(() => {
    const flush = () => {
      try {
        const body = new Blob([JSON.stringify({ diagramId: idRef.current })], { type: "application/json" });
        navigator.sendBeacon("/api/collab/flush", body);
      } catch { /* best effort */ }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush(); // SPA navigation away from the diagram
    };
  }, []);

  return null;
}
