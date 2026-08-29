/**
 * V06.06 (2026-08-29): "large sequence connector gap between Review Solution
 * Design Scope and Retrieve Design Specifications".
 *
 * R8.15 shortens an over-long first connector by bringing the first element back
 * towards the Start. Inside an Expanded Subprocess it slides the WHOLE inner
 * flow, so the spacing after the first element is preserved. In the main pool it
 * moved only the first element — which closes the gap after the Start and opens
 * an identical one at the very next link. The hole was not removed, it was
 * relocated one link along, and the tell is a Start-to-first gap sitting at
 * exactly MAX_CONN with a large void immediately after it.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

/** start → A → B → [EP with `epKids` children] → C → end, all in one lane. */
function build(epKids: number) {
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Product Organisation", poolType: "white-box" },
    { id: "l", type: "lane", label: "Research and Development", parentPool: "p" },
    { id: "s", type: "start-event", label: "Approved solution design received", pool: "p", lane: "l" },
    { id: "a", type: "task", label: "Review Solution Design Scope", pool: "p", lane: "l" },
    { id: "b", type: "task", label: "Retrieve Design Specifications", pool: "p", lane: "l" },
    { id: "ep", type: "subprocess-expanded", label: "Repeat Until Specification Agreed", pool: "p", lane: "l" },
    { id: "c", type: "task", label: "Hand Specification to Engineering", pool: "p", lane: "l" },
    { id: "e", type: "end-event", label: "Specification complete", pool: "p", lane: "l" },
    { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
    { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "a" }, { sourceId: "a", targetId: "b" },
    { sourceId: "b", targetId: "ep" }, { sourceId: "ep", targetId: "c" }, { sourceId: "c", targetId: "e" },
  ];
  let prev = "es";
  for (let i = 1; i <= epKids; i++) {
    els.push({ id: `k${i}`, type: "task", label: `Inner Step ${i}`, parentSubprocess: "ep" });
    conns.push({ sourceId: prev, targetId: `k${i}` });
    prev = `k${i}`;
  }
  conns.push({ sourceId: prev, targetId: "ee" });
  return { els, conns };
}

describe("R8.15 — shortening the first connector must not relocate the hole", () => {
  for (const epKids of [2, 6, 12, 16]) {
    it(`T2911 — no gap is opened after the first element (EP with ${epKids} children)`, () => {
      const { els, conns } = build(epKids);
      const out = layoutBpmnDiagram(els, conns);
      const at = (id: string) => out.elements.find((x) => x.id === id)!;
      const gap = (x: string, y: string) => at(y).x - (at(x).x + at(x).width);

      const first = gap("s", "a");   // Start → first element, the gap R8.15 closes
      const next = gap("a", "b");    // first element → its successor
      expect(first, `Start→A is ${Math.round(first)}px`).toBeGreaterThanOrEqual(0);
      // The rule exists to SHORTEN. It must not buy that by lengthening the very
      // next connector — which is what moving the first element alone did.
      expect(
        next,
        `R8.15 closed Start→A to ${Math.round(first)}px but left A→B at ${Math.round(next)}px`,
      ).toBeLessThanOrEqual(Math.max(first, 70) + 1);
      // And nothing may end up on top of anything.
      expect(next).toBeGreaterThanOrEqual(0);
      expect(gap("b", "ep")).toBeGreaterThanOrEqual(0);
    });
  }

  it("T2912 — the whole downstream flow keeps its spacing when the slide happens", () => {
    // The slide moves a block, so the distances INSIDE that block are unchanged.
    const spacing = (epKids: number) => {
      const { els, conns } = build(epKids);
      const out = layoutBpmnDiagram(els, conns);
      const at = (id: string) => out.elements.find((x) => x.id === id)!;
      return [
        Math.round(at("b").x - (at("a").x + at("a").width)),
        Math.round(at("ep").x - (at("b").x + at("b").width)),
      ];
    };
    // Independent of how far the block had to move.
    expect(spacing(2)).toEqual(spacing(16));
  });
});
