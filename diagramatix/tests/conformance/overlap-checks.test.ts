/**
 * B33 (event-label-overlap) + B34 (element-overlap) — the geometric overlap net.
 *
 * These pin the two detection checks added for the new red rules R8.16 / R8.17:
 *   - B34: no two leaf flow-nodes may sit on top of one another (the layout
 *     "coincidence" failure, a.k.a. Cause A).
 *   - B33: an event's label must stay clear of other elements + other labels,
 *     especially edge-mounted/boundary events.
 *
 * They feed SYNTHETIC laid-out diagrams straight to the check functions, so the
 * fire/clean behaviour is deterministic and independent of the layout engine.
 */
import { describe, it, expect } from "vitest";
import {
  checkElementOverlap,
  checkEventLabelOverlap,
} from "@/app/lib/diagram/checks/diagramChecks";
import type { DiagramElement } from "@/app/lib/diagram/types";

const mk = (
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<DiagramElement> = {},
): DiagramElement => ({
  id,
  type: type as DiagramElement["type"],
  x,
  y,
  width,
  height,
  label: extra.label ?? id,
  properties: extra.properties ?? {},
  ...extra,
});

const data = (elements: DiagramElement[]) => ({ elements, connectors: [] });

describe("B34 — element overlap (R8.17)", () => {
  it("T0514 — fires when two tasks occupy the same box (coincidence)", () => {
    const v = checkElementOverlap(
      data([mk("a", "task", 100, 100, 100, 60), mk("b", "task", 100, 100, 100, 60)]),
    );
    expect(v.length, "coincident tasks should be flagged").toBeGreaterThan(0);
    expect(v[0].rule).toBe("element-overlap");
    expect(v[0].ids).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("T0515 — clean when elements are spaced apart", () => {
    const v = checkElementOverlap(
      data([mk("a", "task", 100, 100, 100, 60), mk("b", "task", 300, 100, 100, 60)]),
    );
    expect(v, "well-separated tasks should not be flagged").toEqual([]);
  });

  it("T0516 — exempts a boundary event mounted on its host", () => {
    // A boundary intermediate event sits ON the host's edge → overlaps it, but
    // is legitimate and must not be flagged.
    const v = checkElementOverlap(
      data([
        mk("host", "task", 100, 100, 120, 80),
        mk("be", "intermediate-event", 208, 140, 36, 36, { boundaryHostId: "host" }),
      ]),
    );
    expect(v, "boundary event on its host is legitimate").toEqual([]);
  });

  it("T0517 — touching edges are not an overlap (no sub-pixel false positives)", () => {
    const v = checkElementOverlap(
      data([mk("a", "task", 100, 100, 100, 60), mk("b", "task", 200, 100, 100, 60)]),
    );
    expect(v, "edge-adjacent tasks should not be flagged").toEqual([]);
  });
});

describe("B33 — event label overlap (R8.16)", () => {
  it("T0518 — fires when an event label overlaps a neighbouring element", () => {
    // Event label renders centred below the event: cx=x+18, topY=y+36+7.
    // Default width 80, one line tall (14). Place a task across that box.
    const v = checkEventLabelOverlap(
      data([
        mk("ev", "start-event", 100, 100, 36, 36, { label: "Approve" }),
        mk("blocker", "task", 100, 145, 80, 40, { label: "Next" }),
      ]),
    );
    expect(v.length, "label-over-element should be flagged").toBeGreaterThan(0);
    expect(v[0].rule).toBe("event-label-overlap");
  });

  it("T0519 — clean when the label sits in free space", () => {
    const v = checkEventLabelOverlap(
      data([
        mk("ev", "start-event", 100, 100, 36, 36, { label: "Approve" }),
        mk("far", "task", 100, 400, 80, 40, { label: "Later" }),
      ]),
    );
    expect(v, "label in free space should not be flagged").toEqual([]);
  });

  it("T0520 — exempts the event's own container ancestor (label inside its EP/pool)", () => {
    // The event sits inside an expanded subprocess; its label naturally falls
    // within the EP body — that must NOT be flagged as an overlap.
    const v = checkEventLabelOverlap(
      data([
        mk("ep", "subprocess-expanded", 50, 50, 400, 300, { label: "EP" }),
        mk("ev", "start-event", 100, 100, 36, 36, { label: "Start", parentId: "ep" }),
      ]),
    );
    expect(v, "label inside its own container is legitimate").toEqual([]);
  });
});
