/**
 * Abracadabra Mode interpreter: deterministic grammar + name/pronoun resolution.
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { resolveRef } from "@/app/lib/assist/resolveRef";
import { validateOps } from "@/app/lib/assist/ops";
import type { DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, label = "", extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label, x: 0, y: 0, width: 100, height: 60, properties: {}, ...extra });

describe("parseCommand — add", () => {
  it("add a task called X after Y", () => {
    expect(parseCommand("add a task called Approve after Review")).toEqual([
      { op: "add", symbolType: "task", label: "Approve", afterRef: "Review" },
    ]);
  });
  it("add a start event", () => {
    expect(parseCommand("add a start event")).toEqual([{ op: "add", symbolType: "start-event" }]);
  });
  it("add a decision → exclusive gateway", () => {
    expect(parseCommand("add a decision")).toEqual([{ op: "add", symbolType: "gateway", gatewayType: "exclusive" }]);
  });
  it("insert a parallel gateway", () => {
    expect(parseCommand("insert a parallel gateway")).toEqual([{ op: "add", symbolType: "gateway", gatewayType: "parallel" }]);
  });
  it("add Approve after Review (no type word → task)", () => {
    expect(parseCommand("add Approve after Review")).toEqual([{ op: "add", symbolType: "task", label: "Approve", afterRef: "Review" }]);
  });
  it("implicit label after the type", () => {
    expect(parseCommand("add a task Review invoice")).toEqual([{ op: "add", symbolType: "task", label: "Review invoice" }]);
  });
});

describe("parseCommand — connect / disconnect", () => {
  it("connect X to Y", () => {
    expect(parseCommand("connect Send Invoice to Receive Payment")).toEqual([
      { op: "connect", fromRef: "Send Invoice", toRef: "Receive Payment" },
    ]);
  });
  it("connect them → previous to last", () => {
    expect(parseCommand("connect them")).toEqual([{ op: "connect", fromRef: "the previous", toRef: "the last" }]);
  });
  it("disconnect X from Y", () => {
    expect(parseCommand("disconnect Review from Approve")).toEqual([{ op: "disconnect", fromRef: "Review", toRef: "Approve" }]);
  });
});

describe("parseCommand — rename / delete / undo", () => {
  it("rename X to Y", () => {
    expect(parseCommand("rename Review to Quality Check")).toEqual([{ op: "rename", ref: "Review", label: "Quality Check" }]);
  });
  it("delete the gateway", () => {
    expect(parseCommand("delete the gateway")).toEqual([{ op: "delete", ref: "gateway" }]);
  });
  it("undo that", () => {
    expect(parseCommand("undo that")).toEqual([{ op: "undo" }]);
  });
  it("returns null for unrecognised phrasings", () => {
    expect(parseCommand("make the approval bit loop back when it fails")).toBeNull();
  });
});

describe("parseCommand — lanes / sublanes", () => {
  it("add 2 lanes to the middle pool called A and B", () => {
    expect(parseCommand("add 2 lanes to the middle pool called Sales Team and Marketing Team")).toEqual([
      { op: "addLanes", poolRef: "the middle pool", labels: ["Sales Team", "Marketing Team"] },
    ]);
  });
  it("add 3 sublanes with an Oxford comma", () => {
    expect(parseCommand("add 3 sublanes to the Marketing Team lane called Marketing Manager, Marketing Assistant, and Marketing Staff")).toEqual([
      { op: "addSublanes", laneRef: "the Marketing Team lane", labels: ["Marketing Manager", "Marketing Assistant", "Marketing Staff"] },
    ]);
  });
  it("add a single lane", () => {
    expect(parseCommand("add a lane to Pool 1 called Finance")).toEqual([{ op: "addLanes", poolRef: "Pool 1", labels: ["Finance"] }]);
  });
  it("lanes without names → default Lane N labels", () => {
    expect(parseCommand("add 3 lanes to the pool")).toEqual([{ op: "addLanes", poolRef: "the pool", labels: ["Lane 1", "Lane 2", "Lane 3"] }]);
  });
  it("mishearings: 'line' → lane, 'poll' → pool", () => {
    expect(parseCommand("add 2 lines to the pool called A and B")).toEqual([{ op: "addLanes", poolRef: "the pool", labels: ["A", "B"] }]);
    expect(parseCommand("put a poll around all elements")).toEqual([{ op: "wrapInPool" }]);
    expect(parseCommand("wrap all elements in a poll")).toEqual([{ op: "wrapInPool" }]);
  });
  it("sublanes without names → default Sublane N labels", () => {
    expect(parseCommand("add 2 sublanes to Sales Team")).toEqual([{ op: "addSublanes", laneRef: "Sales Team", labels: ["Sublane 1", "Sublane 2"] }]);
  });
  it("'new'/adjectives + optional target (defaults 'the pool'/'the lane')", () => {
    expect(parseCommand("add a new lane to the pool")).toEqual([{ op: "addLanes", poolRef: "the pool", labels: ["Lane 1"] }]);
    expect(parseCommand("add a new lane")).toEqual([{ op: "addLanes", poolRef: "the pool", labels: ["Lane 1"] }]);
    expect(parseCommand("add a new sublane")).toEqual([{ op: "addSublanes", laneRef: "the lane", labels: ["Sublane 1"] }]);
  });
  it("wrap vs extend vs create (bare 'add a pool' is a NEW pool)", () => {
    // "put/wrap a pool around everything" adopts loose elements → wrapInPool
    expect(parseCommand("add a pool to all elements on the diagram")).toEqual([{ op: "wrapInPool" }]);
    expect(parseCommand("wrap everything in a pool")).toEqual([{ op: "wrapInPool" }]);
    // "extend the pool…" now widens + equalises all pools → extendPools
    expect(parseCommand("extend the pool to include all elements")).toEqual([{ op: "extendPools" }]);
    // bare add → create a new (empty) pool, not wrap
    expect(parseCommand("add a pool")).toEqual([{ op: "addPool" }]);
    expect(parseCommand("add a new pool")).toEqual([{ op: "addPool" }]);
  });
  it("container words never become a task", () => {
    // malformed pool phrasing → null (AI), not a task named after the phrase
    expect(parseCommand("add a pool thingy blah")).toBeNull();
  });
});

// The definitive container-maintenance command set (docs/abracadabra-commands.md).
describe("container maintenance — definitive set", () => {
  it("1. Add Pool", () => {
    expect(parseCommand("add a pool")).toEqual([{ op: "addPool" }]);
    expect(parseCommand("create a pool called Finance")).toEqual([{ op: "addPool", label: "Finance" }]);
  });
  it("2. Add Lane to Pool", () => {
    expect(parseCommand("add a lane to the pool")).toEqual([{ op: "addLanes", poolRef: "the pool", labels: ["Lane 1"] }]);
    expect(parseCommand("add a lane to My Company called Sales")).toEqual([{ op: "addLanes", poolRef: "My Company", labels: ["Sales"] }]);
  });
  it("3. Add Lane above/below a lane", () => {
    expect(parseCommand("add a lane above Lane 2")).toEqual([{ op: "addLaneAt", poolRef: "the pool", position: "above", refLane: "Lane 2" }]);
    expect(parseCommand("add a lane below the Sales lane")).toEqual([{ op: "addLaneAt", poolRef: "the pool", position: "below", refLane: "Sales lane" }]);
    expect(parseCommand("insert a lane to My Company below Sales called Support")).toEqual([{ op: "addLaneAt", poolRef: "My Company", position: "below", refLane: "Sales", label: "Support" }]);
  });
  it("4. Delete Lane / Sublane", () => {
    expect(parseCommand("delete lane 2")).toEqual([{ op: "delete", ref: "lane 2" }]);
    expect(parseCommand("remove the sublane Marketing Assistant")).toEqual([{ op: "delete", ref: "sublane Marketing Assistant" }]);
  });
  it("5. Add Sublanes to a lane", () => {
    expect(parseCommand("add 3 sublanes to Marketing called A, B and C")).toEqual([{ op: "addSublanes", laneRef: "Marketing", labels: ["A", "B", "C"] }]);
    expect(parseCommand("add sublanes to the Sales lane")).toEqual([{ op: "addSublanes", laneRef: "the Sales lane", labels: ["Sublane 1"] }]);
  });
  it("6. Extend pools to include all elements (widen + equalise)", () => {
    expect(parseCommand("extend the pool to include all elements on the diagram")).toEqual([{ op: "extendPools" }]);
    expect(parseCommand("widen the pools")).toEqual([{ op: "extendPools" }]);
    expect(parseCommand("lengthen the pool")).toEqual([{ op: "extendPools" }]);
    expect(parseCommand("include all elements")).toEqual([{ op: "extendPools" }]);
    expect(parseCommand("extend all pools to the right")).toEqual([{ op: "extendPools" }]);
  });
  it("7/8. Add Black-box Pool above/below existing pools", () => {
    expect(parseCommand("add a black-box pool above existing pools")).toEqual([{ op: "addPool", poolType: "black-box", position: "above" }]);
    expect(parseCommand("add a black box pool below existing pools")).toEqual([{ op: "addPool", poolType: "black-box", position: "below" }]);
  });
  it("9. Swap two lanes", () => {
    expect(parseCommand("swap lane Sales with lane Marketing")).toEqual([{ op: "swapLanes", laneA: "lane Sales", laneB: "lane Marketing" }]);
    expect(parseCommand("swap Sales and Marketing")).toEqual([{ op: "swapLanes", laneA: "Sales", laneB: "Marketing" }]);
  });
  it("10. Compress a pool (all aliases)", () => {
    expect(parseCommand("compress the Customer pool")).toEqual([{ op: "compressPool", poolRef: "Customer" }]);
    expect(parseCommand("shrink Sales")).toEqual([{ op: "compressPool", poolRef: "Sales" }]);
    expect(parseCommand("collapse the pool")).toEqual([{ op: "compressPool", poolRef: "pool" }]);
    expect(parseCommand("reduce the Finance pool")).toEqual([{ op: "compressPool", poolRef: "Finance" }]);
    expect(parseCommand("shorten Sales")).toEqual([{ op: "compressPool", poolRef: "Sales" }]);
    expect(parseCommand("compact the HR pool")).toEqual([{ op: "compressPool", poolRef: "HR" }]);
  });
});

describe("parseCommand — message flows", () => {
  it("add message from an activity to a pool, labelled", () => {
    expect(parseCommand("add message from Task 1 to IT System labelled Email Details")).toEqual([
      { op: "addMessage", fromRef: "Task 1", toRef: "IT System", label: "Email Details" },
    ]);
  });
  it("add message to a pool from an activity (reversed order)", () => {
    expect(parseCommand("add a message to IT System from Task 1 saying Email Details")).toEqual([
      { op: "addMessage", fromRef: "Task 1", toRef: "IT System", label: "Email Details" },
    ]);
  });
  it("add message without a label", () => {
    expect(parseCommand("send a message flow from Approve to Customer")).toEqual([
      { op: "addMessage", fromRef: "Approve", toRef: "Customer" },
    ]);
  });
  it("rename a message by label (falls through to rename op)", () => {
    expect(parseCommand("rename 'Email Details' to 'Send the invoice'")).toEqual([
      { op: "rename", ref: "Email Details", label: "Send the invoice" },
    ]);
  });
  it("delete a message by label (falls through to delete op)", () => {
    expect(parseCommand("delete 'Email Details'")).toEqual([{ op: "delete", ref: "Email Details" }]);
  });
});

describe("resolveRef — positional", () => {
  const pools = [
    el("p1", "pool", "Ops", { x: 0, y: 0, width: 200, height: 100 }),
    el("p2", "pool", "Sales", { x: 300, y: 0, width: 200, height: 100 }),
    el("p3", "pool", "HR", { x: 600, y: 0, width: 200, height: 100 }),
  ];
  it("left / middle / right pool by position", () => {
    expect(resolveRef("the left pool", pools)).toEqual({ id: "p1" });
    expect(resolveRef("the middle pool", pools)).toEqual({ id: "p2" });
    expect(resolveRef("the right pool", pools)).toEqual({ id: "p3" });
  });
});

describe("parseCommand — boundary event", () => {
  it("add a boundary event called X to Y", () => {
    expect(parseCommand("add a boundary event called Cancel process to the Repeat Until subprocess")).toEqual([
      { op: "addBoundary", hostRef: "the Repeat Until subprocess", label: "Cancel process" },
    ]);
  });
  it("add a boundary event to Y called X", () => {
    expect(parseCommand("add a boundary event to Review called Timeout")).toEqual([
      { op: "addBoundary", hostRef: "Review", label: "Timeout" },
    ]);
  });
  it("add a boundary event on Y (no label)", () => {
    expect(parseCommand("put a boundary event on the Prepare task")).toEqual([{ op: "addBoundary", hostRef: "the Prepare task" }]);
  });
});

describe("parseCommand — move / wrap / delete+compact (Batch 3)", () => {
  it("move X two elements to the right", () => {
    expect(parseCommand("move the gateway two elements to the right")).toEqual([
      { op: "move", ref: "the gateway", direction: "right", count: 2 },
    ]);
  });
  it("move X left (default count 1)", () => {
    expect(parseCommand("move Review left")).toEqual([{ op: "move", ref: "Review", direction: "left", count: 1 }]);
  });
  it("put a pool around everything", () => {
    expect(parseCommand("put a pool around everything")).toEqual([{ op: "wrapInPool" }]);
    expect(parseCommand("wrap everything in a pool")).toEqual([{ op: "wrapInPool" }]);
  });
  it("delete + compact", () => {
    expect(parseCommand("remove Prepare and compact")).toEqual([{ op: "delete", ref: "Prepare", compact: true }]);
    expect(parseCommand("delete the task Prepare and tidy up")).toEqual([{ op: "delete", ref: "task Prepare", compact: true }]);
    expect(parseCommand("delete Prepare")).toEqual([{ op: "delete", ref: "Prepare" }]);
  });
});

describe("parseCommand — clear / export", () => {
  it("clear the diagram", () => {
    expect(parseCommand("clear the diagram")).toEqual([{ op: "clear" }]);
    expect(parseCommand("clear current diagram")).toEqual([{ op: "clear" }]);
    expect(parseCommand("start over")).toEqual([{ op: "clear" }]);
    expect(parseCommand("wipe everything")).toEqual([{ op: "clear" }]);
  });
  it("export to JSON", () => {
    expect(parseCommand("export diagram to json")).toEqual([{ op: "export", format: "json" }]);
    expect(parseCommand("download as JSON")).toEqual([{ op: "export", format: "json" }]);
    expect(parseCommand("export the diagram")).toEqual([{ op: "export", format: "json" }]);
  });
});

describe("resolveRef", () => {
  const els = [el("s", "start-event"), el("t1", "task", "Review"), el("g", "gateway", "Approved?"), el("t2", "task", "Send Invoice")];
  it("exact + substring by name", () => {
    expect(resolveRef("Review", els)).toEqual({ id: "t1" });
    expect(resolveRef("invoice", els)).toEqual({ id: "t2" });
  });
  it("bare type noun → unique of that type", () => {
    expect(resolveRef("the gateway", els)).toEqual({ id: "g" });
    expect(resolveRef("the start event", els)).toEqual({ id: "s" });
  });
  it("pronoun 'it' → last added (array order)", () => {
    expect(resolveRef("it", els)).toEqual({ id: "t2" });
    expect(resolveRef("the previous", els)).toEqual({ id: "g" });
  });
  it("ambiguous exact labels list candidates", () => {
    const dup = [el("a", "task", "Review"), el("b", "task", "Review")];
    expect(resolveRef("Review", dup)).toEqual({ ambiguous: ["a", "b"] });
  });
  it("no match → null", () => {
    expect(resolveRef("Nonexistent", els)).toBeNull();
  });
  it("number words match digit names ('lane two' → 'Lane 2')", () => {
    const lanes = [el("l1", "lane", "Lane 1"), el("l2", "lane", "Lane 2")];
    expect(resolveRef("lane two", lanes)).toEqual({ id: "l2" });
    expect(resolveRef("remove lane two".replace(/^remove\s+/, ""), lanes)).toEqual({ id: "l2" });
  });
  it("bare container nouns resolve ('the pool' / 'pool' → the pool)", () => {
    const withPool = [el("p", "pool", "My Company"), el("t1", "task", "Review")];
    expect(resolveRef("the pool", withPool)).toEqual({ id: "p" });
    expect(resolveRef("pool", withPool)).toEqual({ id: "p" });
  });
  it("strips a leading kind word (#4 remove-sublane phrasing)", () => {
    const lanes = [el("l1", "sublane", "Marketing Assistant"), el("l2", "sublane", "Marketing Staff")];
    expect(resolveRef("sublane Marketing Assistant", lanes)).toEqual({ id: "l1" });
    expect(resolveRef("the sub lane Marketing Staff", lanes)).toEqual({ id: "l2" });
    expect(resolveRef("task Review", els)).toEqual({ id: "t1" });
  });
});

describe("validateOps (AI output)", () => {
  it("keeps valid ops, drops junk", () => {
    const out = validateOps([
      { op: "add", symbolType: "task", label: "X" },
      { op: "add", symbolType: "banana" },        // invalid type
      { op: "connect", fromRef: "A", toRef: "B" },
      { op: "delete" },                            // missing ref
      { op: "frobnicate" },                        // unknown op
    ]);
    expect(out).toEqual([
      { op: "add", symbolType: "task", label: "X" },
      { op: "connect", fromRef: "A", toRef: "B" },
    ]);
  });
});
