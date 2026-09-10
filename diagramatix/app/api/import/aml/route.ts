/**
 * POST /api/import/aml
 *
 * ARIS Markup Language import. Every eEPC in the file becomes its own EPC
 * diagram; anything else in the export — organisational charts, data models —
 * is named in the warnings and skipped rather than mangled into a process.
 *
 * Mirrors /api/import/bpmn in form-field surface and response shape so the
 * editor drives both with the same status modal.
 *
 * Form fields:
 *  - file (required): the `.aml` / `.xml` export.
 *  - projectId (optional): place the new diagrams in this project.
 *  - name (optional): override the name of the FIRST imported model. Later
 *    models keep the names ARIS gave them, because an export of forty EPCs
 *    named after the file would be useless.
 *
 * What it reports rather than swallows: object types it does not model (a real
 * repository is full of KPIs, risks and products), connection codes it has not
 * seen before, and any rule the layout could not take at face value. A
 * migration that quietly discards half a customer's model is worse than one
 * that says what it left behind.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { uploadSizeError } from "@/app/lib/uploadLimit";
import { importAml, epcModelToPlan } from "@/app/lib/diagram/aris/importAml";
import { layoutEpcDiagram } from "@/app/lib/diagram/layoutEpc";
import { collectLayoutDiagnostics } from "@/app/lib/diagram/layoutDiagnosticLog";
import type { LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";
import { validateDiagramData } from "@/app/lib/diagram/validateDiagram";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { gateLimit, gateElementCount, recordUsage } from "@/app/lib/subscription-route";
import { requireRole, WRITE_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (await isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only while impersonating" }, { status: 403 });
  }

  let orgId: string | null = null;
  try {
    ({ orgId } = await requireRole(session as never, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const tooBig = uploadSizeError(file); // IO-01
  if (tooBig) return NextResponse.json({ error: tooBig }, { status: 413 });

  const projectId = (form.get("projectId") as string | null) || null;
  const nameOverride = ((form.get("name") as string | null) ?? "").trim();

  let xml: string;
  try {
    xml = await file.text();
  } catch {
    return NextResponse.json({ error: "Could not read the file as text" }, { status: 400 });
  }
  if (!/<\s*AML\b/i.test(xml)) {
    return NextResponse.json(
      { error: "This does not look like an ARIS AML export (no <AML> element)." },
      { status: 400 },
    );
  }

  const { models, report } = importAml(xml);
  if (models.length === 0) {
    return NextResponse.json(
      {
        error: report.skippedModels.length
          ? `No EPC models in this export. It contains ${report.skippedModels.length} model(s) of other kinds (${report.skippedModels.map((m) => m.type).join(", ")}).`
          : "No EPC models found in this export.",
      },
      { status: 400 },
    );
  }

  const blocked = await gateLimit(session.user.id, "individualImports");
  if (blocked) return blocked;

  const warnings: string[] = [];
  const created: Array<{ id: string; name: string }> = [];
  let elementsCreated = 0, connectorsCreated = 0;

  for (const [i, model] of models.entries()) {
    const diagnostics: LayoutDiagnostic[] = [];
    const data = layoutEpcDiagram(epcModelToPlan(model), {
      onDiagnostic: collectLayoutDiagnostics("aml-import", diagnostics),
    });

    const overLimit = await gateElementCount(session.user.id, "epc", { elements: data.elements });
    if (overLimit) {
      warnings.push(`⚠ "${model.name}" exceeds your plan's element limit and was not imported.`);
      continue;
    }

    const name = i === 0 && nameOverride ? nameOverride : model.name;
    const diagram = await prisma.diagram.create({
      data: {
        name, type: "epc",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: data as any,
        userId: session.user.id,
        orgId,
        ...(projectId ? { projectId } : {}),
      },
    });
    created.push({ id: diagram.id, name });
    elementsCreated += data.elements.length;
    connectorsCreated += data.connectors.length;
    void validateDiagramData(data, { route: "import/aml", mode: "log" });

    for (const d of diagnostics) {
      warnings.push(`⚠ "${name}": ${d.label ? `${d.label} — ` : ""}${d.detail}`);
    }
  }

  // One import event, not one per model — an export of forty EPCs is a single
  // thing the user did.
  await recordUsage(session.user.id, "individualImports");

  if (created.length === 0) {
    return NextResponse.json({ error: "Nothing could be imported.", warnings }, { status: 400 });
  }

  // Everything the importer could not take at face value. These are the lines
  // that matter on a real ARIS export, and the reason it is worth trusting.
  warnings.unshift(
    `Imported ${created.length} EPC model${created.length === 1 ? "" : "s"} (${elementsCreated} elements, ${connectorsCreated} connectors).`,
  );
  if (created.length > 1) {
    warnings.push(`Also created: ${created.slice(1).map((c) => `"${c.name}"`).join(", ")}.`);
  }
  for (const u of report.unknownObjectTypes) {
    warnings.push(
      `⚠ ${u.count} object(s) of type ${u.type} are not part of the EPC notation and were left out` +
      (u.examples.length ? ` (e.g. ${u.examples.map((e) => `"${e}"`).join(", ")})` : "") + ".",
    );
  }
  for (const u of report.unknownConnectionTypes) {
    warnings.push(`Connection type ${u.type} (×${u.count}) was not recognised; it was classified from the objects at each end.`);
  }
  for (const m of report.skippedModels) {
    warnings.push(`Skipped "${m.name}" — a ${m.type} model, not an EPC.`);
  }
  for (const d of report.dropped.slice(0, 20)) warnings.push(`⚠ ${d}`);
  if (report.dropped.length > 20) warnings.push(`…and ${report.dropped.length - 20} more connections dropped.`);

  return NextResponse.json({
    diagram: created[0],
    created,
    warnings,
    stats: {
      modelCount: models.length,
      elementsCreated,
      connectorsCreated,
      unknownObjectTypes: report.unknownObjectTypes.length,
      droppedConnections: report.dropped.length,
    },
  });
}
