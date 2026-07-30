/**
 * Simple grid layout for non-BPMN AI-generated diagrams.
 * Positions elements in a grid and creates connectors with waypoints.
 */

import type { DiagramData, DiagramElement, Connector, Point, Side } from "./types";
import { getSymbolDefinition } from "./symbols/definitions";
import { wrapText, AVG_CHAR_W_FACTOR } from "./textMetrics";
import { computeWaypoints, spreadUmlEndpoints, deconflictUmlSegments, selfLoopWaypoints, SELF_LOOP_BULGE } from "./routing";
import { sizeUmlNote } from "./umlAutoSize";
import { parseConstraintText, parseEndRole } from "./umlConstraints";
import { CHEVRON_THEMES } from "./chevronThemes";
import { archiNodeDepth, isArchiNodeIcon } from "./nodeGeometry";
import { layoutStateMachine, layoutStateMachinePreserved } from "./stateMachineLayout";
import { layoutDomainPreserved } from "./domainLayout";

// Value chain AI rule: when a Value Chain contains collapsed
// processes, pick a random Colour Theme from the catalogue and apply
// it across all chevron elements in that generation. Called once per
// layoutGenericDiagram invocation so all chevrons share the same theme.
function pickRandomChevronTheme() {
  return CHEVRON_THEMES[Math.floor(Math.random() * CHEVRON_THEMES.length)];
}

/* GARDEN_THEME removed — value chain now picks a random theme per
   generation via pickRandomChevronTheme() above. */
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

/**
 * V1.06 (Value Chain, code-enforced): when a process label begins with a
 * process number — one or two alphabetic characters followed by digits,
 * optionally with dotted sub-levels (e.g. "V01", "A1", "AA12", "V01.02",
 * "AA12.3.4") — put that number on its OWN first line and wrap the remaining
 * process name beneath it. Falls back to plain wrapping when there's no
 * leading process number.
 */
const PROCESS_NUMBER_RE = /^([A-Za-z]{1,2}\d+(?:\.\d+)*)\s+(\S.*)$/;

function wrapChevronLabel(label: string, maxWidth: number): { text: string; lines: number; fits: boolean } {
  const m = PROCESS_NUMBER_RE.exec(label.trim());
  if (!m) return wrapLabel(label, maxWidth);
  const name = wrapLabel(m[2], maxWidth);
  return { text: `${m[1]}\n${name.text}`, lines: name.lines + 1, fits: name.fits };
}

/** Lighten a hex colour toward white by `frac` (0 = unchanged, 1 = white). */
function lightenHex(hex: string, frac: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const ch = (v: number) => Math.round(v + (255 - v) * frac).toString(16).padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * V1.07 (Value Chain, code-enforced): format a generated Subprocess
 * description as a bullet-point action list, each item led by a CAPITALISED,
 * BOLDED first verb. Produces the rich-text HTML the description box renders.
 * Splits on line breaks / existing bullets, or on sentence boundaries for a
 * prose blob; strips any HTML the model may have emitted first.
 */
function formatActionList(raw: string): string {
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").trim();
  if (!text) return "";
  const hasBreaks = /[\n\r]/.test(text) || /(^|\n)\s*[-*•]/.test(text);
  const items = (hasBreaks ? text.split(/\r?\n/) : text.split(/(?<=[.;])\s+/))
    .map((s) =>
      s.trim()
        .replace(/^[-*•]\s*/, "")      // leading bullet
        .replace(/^\d+[.)]\s*/, "")          // leading "1." / "1)"
        .replace(/[.;]\s*$/, "")              // trailing . / ;
        .trim(),
    )
    .filter(Boolean);
  if (items.length === 0) return "";
  const lis = items.map((item) => {
    const m = /^(\S+)([\s\S]*)$/.exec(item);
    if (!m) return `<li>${escapeHtmlText(item)}</li>`;
    const verb = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    return `<li><b>${escapeHtmlText(verb)}</b>${escapeHtmlText(m[2])}</li>`;
  });
  return `<ul>${lis.join("")}</ul>`;
}

const GRID_GAP_X = 60;
const GRID_GAP_Y = 40;
const START_X = 100;
const START_Y = 100;

/** P2.11 — return the minimum width / height for a use-case ellipse
 *  that fully contains its label, while preserving the default
 *  width / height aspect ratio. Falls back to the default when the
 *  text is short enough to fit. Also returns the wrapped label so the
 *  renderer doesn't have to wrap again. */
function sizeUseCaseForLabel(
  rawLabel: string, baseW: number, baseH: number,
): { width: number; height: number; label: string } {
  // Rough text-metric estimates that match the renderer's defaults.
  const CHAR_W = 7;        // average glyph width at 12 px
  const LINE_H = 16;       // line height for 12 px text
  const H_PAD = 12;        // horizontal padding inside the ellipse
  const V_PAD = 8;         // vertical padding inside the ellipse
  const aspect = baseW / baseH; // a / b for the ellipse — preserved

  // Wrap at ~75 % of the base width: the inscribed rectangle inside the
  // default ellipse is roughly base × 0.7, so this stays comfortably
  // away from the curved edges. Long single words still survive as
  // one line — the ellipse grows below to fit them.
  const wrapWidthPx = Math.max(40, baseW * 0.75 - 2 * H_PAD);
  const wrapped = wrapLabel(rawLabel, wrapWidthPx);
  const lines = wrapped.text.split("\n");
  const longestLine = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const textW = longestLine * CHAR_W + 2 * H_PAD;
  const textH = lines.length * LINE_H + 2 * V_PAD;

  // Smallest semi-axes (a, b) for the ellipse to contain a textW × textH
  // rectangle, with a / b fixed to `aspect`. The four corners of the
  // rectangle sit on the ellipse when (W/2)²/a² + (H/2)²/b² = 1.
  // Substituting a = aspect · b gives b² = (W/2)² / aspect² + (H/2)².
  const halfW = textW / 2;
  const halfH = textH / 2;
  const bMin = Math.sqrt((halfW * halfW) / (aspect * aspect) + halfH * halfH);
  const aMin = aspect * bMin;
  const width = Math.max(baseW, Math.ceil(aMin * 2));
  const height = Math.max(baseH, Math.ceil(bMin * 2));
  return { width, height, label: wrapped.text };
}

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
    sourceRole?: string;
    targetRole?: string;
    sourceConstraint?: string;   // e.g. "{readOnly, subsets member}" or "readOnly, union"
    targetConstraint?: string;
    sourceDerived?: boolean;
    targetDerived?: boolean;
    // ArchiMate image reproduction: which element FACE each end attaches to, and
    // (optionally) the position along that side (0..1). Honoured by the preserved
    // layout so connectors mimic the drawn connection points; ignored elsewhere.
    sourceSide?: string;
    targetSide?: string;
    sourceOffset?: number;
    targetOffset?: number;
  }>;
}

/** Map an AI-supplied constraint string to the per-end connector fields. */
function umlEndConstraint(end: "source" | "target", raw?: string): Partial<Connector> {
  if (!raw || !raw.trim()) return {};
  const c = parseConstraintText(raw);
  const out: Record<string, unknown> = {};
  if (c.ordered)  out[`${end}Ordered`] = true;
  if (c.unique)   out[`${end}Unique`] = true;
  if (c.readOnly) out[`${end}ReadOnly`] = true;
  if (c.union)    out[`${end}Union`] = true;
  if (c.other)    out[`${end}ConstraintOther`] = c.other;
  return out as Partial<Connector>;
}

export function layoutGenericDiagram(
  parsed: AiParsed,
  diagramType: string,
  opts?: { imageAspect?: { w: number; h: number } },
): DiagramData {
  const aiElements = parsed.elements ?? [];
  const aiConnections = parsed.connections ?? [];

  // State machine reproduced FROM AN IMAGE: when the AI emitted per-element
  // `bounds`, honour the original placement, Composite-State nesting and
  // connector faces instead of re-flowing. Falls through to auto-layout when
  // the geometry is missing/unusable.
  if (diagramType === "state-machine"
      && aiElements.some((e) => e.bounds && typeof e.bounds === "object")) {
    const preserved = layoutStateMachinePreserved(
      aiElements as never, aiConnections as never, opts?.imageAspect,
    );
    if (preserved) return preserved;
  }

  // Domain (UML class) reproduced FROM AN IMAGE: honour per-element `bounds`,
  // package nesting and connector faces so the diagram matches the drawing.
  if (diagramType === "domain"
      && aiElements.some((e) => e.bounds && typeof e.bounds === "object")) {
    const preserved = layoutDomainPreserved(
      aiElements as never, aiConnections as never, opts?.imageAspect,
    );
    if (preserved) return preserved;
  }

  // ArchiMate reproduced FROM AN IMAGE: honour per-element `bounds` + `parent`
  // nesting so the diagram matches the drawing (visual containment). Falls through
  // to the nested / band auto-layout when bounds are missing/unusable.
  if (diagramType === "archimate"
      && aiElements.some((e) => e.bounds && typeof e.bounds === "object")) {
    const preserved = layoutArchimatePreserved(
      aiElements as never, aiConnections as never, opts?.imageAspect,
    );
    if (preserved) return preserved;
  }

  // Context diagrams: special circular layout
  if (diagramType === "context" || diagramType === "basic") {
    return layoutContextDiagram(aiElements, aiConnections);
  }

  // ArchiMate: nested (composition) or layered-band layout
  if (diagramType === "archimate") {
    return layoutArchimateDiagram(aiElements, aiConnections);
  }

  // State machine: dedicated layered layout enforcing the S3.xx Layout rules.
  // Only for FLAT machines — composite/nested ones keep the generic grid so the
  // container + parent/child handling below still applies.
  if (diagramType === "state-machine"
      && !aiElements.some(e => e.type === "composite-state" || e.type === "submachine" || e.group || e.parent)) {
    return layoutStateMachine(aiElements, aiConnections);
  }

  const elements: DiagramElement[] = [];
  const connectors: Connector[] = [];

  // Separate containers from regular elements
  const CONTAINER_TYPES = new Set(["process-group", "system-boundary", "composite-state"]);
  const containers = aiElements.filter(e => CONTAINER_TYPES.has(e.type));
  const regularEls = aiElements.filter(e => !CONTAINER_TYPES.has(e.type));

  const isValueChain = diagramType === "value-chain";
  const isProcessContext = diagramType === "process-context";

  // Pick a single random Colour Theme for this generation so every
  // chevron in the diagram shares one consistent palette. Falls back
  // to a stable choice when not a value chain (the variable is
  // unused outside the value-chain branches but kept defined to
  // simplify the call sites).
  const chevronTheme = isValueChain
    ? pickRandomChevronTheme()
    : CHEVRON_THEMES[0];

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
      const baseUcW = ucDef.defaultWidth, baseUcH = ucDef.defaultHeight;
      const padTop = 50, rowGap = 25;

      // P2.11 — pre-compute each child's dimensions. Use-case ellipses
      // grow to contain their labels while preserving the default
      // width / height aspect ratio; other element types keep their
      // symbol-definition defaults.
      const sized = children.map(ai => {
        const rawLabel = ai.label ?? ai.name ?? ai.type;
        if (ai.type === "use-case") {
          const s = sizeUseCaseForLabel(rawLabel, baseUcW, baseUcH);
          return { ai, label: s.label, width: s.width, height: s.height };
        }
        const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
        return { ai, label: rawLabel, width: def.defaultWidth, height: def.defaultHeight };
      });

      // Container width must hold the widest use-case in BOTH columns
      // plus the 40 px side padding either side.
      const widestUc = sized
        .filter(s => s.ai.type === "use-case")
        .reduce((m, s) => Math.max(m, s.width), baseUcW);
      const neededContainerW = widestUc * 2 + 100;
      container.width = Math.max(container.width, neededContainerW);
      const leftX = container.x + 40;

      let cursorY = container.y + padTop;
      for (let ci = 0; ci < sized.length; ci++) {
        const s = sized[ci];
        const isLeft = ci % 2 === 0;
        const ex = isLeft
          ? leftX
          : container.x + container.width - s.width - 40;
        const el: DiagramElement = {
          id: s.ai.id, type: s.ai.type as DiagramElement["type"],
          x: ex, y: cursorY, width: s.width, height: s.height,
          label: s.label, properties: buildProperties(s.ai, diagramType),
          parentId: containerId,
        };
        elements.push(el);
        placed.add(s.ai.id);
        cursorY += s.height + rowGap;
      }
      // Resize container to fit children if needed.
      if (children.length > 0) {
        container.height = Math.max(container.height, cursorY - container.y + 20);
      }
    } else {
      // Value chains and other diagram types: horizontal row(s).
      const chevronH = getSymbolDefinition("chevron").defaultHeight;
      const cyRow1 = container.y + 40;

      // For value chains, pre-wrap labels and determine if width expansion is needed
      let chevronW = getSymbolDefinition("chevron").defaultWidth;
      if (isValueChain) {
        const textW = chevronW - 40;
        let needsWider = false;
        for (const ai of children) {
          if (ai.type === "chevron" || ai.type === "chevron-collapsed") {
            const rawLabel = ai.label ?? ai.name ?? ai.type;
            const wrapped = wrapChevronLabel(rawLabel, textW);
            if (!wrapped.fits || wrapped.lines > 3) needsWider = true;
          }
        }
        if (needsWider) chevronW = Math.min(220, chevronW + 60);
      }

      // V1.08: a Value Chain with MORE THAN 6 processes wraps into two rows —
      // 1-6 on top; 7+ underneath, shifted one chevron width right — and the
      // container bottom sits half a chevron height below the lower row's
      // descriptions.
      const ROW_SPLIT = 6;
      const chevronCount = children.filter(
        (c) => c.type === "chevron" || c.type === "chevron-collapsed",
      ).length;
      const wrap = isValueChain && chevronCount > ROW_SPLIT;
      const INTER_ROW_GAP = Math.round(chevronH * 0.5);
      // Estimate a chevron description's rendered height (it self-measures at
      // render; this estimate sizes the container to leave the V1.08 gap).
      const estDescH = (props: Record<string, unknown>): number => {
        const html = String(props.description ?? "");
        if (!html) return 0;
        const items = (html.match(/<li/g) ?? []).length || 1;
        return items * 22 + 12 + 4; // ~22px/item + ul padding + 4px chevron gap
      };

      let cx = container.x + 30;
      let cy = cyRow1;
      let firstChevronColour: string | undefined;
      let chevronIdx = 0;
      let row1DescH = 0;
      let row2DescH = 0;
      let maxRight = cx;
      for (const ai of children) {
        const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
        let label = ai.label ?? ai.name ?? ai.type;
        const props = buildProperties(ai, diagramType);
        let elW = def.defaultWidth;
        const isChev = isValueChain && (ai.type === "chevron" || ai.type === "chevron-collapsed");

        // Value chain: wrap labels and apply the per-generation random
        // theme colour (see pickRandomChevronTheme above).
        if (isChev) {
          // V1.08: drop to the second row (shifted right one chevron width)
          // once the first six are placed.
          if (wrap && chevronIdx === ROW_SPLIT) {
            cy = cyRow1 + chevronH + row1DescH + INTER_ROW_GAP;
            cx = container.x + 30 + chevronW;
          }
          elW = chevronW;
          const textW = elW - 40;
          // V1.06: split a leading process number onto its own line.
          const wrapped = wrapChevronLabel(label, textW);
          label = wrapped.text;
          const colour = chevronTheme.colours[gardenIdx % chevronTheme.colours.length];
          props.fillColor = colour;
          if (firstChevronColour === undefined) firstChevronColour = colour;
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
        if (isChev) {
          const dh = estDescH(props);
          if (!wrap || chevronIdx < ROW_SPLIT) row1DescH = Math.max(row1DescH, dh);
          else row2DescH = Math.max(row2DescH, dh);
          chevronIdx++;
          cx += elW - CHEVRON_OVERLAP;
        } else {
          cx += elW + GRID_GAP_X;
        }
        maxRight = Math.max(maxRight, cx);
      }
      // Colour-sync the Value Chain element (container) to its inner
      // processes' theme — a pale tint of the first process's shade, matching
      // the snap-time reapplyThemeToGroup container tint.
      if (isValueChain && firstChevronColour) {
        container.properties = { ...container.properties, fillColor: lightenHex(firstChevronColour, 0.6) };
      }
      // Resize container to fit children.
      if (children.length > 0) {
        if (isValueChain) {
          container.width = maxRight - container.x + 30;
          // Bottom = lower row's chevron bottom + its descriptions + half a
          // chevron height (V1.08). cy is the last row's y after the loop.
          const lastRowBottom = cy + chevronH + (wrap ? row2DescH : row1DescH);
          container.height = Math.max(container.height, lastRowBottom + Math.round(chevronH / 2) - container.y);
        } else {
          container.width = Math.max(container.width, cx - container.x + 30);
        }
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

    // P2.08 — leave a clear gap between actor icons AND their labels
    // so two stacked actors never run their labels together. The
    // stored bounds cover the icon only; labels render ~24 px below it.
    // We therefore need (label allowance) + (minimum clear gap) of
    // vertical separation between each actor's icon-bottom and the
    // next actor's icon-top — and we mirror that horizontally as a
    // safety margin even though the layout stacks vertically.
    const ACTOR_LABEL_ALLOWANCE_PX = 24;
    const ACTOR_CLEAR_GAP_PX = 30;
    const ACTOR_GAP = ACTOR_LABEL_ALLOWANCE_PX + ACTOR_CLEAR_GAP_PX;
    function findFreeY(occupied: Array<{ top: number; bottom: number }>, idealY: number, height: number): number {
      let y = idealY;
      // Push down if overlapping with any existing placement
      let conflict = true;
      while (conflict) {
        conflict = false;
        for (const r of occupied) {
          if (y < r.bottom + ACTOR_GAP && y + height > r.top - ACTOR_GAP) {
            y = r.bottom + ACTOR_GAP;
            conflict = true;
          }
        }
      }
      return y;
    }

    // Track which actors land on each side so we can centre the
    // resulting groups on the container midpoint (P2.10).
    const leftActors: DiagramElement[] = [];
    const rightActors: DiagramElement[] = [];

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
      (placeRight ? rightActors : leftActors).push(el);
    }

    // P2.10 — centre each side's actor group on the container's
    // vertical midpoint. After the connection-driven placement above
    // assigns relative positions, shift the whole stack uniformly so
    // its centre lines up with the boundary midpoint. The relative
    // ordering (which keeps connector crossings minimal) is preserved.
    if (container) {
      const midY = container.y + container.height / 2;
      const centreGroup = (group: DiagramElement[]) => {
        if (group.length === 0) return;
        const top = group.reduce((m, e) => Math.min(m, e.y), Infinity);
        const bottom = group.reduce((m, e) => Math.max(m, e.y + e.height), -Infinity);
        const groupMid = (top + bottom) / 2;
        const dy = midY - groupMid;
        if (Math.abs(dy) < 1) return;
        for (const el of group) el.y += dy;
      };
      centreGroup(leftActors);
      centreGroup(rightActors);
    }
  }

  // Place uncontained elements in a grid
  const unplaced = regularEls.filter(e => !placed.has(e.id));
  const startY = containerY > START_Y ? containerY : START_Y;
  let col = 0;
  let curX = START_X;
  let curY = startY;
  let rowH = 0;
  // Domain (object model) diagrams: a near-SQUARE grid with WIDE clearance so
  // associations have clear routing channels between rows/columns and fewer are
  // forced across an entity box (which the editor flags red). Shorter rows also
  // mean fewer same-row entities sit between two connected ones.
  const MAX_COLS = diagramType === "value-chain" ? 8
    : diagramType === "domain" ? Math.max(2, Math.ceil(Math.sqrt(Math.max(1, unplaced.length))))
    : 4;
  const gapX = diagramType === "domain" ? 130 : GRID_GAP_X;
  const gapY = diagramType === "domain" ? 110 : GRID_GAP_Y;

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
    if (col >= MAX_COLS) { col = 0; curX = START_X; curY += rowH + gapY; rowH = 0; }
    const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
    let label = ai.label ?? ai.name ?? ai.type;
    const props = buildProperties(ai, diagramType);
    let elW = def.defaultWidth;

    // Value chain: wrap labels and apply the per-generation random
    // theme colour (same theme as the first branch).
    if (isValueChain && (ai.type === "chevron" || ai.type === "chevron-collapsed")) {
      elW = unplacedChevronW;
      const textW = elW - 40;
      const wrapped = wrapLabel(label, textW);
      label = wrapped.text;
      props.fillColor = chevronTheme.colours[gardenIdx % chevronTheme.colours.length];
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
      curX += elW + gapX;
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
    flowchart: "flowline",
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

  // Domain notes: size each note's box to JUST contain its wrapped text
  // (matches the renderer at the 14px domain font, not 12px) — no overflow, no
  // gap at the bottom.
  if (diagramType === "domain") {
    for (const el of elements) {
      if (el.type !== "uml-note") continue;
      const s = sizeUmlNote(el.label, { fontScale: 14 / 12 });
      el.width = s.width; el.height = s.height;
    }
  }

  for (let ci = 0; ci < aiConnections.length; ci++) {
    const c = aiConnections[ci];
    let src = elMap.get(c.sourceId);
    let tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;

    // P2.09 — Process Context: an association connector between two
    // process (use-case) elements is not legal. Process Context
    // associations must run process ↔ actor / team / system. Drop any
    // such connector silently at layout time so AI-generated diagrams
    // never emit one.
    if (diagramType === "process-context"
        && src.type === "use-case" && tgt.type === "use-case") {
      continue;
    }

    const connType = c.type ?? defaultConnType[diagramType] ?? "sequence";
    // Domain: generalisation / realisation / dependency default to DIRECT lines.
    const umlDirect = diagramType === "domain" &&
      (connType === "uml-generalisation" || connType === "uml-realisation" || connType === "uml-dependency");
    const routing = umlDirect ? "direct" : (defaultRouting[diagramType] ?? "rectilinear");
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

    // Determine sides. A self-connector (src === tgt) loops off one side.
    const isSelf = src.id === tgt.id;
    const srcCx = src.x + src.width / 2;
    const tgtCx = tgt.x + tgt.width / 2;
    const srcCy = src.y + src.height / 2;
    const tgtCy = tgt.y + tgt.height / 2;
    let srcSide: string, tgtSide: string;
    if (isSelf) {
      srcSide = "top"; tgtSide = "top";
    } else if (Math.abs(tgtCy - srcCy) > Math.abs(tgtCx - srcCx)) {
      srcSide = tgtCy > srcCy ? "bottom" : "top";
      tgtSide = tgtCy > srcCy ? "top" : "bottom";
    } else {
      srcSide = "right";
      tgtSide = "left";
    }

    const sr = parseEndRole(c.sourceRole);
    const tr = parseEndRole(c.targetRole);
    const conn: Connector = {
      // Index-suffixed so multiple connectors between the SAME element pair get
      // distinct ids (duplicate ids collapse to one rendered connector).
      id: `conn-${src.id}-${tgt.id}-${ci}`,
      sourceId: src.id, targetId: tgt.id,
      sourceSide: srcSide as Connector["sourceSide"],
      targetSide: tgtSide as Connector["targetSide"],
      type: connType as Connector["type"],
      directionType: direction as Connector["directionType"],
      routingType: (isSelf ? "rectilinear" : routing) as Connector["routingType"],
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints: [] as Point[],
      ...(isSelf ? { sourceOffsetAlong: 0.3, targetOffsetAlong: 0.7, selfLoopBulge: SELF_LOOP_BULGE } : {}),
      // Dependency default stereotype «use» when the AI gives none.
      label: c.label ?? (connType === "uml-dependency" ? "«use»" : ""),
      ...(c.sourceMultiplicity ? { sourceMultiplicity: c.sourceMultiplicity } : {}),
      ...(c.targetMultiplicity ? { targetMultiplicity: c.targetMultiplicity } : {}),
      ...(sr.role ? { sourceRole: sr.role } : {}),
      ...(tr.role ? { targetRole: tr.role } : {}),
      ...(sr.visibility ? { sourceVisibility: sr.visibility } : {}),
      ...(tr.visibility ? { targetVisibility: tr.visibility } : {}),
      ...((c.sourceDerived || sr.derived) ? { sourceDerived: true } : {}),
      ...((c.targetDerived || tr.derived) ? { targetDerived: true } : {}),
      // Association-end constraints: the AI may supply them only when the user
      // explicitly asks. Parse the {…} string into the structured flags + other.
      ...umlEndConstraint("source", c.sourceConstraint),
      ...umlEndConstraint("target", c.targetConstraint),
    } as Connector;
    connectors.push(conn);
  }

  // D4.04/D4.05 (Domain only): spread connectors that share an element side so
  // they don't stack on top of each other, ordered to avoid mutual crossings.
  const spread = diagramType === "domain" ? spreadUmlEndpoints(connectors, elements) : connectors;

  // Compute waypoints (honouring the spread offsets for domain)
  const computed0 = spread.map(conn => {
    const src = elMap.get(conn.sourceId);
    const tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    // Self-connector: build the 3-segment loop off the stored side.
    if (conn.sourceId === conn.targetId) {
      return { ...conn,
        waypoints: selfLoopWaypoints(src, conn.sourceSide, conn.sourceOffsetAlong ?? 0.3, conn.targetOffsetAlong ?? 0.7, conn.selfLoopBulge ?? SELF_LOOP_BULGE),
        sourceInvisibleLeader: true, targetInvisibleLeader: true };
    }
    try {
      const r = computeWaypoints(src, tgt, elements, conn.sourceSide, conn.targetSide, conn.routingType, conn.sourceOffsetAlong ?? 0.5, conn.targetOffsetAlong ?? 0.5);
      return { ...conn, waypoints: r.waypoints, sourceInvisibleLeader: r.sourceInvisibleLeader, targetInvisibleLeader: r.targetInvisibleLeader };
    } catch { return conn; }
  });
  // D4.05 (Domain only): pull apart mid-channel trunks that overlap.
  const computed = diagramType === "domain" ? deconflictUmlSegments(computed0) : computed0;

  return {
    elements,
    connectors: computed,
    viewport: { x: 0, y: 0, zoom: 0.7 },
    fontSize: 12,
    connectorFontSize: 10,
  };
}

// ── ArchiMate layered-band layout ───────────────────────────────────
// elementType → catalogue shapeKey (+ whether it is an icon-only shape).
// Keys are the canonical entries in public/archimate-catalogue.json.
export const ARCHI_SHAPE: Record<string, { key: string; iconOnly: boolean }> = {
  // Strategy (band 0)
  "strategy-resource":         { key: "strategy-resource-icon",          iconOnly: true  },
  "strategy-capability":       { key: "strategy-capability-icon",        iconOnly: true  },
  "strategy-course-of-action": { key: "strategy-course-of-action-icon",  iconOnly: true  },
  "strategy-value-stream":     { key: "strategy-value-stream-box",        iconOnly: false },
  // Motivation (band 1)
  "motivation-stakeholder":    { key: "motivation-stakeholder-icon",     iconOnly: true  },
  "motivation-driver":         { key: "motivation-driver-icon",          iconOnly: true  },
  "motivation-assessment":     { key: "motivation-assessment-icon",      iconOnly: true  },
  "motivation-goal":           { key: "motivation-goal-icon",            iconOnly: true  },
  "motivation-outcome":        { key: "motivation-outcome-icon",         iconOnly: true  },
  "motivation-principle":      { key: "motivation-principle-icon",       iconOnly: true  },
  "motivation-requirement":    { key: "motivation-requirement-icon",     iconOnly: true  },
  "motivation-constraint":     { key: "motivation-constraint-box",        iconOnly: false },
  "motivation-meaning":        { key: "motivation-meaning-icon",         iconOnly: true  },
  "motivation-value":          { key: "motivation-value-icon",           iconOnly: true  },
  // Business active structure + behaviour (bands 2–7)
  "business-actor":            { key: "business-business-actor-box",         iconOnly: false },
  "business-role":             { key: "business-business-role-icon",         iconOnly: true  },
  "business-collaboration":    { key: "business-business-collaboration-box", iconOnly: false },
  "business-service":          { key: "business-business-service-box",       iconOnly: false },
  "business-interface":        { key: "business-business-interface-icon",    iconOnly: true  },
  "business-process":          { key: "business-business-process-box",       iconOnly: false },
  "business-function":         { key: "business-business-function-box",      iconOnly: false },
  "business-interaction":      { key: "business-business-interaction-box",   iconOnly: false },
  "business-event":            { key: "business-business-event-box",         iconOnly: false },
  // Business passive structure → SIDE COLUMN
  "business-object":           { key: "business-business-object-icon",       iconOnly: true  },
  "product":                   { key: "business-product-icon",               iconOnly: true  },
  "contract":                  { key: "business-contract-icon",              iconOnly: true  },
  "representation":            { key: "business-representation-icon",        iconOnly: true  },
  // Application (bands 8–10)
  "application-interface":     { key: "application-application-interface-box",     iconOnly: false },
  "application-service":       { key: "application-application-service-icon",      iconOnly: true  },
  "application-process":       { key: "application-application-process-icon",      iconOnly: true  },
  "application-function":      { key: "application-application-function-icon",     iconOnly: true  },
  "application-interaction":   { key: "application-application-interaction-box",   iconOnly: false },
  "application-event":         { key: "application-application-event-box",         iconOnly: false },
  "application-component":     { key: "application-application-component-box",     iconOnly: false },
  "application-collaboration": { key: "application-application-collaboration-box", iconOnly: false },
  "data-object":               { key: "application-data-object-icon",              iconOnly: true  },
  // Technology (band 11)
  "technology-node":            { key: "technology-node-box",            iconOnly: false },
  "technology-device":          { key: "technology-device-box",          iconOnly: false },
  "technology-system-software": { key: "technology-system-software-box", iconOnly: false },
  "technology-collaboration":   { key: "technology-collaboration-box",   iconOnly: false },
  "technology-interface":       { key: "technology-interface-box",       iconOnly: false },
  "technology-function":        { key: "technology-function-box",        iconOnly: false },
  "technology-process":         { key: "technology-process-box",         iconOnly: false },
  "technology-interaction":     { key: "technology-interaction-box",     iconOnly: false },
  "technology-event":           { key: "technology-event-box",           iconOnly: false },
  "technology-service":         { key: "technology-service-box",         iconOnly: false },
  "technology-artifact":        { key: "technology-artifact-box",        iconOnly: false },
  // Technology v3.2: Path, Communication Network + Physical elements (band 11)
  "technology-path":                 { key: "technology-path",                 iconOnly: false },
  "technology-communication-network": { key: "technology-communication-network", iconOnly: false },
  "equipment":                       { key: "technology-equipment",            iconOnly: false },
  "facility":                        { key: "technology-facility",             iconOnly: false },
  "distribution-network":            { key: "technology-distribution-network", iconOnly: false },
  "material":                        { key: "technology-material",             iconOnly: false },
  // Implementation & Migration (band 12)
  "work-package":         { key: "implementation-migration-work-package",         iconOnly: false },
  "deliverable":          { key: "implementation-migration-deliverable",          iconOnly: false },
  "implementation-event": { key: "implementation-migration-implementation-event", iconOnly: false },
  "plateau":              { key: "implementation-migration-plateau",              iconOnly: false },
  "gap":                  { key: "implementation-migration-gap",                  iconOnly: false },
  // Composite — Location (a place/site) + Grouping (dashed boundary); both are
  // containers that may hold other elements.
  "location":             { key: "composite-location",                           iconOnly: false },
  "grouping":             { key: "composite-grouping",                           iconOnly: false },
};

// Passive-structure objects that go in a SIDE COLUMN (left/right), placed next
// to the element(s) they connect to, rather than in the vertical bands.
const ARCHI_SIDE_COLUMN = new Set<string>(["business-object", "product", "contract", "representation"]);

// The 13 vertical bands, top→bottom: Strategy, Motivation, the 9 Business/
// Application rows, Technology (incl. Physical), then Implementation & Migration
// at the bottom. Only non-empty bands are drawn.
const ARCHI_NUM_BANDS = 13;
const ARCHI_DEFAULT_BAND = 7; // business behaviour — fallback for an unmapped type
// elementType → band index. Side-column types are handled separately.
export const ARCHI_BAND: Record<string, number> = {
  "strategy-resource": 0, "strategy-capability": 0, "strategy-course-of-action": 0, "strategy-value-stream": 0,
  "motivation-stakeholder": 1, "motivation-driver": 1, "motivation-assessment": 1, "motivation-goal": 1,
  "motivation-outcome": 1, "motivation-principle": 1, "motivation-requirement": 1, "motivation-constraint": 1,
  "motivation-meaning": 1, "motivation-value": 1,
  "business-actor": 2,
  "business-role": 3,
  "business-collaboration": 4,
  "business-service": 5,
  "business-interface": 6,
  "business-process": 7, "business-function": 7, "business-interaction": 7, "business-event": 7,
  "application-interface": 8, "application-service": 8,
  "application-process": 9, "application-function": 9, "application-interaction": 9, "application-event": 9,
  "application-component": 10, "application-collaboration": 10, "data-object": 10,
  "technology-node": 11, "technology-device": 11, "technology-system-software": 11, "technology-collaboration": 11,
  "technology-interface": 11, "technology-function": 11, "technology-process": 11, "technology-interaction": 11,
  "technology-event": 11, "technology-service": 11, "technology-artifact": 11,
  "technology-path": 11, "technology-communication-network": 11,
  "equipment": 11, "facility": 11, "distribution-network": 11, "material": 11,
  "work-package": 12, "deliverable": 12, "implementation-event": 12, "plateau": 12, "gap": 12,
  "location": 2, "grouping": 2, // Composite — placed with the business active-structure band when flat
};

// relationship name → archi-* connector type
const ARCHI_REL: Record<string, string> = {
  composition: "archi-composition", aggregation: "archi-aggregation", assignment: "archi-assignment",
  realisation: "archi-realisation", realization: "archi-realisation",
  serving: "archi-serving", access: "archi-access", influence: "archi-influence",
  association: "archi-association", "directed-association": "archi-association-directed",
  "association-directed": "archi-association-directed",
  triggering: "archi-triggering", flow: "archi-flow",
  specialisation: "archi-specialisation", specialization: "archi-specialisation",
};

// Element types that have BOTH a box form AND an icon ("expressed") form in the
// catalogue. For these the AI can report which form the image drew, per element,
// via `notation: "icon" | "box"`. The icon form uses the same catalogue key with
// `-box` → `-icon` and renders as the glyph shape (archimateIconOnly). Every entry
// defaults to the box form in ARCHI_SHAPE; guarded by the catalogue-sync test.
export const ARCHI_DUAL_FORM = new Set<string>([
  "business-actor", "business-collaboration", "business-service", "business-process",
  "business-function", "business-interaction", "business-event",
  "motivation-constraint", "strategy-value-stream",
  "application-component", "application-collaboration", "application-interface",
  "application-interaction", "application-event",
  "technology-node",
  // NOTE: technology-system-software is intentionally NOT dual-form — it is box-only
  // and carries a bespoke corner-glyph icon (assigned via the Icon Library).
]);

/** Resolve {shapeKey, iconOnly} for an element type, honouring the notation FORM
 *  the AI reported for a dual-form type: "icon" = the expressed glyph shape,
 *  "box" = the rectangle with a small corner symbol. Falls back to the ARCHI_SHAPE
 *  default (box) for a non-dual type or when no notation is given. */
function archiShapeForm(type: string, notation?: unknown): { key: string; iconOnly: boolean } | undefined {
  const spec = ARCHI_SHAPE[type];
  if (!spec) return undefined;
  if (typeof notation === "string" && ARCHI_DUAL_FORM.has(type)) {
    if (notation === "icon") return { key: spec.key.replace(/-box$/, "-icon"), iconOnly: true };
    if (notation === "box")  return { key: spec.key.replace(/-icon$/, "-box"), iconOnly: false };
  }
  return spec;
}

// ── ArchiMate geometry helpers (shared by the band + preserved layouts) ──
type AiBounds = { x: number; y: number; w: number; h: number };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
function validBounds(b: unknown): b is AiBounds {
  if (!b || typeof b !== "object") return false;
  const { x, y, w, h } = b as AiBounds;
  return [x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n)) && w > 0 && h > 0;
}

// A4.08: split a leading element code (e.g. "V01.01") onto its own top
// line. Pattern: 1–3 letters, 1–2 digits, a separator (.,:;-), 1–2 digits.
const LEADING_CODE = /^([A-Za-z]{1,3}\d{1,2}[.,:;-]\d{1,2})\s+(.+)$/;
function formatLabel(raw: string): string {
  const s = (raw ?? "").trim();
  const m = LEADING_CODE.exec(s);
  return m ? `${m[1]}\n${m[2]}` : s;
}

// Box size from the (already line-split) label so the text fits — caps the
// width so long names wrap to extra lines, and honours explicit \n breaks
// (e.g. the A4.08 number line). The glyph sits in the top-right corner, so
// there is no fixed square footprint.
// Rule A4.09 — a generated ArchiMate box is sized to CONTAIN its wrapped name
// at the DEFAULT aspect ratio (128×76, matching the manual palette default), so
// generated shapes stay uniform and no text ever spills outside the outline.
// The name is wrapped with the SAME wrapText + interior padding the renderer
// uses (ARCHI_LABEL_PAD = 16, 12px font), then the box grows the deficient
// dimension only — it can never shrink below what the text needs.
const A409_DEFAULT_W = 128, A409_DEFAULT_H = 76;
const A409_ASPECT = A409_DEFAULT_W / A409_DEFAULT_H;
const A409_PAD_X = 16;          // must match SymbolRenderer's ARCHI_LABEL_PAD
const A409_FONT = 12, A409_LINE_H = 16, A409_PAD_Y = 16;
function boxSize(label: string): { w: number; h: number } {
  const text = label || "";
  let lines = wrapText(text, A409_DEFAULT_W - A409_PAD_X, A409_FONT);
  // A single word wider than the default interior forces a wider box; re-wrap
  // there so the line count reflects the real interior width.
  const longestPx = Math.max(0, ...lines.map(l => l.length * A409_FONT * AVG_CHAR_W_FACTOR));
  let baseW = Math.max(A409_DEFAULT_W, Math.ceil(longestPx) + A409_PAD_X);
  if (baseW > A409_DEFAULT_W) lines = wrapText(text, baseW - A409_PAD_X, A409_FONT);
  const baseH = Math.max(A409_DEFAULT_H, lines.length * A409_LINE_H + A409_PAD_Y);
  // Enforce the default aspect ratio by growing the deficient dimension only.
  let w = baseW, h = baseH;
  if (w / h < A409_ASPECT) w = h * A409_ASPECT;
  else h = w / A409_ASPECT;
  return { w: Math.round(w), h: Math.round(h) };
}

/** ArchiMate ingestion box sizing (Paul, 2026-07-29): render at the STANDARD size
 *  (128×76) while the name fits in at most 2 wrapped lines — WIDEN the box (keeping
 *  height standard) to keep the name to 2 lines before any expansion, and only grow
 *  taller once 2 lines can't hold it even at ~3× width. Unlike boxSize this does NOT
 *  force the A4.09 aspect ratio (a 2-line name just makes a wider standard-height box). */
export function archiFitSize(label: string): { w: number; h: number } {
  const text = label || "";
  const lineW = (l: string) => l.length * A409_FONT * AVG_CHAR_W_FACTOR;
  const MAX_W = A409_DEFAULT_W * 3;
  // Widen in steps until the name wraps to ≤ 2 lines (or we hit the width cap).
  let w = A409_DEFAULT_W;
  let lines = wrapText(text, w - A409_PAD_X, A409_FONT);
  while (lines.length > 2 && w < MAX_W) {
    w += 24;
    lines = wrapText(text, w - A409_PAD_X, A409_FONT);
  }
  const longest = Math.max(0, ...lines.map(lineW));
  const width = Math.max(A409_DEFAULT_W, Math.ceil(longest) + A409_PAD_X);
  // ≤ 2 lines → standard height; 3+ lines (only past the width cap) → grow to fit.
  const height = lines.length <= 2 ? A409_DEFAULT_H : Math.max(A409_DEFAULT_H, lines.length * A409_LINE_H + A409_PAD_Y);
  return { w: Math.round(width), h: Math.round(height) };
}

function layoutArchimateDiagram(
  aiElements: NonNullable<AiParsed["elements"]>,
  aiConnections: NonNullable<AiParsed["connections"]>,
): DiagramData {
  const BAND_GAP_Y = 80;   // vertical gap between bands
  const EL_GAP_X = 40;     // horizontal gap between elements in a band
  const NUM_BANDS = ARCHI_NUM_BANDS;

  // Composition nesting (whole-part expressed via `parent`) → dedicated nested
  // layout that draws containers around their children. Non-nested diagrams
  // (no `parent`) skip this and fall through to the band layout below, unchanged.
  const nestParent = resolveArchiParents(aiElements);
  if (nestParent.size > 0) return layoutArchimateNested(aiElements, aiConnections, nestParent);

  type Placed = { ai: NonNullable<AiParsed["elements"]>[number]; shapeKey: string; iconOnly: boolean; label: string; w: number; h: number; cx: number };
  const bands: Placed[][] = Array.from({ length: NUM_BANDS }, () => []);
  const sideItems: Placed[] = []; // passive-structure → side column
  const byId = new Map<string, Placed>();
  for (const ai of aiElements) {
    const spec = archiShapeForm(ai.type, ai.notation);
    if (!spec) continue; // unknown element type — skip
    const label = formatLabel(ai.label ?? ai.name ?? "");
    const sz = boxSize(label);
    const p: Placed = { ai, shapeKey: spec.key, iconOnly: spec.iconOnly, label, w: sz.w, h: sz.h, cx: 0 };
    if (ARCHI_SIDE_COLUMN.has(ai.type)) sideItems.push(p);
    else bands[ARCHI_BAND[ai.type] ?? ARCHI_DEFAULT_BAND].push(p);
    byId.set(ai.id, p);
  }

  // Undirected adjacency for barycentre positioning + crossing reduction.
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => { const l = adj.get(a); if (l) l.push(b); else adj.set(a, [b]); };
  for (const c of aiConnections) {
    if (!byId.has(c.sourceId) || !byId.has(c.targetId)) continue;
    link(c.sourceId, c.targetId); link(c.targetId, c.sourceId);
  }

  // Anchor on the busiest band (prefer the behaviour band 2 = processes):
  // lay it out left-to-right in model order (the customer-journey order).
  const placedIds = new Set<string>();
  const placeSequential = (band: Placed[]) => {
    let x = 0;
    for (const p of band) { p.cx = x + p.w / 2; x += p.w + EL_GAP_X; placedIds.add(p.ai.id); }
  };
  // Every other band: each element wants the average X of its already-placed
  // neighbours (barycentre = alignment). Sort by that desired X (= crossing
  // reduction), then sweep left-to-right pushing apart to remove overlap.
  const placeBarycentre = (band: Placed[]) => {
    const items = band.map((p, i) => {
      const nbrs = (adj.get(p.ai.id) ?? [])
        .map(id => byId.get(id))
        .filter((n): n is Placed => !!n && placedIds.has(n.ai.id));
      const desired = nbrs.length ? nbrs.reduce((s, n) => s + n.cx, 0) / nbrs.length : null;
      return { p, i, desired };
    });
    const known = items.filter(it => it.desired != null);
    const fallback = known.length ? known.reduce((s, it) => s + (it.desired as number), 0) / known.length : 0;
    for (const it of items) if (it.desired == null) it.desired = fallback + it.i * 0.01;
    items.sort((a, b) => (a.desired! - b.desired!) || (a.i - b.i));
    let prevRight = -Infinity;
    const ordered: Placed[] = [];
    for (const it of items) {
      let x = (it.desired as number) - it.p.w / 2;
      if (x < prevRight + EL_GAP_X) x = prevRight + EL_GAP_X;
      it.p.cx = x + it.p.w / 2;
      prevRight = x + it.p.w;
      placedIds.add(it.p.ai.id);
      ordered.push(it.p);
    }
    band.splice(0, band.length, ...ordered); // keep band in placement order
  };

  let anchorIdx = ARCHI_DEFAULT_BAND;
  for (let i = 0; i < NUM_BANDS; i++) if (bands[i].length > bands[anchorIdx].length) anchorIdx = i;
  if (bands[anchorIdx].length === 0) anchorIdx = bands.findIndex(b => b.length > 0);
  if (anchorIdx >= 0) {
    placeSequential(bands[anchorIdx]);
    const order = Array.from({ length: NUM_BANDS }, (_, i) => i)
      .filter(i => i !== anchorIdx && bands[i].length)
      .sort((a, b) => Math.abs(a - anchorIdx) - Math.abs(b - anchorIdx));
    for (const bi of order) placeBarycentre(bands[bi]);
  }

  // Normalise so the leftmost element sits at START_X.
  let minLeft = Infinity;
  for (const b of bands) for (const p of b) minLeft = Math.min(minLeft, p.cx - p.w / 2);
  const shift = START_X - (Number.isFinite(minLeft) ? minLeft : 0);

  const elements: DiagramElement[] = [];
  // Final centre of every BANDED element — the side column places its objects
  // relative to these.
  const posById = new Map<string, { cx: number; cy: number; w: number; h: number }>();
  let y = START_Y;
  for (const band of bands) {
    if (band.length === 0) continue;
    const rowH = Math.max(...band.map(e => e.h));
    for (const e of band) {
      elements.push({
        id: e.ai.id,
        type: "archimate-shape",
        x: e.cx - e.w / 2 + shift,
        y: y + (rowH - e.h) / 2,
        width: e.w, height: e.h,
        label: e.label,
        properties: e.iconOnly
          ? { shapeKey: e.shapeKey, archimateIconOnly: true }
          : { shapeKey: e.shapeKey },
      });
      posById.set(e.ai.id, { cx: e.cx + shift, cy: y + rowH / 2, w: e.w, h: e.h });
    }
    y += rowH + BAND_GAP_Y;
  }

  // Side column (item 5): Business Objects / Products / Contracts /
  // Representations sit LEFT or RIGHT of the bands, next to the element(s) they
  // connect to (nearest side by the connected elements' average X). Same-side
  // items are stacked by Y and pushed apart so they don't overlap.
  if (sideItems.length) {
    let layMinX = Infinity, layMaxX = -Infinity;
    for (const pos of posById.values()) { layMinX = Math.min(layMinX, pos.cx - pos.w / 2); layMaxX = Math.max(layMaxX, pos.cx + pos.w / 2); }
    if (!Number.isFinite(layMinX)) { layMinX = START_X; layMaxX = START_X + 200; }
    const midX = (layMinX + layMaxX) / 2;
    const SIDE_GAP = 60;
    const left: { p: Placed; cy: number }[] = [];
    const right: { p: Placed; cy: number }[] = [];
    for (const p of sideItems) {
      const nbrs = (adj.get(p.ai.id) ?? []).map(id => posById.get(id)).filter((n): n is { cx: number; cy: number; w: number; h: number } => !!n);
      const cy = nbrs.length ? nbrs.reduce((s, n) => s + n.cy, 0) / nbrs.length : START_Y;
      const cx = nbrs.length ? nbrs.reduce((s, n) => s + n.cx, 0) / nbrs.length : midX;
      (cx <= midX ? left : right).push({ p, cy });
    }
    const placeSide = (list: { p: Placed; cy: number }[], atX: number, anchorLeft: boolean) => {
      list.sort((a, b) => a.cy - b.cy);
      let prevBottom = -Infinity;
      for (const it of list) {
        let top = it.cy - it.p.h / 2;
        if (top < prevBottom + EL_GAP_X) top = prevBottom + EL_GAP_X;
        prevBottom = top + it.p.h;
        elements.push({
          id: it.p.ai.id,
          type: "archimate-shape",
          x: anchorLeft ? atX : atX - it.p.w,
          y: top,
          width: it.p.w, height: it.p.h,
          label: it.p.label,
          properties: it.p.iconOnly
            ? { shapeKey: it.p.shapeKey, archimateIconOnly: true }
            : { shapeKey: it.p.shapeKey },
        });
      }
    };
    placeSide(left, layMinX - SIDE_GAP, false); // right edge sits at layMinX − gap
    placeSide(right, layMaxX + SIDE_GAP, true); // left edge sits at layMaxX + gap
  }

  const computed = buildArchiConnectors(elements, aiConnections);

  return {
    elements,
    connectors: computed,
    viewport: { x: 0, y: 0, zoom: 0.7 },
    fontSize: 14,
    connectorFontSize: 10,
  };
}

// Build routed ArchiMate connectors for a laid-out element set. Pass 1: pick the
// facing side for each end. Pass 2: where several connectors share one element
// side, spread their attachment points evenly (offset 1/(n+1) … n/(n+1)) sorted
// by the opposite endpoint (rule A4.04 / attachment-point separation).
// A `composition` whose target is NESTED inside its source (target.parentId ===
// source.id) is DROPPED — the visual containment already expresses the whole-part,
// so no line is drawn. For non-nested diagrams this drop is a no-op.
function buildArchiConnectors(
  elements: DiagramElement[],
  aiConnections: NonNullable<AiParsed["connections"]>,
  opts?: { honorSides?: boolean },
): Connector[] {
  const elMap = new Map(elements.map(e => [e.id, e]));
  type Side = "top" | "bottom" | "left" | "right";
  const SIDES = new Set<string>(["top", "bottom", "left", "right"]);
  const honor = !!opts?.honorSides; // image reproduction: honour the AI's drawn sides
  type Pre = { c: typeof aiConnections[number]; src: DiagramElement; tgt: DiagramElement;
    connType: string; srcSide: Side; tgtSide: Side; srcOffset: number; tgtOffset: number };
  const prelim: Pre[] = [];
  for (const c of aiConnections) {
    const src = elMap.get(c.sourceId);
    const tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;
    const connType = ARCHI_REL[(c.type ?? "").toLowerCase()] ?? "archi-association";
    // Nested composition → the containment IS the relationship; draw no line.
    if (connType === "archi-composition" && tgt.parentId === src.id) continue;
    const srcCx = src.x + src.width / 2, tgtCx = tgt.x + tgt.width / 2;
    const srcCy = src.y + src.height / 2, tgtCy = tgt.y + tgt.height / 2;
    // Facing sides from geometry — the fallback when the AI didn't report a side.
    let srcSide: Side, tgtSide: Side;
    if (Math.abs(tgtCy - srcCy) > Math.abs(tgtCx - srcCx)) {
      srcSide = tgtCy > srcCy ? "bottom" : "top";
      tgtSide = tgtCy > srcCy ? "top" : "bottom";
    } else {
      srcSide = tgtCx > srcCx ? "right" : "left";
      tgtSide = tgtCx > srcCx ? "left" : "right";
    }
    // Requirement 3 — mimic the image's connection points: honour the AI-reported
    // face (and along-side position) per end when present.
    if (honor && typeof c.sourceSide === "string" && SIDES.has(c.sourceSide)) srcSide = c.sourceSide as Side;
    if (honor && typeof c.targetSide === "string" && SIDES.has(c.targetSide)) tgtSide = c.targetSide as Side;
    const srcOffset = honor && typeof c.sourceOffset === "number" ? clamp01(c.sourceOffset) : 0.5;
    const tgtOffset = honor && typeof c.targetOffset === "number" ? clamp01(c.targetOffset) : 0.5;
    prelim.push({ c, src, tgt, connType, srcSide, tgtSide, srcOffset, tgtOffset });
  }
  // Group endpoints by element|side. A group of ONE keeps its offset (the honoured
  // AI position, or the 0.5 centre). A group of several is spread to distinct points
  // (requirement 2 — no two endpoints share a point), ordered by the honoured AI
  // offset when present, else by the opposite endpoint (crossing reduction).
  const groups = new Map<string, { p: Pre; end: "src" | "tgt" }[]>();
  const push = (key: string, v: { p: Pre; end: "src" | "tgt" }) => {
    const l = groups.get(key); if (l) l.push(v); else groups.set(key, [v]);
  };
  for (const p of prelim) {
    push(`${p.src.id}|${p.srcSide}`, { p, end: "src" });
    push(`${p.tgt.id}|${p.tgtSide}`, { p, end: "tgt" });
  }
  for (const [key, list] of groups) {
    if (list.length <= 1) continue;
    const side = key.split("|")[1];
    const horiz = side === "top" || side === "bottom";
    list.sort((a, b) => {
      if (honor) {
        const ka = a.end === "src" ? a.p.srcOffset : a.p.tgtOffset;
        const kb = b.end === "src" ? b.p.srcOffset : b.p.tgtOffset;
        if (ka !== kb) return ka - kb;
      }
      const ao = a.end === "src" ? a.p.tgt : a.p.src;
      const bo = b.end === "src" ? b.p.tgt : b.p.src;
      return horiz ? (ao.x - bo.x) : (ao.y - bo.y);
    });
    list.forEach((item, i) => {
      const off = (i + 1) / (list.length + 1);
      if (item.end === "src") item.p.srcOffset = off; else item.p.tgtOffset = off;
    });
  }
  const connectors: Connector[] = prelim.map(p => ({
    id: `conn-${p.src.id}-${p.tgt.id}`,
    sourceId: p.src.id, targetId: p.tgt.id,
    sourceSide: p.srcSide as Connector["sourceSide"],
    targetSide: p.tgtSide as Connector["targetSide"],
    type: p.connType as Connector["type"],
    directionType: "directed" as Connector["directionType"],
    routingType: "rectilinear" as Connector["routingType"],
    sourceInvisibleLeader: false, targetInvisibleLeader: false,
    waypoints: [] as Point[],
    label: p.c.label ?? "",
    sourceOffsetAlong: p.srcOffset,
    targetOffsetAlong: p.tgtOffset,
  } as Connector));

  return connectors.map(conn => {
    const src = elMap.get(conn.sourceId), tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    try {
      const r = computeWaypoints(src, tgt, elements, conn.sourceSide, conn.targetSide, conn.routingType, conn.sourceOffsetAlong ?? 0.5, conn.targetOffsetAlong ?? 0.5);
      return { ...conn, waypoints: r.waypoints, sourceInvisibleLeader: r.sourceInvisibleLeader, targetInvisibleLeader: r.targetInvisibleLeader };
    } catch { return conn; }
  });
}

/** Resolve each element's nesting parent from its `parent` field. Honoured only
 *  when it points at ANOTHER mapped ArchiMate element and doesn't form a cycle
 *  (composition is single-parent, so "part of two wholes" can't arise here). */
function resolveArchiParents(
  aiElements: NonNullable<AiParsed["elements"]>,
): Map<string, string> {
  const mapped = new Set(aiElements.filter(e => e.id && ARCHI_SHAPE[e.type]).map(e => e.id));
  const typeOf = new Map(aiElements.filter(e => e.id).map(e => [e.id, e.type]));
  const raw = new Map<string, string>();
  for (const e of aiElements) {
    if (e.id && typeof e.parent === "string" && e.parent !== e.id
        && mapped.has(e.id) && mapped.has(e.parent)) {
      // A Location may only be CONTAINED BY another Location or a Grouping — never by
      // an Actor or any other element. Drop an illegal Location nesting (Paul, 2026-07-30).
      if (e.type === "location" && !["location", "grouping"].includes(typeOf.get(e.parent) ?? "")) continue;
      raw.set(e.id, e.parent);
    }
  }
  // Drop any link that would create a cycle (walk ancestors; cut if we loop back).
  const parentId = new Map<string, string>();
  for (const [child, parent] of raw) {
    let cur: string | undefined = parent;
    const seen = new Set<string>([child]);
    let ok = true;
    while (cur) {
      if (seen.has(cur)) { ok = false; break; }
      seen.add(cur);
      cur = raw.get(cur);
    }
    if (ok) parentId.set(child, parent);
  }
  return parentId;
}

// Container-grow padding: PAD around children, HEADER for the container's own
// label band at the top (ArchiMate containers render their name at the top).
const ARCHI_NEST_PAD = 16, ARCHI_NEST_HEADER = 28, ARCHI_NEST_GAP = 24;

// Minimum inter-element gaps, as a fraction of the default Business Process box
// (113×76): general neighbours keep 20% of the BP dimension on the facing axis; a
// directly-connected adjacent pair keeps 35% ALONG the connector's axis so the line
// (and any label) has room (Paul, 2026-07-29).
const ARCHI_BP_W = 113, ARCHI_BP_H = 76;
const ARCHI_GAP_GEN_X = Math.round(0.20 * ARCHI_BP_W);   // ~23
const ARCHI_GAP_GEN_Y = Math.round(0.20 * ARCHI_BP_H);   // ~15
const ARCHI_GAP_CONN_X = Math.round(0.35 * ARCHI_BP_W);  // ~40
const ARCHI_GAP_CONN_Y = Math.round(0.35 * ARCHI_BP_H);  // ~27

/** Enforce a MINIMUM gap between neighbouring elements (not just no-overlap), so the
 *  reproduced arrangement never gets cramped. Two elements are "neighbours" when their
 *  perpendicular projections overlap (same row or column); the gap on the facing axis
 *  is grown to the general minimum (20% BP), or to 35% BP when the pair is directly
 *  connected (room for the connector). Colliding pairs are separated the same way.
 *  Ancestor↔descendant pairs are skipped (a child sits inside its container).
 *  `move(el, dx, dy)` shifts an element — and, for a container, its whole subtree. */
function enforceArchiGaps(
  els: DiagramElement[],
  connected: Set<string>,
  move: (el: DiagramElement, dx: number, dy: number) => void,
  isAncestor: (a: string, b: string) => boolean,
): void {
  if (els.length < 2) return;
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const PERP = 0.25; // require ≥25% perpendicular overlap to count as a row/column neighbour
  const pushX = (A: DiagramElement, B: DiagramElement, amt: number) => {
    const half = amt / 2;
    if (A.x + A.width / 2 <= B.x + B.width / 2) { move(A, -half, 0); move(B, half, 0); }
    else { move(A, half, 0); move(B, -half, 0); }
  };
  const pushY = (A: DiagramElement, B: DiagramElement, amt: number) => {
    const half = amt / 2;
    if (A.y + A.height / 2 <= B.y + B.height / 2) { move(A, 0, -half); move(B, 0, half); }
    else { move(A, 0, half); move(B, 0, -half); }
  };
  for (let iter = 0; iter < 12; iter++) {
    let moved = false;
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const A = els[i], B = els[j];
        if (isAncestor(A.id, B.id) || isAncestor(B.id, A.id)) continue;
        const ox = Math.min(A.x + A.width, B.x + B.width) - Math.max(A.x, B.x);
        const oy = Math.min(A.y + A.height, B.y + B.height) - Math.max(A.y, B.y);
        const conn = connected.has(key(A.id, B.id));
        if (ox > 0 && oy > 0) {
          // Collision — separate on the axis where the centres differ most.
          if (Math.abs((A.x + A.width / 2) - (B.x + B.width / 2)) >= Math.abs((A.y + A.height / 2) - (B.y + B.height / 2))) {
            pushX(A, B, ox + (conn ? ARCHI_GAP_CONN_X : ARCHI_GAP_GEN_X));
          } else {
            pushY(A, B, oy + (conn ? ARCHI_GAP_CONN_Y : ARCHI_GAP_GEN_Y));
          }
          moved = true;
        } else if (oy <= 0 && ox >= PERP * Math.min(A.width, B.width)) {
          // Vertical neighbours (columns aligned) — enforce the min gap on Y.
          const req = conn ? ARCHI_GAP_CONN_Y : ARCHI_GAP_GEN_Y;
          if (-oy < req - 0.5) { pushY(A, B, req - -oy); moved = true; }
        } else if (ox <= 0 && oy >= PERP * Math.min(A.height, B.height)) {
          // Horizontal neighbours (rows aligned) — enforce the min gap on X.
          const req = conn ? ARCHI_GAP_CONN_X : ARCHI_GAP_GEN_X;
          if (-ox < req - 0.5) { pushX(A, B, req - -ox); moved = true; }
        }
      }
    }
    if (!moved) break;
  }
}

/** ArchiMate image reproduction: honour the AI's per-shape `bounds` (fractions of
 *  the image) + `parent` nesting so the diagram matches the drawing. Returns null
 *  when too few elements carry bounds, so the caller falls back to the nested /
 *  band auto-layout. Mirrors layoutStateMachinePreserved / layoutDomainPreserved. */
export function layoutArchimatePreserved(
  aiElements: NonNullable<AiParsed["elements"]>,
  aiConnections: NonNullable<AiParsed["connections"]>,
  imageAspect?: { w: number; h: number },
): DiagramData | null {
  const ided = aiElements.filter(e => e.id && ARCHI_SHAPE[e.type]);
  const withBounds = ided.filter(e => validBounds(e.bounds));
  if (ided.length === 0 || withBounds.length < Math.ceil(ided.length * 0.6)) return null;

  const parentOf = resolveArchiParents(aiElements);
  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of parentOf) {
    (childrenOf.get(parent) ?? childrenOf.set(parent, []).get(parent)!).push(child);
  }
  const isContainer = (id: string) => (childrenOf.get(id)?.length ?? 0) > 0;

  // Elements render at their STANDARD generated size (boxSize: text-fit, ~128×76)
  // — NOT scaled up to the image's pixel size (that made them ~4× too big). The
  // bounds drive POSITION / arrangement only. Containers are then grown to hug
  // their children. Pick the position scale so a typical LEAF's bounds-slot ≈ its
  // standard size, keeping the arrangement proportional without huge gaps.
  const aspect = imageAspect && imageAspect.w > 0 ? imageAspect.h / imageAspect.w : 0.66;
  const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const leafBW = ided.filter(e => !isContainer(e.id) && validBounds(e.bounds)).map(e => (e.bounds as AiBounds).w);
  const medBW = median(leafBW);
  const TARGET_W = medBW > 0 ? Math.min(4000, Math.max(600, A409_DEFAULT_W / medBW)) : 1400;
  const TARGET_H = TARGET_W * (Number.isFinite(aspect) && aspect > 0 ? aspect : 0.66);
  const OX = 60, OY = 60;

  const elements: DiagramElement[] = [];
  for (const e of ided) {
    const spec = archiShapeForm(e.type, e.notation)!;
    const label = formatLabel(e.label ?? e.name ?? "");
    // Leaves: 2-line-preferring standard size (archiFitSize — widen to keep ≤2 lines
    // before expanding). Containers: provisional; hugged around their children below.
    const sz = isContainer(e.id) ? boxSize(label) : archiFitSize(label);
    const b = validBounds(e.bounds) ? e.bounds : undefined;
    // Centre the box on the element's drawn centre (best arrangement fidelity); no
    // bounds → default origin. Containers are repositioned by the grow.
    const cx = b ? OX + clamp01(b.x + b.w / 2) * TARGET_W : OX + sz.w / 2;
    const cy = b ? OY + clamp01(b.y + b.h / 2) * TARGET_H : OY + sz.h / 2;
    const props: Record<string, unknown> = { shapeKey: spec.key };
    if (spec.iconOnly) props.archimateIconOnly = true;
    if (isContainer(e.id)) props.archimateIsContainer = true;
    elements.push({
      id: e.id, type: "archimate-shape", label,
      x: cx - sz.w / 2, y: cy - sz.h / 2, width: sz.w, height: sz.h,
      ...(parentOf.has(e.id) ? { parentId: parentOf.get(e.id) } : {}),
      properties: props,
    } as DiagramElement);
  }

  const depthOf = (id: string) => { let d = 0, cur = parentOf.get(id); const seen = new Set<string>(); while (cur && !seen.has(cur)) { seen.add(cur); d++; cur = parentOf.get(cur); } return d; };
  const elMap = new Map(elements.map(e => [e.id, e]));
  // Shift an element and (if it is a container) its whole subtree, so nested
  // contents ride along when a container is separated from its siblings.
  const shiftSubtree = (el: DiagramElement, dx: number, dy: number) => {
    const stack = [el.id];
    while (stack.length) {
      const cur = stack.pop()!; const cel = elMap.get(cur); if (!cel) continue;
      cel.x += dx; cel.y += dy;
      for (const k of childrenOf.get(cur) ?? []) stack.push(k);
    }
  };

  // Grow each container to HUG its children — DEEPEST FIRST so a mid-level container
  // wraps its already-sized sub-containers. Sized to children bbox + PAD + top HEADER.
  const hug = () => {
    const containers = elements.filter(c => isContainer(c.id)).sort((a, b) => depthOf(b.id) - depthOf(a.id));
    for (const c of containers) {
      const kids = (childrenOf.get(c.id) ?? []).map(id => elMap.get(id)!).filter(Boolean);
      if (!kids.length) continue;
      // The FRONT rectangle wraps the children (+ PAD, + top HEADER for the label).
      const frontLeft = Math.min(...kids.map(k => k.x)) - ARCHI_NEST_PAD;
      const frontTop = Math.min(...kids.map(k => k.y)) - ARCHI_NEST_PAD - ARCHI_NEST_HEADER;
      const frontRight = Math.max(...kids.map(k => k.x + k.width)) + ARCHI_NEST_PAD;
      const frontBottom = Math.max(...kids.map(k => k.y + k.height)) + ARCHI_NEST_PAD;
      const frontW = Math.max(frontRight - frontLeft, boxSize(c.label).w); // fit the name too
      const frontH = frontBottom - frontTop;
      if (isArchiNodeIcon(c.properties?.shapeKey, c.properties?.archimateIconOnly)) {
        // Node container: children sit in the FRONT rectangle; the 3D trapeziums add
        // depth on the TOP and RIGHT, so the full (attachment) bounds enclose them.
        let d = archiNodeDepth(frontW, frontH);
        d = archiNodeDepth(frontW + d, frontH + d); // refine toward the full-size depth
        c.x = frontLeft; c.y = frontTop - d;
        c.width = frontW + d; c.height = frontH + d;
      } else {
        c.x = frontLeft; c.y = frontTop;
        c.width = frontW; c.height = frontH;
      }
    }
  };

  // Directly-connected element pairs → the larger 35% along-connector gap.
  const pkey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const connected = new Set<string>();
  for (const c of aiConnections) {
    if (c.sourceId !== c.targetId && elMap.has(c.sourceId) && elMap.has(c.targetId)) connected.add(pkey(c.sourceId, c.targetId));
  }
  const isAncestor = (a: string, b: string) => { // a is an ancestor of b?
    let cur = parentOf.get(b); const seen = new Set<string>();
    while (cur && !seen.has(cur)) { if (cur === a) return true; seen.add(cur); cur = parentOf.get(cur); }
    return false;
  };

  // Hug, then enforce minimum inter-element gaps across ALL elements (moving whole
  // subtrees), then re-hug (children may have shifted) and settle the now-final root
  // boxes. Positions still come from the image bounds — the pass only widens gaps
  // that fell below the minimum, so it mimics the drawn spacing as much as possible.
  hug();
  enforceArchiGaps(elements, connected, shiftSubtree, isAncestor);
  hug();
  enforceArchiGaps(elements.filter(e => !e.parentId), connected, shiftSubtree, isAncestor);
  hug();
  for (const el of elements) { el.x = Math.round(el.x); el.y = Math.round(el.y); el.width = Math.round(el.width); el.height = Math.round(el.height); }

  // Roots first, deepest last → every parent precedes its children in the array
  // (renders containers UNDER their contents; generalises the 2-level SM sort).
  elements.sort((a, b) => depthOf(a.id) - depthOf(b.id));

  return {
    elements,
    connectors: buildArchiConnectors(elements, aiConnections, { honorSides: true }),
    viewport: { x: 0, y: 0, zoom: 0.7 },
    fontSize: 14,
    connectorFontSize: 10,
  };
}

/** ArchiMate text-gen nesting (no image bounds): lay the containment forest out
 *  as nested boxes — containers sized to a grid of their children, roots in a row.
 *  Called from layoutArchimateDiagram when any element carries a resolved `parent`. */
function layoutArchimateNested(
  aiElements: NonNullable<AiParsed["elements"]>,
  aiConnections: NonNullable<AiParsed["connections"]>,
  parentOf: Map<string, string>,
): DiagramData {
  const mapped = aiElements.filter(e => e.id && ARCHI_SHAPE[e.type]);
  const labelOf = new Map(mapped.map(e => [e.id, formatLabel(e.label ?? e.name ?? "")]));
  const childrenOf = new Map<string, string[]>();
  for (const e of mapped) {
    const p = parentOf.get(e.id);
    if (p) (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(e.id);
  }
  const roots = mapped.filter(e => !parentOf.has(e.id)).map(e => e.id);

  // Post-order subtree sizing: a leaf = its label box; a container = a grid of
  // its children's subtree sizes + PAD + a HEADER band for its own label.
  const sizeOf = new Map<string, { w: number; h: number }>();
  type Grid = { kids: string[]; colW: number[]; rowH: number[]; cols: number };
  const gridOf = new Map<string, Grid>();
  const sizeSubtree = (id: string, guard: Set<string>): { w: number; h: number } => {
    if (sizeOf.has(id)) return sizeOf.get(id)!;
    const kids = (childrenOf.get(id) ?? []).filter(k => !guard.has(k));
    if (!kids.length) { const s = archiFitSize(labelOf.get(id) ?? ""); sizeOf.set(id, s); return s; }
    const g2 = new Set(guard); g2.add(id);
    const childSizes = kids.map(k => sizeSubtree(k, g2));
    const cols = Math.max(1, Math.ceil(Math.sqrt(kids.length)));
    const rows = Math.ceil(kids.length / cols);
    const colW = new Array(cols).fill(0), rowH = new Array(rows).fill(0);
    childSizes.forEach((cs, i) => { const c = i % cols, r = Math.floor(i / cols); colW[c] = Math.max(colW[c], cs.w); rowH[r] = Math.max(rowH[r], cs.h); });
    const innerW = colW.reduce((a, b) => a + b, 0) + ARCHI_NEST_GAP * (cols - 1);
    const innerH = rowH.reduce((a, b) => a + b, 0) + ARCHI_NEST_GAP * (rows - 1);
    const ownLabelW = boxSize(labelOf.get(id) ?? "").w;
    const s = { w: Math.max(ARCHI_NEST_PAD * 2 + innerW, ownLabelW), h: ARCHI_NEST_HEADER + ARCHI_NEST_PAD * 2 + innerH };
    gridOf.set(id, { kids, colW, rowH, cols });
    sizeOf.set(id, s);
    return s;
  };
  for (const id of roots) sizeSubtree(id, new Set());

  // Emit: place each root in a left-to-right row (top-aligned), then recurse.
  const elements: DiagramElement[] = [];
  const emit = (id: string, x: number, y: number) => {
    const e = mapped.find(m => m.id === id)!;
    const spec = archiShapeForm(e.type, e.notation)!;
    const s = sizeOf.get(id)!;
    const container = (childrenOf.get(id)?.length ?? 0) > 0;
    const props: Record<string, unknown> = { shapeKey: spec.key };
    if (spec.iconOnly) props.archimateIconOnly = true;
    if (container) props.archimateIsContainer = true;
    elements.push({
      id, type: "archimate-shape", label: labelOf.get(id) ?? "",
      x: Math.round(x), y: Math.round(y), width: Math.round(s.w), height: Math.round(s.h),
      ...(parentOf.has(id) ? { parentId: parentOf.get(id) } : {}),
      properties: props,
    } as DiagramElement);
    if (!container) return;
    const g = gridOf.get(id)!;
    let cursorY = y + ARCHI_NEST_HEADER + ARCHI_NEST_PAD;
    g.kids.forEach((kid, i) => {
      const c = i % g.cols, r = Math.floor(i / g.cols);
      if (c === 0 && i > 0) cursorY += g.rowH[r - 1] + ARCHI_NEST_GAP;
      const cellX = x + ARCHI_NEST_PAD + g.colW.slice(0, c).reduce((a, b) => a + b, 0) + ARCHI_NEST_GAP * c;
      const ksz = sizeOf.get(kid)!;
      emit(kid, cellX + (g.colW[c] - ksz.w) / 2, cursorY + (g.rowH[r] - ksz.h) / 2);
    });
  };
  let cursorX = START_X;
  for (const id of roots) {
    emit(id, cursorX, START_Y);
    cursorX += (sizeOf.get(id)?.w ?? A409_DEFAULT_W) + 60;
  }

  return {
    elements,
    connectors: buildArchiConnectors(elements, aiConnections),
    viewport: { x: 0, y: 0, zoom: 0.7 },
    fontSize: 14,
    connectorFontSize: 10,
  };
}

/** Build element properties from AI output */
function buildProperties(ai: Record<string, unknown>, diagramType: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  // Value chain process description — V1.07: format as a bolded-verb action
  // list (rich-text HTML the description box renders).
  if ((ai.type === "chevron" || ai.type === "chevron-collapsed") && ai.description) {
    const formatted = formatActionList(String(ai.description));
    if (formatted) {
      props.description = formatted;
      props.showDescription = true;
    }
  }

  // UML class attributes + operations
  if (ai.type === "uml-class") {
    // Only show a stereotype the drawing actually had (a plain class has none).
    if (ai.stereotype) { props.stereotype = ai.stereotype; props.showStereotype = true; }
    // Abstract entity (italic name by default, or a {abstract} line).
    if ((ai as { isAbstract?: boolean }).isAbstract) {
      props.isAbstract = true;
      props.abstractDisplay = (ai as { abstractDisplay?: string }).abstractDisplay === "text" ? "text" : "italics";
    }
    if (Array.isArray(ai.attributes) && ai.attributes.length) {
      props.showAttributes = true;
      props.attributes = (ai.attributes as Array<Record<string, unknown>>).map((a, i) => {
        let name = (a.name as string) ?? `attr${i}`;
        let derived = a.isDerived === true;
        if (name.startsWith("/")) { derived = true; name = name.slice(1).trim(); }
        return {
          visibility: a.visibility ?? "+",
          name,
          ...(derived ? { isDerived: true } : {}),
          type: a.type,
          ...(a.multiplicity ? { multiplicity: a.multiplicity } : {}),
        };
      });
    }
    if (Array.isArray(ai.operations) && ai.operations.length) {
      props.showOperations = true;
      props.operations = (ai.operations as Array<Record<string, unknown>>).map((o, i) => ({
        visibility: o.visibility ?? "+",
        name: o.name ?? `op${i}`,
      }));
    }
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
  // Normalise the angle to (-π, π] so the angTL/angTR/angBL/angBR
  // ranges below (all from atan2, which lives in (-π, π]) cover every
  // possible input. Callers like the Context-Diagram cluster compute
  // procAngle = θ ± clusterHalf where θ comes from
  // `(i / N) * 2π - π/2` and can sit anywhere in (-π/2, 3π/2). Without
  // this wrap, every angle > angBL (≈ 3π/4) falls into the catch-all
  // "left" branch — turning entities in the upper-left quadrant into a
  // pile of connectors all landing on the same clamped left-side point.
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  const dxC = Math.cos(a), dyC = Math.sin(a);
  const angTL = Math.atan2(-halfH, -halfW);
  const angTR = Math.atan2(-halfH,  halfW);
  const angBL = Math.atan2( halfH, -halfW);
  const angBR = Math.atan2( halfH,  halfW);
  const clamp = (v: number) => Math.max(0.05, Math.min(0.95, v));
  if (a > angTL && a <= angTR) {
    const t = dyC !== 0 ? -halfH / dyC : 1;
    return { side: "top", offset: clamp((cx + dxC * t - el.x) / el.width) };
  } else if (a > angTR && a <= angBR) {
    const t = dxC !== 0 ? halfW / dxC : 1;
    return { side: "right", offset: clamp((cy + dyC * t - el.y) / el.height) };
  } else if (a > angBR && a <= angBL) {
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
