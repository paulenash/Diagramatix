/**
 * canConnect() must agree with the ADD_CONNECTOR non-force validation gauntlet
 * in the reducer — it is the shared legality predicate the AI next-step
 * suggestion engine uses to pre-filter candidates, so any drift would offer
 * illegal suggestions (or hide legal ones). This pins them together (T2225).
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import { canConnect } from "@/app/lib/diagram/canConnect";
import type { DiagramData, DiagramElement, ConnectorType } from "@/app/lib/diagram/types";

const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 100, height: 60, properties: {}, ...extra });
const base = (elements: DiagramElement[]): DiagramData =>
  ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } });
const add = (s: string, t: string, ct: ConnectorType): Action => ({
  type: "ADD_CONNECTOR",
  payload: { sourceId: s, targetId: t, connectorType: ct, directionType: "non-directed", routingType: "rectilinear", sourceSide: "right", targetSide: "left" },
});

const CASES: Array<{ name: string; s: DiagramElement; t: DiagramElement; ct: ConnectorType; expect: boolean }> = [
  { name: "task → task (sequence) allowed", s: el("a", "task"), t: el("b", "task"), ct: "sequence", expect: true },
  { name: "final-state → task rejected (final source)", s: el("a", "final-state"), t: el("b", "task"), ct: "transition", expect: false },
  { name: "task → initial-state rejected", s: el("a", "task"), t: el("b", "initial-state"), ct: "transition", expect: false },
  { name: "data-object → task (sequence) rejected — data is association-only", s: el("a", "data-object"), t: el("b", "task"), ct: "sequence", expect: false },
  { name: "data-object → task (associationBPMN) allowed", s: el("a", "data-object"), t: el("b", "task"), ct: "associationBPMN", expect: true },
  { name: "pain-point endpoint rejected", s: el("a", "uml-pain-point"), t: el("b", "task"), ct: "sequence", expect: false },
  { name: "task → task (associationBPMN) rejected — not data/event/comp", s: el("a", "task"), t: el("b", "task"), ct: "associationBPMN", expect: false },
  { name: "start-event → task (sequence) allowed", s: el("a", "start-event"), t: el("b", "task"), ct: "sequence", expect: true },
  { name: "task → non-boundary start-event (sequence) rejected", s: el("a", "task"), t: el("b", "start-event"), ct: "sequence", expect: false },
  { name: "non-boundary end-event → task (sequence) rejected", s: el("a", "end-event"), t: el("b", "task"), ct: "sequence", expect: false },
  { name: "uml-package → uml-class (uml-association) rejected", s: el("a", "uml-package"), t: el("b", "uml-class"), ct: "uml-association", expect: false },
  { name: "uml-package → uml-package (uml-containment) allowed", s: el("a", "uml-package"), t: el("b", "uml-package"), ct: "uml-containment", expect: true },
  { name: "sequence into a compensation activity rejected", s: el("a", "task"), t: el("b", "task", { properties: { isForCompensation: true } }), ct: "sequence", expect: false },
  { name: "intermediate → intermediate (associationBPMN) allowed (event-to-event)", s: el("a", "intermediate-event"), t: el("b", "intermediate-event"), ct: "associationBPMN", expect: true },
  // EMIE message-trigger rule: a boundary intermediate event receives a message
  // only when its trigger is Message, and never sends one.
  { name: "messageBPMN → boundary Message event allowed", s: el("a", "task"), t: el("b", "intermediate-event", { boundaryHostId: "h", eventType: "message" }), ct: "messageBPMN", expect: true },
  { name: "messageBPMN → boundary Error event rejected", s: el("a", "task"), t: el("b", "intermediate-event", { boundaryHostId: "h", eventType: "error" }), ct: "messageBPMN", expect: false },
  { name: "messageBPMN FROM a boundary event rejected", s: el("a", "intermediate-event", { boundaryHostId: "h", eventType: "message" }), t: el("b", "task"), ct: "messageBPMN", expect: false },
  // An EMIE is triggered by its boundary — it has no INCOMING sequence flow.
  { name: "sequence INTO a boundary intermediate event (EMIE) rejected", s: el("a", "task"), t: el("b", "intermediate-event", { boundaryHostId: "h" }), ct: "sequence", expect: false },
  { name: "sequence OUT of a boundary intermediate event (EMIE) allowed", s: el("a", "intermediate-event", { boundaryHostId: "h" }), t: el("b", "task"), ct: "sequence", expect: true },
  // History states (H / H*) are pseudo-initial — no incoming transitions.
  { name: "transition INTO a shallow history state rejected", s: el("a", "state"), t: el("b", "history-state"), ct: "transition", expect: false },
  { name: "transition INTO a deep history state rejected", s: el("a", "state"), t: el("b", "deep-history-state"), ct: "transition", expect: false },
  { name: "transition OUT of a history state allowed", s: el("a", "history-state"), t: el("b", "state"), ct: "transition", expect: true },
];

describe("canConnect ≡ ADD_CONNECTOR non-force parity (T2225)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const world = base([c.s, c.t]);
      const after = reducer(world, add(c.s.id, c.t.id, c.ct));
      const reducerAccepted = after.connectors.length > 0;
      const predicate = canConnect(c.s, c.t, c.ct, world.elements);
      expect(predicate, "canConnect must match the reducer's accept/reject").toBe(reducerAccepted);
      expect(predicate, "expected legality").toBe(c.expect);
    });
  }
});
