"use client";

/**
 * The editor's autosave — moved VERBATIM out of DiagramEditor.tsx (Stage 4 of
 * mobile voice, 2026-09-29) so the phone's Voice Assist screen (Stage 5) can
 * save the way the desktop does: 1.5 s debounce, the version guard, a three-way
 * merge on a 409, a history row per save. It never collapses review comments
 * (that is the phone reviewer's Save, not this).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { mergeDiagram, type MergeConflict } from "@/app/lib/diagram/mergeDiagram";

/** Co-authoring conflict surfaced by the version guard: another editor saved
 *  since this client loaded, so our data save was rejected (409). We three-way
 *  merge our edits onto theirs; `merged` is the result and `conflicts` lists any
 *  true overlaps (same element/connector changed by both — resolved to theirs). */
export interface SaveConflict {
  serverData: DiagramData;
  merged: DiagramData;
  conflicts: MergeConflict[];
  currentVersion: number;
  lastEditor: string | null;
}

export function useAutoSave(
  diagramId: string,
  data: DiagramData,
  delay = 1500,
  disabled = false,
  initialVersion = 0,
  // Co-authoring: when others are present we go MANUAL — the debounced auto-save
  // is off and the user presses Sync (push + pull + 3-way merge) on each end.
  // A ref (not a value) so it can be computed after presence, below the call.
  manualSyncRef?: { current: boolean },
) {
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SaveConflict | null>(null);
  // The last COMMITTED (synced) document — the baseline for ghosts + the merge base.
  const [syncedData, setSyncedData] = useState<DiagramData>(data);
  // The committed version we're on — broadcast so idle peers auto-align when it advances.
  const [committedVersion, setCommittedVersion] = useState<number>(initialVersion);
  const lastSaved = useRef<string>(JSON.stringify(data));
  // Optimistic-concurrency token: the diagram version this client last saw.
  const versionRef = useRef<number>(initialVersion);

  // Track unsaved changes (no auto-save timer). Runs even in manual mode so the
  // Sync button can show there's something to push.
  useEffect(() => {
    if (disabled) return;
    const current = JSON.stringify(data);
    if (current !== lastSaved.current) {
      setSaveStatus("unsaved");
    }
  }, [data, disabled]);

  const saveNow = useCallback(async () => {
    const current = JSON.stringify(data);
    if (current === lastSaved.current) return;
    if (conflict) return; // paused until the user resolves the conflict
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/diagrams/${diagramId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, version: versionRef.current }),
      });
      if (res.status === 409) {
        // Someone saved under us — three-way merge our edits onto theirs.
        const payload = await res.json().catch(() => ({}));
        const theirs = payload.data as DiagramData;
        let base: DiagramData | null = null;
        try { base = JSON.parse(lastSaved.current) as DiagramData; } catch { base = null; }
        const { merged, conflicts } = base
          ? mergeDiagram(base, data, theirs)
          : { merged: theirs, conflicts: [] as MergeConflict[] };
        setConflict({
          serverData: theirs,
          merged,
          conflicts,
          currentVersion: typeof payload.currentVersion === "number" ? payload.currentVersion : versionRef.current,
          lastEditor: payload.lastEditor ?? null,
        });
        setSaveStatus("unsaved");
        return;
      }
      if (!res.ok) { setSaveStatus("unsaved"); return; }
      const updated = await res.json().catch(() => null);
      if (updated && typeof updated.version === "number") versionRef.current = updated.version;
      lastSaved.current = current;
      setSyncedData(data);
      setCommittedVersion(versionRef.current);
      setLastSavedAt(new Date().toISOString());
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }, [data, diagramId, conflict]);

  /** Co-authoring Sync — PULL everyone's committed changes and PUSH ours, in one
   *  3-way merge, even when we have no local edits. Returns the merged document
   *  for the editor to apply locally (setData). Any party can call it. */
  const syncNow = useCallback(async (): Promise<DiagramData | null> => {
    setSaveStatus("saving");
    try {
      // PULL current server state.
      const getRes = await fetch(`/api/diagrams/${diagramId}`, { cache: "no-store" });
      if (!getRes.ok) { setSaveStatus("unsaved"); return null; }
      const server = await getRes.json().catch(() => null);
      const theirs = (server?.data ?? { elements: [], connectors: [] }) as DiagramData;
      let base: DiagramData | null = null;
      try { base = JSON.parse(lastSaved.current) as DiagramData; } catch { base = null; }
      let merged = base ? mergeDiagram(base, data, theirs).merged : theirs;
      let version = typeof server?.version === "number" ? server.version : versionRef.current;
      // PUSH the merged doc (compare-and-swap); if someone slipped in, re-merge + retry.
      for (let attempt = 0; attempt < 4; attempt++) {
        const putRes = await fetch(`/api/diagrams/${diagramId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: merged, version }),
        });
        if (putRes.status === 409) {
          const p = await putRes.json().catch(() => ({}));
          const t2 = p.data as DiagramData;
          merged = base ? mergeDiagram(base, merged, t2).merged : t2;
          version = typeof p.currentVersion === "number" ? p.currentVersion : version;
          continue;
        }
        if (!putRes.ok) { setSaveStatus("unsaved"); return null; }
        const updated = await putRes.json().catch(() => null);
        version = updated && typeof updated.version === "number" ? updated.version : version + 1;
        versionRef.current = version;
        lastSaved.current = JSON.stringify(merged);
        setSyncedData(merged);
        setCommittedVersion(version);
        setLastSavedAt(new Date().toISOString());
        setSaveStatus("saved");
        return merged;
      }
      setSaveStatus("unsaved");
      return null;
    } catch {
      setSaveStatus("unsaved");
      return null;
    }
  }, [data, diagramId]);

  /** Auto-align: another participant advanced the committed version, so PULL their
   *  committed doc and 3-way-merge it into ours (keeping our un-synced edits) —
   *  but DON'T push, so a Sync by one person aligns the whole group without a
   *  cascade. Returns the merged doc to apply, or null if nothing new. */
  const pullMerge = useCallback(async (): Promise<DiagramData | null> => {
    try {
      const getRes = await fetch(`/api/diagrams/${diagramId}`, { cache: "no-store" });
      if (!getRes.ok) return null;
      const server = await getRes.json().catch(() => null);
      const theirVersion = typeof server?.version === "number" ? server.version : versionRef.current;
      if (theirVersion <= versionRef.current) return null; // nothing newer
      const theirs = (server?.data ?? { elements: [], connectors: [] }) as DiagramData;
      let base: DiagramData | null = null;
      try { base = JSON.parse(lastSaved.current) as DiagramData; } catch { base = null; }
      const merged = base ? mergeDiagram(base, data, theirs).merged : theirs;
      versionRef.current = theirVersion;
      lastSaved.current = JSON.stringify(theirs);   // baseline = their committed
      setSyncedData(theirs);
      setCommittedVersion(theirVersion);
      setSaveStatus(JSON.stringify(merged) === JSON.stringify(theirs) ? "saved" : "unsaved");
      return merged;
    } catch {
      return null;
    }
  }, [data, diagramId]);

  /** Adopt the server's version as the new base after the caller has applied the
   *  merged document to the reducer. Set lastSaved to the SERVER's data so the
   *  merged (which includes our edits) still differs and the next debounce
   *  persists it at the new version. */
  const acceptMerge = useCallback(() => {
    if (!conflict) return;
    versionRef.current = conflict.currentVersion;
    lastSaved.current = JSON.stringify(conflict.serverData);
    setConflict(null);
    setSaveStatus("unsaved");
  }, [conflict]);

  // Debounced auto-save. Without this the diagram only persists when a
  // navigation hook explicitly calls saveNow(); a change followed by leaving
  // via any other path (e.g. setting a chevron's linked-diagram id, then
  // browsing away) was silently lost. Force-saves on navigation still win;
  // this timer no-ops when there's nothing new to write.
  useEffect(() => {
    if (disabled || conflict || manualSyncRef?.current) return; // manual: Sync only, no auto-save
    if (JSON.stringify(data) === lastSaved.current) return;
    const t = setTimeout(() => { void saveNow(); }, delay);
    return () => clearTimeout(t);
  }, [data, disabled, delay, saveNow, conflict, manualSyncRef]);

  /** Discard my un-synced local edits and load the last COMMITTED diagram fresh
   *  (safeguard: bail out of a dirty/stale local session). Returns the server doc
   *  for the caller to setData. */
  const revertToSaved = useCallback(async (): Promise<DiagramData | null> => {
    setSaveStatus("saving");
    try {
      const getRes = await fetch(`/api/diagrams/${diagramId}`, { cache: "no-store" });
      if (!getRes.ok) { setSaveStatus("unsaved"); return null; }
      const server = await getRes.json().catch(() => null);
      const theirs = (server?.data ?? { elements: [], connectors: [] }) as DiagramData;
      const theirVersion = typeof server?.version === "number" ? server.version : versionRef.current;
      versionRef.current = theirVersion;
      lastSaved.current = JSON.stringify(theirs);
      setSyncedData(theirs);
      setCommittedVersion(theirVersion);
      setLastSavedAt(new Date().toISOString());
      setSaveStatus("saved");
      return theirs;
    } catch { setSaveStatus("unsaved"); return null; }
  }, [diagramId]);

  return { saveStatus, lastSavedAt, saveNow, syncNow, pullMerge, revertToSaved, conflict, acceptMerge, syncedData, committedVersion };
}
