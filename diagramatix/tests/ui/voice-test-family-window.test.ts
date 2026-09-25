/**
 * T4764 — the Text leg's family window.
 *
 * Paul, 2026-09-25: "Under Test leg - free: add a feature to popup a scrollable
 * window that shows the details of the commands in a Family, and their
 * statuses. Close button is outside the scrollable region."
 *
 * No jsdom in this suite (every guard sits on source or a pure module), so the
 * layout promise is pinned in the source: the list is the ONLY scrolling
 * region, and Close sits after it, in the footer, where a long family cannot
 * push it out of reach.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "app", "(dashboard)", "dashboard", "admin", "voice-assist-test");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");

describe("T4764 — a family's cases in a scrollable window, Close outside the scroll", () => {
  it("each family in the table opens the window with that family's cases", () => {
    const client = read("VoiceAssistTestClient.tsx");
    expect(client).toContain("onClick={() => setOpenFamily(f)}");
    expect(client).toContain("results={results.filter((r) => r.family === openFamily)}");
  });

  it("only the list scrolls, and Close comes AFTER it — outside the scrolling region", () => {
    const w = read("FamilyCasesWindow.tsx");
    const scroll = w.indexOf(`className="overflow-y-auto`);
    const close = w.indexOf(">\n            Close\n");
    expect(scroll).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(-1);
    // The scrolling div closes before the footer that holds Close opens.
    const scrollEnds = w.indexOf("\n        </div>\n", scroll);
    expect(scrollEnds).toBeGreaterThan(scroll);
    expect(close, "Close must sit outside the scrolling list").toBeGreaterThan(scrollEnds);
    expect([...w.matchAll(/overflow-y-auto/g)], "exactly one scrolling region").toHaveLength(1);
    // The window is capped to the screen, so the list — not the page — scrolls.
    expect(w).toContain("max-h-[85vh]");
  });

  it("shows each case's status and what it means; Escape and the backdrop close it; no browser dialogs", () => {
    const w = read("FamilyCasesWindow.tsx");
    expect(w).toContain("OUTCOME_STYLE[r.outcome]");
    expect(w).toContain("OUTCOME_MEANS[r.outcome]");
    expect(w).toContain(`if (e.key === "Escape") onClose();`);
    expect(w).toContain("onMouseDown={onClose}");
    expect(w).not.toMatch(/\b(alert|confirm|prompt)\(/);
  });
});
