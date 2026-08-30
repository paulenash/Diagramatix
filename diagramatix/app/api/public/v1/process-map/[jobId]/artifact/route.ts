/**
 * GET /api/public/v1/process-map/{jobId}/diagram.{pdf|svg|bpmn}
 *
 * One route serves all three, keyed off the trailing filename, because they
 * differ only in what is written to the body — and three near-identical route
 * files would drift.
 *
 * Authenticated with the same key as everything else rather than a signed public
 * link. Simpler, and it keeps the artifact behind the same gate as the diagram
 * it came from; if a partner wants to hand a link to their own end user, they
 * proxy it.
 *
 * The PDF is rendered at job time and stored, so this is a read. If it is not
 * there — no LibreOffice in the environment, or the render failed — the SVG
 * still is, and `.bpmn` is generated on the fly from the diagram because
 * `buildBpmnXml` is pure and costs nothing.
 */
import { prisma } from "@/app/lib/db";
import { authenticatePartner } from "@/app/lib/partner/auth";
import { withPartnerLogging } from "@/app/lib/partner/logging";
import { partnerError, partnerServerError } from "@/app/lib/partner/errors";
import { SCOPE_PROCESS_MAPPING } from "@/app/lib/partner/types";
import { buildBpmnXml } from "@/app/lib/diagram/bpmn/exportBpmnXml";
import { safeExportName } from "@/app/lib/exportFilename";
import type { DiagramData } from "@/app/lib/diagram/types";

export const dynamic = "force-dynamic";

export const GET = withPartnerLogging(async (req, ref) => {
  const auth = await authenticatePartner(req, SCOPE_PROCESS_MAPPING, ref);
  if (!auth.ok) return { response: auth.response, errorCode: auth.code };
  const c = auth.caller;
  const tag = { apiKeyId: c.apiKeyId, keyPrefix: c.keyPrefix, capturing: c.capturing };

  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const file = parts[parts.length - 1] ?? "";
  const jobId = parts[parts.length - 3] ?? ""; // …/process-map/{jobId}/artifact/{file}
  const kind = file.endsWith(".pdf") ? "pdf" : file.endsWith(".svg") ? "svg" : file.endsWith(".bpmn") ? "bpmn" : null;

  if (!kind) {
    return { response: partnerError("not_found", "Ask for diagram.pdf, diagram.svg or diagram.bpmn.", { ref }), errorCode: "not_found", ...tag };
  }

  try {
    const job = await prisma.partnerJob.findFirst({
      // Scoped to the caller's own key: a foreign job is not found, not forbidden.
      where: { id: jobId, apiKeyId: c.apiKeyId },
      select: { id: true, status: true, pdfBytes: true, svg: true, diagramId: true },
    });
    if (!job) return { response: partnerError("not_found", "No such job.", { ref }), errorCode: "not_found", ...tag };
    if (job.status !== "succeeded") {
      return {
        response: partnerError("not_found", "That run has not produced a diagram.", { ref, status: 409 }),
        errorCode: "not_found", ...tag, jobId,
      };
    }

    const name = safeExportName("process-map");

    if (kind === "svg") {
      if (!job.svg) return { response: partnerError("render_failed", "No rendering was produced for that run.", { ref }), errorCode: "render_failed", ...tag, jobId };
      return {
        response: new Response(job.svg, {
          headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Content-Disposition": `inline; filename="${name}.svg"` },
        }),
        ...tag, jobId,
      };
    }

    if (kind === "pdf") {
      if (!job.pdfBytes) {
        return {
          response: partnerError("render_failed", "No PDF was produced for that run. The SVG is available instead.", { ref }),
          errorCode: "render_failed", ...tag, jobId,
        };
      }
      return {
        response: new Response(Buffer.from(job.pdfBytes), {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"` },
        }),
        ...tag, jobId,
      };
    }

    // BPMN 2.0 XML, generated on demand — pure, isomorphic, and the thing a
    // partner should use if they want to render it properly themselves.
    if (!job.diagramId) return { response: partnerError("not_found", "No diagram for that run.", { ref }), errorCode: "not_found", ...tag, jobId };
    const diagram = await prisma.diagram.findUnique({ where: { id: job.diagramId }, select: { name: true, data: true } });
    if (!diagram) return { response: partnerError("not_found", "That diagram no longer exists.", { ref }), errorCode: "not_found", ...tag, jobId };

    const xml = buildBpmnXml(diagram.data as unknown as DiagramData, diagram.name);
    return {
      response: new Response(xml, {
        headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.bpmn"` },
      }),
      ...tag, jobId,
    };
  } catch (e) {
    return { response: partnerServerError(e, "GET artifact", ref), errorCode: "server_error", ...tag };
  }
});
