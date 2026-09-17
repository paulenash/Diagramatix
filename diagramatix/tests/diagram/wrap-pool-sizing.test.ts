/**
 * Three more ways "surround selected with a pool" went wrong (Paul, 2026-09-18).
 *
 * 1. THE POOL DID NOT GROW. Adopting loose elements into an existing pool set
 *    their parentId and left the sizing to the shared enclosure pass — which
 *    does not do it. For a pool or a lane that pass counts ONLY lane and
 *    sub-lane children, deliberately, so ordinary elements never shove swimlanes
 *    about. So it reported "grew Pool 1 to take in 11 loose elements" and Pool 1
 *    did not move a pixel, leaving elements owned by a pool drawn nowhere near
 *    them — the same stale parentage that made a nudge move a whole diagram.
 *
 * 2. A NAME SAID WITHOUT "CALLED" was not understood. "Surround selected with
 *    Pool 2" failed the grammar and reached the AI, which read it as the
 *    whole-diagram wrap.
 *
 * 3. A PAUSE MADE TWO POOLS. "Surround selected with a pool, called Pool 2"
 *    split at the comma; the first half is a complete command so it ran and made
 *    a pool named "Pool", and the tail "called Pool 2." went to the AI and made
 *    a second pool. The comma was the only signal that more was coming.
 */
import { describe, it, expect } from "vitest";
import { growPoolToAdopt, ADOPT_PAD, POOL_HEADER_W } from "@/app/lib/diagram/growPool";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import type { DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 102, height: 65, properties: {}, ...extra } as DiagramElement);

const encloses = (pool: DiagramElement, kids: DiagramElement[]) =>
  kids.every((k) =>
    k.x >= pool.x && k.x + k.width <= pool.x + pool.width
    && k.y >= pool.y && k.y + k.height <= pool.y + pool.height);

describe("T4504 — the pool actually grows around what it adopts", () => {
  /** Paul's shape: a 78px strip at the bottom, elements far above it. */
  const shape = (): DiagramElement[] => [
    el("P", "pool", { x: 187, y: 788, width: 1112, height: 78 }),
    el("a", "task", { parentId: "P", x: 300, y: 200 }),
    el("b", "task", { parentId: "P", x: 600, y: 400 }),
    el("c", "task", { parentId: "P", x: 900, y: 620 }),
  ];

  it("ends up drawn around the elements it took in", () => {
    const out = growPoolToAdopt(shape(), "P", "P", ["a", "b", "c"]);
    const pool = out.find((e) => e.id === "P")!;
    const kids = out.filter((e) => e.parentId === "P");
    expect(encloses(pool, kids), "a container has to be drawn around its contents").toBe(true);
  });

  it("grows upward when the elements are above it", () => {
    const before = shape().find((e) => e.id === "P")!;
    const pool = growPoolToAdopt(shape(), "P", "P", ["a", "b", "c"]).find((e) => e.id === "P")!;
    expect(pool.y).toBeLessThan(before.y);
    expect(pool.height).toBeGreaterThan(before.height);
  });

  it("leaves room for the name strip on the left", () => {
    // The adopted element has to be LEFT of the pool, or the pool's existing x
    // satisfies the assertion on its own and the test proves nothing.
    const toTheLeft = [
      el("P", "pool", { x: 800, y: 788, width: 400, height: 78 }),
      el("a", "task", { parentId: "P", x: 100, y: 200 }),
    ];
    const pool = growPoolToAdopt(toTheLeft, "P", "P", ["a"]).find((e) => e.id === "P")!;
    expect(pool.x).toBeLessThanOrEqual(100 - ADOPT_PAD - POOL_HEADER_W);
    const kid = growPoolToAdopt(toTheLeft, "P", "P", ["a"]).find((e) => e.id === "a")!;
    expect(kid.x - pool.x, "the name strip is not covered by the element").toBeGreaterThanOrEqual(POOL_HEADER_W);
  });

  it("never shrinks the pool around its existing contents", () => {
    // Adopting one element near the middle must not crop the pool.
    const wide = [
      el("P", "pool", { x: 0, y: 0, width: 1000, height: 400 }),
      el("a", "task", { parentId: "P", x: 400, y: 150 }),
    ];
    const pool = growPoolToAdopt(wide, "P", "P", ["a"]).find((e) => e.id === "P")!;
    expect(pool.x).toBe(0);
    expect(pool.y).toBe(0);
    expect(pool.width).toBe(1000);
    expect(pool.height).toBe(400);
  });

  it("keeps the lanes tiling the pool with no gaps", () => {
    const laned = [
      el("P", "pool", { x: 187, y: 788, width: 1112, height: 100 }),
      el("L1", "lane", { parentId: "P", x: 223, y: 788, width: 1076, height: 50 }),
      el("L2", "lane", { parentId: "P", x: 223, y: 838, width: 1076, height: 50 }),
      el("a", "task", { parentId: "L1", x: 300, y: 200 }),
    ];
    const out = growPoolToAdopt(laned, "P", "L1", ["a"]);
    const pool = out.find((e) => e.id === "P")!;
    const lanes = out.filter((e) => e.type === "lane").sort((x, y) => x.y - y.y);
    expect(lanes[0].y, "the first lane starts at the pool's top").toBe(pool.y);
    expect(lanes[0].y + lanes[0].height, "no gap between the lanes").toBe(lanes[1].y);
    expect(lanes[1].y + lanes[1].height, "the last lane reaches the bottom").toBe(pool.y + pool.height);
    for (const l of lanes) expect(l.width).toBe(pool.width - POOL_HEADER_W);
  });

  it("re-tiles lanes when the growth is not at either end", () => {
    // Three lanes, the MIDDLE one adopting, and the pool growing both up and
    // down. Adjusting each lane on its own leaves gaps here; the lanes have to
    // be laid end to end afterwards.
    const three = [
      el("P", "pool", { x: 187, y: 500, width: 1112, height: 150 }),
      el("L1", "lane", { parentId: "P", x: 223, y: 500, width: 1076, height: 50 }),
      el("L2", "lane", { parentId: "P", x: 223, y: 550, width: 1076, height: 50 }),
      el("L3", "lane", { parentId: "P", x: 223, y: 600, width: 1076, height: 50 }),
      el("above", "task", { parentId: "L2", x: 300, y: 100 }),
      el("below", "task", { parentId: "L2", x: 500, y: 900 }),
    ];
    const out = growPoolToAdopt(three, "P", "L2", ["above", "below"]);
    const pool = out.find((e) => e.id === "P")!;
    const lanes = out.filter((e) => e.type === "lane").sort((x, y) => x.y - y.y);
    expect(lanes[0].y).toBe(pool.y);
    for (let i = 1; i < lanes.length; i++) {
      expect(lanes[i].y, `no gap above lane ${i}`).toBe(lanes[i - 1].y + lanes[i - 1].height);
    }
    const last = lanes[lanes.length - 1];
    expect(last.y + last.height).toBe(pool.y + pool.height);
  });

  it("does nothing when there is nothing to adopt", () => {
    const same = shape();
    expect(growPoolToAdopt(same, "P", "P", [])).toEqual(same);
    expect(growPoolToAdopt(same, "nope", "nope", ["a"])).toEqual(same);
  });
});

describe("T4507 — the reducer really sizes the pool it adopts into", () => {
  it("grows Pool 1 around the elements it takes in", async () => {
    // The helper above is worth nothing if WRAP_IN_POOL keeps handing the job to
    // the enclosure pass that does not do it. This drives the reducer itself.
    const { reducer } = await import("@/app/hooks/useDiagram");
    const before = {
      elements: [
        el("P", "pool", { label: "Pool 1", x: 187, y: 788, width: 1112, height: 78, properties: { poolType: "white-box" } }),
        el("a", "task", { x: 300, y: 200 }),
        el("b", "task", { x: 600, y: 400 }),
      ],
      connectors: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as Parameters<typeof reducer>[0];

    const after = reducer(before, { type: "WRAP_IN_POOL", payload: {} } as never);
    const pool = after.elements.find((e) => e.id === "P")!;
    const kids = after.elements.filter((e) => e.parentId === "P");

    expect(kids.map((k) => k.id).sort(), "the elements were adopted").toEqual(["a", "b"]);
    expect(encloses(pool, kids), "and the pool is drawn around them").toBe(true);
    expect(pool.y, "which means growing upward to reach them").toBeLessThan(788);
  });
});

describe("T4505 — a name said without 'called'", () => {
  it("takes 'with Pool 2' as the name", () => {
    expect(parseCommand("surround selected with Pool 2"))
      .toEqual([{ op: "wrapInContainer", container: "pool", label: "Pool 2" }]);
  });

  it("takes it on a lane too, and with the verb dropped", () => {
    expect(parseCommand("surround selected with Lane 3"))
      .toEqual([{ op: "wrapInContainer", container: "lane", label: "Lane 3" }]);
    expect(parseCommand("selected with Pool 2"))
      .toEqual([{ op: "wrapInContainer", container: "pool", label: "Pool 2" }]);
  });

  it("still reads the explicit form, and does not name a pool 'called'", () => {
    expect(parseCommand("surround selected with a pool called Finance"))
      .toEqual([{ op: "wrapInContainer", container: "pool", label: "Finance" }]);
    expect(parseCommand("wrap these in a lane called Picking"))
      .toEqual([{ op: "wrapInContainer", container: "lane", label: "Picking" }]);
  });

  it("leaves a plain wrap unnamed", () => {
    expect(parseCommand("surround selected with a pool"))
      .toEqual([{ op: "wrapInContainer", container: "pool" }]);
  });

  it("does not eat the rest of the other phrasing", () => {
    expect(parseCommand("put a pool around the selected elements"))
      .toEqual([{ op: "wrapInContainer", container: "pool" }]);
  });
});

describe("T4506 — a pause does not become a second command", () => {
  it("holds an utterance that ends on a comma", () => {
    // The recogniser punctuates on intonation, so the comma IS the speaker
    // saying they have not finished. Everything else about the first half looks
    // like a finished command, which is why it ran.
    expect(isIncompleteCommand("Surround selected with a pool,")).toBe(true);
    expect(isIncompleteCommand("add a task called Approve,")).toBe(true);
  });

  it("holds a tail that begins with 'called'", () => {
    // On its own it means nothing; handed to the AI it became "add a pool".
    for (const tail of ["called Pool 2.", "named Finance", "labelled Order Placed"]) {
      expect(isIncompleteCommand(tail), tail).toBe(true);
    }
  });

  it("does not hold the same command once it is finished", () => {
    expect(isIncompleteCommand("Surround selected with a pool")).toBe(false);
    expect(isIncompleteCommand("Surround selected with a pool called Pool 2")).toBe(false);
    expect(isIncompleteCommand("surround selected with a pool.")).toBe(false);
  });

  it("leaves a comma INSIDE a sentence alone", () => {
    // "add lanes called Sales, Marketing and Support" is finished.
    expect(isIncompleteCommand("add 3 lanes to Warehouse called Sales, Marketing and Support")).toBe(false);
  });
});
