/**
 * Paul, 2026-09-27 (Voice-Assist-Walkthrough---Block-2-Test-3-voice-debug-2026-09-27):
 * "Renaming message connectors does not work … messgae six <> message 6. Add
 * 'Rename messages' to command list. Place green numbers above everything.
 * Currently they are under the message connectors."
 *
 * The session's one line: "rename message six to new label" → couldn't find
 * "message six". The message is labelled "message 6".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { connectorsNamed, spokenLabel } from "@/app/lib/assist/connectorRef";
import { COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import type { DiagramData } from "@/app/lib/diagram/types";

const paul = (): DiagramData => JSON.parse(readFileSync("tests/fixtures/voice-debug/block2-test3-message-six.json", "utf8"));

describe("T4954 — a connector's name matches with its number said as a word", () => {
  it("“message six” is “message 6”, both ways, as the element resolver has always done", () => {
    expect(spokenLabel("message six")).toBe(spokenLabel("message 6"));
    expect(spokenLabel("Message 6")).toBe("message 6");
    const { connectors } = paul();
    expect(connectorsNamed(connectors, "message six").map((c) => c.id)).toEqual(["06phejr6"]);
    expect(connectorsNamed(connectors, "message one").map((c) => c.id)).toEqual(["3dpnogfg"]);
  });

  it("Paul's line renames his message now — and the delete finds it the same way", () => {
    const h = headlessDiagram(paul());
    const r = applyAssistOps(parseCommand("rename message six to new label")!, h.context());
    expect(r).toEqual({ ok: true, summary: "renamed connector “message 6” → New label" });
    expect(h.data.connectors.find((c) => c.id === "06phejr6")!.label).toBe("New label");
    const d = headlessDiagram(paul());
    expect(applyAssistOps(parseCommand("delete message five")!, d.context()).summary).toBe("deleted message “message 5”");
  });

  it("the Commands card lists “rename messages”", () => {
    const lines = COMMAND_CATALOG.flatMap((f) => f.items.flatMap((i) => i.say));
    expect(lines).toContain("rename messages");
  });
});

describe("T4955 — the green numbers are the canvas's LAST layer", () => {
  it("drawn after every connector pass and the review notes, so nothing covers them", () => {
    const canvas = readFileSync("app/components/canvas/Canvas.tsx", "utf8");
    const badges = canvas.indexOf("{renameBadges && renameBadges.length > 0 && (");
    expect(badges).toBeGreaterThan(0);
    for (const earlier of [
      'data.connectors.filter(c => c.type === "associationBPMN" || c.type === "messageBPMN")',
      "{/* Selected regular connector — rendered on top of all elements */}",
      "{/* Review comments — ALWAYS the final pass",
    ]) {
      const at = canvas.indexOf(earlier);
      expect(at, earlier).toBeGreaterThan(0);
      expect(at, `${earlier} must draw before the numbers`).toBeLessThan(badges);
    }
    // …and nothing but the group's close follows them.
    const after = canvas.slice(badges);
    expect(after.indexOf("</svg>")).toBeGreaterThan(0);
    expect(after.slice(0, after.indexOf("</svg>")).match(/\{\/\* /g)?.length ?? 0, "no layer after the numbers").toBe(0);
  });
});
