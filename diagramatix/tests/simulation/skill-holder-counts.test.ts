/**
 * "Can anyone on this team actually do it?" — asked where the skill is CHOSEN.
 *
 * Paul, 2026-09-12, on the skill hierarchy: a bundle flattens to its leaves and
 * the bundle NAME is then held by nobody, so requiring it on a task means the
 * work can never start.
 *
 * That is one instance of a general problem. A requirement nobody can satisfy
 * has several causes that look identical on screen — a bundle name, a typo, a
 * retired skill, a skill held only by people on a DIFFERENT team, the last
 * holder having left — and every one of them was discoverable only by running
 * readiness. The holder count puts all of them at the moment of choice.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { skillsFromArchimate } from "@/app/lib/simulation/skillsFromArchimate";
import { STARTER_EXAMPLES } from "@/app/lib/simulation/exampleSeeds";
import type { DiagramData } from "@/app/lib/diagram/types";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("holder counts on a required skill", () => {
  it("T4294 — the count follows the team the ENGINE would use, not the one typed on the task", () => {
    // A task with no team of its own inherits its lane's. A count taken against
    // a different team than the engine resolves is worse than no count: it would
    // read as reassurance while the run did something else.
    const panel = read("app/components/simulation/SimDataPanel.tsx");
    expect(panel).toContain("const teamOf = (el: DiagramElement)");
    expect(panel).toMatch(/inherits its lane/i);
    // It walks UP through nested lanes/pools rather than looking one level.
    expect(panel).toContain("parent.parentId ? elById.get(parent.parentId)");
    expect(panel).toContain("holders={counts}");
  });

  it("T4295 — no resolvable team means NO count, rather than a count of nought", () => {
    // "Nobody can do this" and "nobody has said who would" are different facts,
    // and showing the first when the second is true invents a problem.
    const panel = read("app/components/simulation/SimDataPanel.tsx");
    expect(panel).toContain("const counts = tm ? teamSkills[tm] : undefined;");
    const picker = read("app/components/simulation/SkillPicker.tsx");
    // The zero styling is gated on holders being SUPPLIED, not on the value.
    expect(picker).toContain("holders !== undefined && (held ?? 0) === 0");
  });

  it("T4296 — the count is shown before choosing, not only after", () => {
    // A warning that appears once the damage is done is a worse warning.
    const picker = read("app/components/simulation/SkillPicker.tsx");
    expect(picker).toContain('" (0 — nobody)"');
    expect(picker, "the chip carries it too").toContain("{nobody ? \"0\" : held}");
  });

  it("T4297 — a BUNDLE would count zero, which is exactly the trap", () => {
    // The shipped operating model's "Accredited Vetting" aggregates two skills.
    // People hold its LEAVES; nobody holds the bundle name. So a requirement for
    // it counts nought against every team — which is the warning.
    const pkg = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard")!.package;
    const archi = pkg.diagrams.find((d) => d.key === "hire-operating-model")!;
    const model = skillsFromArchimate(archi.data as DiagramData);

    expect(model.bundles, "the reader must report the bundle").toContain("Accredited Vetting");

    // Nobody is recorded as holding it...
    expect(model.people.flatMap((p) => p.skills)).not.toContain("Accredited Vetting");
    // ...though its leaves are held, which is why the flattening is useful.
    const grace = model.people.find((p) => p.name === "Grace Oduya")!;
    expect(grace.skills).toEqual(["Compliance Accreditation", "Onboarding Administration"]);

    // The count the picker would show for the bundle, on the team that holds
    // its parts: nought.
    const hr = pkg.teams.find((t) => t.name === "HR Operations")!;
    const counts: Record<string, number> = {};
    for (const m of hr.members ?? []) for (const s of m.skills) counts[s] = (counts[s] ?? 0) + 1;
    expect(counts["Accredited Vetting"] ?? 0).toBe(0);
    expect(counts["Compliance Accreditation"]).toBe(2);
  });

  it("T4298 — the fill NAMES its bundles rather than flattening them silently", () => {
    const route = read("app/api/projects/[id]/simulation-teams/fill-skills/route.ts");
    expect(route).toContain("bundles: model.bundles");
    const panel = read("app/components/simulation/SkillsFillPanel.tsx");
    expect(panel).toMatch(/holding its PARTS, not the bundle itself/);
    expect(panel, "and says what happens if you require one").toMatch(/never start/);
  });
});
