/**
 * T5249 — Voice Assist (Paul, 2026-10-05):
 *   • "move ten pixels right" / "move selected ten pixels right" → couldn't find “ten pixels” — the distance was read as part
 *     of the NAME. An element move now takes a distance in pixels, in either order, in digits or words;
 *   • "move highlighted task … pixels left" → nothing is selected — “highlighted” also means the element under the pointer.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { pixelAmount, readPixelMove } from "@/app/lib/assist/pixelDistance";
import { resolveRef } from "@/app/lib/assist/resolveRef";
import type { DiagramElement } from "@/app/lib/diagram/types";

const move = (t: string) => parseCommand(t)?.[0] as { op: string; ref: string; direction: string; pixels?: number; count?: number } | undefined;

describe("T5249 a distance in pixels on an element move", () => {
  it.each([
    ["move 10 pixels right", "this", "right", 10],
    ["move ten pixels right", "this", "right", 10],
    ["move selected ten pixels right", "selected", "right", 10],
    ["move selected 10 pixels left", "selected", "left", 10],
    ["move the selected task ten pixels left", "the selected task", "left", 10],
    ["move highlighted ten pixels left", "highlighted", "left", 10],
    ["move this twenty five pixels down", "this", "down", 25],
    ["move selected right ten pixels", "selected", "right", 10],
    ["move selected right by fifty pixels", "selected", "right", 50],
    ["move it a hundred pixels up", "it", "up", 100],
  ])("“%s” → move %s %s %d px", (said, ref, dir, px) => {
    const op = move(said)!;
    expect(op.op).toBe("move");
    expect(op.ref).toBe(ref);
    expect(op.direction).toBe(dir);
    expect(op.pixels).toBe(px);
  });
  it("the recogniser's “Send pixels” (it heard “ten”) is read as ten — only here, right before “pixels”", () => {
    expect(move("move highlighted task Send pixels left")).toMatchObject({ ref: "highlighted task", direction: "left", pixels: 10 });
    expect(pixelAmount("send")).toBe(10);
    expect(readPixelMove("move send Reply left")).toBeNull();           // “send” is a name everywhere else
  });
  it("what it must not touch: steps, pools, lanes, contents, and a name that is not a number", () => {
    expect(move("move Check Claim two steps right")?.pixels).toBeUndefined();
    expect(move("move Check Claim right")?.pixels).toBeUndefined();
    expect(readPixelMove("move the pool right 100 pixels")).not.toBeNull();       // read here …
    expect(move("move the pool right 100 pixels")?.pixels).toBeUndefined();   // … but a pool is left to its own rules, as before
    expect(move("move everything in Lane 2 50 pixels to the left")?.op).toBe("moveContents");
  });
  it("the amounts", () => {
    for (const [t, n] of [["10", 10], ["ten", 10], ["twenty", 20], ["twenty-five", 25], ["ninety nine", 99], ["a hundred", 100], ["one hundred and fifty", 150], ["zero", 0]] as const) expect(pixelAmount(t)).toBe(n);
    expect(pixelAmount("banana")).toBeNull();
  });
  it("the apply layer moves exactly that far (selection and single element)", () => {
    const src = readFileSync("app/lib/assist/applyAssistOps.ts", "utf8");
    expect(src).toContain("const step = op.pixels ?? 100 * (op.count ?? 1);");
    expect(src).toContain("if (op.pixels !== undefined) {");
  });
});

describe("T5249 “highlighted” also means the element under the pointer", () => {
  const els = [
    { id: "t1", type: "task", x: 100, y: 100, width: 100, height: 60, label: "Send Reply", properties: {} },
    { id: "g1", type: "gateway", x: 400, y: 100, width: 40, height: 40, label: "", properties: {} },
  ] as DiagramElement[];
  const over = (x: number, y: number) => ({ pointer: { x, y } });
  it("with nothing selected, “highlighted task” is the task under the pointer", () => {
    expect(resolveRef("highlighted task", els, null, [], over(150, 130))).toEqual({ id: "t1" });
    expect(resolveRef("highlighted", els, null, [], over(150, 130))).toEqual({ id: "t1" });
  });
  it("…of the kind named: a gateway under the pointer is not “the highlighted task”", () => {
    expect(resolveRef("highlighted task", els, null, [], over(420, 120))).toBeNull();
  });
  it("a selection still wins over the pointer", () => {
    expect(resolveRef("highlighted task", els, null, ["t1"], over(420, 120))).toEqual({ id: "t1" });
  });
});

describe("T5251 the recogniser's “Subject” and “Enter” (Paul, 2026-10-05: “selected keeps being heard as Subject”)", () => {
  it("“move Subject twenty pixels right” is “move selected …”", () => {
    expect(move("move Subject twenty pixels right")).toMatchObject({ op: "move", ref: "selected", direction: "right", pixels: 20 });
    expect(move("move subject 10 pixels left")).toMatchObject({ ref: "selected", pixels: 10 });
    expect(move("move Subject right")).toMatchObject({ ref: "selected", direction: "right" });
  });
  it("“Enter” is ten, right before “pixels”", () => {
    expect(move("move selected Enter pixels right")).toMatchObject({ ref: "selected", direction: "right", pixels: 10 });
  });
  it("a real name that starts with “Subject” keeps its word", () => {
    expect(move("move Subject Matter Expert right")).toMatchObject({ ref: "Subject Matter Expert", direction: "right" });
    expect(move("move Subject Matter Expert twenty pixels right")).toMatchObject({ ref: "Subject Matter Expert", pixels: 20 });
  });
});
