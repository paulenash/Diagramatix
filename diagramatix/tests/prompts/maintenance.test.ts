/**
 * AI Prompt Maintenance — the five changes of 2026-09-11.
 *
 * The half worth the most attention is not the tree or the filter: it is that
 * this screen now reads and deletes OTHER PEOPLE'S prompts. A saved prompt is
 * somebody's working note and can carry the description of a process they were
 * asked to model, so the gate on it has to be real and has to stay real.
 *
 * Source-text tripwires, because these are a route's authorisation and a
 * component's layout — neither reachable by a unit test, and both the kind of
 * thing that breaks while everything still compiles.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const ui = () => read("app/(dashboard)/dashboard/prompts/PromptMaintenance.tsx");
const orgRoute = () => read("app/api/prompts/org/route.ts");
const bulkRoute = () => read("app/api/prompts/bulk-delete/route.ts");

describe("reading and deleting someone else's prompts is gated", () => {
  it("T4164 - the org-wide endpoint requires OrgAdmin on BOTH verbs", () => {
    // Gating the read and forgetting the write is the classic half-fix, and it
    // is the worse half: it lets a colleague delete what they cannot see.
    const src = orgRoute();
    const gates = (src.match(/requireOrgAdminFor\(/g) ?? []).length;
    expect(gates, "both GET and POST must be gated").toBeGreaterThanOrEqual(2);
    expect(src).toContain("export async function GET");
    expect(src).toContain("export async function POST");
  });

  it("T4165 - the private endpoint was NOT widened", () => {
    // The whole point of a separate door. /api/prompts must still answer with
    // one person's prompts, so nothing that already calls it can start seeing
    // more than it did.
    const src = read("app/api/prompts/route.ts");
    expect(src, "the private list must still be scoped to its owner")
      .toMatch(/where: \{ userId, orgId/);
  });

  it("T4166 - a posted id list is re-resolved against the org, not trusted", () => {
    // A browser can post any id. What it may delete is decided on the server.
    const src = orgRoute();
    expect(src).toMatch(/findMany\(\{\s*where: \{ id: \{ in: ids as string\[\] \}, orgId \}/);
    expect(src, "the delete itself must still carry the org scope")
      .toMatch(/deleteMany\(\{\s*where: \{ id: \{ in: owned\.map/);
  });

  it("T4167 - the personal bulk delete stays personal", () => {
    // It exists so a filter-then-clear-out is one request instead of fifty.
    // It must not become a second way to reach a colleague's prompts.
    const src = bulkRoute();
    const call = src.slice(src.indexOf("deleteMany("));
    const where = call.slice(0, call.indexOf("});"));
    expect(where, "the personal delete must name the OWNER").toContain("userId");
    expect(where, "…and the org, so it cannot cross a tenant").toContain("orgId");
    // The USE, not the import. Asserting the bare name passed while the call
    // had been replaced by session.user.id — which is SEC-21 all over again:
    // a SuperAdmin viewing someone else would have deleted their OWN prompts.
    expect(src, "it must be impersonation-aware like the single-prompt routes")
      .toContain("const userId = getEffectiveUserId(");
    expect(src).toContain("isReadOnlyImpersonation");
  });

  it("T4168 - both bulk routes report what they did NOT delete", () => {
    // A count that silently falls short reads as success to anyone who does not
    // compare it with what they asked for.
    for (const src of [orgRoute(), bulkRoute()]) {
      expect(src).toMatch(/skipped: ids\.length - count/);
    }
  });
});

describe("the top panel stays on screen", () => {
  it("T4169 - only the prompt list scrolls", () => {
    // It was min-h-screen, so the PAGE grew and took the header up with it.
    // h-screen plus min-h-0 on the flex children is what keeps the header and
    // the diagram-type list put.
    const src = ui();
    expect(src, "the page must not be able to grow past the viewport")
      .toContain('className="h-screen dgx-dashboard-bg flex flex-col overflow-hidden"');
    expect(src, "min-h-screen would let the header scroll away")
      .not.toMatch(/className="min-h-screen/);
    expect(src, "the flex row must be allowed to shrink").toContain("flex-1 flex min-h-0");
    expect(src, "the header must not shrink or scroll").toMatch(/<header className="shrink-0/);
    expect(src, "the list is the only scroller").toContain("flex-1 min-h-0 overflow-y-auto");
  });
});

describe("the tree, the filter and the bulk actions", () => {
  it("T4170 - prompts sit in a collapsible User / Org tree", () => {
    const src = ui();
    expect(src).toMatch(/label: "User"/);
    expect(src).toMatch(/Org — \$\{orgCount\}|Org — /);
    expect(src, "branches must collapse").toContain("toggleOpen(g.key)");
    expect(src, "an expanded branch must say so for a screen reader").toContain("aria-expanded={open}");
  });

  it("T4171 - the Org branch appears only when the API will serve it", () => {
    // The permission is DISCOVERED by calling the gated endpoint rather than
    // asserted separately. A parallel claim about what someone may see is a
    // claim that can disagree with the gate that decides it.
    const src = ui();
    expect(src).toContain('fetch("/api/prompts/org")');
    expect(src).toMatch(/setOrgPrompts\(res\.ok \? await res\.json\(\) : null\)/);
    expect(src, "a 403 is the ordinary case, not an error to show").toMatch(/403 here is the ordinary case/);
  });

  it("T4172 - the filter matches title OR contents", () => {
    // Someone looking for a prompt usually remembers a phrase from inside it,
    // not what they called it.
    const src = ui();
    expect(src).toMatch(/p\.name\.toLowerCase\(\)\.includes\(q\) \|\| p\.text\.toLowerCase\(\)\.includes\(q\)/);
  });

  it("T4173 - bulk delete reaches only the diagram type on screen", () => {
    // Paul's choice. The ids come from the groups, which are already filtered
    // to activeType — so the scope is structural rather than a check that could
    // be forgotten. The UI says so too, because "delete all filtered" is
    // otherwise a reasonable thing to read as "everywhere".
    const src = ui();
    expect(src).toMatch(/p\.diagramType === activeType/);
    expect(src, "the scope must be stated where the button is")
      .toContain("only — other diagram types are not touched");
    expect(src, "and repeated in the confirmation")
      .toContain("no other diagram type is touched");
  });

  it("T4174 - changing the filter or the type clears the selection", () => {
    // Carrying a selection across a filter change is how somebody deletes a
    // prompt they can no longer see.
    const src = ui();
    // The dependency list is asserted in full by T4185; what matters here is
    // that the selection is cleared on a filter change at all. Pinning the
    // exact array made this fail the moment the attribute filters widened it,
    // which is a test objecting to an improvement.
    expect(src).toContain("setSelected(new Set()); }, [activeType, filter");
  });

  it("T4175 - a group can be selected in one go, and a colleague's cannot be edited", () => {
    const src = ui();
    expect(src).toContain("toggleGroup(g)");
    // An OrgAdmin may REMOVE a colleague's prompt, not rewrite it under their
    // name — which would leave an author's name on words they never wrote.
    expect(src).toMatch(/\{!g\.foreign && \(/);
  });

  it("T4176 - deletion is confirmed in-app, never by a browser dialog", () => {
    const src = ui();
    expect(src).toContain("<ConfirmDialog");
    expect(src, "window.confirm is banned in this codebase").not.toMatch(/window\.(confirm|alert|prompt)\(/);
    // …and the confirmation must say when it reaches other people's work.
    expect(src).toContain("Some of these belong to other people in your organisation.");
  });
});
