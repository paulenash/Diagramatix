/**
 * Paul, 2026-09-29 — Voice Assist and connectors:
 *   1. select a connector (any type) with the cursor / tap, "delete this" removes it
 *   2. "delete / remove connectors"   3. "delete / remove messages"
 *   4. two elements selected in the order wanted, "connect these"
 *   5. a connector selected, "reverse this"
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { needsConfirmation } from "@/app/lib/assist/confirm";
import { connectorsForDelete, namesSelectedConnector, parseConnectorsDelete } from "@/app/lib/assist/connectorCommands";
import { connectorAt } from "@/app/lib/mobile/voiceEdit";
import { parseNumberList } from "@/app/lib/assist/numberList";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => ({ properties: {}, ...o }) as unknown as DiagramElement;
const C = (id: string, s: string, t: string, type = "sequence", extra: Record<string, unknown> = {}) =>
  ({ id, type, sourceId: s, targetId: t, sourceSide: "right", targetSide: "left", waypoints: [], directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, ...extra }) as unknown as Connector;

/** Company (white-box) with Start → Check → Pay; a black-box Customer pool with a message into Check. */
const diagram = (): DiagramData => ({
  elements: [
    E({ id: "cust", type: "pool", x: 0, y: 0, width: 900, height: 80, label: "Customer", properties: { poolType: "black-box" } }),
    E({ id: "co", type: "pool", x: 0, y: 220, width: 900, height: 200, label: "Company", properties: { poolType: "white-box" } }),
    E({ id: "l1", type: "lane", x: 30, y: 220, width: 870, height: 200, label: "Clerk", parentId: "co" }),
    E({ id: "st", type: "start-event", x: 60, y: 290, width: 36, height: 36, label: "Start", parentId: "l1" }),
    E({ id: "t1", type: "task", x: 150, y: 275, width: 120, height: 70, label: "Check", parentId: "l1", properties: { taskType: "user" } }),
    E({ id: "t2", type: "task", x: 330, y: 275, width: 120, height: 70, label: "Pay", parentId: "l1", properties: { taskType: "user" } }),
    E({ id: "t3", type: "task", x: 510, y: 275, width: 120, height: 70, label: "Archive", parentId: "l1", properties: { taskType: "user" } }),
  ],
  connectors: [
    C("f1", "st", "t1"), C("f2", "t1", "t2"),
    C("m1", "cust", "t1", "messageBPMN", { sourceSide: "bottom", targetSide: "top" }),
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

function run(text: string, opts: { selectedIds?: string[]; selectedConnectorId?: string | null } = {}, data: DiagramData = diagram()) {
  const h = headlessDiagram(data);
  const ops = parseCommand(text);
  if (!ops) throw new Error("not a command: " + text);
  const r = applyAssistOps(ops, h.context(opts));
  return { h, r, ops };
}
const ids = (h: ReturnType<typeof headlessDiagram>) => h.data.connectors.map((c) => c.id).sort();

describe("T5092 — the words: delete/remove connectors and messages, reverse this, connect these", () => {
  it("plural connector and message deletes are their own commands", () => {
    for (const s of ["delete connectors", "remove connectors", "delete all connectors", "remove the connections", "delete all the arrows", "delete the flows", "remove all links."]) {
      expect(parseCommand(s), s).toEqual([{ op: "deleteConnectors", kind: "connector" }]);
    }
    for (const s of ["delete messages", "remove messages", "delete all messages", "remove the messages", "delete the message flows", "delete all the selected messages"]) {
      expect(parseCommand(s), s).toEqual([{ op: "deleteConnectors", kind: "message" }]);
    }
    expect(parseConnectorsDelete("delete the task")).toBeNull();
    expect(parseConnectorsDelete("delete Approve messages")).toBeNull();
  });

  it("'delete this' is still an ordinary delete (the apply layer knows what is selected); 'remove the link from A to B' is still a disconnect", () => {
    expect(parseCommand("delete this")).toEqual([{ op: "delete", ref: "this" }]);
    expect(parseCommand("remove the link from Check to Pay")?.[0].op).toBe("disconnect");
  });

  it("'reverse this' and its short forms", () => {
    for (const s of ["reverse this", "reverse", "reverse it", "reverse the connector", "flip this", "reverse the selected message", "reverse the direction of this connector", "reverse the flow."]) {
      expect(parseCommand(s), s).toEqual([{ op: "reverseConnector" }]);
    }
  });

  it("'connect these / the selected / the two selected' all mean the selection", () => {
    for (const s of ["connect these", "connect them", "connect the selected", "connect the two selected", "join selected", "connect these two"]) {
      expect(parseCommand(s), s).toEqual([{ op: "connect", fromRef: "the previous", toRef: "the last" }]);
    }
    expect(parseCommand("connect Check to Pay")).toEqual([{ op: "connect", fromRef: "Check", toRef: "Pay" }]);
  });

  it("which words mean the selected connector: pronouns only when no element is selected; a connector noun always", () => {
    expect(namesSelectedConnector("this", false)).toBe(true);
    expect(namesSelectedConnector("it", false)).toBe(true);
    expect(namesSelectedConnector("selected", false)).toBe(true);
    expect(namesSelectedConnector("this", true), "an element is selected: 'this' is the element").toBe(false);
    expect(namesSelectedConnector("this message", true)).toBe(true);
    expect(namesSelectedConnector("the selected connector", true)).toBe(true);
    expect(namesSelectedConnector("Check", false)).toBe(false);
  });
});

describe("T5093 — 'delete this' with a connector selected, and the plural deletes", () => {
  it("a selected connector (a flow, then a message) goes with 'delete this'", () => {
    const a = run("delete this", { selectedConnectorId: "f2" });
    expect(a.r.summary).toBe("deleted the connector");
    expect(ids(a.h)).toEqual(["f1", "m1"]);
    const b = run("delete this", { selectedConnectorId: "m1" });
    expect(b.r.summary).toBe("deleted the message");
    expect(ids(b.h)).toEqual(["f1", "f2"]);
    expect(b.h.data.elements).toHaveLength(diagram().elements.length);
  });

  it("with an ELEMENT selected 'delete this' is still the element; 'delete this message' is the message whatever else is selected", () => {
    const a = run("delete this", { selectedIds: ["t3"] });
    expect(a.h.data.elements.some((e) => e.id === "t3")).toBe(false);
    const b = run("delete the selected message", { selectedIds: ["t3"], selectedConnectorId: "m1" });
    expect(ids(b.h)).toEqual(["f1", "f2"]);
    expect(b.h.data.elements.some((e) => e.id === "t3")).toBe(true);
  });

  it("'delete connectors': the selected connector → just it; elements selected → the connectors on them; nothing selected → the numbers ask which", () => {
    expect(ids(run("delete connectors", { selectedConnectorId: "f1" }).h)).toEqual(["f2", "m1"]);
    const onT1 = run("delete connectors", { selectedIds: ["t1"] });
    expect(ids(onT1.h), "Start→Check, Check→Pay and the message into Check all touch Check").toEqual([]);
    expect(onT1.r.summary).toBe("deleted 3 connectors");
    const all = run("delete connectors");
    expect(ids(all.h), "nothing is removed until a number is said").toEqual(["f1", "f2", "m1"]);
    expect(all.h.screen).toContain("pick");
    expect(all.r.summary).toBe("which connectors to delete? say the numbers (1–3) — like “three, seven and nine” — or “all”, or “cancel”");
  });

  it("'delete messages' takes only messages; flows stay (one message: no question)", () => {
    const a = run("delete messages");
    expect(ids(a.h)).toEqual(["f1", "f2"]);
    expect(a.r.summary).toBe("deleted the message");
    expect(ids(run("remove messages", { selectedIds: ["t2"] }).h), "no message on Pay: nothing removed").toEqual(["f1", "f2", "m1"]);
    expect(run("remove messages", { selectedIds: ["t2"] }).r.summary).toBe("no messages on the selected elements");
    expect(run("delete messages", { selectedConnectorId: "f1" }).r.summary).toBe("the selected connector isn’t a message");
  });

  it("nothing to delete says so", () => {
    const empty = { ...diagram(), connectors: [] } as DiagramData;
    expect(run("delete connectors", {}, empty).r.summary).toBe("there are no connectors to delete");
  });

  it("removing MORE than one asks first; one goes at once (the confirmation rule)", () => {
    const d = diagram();
    const ask = (text: string, sel: string[] = [], conn: string | null = null) =>
      needsConfirmation(parseCommand(text)!, d.elements, null, sel, { all: d.connectors, selectedId: conn });
    expect(ask("delete connectors"), "nothing selected: the numbers are the question").toBeNull();
    expect(ask("delete connectors", ["t1"])?.what).toBe("delete the 3 connectors attached to the selected elements");
    expect(ask("delete messages"), "one message: no question").toBeNull();
    expect(ask("delete connectors", [], "f1"), "one selected connector: no question").toBeNull();
    expect(connectorsForDelete("message", d.connectors, [], null).connectors.map((c) => c.id)).toEqual(["m1"]);
  });
});

describe("T5094 — 'reverse this' flips the selected connector; 'connect these' joins in the order selected", () => {
  it("a selected flow is reversed and the selection is spent", () => {
    const { h, r } = run("reverse this", { selectedConnectorId: "f2" });
    expect(r.summary).toBe("reversed the connector: now Pay → Check");
    const c = h.data.connectors.find((x) => x.id === "f2")!;
    expect([c.sourceId, c.targetId]).toEqual(["t2", "t1"]);
  });

  it("with no connector selected it says so", () => {
    expect(run("reverse this").r.summary).toBe("select a connector first");
  });

  it("a reversal the rules forbid is refused and changes nothing", () => {
    // Start → Check reversed would be Check → Start: nothing flows into a start event
    const { h, r } = run("reverse this", { selectedConnectorId: "f1" });
    expect(r.summary).toContain("can’t reverse");
    expect(h.data.connectors.find((x) => x.id === "f1")!.sourceId).toBe("st");
  });

  it("a message is reversed too when the rules allow (black-box pool ← task is not: only pools send)", () => {
    const { r } = run("reverse this", { selectedConnectorId: "m1" });
    expect(r.summary.startsWith("reversed the message") || r.summary.includes("can’t reverse")).toBe(true);
  });

  it("'connect these' with two selected: the FIRST selected flows into the SECOND", () => {
    const a = run("connect these", { selectedIds: ["t3", "t2"] });
    expect(a.r.summary).toBe("connected Archive → Pay");
    expect(a.h.data.connectors.some((c) => c.sourceId === "t3" && c.targetId === "t2")).toBe(true);
    const b = run("connect these", { selectedIds: ["t2", "t3"] });
    expect(b.r.summary).toBe("connected Pay → Archive");
  });

  it("an order the rules forbid says so and hints at the order", () => {
    // Archive into the Start event is not allowed
    const { r } = run("connect the selected", { selectedIds: ["t3", "st"] });
    expect(r.summary).toBe("can’t connect Archive → Start — select them in the order you want them joined");
  });

  it("without exactly two selected, 'connect these' is what it always was (the last two mentioned)", () => {
    const { r } = run("connect these", { selectedIds: ["t1", "t2", "t3"] });
    expect(r.summary).not.toContain("select them in the order");
  });
});

describe("T5095 — the phone picks a connector by its line", () => {
  const d = { ...diagram(), connectors: [C("f2", "t1", "t2", "sequence", { waypoints: [{ x: 270, y: 310 }, { x: 330, y: 310 }] }), C("m1", "cust", "t1", "messageBPMN", { waypoints: [{ x: 210, y: 80 }, { x: 210, y: 275 }] })] } as DiagramData;
  it("the nearest line within a finger's width; none beyond it; any connector type", () => {
    expect(connectorAt(d, 300, 316)?.id).toBe("f2");
    expect(connectorAt(d, 214, 150)?.id, "a message down through the Customer pool's gap").toBe("m1");
    expect(connectorAt(d, 300, 360)).toBeNull();
  });
  it("a review-comment link is not selectable this way", () => {
    const rc = { ...d, connectors: [C("r1", "t1", "t2", "review-comment-link", { waypoints: [{ x: 270, y: 310 }, { x: 330, y: 310 }] })] } as DiagramData;
    expect(connectorAt(rc, 300, 310)).toBeNull();
  });
});

describe("T5097 — a spoken list of numbers", () => {
  const list = (s: string, max = 12) => parseNumberList(s, max);
  it("Paul's own: 'three, seven, eight, and nine'", () => {
    expect(list("three, seven, eight, and nine")).toEqual({ kind: "numbers", numbers: [3, 7, 8, 9] });
  });
  it("digits, spaces, 'and', 'then', a lead-in, and a range", () => {
    expect(list("3 7 8 9")).toEqual({ kind: "numbers", numbers: [3, 7, 8, 9] });
    expect(list("one and two then five")).toEqual({ kind: "numbers", numbers: [1, 2, 5] });
    expect(list("delete numbers 2, 4")).toEqual({ kind: "numbers", numbers: [2, 4] });
    expect(list("three through six")).toEqual({ kind: "numbers", numbers: [3, 4, 5, 6] });
    expect(list("twenty two and 27", 30)).toEqual({ kind: "numbers", numbers: [22, 27] });
    expect(list("two, two, three")).toEqual({ kind: "numbers", numbers: [2, 3] });
  });
  it("'all' (and its wordings); a number that is not on screen is named; anything else is not a list", () => {
    for (const s of ["all", "all of them", "everything"]) expect(list(s)).toEqual({ kind: "all" });
    expect(list("three and fourteen")).toEqual({ kind: "out-of-range", numbers: [14] });
    expect(list("Customer")).toBeNull();
    expect(list("three and Customer")).toBeNull();
    expect(list("")).toBeNull();
  });
});

describe("T5098 — every delete with nothing selected asks which, by number", () => {
  it("'delete tasks' / 'delete lanes' / 'remove events' are their own command", () => {
    expect(parseCommand("delete tasks")).toEqual([{ op: "deleteMany", itemType: "task", word: "tasks" }]);
    expect(parseCommand("remove all the events")).toEqual([{ op: "deleteMany", itemType: "event", word: "events" }]);
    expect(parseCommand("delete lanes")).toEqual([{ op: "deleteMany", itemType: "lane", word: "lanes" }]);
    expect(parseCommand("delete the task")?.[0].op, "singular is one reference: unchanged").toBe("delete");
    expect(parseCommand("delete task Check")?.[0].op, "a name is still a plain delete").toBe("delete");
  });
  it("nothing selected: two or more tasks are numbered and asked about; nothing is deleted yet", () => {
    const { h, r } = run("delete tasks");
    expect(r.summary).toBe("which tasks to delete? say the numbers (1–3) — like “three, seven and nine” — or “all”, or “cancel”");
    expect(h.screen).toContain("pick");
    expect(h.data.elements).toHaveLength(diagram().elements.length);
  });
  it("just one of the kind goes at once; none says so", () => {
    expect(run("delete events").h.data.elements.some((e) => e.id === "st")).toBe(false);
    const noGateways = run("delete gateways");
    expect(noGateways.r.summary).toBe("there are no gateways to delete");
  });
  it("some selected: it is the ordinary 'delete the selected tasks'", () => {
    const { h } = run("delete tasks", { selectedIds: ["t3"] });
    expect(h.data.elements.some((e) => e.id === "t3")).toBe(false);
    expect(h.data.elements.some((e) => e.id === "t2")).toBe(true);
    const ask = needsConfirmation(parseCommand("delete tasks")!, diagram().elements, null, ["t2", "t3"]);
    expect(ask?.what).toBe("delete the 2 selected elements");
  });
});
