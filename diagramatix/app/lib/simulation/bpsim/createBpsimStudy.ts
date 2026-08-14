/**
 * Create the project-level simulation setup for a freshly-imported BPSim .bpmn:
 * the team/calendar library the file describes, plus a study rooted on the new
 * diagram whose baseline scenario carries the file's own ScenarioParameters.
 *
 * Split out of the import route so it is testable on its own and so the route
 * keeps to request handling. Teams and studies are project-scoped, so this only
 * applies when the imported diagram landed in a project.
 */

import { prisma } from "@/app/lib/db";
import { adoptLibraryInto } from "../adoptPackage";
import { bpsimLibraryFrom, bpsimRunConfig } from "./bpsimProject";
import type { BpsimScenario } from "./types";
import type { DiagramData } from "@/app/lib/diagram/types";

export interface BpsimStudyResult {
  studyId: string;
  study: string;
  teams: number;
}

export async function createBpsimStudy(opts: {
  projectId: string;
  diagramId: string;
  /** Study name — the imported diagram's final name. */
  name: string;
  /** The diagram AFTER applyBpsimToDiagram, so team refs are resolved. */
  data: DiagramData;
  scenario: BpsimScenario;
  createdById?: string | null;
}): Promise<BpsimStudyResult> {
  const { projectId, diagramId, name, data, scenario, createdById } = opts;
  const library = bpsimLibraryFrom(data, scenario);

  return prisma.$transaction(async (tx) => {
    // Reuse-by-name, so re-importing the same file into a project doesn't
    // accumulate duplicate teams alongside the ones already there.
    await adoptLibraryInto(tx, library, projectId);
    const study = await tx.simulationStudy.create({
      data: { name, projectId, createdById: createdById ?? null },
    });
    await tx.simulationStudyRoot.create({ data: { studyId: study.id, diagramId } });
    await tx.simulationScenario.create({
      data: {
        name: scenario.name?.trim() || "Baseline",
        studyId: study.id,
        isBaseline: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runConfig: bpsimRunConfig(scenario) as any,
      },
    });
    return { studyId: study.id, study: name, teams: library.teams.length };
  });
}
