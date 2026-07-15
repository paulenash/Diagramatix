/**
 * Domain (UML class) layout that PRESERVES the geometry read from an uploaded
 * image — the sibling of layoutStateMachinePreserved. When the AI emits
 * per-element fractional `bounds` (plus optional `parent` package nesting and
 * connector `sourceSide`/`targetSide`), reproduce the drawing instead of
 * grid-flowing. Returns null when the geometry is missing/sparse so the caller
 * falls back to auto-layout.
 */
import type { DiagramData, DiagramElement, Connector, Side } from "./types";
import { recomputeAllConnectors } from "./routing";
import { autoResizeUmlElement } from "./umlAutoSize";

interface AiBounds { x: number; y: number; w: number; h: number }
interface AiEl {
  id?: string; type: string; label?: string; name?: string;
  bounds?: unknown; parent?: string; stereotype?: string;
  attributes?: Array<Record<string, unknown>>;
  operations?: Array<Record<string, unknown>>;
  values?: string[];
}
interface AiConn {
  sourceId: string; targetId: string; type?: string; label?: string;
  sourceSide?: string; targetSide?: string;
  sourceMultiplicity?: string; targetMultiplicity?: string;
  sourceRole?: string; targetRole?: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function validBounds(b: unknown): b is AiBounds {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return ["x", "y", "w", "h"].every(k => typeof o[k] === "number" && Number.isFinite(o[k] as number));
}

/** UML properties (attributes / operations / enum values / stereotype). */
function domainProps(e: AiEl): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (e.type === "uml-class") {
    // Only show a stereotype the drawing actually had (issue #4) — a plain class
    // has none; the AI supplies `stereotype` when it reads a «guillemet» tag.
    if (e.stereotype) { props.stereotype = e.stereotype; props.showStereotype = true; }
    if (Array.isArray(e.attributes) && e.attributes.length) {
      props.showAttributes = true;
      props.attributes = e.attributes.map((a, i) => ({
        visibility: (a.visibility as string) ?? "+",
        name: (a.name as string) ?? `attr${i}`,
        ...(a.type ? { type: a.type as string } : {}),
        ...(a.multiplicity ? { multiplicity: a.multiplicity as string } : {}),
      }));
    }
    if (Array.isArray(e.operations) && e.operations.length) {
      props.showOperations = true;
      props.operations = e.operations.map((o, i) => ({
        visibility: (o.visibility as string) ?? "+",
        name: (o.name as string) ?? `op${i}`,
      }));
    }
  } else if (e.type === "uml-enumeration" && Array.isArray(e.values)) {
    props.stereotype = "enumeration"; props.showStereotype = true; props.values = e.values;
  }
  return props;
}

export function layoutDomainPreserved(
  aiElements: AiEl[],
  aiConnections: AiConn[],
  imageAspect?: { w: number; h: number },
): DiagramData | null {
  const ided = aiElements.filter(e => e.id);
  const withBounds = ided.filter(e => validBounds(e.bounds));
  // Need most elements to carry geometry, else the reproduction would mix image
  // positions with (0,0) fallbacks — bail so the caller auto-lays.
  if (ided.length === 0 || withBounds.length < Math.ceil(ided.length * 0.6)) return null;

  const byId = new Map(ided.map(e => [e.id!, e]));

  // Normalised → px, aspect-preserving (keeps the source diagram's proportions).
  const TARGET_W = 1400;
  const aspect = imageAspect && imageAspect.w > 0 ? imageAspect.h / imageAspect.w : 0.7;
  const TARGET_H = TARGET_W * (Number.isFinite(aspect) && aspect > 0 ? aspect : 0.7);
  const OX = 60, OY = 60;

  const elements: DiagramElement[] = [];
  for (const e of ided) {
    let x = OX, y = OY, w = 200, h = 100;
    if (validBounds(e.bounds)) {
      const b = e.bounds;
      x = OX + clamp01(b.x) * TARGET_W;
      y = OY + clamp01(b.y) * TARGET_H;
      w = Math.max(0.01, b.w) * TARGET_W;
      h = Math.max(0.01, b.h) * TARGET_H;
    }
    if (e.type === "uml-package") { w = Math.max(220, w); h = Math.max(140, h); }
    else if (e.type === "uml-note") { w = Math.max(120, w); h = Math.max(60, h); }
    else if (e.type === "uml-enumeration") { w = Math.max(140, w); h = Math.max(70, h); }
    else { w = Math.max(150, w); h = Math.max(70, h); }
    const parent = e.parent && byId.has(e.parent) && byId.get(e.parent)!.type === "uml-package"
      ? e.parent : undefined;
    elements.push({
      id: e.id!, type: e.type as DiagramElement["type"],
      label: e.label ?? e.name ?? "",
      x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h),
      ...(parent ? { parentId: parent } : {}),
      properties: domainProps(e),
    } as DiagramElement);
  }

  // Size classes & enumerations to their CONTENT (same sizer the editor uses),
  // not the AI's fractional image bounds — those come back near-uniform, so
  // trusting them makes every box the same shape. Re-centre on the original
  // position so the box stays where the eye expects it in the reproduction.
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type !== "uml-class" && el.type !== "uml-enumeration") continue;
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    const sized = autoResizeUmlElement(el);
    elements[i] = {
      ...sized,
      x: Math.round(cx - sized.width / 2),
      y: Math.round(cy - sized.height / 2),
    };
  }

  // Grow each package to enclose its members (image bounds are approximate).
  const HEADER = 30, PAD = 16;
  for (const c of elements) {
    if (c.type !== "uml-package") continue;
    const kids = elements.filter(k => k.parentId === c.id);
    if (!kids.length) continue;
    const minX = Math.min(...kids.map(k => k.x)) - PAD;
    const minY = Math.min(...kids.map(k => k.y)) - PAD - HEADER;
    const maxX = Math.max(...kids.map(k => k.x + k.width)) + PAD;
    const maxY = Math.max(...kids.map(k => k.y + k.height)) + PAD;
    const nx = Math.min(c.x, minX), ny = Math.min(c.y, minY);
    c.width = Math.max(c.x + c.width, maxX) - nx;
    c.height = Math.max(c.y + c.height, maxY) - ny;
    c.x = nx; c.y = ny;
  }

  // Packages first so they render UNDER their members.
  elements.sort((a, b) => Number(b.type === "uml-package") - Number(a.type === "uml-package"));

  const elIds = new Set(elements.map(e => e.id));
  const SIDES = new Set<Side>(["top", "right", "bottom", "left"]);
  const connectors: Connector[] = aiConnections
    .filter(c => elIds.has(c.sourceId) && elIds.has(c.targetId))
    .map(c => {
      const type = (c.type ?? "uml-association") as Connector["type"];
      const direct = type === "uml-note-anchor" || type === "uml-containment";
      return {
        id: `conn-${c.sourceId}-${c.targetId}`,
        sourceId: c.sourceId, targetId: c.targetId,
        sourceSide: (SIDES.has(c.sourceSide as Side) ? c.sourceSide : "right") as Connector["sourceSide"],
        targetSide: (SIDES.has(c.targetSide as Side) ? c.targetSide : "left") as Connector["targetSide"],
        type,
        directionType: "non-directed",
        routingType: direct ? "direct" : "rectilinear",
        sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
        ...(c.sourceMultiplicity ? { sourceMultiplicity: c.sourceMultiplicity } : {}),
        ...(c.targetMultiplicity ? { targetMultiplicity: c.targetMultiplicity } : {}),
        ...(c.sourceRole ? { sourceRole: c.sourceRole } : {}),
        ...(c.targetRole ? { targetRole: c.targetRole } : {}),
        ...(c.label ? { label: c.label } : {}),
      } as Connector;
    });

  return {
    elements,
    connectors: recomputeAllConnectors(connectors, elements),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
