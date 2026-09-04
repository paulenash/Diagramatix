import { describe, it, expect } from "vitest";
import { selectRegenerationTargets } from "@/app/lib/valueChain/regenerationTargets";

/**
 * Which prompts a Regenerate actually rewrites.
 *
 * Paul, 2026-09-04: the Process Repository could regenerate a whole type or one
 * process, and nothing in between — so when six of V22's ten prompts came back
 * truncated, fixing them meant six separate clicks, each an AI call you had to
 * wait out before starting the next. Ticking a subset is the fix.
 *
 * Every branch below either spends AI calls or fails to, and both are costly in
 * their own way: regenerating a prompt nobody asked for overwrites something
 * that may have been fine, while regenerating NOTHING and reporting success
 * reads as "done" and leaves the defect exactly where it was. That second one is
 * the reason `unknown` exists.
 */
const PROCESSES = [
  { code: "V22.01", title: "Receive Notification" },
  { code: "V22.02", title: "Register Claim" },
  { code: "V22.03", title: "Validate Cover" },
];
const base = { processes: PROCESSES, chainCode: "V22", chainTitle: "Claim to Settlement" };

describe("selectRegenerationTargets", () => {
  it("T3218 with no narrowing, does every process and the chain-level prompts", () => {
    const { targets } = selectRegenerationTargets({ ...base, types: ["bpmn", "value-chain"] });
    expect(targets.map((t) => t.code)).toEqual(["V22.01", "V22.02", "V22.03", "V22"]);
    expect(targets.filter((t) => t.type === "bpmn")).toHaveLength(3);
  });

  it("T3219 narrows to the ticked processes, in chain order", () => {
    // Ticked out of order on the screen; emitted in the chain's own order, so a
    // run reads top-down however the boxes were clicked.
    const { targets } = selectRegenerationTargets({
      ...base, types: ["bpmn"], only: ["V22.03", "V22.01"],
    });
    expect(targets.map((t) => t.code)).toEqual(["V22.01", "V22.03"]);
  });

  it("T3220 ticking processes suppresses the chain-level prompts", () => {
    // Naming specific processes is a NARROWER instruction than "this type".
    // Rewriting the Value Chain and Context prompts too would spend calls nobody
    // asked for, on prompts the request never mentioned.
    const { targets } = selectRegenerationTargets({
      ...base, types: ["bpmn", "value-chain", "context"], only: ["V22.02"],
    });
    expect(targets).toEqual([{ type: "bpmn", code: "V22.02", title: "Register Claim" }]);
  });

  it("T3221 an empty selection means no narrowing, not nothing", () => {
    // The distinction the route depends on: `only: []` is the absence of a
    // filter. Reading it as "select nothing" would silently regenerate nothing.
    const { targets } = selectRegenerationTargets({ ...base, types: ["bpmn"], only: [] });
    expect(targets).toHaveLength(3);
  });

  it("T3222 reports a process the chain does not have", () => {
    // Without this the request regenerates nothing and reports success — the
    // failure mode that looks exactly like having worked.
    const { targets, unknown } = selectRegenerationTargets({
      ...base, types: ["bpmn"], only: ["V22.01", "V22.99"],
    });
    expect(unknown).toEqual(["V22.99"]);
    expect(targets.map((t) => t.code)).toEqual(["V22.01"]);
  });

  it("T3223 a chain-level type on its own still works", () => {
    const { targets } = selectRegenerationTargets({ ...base, types: ["archimate"] });
    expect(targets).toEqual([{ type: "archimate", code: "V22", title: "Claim to Settlement" }]);
  });
});
