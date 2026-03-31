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

  // Visio master default dimensions in inches (from stencil master XML values).
  // Master Width V='0.984' U='MM' = 0.984mm ≈ 0.0387 inches.
  // BUT: these values are interpreted as inches on our inch-based page, so
  // the visual size is the raw value in inches (0.984 inches ≈ 25mm).
  const VISIO_SIZES: Record<string, { w: number; h: number }> = {
    "start-event":        { w: 0.394, h: 0.394 },
    "end-event":          { w: 0.394, h: 0.394 },
    "intermediate-event": { w: 0.394, h: 0.394 },
    "gateway":            { w: 0.591, h: 0.472 },
    "task":               { w: 0.984, h: 0.787 },
    "subprocess":         { w: 0.984, h: 0.787 },
    "subprocess-expanded":{ w: 0.984, h: 0.787 },
    "data-object":        { w: 0.394, h: 0.472 },
    "data-store":         { w: 0.591, h: 0.394 },
    "group":              { w: 2.953, h: 1.969 },
    "text-annotation":    { w: 0.984, h: 0.394 },
  };

  // Build shapes
  const shapes: string[] = [];
  const connects: string[] = [];
  const elIdToShapeId = new Map<string, number>();
  // Track the actual Visio dimensions for each element (for connector endpoint calculation)
  const elVisioInfo = new Map<string, { cx: number; cy: number; w: number; h: number }>();
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

    const visioDefault = VISIO_SIZES[el.type];
    const isSubprocess = el.type === "subprocess" || el.type === "subprocess-expanded";
    let vw: number, vh: number;
    if (isPool || isSubprocess) {
      // Pools and subprocesses use Diagramatix dimensions
      vw = dgxW;
      vh = dgxH;
    } else {
      vw = visioDefault ? visioDefault.w : dgxW;
      vh = visioDefault ? visioDefault.h : dgxH;
    }

    // Store actual Visio dimensions for connector calculation
    elVisioInfo.set(el.id, { cx, cy, w: vw, h: vh });

    let textEl = "";
    let propSection = "";
    let extraCells = "";
    let sizeCells = "";

    // Subprocesses: draw without master to control marker size
    if (isSubprocess) {
      const markerSize = 0.12; // small + marker
      const markerX = vw / 2;
      const markerBottom = 0.06;
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
        `<Cell N='FillForegnd' V='#FFFFFF'/>` +
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
      // Draw pools as simple rectangles — the master's sub-shape formulas don't
      // recalculate properly with custom Width/Height.
      // We'll create the pool shape without a Master reference.
      shapes.push(
        `<Shape ID='${shapeId}' NameU='${esc(el.label || "Pool")}' Type='Shape'>` +
        `<Cell N='PinX' V='${cx}'/>` +
        `<Cell N='PinY' V='${cy}'/>` +
        `<Cell N='Width' V='${vw}'/>` +
        `<Cell N='Height' V='${vh}'/>` +
        `<Cell N='LocPinX' V='${vw / 2}' F='Width*0.5'/>` +
        `<Cell N='LocPinY' V='${vh / 2}' F='Height*0.5'/>` +
        `<Cell N='LineWeight' V='0.02083333333333333'/>` +
        `<Cell N='LineColor' V='0'/>` +
        `<Cell N='FillForegnd' V='#FFFFFF'/>` +
        `<Cell N='FillPattern' V='1'/>` +
        `<Cell N='Rounding' V='0.04'/>` +
        `<Section N='Geometry' IX='0'>` +
        `<Cell N='NoFill' V='0'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        `<Row T='MoveTo' IX='1'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='2'><Cell N='X' V='${vw}' F='Width*1'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='3'><Cell N='X' V='${vw}' F='Width*1'/><Cell N='Y' V='${vh}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='4'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='${vh}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='5'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `</Section>` +
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
    } else if (isEvent && el.label) {
      // Events: don't set Text on the group (causes vertical text).
      // Separate label shape created below.
      propSection = `<Section N='Property'><Row N='BpmnName'><Cell N='Value' V='${esc(el.label)}' U='STR'/></Row></Section>`;
    } else if (isDataObject) {
      // Data objects: don't set Text on group — separate label + state shapes below
      if (el.label) {
        propSection = `<Section N='Property'><Row N='BpmnName'><Cell N='Value' V='${esc(el.label)}' U='STR'/></Row></Section>`;
      }
    } else if (el.label) {
      propSection = `<Section N='Property'><Row N='BpmnName'><Cell N='Value' V='${esc(el.label)}' U='STR'/></Row></Section>`;
      textEl = `<Text>${esc(el.label)}</Text>`;
    }

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
    const w = Math.max(0.4, text.length * charW + 0.1);
    const h = 0.2;
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
      `<Text>${esc(text)}</Text>` +
      `</Shape>`
    );
  }

  // Create separate labels for events, pools, and data objects
  for (const el of elements) {
    const info = elVisioInfo.get(el.id);
    if (!info) continue;

    const isEvent = el.type === "start-event" || el.type === "end-event" || el.type === "intermediate-event";
    const isPool = el.type === "pool";
    const isDataObject = el.type === "data-object";

    // Event labels — below the circle
    if (isEvent && el.label) {
      const labelY = info.cy - info.h / 2 - 0.15;
      shapes.push(makeTextLabel(el.label, info.cx, labelY));
    }

    // Pool sidebar — brown header with vertical text (rotated -90°, reading bottom-to-top)
    if (isPool && el.label) {
      const labelId = nextId;
      nextId += 100;
      const sidebarW = 0.32; // ~30px at 96dpi
      const labelX = info.cx - info.w / 2 + sidebarW / 2;
      const labelY = info.cy;
      // Rotate the entire shape -90° (270° = 4.712 radians) to get bottom-to-top text
      // but keep the shape itself as a tall narrow rectangle
      shapes.push(
        `<Shape ID='${labelId}' NameU='${esc(el.label)} label' Type='Shape'>` +
        `<Cell N='PinX' V='${labelX}'/>` +
        `<Cell N='PinY' V='${labelY}'/>` +
        `<Cell N='Width' V='${sidebarW}'/>` +
        `<Cell N='Height' V='${info.h}'/>` +
        `<Cell N='LocPinX' V='${sidebarW / 2}' F='Width*0.5'/>` +
        `<Cell N='LocPinY' V='${info.h / 2}' F='Height*0.5'/>` +
        `<Cell N='Angle' V='0'/>` +
        `<Cell N='LineWeight' V='0.02083333333333333'/>` +
        `<Cell N='LineColor' V='0'/>` +
        `<Cell N='FillForegnd' V='#c8956a'/>` +
        `<Cell N='FillPattern' V='1'/>` +
        `<Cell N='TxtPinX' V='${sidebarW / 2}' F='Width*0.5'/>` +
        `<Cell N='TxtPinY' V='${info.h / 2}' F='Height*0.5'/>` +
        `<Cell N='TxtWidth' V='${info.h}'/>` +
        `<Cell N='TxtHeight' V='${sidebarW}'/>` +
        `<Cell N='TxtLocPinX' V='${info.h / 2}' F='TxtWidth*0.5'/>` +
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
        `<Row T='LineTo' IX='3'><Cell N='X' V='${sidebarW}' F='Width*1'/><Cell N='Y' V='${info.h}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='4'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='${info.h}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='5'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `</Section>` +
        `<Text>${esc(el.label)}</Text>` +
        `</Shape>`
      );
    }

    // Data object label — below the shape
    if (isDataObject && el.label) {
      const labelY = info.cy - info.h / 2 - 0.15;
      shapes.push(makeTextLabel(el.label, info.cx, labelY));
    }

    // Data object state — below the label in [brackets]
    if (isDataObject) {
      const state = (el.properties as any)?.state;
      if (state) {
        const labelY = info.cy - info.h / 2 - 0.35;
        shapes.push(makeTextLabel(`[${state}]`, info.cx, labelY));
      }
    }
  }

  // Build connectors — use source/target element centers for Begin/End coordinates.
  // Visio will route the connector and snap to the nearest connection point on each shape.
  // Use dynamic connector properties so Visio handles routing.
  for (const conn of connectors) {
    const shapeId = nextId;
    nextId += 100;

    const srcShapeId = elIdToShapeId.get(conn.sourceId);
    const tgtShapeId = elIdToShapeId.get(conn.targetId);
    if (srcShapeId == null || tgtShapeId == null) continue;

    const srcInfo = elVisioInfo.get(conn.sourceId);
    const tgtInfo = elVisioInfo.get(conn.targetId);
    if (!srcInfo || !tgtInfo) continue;

    // Calculate connector attachment points on the Visio shape edges.
    function edgePoint(
      info: { cx: number; cy: number; w: number; h: number },
      side: string,
      offsetAlong?: number
    ) {
      const oa = offsetAlong ?? 0.5;
      switch (side) {
        case "right":  return { x: info.cx + info.w / 2, y: info.cy + info.h * (0.5 - oa) };
        case "left":   return { x: info.cx - info.w / 2, y: info.cy + info.h * (0.5 - oa) };
        case "top":    return { x: info.cx + info.w * (oa - 0.5), y: info.cy + info.h / 2 };
        case "bottom": return { x: info.cx + info.w * (oa - 0.5), y: info.cy - info.h / 2 };
        default:       return { x: info.cx + info.w / 2, y: info.cy };
      }
    }

    const srcPt = edgePoint(srcInfo, conn.sourceSide, conn.sourceOffsetAlong);
    const tgtPt = edgePoint(tgtInfo, conn.targetSide, conn.targetOffsetAlong);

    // messageBPMN connectors must be vertical — use the source x for both endpoints
    if (conn.type === "messageBPMN") {
      tgtPt.x = srcPt.x;
    }
    const bx = srcPt.x;
    const by = srcPt.y;
    const ex = tgtPt.x;
    const ey = tgtPt.y;

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
      endArrow = conn.directionType === "open-directed" ? "1" : "0";
      beginArrow = conn.directionType === "both" ? "1" : "0";
    }

    const dx = ex - bx;
    const dy = ey - by;

    // Geometry with Diagramatix waypoints, scaled to fit between Begin and End points.
    // Association connectors use direct (straight) lines — no intermediate waypoints.
    const isAssoc = conn.type === "associationBPMN";
    const wp = conn.waypoints ?? [];
    const visStart = conn.sourceInvisibleLeader ? 1 : 0;
    const visEnd = conn.targetInvisibleLeader ? wp.length - 2 : wp.length - 1;
    const visPts = wp.slice(visStart, visEnd + 1);

    let geomRows = `<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>`;
    if (!isAssoc && visPts.length > 2) {
      // Raw span from first to last waypoint (in inches)
      const rawDx = (visPts[visPts.length - 1].x - visPts[0].x) / 96;
      const rawDy = -(visPts[visPts.length - 1].y - visPts[0].y) / 96;
      // Scale factors to map raw waypoint span to actual Begin→End span
      const sx = Math.abs(rawDx) > 0.001 ? dx / rawDx : 1;
      const sy = Math.abs(rawDy) > 0.001 ? dy / rawDy : 1;

      for (let i = 1; i < visPts.length; i++) {
        const rawX = (visPts[i].x - visPts[0].x) / 96;
        const rawY = -(visPts[i].y - visPts[0].y) / 96;
        const rx = rawX * sx;
        const ry = rawY * sy;
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
      `<Cell N='LayerMember' V='0'/>` +
      geom +
      `</Shape>`
    );

    // Create separate text shape for connector label — selectable and moveable
    if (conn.label) {
      const labelId = nextId;
      nextId += 100;
      // Position label near the source end of the connector (matching Diagramatix placement)
      // Use labelAnchor and offsets if available, otherwise near source
      const labelOX = (conn.labelOffsetX ?? 0) / 96;
      const labelOY = (conn.labelOffsetY ?? -0.2 * 96) / 96;
      const anchorX = (bx + ex) / 2;
      const anchorY = (by + ey) / 2;
      const labelX = conn.labelAnchor === "source" ? bx + labelOX : anchorX + labelOX;
      const labelY = conn.labelAnchor === "source" ? by - labelOY : anchorY - labelOY; // flip Y offset
      const charW = 0.07;
      const labelW = Math.max(0.3, conn.label.length * charW + 0.1);
      const labelH = 0.18;

      shapes.push(
        `<Shape ID='${labelId}' NameU='${esc(conn.label)}' Type='Shape'>` +
        `<Cell N='PinX' V='${labelX}'/>` +
        `<Cell N='PinY' V='${labelY}'/>` +
        `<Cell N='Width' V='${labelW}'/>` +
        `<Cell N='Height' V='${labelH}'/>` +
        `<Cell N='LocPinX' V='${labelW / 2}' F='Width*0.5'/>` +
        `<Cell N='LocPinY' V='${labelH / 2}' F='Height*0.5'/>` +
        `<Cell N='Angle' V='0'/>` +
        `<Cell N='LinePattern' V='0'/>` +
        `<Cell N='FillPattern' V='0'/>` +
        `<Cell N='ShdwPattern' V='0'/>` +
        `<Cell N='TxtPinX' V='${labelW / 2}' F='Width*0.5'/>` +
        `<Cell N='TxtPinY' V='${labelH / 2}' F='Height*0.5'/>` +
        `<Cell N='TxtWidth' V='${labelW}' F='Width'/>` +
        `<Cell N='TxtHeight' V='${labelH}' F='Height'/>` +
        `<Cell N='TxtLocPinX' V='${labelW / 2}' F='TxtWidth*0.5'/>` +
        `<Cell N='TxtLocPinY' V='${labelH / 2}' F='TxtHeight*0.5'/>` +
        `<Cell N='TxtAngle' V='0'/>` +
        `<Section N='Character'><Row IX='0'><Cell N='Size' V='0.1111111111111111'/></Row></Section>` +
        `<Section N='Paragraph'><Row IX='0'><Cell N='HorzAlign' V='1'/></Row></Section>` +
        `<Section N='Geometry' IX='0'>` +
        `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='1'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        `<Row T='MoveTo' IX='1'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='2'><Cell N='X' V='${labelW}' F='Width*1'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `<Row T='LineTo' IX='3'><Cell N='X' V='${labelW}' F='Width*1'/><Cell N='Y' V='${labelH}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='4'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='${labelH}' F='Height*1'/></Row>` +
        `<Row T='LineTo' IX='5'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
        `</Section>` +
        `<Text>${esc(conn.label)}</Text>` +
        `</Shape>`
      );
    }

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
