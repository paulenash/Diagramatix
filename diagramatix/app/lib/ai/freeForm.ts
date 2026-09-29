/**
 * "Free Form" — reproduce an attached image's layout instead of laying the
 * process out afresh (2026-09-29: now on the phone too — Paul, "Add ability to
 * do Free Form diagrams from image if the user desires").
 *
 * ONE rule for every place that lays out a plan the AI drew from an image: the
 * two desktop consoles, the model-comparison route, and the phone's server-side
 * generate job. Pure and dependency-free, so client bundles can import it.
 *
 *   • The model is asked for each shape's drawn position (planBpmn's
 *     captureGeometry) only when Free Form is on AND an image is attached.
 *   • The drawn positions are kept only when the plan carries them for EVERY
 *     step (and for a pool or lane to hold them). The model is told to leave out
 *     a box it cannot see — a step that exists only in the words, say — and the
 *     drawn layout has nowhere to put it: it would be dropped, with its flows
 *     (the 2026-09-29 review). Then the normal layout, which keeps everything.
 *   • The image's own size shapes the page (imageAspect) — only a real one.
 */

const CONTAINERS = new Set(["pool", "lane", "sublane"]);

/**
 * Does the plan carry drawn positions for all of it — every step boxed, and a
 * pool or lane boxed to hold them?
 */
export function planHasBounds(plan: unknown): boolean {
  const els = (plan as { elements?: unknown } | null | undefined)?.elements;
  if (!Array.isArray(els)) return false;
  const all = els.filter((e): e is { type?: unknown; bounds?: unknown } => !!e && typeof e === "object");
  const steps = all.filter((e) => !CONTAINERS.has(String(e.type)));
  return steps.length > 0
    && steps.every((e) => !!e.bounds)
    && all.some((e) => CONTAINERS.has(String(e.type)) && !!e.bounds);
}

/** The layout options for a plan, given whether Free Form was asked for. */
export function freeFormLayout(
  freeForm: boolean,
  plan: unknown,
  imageAspect?: { w: number; h: number } | null,
): { preservePositions: boolean; imageAspect?: { w: number; h: number } } {
  const preservePositions = freeForm && planHasBounds(plan);
  const aspect = preservePositions && imageAspect && imageAspect.w > 0 && imageAspect.h > 0 ? imageAspect : undefined;
  return { preservePositions, ...(aspect ? { imageAspect: aspect } : {}) };
}
