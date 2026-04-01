import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import { getElementMasterId, getConnectorMasterId } from "@/app/lib/diagram/visioMasterMap";

/**
 * GET /api/sharepoint/test-vsdx?diagramId=<id>
 * Server-side .vsdx generation for debugging — uses the same approach as the working test script.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const diagramId = searchParams.get("diagramId");
  if (!diagramId) return NextResponse.json({ error: "diagramId required" }, { status: 400 });

  const diagram = await prisma.diagram.findUnique({ where: { id: diagramId } });
  if (!diagram) return NextResponse.json({ error: "Diagram not found" }, { status: 404 });

  const data = diagram.data as any;
  const elements = data.elements ?? [];

  // Load stencil
  const stencilPath = path.join(process.cwd(), "public", "bpmn-stencil.vssx");
  const buf = fs.readFileSync(stencilPath);
  const stencil = await JSZip.loadAsync(buf);

  // No master parsing needed — we copy all masters from the stencil unchanged

  // Compute bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width); maxY = Math.max(maxY, el.y + el.height);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
  // All Visio Cell values (without U= attribute) are in inches internally.
  // A4 landscape page, diagram centered
  const diagramW = (maxX - minX) / 96;
  const diagramH = (maxY - minY) / 96;
  const pageW = 11.69; // A4 landscape
  const pageH = 8.27;
  const offsetX = (pageW - diagramW) / 2;
  const offsetY = (pageH - diagramH) / 2;

  // Helper
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;").replace(/"/g, "&quot;");

  // All shapes use Diagramatix dimensions — no Visio master size map needed
  // since we draw most shapes as custom shapes or wrap masters in Groups.

  // Build shapes
  const shapes: string[] = [];
  const connects: string[] = [];
  const elIdToShapeId = new Map<string, number>();
  let nextId = 100;
  const connectors = data.connectors ?? [];

  for (const el of elements) {
    const masterId = getElementMasterId(el);
    if (masterId == null) continue;

    const shapeId = nextId;
    nextId += 100;
    elIdToShapeId.set(el.id, shapeId);

    const cx = (el.x + el.width / 2 - minX) / 96 + offsetX;
    const cy = pageH - (el.y + el.height / 2 - minY) / 96 - offsetY;
    const dgxW = el.width / 96;
    const dgxH = el.height / 96;

    const isEvent = el.type === "start-event" || el.type === "end-event" || el.type === "intermediate-event";
    const isGateway = el.type === "gateway";
    const isPool = el.type === "pool";
    const isDataObject = el.type === "data-object";
    const gatewayRole = (el.properties as any)?.gatewayRole;

    const isSubprocess = el.type === "subprocess" || el.type === "subprocess-expanded";
    const isTask = el.type === "task";
    // All shapes use Diagramatix dimensions
    const vw = dgxW;
    const vh = dgxH;

    // Store actual Visio dimensions for connector calculation
    let textEl = "";
    let propSection = "";
    let extraCells = "";
    let sizeCells = "";

    // Tasks: draw as custom rounded rectangles with task type marker
    if (isTask) {
      const taskType = (el.taskType as string) ?? "none";
      // Task type marker geometry — small icon at top-left of task
      let taskMarker = "";
      const mx = 0.04; // marker x offset from left
      const my = vh - 0.04; // marker y offset from top (Visio Y up, so top = vh)
      const ms = 0.14; // marker size
      if (taskType === "user") {
        // Person silhouette: circle head + body arc
        taskMarker =
          `<Section N='Geometry' IX='1'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx + ms / 2 + ms * 0.2}'/><Cell N='Y' V='${my - ms * 0.25}'/></Row>` +
          `<Row T='EllipticalArcTo' IX='2'><Cell N='X' V='${mx + ms / 2 - ms * 0.2}'/><Cell N='Y' V='${my - ms * 0.25}'/><Cell N='A' V='${mx + ms / 2}'/><Cell N='B' V='${my - ms * 0.05}'/><Cell N='C' V='0'/><Cell N='D' V='1'/></Row>` +
          `<Row T='EllipticalArcTo' IX='3'><Cell N='X' V='${mx + ms / 2 + ms * 0.2}'/><Cell N='Y' V='${my - ms * 0.25}'/><Cell N='A' V='${mx + ms / 2}'/><Cell N='B' V='${my - ms * 0.45}'/><Cell N='C' V='0'/><Cell N='D' V='1'/></Row>` +
          `</Section>` +
          `<Section N='Geometry' IX='2'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx + ms * 0.15}'/><Cell N='Y' V='${my - ms * 0.5}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms * 0.15}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='3'><Cell N='X' V='${mx + ms * 0.85}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='4'><Cell N='X' V='${mx + ms * 0.85}'/><Cell N='Y' V='${my - ms * 0.5}'/></Row>` +
          `</Section>`;
      } else if (taskType === "send") {
        // Filled envelope
        taskMarker =
          `<Section N='Geometry' IX='1'><Cell N='NoFill' V='0'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='FillForegnd' V='#374151'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms * 0.3}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms}'/><Cell N='Y' V='${my - ms * 0.3}'/></Row>` +
          `<Row T='LineTo' IX='3'><Cell N='X' V='${mx + ms}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='4'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='5'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms * 0.3}'/></Row>` +
          `</Section>` +
          `<Section N='Geometry' IX='2'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='LineColor' V='#FFFFFF'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms * 0.3}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms / 2}'/><Cell N='Y' V='${my - ms * 0.65}'/></Row>` +
          `<Row T='LineTo' IX='3'><Cell N='X' V='${mx + ms}'/><Cell N='Y' V='${my - ms * 0.3}'/></Row>` +
          `</Section>`;
      } else if (taskType === "receive") {
        // Outline envelope
        taskMarker =
          `<Section N='Geometry' IX='1'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms * 0.3}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms}'/><Cell N='Y' V='${my - ms * 0.3}'/></Row>` +
          `<Row T='LineTo' IX='3'><Cell N='X' V='${mx + ms}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='4'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='5'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms * 0.3}'/></Row>` +
          `</Section>` +
          `<Section N='Geometry' IX='2'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms * 0.3}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms / 2}'/><Cell N='Y' V='${my - ms * 0.65}'/></Row>` +
          `<Row T='LineTo' IX='3'><Cell N='X' V='${mx + ms}'/><Cell N='Y' V='${my - ms * 0.3}'/></Row>` +
          `</Section>`;
      } else if (taskType === "service") {
        // Simple gear: circle with radiating lines
        const gr = ms * 0.35;
        const gcx = mx + ms / 2, gcy = my - ms * 0.65;
        taskMarker =
          `<Section N='Geometry' IX='1'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${gcx + gr}'/><Cell N='Y' V='${gcy}'/></Row>` +
          `<Row T='EllipticalArcTo' IX='2'><Cell N='X' V='${gcx - gr}'/><Cell N='Y' V='${gcy}'/><Cell N='A' V='${gcx}'/><Cell N='B' V='${gcy + gr}'/><Cell N='C' V='0'/><Cell N='D' V='1'/></Row>` +
          `<Row T='EllipticalArcTo' IX='3'><Cell N='X' V='${gcx + gr}'/><Cell N='Y' V='${gcy}'/><Cell N='A' V='${gcx}'/><Cell N='B' V='${gcy - gr}'/><Cell N='C' V='0'/><Cell N='D' V='1'/></Row>` +
          `</Section>`;
      } else if (taskType === "script") {
        // Wavy page
        taskMarker =
          `<Section N='Geometry' IX='1'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx + ms * 0.2}'/><Cell N='Y' V='${my - ms * 0.15}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms * 0.8}'/><Cell N='Y' V='${my - ms * 0.15}'/></Row>` +
          `<Row T='LineTo' IX='3'><Cell N='X' V='${mx + ms * 0.8}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='4'><Cell N='X' V='${mx + ms * 0.2}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='5'><Cell N='X' V='${mx + ms * 0.2}'/><Cell N='Y' V='${my - ms * 0.15}'/></Row>` +
          `</Section>` +
          // Horizontal lines
          `<Section N='Geometry' IX='2'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='LineWeight' V='0.005'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx + ms * 0.3}'/><Cell N='Y' V='${my - ms * 0.38}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms * 0.7}'/><Cell N='Y' V='${my - ms * 0.38}'/></Row>` +
          `</Section>` +
          `<Section N='Geometry' IX='3'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='LineWeight' V='0.005'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx + ms * 0.3}'/><Cell N='Y' V='${my - ms * 0.58}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms * 0.7}'/><Cell N='Y' V='${my - ms * 0.58}'/></Row>` +
          `</Section>` +
          `<Section N='Geometry' IX='4'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='LineWeight' V='0.005'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx + ms * 0.3}'/><Cell N='Y' V='${my - ms * 0.78}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms * 0.7}'/><Cell N='Y' V='${my - ms * 0.78}'/></Row>` +
          `</Section>`;
      } else if (taskType === "manual") {
        // Hand shape (simplified as rectangle with fingers)
        taskMarker =
          `<Section N='Geometry' IX='1'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms * 0.4}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms * 0.7}'/><Cell N='Y' V='${my - ms * 0.4}'/></Row>` +
          `<Row T='LineTo' IX='3'><Cell N='X' V='${mx + ms * 0.7}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='4'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='5'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms * 0.4}'/></Row>` +
          `</Section>`;
      } else if (taskType === "business-rule") {
        // Table/grid
        taskMarker =
          `<Section N='Geometry' IX='1'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms * 0.2}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms}'/><Cell N='Y' V='${my - ms * 0.2}'/></Row>` +
          `<Row T='LineTo' IX='3'><Cell N='X' V='${mx + ms}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='4'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `<Row T='LineTo' IX='5'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms * 0.2}'/></Row>` +
          `</Section>` +
          `<Section N='Geometry' IX='2'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='LineWeight' V='0.005'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx}'/><Cell N='Y' V='${my - ms * 0.55}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms}'/><Cell N='Y' V='${my - ms * 0.55}'/></Row>` +
          `</Section>` +
          `<Section N='Geometry' IX='3'><Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='LineWeight' V='0.005'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${mx + ms * 0.4}'/><Cell N='Y' V='${my - ms * 0.2}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${mx + ms * 0.4}'/><Cell N='Y' V='${my - ms}'/></Row>` +
          `</Section>`;
      }
      // taskType "none" → no marker

      shapes.push(
        `<Shape ID='${shapeId}' NameU='${esc(el.label || "Task")}' Type='Shape'>` +
        `<Cell N='PinX' V='${cx}'/>` +
        `<Cell N='PinY' V='${cy}'/>` +
        `<Cell N='Width' V='${vw}'/>` +
        `<Cell N='Height' V='${vh}'/>` +
        `<Cell N='LocPinX' V='${vw / 2}' F='Width*0.5'/>` +
        `<Cell N='LocPinY' V='${vh / 2}' F='Height*0.5'/>` +
        `<Cell N='LineWeight' V='0.01388888888888889'/>` +
        `<Cell N='LineColor' V='0'/>` +
        `<Cell N='FillForegnd' V='#fef9c3'/>` +
        `<Cell N='FillPattern' V='1'/>` +
        `<Cell N='Rounding' V='0.06'/>` +
        `<Cell N='VerticalAlign' V='1'/>` +
        `<Section N='Character'><Row IX='0'><Cell N='Size' V='0.1111111111111111'/></Row></Section>` +
        `<Section N='Paragraph'><Row IX='0'><Cell N='HorzAlign' V='1'/></Row></Section>` +
        `<Section N='Geometry' IX='0'>` +
        `<Cell N='NoFill' V='0'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        `<Row T='MoveTo' IX='1'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='2'><Cell N='X' V='${vw}' F='Width*1'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='3'><Cell N='X' V='${vw}' F='Width*1'/><Cell N='Y' V='${vh}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='4'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='${vh}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='5'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `</Section>` +
        taskMarker +
        (el.label ? `<Text>${esc(el.label)}</Text>` : "") +
        `</Shape>`
      );
      continue;
    }

    // Gateways: custom diamond shape matching Diagramatix dimensions and markers
    if (isGateway) {
      const gwType = (el.gatewayType as string) ?? "none";
      const hw = vw / 2;
      const hh = vh / 2;
      // Marker geometry matching Diagramatix GatewayMarker
      let markerGeom = "";
      const s = Math.min(hw, hh) * 0.58; // ~11.7/20 ratio from Diagramatix
      const lw = "0.05"; // thick marker lines (~5px at 96dpi scaled)
      if (gwType === "exclusive") {
        // X marker with thick lines at 70° angle
        const dx = s * 0.7 * Math.sin(35 * Math.PI / 180);
        const dy = s * 0.7 * Math.cos(35 * Math.PI / 180);
        markerGeom =
          `<Section N='Geometry' IX='1'>` +
          `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='LineWeight' V='${lw}'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${hw - dx}'/><Cell N='Y' V='${hh + dy}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${hw + dx}'/><Cell N='Y' V='${hh - dy}'/></Row>` +
          `</Section>` +
          `<Section N='Geometry' IX='2'>` +
          `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='LineWeight' V='${lw}'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${hw + dx}'/><Cell N='Y' V='${hh + dy}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${hw - dx}'/><Cell N='Y' V='${hh - dy}'/></Row>` +
          `</Section>`;
      } else if (gwType === "parallel") {
        // + marker with thick lines
        const ms = s * 0.7;
        markerGeom =
          `<Section N='Geometry' IX='1'>` +
          `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='LineWeight' V='${lw}'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${hw - ms}'/><Cell N='Y' V='${hh}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${hw + ms}'/><Cell N='Y' V='${hh}'/></Row>` +
          `</Section>` +
          `<Section N='Geometry' IX='2'>` +
          `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='LineWeight' V='${lw}'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${hw}'/><Cell N='Y' V='${hh - ms}'/></Row>` +
          `<Row T='LineTo' IX='2'><Cell N='X' V='${hw}'/><Cell N='Y' V='${hh + ms}'/></Row>` +
          `</Section>`;
      } else if (gwType === "inclusive") {
        // Thick circle
        const cr = s * 0.7;
        markerGeom =
          `<Section N='Geometry' IX='1'>` +
          `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Cell N='LineWeight' V='0.04'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${hw + cr}'/><Cell N='Y' V='${hh}'/></Row>` +
          `<Row T='EllipticalArcTo' IX='2'>` +
          `<Cell N='X' V='${hw - cr}'/><Cell N='Y' V='${hh}'/><Cell N='A' V='${hw}'/><Cell N='B' V='${hh + cr}'/><Cell N='C' V='0'/><Cell N='D' V='1'/></Row>` +
          `<Row T='EllipticalArcTo' IX='3'>` +
          `<Cell N='X' V='${hw + cr}'/><Cell N='Y' V='${hh}'/><Cell N='A' V='${hw}'/><Cell N='B' V='${hh - cr}'/><Cell N='C' V='0'/><Cell N='D' V='1'/></Row>` +
          `</Section>`;
      } else if (gwType === "event-based") {
        // Double circle + pentagon
        const or = s * 0.95;
        const ir = s * 0.75;
        const pr = s * 0.5;
        // Outer circle
        markerGeom =
          `<Section N='Geometry' IX='1'>` +
          `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${hw + or}'/><Cell N='Y' V='${hh}'/></Row>` +
          `<Row T='EllipticalArcTo' IX='2'><Cell N='X' V='${hw - or}'/><Cell N='Y' V='${hh}'/><Cell N='A' V='${hw}'/><Cell N='B' V='${hh + or}'/><Cell N='C' V='0'/><Cell N='D' V='1'/></Row>` +
          `<Row T='EllipticalArcTo' IX='3'><Cell N='X' V='${hw + or}'/><Cell N='Y' V='${hh}'/><Cell N='A' V='${hw}'/><Cell N='B' V='${hh - or}'/><Cell N='C' V='0'/><Cell N='D' V='1'/></Row>` +
          `</Section>` +
          // Inner circle
          `<Section N='Geometry' IX='2'>` +
          `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
          `<Row T='MoveTo' IX='1'><Cell N='X' V='${hw + ir}'/><Cell N='Y' V='${hh}'/></Row>` +
          `<Row T='EllipticalArcTo' IX='2'><Cell N='X' V='${hw - ir}'/><Cell N='Y' V='${hh}'/><Cell N='A' V='${hw}'/><Cell N='B' V='${hh + ir}'/><Cell N='C' V='0'/><Cell N='D' V='1'/></Row>` +
          `<Row T='EllipticalArcTo' IX='3'><Cell N='X' V='${hw + ir}'/><Cell N='Y' V='${hh}'/><Cell N='A' V='${hw}'/><Cell N='B' V='${hh - ir}'/><Cell N='C' V='0'/><Cell N='D' V='1'/></Row>` +
          `</Section>` +
          // Pentagon
          `<Section N='Geometry' IX='3'>` +
          `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>`;
        let pentRows = "";
        for (let i = 0; i <= 5; i++) {
          const a = ((i % 5) * 2 * Math.PI / 5) - Math.PI / 2;
          const px = hw + pr * Math.cos(a);
          const py = hh + pr * Math.sin(a);
          pentRows += i === 0
            ? `<Row T='MoveTo' IX='1'><Cell N='X' V='${px}'/><Cell N='Y' V='${py}'/></Row>`
            : `<Row T='LineTo' IX='${i + 1}'><Cell N='X' V='${px}'/><Cell N='Y' V='${py}'/></Row>`;
        }
        markerGeom += pentRows + `</Section>`;
      }
      // gwType "none" → no marker (empty markerGeom)

      // Gateway with external text block via TxtPin
      const skipLabel = gatewayRole === "merge" || !el.label || el.label === "Decision?";

      let gwTxtCells = "";
      let gwTextEl = "";
      if (skipLabel) {
        gwTxtCells = `<Cell N='HideText' V='1'/>`;
        gwTextEl = `<Text></Text>`;
      } else if (el.label) {
        const lox = ((el.properties as any)?.labelOffsetX ?? -30);
        const loy = ((el.properties as any)?.labelOffsetY ?? -54);
        const labelH = 0.18;
        const charW = 0.07;
        const labelW = Math.max(0.5, el.label.length * charW + 0.15);
        const txtPinX = lox / 96;
        const txtPinY = -(el.height / 2 + loy) / 96 - labelH / 2;
        gwTxtCells =
          `<Cell N='TxtPinX' V='${hw + txtPinX}'/>` +
          `<Cell N='TxtPinY' V='${hh + txtPinY}'/>` +
          `<Cell N='TxtWidth' V='${labelW}'/>` +
          `<Cell N='TxtHeight' V='${labelH}'/>` +
          `<Cell N='TxtLocPinX' V='${labelW / 2}' F='TxtWidth*0.5'/>` +
          `<Cell N='TxtLocPinY' V='${labelH / 2}' F='TxtHeight*0.5'/>` +
          `<Cell N='TxtAngle' V='0'/>`;
        gwTextEl = `<Text>${esc(el.label)}</Text>`;
      }

      shapes.push(
        `<Shape ID='${shapeId}' NameU='${esc(el.label || "Gateway")}' Type='Shape'>` +
        `<Cell N='PinX' V='${cx}'/>` +
        `<Cell N='PinY' V='${cy}'/>` +
        `<Cell N='Width' V='${vw}'/>` +
        `<Cell N='Height' V='${vh}'/>` +
        `<Cell N='LocPinX' V='${hw}' F='Width*0.5'/>` +
        `<Cell N='LocPinY' V='${hh}' F='Height*0.5'/>` +
        `<Cell N='LineWeight' V='0.01388888888888889'/>` +
        `<Cell N='LineColor' V='#374151'/>` +
        `<Cell N='FillForegnd' V='#f3e8ff'/>` +
        `<Cell N='FillPattern' V='1'/>` +
        gwTxtCells +
        `<Section N='Character'><Row IX='0'><Cell N='Size' V='0.1111111111111111'/></Row></Section>` +
        `<Section N='Paragraph'><Row IX='0'><Cell N='HorzAlign' V='1'/></Row></Section>` +
        // Diamond geometry
        `<Section N='Geometry' IX='0'>` +
        `<Cell N='NoFill' V='0'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        `<Row T='MoveTo' IX='1'><Cell N='X' V='${hw}'/><Cell N='Y' V='0'/></Row>` +
        `<Row T='LineTo' IX='2'><Cell N='X' V='${vw}'/><Cell N='Y' V='${hh}'/></Row>` +
        `<Row T='LineTo' IX='3'><Cell N='X' V='${hw}'/><Cell N='Y' V='${vh}'/></Row>` +
        `<Row T='LineTo' IX='4'><Cell N='X' V='0'/><Cell N='Y' V='${hh}'/></Row>` +
        `<Row T='LineTo' IX='5'><Cell N='X' V='${hw}'/><Cell N='Y' V='0'/></Row>` +
        `</Section>` +
        markerGeom +
        // Connection points at diamond tips
        `<Section N='Connection'>` +
        `<Row T='Connection' IX='0'><Cell N='X' V='${hw}' F='Width*0.5'/><Cell N='Y' V='${vh}' F='Height*1'/><Cell N='DirX' V='0'/><Cell N='DirY' V='0'/><Cell N='Type' V='0'/><Cell N='AutoGen' V='0'/></Row>` +
        `<Row T='Connection' IX='1'><Cell N='X' V='${vw}' F='Width*1'/><Cell N='Y' V='${hh}' F='Height*0.5'/><Cell N='DirX' V='0'/><Cell N='DirY' V='0'/><Cell N='Type' V='0'/><Cell N='AutoGen' V='0'/></Row>` +
        `<Row T='Connection' IX='2'><Cell N='X' V='${hw}' F='Width*0.5'/><Cell N='Y' V='0'/><Cell N='DirX' V='0'/><Cell N='DirY' V='0'/><Cell N='Type' V='0'/><Cell N='AutoGen' V='0'/></Row>` +
        `<Row T='Connection' IX='3'><Cell N='X' V='0'/><Cell N='Y' V='${hh}' F='Height*0.5'/><Cell N='DirX' V='0'/><Cell N='DirY' V='0'/><Cell N='Type' V='0'/><Cell N='AutoGen' V='0'/></Row>` +
        `</Section>` +
        gwTextEl +
        `</Shape>`
      );
      continue;
    }

    // Subprocesses: draw without master to control marker size
    if (isSubprocess) {
      const markerSize = 0.18; // 50% larger marker
      const markerX = vw / 2;
      const markerBottom = 0.04;
      shapes.push(
        `<Shape ID='${shapeId}' NameU='${esc(el.label || "Subprocess")}' Type='Shape'>` +
        `<Cell N='PinX' V='${cx}'/>` +
        `<Cell N='PinY' V='${cy}'/>` +
        `<Cell N='Width' V='${vw}'/>` +
        `<Cell N='Height' V='${vh}'/>` +
        `<Cell N='LocPinX' V='${vw / 2}' F='Width*0.5'/>` +
        `<Cell N='LocPinY' V='${vh / 2}' F='Height*0.5'/>` +
        `<Cell N='LineWeight' V='0.01388888888888889'/>` +
        `<Cell N='LineColor' V='0'/>` +
        `<Cell N='FillForegnd' V='#fef08a'/>` +
        `<Cell N='FillPattern' V='1'/>` +
        `<Cell N='Rounding' V='0.06'/>` +
        `<Cell N='VerticalAlign' V='1'/>` +
        `<Section N='Character'><Row IX='0'><Cell N='Size' V='0.1111111111111111'/></Row></Section>` +
        `<Section N='Paragraph'><Row IX='0'><Cell N='HorzAlign' V='1'/></Row></Section>` +
        // Main rectangle
        `<Section N='Geometry' IX='0'>` +
        `<Cell N='NoFill' V='0'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        `<Row T='MoveTo' IX='1'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='2'><Cell N='X' V='${vw}' F='Width*1'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='3'><Cell N='X' V='${vw}' F='Width*1'/><Cell N='Y' V='${vh}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='4'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='${vh}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='5'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `</Section>` +
        // + marker box at bottom center
        `<Section N='Geometry' IX='1'>` +
        `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        `<Row T='MoveTo' IX='1'><Cell N='X' V='${markerX - markerSize / 2}'/><Cell N='Y' V='${markerBottom}'/></Row>` +
        `<Row T='LineTo' IX='2'><Cell N='X' V='${markerX + markerSize / 2}'/><Cell N='Y' V='${markerBottom}'/></Row>` +
        `<Row T='LineTo' IX='3'><Cell N='X' V='${markerX + markerSize / 2}'/><Cell N='Y' V='${markerBottom + markerSize}'/></Row>` +
        `<Row T='LineTo' IX='4'><Cell N='X' V='${markerX - markerSize / 2}'/><Cell N='Y' V='${markerBottom + markerSize}'/></Row>` +
        `<Row T='LineTo' IX='5'><Cell N='X' V='${markerX - markerSize / 2}'/><Cell N='Y' V='${markerBottom}'/></Row>` +
        `</Section>` +
        // + cross inside the marker box
        `<Section N='Geometry' IX='2'>` +
        `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        `<Row T='MoveTo' IX='1'><Cell N='X' V='${markerX}'/><Cell N='Y' V='${markerBottom + 0.02}'/></Row>` +
        `<Row T='LineTo' IX='2'><Cell N='X' V='${markerX}'/><Cell N='Y' V='${markerBottom + markerSize - 0.02}'/></Row>` +
        `</Section>` +
        `<Section N='Geometry' IX='3'>` +
        `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        `<Row T='MoveTo' IX='1'><Cell N='X' V='${markerX - markerSize / 2 + 0.02}'/><Cell N='Y' V='${markerBottom + markerSize / 2}'/></Row>` +
        `<Row T='LineTo' IX='2'><Cell N='X' V='${markerX + markerSize / 2 - 0.02}'/><Cell N='Y' V='${markerBottom + markerSize / 2}'/></Row>` +
        `</Section>` +
        (el.label ? `<Text>${esc(el.label)}</Text>` : "") +
        `</Shape>`
      );
      continue;
    }

    if (isPool) {
      // Pool as a Group shape containing body rectangle + header sidebar.
      // Connectors attach to the group boundary.
      const sidebarW = 0.32;
      const bodyId = shapeId + 1;
      const headerId = shapeId + 2;
      shapes.push(
        `<Shape ID='${shapeId}' NameU='${esc(el.label || "Pool")}' Type='Group'>` +
        `<Cell N='PinX' V='${cx}'/>` +
        `<Cell N='PinY' V='${cy}'/>` +
        `<Cell N='Width' V='${vw}'/>` +
        `<Cell N='Height' V='${vh}'/>` +
        `<Cell N='LocPinX' V='${vw / 2}' F='Width*0.5'/>` +
        `<Cell N='LocPinY' V='${vh / 2}' F='Height*0.5'/>` +
        `<Cell N='IsTextEditTarget' V='0'/>` +
        `<Cell N='SelectMode' V='1'/>` +
        `<Shapes>` +
        // Body rectangle (child shape)
        `<Shape ID='${bodyId}' NameU='Pool Body' Type='Shape'>` +
        `<Cell N='PinX' V='${vw / 2}' F='Sheet.${shapeId}!Width*0.5'/>` +
        `<Cell N='PinY' V='${vh / 2}' F='Sheet.${shapeId}!Height*0.5'/>` +
        `<Cell N='Width' V='${vw}' F='Sheet.${shapeId}!Width'/>` +
        `<Cell N='Height' V='${vh}' F='Sheet.${shapeId}!Height'/>` +
        `<Cell N='LocPinX' V='${vw / 2}' F='Width*0.5'/>` +
        `<Cell N='LocPinY' V='${vh / 2}' F='Height*0.5'/>` +
        `<Cell N='LineWeight' V='0.02083333333333333'/>` +
        `<Cell N='LineColor' V='0'/>` +
        `<Cell N='FillForegnd' V='#f9fafb'/>` +
        `<Cell N='FillPattern' V='1'/>` +
        `<Section N='Geometry' IX='0'>` +
        `<Cell N='NoFill' V='0'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        `<Row T='MoveTo' IX='1'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='2'><Cell N='X' V='${vw}' F='Width*1'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='3'><Cell N='X' V='${vw}' F='Width*1'/><Cell N='Y' V='${vh}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='4'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='${vh}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='5'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `</Section>` +
        `</Shape>` +
        // Header sidebar (child shape)
        `<Shape ID='${headerId}' NameU='${esc(el.label || "Pool")} Header' Type='Shape'>` +
        `<Cell N='IsTextEditTarget' V='1'/>` +
        `<Cell N='PinX' V='${sidebarW / 2}'/>` +
        `<Cell N='PinY' V='${vh / 2}' F='Sheet.${shapeId}!Height*0.5'/>` +
        `<Cell N='Width' V='${sidebarW}'/>` +
        `<Cell N='Height' V='${vh}' F='Sheet.${shapeId}!Height'/>` +
        `<Cell N='LocPinX' V='${sidebarW / 2}' F='Width*0.5'/>` +
        `<Cell N='LocPinY' V='${vh / 2}' F='Height*0.5'/>` +
        `<Cell N='LineWeight' V='0.02083333333333333'/>` +
        `<Cell N='LineColor' V='0'/>` +
        `<Cell N='FillForegnd' V='#c8956a'/>` +
        `<Cell N='FillPattern' V='1'/>` +
        `<Cell N='TxtPinX' V='${sidebarW / 2}' F='Width*0.5'/>` +
        `<Cell N='TxtPinY' V='${vh / 2}' F='Height*0.5'/>` +
        `<Cell N='TxtWidth' V='${vh}'/>` +
        `<Cell N='TxtHeight' V='${sidebarW}'/>` +
        `<Cell N='TxtLocPinX' V='${vh / 2}' F='TxtWidth*0.5'/>` +
        `<Cell N='TxtLocPinY' V='${sidebarW / 2}' F='TxtHeight*0.5'/>` +
        `<Cell N='TxtAngle' V='1.5707963267948966'/>` +
        `<Cell N='VerticalAlign' V='1'/>` +
        `<Section N='Character'><Row IX='0'>` +
        `<Cell N='Size' V='0.1111111111111111'/>` +
        `<Cell N='Style' V='17'/>` +
        `<Cell N='Color' V='#3b1a08'/>` +
        `</Row></Section>` +
        `<Section N='Paragraph'><Row IX='0'><Cell N='HorzAlign' V='1'/></Row></Section>` +
        `<Section N='Geometry' IX='0'>` +
        `<Cell N='NoFill' V='0'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        `<Row T='MoveTo' IX='1'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='2'><Cell N='X' V='${sidebarW}' F='Width*1'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='3'><Cell N='X' V='${sidebarW}' F='Width*1'/><Cell N='Y' V='${vh}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='4'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='${vh}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='5'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `</Section>` +
        (el.label ? `<Text>${esc(el.label)}</Text>` : "") +
        `</Shape>` +
        `</Shapes>` +
        `</Shape>`
      );
      // Skip the normal shape.push below
      continue;
    } else if (isGateway) {
      const skipLabel = gatewayRole === "merge" || !el.label || el.label === "Decision?";
      if (skipLabel) {
        propSection = `<Section N='Property'><Row N='BpmnName'><Cell N='Value' V='' U='STR'/></Row></Section>`;
        textEl = `<Text></Text>`;
        extraCells = `<Cell N='HideText' V='1'/>`;
      } else {
        textEl = `<Text>${esc(el.label)}</Text>`;
      }
    } else if ((isEvent || isDataObject) && el.label) {
      // Events & data objects: use master shape with external text block (TxtPin)
      // This gives the yellow handle in Visio for repositioning the label
      const lox = ((el.properties as any)?.labelOffsetX ?? 0);
      const loy = ((el.properties as any)?.labelOffsetY ?? 7);
      const lineH = 0.18;
      const charW = 0.07;

      // Build label text (wrap for data objects, append state)
      let labelText = el.label;
      if (isDataObject) {
        const maxChars = 12;
        const words = el.label.split(' ');
        const wrapped: string[] = [];
        let cur = '';
        for (const w of words) {
          if (cur && (cur.length + 1 + w.length) > maxChars) { wrapped.push(cur); cur = w; }
          else { cur = cur ? cur + ' ' + w : w; }
        }
        if (cur) wrapped.push(cur);
        // Append state on a new line
        const state = (el.properties as any)?.state;
        if (state) wrapped.push(`[${state}]`);
        labelText = wrapped.join('\n');
      }
      const labelLines = labelText.split('\n').length;
      const labelH = labelLines * lineH;
      const maxLineLen = Math.max(...labelText.split('\n').map((l: string) => l.length));
      const labelW = Math.max(0.5, maxLineLen * charW + 0.15);

      // TxtPin position relative to shape center (in inches)
      // In Diagramatix: labelTopY = el.y + el.height + loy
      // Relative to el center: offset = el.height/2 + loy (downward in Diagramatix)
      // In Visio (Y up): TxtPinY = -(el.height/2 + loy)/96 - labelH/2
      const txtPinX = lox / 96;
      const txtPinY = -(el.height / 2 + loy) / 96 - labelH / 2;

      propSection = `<Section N='Property'><Row N='BpmnName'><Cell N='Value' V='${esc(el.label)}' U='STR'/></Row></Section>`;
      extraCells =
        `<Cell N='TxtPinX' V='${vw / 2 + txtPinX}'/>` +
        `<Cell N='TxtPinY' V='${vh / 2 + txtPinY}'/>` +
        `<Cell N='TxtWidth' V='${labelW}'/>` +
        `<Cell N='TxtHeight' V='${labelH}'/>` +
        `<Cell N='TxtLocPinX' V='${labelW / 2}' F='TxtWidth*0.5'/>` +
        `<Cell N='TxtLocPinY' V='${labelH / 2}' F='TxtHeight*0.5'/>` +
        `<Cell N='TxtAngle' V='0'/>`;
      textEl = `<Text>${esc(labelText).replace(/\n/g, '&#xA;')}</Text>`;
    } else if (el.label) {
      propSection = `<Section N='Property'><Row N='BpmnName'><Cell N='Value' V='${esc(el.label)}' U='STR'/></Row></Section>`;
      textEl = `<Text>${esc(el.label)}</Text>`;
    }

    // Simple master-based shape for remaining elements (data-store without label, etc.)
    shapes.push(
      `<Shape ID='${shapeId}' NameU='${esc(el.label || el.type)}' Type='Group' Master='${masterId}'>` +
      `<Cell N='PinX' V='${cx}'/>` +
      `<Cell N='PinY' V='${cy}'/>` +
      sizeCells +
      extraCells +
      propSection +
      textEl +
      `</Shape>`
    );
  }

  // Helper: create a moveable text label shape
  function makeTextLabel(text: string, x: number, y: number, fontSize?: string): string {
    const id = nextId;
    nextId += 100;
    const charW = 0.07;
    const lines = text.split('\n');
    const maxLineLen = Math.max(...lines.map(l => l.length));
    const w = Math.max(0.4, maxLineLen * charW + 0.1);
    const lineH = 0.18;
    const h = lines.length * lineH;
    const fs = fontSize ?? '0.1111111111111111';
    return (
      `<Shape ID='${id}' NameU='${esc(text)}' Type='Shape'>` +
      `<Cell N='PinX' V='${x}'/>` +
      `<Cell N='PinY' V='${y}'/>` +
      `<Cell N='Width' V='${w}'/>` +
      `<Cell N='Height' V='${h}'/>` +
      `<Cell N='LocPinX' V='${w / 2}' F='Width*0.5'/>` +
      `<Cell N='LocPinY' V='${h / 2}' F='Height*0.5'/>` +
      `<Cell N='Angle' V='0'/>` +
      `<Cell N='LinePattern' V='0'/>` +
      `<Cell N='FillPattern' V='0'/>` +
      `<Cell N='ShdwPattern' V='0'/>` +
      `<Cell N='TxtPinX' V='${w / 2}' F='Width*0.5'/>` +
      `<Cell N='TxtPinY' V='${h / 2}' F='Height*0.5'/>` +
      `<Cell N='TxtWidth' V='${w}' F='Width'/>` +
      `<Cell N='TxtHeight' V='${h}' F='Height'/>` +
      `<Cell N='TxtLocPinX' V='${w / 2}' F='TxtWidth*0.5'/>` +
      `<Cell N='TxtLocPinY' V='${h / 2}' F='TxtHeight*0.5'/>` +
      `<Cell N='TxtAngle' V='0'/>` +
      `<Section N='Character'><Row IX='0'><Cell N='Size' V='${fs}'/></Row></Section>` +
      `<Section N='Paragraph'><Row IX='0'><Cell N='HorzAlign' V='1'/></Row></Section>` +
      `<Section N='Geometry' IX='0'>` +
      `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='1'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
      `<Row T='MoveTo' IX='1'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
      `<Row T='LineTo' IX='2'><Cell N='X' V='${w}' F='Width*1'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
      `<Row T='LineTo' IX='3'><Cell N='X' V='${w}' F='Width*1'/><Cell N='Y' V='${h}' F='Height*1'/></Row>` +
      `<Row T='LineTo' IX='4'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='${h}' F='Height*1'/></Row>` +
      `<Row T='LineTo' IX='5'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
      `</Section>` +
      `<Text>${esc(text).replace(/\n/g, '&#xA;')}</Text>` +
      `</Shape>`
    );
  }

  // All labels are now inside Group shapes — no separate label loop needed.

  // Build connectors — use source/target element centers for Begin/End coordinates.
  // Visio will route the connector and snap to the nearest connection point on each shape.
  // Use dynamic connector properties so Visio handles routing.
  for (const conn of connectors) {
    const shapeId = nextId;
    nextId += 100;

    const srcShapeId = elIdToShapeId.get(conn.sourceId);
    const tgtShapeId = elIdToShapeId.get(conn.targetId);
    if (srcShapeId == null || tgtShapeId == null) {
      console.log(`[visio] Skipping connector "${conn.label || conn.type}" — missing shape: src=${srcShapeId} tgt=${tgtShapeId} srcId=${conn.sourceId} tgtId=${conn.targetId}`);
      continue;
    }

    // Use Diagramatix waypoints directly for connector endpoints.
    // This ensures connectors match the original diagram exactly.
    const wp = conn.waypoints ?? [];
    const visStart = conn.sourceInvisibleLeader ? 1 : 0;
    const visEnd = conn.targetInvisibleLeader ? wp.length - 2 : wp.length - 1;
    const visPts = wp.slice(visStart, visEnd + 1);
    if (visPts.length < 2) continue;

    const p0 = visPts[0];
    const pN = visPts[visPts.length - 1];
    const bx = (p0.x - minX) / 96 + offsetX;
    const by = pageH - (p0.y - minY) / 96 - offsetY;
    const ex = (pN.x - minX) / 96 + offsetX;
    const ey = pageH - (pN.y - minY) / 96 - offsetY;

    // Connector style
    let linePattern = "1"; // solid
    let endArrow = "4";    // filled arrow
    let beginArrow = "0";  // none
    let lineWeight = "0.01041666666666667"; // ~0.75pt
    if (conn.type === "messageBPMN") {
      linePattern = "2"; endArrow = "16"; beginArrow = "20";
      lineWeight = "0.01388888888888889";
    } else if (conn.type === "associationBPMN") {
      linePattern = "3";
      lineWeight = "0.01736111111111111"; // ~1.25pt — slightly thicker for association
      endArrow = conn.directionType === "open-directed" ? "1" : "0";
      beginArrow = conn.directionType === "both" ? "1" : "0";
    }

    const dx = ex - bx;
    const dy = ey - by;

    // Geometry from Diagramatix waypoints
    const isAssoc = conn.type === "associationBPMN";
    const isMsg = conn.type === "messageBPMN";

    let geomRows = `<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>`;
    if (!isAssoc && visPts.length > 2) {
      // Rectilinear waypoints from Diagramatix
      for (let i = 1; i < visPts.length; i++) {
        const rx = (visPts[i].x - visPts[0].x) / 96;
        const ry = -(visPts[i].y - visPts[0].y) / 96;
        geomRows += `<Row T='LineTo' IX='${i + 1}'><Cell N='X' V='${rx}'/><Cell N='Y' V='${ry}'/></Row>`;
      }
    } else {
      geomRows += `<Row T='LineTo' IX='2'><Cell N='X' V='${dx}'/><Cell N='Y' V='${dy}'/></Row>`;
    }

    const geom =
      `<Section N='Geometry' IX='0'>` +
      `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
      geomRows +
      `</Section>`;

    shapes.push(
      `<Shape ID='${shapeId}' NameU='${esc(conn.label || conn.type)}' Type='Shape' LineStyle='0' FillStyle='0' TextStyle='0'>` +
      `<Cell N='PinX' V='${(bx + ex) / 2}' F='GUARD((BeginX+EndX)/2)'/>` +
      `<Cell N='PinY' V='${(by + ey) / 2}' F='GUARD((BeginY+EndY)/2)'/>` +
      `<Cell N='Width' V='${dx}' F='GUARD(EndX-BeginX)'/>` +
      `<Cell N='Height' V='${dy}' F='GUARD(EndY-BeginY)'/>` +
      `<Cell N='LocPinX' V='${dx / 2}' F='GUARD(Width*0.5)'/>` +
      `<Cell N='LocPinY' V='${dy / 2}' F='GUARD(Height*0.5)'/>` +
      `<Cell N='Angle' V='0' F='GUARD(0DA)'/>` +
      `<Cell N='FlipX' V='0' F='GUARD(FALSE)'/>` +
      `<Cell N='FlipY' V='0' F='GUARD(FALSE)'/>` +
      `<Cell N='BeginX' V='${bx}' F='_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)'/>` +
      `<Cell N='BeginY' V='${by}' F='_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)'/>` +
      `<Cell N='EndX' V='${ex}' F='_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)'/>` +
      `<Cell N='EndY' V='${ey}' F='_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)'/>` +
      `<Cell N='LineWeight' V='${lineWeight}'/>` +
      `<Cell N='LinePattern' V='${linePattern}'/>` +
      `<Cell N='Rounding' V='0.05905511811023622'/>` +
      `<Cell N='EndArrow' V='${endArrow}'/>` +
      `<Cell N='BeginArrow' V='${beginArrow}'/>` +
      `<Cell N='EndArrowSize' V='2'/>` +
      `<Cell N='BeginArrowSize' V='2'/>` +
      `<Cell N='NoAlignBox' V='1'/>` +
      `<Cell N='ObjType' V='2'/>` +
      `<Cell N='BegTrigger' V='2' F='_XFTRIGGER(Sheet.${srcShapeId}!EventXFMod)'/>` +
      `<Cell N='EndTrigger' V='2' F='_XFTRIGGER(Sheet.${tgtShapeId}!EventXFMod)'/>` +
      `<Cell N='ConFixedCode' V='6'/>` +
      (isAssoc ? `<Cell N='ShapeRouteStyle' V='1'/>` : "") +
      `<Cell N='LayerMember' V='0'/>` +
      // Connector label via TxtPin — attached with yellow handle in Visio
      (() => {
        if (!conn.label) return "";
        const labelOX = (conn.labelOffsetX ?? 0) / 96;
        const labelOY = (conn.labelOffsetY ?? -0.2 * 96) / 96;
        // TxtPin is relative to shape's local coordinate system
        // For connectors: local origin is at BeginX,BeginY; Width = EndX-BeginX
        const anchorLocalX = conn.labelAnchor === "source" ? 0 : dx / 2;
        const anchorLocalY = conn.labelAnchor === "source" ? 0 : dy / 2;
        const charW = 0.07;
        const labelW = Math.max(0.3, conn.label.length * charW + 0.1);
        const labelH = 0.18;
        return (
          `<Cell N='TxtPinX' V='${anchorLocalX + labelOX}'/>` +
          `<Cell N='TxtPinY' V='${anchorLocalY + labelOY}'/>` +
          `<Cell N='TxtWidth' V='${labelW}'/>` +
          `<Cell N='TxtHeight' V='${labelH}'/>` +
          `<Cell N='TxtLocPinX' V='${labelW / 2}' F='TxtWidth*0.5'/>` +
          `<Cell N='TxtLocPinY' V='${labelH / 2}' F='TxtHeight*0.5'/>` +
          `<Cell N='TxtAngle' V='0'/>`
        );
      })() +
      `<Section N='Character'><Row IX='0'><Cell N='Size' V='0.1111111111111111'/></Row></Section>` +
      `<Section N='Paragraph'><Row IX='0'><Cell N='HorzAlign' V='1'/></Row></Section>` +
      geom +
      (conn.label ? `<Text>${esc(conn.label)}</Text>` : "") +
      `</Shape>`
    );

    connects.push(
      `<Connect FromSheet='${shapeId}' FromCell='BeginX' FromPart='9' ToSheet='${srcShapeId}' ToCell='PinX' ToPart='3'/>` +
      `<Connect FromSheet='${shapeId}' FromCell='EndX' FromPart='12' ToSheet='${tgtShapeId}' ToCell='PinX' ToPart='3'/>`
    );
  }

  // Build ZIP — copy ALL stencil files, then replace/add what we need
  const zip = new JSZip();

  // Copy every non-directory file from the stencil
  for (const [filePath, entry] of Object.entries(stencil.files)) {
    if (!entry.dir) {
      zip.file(filePath, await entry.async("uint8array"));
    }
  }

  // Replace [Content_Types].xml — stencil→drawing + add page1
  let ct = await stencil.file("[Content_Types].xml")!.async("string");
  ct = ct.replace("application/vnd.ms-visio.stencil.main+xml",
                   "application/vnd.ms-visio.drawing.main+xml");
  if (!ct.includes("page1.xml")) {
    ct = ct.replace("</Types>",
      '<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/></Types>');
  }
  zip.file("[Content_Types].xml", ct);

  // Add pages rels (stencil doesn't have this)
  zip.file("visio/pages/_rels/pages.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>' +
    '</Relationships>');

  // Replace pages.xml — use inch-based scale (matching the working test script)
  zip.file("visio/pages/pages.xml",
    "<?xml version='1.0' encoding='utf-8' ?>" +
    "<Pages xmlns='http://schemas.microsoft.com/office/visio/2012/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xml:space='preserve'>" +
    `<Page ID='0' NameU='Page-1' Name='Page-1' ViewScale='-1' ViewCenterX='${pageW / 2}' ViewCenterY='${pageH / 2}'>` +
    "<PageSheet LineStyle='0' FillStyle='0' TextStyle='0'>" +
    `<Cell N='PageWidth' V='${pageW}'/>` +
    `<Cell N='PageHeight' V='${pageH}'/>` +
    "<Cell N='ShdwOffsetX' V='0.118'/>" +
    "<Cell N='ShdwOffsetY' V='-0.118'/>" +
    "<Cell N='PageScale' V='0.03937007874015748' U='MM'/>" +
    "<Cell N='DrawingScale' V='0.03937007874015748' U='MM'/>" +
    "<Cell N='DrawingSizeType' V='0'/>" +
    "<Cell N='DrawingScaleType' V='0'/>" +
    "<Cell N='InhibitSnap' V='0'/>" +
    "<Cell N='UIVisibility' V='0'/>" +
    "<Cell N='ShdwType' V='0'/>" +
    "<Cell N='ShdwObliqueAngle' V='0'/>" +
    "<Cell N='ShdwScaleFactor' V='1'/>" +
    "<Cell N='DrawingResizeType' V='1'/>" +
    "<Cell N='PageShapeSplit' V='1'/>" +
    "</PageSheet>" +
    "<Rel r:id='rId1'/>" +
    "</Page></Pages>");

  // Replace windows.xml — add drawing window + stencil reference
  zip.file("visio/windows.xml",
    "<?xml version='1.0' encoding='utf-8' ?>" +
    "<Windows ClientWidth='1024' ClientHeight='768' xmlns='http://schemas.microsoft.com/office/visio/2012/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xml:space='preserve'>" +
    "<Window ID='0' WindowType='Drawing' WindowState='1073742340' WindowLeft='-1' WindowTop='-1' WindowWidth='1024' WindowHeight='768' " +
    `ViewScale='-1' ViewCenterX='${pageW / 2}' ViewCenterY='${pageH / 2}' TabSplitterPos='0.5'>` +
    "<StencilGroup StencilGroupPos='0'/>" +
    "</Window>" +
    "<Window ID='1' WindowType='Stencil' WindowState='0' " +
    "Document='BPMN Diagram Shapes v4.6.vssx' WindowLeft='0' WindowTop='0' WindowWidth='250' WindowHeight='768'/>" +
    "</Windows>");

  // Add page1.xml with shapes and connectors
  zip.file("visio/pages/page1.xml",
    "<?xml version='1.0' encoding='utf-8' ?>" +
    "<PageContents xmlns='http://schemas.microsoft.com/office/visio/2012/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xml:space='preserve'>" +
    "<Shapes>" + shapes.join("") + "</Shapes>" +
    (connects.length > 0 ? "<Connects>" + connects.join("") + "</Connects>" : "") +
    "</PageContents>");

  // Doc props
  zip.file("docProps/core.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${diagram.name}</dc:title><dc:creator>Diagramatix</dc:creator>` +
    '</cp:coreProperties>');

  zip.file("docProps/app.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Application>Diagramatix</Application></Properties>');

  const outBuf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });

  return new NextResponse(outBuf as any, {
    headers: {
      "Content-Type": "application/vnd.ms-visio.drawing",
      "Content-Disposition": `attachment; filename="${diagram.name}.vsdx"`,
    },
  });
}
