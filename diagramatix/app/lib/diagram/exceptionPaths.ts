/**
 * Exception paths — what hangs off an edge-mounted intermediate event (EMIE).
 *
 * Paul, 2026-10-08, on the Application Process capture: an EMIE ("Time limit for applicant response exceeded") whose flow goes straight to an
 * End Event is a SILENT FAILURE — the exception happens and nobody is asked to do anything. In a well-constructed process:
 *   (a) there is always a Task between the EMIE and the End Event, so a person can act when the exception occurs; and
 *   (b) the End Event that finishes such a path is a Terminate End Event.
 *
 * This module is the one place that knows what "the exception path of an EMIE" is, so the scanner (B56 / B57) and generation (R8.47 / R8.48)
 * cannot disagree. Pure: it works on bare nodes and edges, so it serves both the editor's DiagramElement / Connector and the AI plan's
 * AiElement / AiConnection.
 */

export interface PathEdge { from: string; to: string }

/**
 * The elements reachable ONLY through `startId` along sequence flow — the exception path. A step that something outside the path also
 * feeds is where the exception REJOINS the main line, so the walk stops before it (the same reading the layout uses). Returns the ids
 * on the path, `startId` excluded, in no particular order.
 */
export function exceptionPath(startId: string, edges: PathEdge[]): Set<string> {
  const visited = new Set<string>([startId]);
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    (incoming.get(e.to) ?? incoming.set(e.to, []).get(e.to)!).push(e.from);
    (outgoing.get(e.from) ?? outgoing.set(e.from, []).get(e.from)!).push(e.to);
  }
  // Fixpoint: a node joins the path once EVERY flow into it comes from the path. (A merge of two exception branches qualifies as soon as
  // both have been reached; a node the main line also feeds never does.)
  for (let changed = true; changed;) {
    changed = false;
    for (const v of [...visited]) {
      for (const n of outgoing.get(v) ?? []) {
        if (visited.has(n)) continue;
        if ((incoming.get(n) ?? []).every((f) => visited.has(f))) { visited.add(n); changed = true; }
      }
    }
  }
  visited.delete(startId);
  return visited;
}
