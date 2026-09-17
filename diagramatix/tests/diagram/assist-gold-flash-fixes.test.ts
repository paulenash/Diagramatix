/**
 * Why gold flashing appeared not to work (Paul, 2026-09-18).
 *
 * It reported it as broken outright, then narrowed it twice — "does not work
 * while in Rename tasks etc.", and then "works with Nudge selected right". That
 * second observation is what settled it: the animation itself was fine all
 * along, and the faults were all in what did or did not reach it.
 *
 *  1. The guided rename flow writes labels through its own path and never calls
 *     applyAssistOps, so nothing ever armed the flash there.
 *  2. Even armed, a rename was invisible to the before/after diff, because the
 *     snapshot carried geometry and parentage but not the label — so nothing
 *     looked different and no targets came out.
 *  3. While a numbered pick is open every utterance feeds the pick, so "turn on
 *     gold flashing" was taken as the new name for the item you had picked.
 *  4. Renames were excluded from the flashing set on purpose; Paul overruled it.
 *
 * One real defect in the drawing survived: the sparks used `transform: scale()`
 * on a `<circle>`, and on an SVG element a CSS transform takes its origin from
 * the SVG user space rather than the shape, so each spark was pulled toward the
 * top-left of the diagram instead of shrinking where it was. Only the rings were
 * being seen, which is why it still read as "working".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { flashTargets, opFlashes, type FlashBox } from "@/app/lib/assist/goldFlash";
import { repairTurnWord, TURN_MISHEARD_WORDS } from "@/app/lib/assist/selectedWord";
import { parseCommand } from "@/app/lib/assist/commandGrammar";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const OVERLAY = read("app", "components", "canvas", "GoldFlashOverlay.tsx");
const EDITOR = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");

const box = (id: string, over: Partial<FlashBox> = {}): FlashBox =>
  ({ id, x: 100, y: 100, width: 102, height: 65, label: id, ...over });

describe("T4490 — the sparks leave the item rather than the diagram's corner", () => {
  it("never scales an SVG shape from CSS", () => {
    // On an SVG element a CSS transform takes its origin from the SVG user
    // space, not the shape, so `scale()` drags the spark toward the top-left
    // of the whole diagram. Translation has no such dependency.
    const keyframes = OVERLAY
      .slice(OVERLAY.indexOf("@keyframes"), OVERLAY.indexOf("</style>"))
      .replace(/\/\*[\s\S]*?\*\//g, " "); // the comment explaining this says "scale()" too
    expect(keyframes).not.toContain("scale(");
    expect(keyframes, "the sparks still travel").toContain("translate(var(--dx), var(--dy))");
  });

  it("still cannot swallow a click", () => {
    expect(OVERLAY).toContain('pointerEvents: "none"');
  });

  it("can be watched from the console when it misbehaves again", () => {
    // "Nothing happened" is otherwise indistinguishable from "never armed",
    // which is what cost a round trip here.
    expect(OVERLAY).toContain("__DIAG_GOLD_FLASH");
  });
});

describe("T4491 — a rename flashes, from either path", () => {
  it("counts a rename as worth pointing at", () => {
    expect(opFlashes("rename")).toBe(true);
    expect(opFlashes("labelSelected")).toBe(true);
  });

  it("sees a rename in the diff, which needs the label to be carried", () => {
    const before = [box("A", { label: "Check Stock" })];
    const after = [box("A", { label: "Approve Order" })];
    expect(flashTargets(before, after).map((t) => t.id)).toEqual(["A"]);
  });

  it("does not flash an item whose label was left alone", () => {
    const same = [box("A", { label: "Check Stock" }), box("B", { label: "Pick" })];
    expect(flashTargets(same, same)).toEqual([]);
  });

  it("treats a label appearing on an unnamed item as a change", () => {
    const before = [box("A", { label: "" })];
    const after = [box("A", { label: "Approve" })];
    expect(flashTargets(before, after).map((t) => t.id)).toEqual(["A"]);
  });

  it("arms from the guided rename flow, which never touches the op batch", () => {
    // One helper, two callers, so the two paths cannot drift apart.
    expect(EDITOR).toContain("const armGoldFlash = useCallback(");
    expect(EDITOR).toContain("if (batchFlashes(ops)) armGoldFlash(data.elements);");
    const guided = EDITOR.indexOf("cancelRenameFlow(\"rename cancelled (empty name)\")");
    const armed = EDITOR.indexOf("armGoldFlash(data.elements)", guided);
    expect(guided, "the guided rename flow is still there").toBeGreaterThan(-1);
    expect(armed, "and it arms the flash").toBeGreaterThan(guided);
  });

  it("carries the label into the after-snapshot too", () => {
    // Half a fix is no fix: the before and the after both have to have it.
    const effect = EDITOR.slice(EDITOR.indexOf("const snapshot = goldFlashBeforeRef.current"));
    expect(effect.slice(0, 600)).toContain("label: e.label");
  });
});

describe("T4492 — the toggle works while a numbered pick is open", () => {
  it("is let through the flow that swallows everything else", () => {
    // Every other utterance during a pick is a number, a name, or "done". This
    // one edits nothing, so it cannot disturb the pick — and a pick is exactly
    // where you notice you wanted flashing on.
    expect(EDITOR).toContain('toggle[0].op === "goldFlash"');
    const exception = EDITOR.indexOf('toggle[0].op === "goldFlash"');
    const flowRoute = EDITOR.indexOf("if (renameFlowRef.current) { handleRenameUtteranceRef.current(heard); return; }");
    expect(exception, "the exception must be checked BEFORE the flow swallows it").toBeLessThan(flowRoute);
  });
});

describe("T4493 — 'turn' is not lost to 'ten'", () => {
  it("repairs the mishearing at the start of a command", () => {
    expect(repairTurnWord("ten on gold flashing").text).toBe("turn on gold flashing");
    expect(repairTurnWord("ten off flashing gold").text).toBe("turn off flashing gold");
    for (const w of TURN_MISHEARD_WORDS) {
      expect(repairTurnWord(`${w} on gold flashing`).corrected, w).toBe(true);
    }
  });

  it("parses the whole command after the repair", () => {
    expect(parseCommand("ten on gold flashing")).toEqual([{ op: "goldFlash", on: true }]);
    expect(parseCommand("Ten off flashing gold")).toEqual([{ op: "goldFlash", on: false }]);
  });

  it("leaves a real ten alone", () => {
    // A numbered pick is a bare number with nothing after it, and "ten tasks"
    // is a count. Only "ten on" / "ten off" is repaired, a shape no sentence
    // with a real ten has.
    for (const said of ["ten", "ten Approve Order", "ten tasks", "rename ten to Approve", "add ten lanes"]) {
      expect(repairTurnWord(said), said).toEqual({ text: said, corrected: false });
    }
  });

  it("keeps sentence capitalisation", () => {
    expect(repairTurnWord("Ten on gold flashing").text).toBe("Turn on gold flashing");
  });

  it("does not boost number words at the recogniser any more", () => {
    // That boost is what made the recogniser reach for "ten" in the first place.
    // Numbers are wanted only while badges are on screen, and the keyword list
    // is fixed when the socket opens — so the elevation lives in the pick
    // handler, which is only consulted during a pick.
    const dictation = read("app", "lib", "dictation", "index.ts");
    for (const n of ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]) {
      expect(dictation, `${n} must not be boosted globally`).not.toMatch(new RegExp(`"${n}:\\d"`));
    }
  });
});
