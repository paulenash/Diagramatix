/**
 * Gold flashing (Paul, 2026-09-17).
 *
 * With it on, finishing an Abracadabra command outlines the items it touched in
 * gold, three times, with gold sparks coming off them. A spoken command can
 * change something off to the side of where you are looking; the command log
 * says what happened in words, this says where.
 *
 * Paul named four kinds of command to flash: added, enclosed, moved and nudged.
 * Deletes have nothing left to outline, and a rename has just had you read a
 * number off that very item.
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { validateOps } from "@/app/lib/assist/ops";
import {
  opFlashes,
  batchFlashes,
  isGoldFlashOn,
  setGoldFlash,
  goldFlashSummary,
  sparksFor,
  GOLD_FLASH_KEY,
  GOLD_FLASH_PULSES,
  GOLD_FLASH_SPARKS,
  GOLD_FLASH_TOTAL_MS,
} from "@/app/lib/assist/goldFlash";

/** A localStorage stand-in, since these tests run in node. */
const fakeStore = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    raw: map,
  };
};

describe("T4482 — the command is heard in either word order", () => {
  it("turns it on", () => {
    for (const said of [
      "turn on flashing gold",
      "turn on gold flashing",
      "Turn On Gold Flashing",
      "turn on the gold flashing",
      "turn on golden flash",
      "gold flashing on",
      "flashing gold on",
    ]) {
      expect(parseCommand(said), said).toEqual([{ op: "goldFlash", on: true }]);
    }
  });

  it("turns it off", () => {
    for (const said of [
      "turn off gold flashing",
      "turn off flashing gold",
      "Turn off Flashing Gold.",
      "gold flashing off",
      "flashing gold off",
    ]) {
      expect(parseCommand(said), said).toEqual([{ op: "goldFlash", on: false }]);
    }
  });

  it("does not swallow neighbouring commands", () => {
    // "turn" and "gold" are ordinary words; the rule must not be greedy.
    expect(parseCommand("turn on the lights")).not.toEqual([{ op: "goldFlash", on: true }]);
    expect(parseCommand("rename Gold Standard to Silver")).toEqual([
      { op: "rename", ref: "Gold Standard", label: "Silver" },
    ]);
  });

  it("survives the round trip through validation", () => {
    expect(validateOps([{ op: "goldFlash", on: true }])).toEqual([{ op: "goldFlash", on: true }]);
    expect(validateOps([{ op: "goldFlash", on: false }])).toEqual([{ op: "goldFlash", on: false }]);
    // An AI that returns it without the flag is not guessing on the user's behalf.
    expect(validateOps([{ op: "goldFlash" }])).toEqual([]);
    expect(validateOps([{ op: "goldFlash", on: "yes" }])).toEqual([]);
  });
});

describe("T4483 — only the commands worth pointing at flash", () => {
  it("flashes what was added", () => {
    for (const op of ["add", "addBoundary", "addPool", "addLanes", "addLaneAt", "addSublanes", "addMessage"] as const) {
      expect(opFlashes(op), op).toBe(true);
    }
  });

  it("flashes what was enclosed", () => {
    for (const op of ["wrapInPool", "wrapInSubprocess", "wrapInContainer"] as const) {
      expect(opFlashes(op), op).toBe(true);
    }
  });

  it("flashes what was moved or nudged", () => {
    for (const op of ["move", "nudgePool", "moveLane", "swapLanes"] as const) {
      expect(opFlashes(op), op).toBe(true);
    }
  });

  it("flashes a rename", () => {
    // Left out at first, on the reasoning that the guided flow has just had you
    // read a number off that item. Paul overruled it (2026-09-18) and he is
    // right: the badges renumber as soon as you finish, which pulls your eye
    // away from the thing that actually changed.
    for (const op of ["rename", "labelSelected"] as const) {
      expect(opFlashes(op), op).toBe(true);
    }
  });

  it("does not flash a delete, an undo, or the toggle itself", () => {
    // Nothing left to outline; too varied to point at honestly; and the toggle
    // is not an edit at all.
    for (const op of ["delete", "undo", "clear", "export", "goldFlash"] as const) {
      expect(opFlashes(op), op).toBe(false);
    }
  });

  it("flashes a batch when any op in it qualifies", () => {
    expect(batchFlashes([{ op: "undo" }])).toBe(false);
    expect(batchFlashes([{ op: "undo" }, { op: "move", ref: "x", direction: "left" }])).toBe(true);
    expect(batchFlashes([])).toBe(false);
  });
});

describe("T4484 — the toggle is remembered, and ON is the default", () => {
  it("is on until it is explicitly turned off", () => {
    // It shipped off-by-default and Paul changed it the same day (2026-09-18):
    // nobody turns on a thing they have not seen, and seeing what a spoken
    // command just did is the point of using the voice at all.
    const s = fakeStore();
    expect(isGoldFlashOn(s), "an untouched browser gets the flash").toBe(true);
    setGoldFlash(false, s);
    expect(isGoldFlashOn(s)).toBe(false);
    setGoldFlash(true, s);
    expect(isGoldFlashOn(s)).toBe(true);
  });

  it("remembers an explicit off across closing and reopening the bar", () => {
    // Default, not forced: turning it off has to stick, or the command is a lie.
    const s = fakeStore();
    setGoldFlash(false, s);
    expect(isGoldFlashOn(s)).toBe(false);
    expect(isGoldFlashOn(s)).toBe(false);
  });

  it("stores something a human can read in devtools", () => {
    const s = fakeStore();
    setGoldFlash(true, s);
    expect(s.raw.get(GOLD_FLASH_KEY)).toBe("true");
  });

  it("survives storage that throws, and falls back to the default", () => {
    // A private window, or a browser set to block site data. The effect is a
    // nicety; it must never be the reason an editor fails to load. Someone with
    // no stored preference should get what everyone with no preference gets.
    const hostile = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(isGoldFlashOn(hostile)).toBe(true);
    expect(() => setGoldFlash(true, hostile)).not.toThrow();
  });

  it("says which way it went", () => {
    expect(goldFlashSummary(true)).toContain("on");
    expect(goldFlashSummary(false)).toContain("off");
    expect(goldFlashSummary(true)).not.toBe(goldFlashSummary(false));
  });
});

describe("T4485 — the sparks are deterministic per item", () => {
  it("gives the same item the same sparks every time", () => {
    expect(sparksFor("task-1")).toEqual(sparksFor("task-1"));
  });

  it("gives two items different sparks, so a row does not look mechanical", () => {
    expect(sparksFor("task-1")).not.toEqual(sparksFor("task-2"));
  });

  it("throws the asked-for number, all the way round", () => {
    const sparks = sparksFor("task-1");
    expect(sparks).toHaveLength(GOLD_FLASH_SPARKS);
    expect(sparksFor("task-1", 4)).toHaveLength(4);
    const angles = sparks.map((s) => s.angle).sort((a, b) => a - b);
    // Spread rather than bunched: the widest gap is less than half the circle.
    const gaps = angles.slice(1).map((a, i) => a - angles[i]);
    expect(Math.max(...gaps)).toBeLessThan(Math.PI);
  });

  it("keeps every spark inside sane bounds", () => {
    for (const id of ["a", "task-1", "ep-long-identifier-0123456789", "☺"]) {
      for (const s of sparksFor(id)) {
        expect(Number.isFinite(s.angle)).toBe(true);
        expect(s.reach).toBeGreaterThan(0);
        expect(s.reach).toBeLessThanOrEqual(1.2);
        expect(s.delay).toBeGreaterThanOrEqual(0);
        expect(s.delay).toBeLessThan(1);
      }
    }
  });

  it("flashes three times, and says how long that takes", () => {
    expect(GOLD_FLASH_PULSES).toBe(3);
    expect(GOLD_FLASH_TOTAL_MS).toBeGreaterThan(0);
    expect(GOLD_FLASH_TOTAL_MS).toBeLessThan(3000);
  });
});
