/**
 * "Compress" an expanded subprocess: fit it to what is inside it. Paul, 2026-10-02: "compress should also compress the
 * height of EPs" — and "the top must also come down when there is too much free space at the top of the EP".
 *
 * Both edges move in: the TOP comes down to just above the highest thing inside (leaving the band the EP's label
 * lives in) and the BOTTOM comes up to just below the lowest. The contents do not move — only the shell. The padding
 * is the one a wrap leaves (subprocessWrap.ts): the label's band above, 24 px below. A subprocess whose content already
 * sits closer than that to an edge is not pushed OUT: an edge only ever moves inward. Width is not touched.
 *
 * Pure.
 */
import type { DiagramElement } from "./types";
import { EP_WRAP } from "./subprocessWrap";

/** The least height an EP is ever fitted to: its label band, a Start-sized row and the bottom padding. */
export const EP_MIN_FIT_HEIGHT = EP_WRAP.PAD_TOP + EP_WRAP.EVENT + EP_WRAP.PAD_BOTTOM;

const nameOf = (e: DiagramElement) => (e.label ?? "").replace(/\s+/g, " ").trim() || "the subprocess";

export type EpCompressPlan = { error: string } | { y: number; height: number; saved: number };

export function planCompressEp(els: readonly DiagramElement[], ep: DiagramElement): EpCompressPlan {
  // Boundary events sit ON the rim, not in the content (Paul's capture, 2026-10-03: an EP with ~145 px spare at the top
  // was "already fitted" because its Cancellation event on the top edge counted as the highest thing inside). They are
  // not measured; the resize carries them with the edge they are mounted on (RESIZE_ELEMENT re-snaps them).
  const kids = els.filter((e) => e.parentId === ep.id && e.boundaryHostId !== ep.id);
  if (!kids.length) return { error: `${nameOf(ep)} is empty — there is nothing to compress it to` };
  const contentTop = Math.min(...kids.map((k) => k.y));
  const contentBottom = Math.max(...kids.map((k) => k.y + k.height));
  // Edges only move INWARD: the top never goes up, the bottom never goes down.
  const y = Math.max(ep.y, Math.floor(contentTop - EP_WRAP.PAD_TOP));
  const bottom = Math.min(ep.y + ep.height, Math.ceil(contentBottom + EP_WRAP.PAD_BOTTOM));
  const height = Math.max(EP_MIN_FIT_HEIGHT, bottom - y);
  if (Math.abs(y - ep.y) < 1 && height >= ep.height - 1) return { error: `${nameOf(ep)} is already fitted to its content` };
  return { y, height, saved: Math.round(ep.height - height) };
}
