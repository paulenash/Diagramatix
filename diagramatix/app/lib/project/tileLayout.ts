/**
 * The Project screen's diagram-tile layout: how many tiles sit side by side,
 * and how big each one is.
 *
 * Paul, 2026-09-27: "Display Diagram tiles 2-wide and 2 x height and 2 x width
 * with an large diagram icon to match, in the Project screen, in a scrollable
 * region. Allow user to choose 2-wide or 4-wide format."
 *
 *   • 2-wide (the default) — two tiles per row, each twice the width and twice
 *     the height of a 4-wide tile, with the diagram thumbnail grown to match.
 *   • 4-wide — four tiles per row at the original compact size.
 *
 * The column count is the user's choice, not a function of the screen: a pane
 * that is wide enough always shows exactly 2 or 4. The one exception is a pane
 * too narrow to hold that many tiles at a legible width (a dragged-wide nav
 * tree, a phone): then it drops columns, down to one, rather than crushing the
 * tiles or scrolling sideways. The gap lives here too, because the grid draws
 * it AND the column maths counts it — one number, one place.
 *
 * The choice is a viewer convenience, remembered per browser. Every storage
 * access swallows its own failure: localStorage throws in a private window or
 * with site data blocked, and a missing preference must fall back to the
 * default rather than break the Project screen.
 *
 * Pure — no React, no DOM beyond the optional storage handle.
 */

export type TileLayout = "2-wide" | "4-wide";

export const TILE_LAYOUTS: readonly TileLayout[] = ["2-wide", "4-wide"];

/** Paul's default: the big tiles. */
export const DEFAULT_TILE_LAYOUT: TileLayout = "2-wide";

/** Per-browser, like the other viewer conveniences (see app/lib/voice/voicePrefs.ts). */
export const TILE_LAYOUT_KEY = "dgx.project.tile-layout";

export interface TileLayoutSpec {
  /** Tiles per row when the pane is wide enough. */
  columns: number;
  /** Below this width a tile stops being legible, so the grid drops a column. */
  minTileWidth: number;
  /** Space between tiles, px — drawn by the grid and counted by the maths. */
  gap: number;
  /** Large tiles: double width, double height, large thumbnail. */
  large: boolean;
  /** Button text. */
  label: string;
  /** Button tooltip. */
  title: string;
}

export const TILE_LAYOUT_SPEC: Record<TileLayout, TileLayoutSpec> = {
  "2-wide": {
    columns: 2,
    minTileWidth: 320,
    gap: 12,
    large: true,
    label: "2-wide",
    title: "Large tiles, two per row",
  },
  "4-wide": {
    columns: 4,
    minTileWidth: 200,
    gap: 8,
    large: false,
    label: "4-wide",
    title: "Compact tiles, four per row",
  },
};

export function isTileLayout(v: unknown): v is TileLayout {
  return v === "2-wide" || v === "4-wide";
}

/**
 * How many columns the grid shows for `layout` in a tile area `width` px wide
 * (the content box — padding and scrollbar already excluded).
 *
 * `null` means "not measured yet" (the server render and the first client
 * render): answer with the layout's own column count so the first paint is
 * already the chosen layout, not a one-column flash.
 */
export function tileColumnsFor(layout: TileLayout, width: number | null | undefined): number {
  const { columns, minTileWidth, gap } = TILE_LAYOUT_SPEC[layout];
  if (width === null || width === undefined || !Number.isFinite(width)) return columns;
  // n tiles fit when n·min + (n−1)·gap ≤ width, i.e. n ≤ (width + gap) / (min + gap).
  const fit = Math.floor((width + gap) / (minTileWidth + gap));
  return Math.max(1, Math.min(columns, fit));
}

/** The bits of `Storage` this module uses — lets tests pass a fake. */
export type TileLayoutStore = Pick<Storage, "getItem" | "setItem">;

function browserStore(): TileLayoutStore | null {
  try {
    // Merely touching `localStorage` throws a SecurityError when site data is blocked.
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The layout this browser last chose, or the default. Never throws. */
export function readTileLayout(store: TileLayoutStore | null = browserStore()): TileLayout {
  try {
    const v = store?.getItem(TILE_LAYOUT_KEY);
    return isTileLayout(v) ? v : DEFAULT_TILE_LAYOUT;
  } catch {
    return DEFAULT_TILE_LAYOUT;
  }
}

/** Remember the choice. A preference that cannot be saved is not worth breaking a click over. */
export function writeTileLayout(layout: TileLayout, store: TileLayoutStore | null = browserStore()): void {
  if (!isTileLayout(layout)) return;
  try {
    store?.setItem(TILE_LAYOUT_KEY, layout);
  } catch {
    /* private window / quota / blocked storage — the in-memory choice still applies */
  }
}
