/**
 * T4571-T4573 — R2's second half, the disambiguation picker.
 *
 * `resolveRef` has always RETURNED the candidates when a reference matches more
 * than one element; the editor threw the list away. The first half of R2 made
 * the message name them. This is the rest: park the command, number the
 * candidates on the canvas, and let a spoken number finish it.
 *
 * The mechanism is the numbered-badge flow the product already had for "rename
 * tasks" and "add message". R2 was never about new UI — it was that a thing
 * already built was not reached from the one place that most needed it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPickFlow, parsePickAnswer, substituteRef } from "@/app/lib/assist/disambiguate";
import { numberTargets } from "@/app/lib/assist/renameTargets";
import { badgesOnScreen } from "@/app/lib/assist/debugCapture";
import { ID_REF_PREFIX, resolveRef } from "@/app/lib/assist/resolveRef";
import type { AssistOp } from "@/app/lib/assist/ops";
import type { DiagramElement } from "@/app/lib/diagram/types";
import { editorWithApplyLayer } from "./assistApplySource";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const editor = () => editorWithApplyLayer();

const el = (id: string, label: string, x: number, y: number): DiagramElement =>
  ({ id, type: "task", label, x, y, width: 100, height: 60, properties: {} }) as unknown as DiagramElement;

// Two tasks called Review, one above the other, plus an unrelated one.
const els = [el("t1", "Review", 100, 300), el("t2", "Review", 100, 100), el("t3", "Approve", 400, 100)];
const del = (ref: string): AssistOp[] => [{ op: "delete", ref } as AssistOp];

describe("T4571 — parking an ambiguous command", () => {
  it("numbers the candidates and says how to answer", () => {
    const flow = buildPickFlow(del("Review"), "Review", ["t1", "t2"], els);
    expect(flow).not.toBeNull();
    expect(flow!.targets.map((t) => t.id)).toEqual(["t2", "t1"]); // reading order: higher first
    expect(flow!.targets.map((t) => t.n)).toEqual([1, 2]);
    expect(flow!.prompt).toContain("which “Review”?");
    expect(flow!.prompt, "and how to get out of it").toContain("cancel");
  });

  it("numbers by the SHARED rule, so a badge means the same in every flow", () => {
    // Three flows now put numbers on the canvas. If they disagreed, the same
    // element would carry a different number depending on the question asked.
    const flow = buildPickFlow(del("Review"), "Review", ["t1", "t2"], els);
    expect(flow!.targets).toEqual(numberTargets([els[0], els[1]]));
  });

  it("declines to ask about fewer than two things", () => {
    // A picker with one badge on it is a worse error message, not a better one.
    expect(buildPickFlow(del("Review"), "Review", ["t1"], els)).toBeNull();
    expect(buildPickFlow(del("Review"), "Review", [], els)).toBeNull();
    expect(buildPickFlow(del("Review"), "Review", ["gone", "also-gone"], els)).toBeNull();
  });

  it("keeps the whole command, not just the reference", () => {
    const ops = [{ op: "delete", ref: "Review", compact: true } as unknown as AssistOp];
    const flow = buildPickFlow(ops, "Review", ["t1", "t2"], els);
    expect(flow!.ops).toEqual(ops);
  });
});

describe("T4572 — answering it", () => {
  const flow = buildPickFlow(del("Review"), "Review", ["t1", "t2"], els)!;

  it("takes a bare number", () => {
    expect(parsePickAnswer("2", flow)?.id).toBe("t1");
    expect(parsePickAnswer("1", flow)?.id).toBe("t2");
  });

  it("takes the forgiving forms the rename pick takes", () => {
    // Same helper, so "number two" and a misheard number word work here too.
    expect(parsePickAnswer("number 2", flow)?.id).toBe("t1");
    expect(parsePickAnswer("two", flow)?.id).toBe("t1");
  });

  it("rejects a number that is not on the canvas", () => {
    expect(parsePickAnswer("7", flow)).toBeNull();
  });

  it("rejects anything that is not an answer", () => {
    // So an unrelated sentence re-prompts rather than being read as a choice.
    for (const s of ["delete it", "the top one", "yes"]) expect(parsePickAnswer(s, flow)).toBeNull();
  });

  it("substitutes an #id: reference, which resolves exactly", () => {
    // A NAME would be ambiguous again — that is the whole reason we asked.
    const resumed = substituteRef(flow.ops, "Review", "t1");
    expect((resumed[0] as unknown as { ref: string }).ref).toBe(`${ID_REF_PREFIX}t1`);
    expect(resolveRef(`${ID_REF_PREFIX}t1`, els, null, [])).toEqual({ id: "t1" });
  });

  it("substitutes into every field that held the reference", () => {
    // Ops name their references differently — ref, hostRef, poolRef, laneA…
    // so this matches by VALUE rather than knowing all 23 shapes.
    const ops = [{ op: "connect", fromRef: "Review", toRef: "Approve" } as unknown as AssistOp];
    const out = substituteRef(ops, "Review", "t2") as unknown as Record<string, string>[];
    expect(out[0].fromRef).toBe(`${ID_REF_PREFIX}t2`);
    expect(out[0].toRef, "and leaves the others alone").toBe("Approve");
  });

  it("does not mutate the parked command", () => {
    const ops = del("Review");
    substituteRef(ops, "Review", "t1");
    expect((ops[0] as unknown as { ref: string }).ref).toBe("Review");
  });
});

describe("T4573 — wired into the editor", () => {
  const body = editor();

  it("a destructive command with candidates parks instead of failing", () => {
    expect(body).toContain("buildPickFlow(ops, op.ref, e.ambiguous, els)");
    expect(body).toContain("pickParked = true");
    expect(body, "and a parked command is not a failure").toContain("ok: !anyFail || pickParked");
  });

  it("resolve1 hands the candidate ids back with the message", () => {
    expect(body).toContain("ambiguous?: string[]");
    expect(body).toContain("ambiguous: r.ambiguous");
  });

  it("the next utterance answers the question", () => {
    expect(body).toContain("const chosen = parsePickAnswer(heard, flow);");
    expect(body).toContain("applyGrouped(substituteRef(flow.ops, flow.ref, chosen.id))");
  });

  it("re-runs through the ORDINARY path", () => {
    // Not a second apply path that could drift from the first.
    const dispatch = body.slice(body.indexOf("if (pickFlowRef.current) {"));
    expect(dispatch.slice(0, 900)).toContain("applyGrouped(");
  });

  it("can be got out of, three ways", () => {
    expect(body, "a flow-end word").toContain("if (isFlowEndWord(heard)) {");
    expect(body, "Escape").toContain("if (pickFlow) { setPickFlow(null);");
    expect(body, "and it never outlives the diagram it was asked on")
      .toContain("pickFlowRef.current = null;       // nor a parked");
  });

  it("re-prompts rather than guessing when the answer is not a number", () => {
    const dispatch = body.slice(body.indexOf("if (pickFlowRef.current) {"));
    expect(dispatch.slice(0, 900)).toContain("if (!chosen) { log({ heard, summary: flow.prompt, ok: false }); return; }");
  });

  it("draws the badges with the same renderer as the other flows", () => {
    // One value feeds the canvas's badges and the voice-debug recording since
    // 2026-09-26 (badgesOnScreen, T4893); the picker's targets are in it.
    expect(body).toContain("const onScreenBadges = badgesOnScreen(renameFlow, messageFlow, pickFlow);");
    const targets = [{ id: "t1", n: 1, kind: "element" as const, x: 0, y: 0, height: 0 }];
    expect(badgesOnScreen(null, null, { targets })).toBe(targets);
  });
});
