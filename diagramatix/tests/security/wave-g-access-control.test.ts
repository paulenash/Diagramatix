/**
 * Wave G batch 2 — three ways access outlived the permission that granted it.
 *
 * SEC-27  A reviewer grant never expired. `isAssignedReviewer` matched any
 *         DiagramReviewer row for the diagram, and those rows are KEPT for
 *         history when a round closes — so anyone ever added as a reviewer,
 *         including one who declined, retained read and full `data` overwrite
 *         rights on a diagram they had no project access to, permanently, with
 *         no way to revoke short of editing the database.
 *
 * SEC-23  The cross-org gate ran over the audience ids that were named
 *         outright, and email-resolved users were folded in AFTERWARDS. Typing
 *         an outsider's email instead of picking them from the list walked
 *         past it — so an existing account in another tenant could be given a
 *         published closure in an org that forbids exactly that.
 *
 *         Deliberately NOT extended to promotion time. The audit recommended
 *         re-checking membership when a pending invitation is promoted, and
 *         that turned out to be wrong: a pending invitation exists precisely
 *         because the invitee had no account, and a fresh sign-up lands in
 *         their own personal org, so every legitimate invite-by-email would be
 *         refused. Three DATA-09 tests pin that behaviour and failed when the
 *         check was added. Whether an org that forbids cross-org sharing should
 *         also forbid inviting a brand-new outsider is a product decision, not
 *         a defect; it is recorded for Paul rather than settled here.
 *
 * SEC-25  Registration stored the address verbatim. `Victim@corp.com` passed
 *         the duplicate check against `victim@corp.com`, and registration
 *         immediately consumed that address's pending bundle invitations, so
 *         the real owner never received them. The docblock justified it by
 *         saying login lowercases on lookup — which is exactly why the row
 *         could never sign in.
 *
 * These are source-level guards: each of the three needs a populated database
 * and a multi-tenant fixture to exercise end to end, and what regresses is the
 * shape of the query, which is what is pinned here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE_REVIEW_STATUSES, DECLINED_REVIEWER_STATUS } from "@/app/lib/reviewProjects";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Wave G — access that outlived its grant", () => {
  it("T4432 — SEC-27: the reviewer grant is scoped to a live round and excludes a decliner", () => {
    // An allow-list, so a status nobody has taught the module about withholds
    // the grant rather than handing it out.
    expect(LIVE_REVIEW_STATUSES).toEqual(["open", "resubmitted"]);
    expect(DECLINED_REVIEWER_STATUS).toBe("declined-to-review");
    expect(LIVE_REVIEW_STATUSES as readonly string[], "a closed round must not grant access").not.toContain("closed");

    const src = read("app/lib/reviewProjects.ts");
    const query = src.slice(src.indexOf("export async function isAssignedReviewer"));
    expect(query, "filter on the round's status").toMatch(/review:\s*\{[^}]*status:\s*\{\s*in:/s);
    expect(query, "exclude a reviewer who declined").toMatch(/status:\s*\{\s*not:\s*DECLINED_REVIEWER_STATUS/);
  });

  it("T4433 — SEC-23: the cross-org gate covers the final audience, and runs again at promotion", () => {
    const route = read("app/api/bundles/route.ts");
    const gate = route.indexOf("allowCrossOrgSharing");
    const finalSet = route.indexOf("const finalAudienceUserIds");
    expect(gate, "the gate must exist").toBeGreaterThan(-1);
    expect(
      gate,
      "the cross-org gate runs BEFORE the email-resolved users are folded in — that is the SEC-23 defect",
    ).toBeGreaterThan(finalSet);
    expect(route.slice(gate - 400, gate + 900)).toMatch(/finalAudienceUserIds/);

    // NOT gated at promotion time, deliberately: a pending invitation exists
    // precisely because the invitee had no account, and a new sign-up lands in
    // their own personal org. Refusing outsiders there would disable
    // invite-by-email entirely, which is what the feature is for (pinned by
    // the DATA-09 promotion tests). The gate belongs at invite time, above.
    expect(read("app/lib/bundleInvites.ts"), "promotion stays org-agnostic").not.toMatch(/orgMember\.count\(/);
  });

  it("T4434 — SEC-25: registration normalises the address before the duplicate check and the create", () => {
    const src = read("app/lib/auth/registerUser.ts");
    expect(src, "reuse the one normaliser").toMatch(/import \{ normaliseEmail \}/);
    expect(src, "check for a duplicate against the normalised form").toMatch(/findUnique\(\{ where: \{ email: normalisedEmail \} \}\)/);
    expect(src, "and store the normalised form").toMatch(/email: normalisedEmail,/);
    expect(
      /email: email as string/.test(src),
      "the raw address is still being used — that is the SEC-25 defect",
    ).toBe(false);

    // Login looks up the lowercased address, so the two must agree.
    expect(read("app/lib/auth/credentials.ts")).toMatch(/toLowerCase\(\)/);
  });
});
