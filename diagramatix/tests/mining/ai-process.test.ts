/**
 * The AI process (BPMN) path serialises the mined activity paths into a prompt
 * for the shared AI BPMN pipeline. Only that serialisation is pure/unit-testable
 * (the model call needs a live key). This pins that the brief carries the
 * activities and the frequency-ranked paths the model curates into BPMN.
 */
import { describe, it, expect } from "vitest";
import { describeMinedProcess } from "@/app/lib/mining/aiProcess";
import type { Variant } from "@/app/lib/mining/types";

const VARIANTS: Variant[] = [
  { states: ["Draft", "Pending", "Approved"], events: ["Create", "Submit", "Approve"], count: 5 },
  { states: ["Draft", "Pending", "Rejected"], events: ["Create", "Submit", "Reject"], count: 2 },
];

describe("AI process (BPMN) prompt serialisation", () => {
  it("T0611 — the brief carries activities + frequency-ranked paths", () => {
    const t = describeMinedProcess(VARIANTS);
    expect(t).toContain("7 cases");
    expect(t).toContain("Activities observed: Approve, Create, Reject, Submit");
    expect(t).toContain("×5: Create → Submit → Approve");   // most frequent first
    expect(t).toContain("×2: Create → Submit → Reject");
    expect(t.indexOf("×5")).toBeLessThan(t.indexOf("×2"));   // ordered by frequency
    expect(t).toMatch(/BPMN process model/i);               // the curation instruction
  });

  it("T0612 — uses the stats activity list when provided", () => {
    const t = describeMinedProcess(VARIANTS, { activities: ["Create", "Submit", "Approve", "Reject"] });
    expect(t).toContain("Activities observed: Create, Submit, Approve, Reject");
  });
});
