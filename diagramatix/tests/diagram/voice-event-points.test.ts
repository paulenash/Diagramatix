/**
 * "Move {left, top, right, bottom} to {left, top, right, bottom}" on a selected
 * EVENT, and the small fixes from Paul's test-diagram session (2026-09-27).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { repairHeardWords } from "@/app/lib/assist/selectedWord";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { stitchFinals } from "@/app/lib/assist/fragmentBuffer";
import { eventSideRefusal } from "@/app/lib/diagram/eventSides";
import { digitsAfterKindWord } from "@/app/lib/diagram/nameCase";
import { computeWaypoints } from "@/app/lib/diagram/routing";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const C = (id: string, s: string, t: string, ss: string, ts: string) => ({
  id, sourceId: s, targetId: t, type: "sequence", sourceSide: ss, targetSide: ts, directionType: "directed",
  routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
}) as unknown as Connector;
/** Start → Do It → Wait → Chase → End, in a roomy lane; a boundary Timeout on Do It. */
const world = (): DiagramData => ({
  elements: [
    E({ id: "P", type: "pool", label: "Us", x: 0, y: 0, width: 1600, height: 600, properties: { poolType: "white-box" } }),
    E({ id: "L", type: "lane", label: "Team", x: 36, y: 0, width: 1564, height: 600, parentId: "P", properties: {} }),
    E({ id: "s", type: "start-event", label: "Start", x: 100, y: 282, width: 36, height: 36, parentId: "L", properties: {} }),
    E({ id: "t", type: "task", label: "Do It", x: 250, y: 268, width: 102, height: 64, parentId: "L", properties: {} }),
    E({ id: "w", type: "intermediate-event", label: "Wait", x: 500, y: 282, width: 36, height: 36, parentId: "L", properties: { eventType: "timer" } }),
    E({ id: "u", type: "task", label: "Chase", x: 700, y: 268, width: 102, height: 64, parentId: "L", properties: {} }),
    E({ id: "e", type: "end-event", label: "End", x: 1000, y: 282, width: 36, height: 36, parentId: "L", properties: {} }),
    E({ id: "b", type: "intermediate-event", label: "Timeout", x: 283, y: 314, width: 36, height: 36, parentId: "L", boundaryHostId: "t", properties: { eventType: "timer" } }),
    E({ id: "x", type: "task", label: "Escalate", x: 400, y: 450, width: 102, height: 64, parentId: "L", properties: {} }),
  ],
  connectors: [C("c1", "s", "t", "right", "left"), C("c2", "t", "w", "right", "left"), C("c3", "w", "u", "right", "left"), C("c4", "u", "e", "right", "left"), C("c5", "b", "x", "bottom", "left")],
  viewport: { x: 0, y: 0, zoom: 1 },
} as DiagramData);
function run(said: string, selectedIds: string[]) {
  const h = headlessDiagram(world());
  const r = applyAssistOps(parseCommand(said)!, h.context({ selectedIds }));
  return { r, h, conn: (id: string) => h.data.connectors.find((c) => c.id === id)! };
}

describe("T_EV — “move {side} to {side}” on a selected event (Paul, 2026-09-27)", () => {
  it("parses with or without the word “event”", () => {
    expect(parseCommand("move right to bottom")).toEqual([{ op: "moveGatewayPoint", from: "right", to: "bottom" }]);
    expect(parseCommand("move the selected event, top to bottom")).toEqual([{ op: "moveGatewayPoint", from: "top", to: "bottom" }]);
  });

  it("an inline event moves whichever flow sits at the side — out or in (the in-flow to the top used to be undone: its route ran through the event)", () => {
    const out = run("move right to bottom", ["w"]);
    expect(out.r.ok, out.r.summary).toBe(true);
    expect(out.conn("c3").sourceSide).toBe("bottom");
    const inn = run("move left to top", ["w"]);
    expect(inn.r.ok, inn.r.summary).toBe(true);
    expect(inn.conn("c2").targetSide).toBe("top");
  });

  it("a Start Event's flow moves, but never to the left; an End Event's never arrives from the right", () => {
    const ok = run("move right to bottom", ["s"]);
    expect(ok.r.ok, ok.r.summary).toBe(true);
    expect(ok.conn("c1").sourceSide).toBe("bottom");
    const left = run("move right to left", ["s"]);
    expect(left.r).toEqual({ ok: false, summary: "Start: a Start Event’s flow never leaves to the left" });
    expect(left.conn("c1").sourceSide).toBe("right");
    const right = run("move left to right", ["e"]);
    expect(right.r).toEqual({ ok: false, summary: "End: an End Event’s flow never arrives from the right" });
    expect(eventSideRefusal("start-event", "target", "left"), "a Start has no incoming anyway; only its outgoing is ruled").toBeNull();
  });

  it("never claims a move the diagram did not make — a boundary event's flow stays on its outer point (R7.02)", () => {
    const b = run("move bottom to right", ["b"]);
    expect(b.r.ok).toBe(false);
    expect(b.r.summary).toContain("outer point (R7.02)");
    expect(b.conn("c5").sourceSide).toBe("bottom");
  });

  it("the router's detour never runs through its own ends — right → top onto a level event climbs over, not through", () => {
    const els = world().elements;
    const [t, w] = [els.find((e) => e.id === "t")!, els.find((e) => e.id === "w")!];
    const wp = computeWaypoints(t, w, els, "right", "top", "rectilinear", 0.5, 0.5).waypoints;
    // The visible middle (between the two edge points) stays out of the event's body.
    const inside = wp.slice(2, -2).filter((p) => p.x > w.x && p.x < w.x + w.width && p.y > w.y && p.y < w.y + w.height);
    expect(inside).toEqual([]);
    expect(wp.at(-2)).toEqual({ x: 518, y: 282 });
  });

  it("the AI knows the op takes events and a template pick is final", () => {
    const route = readFileSync("app/api/ai/command/route.ts", "utf8");
    expect(route).toContain("the selected gateways' OR events' points");
    expect(route).not.toContain("\"yes\" to keep it");
  });

  it("the side must be free, there must be a flow at the first side, and “middle” is a gateway word", () => {
    expect(run("move top to bottom", ["w"]).r.summary).toBe("Wait: no connector at the top");
    expect(run("move middle to top", ["w"]).r.summary).toBe("Wait: say top, bottom, left or right for an event");
    expect(run("move top to bottom", []).r.summary).toBe("select a gateway or an event first");
  });
});

describe("T_SES — Paul's test-diagram session, 2026-09-27", () => {
  it("a spoken name writes its number as a digit — “rename selected to pool three” names it Pool 3", () => {
    expect(parseCommand("rename selected to pool three")).toEqual([{ op: "rename", ref: "selected", label: "Pool 3" }]);
    expect(parseCommand("add a lane called lane two")?.[0]).toMatchObject({ labels: ["lane 2"] });
    expect(digitsAfterKindWord("Stage four review")).toBe("Stage 4 review");
    // A count is not a name: the move rule still reads it.
    expect(parseCommand("move the gateway two elements to the right")?.[0]).toMatchObject({ op: "move", count: 2 });
  });

  it("“Mood.” is “Move.” — held for the rest, and the halves join", () => {
    expect(repairHeardWords("Mood.")).toBe("Move.");
    expect(repairHeardWords("mood pool three below Claims System")).toBe("move pool three below Claims System");
    expect(isIncompleteCommand("Mood.")).toBe(true);
    const joined = stitchFinals([{ text: "Mood.", atMs: 0 }, { text: "pool three below Claim system", atMs: 1500 }]);
    expect(joined).toHaveLength(1);
    expect(parseCommand(repairHeardWords(joined[0]))?.[0]).toMatchObject({ op: "movePoolTo", position: "below" });
  });

  it("“swap lanes” / “swap lines” wait for the names; “swap the two pools” is whole already", () => {
    for (const s of ["swap lines", "Swap lanes.", "swap lane", "swap the lanes"]) expect(isIncompleteCommand(s), s).toBe(true);
    expect(isIncompleteCommand("swap the two pools")).toBe(false);
  });

  it("the AI is told a spoken name keeps its own kind word", () => {
    expect(readFileSync("app/api/ai/command/route.ts", "utf8")).toContain("A spoken name keeps ITS OWN kind word: \"pool three\" is Pool 3, never \"Lane 3\".");
  });
});
