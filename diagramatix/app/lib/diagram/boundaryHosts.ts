/**
 * What a boundary event can be mounted on: a task, a collapsed subprocess or an
 * expanded subprocess.
 *
 * One set. It was written five times — the reducer's drop snap and
 * SET_EVENT_BOUNDARY (useDiagram.ts), the canvas's drop preview, the
 * Properties panel's "mounted" checkbox, the Assist ghost's Boundary
 * suggestion (nextSteps.ts) and inline in the Voice Assist apply layer — and
 * all five answer the same question. Since 2026-09-25 the voice can take its
 * host from the selection ("Use the selected task", Paul), which makes the
 * voice's answer as visible as the mouse's; they must not differ.
 *
 * Pure.
 */
import type { SymbolType } from "./types";

export const BOUNDARY_HOST_TYPES: ReadonlySet<SymbolType> = new Set<SymbolType>(["task", "subprocess", "subprocess-expanded"]);

export function isBoundaryHost(type: string): boolean {
  return (BOUNDARY_HOST_TYPES as ReadonlySet<string>).has(type);
}
