/**
 * T4561 — message labels come off while a pool is being dragged.
 *
 * Paul, 2026-09-19: "Hide the message labels when moving a Pool across another
 * Pool or group of pool-less elements until they are finally placed correctly."
 *
 * The other half of settling labels at the END of a gesture (T4556): because
 * the final position is worked out once, from where the pool started and where
 * it ended up, the position DURING the drag is not the answer to anything —
 * it is the old offset riding a line whose midpoint is moving. Showing it while
 * the pool crosses is showing a number that is about to change.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { messageLabelsHiddenWhileDragging } from "@/app/lib/diagram/labelVisibility";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const els = [
  { id: "pool1", type: "pool" },
  { id: "pool2", type: "pool" },
  { id: "task1", type: "task" },
  { id: "task2", type: "task" },
];
const conns = [
  { id: "m1", type: "messageBPMN", sourceId: "task1", targetId: "pool1" },
  { id: "m2", type: "messageBPMN", sourceId: "pool1", targetId: "task1" },
  { id: "m3", type: "messageBPMN", sourceId: "task2", targetId: "pool2" },
  { id: "s1", type: "sequence", sourceId: "task1", targetId: "task2" },
  // Attached to the dragged pool, so the "messages only" guard has something
  // to actually exclude — a sequence flow that misses the pool would be
  // filtered by the endpoint check anyway and prove nothing.
  { id: "s2", type: "sequence", sourceId: "pool1", targetId: "task1" },
];

describe("T4561 — hidden while the pool moves, back at the drop", () => {
  it("hides every message on the pool being dragged, whichever end it is", () => {
    const hidden = messageLabelsHiddenWhileDragging("pool1", els, conns);
    expect([...hidden].sort()).toEqual(["m1", "m2"]);
  });

  it("leaves other pools' messages alone", () => {
    // That flow is not affected by this move, so its label is still true.
    expect(messageLabelsHiddenWhileDragging("pool1", els, conns).has("m3")).toBe(false);
  });

  it("never touches a sequence flow, even one on the dragged pool", () => {
    const hidden = messageLabelsHiddenWhileDragging("pool1", els, conns);
    expect(hidden.has("s2"), "attached to the pool, but not a message").toBe(false);
    expect(hidden.has("s1")).toBe(false);
  });

  it("shows everything again the moment the drag ends", () => {
    // draggingElementId goes null on drop — and on the window-mouseup safety
    // net — so a stuck "hidden" state would need both to fail.
    expect(messageLabelsHiddenWhileDragging(null, els, conns).size).toBe(0);
  });

  it("does nothing for a task drag", () => {
    // A task drag moves one end of a message too, but it is small and local;
    // hiding labels for it would flicker them on every nudge.
    expect(messageLabelsHiddenWhileDragging("task1", els, conns).size).toBe(0);
  });

  it("does nothing for an id that is not on the diagram", () => {
    expect(messageLabelsHiddenWhileDragging("ghost", els, conns).size).toBe(0);
  });

  it("recognises both spellings of a message flow", () => {
    const mixed = [{ id: "mx", type: "message", sourceId: "pool1", targetId: "task1" }];
    expect(messageLabelsHiddenWhileDragging("pool1", els, mixed).has("mx")).toBe(true);
  });

  it("is wired to the renderer's existing hideLabel prop", () => {
    const canvas = read("app", "components", "canvas", "Canvas.tsx");
    expect(canvas).toContain("messageLabelsHiddenWhileDragging(draggingElementId, data.elements, data.connectors)");
    // Folded into the one set the renderer already reads, rather than a second
    // parallel mechanism — every call site gets it for free.
    expect(canvas).toContain("hiddenLabelConnIds.has(conn.id)");
    expect((canvas.match(/hideLabel=\{hiddenLabelConnIds\.has\(conn\.id\)\}/g) ?? []).length)
      .toBeGreaterThanOrEqual(4);
    expect(canvas, "the old branch-only name is gone").not.toContain("hiddenBranchLabelConnIds");
  });

  it("hides the text but keeps the connector", () => {
    // hideLabel suppresses the label only, and still yields to an open editor
    // so a label being typed does not vanish mid-edit.
    const cr = read("app", "components", "canvas", "ConnectorRenderer.tsx");
    expect(cr).toContain("if (hideLabel && !isEditing) return null;");
  });
});
