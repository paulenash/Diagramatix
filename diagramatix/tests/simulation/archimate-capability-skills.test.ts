/**
 * Step 4 — reading skills from an ArchiMate model drawn Paul's way.
 *
 *   Team    Business Actor    "Data & AI Team"     Team ◇— Person (aggregation)
 *   Person  Business Actor    "Jane Smith"
 *   Job     Business Role     "Data Architect"     Person —▶ Role (assignment)
 *   Skill   Capability        "Data Modelling"     Person —— Capability (association)
 *
 * The fixture below IS his worked example — Jane and Fred, their roles, their
 * capabilities — because a specification tested against a fixture invented to
 * suit the implementation proves only that the implementation is self-consistent.
 */
import { describe, it, expect } from "vitest";
import { skillsFromArchimate } from "@/app/lib/simulation/skillsFromArchimate";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

let seq = 0;
const el = (id: string, type: string, label: string, stereotype?: string): DiagramElement => ({
  id, type, label, x: 0, y: 0, width: 120, height: 60,
  ...(stereotype ? { properties: { stereotype } } : {}),
} as DiagramElement);
const rel = (sourceId: string, targetId: string, type: string): Connector =>
  ({ id: `c${++seq}`, sourceId, targetId, type } as Connector);

const data = (elements: DiagramElement[], connectors: Connector[]): DiagramData =>
  ({ elements, connectors, viewport: { x: 0, y: 0, zoom: 1 } } as DiagramData);

/** Paul's diagram, as drawn in his message. */
function dataAiTeam(opts: { stereotypes?: boolean } = {}): DiagramData {
  const st = opts.stereotypes;
  return data(
    [
      el("team", "business-actor", "Data & AI Team"),
      el("jane", "business-actor", "Jane Smith"),
      el("fred", "business-actor", "Fred Jones"),
      el("r-arch", "business-role", "Data Architect"),
      el("r-eng", "business-role", "Data Engineer"),
      el("c-model", "strategy-capability", "Data Modelling", st ? "Individual Skill" : undefined),
      el("c-archi", "strategy-capability", "ArchiMate", st ? "Individual Skill" : undefined),
      el("c-pbi", "strategy-capability", "Power BI", st ? "Individual Skill" : undefined),
      el("c-py", "strategy-capability", "Python", st ? "Individual Skill" : undefined),
      el("c-fabric", "strategy-capability", "Fabric", st ? "Individual Skill" : undefined),
      el("c-de", "strategy-capability", "Data Engineering", st ? "Individual Skill" : undefined),
      // An ORGANISATIONAL capability, which is not a person's skill.
      el("c-org", "strategy-capability", "Enterprise Architecture", st ? "Business Capability" : undefined),
    ],
    [
      rel("team", "jane", "archi-aggregation"),
      rel("team", "fred", "archi-aggregation"),
      rel("jane", "r-arch", "archi-assignment"),
      rel("fred", "r-eng", "archi-assignment"),
      rel("jane", "c-model", "archi-association"),
      rel("jane", "c-archi", "archi-association"),
      rel("jane", "c-pbi", "archi-association"),
      rel("fred", "c-py", "archi-association"),
      rel("fred", "c-fabric", "archi-association"),
      rel("fred", "c-de", "archi-association"),
      rel("team", "c-org", "archi-association"),
    ],
  );
}

describe("ArchiMate skills — the capability pattern", () => {
  it("T4274 — a person's CAPABILITIES are their skills", () => {
    const m = skillsFromArchimate(dataAiTeam());
    expect(m.pattern).toBe("capability");

    const jane = m.people.find((p) => p.name === "Jane Smith");
    expect(jane?.skills).toEqual(["ArchiMate", "Data Modelling", "Power BI"]);
    const fred = m.people.find((p) => p.name === "Fred Jones");
    expect(fred?.skills).toEqual(["Data Engineering", "Fabric", "Python"]);
  });

  it("T4275 — a ROLE is a job, and contributes NO skill", () => {
    // The inversion. Under the old reading "Data Architect" would have BEEN a
    // skill; here it is a position Jane holds, and a task requiring "Data
    // Architect" would match nobody — correctly, because nobody has it as a
    // competency.
    const m = skillsFromArchimate(dataAiTeam());
    const jane = m.people.find((p) => p.name === "Jane Smith");
    expect(jane?.roles).toEqual(["Data Architect"]);
    expect(jane?.skills).not.toContain("Data Architect");
    expect(m.skills).not.toContain("Data Architect");
    expect(m.skills).not.toContain("Data Engineer");
  });

  it("T4276 — the TEAM is read, and is not offered as a person", () => {
    const m = skillsFromArchimate(dataAiTeam());
    expect(m.teams).toEqual([{ name: "Data & AI Team", members: ["Jane Smith", "Fred Jones"] }]);
    // "Data & AI Team" as a person would be matched against the roster, match
    // nothing, and be reported as an unmatched actor — noise that reads as a
    // fault in the model.
    expect(m.people.map((p) => p.name).sort()).toEqual(["Fred Jones", "Jane Smith"]);
  });

  it("T4277 — an organisational capability is not somebody's skill", () => {
    // Both are Capability elements; only the stereotype distinguishes them.
    const marked = skillsFromArchimate(dataAiTeam({ stereotypes: true }));
    expect(marked.skills).not.toContain("Enterprise Architecture");
    expect(marked.people.flatMap((p) => p.skills)).not.toContain("Enterprise Architecture");
  });

  it("T4278 — an unstereotyped model still yields skills, and says so", () => {
    // TOLERANCE, deliberately. Most models mark nothing; demanding the marker
    // would return zero skills from a diagram that looks perfectly correct.
    const plain = skillsFromArchimate(dataAiTeam({ stereotypes: false }));
    expect(plain.pattern).toBe("capability");
    expect(plain.skills.length).toBeGreaterThanOrEqual(6);

    // ...and when the author HAS opted in, only the marked ones count.
    const marked = skillsFromArchimate(dataAiTeam({ stereotypes: true }));
    expect(marked.skills).toEqual(["ArchiMate", "Data Engineering", "Data Modelling", "Fabric", "Power BI", "Python"]);
  });

  it("T4279 — a capability bundle resolves to what it is made of", () => {
    const d = dataAiTeam();
    d.elements.push(el("c-senior", "strategy-capability", "Senior Data Work"));
    d.connectors.push(
      rel("c-senior", "c-model", "archi-aggregation"),
      rel("c-senior", "c-py", "archi-aggregation"),
      rel("fred", "c-senior", "archi-association"),
    );
    const fred = skillsFromArchimate(d).people.find((p) => p.name === "Fred Jones");
    // The bundle itself is not a skill; its leaves are.
    expect(fred?.skills).not.toContain("Senior Data Work");
    expect(fred?.skills).toContain("Data Modelling");
  });

  it("T4280 — an association drawn the other way round still reads", () => {
    // An Association carries no direction in meaning. A model with the
    // capability as source is not wrong, and silently yielding nothing for it
    // would be the worst kind of failure: a correct diagram, an empty result.
    const d = dataAiTeam();
    d.connectors = d.connectors.map((c) =>
      c.sourceId === "jane" && c.targetId === "c-pbi" ? { ...c, sourceId: "c-pbi", targetId: "jane" } : c);
    const jane = skillsFromArchimate(d).people.find((p) => p.name === "Jane Smith");
    expect(jane?.skills).toContain("Power BI");
  });

  it("T4281 — a legacy Role-as-skill model still reads, and is LABELLED as legacy", () => {
    // Customers have models drawn the old way; an upgrade must not invalidate
    // them. But which reading answered has to be visible, or a diagram drawn
    // half in each yields whichever half the code happened to prefer.
    const legacy = data(
      [
        el("a", "business-actor", "Grace Oduya"),
        el("r", "business-role", "Compliance Accreditation"),
        el("w", "business-process", "Compliance & vetting review"),
      ],
      [rel("a", "r", "archi-assignment"), rel("r", "w", "archi-assignment")],
    );
    const m = skillsFromArchimate(legacy);
    expect(m.pattern).toBe("role-legacy");
    expect(m.people[0].skills).toEqual(["Compliance Accreditation"]);
    expect(m.work[0].requiredSkills).toEqual(["Compliance Accreditation"]);
  });

  it("T4282 — the capability pattern reads NO task requirements", () => {
    // Paul, step 5: the user chooses what a task requires, from the master
    // Skills list. The diagram supplies who can do what, not what the work
    // needs — so a fill can never overwrite a deliberate choice.
    const m = skillsFromArchimate(dataAiTeam());
    expect(m.work).toEqual([]);
  });
});
