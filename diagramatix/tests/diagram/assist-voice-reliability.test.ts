/**
 * T4574-T4577 — V1 and V2, the two halves of voice reliability.
 *
 * V1 biases the RECOGNISER toward the names on this diagram, so fewer words
 * come back wrong. V2 repairs what still does, in the PARSER, so a mis-hear
 * resolves without an AI call. Paul asked for both together and said why:
 * "every keyword boost creates a mis-hear somewhere else, so this needs care
 * at both the recogniser and the parser."
 *
 * Neither has to be perfect, which is the point of having both.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  diagramKeyterms, MAX_DIAGRAM_KEYTERMS, MIN_SOLO_WORD, MAX_KEYTERM_WORDS,
} from "@/app/lib/dictation/diagramKeyterms";
import { phoneticKey, soundsLike, MIN_KEY_FOR_FUZZ } from "@/app/lib/assist/phonetic";
import { resolveRef } from "@/app/lib/assist/resolveRef";
import type { DiagramElement } from "@/app/lib/diagram/types";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const el = (id: string, label: string): DiagramElement =>
  ({ id, type: "task", label, x: 0, y: 0, width: 100, height: 60, properties: {} }) as unknown as DiagramElement;

describe("T4574 — V1 sends this diagram's names, timidly", () => {
  it("sends a multi-word name, which is the safe case", () => {
    expect(diagramKeyterms(["Pick Items", "Back Order"])).toEqual(["Pick Items", "Back Order"]);
  });

  it("will not send a bare common word", () => {
    // "Order", "Check", "Review" are ordinary English. Biasing them costs more
    // than it buys — the whole "Turn"/"Ten" lesson.
    expect(diagramKeyterms(["Order"])).toEqual([]);
    expect(diagramKeyterms(["Check"])).toEqual([]);
    expect(MIN_SOLO_WORD).toBeGreaterThanOrEqual(5);
  });

  it("sends a single word only when it is long and distinctive", () => {
    expect(diagramKeyterms(["Warehouse"])).toEqual(["Warehouse"]);
    expect(diagramKeyterms(["Reconciliation"])).toEqual(["Reconciliation"]);
  });

  it("will not send anything the command vocabulary already owns", () => {
    // Those terms are boosted. A second, competing appearance is the `lane:3`
    // mistake in a new costume.
    for (const l of ["Delete Order", "Sales Lane", "Start Event", "Task Force", "Pool Party"]) {
      expect(diagramKeyterms([l]), l).toEqual([]);
    }
  });

  it("will not send a number, by word or digit", () => {
    // "Milestone 3" has no command word in it, so the DIGIT rule is what
    // rejects it — "Lane 2" would be caught by the command-word rule anyway.
    expect(diagramKeyterms(["Milestone 3"])).toEqual([]);
    expect(diagramKeyterms(["Lane 2", "One Review"])).toEqual([]);
  });

  it("drops a label that is really a sentence", () => {
    // Deliberately free of command words, so it is the LENGTH rule being
    // tested and not one of the others rejecting it first.
    const long = "reconcile outstanding customer correspondence before dispatch";
    expect(long.split(" ").length).toBeGreaterThan(MAX_KEYTERM_WORDS);
    expect(diagramKeyterms([long])).toEqual([]);
    expect(MAX_KEYTERM_WORDS).toBeLessThanOrEqual(5);
  });

  it("de-duplicates, ignoring case", () => {
    expect(diagramKeyterms(["Pick Items", "pick items", "PICK ITEMS"])).toEqual(["Pick Items"]);
  });

  it("copes with empty, missing and rich-text labels", () => {
    expect(diagramKeyterms([null, undefined, "", "   "])).toEqual([]);
    expect(diagramKeyterms(["<b>Pick Items</b>"])).toEqual(["Pick Items"]);
  });

  it("caps the list, most distinctive first", () => {
    // MIXED word counts — with all labels the same length the ordering
    // assertion below would be vacuously true.
    const many = [
      ...Array.from({ length: 80 }, (_, i) => `Singleword${String.fromCharCode(97 + (i % 26))}${i}`),
      ...Array.from({ length: 80 }, (_, i) => `Distinctive Phrase ${String.fromCharCode(65 + (i % 26))}${i}`),
    ];
    const out = diagramKeyterms(many);
    expect(out.length).toBeLessThanOrEqual(MAX_DIAGRAM_KEYTERMS);
    expect(new Set(out.map((s) => s.split(" ").length)).size, "a mix reached the sort").toBeGreaterThan(0);
    // Longer phrases first, so the cap trims the least useful tail.
    const words = out.map((s) => s.split(" ").length);
    expect([...words].sort((a, b) => b - a)).toEqual(words);
    expect(words[0], "and a phrase leads").toBeGreaterThan(1);
  });

  it("NEVER attaches a boost suffix", () => {
    // Rule 1, and the reason this whole module is cautious. A `:n` makes the
    // recogniser REACH for the term, which is how "turn on gold flashing"
    // became "ten on gold flashing".
    for (const term of diagramKeyterms(["Pick Items", "Warehouse", "Quality Assurance"])) {
      expect(term, term).not.toMatch(/:\d+$/);
    }
  });

  it("is sent AFTER the command words, and capped again at the wire", () => {
    const src = read("app", "lib", "dictation", "index.ts");
    const commands = src.indexOf('params.append("keywords", kw)');
    const terms = src.indexOf("cb.keyterms ?? []");
    expect(commands).toBeGreaterThan(-1);
    expect(terms, "diagram names come after the command vocabulary").toBeGreaterThan(commands);
    expect(src, "a careless caller cannot drown the command words")
      .toContain("slice(0, MAX_DIAGRAM_KEYTERMS)");
  });

  it("is computed when the mic OPENS, from the live diagram", () => {
    // Deepgram fixes its keyword list when the socket opens, which is also why
    // the number-word elevation cannot live there.
    const editor = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    expect(editor).toContain("keyterms: diagramKeyterms(elementsRef.current.map((e) => e.label))");
  });
});

describe("T4575 — V2 hears what the recogniser got wrong", () => {
  const els = [
    el("a", "Pick Items"), el("b", "Back Order"), el("c", "Warehouse"),
    el("d", "Escalate"), el("e", "Approve"), el("f", "Archive"), el("g", "Ship Order"),
  ];
  const got = (spoken: string) => {
    const r = resolveRef(spoken, els, null, []);
    if (!r) return null;
    if ("ambiguous" in r) return `AMBIG:${r.ambiguous.length}`;
    return els.find((e) => e.id === r.id)?.label ?? null;
  };

  it("resolves a single mis-heard word", () => {
    // Nothing for token overlap to work with — one word, one sound wrong.
    expect(got("escalade")).toBe("Escalate");
    expect(got("aprove")).toBe("Approve");
    expect(got("arkive")).toBe("Archive");
  });

  it("resolves a word the recogniser split in two", () => {
    expect(got("where house")).toBe("Warehouse");
  });

  it("still resolves what already worked, unchanged", () => {
    expect(got("pic items")).toBe("Pick Items");
    expect(got("back order")).toBe("Back Order");
    expect(got("Warehouse")).toBe("Warehouse");
  });

  it("does NOT match two short names that merely rhyme", () => {
    // The fuzz is the risky part, so a short key must match exactly or "Add"
    // would answer to "Odd".
    expect(got("odd")).toBeNull();
    expect(got("add")).toBeNull();
    expect(MIN_KEY_FOR_FUZZ).toBeGreaterThanOrEqual(4);
  });

  it("asks rather than guessing when several sound alike", () => {
    const two = [el("x", "Escalate"), el("y", "Escalade")];
    const r = resolveRef("eskalayt", two, null, []);
    expect(r).not.toBeNull();
    expect("ambiguous" in r!, "sounding similar is exactly when to ask").toBe(true);
  });
});

describe("T4576 — the phonetic key itself", () => {
  it("collapses the spellings English uses for one sound", () => {
    expect(phoneticKey("phone")).toBe(phoneticKey("fone"));
    expect(phoneticKey("pick")).toBe(phoneticKey("pik"));
    expect(phoneticKey("quay")).toBe(phoneticKey("kway"));
  });

  it("treats a silent h after w as silent", () => {
    expect(phoneticKey("where")).toBe(phoneticKey("ware"));
  });

  it("does not turn 'ch' into 'ks'", () => {
    // ch → x → ks would have made "church" into something like "kirks". The
    // intermediate symbol is a digit precisely so the letter rules miss it.
    expect(phoneticKey("church")).not.toContain("ks");
  });

  it("keeps a leading vowel, which is the reliably heard part", () => {
    expect(phoneticKey("order")).toMatch(/^o/);
    expect(phoneticKey("escalate")).toMatch(/^e/);
  });

  it("is empty for input with no letters", () => {
    expect(phoneticKey("")).toBe("");
    expect(phoneticKey("123 !!")).toBe("");
    expect(soundsLike("", "Anything")).toBe(false);
  });

  it("is space-insensitive when compared", () => {
    expect(soundsLike("where house", "Warehouse")).toBe(true);
    expect(soundsLike("Warehouse", "where house")).toBe(true);
  });
});

describe("T4577 — a tie is asked about, not guessed", () => {
  const els = [el("b", "Back Order"), el("g", "Ship Order")];

  it("lets the SOUND settle a token-overlap tie", () => {
    // "shop order" scores 0.5 against both. It used to take whichever came
    // first in the document — a guess wearing a green tick.
    const r = resolveRef("shop order", els, null, []);
    expect(r).toEqual({ id: "g" });
  });

  it("reports the ambiguity when SEVERAL tied labels sound alike", () => {
    // The sound can only settle a tie when it picks exactly one. Two
    // sound-alikes is the same question in a different form, so it asks.
    const pair = [el("s1", "Ship Order"), el("s2", "Shop Order")];
    const r = resolveRef("shep order", pair, null, []);
    expect(r).not.toBeNull();
    expect("ambiguous" in r!, "two sound-alikes is still a question").toBe(true);
  });

  it("reports the ambiguity when the sound cannot settle it either", () => {
    const three = [el("b", "Back Order"), el("g", "Ship Order"), el("r", "Receive Order")];
    const r = resolveRef("order", three, null, []);
    expect(r).not.toBeNull();
    expect("ambiguous" in r!).toBe(true);
    expect((r as { ambiguous: string[] }).ambiguous.length).toBe(3);
  });

  it("still answers plainly when one label simply wins", () => {
    const r = resolveRef("back order", els, null, []);
    expect(r).toEqual({ id: "b" });
  });
});
