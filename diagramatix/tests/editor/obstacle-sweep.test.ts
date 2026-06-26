/**
 * Obstacle-avoidance gap isolation + regression ratchet.
 *
 * Sweeps every element of representative diagrams to a grid of valid positions
 * (skipping moves that drop it onto another element), re-routes via the real
 * reducer, and counts genuine routing violations. This ISOLATES the known
 * obstacle-avoidance gaps (a valid move can leave a connector crossing a flow
 * node) AND ratchets them: orthogonality/attachment must stay perfect, and the
 * obstacle-crossing count must not exceed the documented baseline. Drive the
 * baseline DOWN to 0 as the editor re-route's obstacle avoidance is improved.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import { findRoutingViolations } from "./_helpers/routing";

// Genuine obstacle-avoidance gaps in the editor re-route today. GOAL: 0.
// Lower this each time the re-route's obstacle avoidance is improved.
const KNOWN_CROSSING_BASELINE = 10;

const DIAGRAMS: { name: string; elements: AiElement[]; connections: AiConnection[] }[] = [
  {
    name: "linear",
    elements: [
      { id: "s", type: "start-event", label: "S" },
      { id: "a", type: "task", label: "A" },
      { id: "b", type: "task", label: "B" },
      { id: "c", type: "task", label: "C" },
      { id: "e", type: "end-event", label: "E" },
    ],
    connections: [
      { sourceId: "s", targetId: "a" }, { sourceId: "a", targetId: "b" },
      { sourceId: "b", targetId: "c" }, { sourceId: "c", targetId: "e" },
    ],
  },
  {
    name: "gateway",
    elements: [
      { id: "s", type: "start-event", label: "S" },
      { id: "g", type: "gateway", label: "OK?" },
      { id: "a", type: "task", label: "Approve" },
      { id: "b", type: "task", label: "Reject" },
      { id: "m", type: "gateway", label: "" },
      { id: "e", type: "end-event", label: "E" },
    ],
    connections: [
      { sourceId: "s", targetId: "g" }, { sourceId: "g", targetId: "a", label: "Yes" },
      { sourceId: "g", targetId: "b", label: "No" }, { sourceId: "a", targetId: "m" },
      { sourceId: "b", targetId: "m" }, { sourceId: "m", targetId: "e" },
    ],
  },
];

type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe("editor routing — obstacle-avoidance sweep", () => {
  it(`re-route never produces a non-crossing violation, and crossings stay ≤ ${KNOWN_CROSSING_BASELINE}`, () => {
    const offsets = [-260, -140, -60, 60, 140, 260];
    let crossings = 0;
    const otherViolations: string[] = [];
    for (const d of DIAGRAMS) {
      const base = layoutBpmnDiagram(d.elements, d.connections);
      const flow = base.elements.filter((e) => !["pool", "lane", "group"].includes(e.type));
      for (const el of flow) {
        for (const dx of offsets) for (const dy of offsets) {
          const moved = { ...el, x: el.x + dx, y: el.y + dy };
          if (flow.some((o) => o.id !== el.id && overlaps(moved, o))) continue; // bad user move, skip
          const out = reducer(base, { type: "MOVE_ELEMENT", payload: { id: el.id, x: moved.x, y: moved.y } } satisfies Action);
          for (const v of findRoutingViolations(out)) {
            if (v.includes("crosses")) crossings++;
            else otherViolations.push(v);
          }
        }
      }
    }
    // Orthogonality + attachment must be PERFECT — any breach is a real bug, not a known gap.
    expect([...new Set(otherViolations)], "unexpected non-crossing routing violation(s)").toEqual([]);
    // Obstacle crossings: documented known gap, must not get worse.
    expect(crossings, `obstacle crossings rose above the baseline — re-route regressed`).toBeLessThanOrEqual(KNOWN_CROSSING_BASELINE);
  });
});
