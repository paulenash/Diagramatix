/**
 * Punching holes in a connector's click area.
 *
 * An association is drawn ABOVE every shape, so without help its invisible
 * 12px-wide hit path would take the click anywhere it crosses one. The canvas
 * cuts the shapes out of that path with an `evenodd` clipPath: one enormous
 * rectangle, minus a rectangle per shape.
 *
 * EVEN-ODD COUNTS, IT DOES NOT UNION. A region inside two of the subtracted
 * rectangles is inside an EVEN number of them, so it is filled again — a hole
 * punched twice is not a hole. The canvas was passing the source and target
 * bounds explicitly AND including every element in the shape mask, so those
 * two rectangles appeared twice each and the line stayed clickable inside
 * exactly the two shapes it belongs to.
 *
 * Paul, 21 September 2026: "clicking on an element with a Data Object
 * connected to it, that has converted to a centre to centre connector because
 * one of the source or target has been moved, should not ever select the
 * association connector over selecting the element."
 *
 * Centre-to-centre is why he saw it. A routed association only clips the edge
 * of its endpoints, so the doubled hole sits where nobody clicks; a
 * centre-to-centre line runs through the middle of both shapes, right under
 * the pointer.
 *
 * Pure.
 */

export interface Rect { x: number; y: number; width: number; height: number }

/** Two rectangles are the same hole if they sit in the same place. Rounded to
 *  a tenth of a pixel: these come from element geometry that may have been
 *  through a scale, and a hole is not "different" because of float drift. */
const key = (r: Rect) =>
  `${Math.round(r.x * 10)}:${Math.round(r.y * 10)}:${Math.round(r.width * 10)}:${Math.round(r.height * 10)}`;

/**
 * The holes to cut, each one once.
 *
 * Order is preserved so the first mention of a rectangle wins — callers list
 * the endpoints first, and keeping that order makes the result easy to read
 * when debugging a clip path by eye.
 *
 * Zero-area rectangles are dropped: they cut nothing, and an element that has
 * not been measured yet would otherwise contribute a degenerate subpath.
 */
export function dedupeHoles(rects: readonly Rect[]): Rect[] {
  const seen = new Set<string>();
  const out: Rect[] = [];
  for (const r of rects) {
    if (!(r.width > 0) || !(r.height > 0)) continue;
    const k = key(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/**
 * Is this point inside an odd number of the holes — i.e. would `evenodd`
 * treat it as cut away?
 *
 * Exists so a test can ask the question the browser asks, rather than assert
 * on the shape of a path string.
 */
export function isClippedOut(point: { x: number; y: number }, holes: readonly Rect[]): boolean {
  let inside = 0;
  for (const r of holes) {
    if (point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height) inside++;
  }
  return inside % 2 === 1;
}
