/**
 * Decide how a diagram save's DATA write is applied, given the optimistic-
 * concurrency inputs. Pure + exported so the policy is unit-tested directly
 * rather than only through the route.
 *
 * The `version` compare-and-swap (Diagram.version) is the real guarantee against
 * two clients silently clobbering each other: a save carries the version it last
 * saw, the server writes only if it still matches, else 409. The gap this closes
 * (audit follow-up): the route USED to accept a data write with NO version as an
 * unconditional last-write-wins — so a legacy or rogue client could quietly
 * overwrite a concurrent editor. Now a version-less data write is REJECTED unless
 * it explicitly opts into an authoritative overwrite (`unconditional: true`),
 * which the non-editor tools that legitimately set a diagram's data (Simulator
 * write-back, PCF create, the initial write after create) pass on purpose.
 *
 *   "cas"           — compare-and-swap on the supplied version (may 409)
 *   "unconditional" — write unconditionally (metadata-only save, or a tool that
 *                     declared unconditional:true); a data write still bumps the
 *                     version so version-aware clients converge
 *   "reject"        — a data write with neither a version nor the opt-in flag
 */
export type DiagramWriteMode = "cas" | "unconditional" | "reject";

export function classifyDiagramWrite(input: {
  /** Does the payload change the diagram's `data`? */
  hasData: boolean;
  /** The client's optimistic-concurrency token, if it sent one. */
  clientVersion: number | null;
  /** The caller explicitly asked for an authoritative overwrite. */
  unconditional: boolean;
}): DiagramWriteMode {
  const { hasData, clientVersion, unconditional } = input;
  // A metadata-only save (name / colour / display mode, no data) never clobbers
  // diagram content, so it doesn't need a version.
  if (!hasData) return "unconditional";
  if (clientVersion !== null) return "cas";
  if (unconditional) return "unconditional";
  return "reject";
}
