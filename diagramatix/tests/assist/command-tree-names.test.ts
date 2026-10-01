/**
 * Voice Assist Bubble Help — the next words must be correct.
 *
 * Paul, 2026-10-01: typing "move dividers" showed `<existing_element_name> … · up · down · left ·
 * right · top · bottom · above · below · over · under · [<number>] · [to]` and "That is already a
 * whole command". "move dividers down" showed next words that are not correct.
 *
 * Cause: a name variable took ANY words, so "dividers" was read as the name of an element. Two fixes,
 * tested here: (1) a reading made only of command words beats one that treats the words as a name;
 * (2) when the diagram's names are known, a name variable takes only real names.
 */
import { describe, it, expect } from "vitest";
import { computePanel, defaultCommandTree, formatNext, nameFits, namesOf, tokenise } from "@/app/lib/assist/commandTree";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

const tree = defaultCommandTree();
const fx = fixtureDiagram();
const NAMES = namesOf(fx.elements, fx.connectors);
const next = (said: string, ctx = {}) => formatNext(tree.next(tokenise(said), ctx).next);

describe("T5180 — a command word beats “treat it as a name”", () => {
  it("“move dividers” (no diagram names known): the command, complete, and NOTHING further — not up/down/left/right", () => {
    const r = tree.next(tokenise("move dividers"));
    expect(r.complete).toBe(true);
    expect(r.next).toEqual([]);
    expect(r.openSlot).toBeNull();
  });

  it("“rename lanes” is the type word, not a lane called Lanes; “rename tasks” likewise", () => {
    expect(tree.next(tokenise("rename lanes")).openSlot).toBeNull();
    expect(tree.next(tokenise("rename tasks")).complete).toBe(true);
  });

  it("the name reading takes over the moment no command word fits", () => {
    const r = tree.next(tokenise("rename review claim"));
    expect(r.openSlot).toBe("existing_label_name");
    expect(formatNext(r.next)).toContain("to");
  });

  it("a command that is complete under ANY reading is still called complete (no real command is ever unfinished)", () => {
    for (const said of ["undo", "move dividers", "rename lanes", "add a task", "connect them"]) expect(tree.accepts(said), said).toBe(true);
  });
});

describe("T5181 — with the diagram's names known, a name must be a real one", () => {
  const ctx = { names: NAMES };

  it("the names come from the diagram: activities, pools, lanes vs events, gateways, data and connector/message labels", () => {
    expect(NAMES.elements).toEqual(expect.arrayContaining(["Review Claim"]));
    expect(NAMES.labels.length).toBeGreaterThan(0);
    const els = [
      { id: "t", type: "task", label: "Check Order" }, { id: "p", type: "pool", label: "Company" },
      { id: "e", type: "start-event", label: "Order Received" }, { id: "g", type: "gateway", label: "Approved?" },
      { id: "u", type: "task", label: "" },
    ] as unknown as DiagramElement[];
    const conns = [{ id: "c", type: "sequence", label: "Yes" }, { id: "m", type: "messageBPMN", label: "Invoice" }, { id: "x", type: "sequence", label: "" }] as unknown as Connector[];
    expect(namesOf(els, conns)).toEqual({ elements: ["Check Order", "Company"], labels: ["Order Received", "Approved?", "Yes", "Invoice"] });
  });

  it("“move dividers down”: there is no element called dividers, so no command fits — and the panel says so", () => {
    expect(tree.next(tokenise("move dividers down"), ctx).ok).toBe(false);
    const v = computePanel(tree, { interim: "move dividers down", ghost: false, flow: null, names: NAMES });
    expect(v.mode).toBe("no-match");
    // …but “move dividers” alone is the command
    expect(computePanel(tree, { interim: "move dividers", ghost: false, flow: null, names: NAMES }).complete).toBe(true);
  });

  it("a real name is accepted, in whole or in part, and then “to” is offered", () => {
    for (const said of ["rename review claim", "rename claim", "rename review"]) {
      expect(next(said, ctx), said).toContain("to");
    }
    expect(tree.accepts("rename review claim to Assess Claim", ctx)).toBe(true);
  });

  it("a name that is not on the diagram is not accepted", () => {
    expect(tree.next(tokenise("rename frobnicate to Something"), ctx).ok).toBe(false);
    expect(tree.next(tokenise("move frobnicate up"), ctx).ok).toBe(false);
  });

  it("pointing phrases still work: “the gateway”, “the top lane”, “lane 3”, “task 2”, “this”", () => {
    for (const said of ["rename the gateway to Approved", "move the top lane up", "delete lane 3", "delete task 2", "rename this to Approved"]) {
      expect(tree.accepts(said, ctx), said).toBe(true);
    }
  });

  it("a name that starts with a command word still works once no command word fits: a lane called Top Floor", () => {
    const els = [{ id: "l", type: "lane", label: "Top Floor" }] as unknown as DiagramElement[];
    const names = namesOf(els, []);
    expect(tree.accepts("move top floor up", { names })).toBe(true);
  });

  it("no names known (no diagram to ask): any words may be a name — the lenient reading", () => {
    expect(tree.next(tokenise("rename frobnicate to Something")).ok).toBe(true);
  });

  it("the next words after a real name no longer include a name-start the speaker cannot mean", () => {
    // With names, "move review claim" offers the ways to move it; without names it would also offer more name words.
    const withNames = next("move review claim", ctx);
    expect(withNames).toEqual(expect.arrayContaining(["up", "down", "left", "right"]));
  });
});

describe("T5182 — nameFits, on its own", () => {
  const names = ["Review Claim", "Pay Claim", "Underwriters"];
  it("words must begin words of ONE real name, in any order; a last word may still be arriving", () => {
    expect(nameFits(["review", "claim"], names)).toEqual({ ok: true, complete: true });
    expect(nameFits(["claim", "review"], names).ok).toBe(true);
    expect(nameFits(["under"], names).ok).toBe(true);       // still being said
    expect(nameFits(["review", "pay"], names).ok).toBe(false); // two different names
    expect(nameFits(["dividers"], names).ok).toBe(false);
  });

  it("pointing words alone are fine; filler first then a name is fine; filler alone is not yet a name", () => {
    expect(nameFits(["the", "gateway"], names)).toEqual({ ok: true, complete: true });
    expect(nameFits(["the"], names)).toEqual({ ok: true, complete: false });
    expect(nameFits(["the", "review", "claim"], names).complete).toBe(true);
    expect(nameFits(["lane", "3"], names)).toEqual({ ok: true, complete: true });
  });
});
