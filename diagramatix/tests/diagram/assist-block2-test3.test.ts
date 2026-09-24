/**
 * T4618-T4622 — Block 2 Test 3, 21 September 2026, plus the gateway MOVE command.
 *
 * Paul's three reproducible findings. (His fourth — "adding sublanes to the
 * Shipping Lane destabilises the Pool containment" — is NOT here: driving
 * `SPLIT_LANE_EVEN` through the real reducer, once and twice over, produces
 * exact containment every time, so the cause is elsewhere and guessing at a
 * guard would be worse than asking for the export.)
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { looksLikeAnotherCommand, looksPositionalNotAName } from "@/app/lib/assist/greedyGuards";
import { reducer } from "@/app/hooks/useDiagram";
import { validateOps } from "@/app/lib/assist/ops";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const editorSrc = () => editorWithApplyLayer();
import type { DiagramElement, DiagramData } from "@/app/lib/diagram/types";
import { editorWithApplyLayer } from "./assistApplySource";

const lane = (id: string, y: number, h: number, parentId?: string): DiagramElement =>
  ({ id, type: "lane", label: id, x: 0, y, width: 800, height: h, parentId, properties: {} }) as unknown as DiagramElement;

describe("T4618 — naming the gateway no longer breaks the point swap", () => {
  it("accepts the target phrase people actually say", () => {
    // "Swap top and bottom" always worked; every more EXPLICIT way of saying
    // the same thing fell through to the LANE swap and answered "couldn't find
    // 'selected gateway, top'" — so the feature looked gone entirely (Paul:
    // "What happened to Swap selected Top and Bottom?").
    const want = [{ op: "swapGatewayPoints", a: "top", b: "bottom" }];
    for (const said of [
      "swap top and bottom",
      "swap the top and bottom",
      "swap selected, top and bottom",
      "swap selected gateway, top and bottom",
      "swap the selected gateway, top and bottom",
      "swap gateway top and bottom",
      "swap these, top and bottom",
    ]) {
      expect(parseCommand(said), said).toEqual(want);
    }
  });

  it("still reads a LANE swap as a lane swap", () => {
    // Two NAMES, not two point words — the rule the gateway phrasings were
    // falling into.
    expect(parseCommand("swap Sales with Picking")).toEqual([
      { op: "swapLanes", laneA: "Sales", laneB: "Picking" },
    ]);
    expect(parseCommand("swap lane Sales and lane Marketing")?.[0].op).toBe("swapLanes");
  });

  it("covers every ordered pair of points", () => {
    for (const a of ["top", "bottom", "middle", "left", "right"]) {
      for (const b of ["top", "bottom", "middle", "left", "right"]) {
        if (a === b) continue;
        expect(parseCommand(`swap selected gateway, ${a} and ${b}`), `${a}/${b}`)
          .toEqual([{ op: "swapGatewayPoints", a, b }]);
      }
    }
  });
});

describe("T4619 — one hesitation must not produce two outcomes", () => {
  it("holds an under-specified lane count for the rest of the sentence", () => {
    // Paul: "slight hesitations produce interrupted commands that create both
    // a rule based and an AI based outcome. This double-up must be avoided."
    //
    //   "Add two sublanes"                                  → ran: 2 in the
    //                                                          WRONG lane
    //   "to shipping called domestic and international."     → AI rebuilt it:
    //                                                          2 more
    //
    // Four sub-lanes from one sentence. A count with NEITHER a target NOR
    // names is under-specified — the sentence a person says names at least one.
    expect(isIncompleteCommand("add two sublanes")).toBe(true);
    expect(isIncompleteCommand("add three lanes")).toBe(true);
    expect(isIncompleteCommand("add 2 sublanes")).toBe(true);
  });

  it("does not hold a command that says enough", () => {
    for (const said of [
      "add 2 sublanes to Shipping called A and B",
      "add three lanes to Warehouse called A, B and C",
      "add two lanes to the middle pool",
      "add three lanes called Sales, Picking and Shipping",
    ]) {
      expect(isIncompleteCommand(said), said).toBe(false);
    }
  });

  it("does NOT hold “add a lane”, the one phrasing people use alone", () => {
    // Holding it would delay the single most common lane command for no gain:
    // its default target — the pool — is right.
    expect(isIncompleteCommand("add a lane")).toBe(false);
    expect(isIncompleteCommand("add a sublane")).toBe(false);
  });

  it("still parses once the whole sentence has arrived", () => {
    expect(parseCommand("add two sublanes to Shipping called Domestic and International"))
      .toEqual([{ op: "addSublanes", laneRef: "Shipping", labels: ["Domestic", "International"] }]);
  });
});

describe("T4620 — an implicit label that is really another command", () => {
  it("declines “Put Surround everything with a pool”", () => {
    // The recogniser dropped the pause, so the add rule took "put", found no
    // symbol word, and made a TASK named "Surround everything with a pool".
    expect(parseCommand("Put Surround everything with a pool."), "→ the AI, which got it right")
      .toBeNull();
    expect(looksLikeAnotherCommand("Surround everything with a pool")).toBe(true);
  });

  it("needs BOTH an instruction word and a container word", () => {
    // "Review everything" is a perfectly good task name, and "Surround" alone
    // might be one. It is the pair that gives it away.
    expect(looksLikeAnotherCommand("Review everything")).toBe(false);
    expect(looksLikeAnotherCommand("Surround Sound")).toBe(false);
    expect(looksLikeAnotherCommand("Wrap the pool")).toBe(true);
    expect(looksLikeAnotherCommand("Compress the lanes")).toBe(true);
  });

  it("leaves ordinary task names alone", () => {
    for (const name of ["Approve Invoice", "Send to Customer", "Check Stock", "Pick Items"]) {
      expect(looksPositionalNotAName(name), name).toBe(false);
    }
    expect(parseCommand("add a task called Approve Invoice")?.[0])
      .toMatchObject({ op: "add", label: "Approve Invoice" });
  });
});

describe("T4621 — sub-lane containment, measured rather than assumed", () => {
  // Paul reported that adding sub-lanes destabilises the pool. Driven through
  // the real reducer it does not — kept as the measurement, so if it DOES
  // regress this says so, and so the next investigation starts from what was
  // already ruled out.
  const pool = () => ({
    elements: [
      ({ id: "pool", type: "pool", label: "Warehouse", x: 0, y: 0, width: 800, height: 400, properties: {} }) as unknown as DiagramElement,
      lane("Sales", 0, 100, "pool"), lane("Picking", 100, 100, "pool"),
      lane("Packing", 200, 100, "pool"), lane("Shipping", 300, 100, "pool"),
    ],
    connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
  }) as unknown as DiagramData;

  const split = (s: DiagramData, laneId: string, labels: string[]) =>
    reducer(s, { type: "SPLIT_LANE_EVEN", payload: { laneId, labels } } as never);

  it("keeps the pool spanning its lanes, and each lane its sub-lanes", () => {
    let s = split(pool(), "Shipping", ["Domestic", "International"]);
    s = split(s, "Packing", ["Sublane 1", "Sublane 2"]);
    const by = (id: string) => s.elements.find((e) => e.id === id)!;

    const p = by("pool");
    const lanes = s.elements.filter((e) => e.parentId === "pool");
    expect(Math.min(...lanes.map((l) => l.y)), "lanes start at the pool top").toBe(p.y);
    expect(Math.max(...lanes.map((l) => l.y + l.height)), "and end at its bottom").toBe(p.y + p.height);

    for (const parent of ["Shipping", "Packing"]) {
      const l = by(parent);
      const subs = s.elements.filter((e) => e.parentId === parent);
      expect(subs.length, parent).toBe(2);
      expect(Math.min(...subs.map((x) => x.y)), parent).toBe(l.y);
      expect(Math.max(...subs.map((x) => x.y + x.height)), parent).toBe(l.y + l.height);
    }
  });

  it("leaves the untouched lanes exactly where they were", () => {
    const before = pool();
    const after = split(before, "Shipping", ["A", "B"]);
    for (const id of ["Sales", "Picking", "Packing"]) {
      const b = before.elements.find((e) => e.id === id)!;
      const a = after.elements.find((e) => e.id === id)!;
      expect([a.y, a.height], id).toEqual([b.y, b.height]);
    }
  });
});

describe("T4622 — move a connector to a free gateway point", () => {
  it("parses the move, with or without naming the gateway", () => {
    // Paul, 2026-09-21: "Say 'Move top to bottom' or any combination of top,
    // middle, and bottom, to move a single connector on each gateway."
    const want = [{ op: "moveGatewayPoint", from: "top", to: "bottom" }];
    for (const said of [
      "move top to bottom",
      "move the top to the bottom",
      "move selected gateway, top to bottom",
      "move the selected gateway, top to bottom",
      "move these, top to bottom",
    ]) {
      expect(parseCommand(said), said).toEqual(want);
    }
  });

  it("covers every ordered pair", () => {
    for (const from of ["top", "middle", "bottom", "left", "right"]) {
      for (const to of ["top", "middle", "bottom", "left", "right"]) {
        if (from === to) continue;
        expect(parseCommand(`move ${from} to ${to}`), `${from}→${to}`)
          .toEqual([{ op: "moveGatewayPoint", from, to }]);
      }
    }
  });

  it("does NOT swallow an element move", () => {
    // "move X right" is the older, far more common command; a point move is
    // only ever two point WORDS joined by "to".
    expect(parseCommand("move Approve right")?.[0]).toMatchObject({ op: "move", ref: "Approve" });
    expect(parseCommand("move these right")?.[0].op).toBe("move");
    expect(parseCommand("move the gateway two elements to the right")?.[0])
      .toMatchObject({ op: "move", ref: "the gateway", count: 2 });
  });

  it("is a validated op, and refuses a no-op", () => {
    expect(validateOps([{ op: "moveGatewayPoint", from: "top", to: "bottom" }]))
      .toEqual([{ op: "moveGatewayPoint", from: "top", to: "bottom" }]);
    expect(validateOps([{ op: "moveGatewayPoint", from: "top", to: "top" }]), "nowhere to move to").toEqual([]);
    expect(validateOps([{ op: "moveGatewayPoint", from: "sideways", to: "top" }])).toEqual([]);
  });

  it("needs the destination FREE, and says so when it is not", () => {
    // The mirror of the swap, which needs both points taken. Saying the wrong
    // one of the pair should name the other, not refuse blankly — the user is
    // describing the same rearrangement either way.
    const body = editorSrc();
    expect(body).toMatch(/already has one — say “swap \$\{op\.from\} and \$\{op\.to\}”/);
    expect(body, "and a missing source connector is named too")
      .toMatch(/no \$\{isMerge \? "incoming" : "outgoing"\} connector at the \$\{op\.from\}/);
  });

  it("acts on every selected gateway, like the swap", () => {
    const body = editorSrc();
    expect(body).toMatch(/op\.op === "moveGatewayPoint"[\s\S]{0,400}selectedIds\.map/);
    expect(body).toMatch(/moved the \$\{op\.from\} connector to the \$\{op\.to\}/);
  });
});
