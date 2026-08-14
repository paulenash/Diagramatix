/**
 * BPSim .bpmn import → ready-to-run project setup. Proves the DB half of the
 * import: the file's resources become the project team library and its
 * ScenarioParameters become a study with a baseline scenario rooted on the
 * imported diagram. Runs against the test DB.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { importBpmnXml } from "@/app/lib/diagram/bpmn/importBpmnXml";
import { parseBpsimScenarios } from "@/app/lib/simulation/bpsim/importBpsim";
import { applyBpsimToDiagram } from "@/app/lib/simulation/bpsim/applyBpsimToDiagram";
import { richestScenario } from "@/app/lib/simulation/bpsim/bpsimProject";
import { createBpsimStudy } from "@/app/lib/simulation/bpsim/createBpsimStudy";

const FIXTURE = "Technical Support Process v2.0.0.bpmn";
const read = (f: string) => readFileSync(join(process.cwd(), "tests/simulation/fixtures", f), "utf8");

/** Mirror what the import route does, minus the HTTP handling. */
async function importFixture(userId: string, orgId: string, projectId: string) {
  const xml = read(FIXTURE);
  const parsed = await importBpmnXml(xml, FIXTURE);
  const scenario = richestScenario(parseBpsimScenarios(xml, "minute"))!;
  const data = applyBpsimToDiagram(parsed.data, parsed.idMap, scenario);
  const diagram = await prisma.diagram.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { name: "Tech Support", type: "bpmn", userId, orgId, projectId, data: data as any },
  });
  const result = await createBpsimStudy({
    projectId, diagramId: diagram.id, name: "Tech Support", data, scenario, createdById: userId,
  });
  return { diagram, scenario, result };
}

describe("BPSim import → runnable project setup", () => {
  beforeEach(async () => { await truncateAll(); });

  it("creates the team library, study, root and baseline scenario", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    const { diagram, scenario, result } = await importFixture(user.id, org.id, project.id);

    // Team library: one pool per resource the file names.
    const teams = await prisma.simulationTeam.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } });
    expect(teams.map((t) => t.name)).toEqual([
      "resource_1st_Level_Techical_Support_Agent",
      "resource_2nd_Level_Techical_Support_Agent",
      "resource_Front_Office",
      "resource_Supplier",
    ]);
    expect(result.teams).toBe(teams.length);

    // Study rooted on the imported diagram, with one baseline scenario.
    const studies = await prisma.simulationStudy.findMany({
      where: { projectId: project.id }, include: { roots: true, scenarios: true },
    });
    expect(studies).toHaveLength(1);
    expect(studies[0].roots.map((r) => r.diagramId)).toEqual([diagram.id]);
    expect(studies[0].scenarios).toHaveLength(1);
    expect(studies[0].scenarios[0].isBaseline).toBe(true);

    // The baseline carries the file's own run parameters where it states them.
    // Technical Support states a horizon but no @replication, so replications
    // falls back to the default rather than to NaN.
    const cfg = studies[0].scenarios[0].runConfig as unknown as { horizon: number; replications: number; warmUp: number; clockUnit: string };
    expect(cfg.clockUnit).toBe("minute");
    expect(scenario.replication).toBeUndefined();
    expect(cfg.replications).toBe(8);
    expect(cfg.horizon).toBeGreaterThan(0);
    expect(Number.isFinite(cfg.horizon)).toBe(true);
    expect(cfg.warmUp).toBeLessThanOrEqual(cfg.horizon / 2);
  });

  it("re-importing the same file does not duplicate the team library", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });

    await importFixture(user.id, org.id, project.id);
    await importFixture(user.id, org.id, project.id);

    // Teams are reused by name; each import still gets its own study.
    const teams = await prisma.simulationTeam.findMany({ where: { projectId: project.id } });
    expect(teams).toHaveLength(4);
    const studies = await prisma.simulationStudy.findMany({ where: { projectId: project.id } });
    expect(studies).toHaveLength(2);
  });

  it("annotates the diagram itself with the file's timings", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    const { diagram } = await importFixture(user.id, org.id, project.id);

    const row = await prisma.diagram.findUnique({ where: { id: diagram.id } });
    const data = row!.data as unknown as { elements: Array<{ properties?: Record<string, unknown> }> };
    // At least one element carries simulation params sourced from BPSim — the
    // import is annotated, not just drawn.
    const annotated = data.elements.filter((e) => e.properties?.sim);
    expect(annotated.length).toBeGreaterThan(0);
  });
});
