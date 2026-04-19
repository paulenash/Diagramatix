"use client";

/**
 * Single source of truth for the 2-phase AI Plan editing workflow.
 *
 * Holds the current plan (AiElement[] + AiConnection[]) plus imperative
 * mutation helpers. All tabs (PoolsLanesTree, ElementsByContainerView,
 * ConnectorsByTypeView, RawJsonView) read from and dispatch into this hook,
 * so they can't drift.
 *
 * Mutations intentionally return the new plan so callers can serialise back
 * to the Raw JSON textarea without setState-ordering games.
 */
import { useState, useCallback, useMemo } from "react";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";

export interface Plan {
  elements: AiElement[];
  connections: AiConnection[];
}

export function usePlanState(initial: Plan = { elements: [], connections: [] }) {
  const [plan, setPlanInternal] = useState<Plan>(initial);

  /** Replace the entire plan (e.g. Sonnet response, Raw JSON commit). */
  const setPlan = useCallback((next: Plan) => setPlanInternal(next), []);

  /** Shallow-merge a patch into an element identified by id. */
  const updateElement = useCallback((id: string, patch: Partial<AiElement>) => {
    setPlanInternal(prev => ({
      ...prev,
      elements: prev.elements.map(el => el.id === id ? { ...el, ...patch } : el),
    }));
  }, []);

  /** Remove an element by id and any connectors that reference it. */
  const deleteElement = useCallback((id: string) => {
    setPlanInternal(prev => ({
      elements: prev.elements.filter(el => el.id !== id),
      connections: prev.connections.filter(c => c.sourceId !== id && c.targetId !== id),
    }));
  }, []);

  /** Shallow-merge a patch into a connection at a given index. */
  const updateConnection = useCallback((idx: number, patch: Partial<AiConnection>) => {
    setPlanInternal(prev => ({
      ...prev,
      connections: prev.connections.map((c, i) => i === idx ? { ...c, ...patch } : c),
    }));
  }, []);

  /** Remove a connection by index. */
  const deleteConnection = useCallback((idx: number) => {
    setPlanInternal(prev => ({
      ...prev,
      connections: prev.connections.filter((_, i) => i !== idx),
    }));
  }, []);

  /**
   * Reorder: move `draggedId` to sit before or after `targetId` in
   * plan.elements. Caller is responsible for constraining drops to meaningful
   * groups (same pool for lanes, same container for flow elements). The
   * layout engine reads elements[] order for same-group placement.
   */
  const moveElementRelativeTo = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      setPlanInternal(prev => {
        if (draggedId === targetId) return prev;
        const dragged = prev.elements.find(e => e.id === draggedId);
        if (!dragged) return prev;
        const without = prev.elements.filter(e => e.id !== draggedId);
        const tgtIdx = without.findIndex(e => e.id === targetId);
        if (tgtIdx < 0) return prev;
        const insertAt = position === "before" ? tgtIdx : tgtIdx + 1;
        const next = [
          ...without.slice(0, insertAt),
          dragged,
          ...without.slice(insertAt),
        ];
        return { ...prev, elements: next };
      });
    },
    []
  );

  /** Serialise to pretty JSON for the Raw JSON textarea. */
  const asJson = useMemo(() => JSON.stringify(plan, null, 2), [plan]);

  return { plan, setPlan, updateElement, deleteElement, updateConnection, deleteConnection, moveElementRelativeTo, asJson };
}
