/**
 * T4561 — message labels come off while a pool is dragged ACROSS a pool it
 * exchanges messages with. T4691 — and only then.
 *
 * Paul, 2026-09-19: "Hide the message labels when moving a Pool across another
 * Pool or group of pool-less elements until they are finally placed correctly."
 *
 * The other half of settling labels at the END of a gesture (T4556): because
 * the final position is worked out once, from where the pool started and where
 * it ended up, the position DURING the drag is not the answer to anything —
 * it is the old offset riding a line whose midpoint is moving. Showing it while
 * the pool crosses is showing a number that is about to change.
 *
 * Paul, 2026-09-23, narrowing it: "No need to hide message labels during Pool
 * movements unless the Pool is moved over another Pool with which it has
 * message connectors OR has message connectors with one or more of that Pool's
 * child elements." Hiding for every pool drag took the text away on moves that
 * could not disturb it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { messageLabelsHiddenWhileDragging } from "@/app/lib/diagram/labelVisibility";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const E = (id: string, type: string, x: number, y: number, w: number, h: number, parentId?: string) =>
  ({ id, type, x, y, width: w, height: h, parentId });

/** pool1 at 0..400; pool2 well clear below it; a task in each. */
const apart = () => [
  E("pool1", "pool", 0, 0, 800, 200),
  E("pool2", "pool", 0, 400, 800, 200),
  E("task1", "task", 100, 60, 100, 60, "pool1"),
  E("task2", "task", 100, 460, 100, 60, "pool2"),
  E("loose", "task", 900, 60, 100, 60),          // no pool at all
];
/** The same, with pool1 dragged down onto pool2. */
const over = () => apart().map((e) => (e.id === "pool1" ? { ...e, y: 380 } : e.id === "task1" ? { ...e, y: 440 } : e));

const conns = [
  { id: "m-pool", type: "messageBPMN", sourceId: "pool1", targetId: "pool2" },
  { id: "m-child", type: "messageBPMN", sourceId: "task1", targetId: "task2" },
  { id: "m-loose", type: "messageBPMN", sourceId: "pool1", targetId: "loose" },
  { id: "s1", type: "sequence", sourceId: "task1", targetId: "task2" },
  // Attached to the dragged pool, so the "messages only" guard has something
  // to actually exclude.
  { id: "s2", type: "sequence", sourceId: "pool1", targetId: "task1" },
];

describe("T4561 — hidden while the pool crosses, back at the drop", () => {
  it("hides the messages between the two pools while they overlap", () => {
    const hidden = messageLabelsHiddenWhileDragging("pool1", over(), conns);
    expect(hidden.has("m-pool"), "pool to pool").toBe(true);
  });

  it("hides a message to the other pool's CHILD element too", () => {
    // Paul, 2026-09-23: "…OR has message connectors with one or more of that
    // Pool's child elements." The flow is task-to-task; what matters is which
    // pools those tasks are in.
    expect(messageLabelsHiddenWhileDragging("pool1", over(), conns).has("m-child")).toBe(true);
  });

  it("never touches a sequence flow, even one on the dragged pool", () => {
    const hidden = messageLabelsHiddenWhileDragging("pool1", over(), conns);
    expect(hidden.has("s2"), "attached to the pool, but not a message").toBe(false);
    expect(hidden.has("s1")).toBe(false);
  });

  it("shows everything again the moment the drag ends", () => {
    // draggingElementId goes null on drop — and on the window-mouseup safety
    // net — so a stuck "hidden" state would need both to fail.
    expect(messageLabelsHiddenWhileDragging(null, over(), conns).size).toBe(0);
  });

  it("does nothing for a task drag", () => {
    // A task drag moves one end of a message too, but it is small and local;
    // hiding labels for it would flicker them on every nudge.
    expect(messageLabelsHiddenWhileDragging("task1", over(), conns).size).toBe(0);
  });

  it("does nothing for an id that is not on the diagram", () => {
    expect(messageLabelsHiddenWhileDragging("ghost", over(), conns).size).toBe(0);
  });

  it("recognises both spellings of a message flow", () => {
    const mixed = [{ id: "mx", type: "message", sourceId: "pool1", targetId: "pool2" }];
    expect(messageLabelsHiddenWhileDragging("pool1", over(), mixed).has("mx")).toBe(true);
  });
});

describe("T4691 — and only while it is actually over that pool", () => {
  it("a pool moved anywhere else keeps its message labels", () => {
    expect(messageLabelsHiddenWhileDragging("pool1", apart(), conns).size).toBe(0);
  });

  it("edges that merely touch are not 'over'", () => {
    const touching = apart().map((e) => (e.id === "pool1" ? { ...e, y: 200 } : e));   // 200..400 vs 400..600
    expect(messageLabelsHiddenWhileDragging("pool1", touching, conns).size).toBe(0);
  });

  it("overlapping a pool it exchanges nothing with changes nothing", () => {
    const els = [...over(), E("pool3", "pool", 0, 380, 800, 200)];
    const onlyOther = [{ id: "m-x", type: "messageBPMN", sourceId: "pool2", targetId: "pool3" }];
    expect(messageLabelsHiddenWhileDragging("pool1", els, onlyOther).size).toBe(0);
  });

  it("a pool-less element under the pool still hides its own flow, and only it", () => {
    // "…or group of pool-less elements": with no pool of its own, the element
    // itself is what the dragged pool is over.
    const onLoose = apart().map((e) => (e.id === "pool1" ? { ...e, x: 850 } : e));
    const hidden = messageLabelsHiddenWhileDragging("pool1", onLoose, conns);
    expect([...hidden]).toEqual(["m-loose"]);
  });

  it("a message wholly inside the dragged pool is never hidden", () => {
    // Both ends travel with the pool, so nothing about the label is in doubt.
    const inside = [{ id: "m-in", type: "messageBPMN", sourceId: "task1", targetId: "pool1" }];
    expect(messageLabelsHiddenWhileDragging("pool1", over(), inside).size).toBe(0);
  });
});

describe("T4561 — wiring", () => {
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
