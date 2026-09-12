/**
 * The business case for a study.
 *
 *  POST — compute it and (when the org allows AI) narrate it. Body names the two
 *         sides: `{ baselineScenarioId, compareScenarioId }` or two run ids.
 *  GET ?format=docx|xlsx|pdf — the same case as a document. Word via buildDocx,
 *         PDF via docxToPdf (LibreOffice on the host), Excel via the xlsx writer.
 *  PUT  — save the study's inputs (implementation cost, annual volume, optional
 *         cost of delay per hour). Edit access; the others need only view.
 *
 * Mirrors the assess route for AI gating and the Miner's analysis-export for the
 * document formats.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { orgPolicyAllows, orgRedactionEnabled } from "@/app/lib/auth/orgPolicy";
import { makeRedactor } from "@/app/lib/ai/redaction";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { enterAiContext, AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";
import { buildDocx } from "@/app/lib/documents/exportDocx";
import { docxToPdf } from "@/app/lib/documents/docxToPdf";
import { buildXlsx } from "@/app/lib/riskControls/xlsx";
import { buildBusinessCaseChapters, buildBusinessCaseSheets } from "@/app/lib/simulation/businessCaseDoc";
import {
  buildBusinessCaseFacts, generateBusinessCaseNarrative, summariseBusinessCase,
  type BusinessCaseInputs,
} from "@/app/lib/simulation/facts/businessCase";
import type { RunMetrics } from "@/app/lib/simulation/results";

type Params = { params: Promise<{ id: string; studyId: string }> };
type Side = { name: string; metrics: RunMetrics };

async function study(studyId: string, projectId: string) {
  return prisma.simulationStudy.findFirst({
    where: { id: studyId, projectId },
    select: { id: true, name: true, businessCase: true },
  });
}

/** Latest completed run of a scenario in this study. */
async function latest(scenarioId: string, studyId: string, projectId: string): Promise<Side | null> {
  const sc = await prisma.simulationScenario.findFirst({
    where: { id: scenarioId, studyId, study: { projectId } },
    select: { name: true },
  });
  if (!sc) return null;
  const run = await prisma.simulationRun.findFirst({
    where: { scenarioId, error: null }, orderBy: { startedAt: "desc" }, select: { metrics: true },
  });
  if (!run?.metrics) return null;
  return { name: sc.name, metrics: run.metrics as unknown as RunMetrics };
}

/** A specific saved run, labelled by its own name. */
async function byRun(runId: string, studyId: string, projectId: string): Promise<Side | null> {
  const run = await prisma.simulationRun.findUnique({
    where: { id: runId },
    include: { scenario: { include: { study: { select: { id: true, projectId: true } } } } },
  });
  if (!run || run.error || !run.metrics) return null;
  if (run.scenario.studyId !== studyId || run.scenario.study.projectId !== projectId) return null;
  return { name: run.name || run.scenario.name, metrics: run.metrics as unknown as RunMetrics };
}

/** Resolve the two sides from a body naming either scenarios or runs. */
async function sides(body: Record<string, unknown>, studyId: string, projectId: string) {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const bRun = str(body.baselineRunId), cRun = str(body.compareRunId);
  if (bRun && cRun) return { base: await byRun(bRun, studyId, projectId), tobe: await byRun(cRun, studyId, projectId) };
  const bSc = str(body.baselineScenarioId), cSc = str(body.compareScenarioId);
  if (!bSc || !cSc) return { base: null, tobe: null };
  return { base: await latest(bSc, studyId, projectId), tobe: await latest(cSc, studyId, projectId) };
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  const { id, studyId } = await params;
  let orgId: string | null = null;
  try {
    const ctx = await requireProjectAccess(session, await cookies(), id, "view");
    orgId = ctx.projectOrgId ?? null;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const s = await study(studyId, id);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { base, tobe } = await sides(body, studyId, id);
  if (!base || !tobe) {
    return NextResponse.json({ error: "Both sides need a completed run before a business case can be built." }, { status: 400 });
  }

  const inputs = (s.businessCase ?? {}) as unknown as BusinessCaseInputs;
  const facts = buildBusinessCaseFacts(base.metrics, tobe.metrics, base.name, tobe.name, s.name, inputs);

  const model = await getAiGenerateModel();
  const apiKey = aiApiKey(model);
  const aiOn = (await orgPolicyAllows(session, "allowAi")) && !!apiKey;
  if (!aiOn) return NextResponse.json({ facts, narrative: summariseBusinessCase(facts), deterministic: true });

  const redactor = (await orgRedactionEnabled(session))
    ? makeRedactor([facts.studyName, facts.base.name, facts.tobe.name])
    : undefined;
  enterAiContext({ userId: session?.user?.id ?? null, orgId, invocationPoint: AI_INVOCATION_POINTS.SimulationBusinessCase });
  const result = await generateBusinessCaseNarrative({ apiKey: apiKey!, facts }, redactor);
  if (!result.ok) {
    // Losing the narration must not lose the case.
    return NextResponse.json({ facts, narrative: summariseBusinessCase(facts), deterministic: true, aiError: result.error });
  }
  return NextResponse.json({ facts, narrative: result.narrative, model: result.model, truncated: result.truncated ?? false });
}

/** GET ?format=docx|xlsx|pdf&baselineScenarioId=…&compareScenarioId=… */
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id, studyId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const s = await study(studyId, id);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "docx";
  const q = Object.fromEntries(url.searchParams.entries());
  const { base, tobe } = await sides(q, studyId, id);
  if (!base || !tobe) {
    return NextResponse.json({ error: "Both sides need a completed run before a business case can be built." }, { status: 400 });
  }

  const inputs = (s.businessCase ?? {}) as unknown as BusinessCaseInputs;
  const facts = buildBusinessCaseFacts(base.metrics, tobe.metrics, base.name, tobe.name, s.name, inputs);
  // The document carries the DETERMINISTIC narrative: a downloaded artefact must
  // be reproducible, and must not depend on an AI call succeeding at the moment
  // someone clicks Export.
  const narrative = summariseBusinessCase(facts);
  const safe = s.name.replace(/[^a-z0-9\-_. ]/gi, "_").slice(0, 80) || "study";

  if (format === "xlsx") {
    const buf = await buildXlsx(buildBusinessCaseSheets(facts));
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safe}-business-case.xlsx"`,
      },
    });
  }

  const docx = await buildDocx(buildBusinessCaseChapters(facts, narrative), { docTitle: `Business case — ${s.name}` });
  if (format === "pdf") {
    try {
      const pdf = await docxToPdf(Buffer.from(docx));
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${safe}-business-case.pdf"` },
      });
    } catch {
      return NextResponse.json({ error: "PDF conversion needs LibreOffice on the host — download the Word version instead." }, { status: 500 });
    }
  }
  return new NextResponse(new Uint8Array(docx), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safe}-business-case.docx"`,
    },
  });
}

/** PUT — save the study's business-case inputs. */
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, studyId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!(await study(studyId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  // A blank field CLEARS the input rather than storing 0 — "not supplied" and
  // "zero" mean different things here, and the case reports them differently.
  const num = (v: unknown): number | undefined => {
    if (v === null || v === undefined || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const inputs: BusinessCaseInputs = {};
  const impl = num(body.implementationCost); if (impl !== undefined) inputs.implementationCost = impl;
  const vol = num(body.annualVolume); if (vol !== undefined) inputs.annualVolume = vol;
  const delay = num(body.costOfDelayPerHour); if (delay !== undefined) inputs.costOfDelayPerHour = delay;

  // Prisma 7 omits JSON fields from model update inputs — write via raw SQL.
  await pgPool.query('UPDATE "SimulationStudy" SET "businessCase" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(inputs), studyId]);
  return NextResponse.json({ businessCase: inputs });
}
