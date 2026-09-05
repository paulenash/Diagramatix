import { describe, it, expect } from "vitest";
import {
  MD_PROMPT_TYPES, MD_PROMPT_TEMPLATE_HISTORY, latestTemplateVersion, promptIsStale,
  templateVersionAt,
} from "@/app/lib/valueChain/promptTemplates";

/**
 * A prompt written to a standard that has since moved.
 *
 * Paul regenerated V22 with the loop-scope fix live and got the same thirteen
 * diagnostics, because the prompts predated it and nothing on the screen said
 * so. It happened twice in one week. Then, 2026-09-05: "Add a History for each
 * Master Diagram Prompt Template that shows the changes, what they were and when
 * they occurred… it must have at least a DateTime Stamp, Version#, Version
 * Description so the User knows what happened."
 *
 * The history lives in code because every change of the last fortnight was to
 * the BUILT-IN half of a master template — a database history would have
 * recorded none of them, and "did my prompts predate this change?" is the
 * question it exists to answer.
 */
describe("master template history", () => {
  it("T3242 every diagram type has a history, versioned from 1 and in order", () => {
    for (const t of MD_PROMPT_TYPES) {
      const h = MD_PROMPT_TEMPLATE_HISTORY[t];
      expect(h.length, `${t} has no history`).toBeGreaterThan(0);
      expect(h[0].version).toBe(1);
      for (let i = 1; i < h.length; i++) {
        expect(h[i].version, `${t} versions must ascend`).toBe(h[i - 1].version + 1);
        expect(h[i].at >= h[i - 1].at, `${t} dates must not go backwards`).toBe(true);
      }
    }
  });

  it("T3243 every entry carries the three things Paul asked for", () => {
    // "a DateTime Stamp, Version#, Version Description so the User knows what
    // happened" — an entry missing the description is the one that makes the
    // history useless, because the version number alone says nothing.
    for (const t of MD_PROMPT_TYPES) {
      for (const v of MD_PROMPT_TEMPLATE_HISTORY[t]) {
        expect(v.at, `${t} v${v.version} has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(v.version).toBeGreaterThan(0);
        expect(v.description.trim().length, `${t} v${v.version} has no description`).toBeGreaterThan(20);
        expect(v.commit, `${t} v${v.version} has no commit`).toMatch(/^[0-9a-f]{7,}$/);
        // The exact instant, and it must AGREE with the date beside it.
        // Without this a future entry can carry a shippedAt from the wrong day
        // and the staleness cut-off silently moves — the failure this replaced.
        const shipped = new Date(v.shippedAt);
        expect(Number.isNaN(shipped.getTime()), `${t} v${v.version} shippedAt unusable`).toBe(false);
        expect(v.shippedAt.slice(0, 10), `${t} v${v.version} shippedAt disagrees with at`).toBe(v.at);
      }
    }
  });

  it("T3244 the BPMN history records the changes that actually shipped", () => {
    const h = MD_PROMPT_TEMPLATE_HISTORY.bpmn;
    // Backfilled from git, not from memory. These two are the ones whose absence
    // cost real regeneration cycles, so they are named.
    expect(h.some((v) => v.commit === "71f1d3bb"), "the six-defect audit").toBe(true);
    expect(h.some((v) => v.commit === "2df08f65"), "the loop-scope rule").toBe(true);
    expect(latestTemplateVersion("bpmn").version).toBe(h.length);
  });

  it("T3245 staleness is decided on the exact instant, not the day", () => {
    const shipped = new Date(latestTemplateVersion("bpmn").shippedAt).getTime();
    expect(promptIsStale("bpmn", new Date(shipped - 1))).toBe(true);
    expect(promptIsStale("bpmn", new Date(shipped))).toBe(false);
    expect(promptIsStale("bpmn", new Date(shipped + 1))).toBe(false);
    expect(promptIsStale("bpmn", new Date("2020-01-01T00:00:00.000Z"))).toBe(true);
    expect(promptIsStale("bpmn", new Date("2099-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("T3267 a prompt regenerated the morning AFTER the change is not stale at UTC+10", () => {
    /**
     * The bug this replaced, in Paul's own words: "I regenerated prompts for V22
     * and published BUT red messages remained."
     *
     * The rule used to compare against the END of the day the change shipped, in
     * UTC, because the history carried a date and a date is not a moment. v7
     * shipped 2026-09-05T00:27:52Z; the cut-off was 2026-09-05T23:59:59.999Z,
     * 23½ hours later. Paul regenerated on the morning of 2026-09-06 in Sydney —
     * 2026-09-05T21:xx:00Z — which fell before that cut-off, so every freshly
     * written prompt was still called stale.
     *
     * An instant needs no rounding and knows nothing about timezones.
     */
    const sydneyMorningAfter = new Date("2026-09-06T07:30:00+10:00"); // = 2026-09-05T21:30Z
    expect(promptIsStale("bpmn", sydneyMorningAfter)).toBe(false);
  });

  it("T3268 templateVersionAt reports the version in force at an instant, not the newest", () => {
    // Stamping the newest onto a diagram built from an OLD prompt would make it
    // claim to be current — the exact reassurance the warning exists to withhold.
    const h = MD_PROMPT_TEMPLATE_HISTORY.bpmn;
    const v6 = h.find((v) => v.version === 6)!;
    const v7 = h.find((v) => v.version === 7)!;
    expect(templateVersionAt("bpmn", v6.shippedAt)).toBe(6);
    expect(templateVersionAt("bpmn", new Date(new Date(v7.shippedAt).getTime() - 1))).toBe(6);
    expect(templateVersionAt("bpmn", v7.shippedAt)).toBe(7);
    // Before anything shipped, and for an undated prompt: unknown, not v1.
    expect(templateVersionAt("bpmn", "2020-01-01T00:00:00.000Z")).toBe(0);
    expect(templateVersionAt("bpmn", null)).toBe(0);
  });

  it("T3246 a prompt with no date at all counts as stale", () => {
    // One nobody can date is one nobody can vouch for — and saying "current"
    // about it is the failure this whole feature exists to prevent.
    expect(promptIsStale("bpmn", null)).toBe(true);
    expect(promptIsStale("bpmn", undefined)).toBe(true);
    expect(promptIsStale("bpmn", "not a date")).toBe(true);
  });
});
