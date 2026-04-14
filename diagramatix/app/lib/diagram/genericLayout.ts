/**
 * Simple grid layout for non-BPMN AI-generated diagrams.
 * Positions elements in a grid and creates connectors with waypoints.
 */

import type { DiagramData, DiagramElement, Connector, Point } from "./types";
import { getSymbolDefinition } from "./symbols/definitions";
import { computeWaypoints } from "./routing";
import { CHEVRON_THEMES } from "./chevronThemes";

const GARDEN_THEME = CHEVRON_THEMES.find(t => t.name === "Garden")!;
const CHEVRON_OVERLAP = 10; // 10px overlap for snapped processes
const CHARS_PER_PX = 0.14; // approximate characters per pixel at 12px font

/**
 * Wrap a label at word boundaries to fit within maxWidth pixels.
 * Returns multi-line label (joined with \n) and the number of lines.
 * If a single word is too long, it stays on one line (will need width expansion).
 */
function wrapLabel(label: string, maxWidth: number): { text: string; lines: number; fits: boolean } {
  const maxChars = Math.floor(maxWidth * CHARS_PER_PX);
  if (label.length <= maxChars) return { text: label, lines: 1, fits: true };

  const words = label.split(/\s+/);
  const result: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + " " + word).length <= maxChars) {
      current += " " + word;
    } else {
      result.push(current);
      current = word;
    }
  }
  if (current) result.push(current);

  // Check if all lines fit
  const fits = result.every(line => line.length <= maxChars);
  return { text: result.join("\n"), lines: result.length, fits };
}

const GRID_GAP_X = 60;
const GRID_GAP_Y = 40;
const START_X = 100;
const START_Y = 100;

interface AiParsed {
  elements?: Array<{
    id: string;
    type: string;
    label?: string;
    name?: string;
    description?: string;
    group?: string;
    parent?: string;
    attributes?: Array<{ name: string; type?: string; visibility?: string }>;
    values?: string[];
    [key: string]: unknown;
  }>;
  connections?: Array<{
    sourceId: string;
    targetId: string;
    label?: string;
    type?: string;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
  }>;
}

export function layoutGenericDiagram(
  parsed: AiParsed,
  diagramType: string,
): DiagramData {
  const aiElements = parsed.elements ?? [];
  const aiConnections = parsed.connections ?? [];

  // Context diagrams: special circular layout
  if (diagramType === "context" || diagramType === "basic") {
    return layoutContextDiagram(aiElements, aiConnections);
  }

  const elements: DiagramElement[] = [];
  const connectors: Connector[] = [];

  // Separate containers from regular elements
  const CONTAINER_TYPES = new Set(["process-group", "system-boundary", "composite-state"]);
  const containers = aiElements.filter(e => CONTAINER_TYPES.has(e.type));
  const regularEls = aiElements.filter(e => !CONTAINER_TYPES.has(e.type));

  const isValueChain = diagramType === "value-chain";
  const isProcessContext = diagramType === "process-context";

  // Layout containers first (large, in a row)
  let containerX = START_X;
  let containerY = START_Y;
  const containerMap = new Map<string, DiagramElement>();
  for (let i = 0; i < containers.length; i++) {
    const ai = containers[i];
    const label = ai.label ?? ai.name ?? ai.type;
    const childCount = regularEls.filter(e => e.group === ai.id || e.parent === ai.id).length;
    let w: number, h: number;

    if (isValueChain) {
      const childWidth = childCount * 140 - (childCount - 1) * CHEVRON_OVERLAP + 60;
      w = Math.max(200, childWidth);
      h = Math.max(200, 78 + 120 + 40);
    } else if (isProcessContext) {
      // Portrait: 2 use-cases wide, stack rows vertically with gaps
      const cols = 2;
      const ucW = 120, ucH = 60;
      const rows = Math.ceil(childCount / cols);
      w = cols * ucW + (cols - 1) * 30 + 80; // 2 columns + gaps + padding
      h = Math.max(200, rows * ucH + (rows - 1) * 30 + 80); // rows + gaps + header + bottom padding
    } else {
      w = Math.max(200, (childCount + 1) * 180);
      h = Math.max(120, 100);
    }
    const el: DiagramElement = {
      id: ai.id, type: ai.type as DiagramElement["type"],
      x: START_X, y: containerY, width: w, height: h,
      label, properties: {},
    };
    elements.push(el);
    containerMap.set(ai.id, el);
    containerY += h + GRID_GAP_Y;
  }

  // Layout regular elements in a grid, grouped by container
  const placed = new Set<string>();
  let gardenIdx = 0; // Garden theme colour index for value chain processes

  // Place elements within containers
  for (const [containerId, container] of containerMap) {
    const children = regularEls.filter(e =>
      e.group === containerId || e.parent === containerId
    );

    // Process-context: 2-column portrait grid within the boundary
    if (isProcessContext) {
      const cols = 2;
      const padX = 40, padTop = 50, gapX = 30, gapY = 30;
      const ucDef = getSymbolDefinition("use-case");
      for (let ci = 0; ci < children.length; ci++) {
        const ai = children[ci];
        const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
        const col = ci % cols;
        const row = Math.floor(ci / cols);
        const ex = container.x + padX + col * (ucDef.defaultWidth + gapX);
        const ey = container.y + padTop + row * (ucDef.defaultHeight + gapY);
        const label = ai.label ?? ai.name ?? ai.type;
        const el: DiagramElement = {
          id: ai.id, type: ai.type as DiagramElement["type"],
          x: ex, y: ey, width: def.defaultWidth, height: def.defaultHeight,
          label, properties: buildProperties(ai, diagramType),
          parentId: containerId,
        };
        elements.push(el);
        placed.add(ai.id);
      }
      // Resize container to fit children if needed
      if (children.length > 0) {
        const rows = Math.ceil(children.length / cols);
        const neededH = padTop + rows * (ucDef.defaultHeight + gapY) + 20;
        container.height = Math.max(container.height, neededH);
      }
    } else {
      // Value chains and other diagram types: horizontal row
      const cy = container.y + 40;

      // For value chains, pre-wrap labels and determine if width expansion is needed
      let chevronW = getSymbolDefinition("chevron").defaultWidth;
      if (isValueChain) {
        const textW = chevronW - 40;
        let needsWider = false;
        for (const ai of children) {
          if (ai.type === "chevron" || ai.type === "chevron-collapsed") {
            const rawLabel = ai.label ?? ai.name ?? ai.type;
            const wrapped = wrapLabel(rawLabel, textW);
            if (!wrapped.fits || wrapped.lines > 3) needsWider = true;
          }
        }
        if (needsWider) chevronW = Math.min(220, chevronW + 60);
      }

      let cx = container.x + 30;
      for (const ai of children) {
        const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
        let label = ai.label ?? ai.name ?? ai.type;
        const props = buildProperties(ai, diagramType);
        let elW = def.defaultWidth;

        // Value chain: wrap labels and apply Garden theme colour
        if (isValueChain && (ai.type === "chevron" || ai.type === "chevron-collapsed")) {
          elW = chevronW;
          const textW = elW - 40;
          const wrapped = wrapLabel(label, textW);
          label = wrapped.text;
          props.fillColor = GARDEN_THEME.colours[gardenIdx % GARDEN_THEME.colours.length];
          gardenIdx++;
        }

        const el: DiagramElement = {
          id: ai.id, type: ai.type as DiagramElement["type"],
          x: cx, y: cy, width: elW, height: def.defaultHeight,
          label, properties: props,
          parentId: containerId,
        };
        elements.push(el);
        placed.add(ai.id);

        // Value chain: snap processes with 10px overlap; others: use gap
        if (isValueChain && (ai.type === "chevron" || ai.type === "chevron-collapsed")) {
          cx += elW - CHEVRON_OVERLAP;
        } else {
          cx += elW + GRID_GAP_X;
        }
      }
      // Resize container to fit children
      if (children.length > 0) {
        container.width = Math.max(container.width, cx - container.x + 30);
      }
    }
  }

  // Place uncontained elements in a grid
  const unplaced = regularEls.filter(e => !placed.has(e.id));
  const startY = containerY > START_Y ? containerY : START_Y;
  let col = 0;
  let curX = START_X;
  let curY = startY;
  let rowH = 0;
  const MAX_COLS = diagramType === "value-chain" ? 8 : 4;

  // For value chain uncontained, pre-check if width expansion needed
  let unplacedChevronW = getSymbolDefinition("chevron").defaultWidth;
  if (isValueChain) {
    const textW = unplacedChevronW - 40;
    let needsWider = false;
    for (const ai of unplaced) {
      if (ai.type === "chevron" || ai.type === "chevron-collapsed") {
        const rawLabel = ai.label ?? ai.name ?? ai.type;
        const wrapped = wrapLabel(rawLabel, textW);
        if (!wrapped.fits || wrapped.lines > 3) needsWider = true;
      }
    }
    if (needsWider) unplacedChevronW = Math.min(220, unplacedChevronW + 60);
  }

  for (const ai of unplaced) {
    if (col >= MAX_COLS) { col = 0; curX = START_X; curY += rowH + GRID_GAP_Y; rowH = 0; }
    const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
    let label = ai.label ?? ai.name ?? ai.type;
    const props = buildProperties(ai, diagramType);
    let elW = def.defaultWidth;

    // Value chain: wrap labels and apply Garden theme colour
    if (isValueChain && (ai.type === "chevron" || ai.type === "chevron-collapsed")) {
      elW = unplacedChevronW;
      const textW = elW - 40;
      const wrapped = wrapLabel(label, textW);
      label = wrapped.text;
      props.fillColor = GARDEN_THEME.colours[gardenIdx % GARDEN_THEME.colours.length];
      gardenIdx++;
    }

    const el: DiagramElement = {
      id: ai.id, type: ai.type as DiagramElement["type"],
      x: curX, y: curY, width: elW, height: def.defaultHeight,
      label, properties: props,
    };
    elements.push(el);
    rowH = Math.max(rowH, def.defaultHeight);
    // Value chain: snap; others: gap
    if (isValueChain && (ai.type === "chevron" || ai.type === "chevron-collapsed")) {
      curX += elW - CHEVRON_OVERLAP;
    } else {
      curX += elW + GRID_GAP_X;
    }
    col++;
  }

  // Create connectors
  const elMap = new Map(elements.map(e => [e.id, e]));

  // Default connector type per diagram type
  const defaultConnType: Record<string, string> = {
    "state-machine": "transition",
    "value-chain": "sequence",
    domain: "uml-association",
    context: "flow",
    "process-context": "association",
  };
  const defaultRouting: Record<string, string> = {
    "state-machine": "curvilinear",
    context: "curvilinear",
    "process-context": "direct",
    domain: "rectilinear",
    "value-chain": "rectilinear",
  };
  const defaultDirection: Record<string, string> = {
    "state-machine": "open-directed",
    context: "open-directed",
    "process-context": "non-directed",
    domain: "non-directed",
    "value-chain": "directed",
  };

  for (const c of aiConnections) {
    const src = elMap.get(c.sourceId);
    const tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;

    const connType = c.type ?? defaultConnType[diagramType] ?? "sequence";
    const routing = defaultRouting[diagramType] ?? "rectilinear";
    const direction = defaultDirection[diagramType] ?? "directed";

    // Determine sides
    const srcCx = src.x + src.width / 2;
    const tgtCx = tgt.x + tgt.width / 2;
    const srcCy = src.y + src.height / 2;
    const tgtCy = tgt.y + tgt.height / 2;
    let srcSide: string, tgtSide: string;
    if (Math.abs(tgtCy - srcCy) > Math.abs(tgtCx - srcCx)) {
      srcSide = tgtCy > srcCy ? "bottom" : "top";
      tgtSide = tgtCy > srcCy ? "top" : "bottom";
    } else {
      srcSide = "right";
      tgtSide = "left";
    }

    const conn: Connector = {
      id: `conn-${c.sourceId}-${c.targetId}`,
      sourceId: c.sourceId, targetId: c.targetId,
      sourceSide: srcSide as Connector["sourceSide"],
      targetSide: tgtSide as Connector["targetSide"],
      type: connType as Connector["type"],
      directionType: direction as Connector["directionType"],
      routingType: routing as Connector["routingType"],
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints: [] as Point[],
      label: c.label ?? "",
      ...(c.sourceMultiplicity ? { sourceMultiplicity: c.sourceMultiplicity } : {}),
      ...(c.targetMultiplicity ? { targetMultiplicity: c.targetMultiplicity } : {}),
    } as Connector;
    connectors.push(conn);
  }

  // Compute waypoints
  const computed = connectors.map(conn => {
    const src = elMap.get(conn.sourceId);
    const tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    try {
      const r = computeWaypoints(src, tgt, elements, conn.sourceSide, conn.targetSide, conn.routingType, 0.5, 0.5);
      return { ...conn, waypoints: r.waypoints, sourceInvisibleLeader: r.sourceInvisibleLeader, targetInvisibleLeader: r.targetInvisibleLeader };
    } catch { return conn; }
  });

  return {
    elements,
    connectors: computed,
    viewport: { x: 0, y: 0, zoom: 0.7 },
    fontSize: 12,
    connectorFontSize: 10,
  };
}

/** Build element properties from AI output */
function buildProperties(ai: Record<string, unknown>, diagramType: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  // Value chain process description
  if ((ai.type === "chevron" || ai.type === "chevron-collapsed") && ai.description) {
    props.description = ai.description;
    props.showDescription = true;
  }

  // UML class attributes
  if (ai.type === "uml-class" && Array.isArray(ai.attributes)) {
    props.showAttributes = true;
    props.showOperations = false;
    props.stereotype = diagramType === "domain" ? "entity" : "entity";
    props.showStereotype = true;
    props.attributes = (ai.attributes as Array<Record<string, unknown>>).map((a, i) => ({
      visibility: a.visibility ?? "+",
      name: a.name ?? `attr${i}`,
      type: a.type,
    }));
  }

  // UML enumeration values
  if (ai.type === "uml-enumeration" && Array.isArray(ai.values)) {
    props.stereotype = "enumeration";
    props.showStereotype = true;
    props.values = ai.values;
  }

  return props;
}

/** Layout context diagrams: central process with entities arranged in a circle */
function layoutContextDiagram(
  aiElements: AiParsed["elements"] & object[],
  aiConnections: AiParsed["connections"] & object[],
): DiagramData {
  const elements: DiagramElement[] = [];
  const connectors: Connector[] = [];

  // Find the central process (process-system) and entities (external-entity)
  const central = aiElements.find(e => e.type === "process-system");
  const entities = aiElements.filter(e => e.type === "external-entity");

  // Central process: large, in the centre
  const centerX = 500;
  const centerY = 400;
  const processW = 200;
  const processH = 200;

  if (central) {
    elements.push({
      id: central.id,
      type: "process-system",
      x: centerX - processW / 2,
      y: centerY - processH / 2,
      width: processW,
      height: processH,
      label: central.label ?? central.name ?? "System",
      properties: {},
    });
  }

  // Arrange entities in a circle around the process
  const radius = 300; // distance from centre to entity centre
  const entityCount = entities.length;

  for (let i = 0; i < entityCount; i++) {
    const ent = entities[i];
    // Distribute evenly around the circle, starting from top
    const angle = (i / entityCount) * 2 * Math.PI - Math.PI / 2;
    const def = getSymbolDefinition("external-entity");
    const ex = centerX + radius * Math.cos(angle) - def.defaultWidth / 2;
    const ey = centerY + radius * Math.sin(angle) - def.defaultHeight / 2;

    elements.push({
      id: ent.id,
      type: "external-entity",
      x: ex,
      y: ey,
      width: def.defaultWidth,
      height: def.defaultHeight,
      label: ent.label ?? ent.name ?? "Entity",
      properties: {},
    });
  }

  // Create connectors with angle-based side selection to avoid crossings
  const elMap = new Map(elements.map(e => [e.id, e]));
  const centralEl = central ? elMap.get(central.id) : undefined;

  // Determine the best side based on angle from one element's centre to another's
  // This ensures connectors radiate outward naturally without crossing
  function angleSide(fromX: number, fromY: number, toX: number, toY: number): string {
    const angle = Math.atan2(toY - fromY, toX - fromX); // -PI to PI
    // Map angle to nearest side:
    //   right: -45° to 45°    (−π/4 to π/4)
    //   bottom: 45° to 135°   (π/4 to 3π/4)
    //   left: 135° to -135°   (3π/4 to π or -π to -3π/4)
    //   top: -135° to -45°    (-3π/4 to -π/4)
    if (angle >= -Math.PI / 4 && angle < Math.PI / 4) return "right";
    if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) return "bottom";
    if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) return "top";
    return "left";
  }

  // Track offset along each side per element so multiple endpoints are spread out
  const sideOffsets = new Map<string, Map<string, number>>(); // elId → side → next offset fraction

  function getOffset(elId: string, side: string, total: number): number {
    if (!sideOffsets.has(elId)) sideOffsets.set(elId, new Map());
    const offsets = sideOffsets.get(elId)!;
    const count = offsets.get(side) ?? 0;
    offsets.set(side, count + 1);
    // Spread evenly: if total connections on this side = n, positions are 1/(n+1), 2/(n+1), etc.
    // But we don't know total in advance, so use incremental spacing
    return 0.3 + count * 0.2; // 0.3, 0.5, 0.7 for up to 3 connections per side
  }

  function getBestSides(src: DiagramElement, tgt: DiagramElement): { srcSide: string; tgtSide: string; srcOffset: number; tgtOffset: number } {
    const srcCx = src.x + src.width / 2;
    const srcCy = src.y + src.height / 2;
    const tgtCx = tgt.x + tgt.width / 2;
    const tgtCy = tgt.y + tgt.height / 2;

    // Source side: direction from source towards target
    const srcSide = angleSide(srcCx, srcCy, tgtCx, tgtCy);
    // Target side: direction from target towards source (opposite direction)
    const tgtSide = angleSide(tgtCx, tgtCy, srcCx, srcCy);

    const srcOffset = getOffset(src.id, srcSide, 1);
    const tgtOffset = getOffset(tgt.id, tgtSide, 1);

    return { srcSide, tgtSide, srcOffset, tgtOffset };
  }

  for (const c of aiConnections) {
    const src = elMap.get(c.sourceId);
    const tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;

    const { srcSide, tgtSide, srcOffset, tgtOffset } = getBestSides(src, tgt);

    connectors.push({
      id: `conn-${c.sourceId}-${c.targetId}`,
      sourceId: c.sourceId,
      targetId: c.targetId,
      sourceSide: srcSide as Connector["sourceSide"],
      targetSide: tgtSide as Connector["targetSide"],
      sourceOffsetAlong: Math.max(0.1, Math.min(0.9, srcOffset)),
      targetOffsetAlong: Math.max(0.1, Math.min(0.9, tgtOffset)),
      type: "flow",
      directionType: "open-directed",
      routingType: "curvilinear",
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints: [] as Point[],
      label: c.label ?? "",
    } as Connector);
  }

  // Compute waypoints using offset values for separated endpoints
  const computed = connectors.map(conn => {
    const src = elMap.get(conn.sourceId);
    const tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    try {
      const r = computeWaypoints(src, tgt, elements, conn.sourceSide, conn.targetSide, conn.routingType,
        conn.sourceOffsetAlong ?? 0.5, conn.targetOffsetAlong ?? 0.5);
      return { ...conn, waypoints: r.waypoints, sourceInvisibleLeader: r.sourceInvisibleLeader, targetInvisibleLeader: r.targetInvisibleLeader };
    } catch { return conn; }
  });

  return {
    elements,
    connectors: computed,
    viewport: { x: 0, y: 0, zoom: 0.7 },
    fontSize: 12,
    connectorFontSize: 10,
  };
}
