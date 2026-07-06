/**
 * Org-wide RCM renumber core (scripts/renumber-org-rcm-codes.ts): the pure
 * canonical-grouping + code-assignment maths, no DB. Clones of a master control
 * must collapse to one shared code; each kind is one running org-wide sequence.
 */
import { describe, it, expect } from "vitest";
import { assignOrgWideCodes, type RenumberLib } from "@/app/lib/riskControls/renumber";

describe("org-wide RCM renumber", () => {
  it("T0653 — clones share one code; each kind is one org-wide sequence", () => {
    const master: RenumberLib = {
      id: "orgMaster", isMaster: true, sourceLibraryId: null,
      items: [
        { id: "m-r1", kind: "Risk", code: "R-01", name: "Duplicate payment" },
        { id: "m-r2", kind: "Risk", code: "R-02", name: "Unauthorised change" },
        { id: "m-c1", kind: "Control", code: "C-01", name: "Three-way match" },
      ],
    };
    // Project A adopted the master → clones keep the master's old codes.
    const projA: RenumberLib = {
      id: "libA", isMaster: false, sourceLibraryId: "orgMaster",
      items: [
        { id: "a-r1", kind: "Risk", code: "R-01", name: "Duplicate payment" },
        { id: "a-c1", kind: "Control", code: "C-01", name: "Three-way match" },
      ],
    };
    // Project B built its OWN library (not a clone) — its R-01 is a DIFFERENT
    // risk that happens to reuse the code, so it must NOT merge with the master.
    const projB: RenumberLib = {
      id: "libB", isMaster: false, sourceLibraryId: null,
      items: [{ id: "b-r1", kind: "Risk", code: "R-01", name: "Fraudulent vendor" }],
    };

    const { newCodeByItem, counters } = assignOrgWideCodes([master, projA, projB]);

    // Master + its clone share a single code.
    expect(newCodeByItem.get("m-r1")).toBe("R-001");
    expect(newCodeByItem.get("a-r1")).toBe("R-001");
    expect(newCodeByItem.get("m-c1")).toBe("C-001");
    expect(newCodeByItem.get("a-c1")).toBe("C-001");

    // Ordering is by old-code number then name, so the two R-01 groups take
    // R-001/R-002 and the master's R-02 falls to R-003. Project-B's independent
    // R-01 is a DISTINCT group (not merged with the master) — that's the point.
    expect(newCodeByItem.get("b-r1")).toBe("R-002");
    expect(newCodeByItem.get("m-r2")).toBe("R-003");

    // One running sequence per kind: 3 Risks, 1 Control.
    const risk = counters.find((c) => c.kind === "Risk")!;
    const control = counters.find((c) => c.kind === "Control")!;
    expect(risk.count).toBe(3);
    expect(control.count).toBe(1);
  });

  it("T0655 — per-kind scope: renumbering only Controls leaves Risks untouched", () => {
    const libs: RenumberLib[] = [{
      id: "m", isMaster: true, sourceLibraryId: null,
      items: [
        { id: "r1", kind: "Risk", code: "R-05", name: "A" },
        { id: "r2", kind: "Risk", code: "R-09", name: "B" },
        { id: "c1", kind: "Control", code: "C-03", name: "C" },
        { id: "c2", kind: "Control", code: "C-07", name: "D" },
      ],
    }];
    const { newCodeByItem, counters } = assignOrgWideCodes(libs, ["Control"]);
    // Controls renumbered…
    expect(newCodeByItem.get("c1")).toBe("C-001");
    expect(newCodeByItem.get("c2")).toBe("C-002");
    // …Risks left completely alone (no entries, no counter).
    expect(newCodeByItem.has("r1")).toBe(false);
    expect(newCodeByItem.has("r2")).toBe(false);
    expect(counters.map((c) => c.kind)).toEqual(["Control"]);
  });

  it("T0654 — idempotent: re-running on already-numbered codes is a no-op", () => {
    const libs: RenumberLib[] = [{
      id: "m", isMaster: true, sourceLibraryId: null,
      items: [
        { id: "x", kind: "Risk", code: "R-001", name: "A" },
        { id: "y", kind: "Risk", code: "R-002", name: "B" },
        { id: "z", kind: "Control", code: "C-001", name: "C" },
      ],
    }];
    const { newCodeByItem } = assignOrgWideCodes(libs);
    expect(newCodeByItem.get("x")).toBe("R-001");
    expect(newCodeByItem.get("y")).toBe("R-002");
    expect(newCodeByItem.get("z")).toBe("C-001");
  });
});
