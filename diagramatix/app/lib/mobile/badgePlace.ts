/**
 * Where a numbered badge sits on the phone (mobile voice stage 6, 2026-09-29) —
 * the desktop canvas's rule (Canvas.tsx, "Where the badge sits"): activities
 * below, events above, pools and lanes in the header just before the start of
 * the name; a connector's or divider's badge on its anchor. Offsets are in
 * SCREEN pixels (divided by the zoom), so a badge keeps its size at any zoom.
 * Pure. (The header name is measured by a rough per-character width here: the
 * phone has no canvas text measure to hand.)
 */
import { containerHeaderWidth } from "@/app/lib/diagram/containerHeader";
import type { DiagramData } from "@/app/lib/diagram/types";

export interface BadgeTarget {
  id: string;
  n: number;
  x: number;
  y: number;
  height: number;
  kind: "element" | "connector" | "divider";
  place?: "below" | "above" | "header";
}

export function badgePosition(b: BadgeTarget, data: Pick<DiagramData, "elements" | "poolFontSize" | "laneFontSize">, zoom: number): { x: number; y: number } {
  if (b.kind !== "element") return { x: b.x, y: b.y };
  if (b.place === "above") return { x: b.x, y: b.y - b.height / 2 - 16 / zoom };
  if (b.place === "header") {
    const e = data.elements.find((el) => el.id === b.id);
    if (e) {
      const isPool = e.type === "pool";
      const fs = isPool ? (data.poolFontSize ?? 16) : (data.laneFontSize ?? 14);
      const nameW = Math.max(0, ...(e.label ?? "").split("\n").map((l) => l.length * fs * 0.55));
      return { x: e.x + containerHeaderWidth(e) / 2 + 3, y: e.y + e.height / 2 + nameW / 2 + 6 + 13 / zoom };
    }
  }
  return { x: b.x, y: b.y + b.height / 2 + 16 / zoom };
}
