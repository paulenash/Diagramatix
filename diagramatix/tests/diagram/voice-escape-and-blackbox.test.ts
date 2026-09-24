/**
 * T4740–T4741 — two faults Paul hit in live use on 2026-09-25.
 *
 *   3. "I can't reliably exit the command after it mis-hears. It keeps adding
 *      words like 'stop', 'done', 'cancel' and 'exit'. The only way out is to
 *      stop and restart."
 *   4. "Sometimes a command will by default add a Task with a name like 'cancel
 *      this command!' to a black-box pool. This should NEVER occur."
 *
 * The two are the same incident seen from opposite ends: an escape word gets
 * swallowed into a half-finished command, becomes a name, and the resulting
 * element lands wherever the geometry happens to overlap — which was sometimes
 * inside a participant whose internals are by definition not modelled.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reducer } from "@/app/hooks/useDiagram";
import { isFlowEndWord, isMicStopWord } from "@/app/lib/assist/stopWords";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const editor = () => readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");

describe("T4740 — an escape word is never swallowed by a half-finished command", () => {
  it("the mechanism that trapped it", () => {
    // A mis-hear leaves a half command in the buffer. `isIncompleteCommand`
    // then HOLDS it, waiting up to three times 3.2s for the rest — and every
    // word said during that hold is appended, including the escape.
    expect(isIncompleteCommand("rename Task 8 to"), "held, waiting for a name").toBe(true);
    expect(isIncompleteCommand("rename Task 8 to cancel"), "…and 'cancel' completed it").toBe(false);
    // Which is how "cancel" became a label instead of a way out.
  });

  it("an escape word is recognised as one", () => {
    for (const w of ["cancel", "done", "exit", "quit", "abort", "never mind", "forget it", "escape"]) {
      expect(isFlowEndWord(w), `"${w}" must end the flow`).toBe(true);
    }
    // "stop" is the MIC word and always has been — which is exactly why it was
    // the only one that worked, and why the others now get the same handling.
    expect(isMicStopWord("stop")).toBe(true);
    expect(isFlowEndWord("rename lanes"), "an ordinary command is not an escape").toBe(false);
    expect(isFlowEndWord("cancel the order"), "nor a name that starts with one").toBe(true);
  });

  it("the fragment handler drops the buffer BEFORE it can absorb the word", () => {
    // Source-level: the handler lives in the editor and this suite has no jsdom.
    // The ordering is the whole fix — `isMicStopWord` was already checked here,
    // at the fragment, which is why "stop" worked and nothing else did.
    const src = editor();
    const onText = src.slice(src.indexOf("onText: (t) =>"), src.indexOf("onError: (msg)"));
    const stopAt = onText.indexOf("isMicStopWord(txt)");
    const flowAt = onText.indexOf("isFlowEndWord(txt)");
    const appendAt = onText.indexOf("voiceBuffer.current = (voiceBuffer.current");
    expect(stopAt, "the mic word is checked on the fragment").toBeGreaterThan(-1);
    expect(flowAt, "and so is the escape word, now").toBeGreaterThan(-1);
    expect(flowAt, "BEFORE the fragment joins the buffer").toBeLessThan(appendAt);
    // It clears the half-command and the pending flush, or the buffer simply
    // fires a moment later carrying the same wreckage.
    const block = onText.slice(flowAt, appendAt);
    expect(block).toContain('voiceBuffer.current = ""');
    expect(block).toContain("clearTimeout(voiceFlushTimer.current)");
    expect(block, "and the mic stays on — this is a reset, not a stop").not.toContain("stopAbraListening");
  });

  it("with nothing open it resets locally rather than paying the AI", () => {
    const src = editor();
    const onText = src.slice(src.indexOf("onText: (t) =>"), src.indexOf("onError: (msg)"));
    const block = onText.slice(onText.indexOf("isFlowEndWord(txt)"), onText.indexOf("voiceBuffer.current = (voiceBuffer.current"));
    // Every flow that can be open is consulted, or an escape would close some
    // and silently leave others parked.
    for (const ref of ["renameFlowRef", "messageFlowRef", "templateFlowRef", "pickFlowRef", "pendingConfirmRef"]) {
      expect(block, `${ref} must be checked`).toContain(ref);
    }
    expect(block, "and a bare 'cancel' never reaches the metered AI")
      .toContain("cleared — listening for the next command");
  });
});

describe("T4741 — a black-box pool never adopts an element", () => {
  /** A white-box pool with a lane, and a black-box participant below it. */
  const world = (): DiagramData => ({
    elements: [
      E({ id: "W", type: "pool", label: "Us", x: 0, y: 0, width: 800, height: 200, properties: { poolType: "white-box" } }),
      E({ id: "L", type: "lane", label: "Lane 1", x: 36, y: 0, width: 764, height: 200, parentId: "W", properties: {} }),
      E({ id: "B", type: "pool", label: "Customer", x: 0, y: 300, width: 800, height: 120, properties: { poolType: "black-box" } }),
    ],
    connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
  }) as unknown as DiagramData;

  const add = (d: DiagramData, x: number, y: number) =>
    reducer(d, { type: "ADD_ELEMENT", payload: { symbolType: "task", position: { x, y } } } as never) as DiagramData;

  it("an element dropped inside one is NOT parented to it", () => {
    // A black-box pool is a participant whose internals are deliberately not
    // modelled — that is the entire meaning of the notation. An element inside
    // one is a contradiction, and it arrived here from a mis-heard command
    // landing on whatever the geometry overlapped.
    const after = add(world(), 380, 350);          // squarely inside the black box
    const added = after.elements.find((e) => e.type === "task");
    expect(added, "the task was added").toBeTruthy();
    expect(added!.parentId, "but never owned by the black-box pool").not.toBe("B");
  });

  it("a white-box pool still adopts, so nothing else regressed", () => {
    const d = world();
    // Inside the white-box pool but outside its lane: the pool fallback is what
    // should catch it.
    d.elements = d.elements.map((e) => (e.id === "L" ? { ...e, height: 80 } : e));
    const after = add(d, 380, 150);
    const added = after.elements.find((e) => e.type === "task");
    expect(added!.parentId, "the white-box pool owns it").toBe("W");
  });

  it("an element already inside a lane is untouched by the rule", () => {
    const after = add(world(), 380, 100);
    const added = after.elements.find((e) => e.type === "task");
    expect(added!.parentId, "lanes are unaffected").toBe("L");
  });

  it("the rule is written where it is enforced", () => {
    // Enforced in BOTH places a parent can be chosen: the ADD_ELEMENT
    // container filter, and the membership reconciler that re-homes elements
    // after a move. Missing either leaves a door open.
    const src = readFileSync("app/hooks/useDiagram.ts", "utf8");
    expect(src, "the reason, not just the filter").toMatch(/NEVER A BLACK-BOX POOL/);
    expect(src).toMatch(/A BLACK-BOX POOL ACCEPTS NOTHING/);
    const guards = (src.match(/"white-box"/g) ?? []).length;
    expect(guards, "both paths guarded").toBeGreaterThanOrEqual(2);
  });
});

describe("T4742 — a template past the pool's right edge still joins it, and the pool grows", () => {
  const E2 = (o: Record<string, unknown>) => o as unknown as DiagramElement;
  const world = (): DiagramData => ({
    elements: [
      E2({ id: "P", type: "pool", label: "Us", x: 0, y: 0, width: 600, height: 200, properties: { poolType: "white-box" } }),
      E2({ id: "L", type: "lane", label: "Lane 1", x: 36, y: 0, width: 564, height: 200, parentId: "P", properties: {} }),
      E2({ id: "t0", type: "task", label: "Existing", x: 100, y: 60, width: 100, height: 60, parentId: "L", properties: {} }),
      E2({ id: "B", type: "pool", label: "Customer", x: 0, y: 400, width: 600, height: 100, properties: { poolType: "black-box" } }),
    ],
    connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
  }) as unknown as DiagramData;

  /** Dropped "on the end" — past the pool's right edge, at the same height. */
  const onTheEnd = [
    E2({ id: "n1", type: "task", label: "New A", x: 700, y: 60, width: 120, height: 60, properties: {} }),
    E2({ id: "n2", type: "task", label: "New B", x: 860, y: 60, width: 120, height: 60, properties: {} }),
  ];
  const apply = (d: DiagramData, els = onTheEnd) =>
    reducer(d, { type: "APPLY_TEMPLATE", payload: { elements: els, connectors: [] } } as never) as DiagramData;

  it("adopts it, because a pool is a horizontal band", () => {
    // Full containment said "outside", so nothing was adopted, nothing was
    // enclosed, and the pool never grew — the template hung off the end looking
    // like a mistake. Vertical position is what decides membership.
    const after = apply(world());
    for (const id of ["n1", "n2"]) {
      expect(after.elements.find((e) => e.id === id)!.parentId, `${id} joins the lane`).toBe("L");
    }
  });

  it("and the pool and lane grow to cover it", () => {
    const after = apply(world());
    const pool = after.elements.find((e) => e.id === "P")!;
    const lane = after.elements.find((e) => e.id === "L")!;
    expect(pool.x + pool.width, "the pool reaches past the last element").toBeGreaterThanOrEqual(980);
    expect(lane.x + lane.width).toBeGreaterThanOrEqual(980);
  });

  it("a BLACK-BOX pool still adopts nothing, however the template lands", () => {
    const after = apply(world(), [
      E2({ id: "n3", type: "task", label: "Nope", x: 700, y: 430, width: 120, height: 60, properties: {} }),
    ]);
    expect(after.elements.find((e) => e.id === "n3")!.parentId, "never the black box").not.toBe("B");
  });

  it("does not reach LEFT of the pool, or to another band", () => {
    // Overflowing the right edge is a pool that wants to be longer. Something
    // placed to the LEFT, or at a different height, was put there deliberately.
    const after = apply(world(), [
      E2({ id: "n4", type: "task", label: "Left", x: -300, y: 60, width: 100, height: 60, properties: {} }),
      E2({ id: "n5", type: "task", label: "Below", x: 700, y: 900, width: 100, height: 60, properties: {} }),
    ]);
    expect(after.elements.find((e) => e.id === "n4")!.parentId, "left of the pool stays out").toBeUndefined();
    expect(after.elements.find((e) => e.id === "n5")!.parentId, "a different band stays out").toBeUndefined();
  });
});
