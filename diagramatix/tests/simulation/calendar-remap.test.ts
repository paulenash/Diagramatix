/**
 * A source's operating-hours calendar must survive a copy.
 *
 * `sim.calendarId` is a bare project-scoped reference. Adopting or restoring a
 * project mints NEW calendar rows, and nothing used to rewrite that reference —
 * so it dangled, and because an unresolved calendar counts as ALWAYS OPEN, the
 * copy silently ran arrivals 24/7 instead of in business hours. Same model on
 * the face of it, different answers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { captureProjectPackage } from "@/app/lib/simulation/captureProject";
import { adoptPackage } from "@/app/lib/simulation/adoptPackage";
import { remapCalendarRefs, calendarResolver, calendarRefsToNames } from "@/app/lib/simulation/calendarRefs";
import { buildUserBackup, restoreUserBackup } from "@/app/lib/backup";
import type { DiagramData } from "@/app/lib/diagram/types";

const BUSINESS_HOURS = { intervals: [0, 1, 2, 3, 4].map((day) => ({ day, start: "09:00", end: "17:00" })) };

/** A project whose start event only admits work during business hours. */
async function seedWithSourceCalendar(userId: string, orgId: string) {
  const project = await prisma.project.create({ data: { name: "Calendared", userId, orgId } });
  const calendar = await prisma.simulationCalendar.create({ data: { name: "Business Hours", projectId: project.id } });
  await prisma.$executeRawUnsafe(
    'UPDATE "SimulationCalendar" SET pattern = $1::jsonb WHERE id = $2',
    JSON.stringify(BUSINESS_HOURS), calendar.id,
  );
  await prisma.simulationTeam.create({ data: { name: "Processors", projectId: project.id, capacity: 2, calendarId: calendar.id } });

  const data = {
    elements: [
      { id: "start", type: "start-event", label: "In", x: 0, y: 0, width: 40, height: 40,
        properties: { sim: { arrival: { kind: "fixed", value: 10 }, calendarId: calendar.id } } },
      { id: "t1", type: "task", label: "Work", x: 100, y: 0, width: 100, height: 60,
        properties: { sim: { cycleTime: { kind: "fixed", value: 5 }, teamId: "Processors" } } },
      { id: "end", type: "end-event", label: "Out", x: 250, y: 0, width: 40, height: 40, properties: {} },
    ],
    connectors: [
      { id: "c1", sourceId: "start", targetId: "t1", waypoints: [] },
      { id: "c2", sourceId: "t1", targetId: "end", waypoints: [] },
    ],
  };
  const diagram = await prisma.diagram.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { name: "Calendared Process", type: "bpmn", userId, orgId, projectId: project.id, data: data as any },
  });
  const study = await prisma.simulationStudy.create({ data: { name: "Study", projectId: project.id, createdById: userId } });
  await prisma.simulationStudyRoot.create({ data: { studyId: study.id, diagramId: diagram.id } });
  await prisma.simulationScenario.create({ data: { name: "Baseline", studyId: study.id, isBaseline: true } });
  return { project, calendar, diagram, study };
}

/** The calendar id a project's start event currently points at. */
async function sourceCalendarRef(projectId: string): Promise<string | undefined> {
  const d = await prisma.diagram.findFirst({ where: { projectId } });
  const data = d!.data as unknown as { elements: Array<{ id: string; properties?: { sim?: { calendarId?: string } } }> };
  return data.elements.find((e) => e.id === "start")?.properties?.sim?.calendarId;
}

describe("calendarRefs (pure)", () => {
  const data = {
    elements: [
      { id: "s", properties: { sim: { calendarId: "cal-old" } } },
      { id: "t", properties: { sim: { cycleTime: { kind: "fixed", value: 1 } } } },
    ],
    connectors: [],
  } as unknown as DiagramData;

  it("resolves by name first, then by the captured original id", () => {
    const resolve = calendarResolver(new Map([["Business Hours", "new-1"]]), new Map([["cal-old", "new-2"]]));
    expect(resolve("Business Hours")).toBe("new-1");
    expect(resolve("cal-old")).toBe("new-2");
    expect(resolve("unknown")).toBeUndefined();
  });

  it("rewrites only the elements that reference a calendar", () => {
    const r = remapCalendarRefs(data, calendarResolver(new Map(), new Map([["cal-old", "new-2"]])));
    expect(r.changed).toBe(1);
    const els = r.data.elements as Array<{ properties?: { sim?: { calendarId?: string } } }>;
    expect(els[0].properties!.sim!.calendarId).toBe("new-2");
    expect(els[1].properties!.sim).toEqual({ cycleTime: { kind: "fixed", value: 1 } });
  });

  it("leaves the data object untouched when nothing resolves", () => {
    const r = remapCalendarRefs(data, () => undefined);
    expect(r.changed).toBe(0);
    expect(r.data).toBe(data); // same object — the caller can skip the write
  });

  it("converts ids to names for a portable package", () => {
    const named = calendarRefsToNames(data, new Map([["cal-old", "Business Hours"]]));
    const els = named.elements as Array<{ properties?: { sim?: { calendarId?: string } } }>;
    expect(els[0].properties!.sim!.calendarId).toBe("Business Hours");
  });
});

describe("source calendar survives an adopt", () => {
  beforeEach(async () => { await truncateAll(); });

  it("captures the reference by name, not by a foreign id", async () => {
    const { user, org } = await createUserWithOrg();
    const { project, study, calendar } = await seedWithSourceCalendar(user.id, org.id);

    const { pkg } = await captureProjectPackage(project.id, study.id);
    const el = (pkg.diagrams[0].data as unknown as { elements: Array<{ id: string; properties?: { sim?: { calendarId?: string } } }> })
      .elements.find((e) => e.id === "start");
    // The package is self-describing: the source points at "Business Hours",
    // not at an id that means nothing outside the original project.
    expect(el!.properties!.sim!.calendarId).toBe("Business Hours");
    expect(el!.properties!.sim!.calendarId).not.toBe(calendar.id);
    // The original id rides along as the backup-restore fallback.
    expect(pkg.calendars?.[0].id).toBe(calendar.id);
  });

  it("re-points the source at the adopted project's own calendar", async () => {
    const { user, org } = await createUserWithOrg();
    const { project, study, calendar } = await seedWithSourceCalendar(user.id, org.id);
    const { pkg } = await captureProjectPackage(project.id, study.id);

    const { projectId: newProjectId } = await adoptPackage(pkg, {
      userId: user.id, orgId: org.id, ownerName: "T", projectName: "Adopted",
    });

    const newCal = await prisma.simulationCalendar.findFirst({ where: { projectId: newProjectId } });
    expect(newCal).toBeTruthy();
    expect(newCal!.id).not.toBe(calendar.id);       // a genuinely new row
    expect(newCal!.name).toBe("Business Hours");

    const ref = await sourceCalendarRef(newProjectId);
    // The whole point: it resolves, so the copy still opens 09:00–17:00 rather
    // than silently running 24/7.
    expect(ref).toBe(newCal!.id);
    expect(newCal!.pattern).toEqual(BUSINESS_HOURS);
  });
});

describe("source calendar survives a scoped backup restore", () => {
  beforeEach(async () => { await truncateAll(); });

  it("re-points the source, whose diagram came from a raw backup row", async () => {
    const { user, org } = await createUserWithOrg();
    const { calendar } = await seedWithSourceCalendar(user.id, org.id);

    const bytes = await buildUserBackup(user.id, "test");
    await restoreUserBackup(bytes, user.id, org.id, "Owner");

    const restored = await prisma.project.findFirst({
      where: { userId: user.id, name: { contains: "(restored)" } }, orderBy: { createdAt: "desc" },
    });
    expect(restored).toBeTruthy();

    const newCal = await prisma.simulationCalendar.findFirst({ where: { projectId: restored!.id } });
    expect(newCal).toBeTruthy();
    expect(newCal!.id).not.toBe(calendar.id);

    // This path rebuilds diagrams from raw rows still holding the ORIGINAL id,
    // so it is the captured-id fallback that has to do the work here.
    expect(await sourceCalendarRef(restored!.id)).toBe(newCal!.id);
  });
});
