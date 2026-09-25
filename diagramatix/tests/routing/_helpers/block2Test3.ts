/**
 * Paul's geometry from the Block 2 Test 3 voice-debug snapshot (25 September
 * 2026), trimmed to what the boundary-exit tests need: "Repeat until Re-Work
 * Completed" in the Sales lane, Event 4 on its bottom edge 36px from the
 * bottom-right corner — carrying the host as its parent, as it was saved —
 * and "Assess work completed" up and to the right. The Sales lane floor is
 * 45px below the event's south point, so a task placed after the event does
 * not fit in the lane as it stands, and the SalesForce pool sits 68px below.
 */
import type { DiagramData, DiagramElement, SymbolType } from "@/app/lib/diagram/types";

const el = (id: string, type: SymbolType, x: number, y: number, w: number, h: number, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: {}, ...extra } as DiagramElement);

export function paulsDiagram(): DiagramData {
  return {
    elements: [
      el("pool", "pool", 91.8, -118.71, 2769.15, 485.08, { label: "My company", properties: { poolType: "white-box" } }),
      el("front", "lane", 127.8, -118.71, 2733.15, 161, { label: "Front office", parentId: "pool" }),
      el("sales", "lane", 127.8, 42.29, 2733.15, 232.08, { label: "Sales", parentId: "pool" }),
      el("marketing", "lane", 127.8, 274.37, 2733.15, 92, { label: "Marketing", parentId: "pool" }),
      el("sf", "pool", 91.8, 434.18, 2769.15, 116, { label: "SalesForce", properties: { poolType: "black-box" } }),
      el("rework", "subprocess-expanded", 1032.07, 60.64, 501.26, 150.22, { label: "Repeat until Re-Work Completed", parentId: "sales" }),
      el("draft", "task", 1155.37, 113.08, 102, 65, { label: "Draft", parentId: "rework" }),
      el("review", "task", 1298.85, 113.74, 102, 65, { label: "Review", parentId: "rework" }),
      el("ev4", "intermediate-event", 1479.33, 192.87, 36, 36, {
        label: "Event 4", eventType: "error", parentId: "rework", boundaryHostId: "rework", properties: { boundarySide: "bottom" },
      }),
      el("assess", "task", 1611.89, 116.32, 102, 65, { label: "Assess work completed", parentId: "sales" }),
      el("nothing", "task", 685.82, 281.37, 102, 65, { label: "Do nothing", parentId: "marketing" }),
    ],
    connectors: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as DiagramData;
}
