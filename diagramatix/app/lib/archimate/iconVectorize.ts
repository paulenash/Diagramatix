/**
 * AI icon vectorize — system prompt + response parser.
 *
 * Kept out of the route so the parse+validate step is unit-testable without the
 * network. The model is asked to trace a single ArchiMate line-art glyph into the
 * IconPrimitive schema; `parseVectorizeResponse` strips markdown fences, parses,
 * and runs the shared validator (the trust boundary) so malformed shapes are
 * dropped rather than trusted.
 */

import { validateIconPrimitives, type IconPrimitive } from "./iconShapes";

export const VECTORIZE_SYSTEM_PROMPT = `You are a precise vector tracer. You are given an image of ONE ArchiMate line-art icon (a small monochrome glyph). Reproduce it as a list of vector primitives and output ONLY JSON — no prose, no markdown fences.

Coordinate system: a normalised box 0..100 on both axes, (0,0) top-left, (50,50) centre. Keep the whole glyph within roughly 5..95 with a small margin.

Output shape (exact):
{"primitives":[ <primitive>, ... ]}

Each primitive is one of:
- {"type":"line","x1":..,"y1":..,"x2":..,"y2":..}
- {"type":"path","segments":[{"t":"M","x":..,"y":..},{"t":"L","x":..,"y":..}|{"t":"Q","cx":..,"cy":..,"x":..,"y":..}|{"t":"C","c1x":..,"c1y":..,"c2x":..,"c2y":..,"x":..,"y":..}],"closed":false}
- {"type":"rect","x":..,"y":..,"w":..,"h":..}
- {"type":"triangle","x1":..,"y1":..,"x2":..,"y2":..,"x3":..,"y3":..}
- {"type":"circle","cx":..,"cy":..,"r":..}
- {"type":"ellipse","cx":..,"cy":..,"rx":..,"ry":..}

Every primitive also carries: "z" (integer paint order, ascending = on top), "strokeWidth" (normalised, ~6 typical), "filled" (boolean), and optionally "colourRole" ("stroke" default, "fill" for solid shapes; use "fixed" with "colour":"#rrggbb" ONLY for a detail that must stay a specific colour — normally avoid it, the icon is recoloured to the theme).

line and path may carry arrowheads: "startArrow"/"endArrow": {"style":"open"|"filled","size":8}. Add them where the source clearly shows an arrow tip (e.g. Outcome arrow-into-target, Course-of-Action, trigger/flow). Only add "angle" (degrees) when the tip points off the line's tangent.

Guidance:
- Use the FEWEST primitives that faithfully capture the glyph.
- Use "ellipse" (not "circle") when the radii differ; use "path" with Q/C segments for smooth curves rather than many short lines.
- Assume a single theme colour; do not emit colour except for genuine fixed details.

Output ONLY the JSON object {"primitives":[...]}.`;

export const VECTORIZE_INSTRUCTION =
  "Trace this ArchiMate icon into the primitive JSON described. Output ONLY the JSON object.";

/** Strip ``` fences, JSON.parse, and validate. Throws on non-JSON; returns the
 *  validated (possibly empty) primitive list otherwise. */
export function parseVectorizeResponse(text: string): IconPrimitive[] {
  let s = (text ?? "").trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(s);
  const raw = Array.isArray(parsed) ? parsed : parsed?.primitives;
  return validateIconPrimitives(raw);
}
