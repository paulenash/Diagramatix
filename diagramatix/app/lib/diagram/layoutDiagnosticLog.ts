/**
 * The floor for layout diagnostics: log them.
 *
 * `layoutBpmnDiagram` reports what it could not take at face value — a reference
 * naming nothing, a subprocess left empty, an element nothing placed. A caller
 * that passes no `onDiagnostic` discards all of it, and the result is a diagram
 * that LOOKS successful whatever went wrong. That is precisely what let the V06
 * defects survive three regenerations before Paul pasted the diagnostics out of
 * the one surface that reported them (2026-08-29).
 *
 * The .md batch runner and the two editor routes surface these in their own UI.
 * Every OTHER route that generates a diagram — model compare, process mining
 * discover/calibrate, PCF decompose — has no natural place to show them, so it
 * logs instead. Logging is not as good as showing, but it is enormously better
 * than dropping, and it costs one argument.
 *
 * Guarded by `tests/ai/generate-diagnostics-wired.test.ts`, which fails if a new
 * route lays out a diagram without passing `onDiagnostic` at all.
 */
import type { LayoutDiagnostic } from "./bpmnLayout";

/**
 * An `onDiagnostic` handler that writes one line per finding, tagged with where
 * it came from. Returns a fresh closure so concurrent requests never interleave
 * into a shared buffer.
 */
export function logLayoutDiagnostic(source: string): (d: LayoutDiagnostic) => void {
  return (d) => {
    const field = d.field ? `.${d.field}` : "";
    console.warn(
      `[layout:${source}] ${d.kind}${field} ${JSON.stringify(d.label)} — ${d.detail}`,
    );
  };
}

/** Collect into an array AND log — for a caller that also returns them. */
export function collectLayoutDiagnostics(
  source: string,
  into: LayoutDiagnostic[],
): (d: LayoutDiagnostic) => void {
  const log = logLayoutDiagnostic(source);
  return (d) => { into.push(d); log(d); };
}
