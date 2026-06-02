/**
 * Simple grid layout for non-BPMN AI-generated diagrams.
 * Positions elements in a grid and creates connectors with waypoints.
 */

import type { DiagramData, DiagramElement, Connector, Point, Side } from "./types";
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
      // Portrait: 1 process per row, zigzag left/right, with space for actors outside
      const ucW = 120, ucH = 60, rowGap = 25;
      w = ucW * 2 + 100; // wide enough for zigzag left/right + padding
      h = Math.max(250, childCount * (ucH + rowGap) + 70); // rows stacked + header + bottom
    } else {
      w = Math.max(200, (childCount + 1) * 180);
      h = Math.max(120, 100);
    }
    // Process-context: offset boundary right to leave room for actors on the left
    const elX = isProcessContext ? START_X + 160 : START_X;
    const el: DiagramElement = {
      id: ai.id, type: ai.type as DiagramElement["type"],
      x: elX, y: containerY, width: w, height: h,
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

    // Process-context: zigzag layout — 1 process per row, alternating left/right
    if (isProcessContext) {
      const ucDef = getSymbolDefinition("use-case");
      const ucW = ucDef.defaultWidth, ucH = ucDef.defaultHeight;
      const padTop = 50, rowGap = 25;
      const leftX = container.x + 40; // left-side process position
      const rightX = container.x + container.width - ucW - 40; // right-side position

      for (let ci = 0; ci < children.length; ci++) {
        const ai = children[ci];
        const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
        const isLeft = ci % 2 === 0;
        const ex = isLeft ? leftX : rightX;
        const ey = container.y + padTop + ci * (ucH + rowGap);
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
        const neededH = padTop + children.length * (ucH + rowGap) + 20;
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

  // Process-context: position actors/teams/systems between their connected processes
  if (isProcessContext) {
    const ACTOR_TYPES = new Set(["actor", "team", "system", "hourglass"]);
    const actorEls = regularEls.filter(e => !placed.has(e.id) && ACTOR_TYPES.has(e.type));
    const elMap = new Map(elements.map(e => [e.id, e]));
    const aiConns = aiConnections;
    const container = [...containerMap.values()][0];
    const midX = container ? container.x + container.width / 2 : START_X + 200;

    // Collect occupied Y ranges per side to avoid overlap
    const leftOccupied: Array<{ top: number; bottom: number }> = [];
    const rightOccupied: Array<{ top: number; bottom: number }> = [];

    function findFreeY(occupied: Array<{ top: number; bottom: number }>, idealY: number, height: number): number {
      const GAP = 15;
      let y = idealY;
      // Push down if overlapping with any existing placement
      let conflict = true;
      while (conflict) {
        conflict = false;
        for (const r of occupied) {
          if (y < r.bottom + GAP && y + height > r.top - GAP) {
            y = r.bottom + GAP;
            conflict = true;
          }
        }
      }
      return y;
    }

    for (const ai of actorEls) {
      const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
      const label = ai.label ?? ai.name ?? ai.type;

      // Find connected processes
      const connectedProcessIds = aiConns
        .filter(c => c.sourceId === ai.id || c.targetId === ai.id)
        .map(c => c.sourceId === ai.id ? c.targetId : c.sourceId);
      const connectedProcesses = connectedProcessIds
        .map(pid => elMap.get(pid))
        .filter((e): e is DiagramElement => !!e);

      // Determine side: system and hourglass actors prefer the right; others follow connected processes
      let placeRight = ai.type === "system" || ai.type === "hourglass";
      if (connectedProcesses.length > 0 && ai.type !== "system" && ai.type !== "hourglass") {
        const rightCount = connectedProcesses.filter(p => p.x + p.width / 2 > midX).length;
        placeRight = rightCount > connectedProcesses.length / 2;
      }

      // Target Y: midpoint between the topmost and bottommost connected processes
      // This places the actor "between" its connected processes
      let idealY: number;
      if (connectedProcesses.length > 0) {
        const minY = Math.min(...connectedProcesses.map(p => p.y));
        const maxY = Math.max(...connectedProcesses.map(p => p.y + p.height));
        idealY = (minY + maxY) / 2 - def.defaultHeight / 2;
      } else {
        idealY = container ? container.y + 50 : START_Y;
      }

      const occupied = placeRight ? rightOccupied : leftOccupied;
      const targetY = findFreeY(occupied, idealY, def.defaultHeight);
      occupied.push({ top: targetY, bottom: targetY + def.defaultHeight });

      let ex: number;
      if (placeRight) {
        ex = container ? container.x + container.width + 60 : START_X + 500;
      } else {
        ex = container ? container.x - def.defaultWidth - 60 : START_X;
      }

      const el: DiagramElement = {
        id: ai.id, type: ai.type as DiagramElement["type"],
        x: ex, y: targetY, width: def.defaultWidth, height: def.defaultHeight,
        label, properties: buildProperties(ai, diagramType),
      };
      elements.push(el);
      placed.add(ai.id);
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
    let src = elMap.get(c.sourceId);
    let tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;

    const connType = c.type ?? defaultConnType[diagramType] ?? "sequence";
    const routing = defaultRouting[diagramType] ?? "rectilinear";
    let direction = defaultDirection[diagramType] ?? "directed";

    // Hourglass actors: ensure connector is directed from hourglass → process
    if (diagramType === "process-context") {
      const srcIsHourglass = src.type === "hourglass";
      const tgtIsHourglass = tgt.type === "hourglass";
      if (srcIsHourglass || tgtIsHourglass) {
        direction = "open-directed";
        // Ensure hourglass is the source (initiator)
        if (tgtIsHourglass && !srcIsHourglass) {
          const tmp = src; src = tgt; tgt = tmp;
        }
      }
    }

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
      id: `conn-${src.id}-${tgt.id}`,
      sourceId: src.id, targetId: tgt.id,
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

/** Convert a ray angle from the centre of `el` to a (rect-side, offset) on
 *  the element's bounding box. For circular elements (process-system /
 *  use-case) the caller passes the desired angle on the circle and this
 *  finds the matching point on the surrounding rect — the renderer then
 *  projects back onto the circle via ellipseEdgePoint, so the final
 *  attachment lands exactly on the circumference at that angle. */
function angleToRectSideOffset(angle: number, el: DiagramElement): { side: Side; offset: number } {
  const halfW = el.width / 2, halfH = el.height / 2;
  const cx = el.x + halfW, cy = el.y + halfH;
  const dxC = Math.cos(angle), dyC = Math.sin(angle);
  const angTL = Math.atan2(-halfH, -halfW);
  const angTR = Math.atan2(-halfH,  halfW);
  const angBL = Math.atan2( halfH, -halfW);
  const angBR = Math.atan2( halfH,  halfW);
  const clamp = (v: number) => Math.max(0.05, Math.min(0.95, v));
  if (angle > angTL && angle <= angTR) {
    const t = dyC !== 0 ? -halfH / dyC : 1;
    return { side: "top", offset: clamp((cx + dxC * t - el.x) / el.width) };
  } else if (angle > angTR && angle <= angBR) {
    const t = dxC !== 0 ? halfW / dxC : 1;
    return { side: "right", offset: clamp((cy + dyC * t - el.y) / el.height) };
  } else if (angle > angBR && angle <= angBL) {
    const t = dyC !== 0 ? halfH / dyC : 1;
    return { side: "bottom", offset: clamp((cx + dxC * t - el.x) / el.width) };
  } else {
    const t = dxC !== 0 ? -halfW / dxC : 1;
    return { side: "left", offset: clamp((cy + dyC * t - el.y) / el.height) };
  }
}

/** Layout context diagrams: central process with entities arranged in a
 *  circle. Implements the Context Diagram rules deterministically so the
 *  output matches the rules even when the model returns naive coordinates:
 *
 *  • C3.01 — Entity-side attachment points stay on the entity's primary
 *    inward face until K > 8; only then do the two perpendicular
 *    shoulders start filling. Attachment offsets within a face are at
 *    least 20 px apart when the face is wide enough.
 *  • C3.02 — Process-side attachment points cluster near each entity's
 *    bearing on the circle but are spaced at least 20 px apart along
 *    the circumference (capped when many connectors share one cluster).
 *  • C3.03 — Flow labels are staggered ALONG the connector axis within
 *    each entity's cluster so adjacent labels don't overlap and stay
 *    readable.
 *  • C3.04 — The process circle is sized from the connector count but
 *    its radius never grows by more than 15 % over the 100 px baseline,
 *    keeping the diagram compact.
 *  • C3.05 — Each entity is sized so its wrapped label fits inside the
 *    square shape; size scales with label length, capped at 160 px.
 *  • C3.06 — Entities sit at least 4 × the default entity width from
 *    the process edge to leave generous room for the flows.
 *  • C3.07 — Within each cluster the entity-side offset assignment is
 *    reversed when the primary face is "top" or "right", so the order
 *    of process-side angles always matches the order of entity-side
 *    offsets and connectors in the same cluster never cross. */
function layoutContextDiagram(
  aiElements: AiParsed["elements"] & object[],
  aiConnections: AiParsed["connections"] & object[],
): DiagramData {
  const elements: DiagramElement[] = [];
  const connectors: Connector[] = [];

  const central = aiElements.find(e => e.type === "process-system");
  const entities = aiElements.filter(e => e.type === "external-entity");

  const centerX = 500;
  const centerY = 400;

  // ── C3.04 — Size the process circle from the connector count, capped
  // at +15 % over the baseline so the circle stays compact. When the
  // ideal radius (30 px of arc per connector) exceeds the cap, connectors
  // share the available circumference at < 30 px each — the layout still
  // works but visible spacing tightens.
  const ARC_PER_CONN = 30;
  const MIN_RADIUS = 100;
  const MAX_RADIUS = Math.round(MIN_RADIUS * 1.15); // 115 px
  const totalConns = aiConnections.length;
  const requiredRadius = (totalConns * ARC_PER_CONN) / (2 * Math.PI);
  const processRadius = Math.round(
    Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, requiredRadius))
  );
  const processW = processRadius * 2;
  const processH = processRadius * 2;

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

  // ── C3.05 — Each entity is sized to fit its wrapped label inside a
  // square. The square side scales with label length: short labels stay
  // at the 80 px default; long ones grow up to 160 px. Formula derives
  // from the worst case that text fills the square (rendered font ≈ 12 px
  // tall, ~7 px wide per char). Inner padding leaves room for the box
  // stroke and a comfortable text margin.
  const def = getSymbolDefinition("external-entity");
  const DEFAULT_ENTITY_W = def.defaultWidth;
  const ENTITY_PAD = 16;
  const CHAR_W = 7;
  const LINE_H = 14;
  const MIN_SIDE = DEFAULT_ENTITY_W;
  const MAX_SIDE = 160;
  function entitySide(label: string): number {
    const n = Math.max(1, (label ?? "").trim().length);
    const ideal = Math.sqrt(CHAR_W * LINE_H * n) + 2 * ENTITY_PAD;
    return Math.round(Math.max(MIN_SIDE, Math.min(MAX_SIDE, ideal)) / 10) * 10;
  }
  const entityLabels = entities.map(e =>
    (e.label ?? e.name ?? "Entity") as string
  );
  const entitySides = entityLabels.map(entitySide);
  const maxEntityHalf = (entitySides.length > 0 ? Math.max(...entitySides) : MIN_SIDE) / 2;

  // ── C3.06 — Push entities at least 4 × the default entity width away
  // from the process edge so flows have generous room. The "+ max
  // entity half" term keeps the rule honoured even for the largest
  // entity in the diagram (which has the smallest entity-edge to
  // process-edge gap when entity sizes vary).
  const C3_06_GAP = 4 * DEFAULT_ENTITY_W;
  const entityRingRadius = processRadius + C3_06_GAP + maxEntityHalf;
  const entityCount = entities.length;
  const entityAngle = new Map<string, number>(); // id → angle on the layout circle
  const entitySideById = new Map<string, number>(); // id → square side px

  for (let i = 0; i < entityCount; i++) {
    const ent = entities[i];
    const side = entitySides[i];
    entitySideById.set(ent.id, side);
    const angle = (i / entityCount) * 2 * Math.PI - Math.PI / 2; // first entity at the top
    entityAngle.set(ent.id, angle);
    const ex = centerX + entityRingRadius * Math.cos(angle) - side / 2;
    const ey = centerY + entityRingRadius * Math.sin(angle) - side / 2;
    elements.push({
      id: ent.id,
      type: "external-entity",
      x: ex, y: ey,
      width: side,
      height: side,
      label: entityLabels[i],
      properties: {},
    });
  }

  const elMap = new Map(elements.map(e => [e.id, e]));
  const processEl = central ? elMap.get(central.id) : undefined;

  // Group every connector by the entity it touches so we can plan its
  // attachment in a single pass.
  type ConnGroup = { conn: AiParsed["connections"] extends (infer T)[] | undefined ? T : never; entIsSrc: boolean };
  const connByEntity = new Map<string, ConnGroup[]>();
  const ungroupedConns: typeof aiConnections = [];
  for (const c of aiConnections) {
    const entId = entityAngle.has(c.sourceId) ? c.sourceId
                : entityAngle.has(c.targetId) ? c.targetId : null;
    if (!entId) { ungroupedConns.push(c); continue; }
    const list = connByEntity.get(entId) ?? [];
    list.push({ conn: c, entIsSrc: c.sourceId === entId });
    connByEntity.set(entId, list);
  }

  // ── C3.01 (entity face spread) + C3.02 (circle cluster) + C3.03
  // (label stagger). For each entity:
  //   • Pick the 2 or 3 entity faces that face the central process
  //     (primary face + two perpendicular "shoulders") and round-robin
  //     connectors across them, with attachment points ≥ MIN_PX apart
  //     within each face when the face is wide enough.
  //   • Cluster each connector's process-side endpoint around the
  //     entity's bearing on the circle, with members spaced by the
  //     angle that corresponds to MIN_PX of arc. The cluster is capped
  //     so it never spills into an adjacent entity's angular slot.
  //   • Stagger each connector's label perpendicular to the connector's
  //     dominant axis so labels in the same cluster don't overlap.
  const MIN_PX = 20;
  const EDGE_PAD = 10; // px reserved at each end of a face
  // Maximum half-angle for any one entity's circle cluster — 80 % of the
  // half-slot it owns so adjacent clusters don't merge.
  const maxClusterHalf = entityCount > 0
    ? (Math.PI / Math.max(entityCount, 1)) * 0.8
    : Math.PI;
  // Angular spacing needed for MIN_PX of arc at the current radius.
  const minAngularSpacing = MIN_PX / processRadius;
  type Attach = {
    procSide: Side; procOffset: number;
    entSide: Side; entOffset: number;
    labelOffsetX: number; labelOffsetY: number;
  };
  const attachments = new Map<string, Attach>();
  const connKey = (c: { sourceId: string; targetId: string }, idx: number) =>
    `${c.sourceId}->${c.targetId}#${idx}`;

  // Track each AI connection's index so duplicates (same source/target
  // pair) get unique attachments.
  const connIdx = new Map<string, number>();
  function nextIdx(c: { sourceId: string; targetId: string }): number {
    const k = `${c.sourceId}->${c.targetId}`;
    const i = connIdx.get(k) ?? 0;
    connIdx.set(k, i + 1);
    return i;
  }

  /** Evenly distributed offsets along a single face, respecting the
   *  MIN_PX minimum spacing where possible. Falls back to uniform
   *  spread across the usable span when K is too high to honour
   *  MIN_PX. Returns fractional offsets in [EDGE_PAD/face, 1 - EDGE_PAD/face]. */
  function faceOffsets(K: number, facePx: number): number[] {
    if (K <= 0) return [];
    const usable = Math.max(0, facePx - 2 * EDGE_PAD);
    const requiredSpan = (K - 1) * MIN_PX;
    const span = Math.min(usable, requiredSpan);
    const startPx = EDGE_PAD + (usable - span) / 2;
    const step = K > 1 ? span / (K - 1) : 0;
    return Array.from({ length: K }, (_, i) => (startPx + i * step) / facePx);
  }

  for (const [entId, group] of connByEntity) {
    const theta = entityAngle.get(entId)!;
    const K = group.length;
    const entEl = elMap.get(entId)!;
    // Pick the entity's 2-3 inward-facing sides. The primary inward side
    // is the one perpendicular to (-cos θ, -sin θ) — the direction back
    // toward the process. The two adjacent sides are also still "inward"
    // for any reasonable circle layout.
    const inwardX = -Math.cos(theta), inwardY = -Math.sin(theta);
    let primary: Side, adj1: Side, adj2: Side;
    if (Math.abs(inwardX) > Math.abs(inwardY)) {
      primary = inwardX > 0 ? "right" : "left";
      adj1 = "top"; adj2 = "bottom";
    } else {
      primary = inwardY > 0 ? "bottom" : "top";
      adj1 = "left"; adj2 = "right";
    }
    // C3.01 — Keep every connector on the primary inward face until K > 8.
    // Only then start using the perpendicular shoulders, filling primary
    // first (8 max) and overflow round-robin between adj1 and adj2.
    const FACE_PRIMARY_CAP = 8;
    const faces: Side[] = K <= FACE_PRIMARY_CAP ? [primary] : [primary, adj1, adj2];
    const faceBuckets = new Map<Side, number[]>();
    faces.forEach(f => faceBuckets.set(f, []));
    if (K <= FACE_PRIMARY_CAP) {
      for (let k = 0; k < K; k++) faceBuckets.get(primary)!.push(k);
    } else {
      // First 8 stay on the primary face; the rest alternate adj1 / adj2.
      for (let k = 0; k < FACE_PRIMARY_CAP; k++) {
        faceBuckets.get(primary)!.push(k);
      }
      for (let k = FACE_PRIMARY_CAP; k < K; k++) {
        const shoulder = (k - FACE_PRIMARY_CAP) % 2 === 0 ? adj1 : adj2;
        faceBuckets.get(shoulder)!.push(k);
      }
    }
    // ── C3.07 — Reverse the bucket order on the primary face when the
    // entity sits in a position where the cluster's counterclockwise
    // direction maps to high offsets (primary face is "top" or "right").
    // This keeps the order of process-side angles aligned with the order
    // of entity-side offsets so connectors in the same cluster do not
    // cross each other.
    const reverseOrder = primary === "top" || primary === "right";
    if (reverseOrder) {
      const ks = faceBuckets.get(primary)!;
      faceBuckets.set(primary, ks.slice().reverse());
    }
    // Pre-compute offset arrays per face so MIN_PX spacing is enforced.
    const faceOffsetsByFace = new Map<Side, number[]>();
    for (const [face, ks] of faceBuckets) {
      const facePx = (face === "top" || face === "bottom")
        ? entEl.width : entEl.height;
      faceOffsetsByFace.set(face, faceOffsets(ks.length, facePx));
    }

    // ── C3.02 — cluster angular spread, with MIN_PX-driven spacing and
    // the per-entity cap so we don't bleed into the neighbour's slot.
    const desiredHalf = Math.max(0, (K - 1) * minAngularSpacing / 2);
    const clusterHalf = Math.min(desiredHalf, maxClusterHalf);

    // C3.03 — Stagger labels ALONG the connector's dominant axis so
    // adjacent labels in the same cluster sit at distinct distances
    // along the connector path. Horizontal-run clusters spread their
    // labels in X; vertical-run clusters spread in Y.
    const isHorizontalRun = Math.abs(Math.cos(theta)) >= Math.abs(Math.sin(theta));
    const LABEL_STAGGER = 22; // px between adjacent label centres
    const LABEL_BASELINE = -30; // default label-above-anchor offset

    for (let k = 0; k < K; k++) {
      const { conn: c } = group[k];
      const idx = nextIdx(c);
      // Cluster the process-side around theta.
      const ratio = K === 1 ? 0 : (k - (K - 1) / 2) / Math.max(K - 1, 1);
      const procAngle = theta + ratio * 2 * clusterHalf;
      const procAttach = processEl
        ? angleToRectSideOffset(procAngle, processEl)
        : { side: "left" as Side, offset: 0.5 };
      // Entity-side face + spaced offset within that face.
      let entSide: Side = primary;
      let entOffset = 0.5;
      for (const [face, ks] of faceBuckets) {
        const pos = ks.indexOf(k);
        if (pos !== -1) {
          entSide = face;
          const offs = faceOffsetsByFace.get(face)!;
          entOffset = offs[pos] ?? 0.5;
          break;
        }
      }
      // C3.03 — slide labels along the connector axis so labels in the
      // same cluster sit at different positions along the connector,
      // not stacked perpendicular. K=1 stays at the default position.
      const slide = (k - (K - 1) / 2) * LABEL_STAGGER;
      const labelOffsetX = isHorizontalRun ? slide : 0;
      const labelOffsetY = isHorizontalRun ? LABEL_BASELINE : LABEL_BASELINE + slide;
      attachments.set(connKey(c, idx), {
        procSide: procAttach.side, procOffset: procAttach.offset,
        entSide, entOffset,
        labelOffsetX, labelOffsetY,
      });
    }
  }

  // Now emit the connectors using the planned attachments.
  const seenIdx = new Map<string, number>();
  function popIdx(c: { sourceId: string; targetId: string }): number {
    const k = `${c.sourceId}->${c.targetId}`;
    const i = seenIdx.get(k) ?? 0;
    seenIdx.set(k, i + 1);
    return i;
  }

  for (const c of aiConnections) {
    const src = elMap.get(c.sourceId);
    const tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;
    const idx = popIdx(c);
    const att = attachments.get(connKey(c, idx));
    let srcSide: Side, tgtSide: Side, srcOffset: number, tgtOffset: number;
    if (att) {
      const entIsSrc = entityAngle.has(c.sourceId);
      if (entIsSrc) {
        srcSide = att.entSide; srcOffset = att.entOffset;
        tgtSide = att.procSide; tgtOffset = att.procOffset;
      } else {
        srcSide = att.procSide; srcOffset = att.procOffset;
        tgtSide = att.entSide; tgtOffset = att.entOffset;
      }
    } else {
      // Fallback for connectors that touch neither an entity nor the
      // process (rare — usually orphaned AI output).
      srcSide = "right"; tgtSide = "left"; srcOffset = 0.5; tgtOffset = 0.5;
    }
    connectors.push({
      id: `conn-${c.sourceId}-${c.targetId}-${idx}`,
      sourceId: c.sourceId,
      targetId: c.targetId,
      sourceSide: srcSide,
      targetSide: tgtSide,
      sourceOffsetAlong: srcOffset,
      targetOffsetAlong: tgtOffset,
      type: "flow",
      directionType: "open-directed",
      routingType: "curvilinear",
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints: [] as Point[],
      label: c.label ?? "",
      // C3.03 — label stagger computed per cluster above.
      labelOffsetX: att?.labelOffsetX ?? 0,
      labelOffsetY: att?.labelOffsetY ?? -30,
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
