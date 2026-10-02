/**
 * T5209 — the help tile's "What happens on the diagram" column (Paul, 2026-10-02) is derived from the
 * Commands card, so it cannot disagree with it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMMAND_CATALOG, SUPERADMIN_COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { shortDoes, summariesByFirstWord, synonymGroups } from "@/app/lib/assist/commandTree/summaries";
import { defaultCommandTree, DEFAULT_PATTERNS, DEFAULT_LISTS } from "@/app/lib/assist/commandTree";

const map = summariesByFirstWord([...COMMAND_CATALOG, ...SUPERADMIN_COMMAND_CATALOG], DEFAULT_PATTERNS, DEFAULT_LISTS);

describe("T5209 shortDoes", () => {
  it("keeps the first clause: before ' — ', before the first full stop, capped", () => {
    expect(shortDoes("Add an element — after another it goes into that one's outgoing flow")).toBe("Add an element");
    expect(shortDoes("Rename. Then more detail follows here")).toBe("Rename");
    expect(shortDoes("x".repeat(200)).length).toBeLessThanOrEqual(90);
    expect(shortDoes("")).toBe("");
  });
});

describe("T5209 summariesByFirstWord", () => {
  it("every verb the card shows has a summary under its first word", () => {
    for (const w of ["add", "rename", "connect", "delete", "move"]) expect(map.get(w)?.length, w).toBeGreaterThan(0);
  });
  it("'add' carries the new add-inside-an-expanded-subprocess line", () => {
    expect(map.get("add")!.some((t) => t.startsWith("Add inside an expanded subprocess"))).toBe(true);
  });
  it("mic words (stop / yes) are not diagram commands and are left out", () => {
    for (const w of ["stop", "yes"]) expect(map.get(w) ?? []).toEqual([]);
  });
  it("every first word in the tree has a summary except the mic word 'no' — a gap is a card line to write", () => {
    const first = defaultCommandTree().summary({ ghost: false }).map((r) => r.word.toLowerCase());
    const missing = first.filter((w) => !map.has(w));
    expect(missing, `no summary for: ${missing.join(", ")}`).toEqual(missing.filter((w) => w === "no"));
  });
});

describe("T5209 synonyms borrow", () => {
  it("the heads of the patterns are read as groups", () => {
    const g = synonymGroups(["(rename|relabel) [the] <x>", "(add|insert) a thing", "plain line"].join("\n"));
    expect(g).toEqual([["rename", "relabel"], ["add", "insert"]]);
  });
  it("'relabel' (no card example of its own) takes 'rename''s summary", () => {
    expect(map.get("relabel")!.length).toBeGreaterThan(0);
    for (const t of map.get("rename")!) expect(map.get("relabel")).toContain(t);
  });
});

describe("T5209 the tile shows the column", () => {
  it("section 5 has the header, and reads the summaries from the card and the patterns", () => {
    const tile = readFileSync("app/(dashboard)/dashboard/admin/voice-assist-help/VoiceAssistHelpClient.tsx", "utf8");
    expect(tile).toContain("What happens on the diagram");
    expect(tile).toContain("summariesByFirstWord([...COMMAND_CATALOG, ...SUPERADMIN_COMMAND_CATALOG], patterns, lists)");
  });
});
