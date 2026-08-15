/**
 * DATA-32 — a diagram DATA save must participate in optimistic concurrency
 * (send its version) OR explicitly declare an authoritative overwrite; a
 * version-less data save is no longer silently accepted (the old last-write-wins
 * gap that could clobber a concurrent editor).
 */
import { describe, it, expect } from "vitest";
import { classifyDiagramWrite } from "@/app/lib/diagram/saveConcurrency";

describe("classifyDiagramWrite", () => {
  it("data save WITH a version → compare-and-swap", () => {
    expect(classifyDiagramWrite({ hasData: true, clientVersion: 3, unconditional: false })).toBe("cas");
  });

  it("data save with NO version and NO opt-in → reject (the closed gap)", () => {
    expect(classifyDiagramWrite({ hasData: true, clientVersion: null, unconditional: false })).toBe("reject");
  });

  it("data save with NO version but unconditional:true → authoritative overwrite", () => {
    // The tool writers (Simulator write-back, PCF create, initial write) take
    // this path deliberately.
    expect(classifyDiagramWrite({ hasData: true, clientVersion: null, unconditional: true })).toBe("unconditional");
  });

  it("metadata-only save (no data) never needs a version", () => {
    expect(classifyDiagramWrite({ hasData: false, clientVersion: null, unconditional: false })).toBe("unconditional");
  });

  it("version wins over the opt-in flag (still a CAS when both present)", () => {
    // A caller that sends a real version gets the safe path even if it also set
    // the flag — never silently downgrade to an unconditional overwrite.
    expect(classifyDiagramWrite({ hasData: true, clientVersion: 5, unconditional: true })).toBe("cas");
  });
});
