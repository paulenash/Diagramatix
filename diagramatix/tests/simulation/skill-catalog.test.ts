/**
 * The master Skills list.
 *
 * Paul, 2026-09-11, step 1: "Don't we need an extendible master list of skills
 * first." The thing it fixes is not tidiness — before it, a skill was whatever
 * string somebody typed, matched by exact string. "Compliance Accreditation" and
 * "Compliance accreditation" were two different skills, and the only symptom was
 * a task that never started while the readiness check reported, correctly and
 * uselessly, that nobody held it.
 *
 * So the tests that matter here are about IDENTITY (two spellings are one skill)
 * and about REFERENCES SURVIVING (a skill in use cannot quietly stop resolving).
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/app/lib/db";
import {
  normaliseSkill, listSkills, createSkill, updateSkill, deleteSkill,
} from "@/app/lib/simulation/skillCatalog";

const ORG = "test-org-skill-catalog";

async function freshOrg() {
  await prisma.skill.deleteMany({ where: { orgId: ORG } });
  await prisma.org.deleteMany({ where: { id: ORG } });
  await prisma.org.create({ data: { id: ORG, name: "Skill Catalog Test Org" } });
}

beforeEach(freshOrg);
afterAll(async () => {
  await prisma.skill.deleteMany({ where: { orgId: ORG } });
  await prisma.org.deleteMany({ where: { id: ORG } });
});

describe("the master Skills list", () => {
  it("T4244 — two spellings of the same skill are one skill", () => {
    // THE bug the catalog exists to prevent. Case and inner spacing are not
    // distinctions; a person holding "compliance  accreditation" holds the same
    // thing as a task requiring "Compliance Accreditation".
    expect(normaliseSkill("Compliance Accreditation")).toBe(normaliseSkill("compliance accreditation"));
    expect(normaliseSkill("  Compliance   Accreditation  ")).toBe(normaliseSkill("Compliance Accreditation"));
    // ...and genuinely different skills stay different.
    expect(normaliseSkill("Legal Review")).not.toBe(normaliseSkill("Quality Review"));
  });

  it("T4245 — the list refuses a duplicate however it is spelled", async () => {
    const first = await createSkill(ORG, { name: "Compliance Accreditation", category: "Authority" });
    expect(first.ok).toBe(true);

    // The unique index is case-SENSITIVE, so this has to be caught in code or
    // the catalog quietly holds the very ambiguity it was built to remove.
    const dup = await createSkill(ORG, { name: "compliance  accreditation" });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toContain("already in the list");

    expect((await listSkills(ORG)).length).toBe(1);
  });

  it("T4246 — a retired skill still RESOLVES, it just stops being offered", async () => {
    // A person or a task may already name it. Dropping it from every read would
    // silently remove a constraint from a model that still has one — and the
    // numbers would come out better than the process can achieve.
    const made = await createSkill(ORG, { name: "Underwriting" });
    expect(made.ok).toBe(true);
    if (!made.ok) return;

    await updateSkill(ORG, made.skill.id, { active: false });

    expect((await listSkills(ORG)).map((s) => s.name)).toEqual([]);                       // not offered
    expect((await listSkills(ORG, { includeInactive: true })).map((s) => s.name))
      .toEqual(["Underwriting"]);                                                          // still resolves
  });

  it("T4247 — reactivating is offered instead of a second copy", async () => {
    const made = await createSkill(ORG, { name: "Legal Review" });
    if (!made.ok) throw new Error("setup failed");
    await updateSkill(ORG, made.skill.id, { active: false });

    // Adding it again must NOT create a duplicate — that is how a catalog ends
    // up with two entries for one skill, which is the free text it replaced.
    const again = await createSkill(ORG, { name: "Legal Review" });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toContain("retired");
    expect((await listSkills(ORG, { includeInactive: true })).length).toBe(1);
  });

  it("T4248 — a skill belongs to ONE org and cannot be edited from another", async () => {
    const made = await createSkill(ORG, { name: "Data Analysis" });
    if (!made.ok) throw new Error("setup failed");

    const wrongOrg = await updateSkill("some-other-org", made.skill.id, { active: false });
    expect(wrongOrg.ok).toBe(false);
    const wrongDelete = await deleteSkill("some-other-org", made.skill.id);
    expect(wrongDelete.ok).toBe(false);

    // ...and it is untouched.
    expect((await listSkills(ORG))[0].active).toBe(true);
  });

  it("T4249 — an empty or absurd name is refused", async () => {
    for (const name of ["", "   ", "\t"]) {
      const r = await createSkill(ORG, { name });
      expect(r.ok, JSON.stringify(name)).toBe(false);
    }
    const tooLong = await createSkill(ORG, { name: "x".repeat(121) });
    expect(tooLong.ok).toBe(false);
    expect((await listSkills(ORG)).length).toBe(0);
  });
});

describe("the Skills list is reachable and gated", () => {
  const ROOT = path.resolve(__dirname, "..", "..");
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

  it("T4250 — the advertised route exists and is linked from OrgAdmin", () => {
    // A catalog nobody can open is not extendible, whatever the API can do.
    expect(fs.existsSync(path.join(ROOT, "app/(dashboard)/dashboard/admin/skills/page.tsx"))).toBe(true);
    expect(read("app/(dashboard)/dashboard/org-admin/OrgAdminClient.tsx"))
      .toContain("/dashboard/admin/skills");
  });

  it("T4251 — WRITES are org-admin gated; reads are not", () => {
    // The picker on a task needs to read the list, so read stays open to the
    // org. Write is the governed half — a list every user may extend at will is
    // the free text it replaced.
    const route = read("app/api/skills/route.ts");
    for (const verb of ["POST", "PATCH", "DELETE"]) {
      const at = route.indexOf(`export async function ${verb}(`);
      expect(at, verb).toBeGreaterThan(-1);
      const body = route.slice(at, at + 600);
      expect(body, `${verb} must call gateWrite`).toContain("gateWrite(c)");
    }
    expect(route).toContain("requireOrgAdminFor");
    // ...and the hidden-button is NOT the check.
    expect(read("app/(dashboard)/dashboard/admin/skills/page.tsx"))
      .toMatch(/a hidden button is not a permission check/i);
  });
});

describe("a SuperAdmin maintains any org's list", () => {
  const ROOT = path.resolve(__dirname, "..", "..");
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

  it("T4255 — the target org is honoured for a SuperAdmin and IGNORED for everyone else", () => {
    // A URL is not a permission. Honouring ?orgId= for a non-SuperAdmin would
    // make the address bar the access-control surface — and the failure would be
    // silent, because the screen would look exactly the same.
    const route = read("app/api/skills/route.ts");
    expect(route).toContain("isActingSuperuser");
    expect(route).toMatch(/const orgId = su && asked \? asked : activeOrgId;/);
  });

  it("T4256 — every write carries the org, so the wrong list cannot be edited", () => {
    // The heading can say one org while the request goes to another; that is
    // indistinguishable on screen from working correctly.
    const client = read("app/(dashboard)/dashboard/admin/skills/SkillsClient.tsx");
    for (const call of ["orphans=1&orgId=", "description: description || null, orgId }", "{ id, ...body, orgId }"]) {
      expect(client, call).toContain(call);
    }
    // Both delete paths, not just the plain one.
    expect((client.match(/&orgId=\$\{encodeURIComponent\(orgId\)\}/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("T4257 — the screen names the org whose list is shown", () => {
    const client = read("app/(dashboard)/dashboard/admin/skills/SkillsClient.tsx");
    expect(client).toContain("{orgName}");
    expect(client).toMatch(/isSuperAdmin && orgs\.length > 1/);
  });
});

describe("descriptions are enterable, not just seedable", () => {
  const ROOT2 = path.resolve(__dirname, "..", "..");
  const client = fs.readFileSync(path.join(ROOT2, "app/(dashboard)/dashboard/admin/skills/SkillsClient.tsx"), "utf8");

  it("T4261 — a new skill can be given a description", async () => {
    // Paul, 2026-09-12: "The Skill screen does not allow description entry."
    // It didn't — the add form took a name and a category only, so the seeded
    // descriptions were the only ones that could ever exist.
    expect(client).toContain("newDescription");
    expect(client).toMatch(/description: description \|\| null, orgId/);

    // ...and the API stores it.
    const made = await createSkill(ORG, { name: "Bench Testing", description: "Certified to run bench tests unsupervised." });
    expect(made.ok).toBe(true);
    if (made.ok) expect(made.skill.description).toBe("Certified to run bench tests unsupervised.");
  });

  it("T4262 — an existing skill's description can be edited", async () => {
    const made = await createSkill(ORG, { name: "Site Inspection" });
    if (!made.ok) throw new Error("setup failed");
    expect(made.skill.description).toBeNull();

    const edited = await updateSkill(ORG, made.skill.id, { description: "Holds a current site-safety ticket." });
    expect(edited.ok).toBe(true);
    if (edited.ok) expect(edited.skill.description).toBe("Holds a current site-safety ticket.");

    // The screen offers it, and does NOT offer a rename — skills are referenced
    // by name, so renaming would strand every place that uses one.
    expect(client).toMatch(/Edit the category and description/);
    expect(client, "a rename would strand every reference").not.toMatch(/setDraft\(\(d\) => \(\{ \.\.\.d, name:/);
  });

  it("T4263 — a skill with no description is flagged rather than looking complete", () => {
    // A blank tail reads as a short entry, not a missing one — which is how the
    // seeded list came to be half-described without anyone noticing.
    expect(client).toContain("no description");
  });
});
