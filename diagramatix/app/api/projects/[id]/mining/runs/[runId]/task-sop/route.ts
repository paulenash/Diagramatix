/**
 * GET /api/projects/:id/mining/runs/:runId/task-sop?format=docx|pdf|md
 * → the Standard Operating Procedure for a mined TASK routine.
 *
 * Item 08: the task SOP used to be markdown rendered in the browser and
 * downloaded as a `.md` — the only document in the product that did not go out
 * through `buildDocx` like every other SOP. Somebody who is handed one cannot
 * tell it came from the same tool.
 *
 * It is also, deliberately, the server boundary Phase 0.1 could not find. The
 * Automation tab computes in the browser from variants the run fetch already
 * returns, so there was nothing to gate; a route that PRODUCES the artefact is
 * something to gate, and `task-mining` is enforced here.
 *
 * Stated rather than implied: this closes the artefact, not the whole tab. The
 * read-only Automation view still renders for anyone who can open the run,
 * because its inputs are the same variants every other mining feature needs.
 * Moving that computation server-side is a bigger change than this phase, and
 * pretending otherwise would be worse than saying so.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";
import { buildDocx } from "@/app/lib/documents/exportDocx";
import { docxToPdf } from "@/app/lib/documents/docxToPdf";
import { buildTaskProcedure } from "@/app/lib/mining/taskMining/procedure";
import { isTaskRun } from "@/app/lib/mining/taskMining/insights";
import type { Variant } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string; runId: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id, runId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "docx";
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const userId = session?.user?.id ?? "";
  const fg = await gateFeature(userId, "processMining");
  if (fg) return fg;
  // The tier key that has been declared and enforced nowhere since it shipped.
  const tg = await gateFeature(userId, "task-mining");
  if (tg) return tg;

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const variants = (run.variants as unknown as Variant[]) ?? [];
  if (!variants.length) return NextResponse.json({ error: "This run has no variants to write a procedure from." }, { status: 400 });
  if (!isTaskRun(variants)) {
    // Refusing is the honest answer: `buildTaskProcedure` describes a UI routine
    // (apps, copy/paste, screens) and would produce a confident, wrong document
    // for an ordinary business process.
    return NextResponse.json({ error: "This run is not a task (UI-step) log, so there is no routine to write up. The SOP generator for business processes is on the diagram, not the run." }, { status: 400 });
  }

  const md = buildTaskProcedure(variants, run.name);
  const safe = run.name.replace(/[^a-z0-9\-_. ]/gi, "_").slice(0, 80) || "task";

  if (format === "md") {
    return new NextResponse(md, {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${safe}-sop.md"` },
    });
  }

  // The markdown already carries its own `# ` title; buildDocx takes chapters,
  // so the body goes in as one section under the run's name.
  const body = md.replace(/^#\s+.*\n+/, "");
  const docx = await buildDocx(
    [{ title: `Standard Operating Procedure — ${run.name}`, sections: [{ heading: null, bodyMarkdown: body }] }],
    { docTitle: `Standard Operating Procedure — ${run.name}` },
  );

  if (format === "pdf") {
    const pdf = await docxToPdf(docx);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${safe}-sop.pdf"` },
    });
  }

  return new NextResponse(new Uint8Array(docx), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safe}-sop.docx"`,
    },
  });
}
