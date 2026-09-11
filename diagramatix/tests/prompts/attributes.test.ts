/**
 * Prompt attributes, their filters, and the usage summary.
 *
 * The judgement worth defending here is that **"not recorded" is not "typed"**.
 * Every prompt saved before this existed has no record of how it was written,
 * and the cheap thing — defaulting them to "typed" — would invent a fact about
 * how somebody worked and then let them filter on it. The column is nullable,
 * the filter has a third option, and the summary names the bucket.
 *
 * The other one: **using a prompt is not editing it.** Prisma's `@updatedAt`
 * fires on any model update, so recording a generation through the ordinary
 * save would quietly turn "last modified" into "last run" — and those answer
 * completely different questions when deciding what to keep.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const schema = () => read("prisma/schema.prisma");
const ui = () => read("app/(dashboard)/dashboard/prompts/PromptMaintenance.tsx");
const summary = () => read("app/(dashboard)/dashboard/prompts/PromptUsageSummary.tsx");
const usedRoute = () => read("app/api/prompts/[id]/used/route.ts");

describe("the attributes exist and mean what they say", () => {
  it("T4177 - the columns are on the model", () => {
    const m = schema().slice(schema().indexOf("model Prompt"), schema().indexOf("model ", schema().indexOf("model Prompt") + 10));
    for (const col of ["source", "refinedAt", "fromImage", "modelUsed", "lastUsedAt", "useCount"]) {
      expect(m, `Prompt.${col} is missing`).toMatch(new RegExp(`\\b${col}\\b`));
    }
    // planJson was already there and simply unsurfaced — the list needs to know
    // only WHETHER there is a plan, so planUpdatedAt is what the API returns.
    expect(m).toMatch(/\bplanUpdatedAt\b/);
  });

  it("T4178 - `source` is NULLABLE, because unknown is not the same as typed", () => {
    const m = schema().slice(schema().indexOf("model Prompt"));
    expect(m, "a non-null default would invent how old prompts were written")
      .toMatch(/source\s+String\?/);
    // The create must not quietly fill it in either.
    const api = read("app/api/prompts/route.ts");
    expect(api).toMatch(/source === "typed" \|\| source === "dictated" \? \{ source \} : \{\}/);
  });

  it("T4179 - recording a use does NOT touch updatedAt", () => {
    // Through Prisma it would, because @updatedAt fires on any update. Raw SQL
    // is the point of this route, not an optimisation.
    const src = usedRoute();
    expect(src, "it must go through raw SQL").toContain("pgPool.query");
    expect(src, "Prisma's update would bump updatedAt").not.toMatch(/prisma\.prompt\.update/);
    expect(src).toMatch(/"useCount"\s*=\s*"useCount" \+ 1/);
    expect(src, "and it must stay scoped to its owner").toMatch(/"userId" = \$3 AND "orgId" = \$4/);
  });

  it("T4180 - the backfill SETS rather than increments, so running it twice is safe", () => {
    const src = read("scripts/backfill-prompt-usage.ts");
    expect(src).toMatch(/SET "useCount"\s*=\s*\$1/);
    expect(src, "an increment would double the counts on a second run")
      .not.toMatch(/"useCount"\s*=\s*"useCount"\s*\+/);
    expect(src, "it must not disturb last-modified either").not.toMatch(/"updatedAt"\s*=/);
    expect(src, "a dry run is what makes a one-off script safe to try").toContain("--dry-run");
  });

  it("T4181 - both read endpoints return the same attribute set", () => {
    // Two endpoints returning different shapes is how a filter works in one
    // branch of the tree and silently does nothing in the other.
    for (const p of ["app/api/prompts/route.ts", "app/api/prompts/org/route.ts"]) {
      const src = read(p);
      for (const f of ["source", "refinedAt", "fromImage", "modelUsed", "lastUsedAt", "useCount", "planUpdatedAt"]) {
        expect(src, `${p} does not return ${f}`).toContain(f);
      }
    }
  });
});

describe("each attribute filters in the way its type allows", () => {
  it("T4182 - flags are yes/no, timestamps are ranges, source has THREE answers", () => {
    const src = ui();
    // A flag.
    expect(src).toContain('triMatch(attr.refined, !!p.refinedAt)');
    expect(src).toContain('triMatch(attr.image, !!p.fromImage)');
    expect(src).toContain('triMatch(attr.plan, !!p.planUpdatedAt)');
    // A range.
    expect(src).toContain("inRange(p.createdAt, attr.createdFrom, attr.createdTo)");
    expect(src).toContain("inRange(p.updatedAt, attr.modifiedFrom, attr.modifiedTo)");
    // And the third answer.
    expect(src, '"not recorded" must be selectable, not folded into typed')
      .toContain('<option value="unrecorded">Not recorded</option>');
    expect(src).toMatch(/const actual = p\.source \?\? "unrecorded";/);
  });

  it("T4183 - a date range includes the whole of its last day", () => {
    // A range that stopped at midnight would silently exclude everything saved
    // during the day somebody picked, which is wrong in the way nobody notices.
    expect(ui()).toContain('T23:59:59.999');
  });

  it("T4184 - never-used is filterable, because that is the clear-out", () => {
    const src = ui();
    expect(src).toContain('<option value="never">Never used</option>');
    // …and visible on the row without filtering for it.
    expect(src).toContain("· Never used");
  });

  it("T4185 - changing an attribute filter clears the selection too", () => {
    // Not just the text filter. Carrying a selection across ANY filter change is
    // how somebody deletes a prompt they can no longer see.
    expect(ui()).toMatch(/\[activeType, filter, attr\]/);
  });

  it("T4186 - the bulk bar appears for an attribute filter, not only a text one", () => {
    // Otherwise "filter to never-used, delete them all" — the gesture the whole
    // feature exists for — has no button.
    //
    // Both sites are pinned: the bar itself and the delete-all button inside
    // it. The first version matched either one, so reverting just the bar left
    // this green — and the bar is what makes the button reachable.
    const src = ui();
    const sites = (src.match(/\(filter\.trim\(\) \|\| attrActive\) && visibleIds\.length > 0/g) ?? []).length;
    expect(sites, "the bar AND its delete-all button must both honour an attribute filter").toBe(2);
  });
});

describe("the usage summary", () => {
  it("T4187 - it leads with what is NOT earning its place", () => {
    // The number that changes what somebody does next, not a total.
    const src = summary();
    expect(src).toContain("never used");
    expect(src).toMatch(/s\.stale\.length/);
  });

  it("T4188 - usage is bucketed, not averaged", () => {
    // A mean over a long tail of run-once prompts is a number nobody can act on.
    const src = summary();
    expect(src).toMatch(/label: "Never"/);
    expect(src).toMatch(/label: "2–5"/);
    expect(src, "an average would be the tempting wrong answer").not.toMatch(/\/ prompts\.length.*average/i);
  });

  it("T4189 - it keeps “not recorded” as its own bucket", () => {
    expect(summary()).toMatch(/label: "Not recorded"/);
  });

  it("T4190 - it says what it covers, and what the count cannot include", () => {
    const src = summary();
    // Scope: a summary you cannot reconcile with the list behind it is worse
    // than none at all.
    expect(src).toContain("scopeLabel");
    // And the honest floor — a deleted diagram no longer contributes.
    expect(src).toMatch(/a count is a floor, not a total/);
  });

  it("T4191 - it summarises the whole library, not the filtered view", () => {
    // A summary that moved with the filter would answer a different question
    // every time you looked at it.
    const src = ui();
    expect(src).toMatch(/prompts=\{orgPrompts \?\? prompts\}/);
    expect(src).toMatch(/across all diagram types/);
  });

  it("T4192 - it draws its own charts rather than pulling in a library", () => {
    const src = summary();
    expect(src).toContain("<svg");
    expect(src, "no charting dependency for six small panels").not.toMatch(/from "(recharts|chart\.js|d3)/);
  });
});
