/**
 * A spoken kind word BINDS — "compress pool three" means the pool.
 *
 * Paul, 2026-09-26: "\"Compress\" keyword are not recognised properly." The
 * investigation found the recogniser innocent since the boosts came out
 * (12 of 12 heard right). The parser was at fault: the compress rule threw the
 * word "pool" away, so "Compact pool three." asked "Pool 3 or Lane 3?" (his log
 * of 23 September, still reproducing); the same loss broke "move pool three
 * top boundary down" and "add a lane to 3"; and "delete X and compress" deleted
 * X, dropped the compaction and showed a green tick.
 *
 * These tests PARSE AND APPLY — the T4695 fix lived in the resolver alone and
 * its test only called the resolver, so it never reached the command.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { resolveRef } from "@/app/lib/assist/resolveRef";
import { refKind } from "@/app/lib/assist/refKinds";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { scoreCase } from "@/app/lib/assist/commandScore";
import { COMPRESS_VERBS } from "@/app/lib/assist/commandVerbs";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const src = (p: string) => readFileSync(p, "utf8");

/** The shape in Paul's 23 Sep log: a Pool 3 whose lanes include a Lane 3. */
const world = (): DiagramElement[] => [
  E({ id: "p1", type: "pool", label: "Company", x: 0, y: 0, width: 900, height: 300, properties: {} }),
  E({ id: "p3", type: "pool", label: "Pool 3", x: 0, y: 400, width: 900, height: 600, properties: {} }),
  E({ id: "L1", type: "lane", label: "Lane 1", x: 36, y: 400, width: 864, height: 200, parentId: "p3", properties: {} }),
  E({ id: "L2", type: "lane", label: "Lane 2", x: 36, y: 600, width: 864, height: 200, parentId: "p3", properties: {} }),
  E({ id: "L3", type: "lane", label: "Lane 3", x: 36, y: 800, width: 864, height: 200, parentId: "p3", properties: {} }),
  E({ id: "t1", type: "task", label: "Assess Risk", x: 200, y: 460, width: 100, height: 60, parentId: "L1", properties: {} }),
];
const diagram = (els = world()): DiagramData => ({ elements: els, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as DiagramData);

/** Parse, then apply to a headless editor — what the live command does. */
function run(said: string, els = world()) {
  const ops = parseCommand(said);
  const h = headlessDiagram(diagram(els));
  const r = ops ? applyAssistOps(ops, h.context()) : null;
  return { ops, h, r };
}

describe("T4900 — a spoken kind word reaches the command, and binds", () => {
  it("“Compact pool three.” compresses Pool 3 — no “Pool 3 or Lane 3?”", () => {
    const { ops, h, r } = run("Compact pool three.");
    expect(ops).toEqual([{ op: "compressPool", poolRef: "pool three" }]);
    expect(h.screen).not.toContain("pick");
    expect(r!.summary).toMatch(/compressed .*Pool 3/);
  });

  it("“compress Pool 3” and “compress the Pool 3 pool” name the pool", () => {
    for (const said of ["compress Pool 3", "compress pool 3", "compressed pool three"]) {
      const { h, r } = run(said);
      expect(h.screen, said).not.toContain("pick");
      expect(r!.ok, `${said}: ${r!.summary}`).toBe(true);
    }
  });

  it("“Move pool three top boundary down” moves Pool 3's edge (it had no picker at all)", () => {
    const { r } = run("Move pool three top boundary down");
    expect(r!.ok, r!.summary).toBe(true);
    expect(r!.summary).toContain("Pool 3");
  });

  it("“add a lane to 3” can only mean a pool", () => {
    const ops = parseCommand("add a lane to 3");
    expect(ops?.[0]?.op).toBe("addLanes");
    const { h, r } = run("add a lane to 3");
    expect(h.screen).not.toContain("pick");
    expect(r!.summary).toContain("Pool 3");
  });

  it("a lane named where a pool must be is told so — never “isn't a pool”", () => {
    const { r } = run("compress lane three");
    expect(r!.ok).toBe(false);
    expect(r!.summary).toMatch(/Lane 3.*is a lane/);
    expect(r!.summary).not.toMatch(/isn't a pool/);
  });

  it("with no kind word, a name shared by a pool and a lane asks — the user did not say which", () => {
    const { h } = run("compress three");
    expect(h.screen).toContain("pick");
  });

  it("the field's kind bounds the lookup, the whole-name pass included", () => {
    const els = [...world(), E({ id: "t9", type: "task", label: "Customer", x: 0, y: 0, width: 10, height: 10, properties: {} })];
    expect(resolveRef("Customer", els, null, [], { kind: "pool" })).toBeNull();
    expect(resolveRef("three", world(), null, [], { kind: "pool" })).toEqual({ id: "p3" });
    expect(refKind("movePoolBoundary", "ref")).toBe("pool");
    expect(refKind("compressPool", "poolRef")).toBe("container");
    expect(refKind("delete", "ref")).toBeUndefined();
  });

  it("a near miss still only ASKS — never an edit", () => {
    const els = [...world(), E({ id: "p9", type: "pool", label: "Claims Unit", x: 0, y: 1200, width: 900, height: 200, properties: {} })];
    // One word in three in common: below the resolver's bar, above the
    // "did you mean" one — so it may be offered, and must not be done.
    const { r } = run("compress claims department team", els);
    expect(r!.summary).not.toMatch(/^compressed/);
    expect(r!.summary).toMatch(/Claims Unit/);
  });
});

describe("T4901 — what the compress rule reads, and what it leaves alone", () => {
  it("the kind word is kept and moved to the front", () => {
    expect(parseCommand("compress the Customer pool")).toEqual([{ op: "compressPool", poolRef: "pool Customer" }]);
    expect(parseCommand("shrink the Sales lane")).toEqual([{ op: "compressPool", poolRef: "lane Sales" }]);
    expect(parseCommand("compress Customer")).toEqual([{ op: "compressPool", poolRef: "Customer" }]);
    expect(parseCommand("compress the pool")).toEqual([{ op: "compressPool", poolRef: "pool" }]);
  });

  it("a trailing “line” is a name, not a lane", () => {
    expect(parseCommand("compress the Production Line")).toEqual([{ op: "compressPool", poolRef: "Production Line" }]);
  });

  it("plural kinds, the gap and the diagram are not a compress of one container", () => {
    for (const said of ["compress the lanes", "compress all pools", "reduce the gap between Review and Pay", "compact the diagram", "collapse the subprocess"]) {
      const ops = parseCommand(said);
      expect(ops?.some((o) => o.op === "compressPool") ?? false, said).toBe(false);
    }
  });

  it("“delete X and compress” compacts — it used to drop the compaction with a green tick", () => {
    expect(parseCommand("delete Assess Risk and compress")).toEqual([{ op: "delete", ref: "Assess Risk", compact: true }]);
    expect(parseCommand("remove Assess Risk and shrink")).toEqual([{ op: "delete", ref: "Assess Risk", compact: true }]);
    expect(parseCommand("delete Assess Risk and compact")).toEqual([{ op: "delete", ref: "Assess Risk", compact: true }]);
  });

  it("“Compress lane.” waits for its name; a named one runs at once", () => {
    expect(isIncompleteCommand("Compress lane.")).toBe(true);
    expect(isIncompleteCommand("Compress the pool.")).toBe(true);
    expect(isIncompleteCommand("compress pool three")).toBe(false);
  });

  it("the scorer resolves as the app does: “pool three” is one thing, and L4 passes", () => {
    const c = { id: "k#1", family: "compressPool", utterance: "Compact pool three.", ops: [{ op: "compressPool" as const, poolRef: "pool three" }], refs: {} };
    expect(scoreCase(c, undefined, world(), { diagram: diagram() }).outcome).toBe("pass");
  });
});

describe("T4902 — one compress verb list, one kind table (wiring)", () => {
  it("every reader of the compress verbs imports the one list", () => {
    expect(src("app/lib/assist/commandGrammar.ts")).not.toMatch(/compress\|collapse\|shrink/);
    expect(src("app/lib/assist/compressPhrase.ts")).toContain("COMPRESS_VERB_SOURCE");
    expect(src("app/lib/assist/commandGrammar.ts")).toContain("COMPRESS_VERB_SOURCE");
    expect(src("app/lib/assist/greedyGuards.ts")).toContain("COMPRESS_COMMAND_VERBS");
    expect(src("app/lib/assist/selectedWord.ts")).toContain("COMPRESS_COMMAND_VERBS");
    expect(src("app/lib/dictation/diagramKeyterms.ts")).toContain("...COMPRESS_VERBS");
    expect(src("app/api/ai/command/route.ts")).toContain('COMPRESS_VERBS.join("/")');
    expect(COMPRESS_VERBS).toContain("compress");
  });

  it("the app and BOTH scorers read the same kind table", () => {
    const apply = src("app/lib/assist/applyAssistOps.ts");
    for (const [op, field] of [["movePoolTo", "ref"], ["swapPools", "a"], ["addPool", "relativeTo"], ["compressPool", "poolRef"], ["movePoolBoundary", "ref"], ["addLanes", "poolRef"]]) {
      const at = apply.indexOf(`op.op === "${op}"`);
      expect(apply.slice(at, at + 1400), op).toContain(`resolveField(op, "${field}"`);
    }
    expect(src("app/lib/assist/commandScore.ts")).toMatch(/kind: refKind\(/);
    expect(src("app/lib/assist/applyScore.ts")).toMatch(/kind: refKind\(/);
  });
});
