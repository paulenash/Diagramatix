/**
 * Capture a project's simulation into a NEW example catalog entry (SuperAdmin).
 * The authoring path: build a simulation in a project with the full Simulator
 * UI, then snapshot the study + its root diagrams + the team library + the
 * scenarios into a portable ExamplePackage. Created as a DRAFT — edit metadata
 * + publish from the catalog editor.
 *
 * This is the inverse of adopt; together they give the change → copy → extend
 * round-trip (adopt an example, modify it in a project, capture it back as a
 * new example).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import type { DiagramData } from "@/app/lib/diagram/types";
import {
  validateExamplePackage,
  type ExamplePackage,
  type ExampleDiagram,
  type ExampleScenario,
} from "@/app/lib/simulation/examplePackage";
import type { ScenarioRunConfig } from "@/app/lib/simulation/types";
import type { OverrideSet } from "@/app/lib/simulation/overrides";

const DIFFICULTIES = new Set(["intro", "core", "advanced"]);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "example";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { projectId, studyId } = body;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!projectId || !studyId) return NextResponse.json({ error: "projectId + studyId required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  // Study must belong to the project; pull its roots + scenarios.
  const study = await prisma.simulationStudy.findFirst({
    where: { id: studyId, projectId },
    include: { roots: true, scenarios: { orderBy: { createdAt: "asc" } } },
  });
  if (!study) return NextResponse.json({ error: "Study not found in project" }, { status: 404 });

  // Capture the root diagrams (what the portfolio run assembles) plus any
  // process-variant diagrams the scenarios pin (As-is vs To-be), so the
  // comparison pairing survives. The diagram id is the package-local key; adopt
  // remaps it to a fresh id.
  const rootIds = study.roots.map((r) => r.diagramId);
  const scenarioVariantIds = (id: unknown): string[] =>
    Array.isArray(id) ? (id as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const variantIds = study.scenarios.flatMap((s) => scenarioVariantIds(s.variantRootIds));
  const captureIds = Array.from(new Set([...rootIds, ...variantIds]));
  const diagramRows = await prisma.diagram.findMany({ where: { id: { in: captureIds } }, select: { id: true, name: true, type: true, data: true } });
  const capturedKeys = new Set(diagramRows.map((d) => d.id));
  const diagrams: ExampleDiagram[] = diagramRows.map((d) => ({
    key: d.id, name: d.name, type: d.type || "bpmn", data: (d.data ?? {}) as unknown as DiagramData,
  }));

  const teamRows = await prisma.simulationTeam.findMany({ where: { projectId }, select: { name: true, capacity: true, costPerHour: true, efficiency: true, calendarId: true } });
  // Working calendars: carry the library + resolve each team's calendarId → name
  // (the portable reference) so an adopt re-creates them.
  const calendarRows = await prisma.simulationCalendar.findMany({ where: { projectId }, select: { id: true, name: true, pattern: true } });
  const calendarIdToName = new Map(calendarRows.map((c) => [c.id, c.name]));
  const calendars = calendarRows.map((c) => ({ name: c.name, pattern: (c.pattern ?? { intervals: [] }) as unknown as import("@/app/lib/simulation/types").WorkCalendar }));
  const teams = teamRows.map((t) => ({
    name: t.name, capacity: t.capacity, costPerHour: t.costPerHour, efficiency: t.efficiency,
    ...(t.calendarId && calendarIdToName.has(t.calendarId) ? { calendarName: calendarIdToName.get(t.calendarId) } : {}),
  }));

  const scenarios: ExampleScenario[] = study.scenarios.map((s) => {
    const variantRootKeys = scenarioVariantIds(s.variantRootIds).filter((k) => capturedKeys.has(k));
    return {
      name: s.name,
      isBaseline: s.isBaseline,
      runConfig: (s.runConfig ?? {}) as unknown as ScenarioRunConfig,
      overrides: (s.overrides ?? {}) as unknown as OverrideSet,
      ...(variantRootKeys.length ? { variantRootKeys } : {}),
    };
  });

  const pkg: ExamplePackage = {
    version: 1,
    teams,
    ...(calendars.length ? { calendars } : {}),
    diagrams,
    study: { name: study.name, rootKeys: rootIds },
    scenarios,
  };
  const errs = validateExamplePackage(pkg);
  if (errs.length) return NextResponse.json({ error: `Captured package invalid: ${errs.join("; ")}` }, { status: 400 });

  let slug = slugify(title);
  for (let i = 2; await prisma.simulationExample.findUnique({ where: { slug } }); i++) slug = `${slugify(title)}-${i}`;
  const max = await prisma.simulationExample.aggregate({ _max: { sortOrder: true } });

  const example = await prisma.simulationExample.create({
    data: {
      slug, title,
      concept: typeof body.concept === "string" ? body.concept : "",
      description: typeof body.description === "string" ? body.description : "",
      difficulty: DIFFICULTIES.has(body.difficulty) ? body.difficulty : "core",
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      createdById: session?.user?.id ?? null,
      published: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      package: pkg as any,
    },
  });
  return NextResponse.json({ example }, { status: 201 });
}
