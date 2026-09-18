/**
 * The rest of the gold-flashing request (Paul, 2026-09-17):
 *
 *  3. the two commands must NOT appear on the card users read, but MUST appear
 *     in the SuperAdmin Voice Assist tile;
 *  4. Voice Assist becomes available to Expert subscriptions and above.
 *
 * Until now the card and the tile rendered ONE array, and a test enforced that
 * sharing. There are two arrays now, and the tile renders both.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMAND_CATALOG, SUPERADMIN_COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { flashTargets, GOLD_FLASH_MAX_TARGETS, type FlashBox } from "@/app/lib/assist/goldFlash";
import { atLeastTier, tierRank, TIER_ORDER } from "@/app/lib/features/tierRank";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const phrases = (cat: typeof COMMAND_CATALOG) => cat.flatMap((f) => f.items.flatMap((i) => i.say));

describe("T4486 — gold flashing is off the user's card and on the SuperAdmin tile", () => {
  it("is not on the card behind the Commands button", () => {
    const said = phrases(COMMAND_CATALOG).join(" | ").toLowerCase();
    expect(said).not.toContain("gold flash");
    expect(said).not.toContain("flashing gold");
  });

  it("is on the SuperAdmin list, in both word orders", () => {
    const said = phrases(SUPERADMIN_COMMAND_CATALOG).map((s) => s.toLowerCase());
    expect(said).toContain("turn on gold flashing");
    expect(said).toContain("turn on flashing gold");
    expect(said).toContain("turn off gold flashing");
    expect(said).toContain("turn off flashing gold");
  });

  it("holds the hidden list to the same parse guarantee as the visible one", () => {
    // A list nobody can see is exactly where a phrase that no longer works
    // survives unnoticed.
    for (const p of phrases(SUPERADMIN_COMMAND_CATALOG)) {
      expect(parseCommand(p), `"${p}" no longer parses`).not.toBeNull();
    }
  });

  it("keeps the two lists disjoint", () => {
    const visible = new Set(phrases(COMMAND_CATALOG));
    for (const p of phrases(SUPERADMIN_COMMAND_CATALOG)) expect(visible.has(p)).toBe(false);
  });

  it("renders the hidden list in the tile and NOT in the bar", () => {
    const tile = read("app", "(dashboard)", "dashboard", "admin", "voice-assist-commands", "VoiceAssistCommandsClient.tsx");
    const bar = read("app", "components", "canvas", "VoiceAssistBar.tsx");
    // The RENDER, not the import: a tile that imports the hidden list and never
    // draws it satisfies a substring check while showing the user nothing.
    expect(tile).toContain("SUPERADMIN_COMMAND_CATALOG.map(");
    expect(tile, "the tile still shows the ordinary commands too").toContain("COMMAND_CATALOG.map(");
    expect(bar, "the bar must never show the hidden list").not.toContain("SUPERADMIN_COMMAND_CATALOG");
  });
});

describe("T4487 — what the flash outlines", () => {
  const box = (id: string, x: number, y: number, parentId?: string): FlashBox =>
    ({ id, x, y, width: 100, height: 60, ...(parentId ? { parentId } : {}) });

  it("outlines what appeared", () => {
    const before = [box("a", 0, 0)];
    const after = [box("a", 0, 0), box("b", 200, 0)];
    expect(flashTargets(before, after).map((t) => t.id)).toEqual(["b"]);
  });

  it("outlines what moved when nothing appeared", () => {
    const before = [box("a", 0, 0), box("b", 200, 0)];
    const after = [box("a", 0, 0), box("b", 220, 0)];
    expect(flashTargets(before, after).map((t) => t.id)).toEqual(["b"]);
  });

  it("outlines what changed hands", () => {
    const before = [box("a", 0, 0, "lane1")];
    const after = [box("a", 0, 0, "ep1")];
    expect(flashTargets(before, after).map((t) => t.id)).toEqual(["a"]);
  });

  it("does not point at the neighbours a wrap shoved out of the way", () => {
    // Surrounding a selection also shifts everything to its right. Outlining
    // those would point at a dozen things the user did not ask to change, so
    // added-and-enclosed wins over moved whenever anything appeared.
    const before = [box("sel", 100, 0, "lane1"), box("n1", 300, 0, "lane1"), box("n2", 450, 0, "lane1")];
    const after = [
      box("ep", 80, 0, "lane1"),          // appeared
      box("sel", 190, 0, "ep"),           // enclosed
      box("n1", 480, 0, "lane1"),         // shoved
      box("n2", 630, 0, "lane1"),         // shoved
    ];
    expect(flashTargets(before, after).map((t) => t.id).sort()).toEqual(["ep", "sel"]);
  });

  it("stays quiet when nothing changed", () => {
    const same = [box("a", 0, 0), box("b", 200, 0)];
    expect(flashTargets(same, same)).toEqual([]);
  });

  it("ignores sub-pixel drift", () => {
    const before = [box("a", 0, 0)];
    const after = [box("a", 0.2, -0.1)];
    expect(flashTargets(before, after)).toEqual([]);
  });

  it("never outlines more than a screenful", () => {
    const before: FlashBox[] = [];
    const after = Array.from({ length: 200 }, (_, i) => box(`e${i}`, i * 10, 0));
    expect(flashTargets(before, after)).toHaveLength(GOLD_FLASH_MAX_TARGETS);
  });
});

describe("T4488 — one ordering of the tiers", () => {
  it("ranks them lowest to highest", () => {
    expect(tierRank("free")).toBeLessThan(tierRank("introductory"));
    expect(tierRank("introductory")).toBeLessThan(tierRank("professional"));
    expect(tierRank("professional")).toBeLessThan(tierRank("expert"));
    expect(tierRank("expert")).toBeLessThan(tierRank("enterprise"));
  });

  it("counts enterprise as above expert", () => {
    // The ordering that already existed in the usage popover omits enterprise
    // entirely, which would quietly put the top tier below the one under it.
    expect(atLeastTier("enterprise", "expert")).toBe(true);
    expect(TIER_ORDER).toContain("enterprise");
  });

  it("answers Paul's rule: Expert and above", () => {
    expect(atLeastTier("expert", "expert")).toBe(true);
    expect(atLeastTier("enterprise", "expert")).toBe(true);
    expect(atLeastTier("professional", "expert")).toBe(false);
    expect(atLeastTier("introductory", "expert")).toBe(false);
    expect(atLeastTier("free", "expert")).toBe(false);
  });

  it("puts the non-tier view modes above every tier", () => {
    // Someone in these modes is looking at the product as themselves, not
    // previewing a customer.
    expect(atLeastTier("superadmin", "expert")).toBe(true);
    expect(atLeastTier("orgadmin", "expert")).toBe(true);
  });

  it("hides rather than grants when the name is unknown", () => {
    for (const bad of [null, undefined, "", "EXPERTT", "platinum"]) {
      expect(atLeastTier(bad, "expert"), String(bad)).toBe(false);
    }
  });

  it("is case-insensitive, since these names come from several places", () => {
    expect(atLeastTier("Expert", "expert")).toBe(true);
    expect(atLeastTier("ENTERPRISE", "expert")).toBe(true);
  });
});

describe("T4489 — Voice Assist is gated on the feature, not on being an admin", () => {
  const editor = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");

  it("reads the registry key that has been seeded since Phase 1", () => {
    expect(editor).toContain('useFeatureState("voice-assist")');
  });

  it("no longer hangs the wand or the bar on isActingAdmin", () => {
    expect(editor).toContain("diagramType === \"bpmn\" && voiceAssistAllowed");
    expect(editor).toContain("voiceAssistOn && !readOnly && diagramType === \"bpmn\" && voiceAssistAllowed");
    expect(editor, "the old SuperAdmin-only gate is gone").not.toContain(
      'diagramType === "bpmn" && isActingAdmin',
    );
  });

  it("still respects a SuperAdmin previewing a lower tier", () => {
    // The server hands an admin every feature, so the feature map alone would
    // leave the wand up while pretending to be an Introductory user.
    expect(editor).toContain('atLeastTier(adminViewMode, "expert")');
  });

  it("enforces it on the route, not only in the editor", () => {
    // Anything in the editor decides which buttons are drawn. The route is
    // reachable directly.
    const route = read("app", "api", "ai", "command", "route.ts");
    expect(route).toContain('gateFeature(session.user.id, "voice-assist")');
    const gate = route.indexOf("gateFeature");
    const work = route.indexOf("const body = await req.json()");
    expect(gate, "the gate must run before any work").toBeLessThan(work);
  });

  it("is seeded available at expert and enterprise, and nowhere below", () => {
    const seed = JSON.parse(read("menus_and_features", "feature-availability.seed.json")) as {
      rows?: Array<{ key: string; states?: Record<string, string> }>;
    };
    const rows = seed.rows ?? [];
    expect(rows.length, "the seed has no rows — the shape changed").toBeGreaterThan(0);
    const abra = rows.find((f) => f.key === "voice-assist");
    expect(abra, "the voice-assist key is missing from the seed").toBeDefined();
    const states = abra!.states ?? {};
    expect(states.expert).toBe("available");
    expect(states.enterprise).toBe("available");
    for (const below of ["free", "introductory", "professional"]) {
      expect(states[below], `${below} should not have it`).not.toBe("available");
    }
  });
});
