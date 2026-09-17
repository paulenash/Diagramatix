/**
 * Where the "edit zoom" aims when you open an element's name editor, and
 * whether it fires at all.
 *
 * The canvas snaps in on whatever you are about to type into, so the text is
 * readable while you edit and the view returns to where it was afterwards. The
 * snap only ever zooms IN: if the thing you are editing is already comfortably
 * large, moving the canvas would be more disruptive than helpful.
 *
 * That one-way rule is the whole difficulty. Aim the snap at a container — an
 * expanded subprocess, a pool, a group — and the "feature" is hundreds of world
 * units wide, the ideal zoom comes out smaller than the current zoom, and the
 * snap silently does nothing. You then type the name at whatever zoom you
 * happened to be at. The answer is to aim at the part you actually edit (the
 * header strip, the label below the shape) rather than at the whole box.
 *
 * Kept pure and separate from Canvas.tsx so the aim and the fire/don't-fire
 * decision can be tested without a DOM.
 */
import type { DiagramElement, SymbolType } from "./types";

/** Height of the name strip along the top of a container. */
export const HEADER_H = 28;

/**
 * What the snap aims at for a header-strip container, in world units.
 *
 * Deliberately the same 180 the pool/lane editor already uses, and deliberately
 * NOT the editor's own width. The aim decides whether the snap fires at all: at
 * a 1200px viewport and the default 0.2 fraction, 180 gives an ideal zoom of
 * 1.33, so a container sitting at 1:1 does snap in. Aim at 240 and the ideal
 * comes out at exactly 1.0 — no change, no snap, which is the bug.
 */
export const CONTAINER_NAME_ZOOM_W = 180;

/**
 * Width of the name editor for a header-strip container, in world units.
 *
 * Wider than the zoom aim because these are the one place a name can run long
 * (an expanded subprocess name is a sentence more often than a pool name is).
 * A container narrower than this still gets an editor spanning its full width,
 * exactly as before.
 */
export const CONTAINER_NAME_EDITOR_W = 360;

/** Default share of the viewport the edited feature should occupy after the snap. */
export const DEFAULT_EDIT_ZOOM_FRACTION = 0.2;

/** Never zoom past this, however small the feature. */
export const MAX_EDIT_ZOOM = 4;

/**
 * Smallest feature the snap will size to. Without it a tiny label (an event
 * name, a short connector condition) would drive an absurd zoom level.
 */
export const MIN_EDIT_ZOOM_WIDTH = 60;

/**
 * Containers whose name lives in a strip along the top edge rather than in the
 * middle of the shape. They all use the same editor geometry.
 */
const HEADER_STRIP_CONTAINERS: ReadonlySet<string> = new Set<SymbolType>([
  "subprocess-expanded",
  "group",
  "system-boundary",
  "composite-state",
]);

export function isHeaderStripContainer(type: string): boolean {
  return HEADER_STRIP_CONTAINERS.has(type);
}

/** Where the snap should centre, and how wide the thing being edited is. */
export interface EditZoomAim {
  centerX: number;
  centerY: number;
  worldWidth: number;
}

/**
 * Aim the snap at the region the user is about to type into.
 *
 * `poolHeaderWidth` / `laneHeaderWidth` are read from the element's properties
 * because both are user-resizable; 36 is the default strip width.
 */
export function planEditZoomAim(el: DiagramElement): EditZoomAim {
  const centreOfShape: EditZoomAim = {
    centerX: el.x + el.width / 2,
    centerY: el.y + el.height / 2,
    worldWidth: el.width,
  };

  if (isHeaderStripContainer(el.type)) {
    return {
      centerX: el.x + el.width / 2,
      centerY: el.y + HEADER_H / 2,
      worldWidth: Math.min(el.width, CONTAINER_NAME_ZOOM_W),
    };
  }

  if (el.type === "data-object" || el.type === "data-store" || el.type === "system") {
    // The name sits below the shape, not in it.
    return {
      centerX: el.x + el.width / 2,
      centerY: el.y + el.height + 14,
      worldWidth: Math.max(el.width, 150),
    };
  }

  if (el.type === "pool" || el.type === "lane") {
    const storedW =
      el.type === "pool"
        ? (el.properties?.poolHeaderWidth as number | undefined)
        : (el.properties?.laneHeaderWidth as number | undefined);
    const lw = typeof storedW === "number" && storedW > 0 ? storedW : 36;
    const taW = Math.min(180, el.width - lw);
    const taH = Math.min(80, el.height);
    return {
      centerX: el.x + lw + taW / 2,
      centerY: el.y + taH / 2,
      worldWidth: taW,
    };
  }

  return centreOfShape;
}

/**
 * The zoom the snap would move to, or null when it would not move at all.
 *
 * Null means one of: the viewport has not been measured yet, or the feature is
 * already large enough on screen that snapping would move the canvas for no
 * gain. Callers fall back to the current zoom and skip the restore.
 */
export function computeEditZoom(
  worldWidth: number,
  currentZoom: number,
  viewportWidth: number,
  fraction: number = DEFAULT_EDIT_ZOOM_FRACTION,
): number | null {
  if (!(viewportWidth > 0)) return null;
  const effectiveWidth = Math.max(MIN_EDIT_ZOOM_WIDTH, worldWidth);
  const idealZoom = (fraction * viewportWidth) / effectiveWidth;
  const focusZoom = Math.min(MAX_EDIT_ZOOM, Math.max(currentZoom, idealZoom));
  // Only worth moving the canvas if the change is visible.
  if (focusZoom <= currentZoom + 0.01) return null;
  return focusZoom;
}

/** The user's stored fraction, clamped so a malformed value cannot break the maths. */
export function clampEditZoomFraction(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_EDIT_ZOOM_FRACTION;
  return Math.max(0.05, Math.min(0.95, raw));
}
