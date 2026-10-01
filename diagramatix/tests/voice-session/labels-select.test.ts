/**
 * Voice Assist, 2026-10-01 — labels, selecting, the loop marker, and capitalising container names.
 *
 *   "move label up 20 pixels"           the label of the selected gateway / event / data object / data store /
 *                                       connector / message (it was read as "move an element called label")
 *   "remove the label" / "label this X" take it off / put one on the selected item
 *   "select end event Claim closed"     select any element by name — or "select events" and a number — and it STAYS
 *                                       selected, so "move label up" can follow
 *   "remove the loop marker"            = "make this a plain subprocess"
 *   pools, lanes and sub-lanes          named with EVERY word capitalised ("claims processing" → "Claims Processing")
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { failOnActWarnings, mountSession, stubFetch, stubWindow, unmountAll, type Mounted } from "./harness";
import { fakeDictation } from "./fakeDictation";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { titleCaseName } from "@/app/lib/diagram/nameCase";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

beforeEach(() => { fakeDictation.reset(); stubWindow(); stubFetch(() => ({ ops: [] })); });
afterEach(async () => { await unmountAll(); vi.useRealTimers(); vi.unstubAllGlobals(); failOnActWarnings(); });

const el = (o: Record<string, unknown>) => o as unknown as DiagramElement;

/** A pool and lane holding a task, a decision gateway, an end event, a data object and a looped subprocess; one labelled flow. */
function diagram(): DiagramData {
  const conn: Connector = {
    id: "c1", type: "sequence", sourceId: "g", targetId: "e", sourceSide: "right", targetSide: "left", waypoints: [],
    directionType: "directed", routingType: "rectilinear", label: "Yes", labelOffsetX: 0, labelOffsetY: 0,
  } as unknown as Connector;
  return {
    elements: [
      el({ id: "pool1", type: "pool", x: 0, y: 0, width: 900, height: 300, label: "Company", properties: { poolType: "white-box" } }),
      el({ id: "lane1", type: "lane", x: 30, y: 0, width: 870, height: 300, label: "Clerk", parentId: "pool1", properties: {} }),
      el({ id: "t1", type: "task", x: 60, y: 100, width: 120, height: 70, label: "Check invoice", parentId: "lane1", properties: { taskType: "user" } }),
      el({ id: "g", type: "gateway", x: 220, y: 110, width: 40, height: 40, label: "Approved?", parentId: "lane1", properties: { gatewayType: "exclusive", labelOffsetX: -30, labelOffsetY: -54 } }),
      el({ id: "e", type: "end-event", x: 320, y: 115, width: 36, height: 36, label: "Claim closed", parentId: "lane1", properties: {} }),
      el({ id: "d", type: "data-object", x: 420, y: 100, width: 36, height: 50, label: "Invoice", parentId: "lane1", properties: {} }),
      el({ id: "sp", type: "subprocess", x: 500, y: 90, width: 120, height: 70, label: "Handle claim", parentId: "lane1", repeatType: "loop", properties: {} }),
    ],
    connectors: [conn],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as DiagramData;
}
const props = (h: Mounted, id: string) => h.data.elements.find((e) => e.id === id)!.properties as Record<string, unknown>;
const label = (h: Mounted, id: string) => h.data.elements.find((e) => e.id === id)?.label;
const conn = (h: Mounted) => h.data.connectors.find((c) => c.id === "c1")! as unknown as { label?: string; labelOffsetX?: number; labelOffsetY?: number };

describe("T5191 — the words: label moves, label removal, adding a label, the loop marker, select", () => {
  it("“move label up 20 pixels” and its forms are a label move, 20 px unless a distance is said", () => {
    expect(parseCommand("move label up 20 pixels")).toEqual([{ op: "moveLabel", direction: "up", distance: 20 }]);
    expect(parseCommand("move the label left")).toEqual([{ op: "moveLabel", direction: "left" }]);
    expect(parseCommand("nudge the label down by 10")).toEqual([{ op: "moveLabel", direction: "down", distance: 10 }]);
    expect(parseCommand("move the selected end event label up two steps")).toEqual([{ op: "moveLabel", direction: "up", distance: 40 }]);
    expect(parseCommand("bump this gateway label to the right")).toEqual([{ op: "moveLabel", direction: "right" }]);
  });

  it("an element that merely has “label” in its name is still an element move", () => {
    expect(parseCommand("move Label Printer up")?.[0].op).not.toBe("moveLabel");
    expect(parseCommand("delete Label Printer")?.[0].op).toBe("delete");
    expect(parseCommand("move Review Claim up")?.[0].op).toBe("move");
  });

  it("“remove the label”, “clear the label”, “remove the label from this”", () => {
    for (const s of ["remove the label", "clear the label", "delete the label", "remove label from this", "remove the gateway label", "clear this label"]) {
      expect(parseCommand(s), s).toEqual([{ op: "clearLabel" }]);
    }
  });

  it("adding a label: “label this Approved”, “add a label Approved [to this]”; with no text it waits for it", () => {
    expect(parseCommand("label this Approved")).toEqual([{ op: "labelSelected", label: "Approved" }]);
    expect(parseCommand("add a label Approved")).toEqual([{ op: "labelSelected", label: "Approved" }]);
    expect(parseCommand("add a label Approved to this")).toEqual([{ op: "labelSelected", label: "Approved" }]);
    expect(parseCommand("add a label to this")).toEqual([{ op: "labelSelected" }]);
  });

  it("the loop marker comes off with plain words, and never as a delete or a mis-parsed convert", () => {
    for (const s of ["remove the loop", "remove the loop marker", "remove the repeat marker from this", "make this not a loop", "make this no loop", "no loop", "take off the loop marker"]) {
      expect(parseCommand(s), s).toEqual([{ op: "convert", ref: "this", subtype: "plain subprocess" }]);
    }
    expect(parseCommand("delete Loop Review")?.[0].op).toBe("delete");
  });

  it("select: by name (kind words allowed), by type, “select all tasks”", () => {
    expect(parseCommand("select end event Claim closed")).toEqual([{ op: "select", ref: "end event Claim closed" }]);
    expect(parseCommand("select Review Claim")).toEqual([{ op: "select", ref: "Review Claim" }]);
    expect(parseCommand("select events")).toEqual([{ op: "selectByType", itemType: "event" }]);
    expect(parseCommand("select all tasks")).toEqual([{ op: "selectByType", itemType: "task" }]);
    expect(parseCommand("select the gateways")).toEqual([{ op: "selectByType", itemType: "gateway" }]);
  });
});

describe("T5192 — moving the label of the selected item", () => {
  it("a gateway: up 20, then left (20 by default) — and it STAYS selected for the next nudge", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.select(["g"]);
    await h.typed("move label up 20 pixels");
    expect(props(h, "g")).toMatchObject({ labelOffsetX: -30, labelOffsetY: -74 });
    expect(h.selection().ids).toEqual(["g"]);
    await h.typed("nudge the label left");
    expect(props(h, "g")).toMatchObject({ labelOffsetX: -50, labelOffsetY: -74 });
    expect(h.lastLine).toMatchObject({ summary: "moved the label left 20px", ok: true });
  });

  it("an event with no stored offset starts from where it is drawn (7 px below) — and a data object likewise", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.select(["e"]);
    await h.typed("move label down 10");
    expect(props(h, "e")).toMatchObject({ labelOffsetX: 0, labelOffsetY: 17 });
    await h.select(["d"]);
    await h.typed("move the label right 5 pixels");
    expect(props(h, "d")).toMatchObject({ labelOffsetX: 5, labelOffsetY: 7 });
  });

  it("a connector (or message): the label's offset from its midpoint moves", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.selectConnector("c1");
    await h.typed("move label up 15");
    expect(conn(h)).toMatchObject({ labelOffsetX: 0, labelOffsetY: -15 });
    expect(h.selection().connector).toBe("c1");
  });

  it("a task's name sits inside it: refused with the reason, nothing moves; nothing selected says what to select", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.select(["t1"]);
    await h.typed("move label up");
    expect(h.lastLine).toMatchObject({ ok: false });
    expect(h.lastLine!.summary).toContain("sits inside it");
    expect(props(h, "t1").labelOffsetY).toBeUndefined();
    await h.select([]);
    await h.typed("move label up");
    expect(h.lastLine!.summary).toContain("select a gateway, event, data object, data store, connector or message first");
  });
});

describe("T5193 — removing and adding a label", () => {
  it("“remove the label” empties a gateway's label (and clears the selection, as a voice edit does)", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.select(["g"]);
    await h.typed("remove the label");
    expect(label(h, "g")).toBe("");
    expect(h.selection().ids).toEqual([]);
    expect(h.lastLine).toMatchObject({ summary: "removed the label", ok: true });
  });

  it("…and a connector's; a task is refused — it needs its name", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.selectConnector("c1");
    await h.typed("clear the label");
    expect(conn(h).label).toBe("");
    await h.select(["t1"]);
    await h.typed("remove the label");
    expect(label(h, "t1")).toBe("Check invoice");
    expect(h.lastLine!.summary).toContain("sits inside it");
  });

  it("“label this Approved…” and “add a label … to this” put one on the selected element or connector", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.select(["g"]);
    await h.typed("label this Final decision");
    expect(label(h, "g")).toBe("Final decision?");   // a decision gateway always reads as a question
    await h.select(["d"]);
    await h.typed("add a label Purchase order to this");
    expect(label(h, "d")).toBe("Purchase order");
    await h.selectConnector("c1");
    await h.typed("label this No");
    expect(conn(h).label).toBe("No");
  });
});

describe("T5194 — select by name or number; it stays selected; then “move label …”", () => {
  it("“select end event Claim closed” selects it, and “move label up” then works on it", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.typed("select end event Claim closed");
    expect(h.selection().ids).toEqual(["e"]);
    expect(h.lastLine).toMatchObject({ summary: "selected Claim closed", ok: true });
    await h.typed("move label up 20 pixels");
    expect(props(h, "e")).toMatchObject({ labelOffsetY: -13 });
    expect(h.selection().ids).toEqual(["e"]);
    await h.typed("nudge label left");
    expect(props(h, "e")).toMatchObject({ labelOffsetX: -20 });
  });

  it("a connector or message is selected by its label", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.typed("select connector Yes");
    expect(h.selection().connector).toBe("c1");
    expect(h.selection().ids).toEqual([]);
  });

  it("“select events” numbers them; a number selects one — no rename box opens, the flow ends, the item stays selected", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.typed("select events");
    const f = h.session.renameFlow as { phase: string; purpose?: string; targets: { id: string; n: number }[] };
    expect(f.phase).toBe("pick");
    expect(f.purpose).toBe("select");
    expect(f.targets.map((t) => t.id)).toEqual(["e"]);
    await h.typed("one");
    expect(h.session.renameFlow).toBeNull();
    expect(h.selection().ids).toEqual(["e"]);
    expect(h.labelEdits).toEqual([]);                      // nothing was opened for editing
    expect(h.lastLine).toMatchObject({ ok: true });
    expect(h.lastLine!.summary).toContain("selected");
  });

  it("an unknown name says so and selects nothing", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.typed("select the frobnicator");
    expect(h.lastLine).toMatchObject({ ok: false });
    expect(h.selection().ids).toEqual([]);
  });
});

describe("T5195 — taking the loop marker off the selected subprocess", () => {
  it("“remove the loop marker” and “make this a plain subprocess” both set the marker to none", async () => {
    for (const said of ["remove the loop marker", "make this a plain subprocess", "make this not a loop"]) {
      const h = await mountSession({ initial: diagram() });
      await h.select(["sp"]);
      await h.typed(said);
      expect((h.data.elements.find((e) => e.id === "sp") as unknown as { repeatType?: string }).repeatType, said).toBe("none");
      await h.unmount();
    }
  });

  it("on a task it says what applies to", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.select(["t1"]);
    await h.typed("remove the loop marker");
    expect(h.lastLine).toMatchObject({ ok: false });
    expect(h.lastLine!.summary).toContain("subprocess");
  });
});

describe("T5196 — pools, lanes and sub-lanes are named with every word capitalised", () => {
  it("the helper: each word, deliberate capitals and digits kept, spacing tidied", () => {
    expect(titleCaseName("claims processing")).toBe("Claims Processing");
    expect(titleCaseName("the finance team")).toBe("The Finance Team");
    expect(titleCaseName("IT support")).toBe("IT Support");
    expect(titleCaseName("eCommerce desk")).toBe("eCommerce Desk");
    expect(titleCaseName("  lane   3 ")).toBe("Lane 3");
    expect(titleCaseName("customer's  view (pty)")).toBe("Customer's View (Pty)");
    expect(titleCaseName("")).toBe("");
  });

  it("renaming a lane or pool by sentence", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.typed("rename Clerk to claims processing team");
    expect(label(h, "lane1")).toBe("Claims Processing Team");
    await h.typed("rename Company to acme insurance");
    expect(label(h, "pool1")).toBe("Acme Insurance");
  });

  it("an activity keeps its first-word-only style — only containers are fully capitalised", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.typed("rename Check invoice to send invoice to customer");
    expect(label(h, "t1")).toBe("Send invoice to customer");
  });

  it("rename by number: a lane takes every word capitalised, a task does not", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.typed("rename lanes");
    await h.typed("one claims processing team");
    expect(label(h, "lane1")).toBe("Claims Processing Team");
    await h.typed("done");
    await h.typed("rename tasks");
    await h.typed("one send invoice to customer");
    expect(label(h, "t1")).toBe("Send invoice to customer");
  });

  it("creating them: a new pool, new lanes, and “name these …” on selected lanes", async () => {
    const h = await mountSession({ initial: diagram() });
    await h.typed("add a pool called customer service");
    expect(h.data.elements.filter((e) => e.type === "pool").map((e) => e.label)).toContain("Customer Service");
    await h.typed("add 2 lanes to Company called intake team and payments team");
    const lanes = h.data.elements.filter((e) => e.type === "lane" && e.parentId === "pool1").map((e) => e.label);
    expect(lanes).toEqual(expect.arrayContaining(["Intake Team", "Payments Team"]));
  });
});
