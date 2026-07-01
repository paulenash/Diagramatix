/**
 * Pre-run readiness check (checkSimReadiness) — surfaces un-set parameters
 * before a run so the user gets a "complete the setup" dialog, not silent
 * defaults. T0538-T0541.
 */
import { describe, it, expect } from "vitest";
import { checkSimReadiness } from "@/app/lib/simulation/readiness";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const mk = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement => ({
  id, type: type as DiagramElement["type"], x: 0, y: 0, width: 80, height: 50, label: id, properties: {}, ...extra,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const D = (elements: DiagramElement[], connectors: any[] = []): DiagramData => ({ elements, connectors } as DiagramData);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const seq = (id: string, s: string, t: string, extra: any = {}) => ({ id, type: "sequence", sourceId: s, targetId: t, ...extra });

describe("checkSimReadiness", () => {
  it("T0538 — flags a task with no team (warn) and one using an undefined team (error)", () => {
    const issues = checkSimReadiness([D([
      mk("t1", "task"),
      mk("t2", "task", { properties: { sim: { teamId: "Ghosts" } } }),
    ])], [{ name: "Real", capacity: 2 }]);
    expect(issues.some((i) => i.severity === "warn" && /no team/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.severity === "error" && /Ghosts/.test(i.message))).toBe(true);
  });

  it("T0539 — flags a decision gateway whose branches have no probabilities/conditions", () => {
    const issues = checkSimReadiness([D(
      [mk("g", "gateway", { properties: { gatewayRole: "decision" } }), mk("a", "task", { properties: { sim: { teamId: "Real" } } }), mk("b", "task", { properties: { sim: { teamId: "Real" } } })],
      [seq("c1", "g", "a"), seq("c2", "g", "b")],
    )], [{ name: "Real", capacity: 2 }]);
    expect(issues.some((i) => /split evenly/.test(i.message))).toBe(true);
  });

  it("T0540 — flags a property read but never initialised (and not one that is)", () => {
    const declared = checkSimReadiness([D([
      mk("t", "task", { properties: { sim: { teamId: "Real", assign: [{ expr: "getProperty('x') + 1", property: "x" }] } } }),
    ])], [{ name: "Real", capacity: 1 }]);
    expect(declared.some((i) => /"x".*never initialised/.test(i.message))).toBe(false);

    const undeclared = checkSimReadiness([D([
      mk("t", "task", { properties: { sim: { teamId: "Real", assign: [{ expr: "getProperty('undeclared') + 1", property: "y" }] } } }),
    ])], [{ name: "Real", capacity: 1 }]);
    expect(undeclared.some((i) => i.severity === "error" && /undeclared.*never initialised/.test(i.message))).toBe(true);
  });

  it("T0541 — clean when teams, arrival and routing are all set", () => {
    const issues = checkSimReadiness([D([
      mk("s", "start-event", { properties: { sim: { arrival: { kind: "fixed", value: 5 } } } }),
      mk("t", "task", { properties: { sim: { teamId: "Real" } } }),
    ])], [{ name: "Real", capacity: 2 }]);
    expect(issues).toEqual([]);
  });
});
