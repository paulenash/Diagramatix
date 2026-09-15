/**
 * The "Commands" reminder card must not lie: every example phrase it shows is
 * one the deterministic grammar accepts today. A card that lists a phrase the
 * parser has stopped taking sends the user to the AI fallback (or to a failure)
 * for something the card promised was instant.
 */
import { describe, it, expect } from "vitest";
import { COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { parseCommand } from "@/app/lib/assist/commandGrammar";

describe("the Commands reminder card", () => {
  it("T4395 — every non-voice example in the catalogue parses deterministically", () => {
    const failures: string[] = [];
    let checked = 0;
    for (const fam of COMMAND_CATALOG) {
      for (const item of fam.items) {
        expect(item.say.length, `${fam.family} / ${item.does} has examples`).toBeGreaterThan(0);
        if (item.voice) continue;
        for (const phrase of item.say) {
          checked++;
          if (parseCommand(phrase) === null) failures.push(`${fam.family}: "${phrase}"`);
        }
      }
    }
    expect(checked).toBeGreaterThan(30);
    expect(failures, "examples the grammar no longer accepts").toEqual([]);
  });

  it("T4396 — the voice words are mic controls, not commands", () => {
    // "stop" and "yes"/"no" are handled before the parser (stop words, the
    // confirmation flow). If the grammar ever started parsing them as commands
    // the card's Voice family would be wrong in the other direction.
    const voice = COMMAND_CATALOG.find((f) => f.family === "Voice")!;
    for (const item of voice.items) for (const phrase of item.say) expect(parseCommand(phrase), phrase).toBeNull();
  });
});
