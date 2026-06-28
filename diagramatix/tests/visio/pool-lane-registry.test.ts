/**
 * Visio export — Pool/Lane invariant registry (layer 4).
 *
 * Pins the Pool/Lane shape rules a future change must not break — the regression
 * net for the Phase-3 rollback (a change "replicated pools onto tasks"). Runs the
 * shared matrix plus extra pool-focused structures (3-lane white-box, lone
 * black-box) and asserts findPoolLaneViolations + findGeometryViolations are clean.
 */
import { describe, it, expect } from "vitest";
import { exportToVsdx, findPoolLaneViolations, findGeometryViolations } from "./_helpers/vsdx";
import { SCENARIOS, build, type Scenario } from "./_helpers/scenarios";

// Extra pool-focused structures for deeper coverage than the shared matrix.
const POOL_SCENARIOS: Scenario[] = [
  {
    name: "white-box pool with three lanes",
    elements: [
      { id: "p", type: "pool", label: "Claims", poolType: "white-box", lanes: [
        { id: "l1", name: "Intake" }, { id: "l2", name: "Assess" }, { id: "l3", name: "Pay" },
      ] },
      { id: "s", type: "start-event", label: "In", pool: "p", lane: "l1" },
      { id: "t1", type: "task", label: "Log claim", pool: "p", lane: "l1" },
      { id: "t2", type: "task", label: "Assess", pool: "p", lane: "l2" },
      { id: "t3", type: "task", label: "Pay out", pool: "p", lane: "l3" },
      { id: "e", type: "end-event", label: "Out", pool: "p", lane: "l3" },
    ],
    connections: [
      { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" },
      { sourceId: "t2", targetId: "t3" }, { sourceId: "t3", targetId: "e" },
    ],
  },
  {
    name: "white-box + black-box pools (cross-pool message)",
    elements: [
      { id: "us", type: "pool", label: "Us", poolType: "white-box" },
      { id: "ext", type: "pool", label: "Partner", poolType: "black-box" },
      { id: "s", type: "start-event", label: "S", pool: "us" },
      { id: "t", type: "task", label: "Send", pool: "us" },
      { id: "e", type: "end-event", label: "E", pool: "us" },
    ],
    connections: [
      { sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" },
      { sourceId: "t", targetId: "ext", type: "message", label: "Req" },
    ],
  },
];

const ALL: Scenario[] = [...SCENARIOS, ...POOL_SCENARIOS];

describe("Visio export — Pool/Lane invariant registry", () => {
  for (const sc of ALL) {
    it(`${sc.name} — pool/lane + geometry invariants hold`, async () => {
      const data = build(sc);
      const parsed = await exportToVsdx(data);
      const v = [
        ...findPoolLaneViolations(parsed, sc.elements),
        ...findGeometryViolations(parsed),
      ];
      expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
    });
  }
});
