/**
 * Render a discovered BPMN edge's frequency the SAME way the discovered state
 * machine does: convert the numeric case-count that `discoverProcess` puts in the
 * connector `label` into a `transitionCount` badge (the green count circle drawn by
 * ConnectorRenderer) instead of a plain number floating beside the line. Pure.
 */
import type { DiagramData } from "@/app/lib/diagram/types";

export function badgeEdgeCounts(data: DiagramData): DiagramData {
  return {
    ...data,
    connectors: data.connectors.map((c) => {
      const t = (c.label ?? "").trim();
      if (!/^\d+$/.test(t)) return c;
      return { ...c, transitionCount: Number(t), label: undefined };
    }),
  };
}
