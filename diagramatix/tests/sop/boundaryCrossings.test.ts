/**
 * Boundary crossings for a scoped SOP — the shared source of the figure's green
 * "To:/From:" stubs AND the SOP's Hand-offs text. Pins the three label rules:
 * sequence cross-lane, message to a black-box pool, message to a white-box pool.
 */
import { describe, it, expect } from "vitest";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { computeBoundaryCrossings } from "@/app/lib/sop/boundaryCrossings";

const el = (id: string, type: string, label: string, parentId?: string, props: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label, x: 0, y: 0, width: 80, height: 40, parentId, properties: props } as DiagramElement);
const seq = (id: string, s: string, t: string, label = ""): Connector => ({ id, type: "sequence", sourceId: s, targetId: t, label, waypoints: [] } as unknown as Connector);
const msg = (id: string, s: string, t: string, label = ""): Connector => ({ id, type: "messageBPMN", sourceId: s, targetId: t, label, waypoints: [] } as unknown as Connector);

function fixture(): DiagramData {
  const elements: DiagramElement[] = [
    el("P1", "pool", "Company", undefined, { poolType: "white-box" }),
    el("L1", "lane", "Requester", "P1"),
    el("L2", "lane", "Approver", "P1"),
    el("T1", "task", "Raise request", "L1"),
    el("T2", "task", "Approve request", "L2"),
    // Black-box external pool.
    el("BP", "pool", "ATO Portal", undefined, { poolType: "black-box" }),
    // Another white-box pool with a lane + activity.
    el("P2", "pool", "Finance", undefined, { poolType: "white-box" }),
    el("FL", "lane", "AP", "P2"),
    el("FT", "task", "Post invoice", "FL"),
  ];
  const connectors: Connector[] = [
    seq("s1", "T1", "T2"),            // cross-lane sequence
    msg("m1", "T1", "BP", "Lodgement"), // message to black-box pool
    msg("m2", "T1", "FT"),           // message to a white-box pool activity
  ];
  return { elements, connectors } as unknown as DiagramData;
}

describe("SOP boundary crossings", () => {
  it("T2207 — sequence to another lane → context is the target lane, detail is the target name", () => {
    const cx = computeBoundaryCrossings(fixture(), "lane", "L1").filter((c) => c.kind === "sequence");
    expect(cx).toHaveLength(1);
    expect(cx[0]).toMatchObject({ direction: "out", context: "Approver", detail: "Approve request", inElementId: "T1" });
  });

  it("T2208 — message to a BLACK-BOX pool → context is the pool name, detail is the message label", () => {
    const cx = computeBoundaryCrossings(fixture(), "lane", "L1").find((c) => c.kind === "message" && c.context === "ATO Portal");
    expect(cx).toMatchObject({ direction: "out", context: "ATO Portal", detail: "Lodgement" });
  });

  it("T2209 — message to a WHITE-BOX pool activity → context is 'Pool / Lane', detail is the activity name", () => {
    const cx = computeBoundaryCrossings(fixture(), "lane", "L1").find((c) => c.detail === "Post invoice");
    expect(cx).toMatchObject({ direction: "out", kind: "message", context: "Finance / AP", detail: "Post invoice" });
  });

  it("T2210 — whole/group scope has no boundary crossings", () => {
    expect(computeBoundaryCrossings(fixture(), "whole")).toEqual([]);
    expect(computeBoundaryCrossings(fixture(), "group", "P1")).toEqual([]);
  });

  it("T2212 — an edge-mounted boundary event's internal flow is NOT a crossing", () => {
    const data = fixture();
    // A boundary timer on T1 (lane L1) whose flow goes to T3, also in L1. The event
    // has no lane parent of its own — membership must resolve through its host T1,
    // so this internal flow must not be reported as a boundary crossing.
    data.elements.push(el("T3", "task", "Escalate", "L1"));
    data.elements.push({ ...el("BE", "intermediate-event", "3d"), boundaryHostId: "T1" } as DiagramElement);
    data.connectors.push(seq("s2", "BE", "T3"));
    const cx = computeBoundaryCrossings(data, "lane", "L1");
    expect(cx.some((c) => c.detail === "Escalate")).toBe(false);
    // The genuine cross-lane sequence (T1→T2) is still detected.
    expect(cx.some((c) => c.kind === "sequence" && c.detail === "Approve request")).toBe(true);
  });
});
