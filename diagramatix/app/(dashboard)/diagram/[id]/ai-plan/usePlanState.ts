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

  /** Serialise to pretty JSON for the Raw JSON textarea. */
  const asJson = useMemo(() => JSON.stringify(plan, null, 2), [plan]);

  return { plan, setPlan, updateElement, deleteElement, updateConnection, deleteConnection, asJson };
}
