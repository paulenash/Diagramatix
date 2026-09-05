import { describe, it, expect } from "vitest";
import {
  MD_PROMPT_TYPES, MD_PROMPT_TEMPLATE_HISTORY, latestTemplateVersion, promptIsStale,
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

  it("T3245 a prompt generated before the newest change is stale", () => {
    const at = latestTemplateVersion("bpmn").at;
    // Same day counts as STALE: a deploy lands partway through the day, so a
    // prompt generated that morning predates it. Erring towards regenerating.
    expect(promptIsStale("bpmn", new Date(`${at}T00:00:00.000Z`))).toBe(true);
    expect(promptIsStale("bpmn", new Date("2020-01-01T00:00:00.000Z"))).toBe(true);
    expect(promptIsStale("bpmn", new Date("2099-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("T3246 a prompt with no date at all counts as stale", () => {
    // One nobody can date is one nobody can vouch for — and saying "current"
    // about it is the failure this whole feature exists to prevent.
    expect(promptIsStale("bpmn", null)).toBe(true);
    expect(promptIsStale("bpmn", undefined)).toBe(true);
    expect(promptIsStale("bpmn", "not a date")).toBe(true);
  });
});
