/**
 * T4556 — a message label returns to where it was when its pool does.
 *
 * Paul, 2026-09-19, with three exported states of the same diagram: Pool 1
 * below its partners, Pool 1 dragged above them ("message labels seem ok …
 * they have moved to their new positions relative to the pool attachment
 * points"), and Pool 1 dragged back ("Note the position of Pool 1 message 2
 * label. It has not returned to its original position. It is below the
 * returned Pool 1. Can you devise a way so that these labels on moved pools
 * are more reliably placed and in the case of the Pool returned to its
 * starting position are back where they used to be?").
 *
 * The fixture is his "before" export, so the geometry under test is the real
 * thing rather than something convenient.
 *
 * A drag is many MOVE_ELEMENT actions, one per mouse sample, and the crossing
 * from one side of the partner to the other happens at whichever of those the
 * mouse happened to land on. So the property that matters is not "the formula
 * is right" but: DRAG THERE AND BACK AND THE NUMBERS COME BACK. That is what
 * this measures, at several step sizes, because a rule that depends on where
 * the samples fell will give a different answer for each.
 *
 * WHAT WAS WRONG, and what the numbers were before the fix: a ONE-step drag
 * round-tripped exactly, so the formula was always sound, but a seven-step drag
 * landed 213px out and a thirty-step drag 174px out — the label Paul found
 * sitting below the returned pool. The rule was applied at EVERY mouse sample,
 * so the crossing from one side of the partner to the other landed on whichever
 * sample it happened to land on, and mid-crossing the attachment can still sit
 * on the old face while the geometry already says otherwise.
 *
 * THE FIX: settle once, at MOVE_END, against the state the gesture started
 * from (`settleMessageLabels`). The result is then a function of where the pool
 * STARTED and where it ENDED UP and nothing in between, which is why every step
 * count now agrees and why dragging back restores the offsets exactly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const fixture = () => {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "pool-move-labels.json"), "utf8"));
  return raw.diagrams[0].data as DiagramData;
};

const poolOf = (d: DiagramData) =>
  d.elements.find((e) => e.type === "pool" && e.label === "Pool 1") as DiagramElement;

/** Every message flow touching Pool 1, keyed by label. */
function labelOffsets(d: DiagramData): Record<string, { x: number; y: number }> {
  const pool = poolOf(d);
  const out: Record<string, { x: number; y: number }> = {};
  for (const c of d.connectors as Connector[]) {
    if (c.type !== "messageBPMN") continue;
    if (c.sourceId !== pool.id && c.targetId !== pool.id) continue;
    out[c.label ?? c.id] = { x: c.labelOffsetX ?? 0, y: c.labelOffsetY ?? 0 };
  }
  return out;
}

/**
 * How far each label sits from the POOL's own attachment point, and on which
 * side. This — not the stored offset — is what Paul means by "the same
 * relative place": `labelOffsetX/Y` are stored relative to the line's MIDPOINT,
 * which necessarily moves when the pool does, so the stored number changing is
 * correct and says nothing.
 */
function gapDistances(d: DiagramData): Record<string, number> {
  const pool = poolOf(d);
  const out: Record<string, number> = {};
  for (const c of d.connectors as Connector[]) {
    if (c.type !== "messageBPMN") continue;
    if (c.sourceId !== pool.id && c.targetId !== pool.id) continue;
    const wp = c.waypoints;
    const a = wp[c.sourceInvisibleLeader ? 1 : 0];
    const b = wp[c.targetInvisibleLeader ? wp.length - 2 : wp.length - 1];
    const attach = c.sourceId === pool.id ? a : b;
    const other = c.sourceId === pool.id ? b : a;
    const centreY = (a.y + b.y) / 2 + (c.labelOffsetY ?? 0) + 7;
    // Signed INTO the gap, so a clean side-swap reads as the same number.
    out[c.label ?? c.id] = (centreY - attach.y) * (other.y < attach.y ? -1 : 1);
  }
  return out;
}

/**
 * A drag: `steps` MOVE_ELEMENTs from where the pool is to `toY`, then MOVE_END
 * carrying the pre-drag snapshot — which is what the editor does, since
 * `elementMoveEnd` reads it off `preMoveRef` before clearing it.
 */
function drag(state: DiagramData, toY: number, steps: number): DiagramData {
  const pool = poolOf(state);
  const fromY = pool.y, x = pool.x;
  const preDrag = { elements: state.elements, connectors: state.connectors };
  let s = state;
  for (let i = 1; i <= steps; i++) {
    const y = fromY + ((toY - fromY) * i) / steps;
    s = reducer(s, { type: "MOVE_ELEMENT", payload: { id: pool.id, x, y } } as Action);
  }
  return reducer(s, { type: "MOVE_END", payload: { id: poolOf(s).id, preDrag } } as Action);
}

// Where Paul dragged it to, from his "after" export.
const ABOVE_Y = -14.61;

describe("T4556 — pool moved away and back puts its message labels back", () => {
  it("has the fixture Paul exported, with the two message flows on Pool 1", () => {
    // Without this the round-trip below could pass by measuring nothing.
    const d = fixture();
    const pool = poolOf(d);
    expect(pool, "Pool 1").toBeTruthy();
    expect((pool.properties?.poolType as string) ?? "black-box").toBe("black-box");
    const offs = labelOffsets(d);
    expect(Object.keys(offs).sort()).toEqual(["message 2", "message 3"]);
    // One has the pool as its SOURCE and one as its TARGET — the asymmetry
    // that a rule anchored to the wrong end would hide.
    const ids = (d.connectors as Connector[]).filter((c) => c.type === "messageBPMN");
    expect(ids.some((c) => c.sourceId === pool.id)).toBe(true);
    expect(ids.some((c) => c.targetId === pool.id)).toBe(true);
  });

  for (const steps of [1, 7, 30]) {
    it(`returns every label to its starting offset after a ${steps}-step drag there and back`, () => {
      const start = fixture();
      const before = labelOffsets(start);
      const startY = poolOf(start).y;

      const moved = drag(start, ABOVE_Y, steps);
      const back = drag(moved, startY, steps);

      expect(poolOf(back).y, "the pool itself is back").toBeCloseTo(startY, 6);
      const after = labelOffsets(back);
      for (const key of Object.keys(before)) {
        // 1px: the connector re-route can settle an attachment a hair
        // differently, and that is not what this is about.
        expect(after[key].y, `${key} vertical offset`).toBeCloseTo(before[key].y, 0);
        expect(after[key].x, `${key} horizontal offset`).toBeCloseTo(before[key].x, 0);
      }
    });
  }

  it("does not depend on how many mouse samples the drag happened to get", () => {
    // The crossing from one side of the partner to the other lands on whichever
    // sample it lands on. If the rule mirrors about THAT moment's attachment
    // rather than the settled one, every drag gives a different answer.
    const results = [1, 7, 30].map((steps) => labelOffsets(drag(fixture(), ABOVE_Y, steps)));
    for (const key of Object.keys(results[0])) {
      expect(results[1][key].y, `${key} after 7 steps vs 1`).toBeCloseTo(results[0][key].y, 0);
      expect(results[2][key].y, `${key} after 30 steps vs 1`).toBeCloseTo(results[0][key].y, 0);
    }
  });

  it("lands in the same place however far the pool is dragged past", () => {
    // Not just Paul's one destination: the settle must be a function of where
    // the pool ended up, so ending at the same place by a different route —
    // or after going further and coming back — must agree.
    const direct = labelOffsets(drag(fixture(), ABOVE_Y, 5));
    const viaFurther = labelOffsets(drag(drag(fixture(), ABOVE_Y - 400, 5), ABOVE_Y, 5));
    for (const key of Object.keys(direct)) {
      expect(viaFurther[key].y, `${key} reached by a different route`).toBeCloseTo(direct[key].y, 0);
    }
  });

  it("returns the labels after a move that never crosses the partner at all", () => {
    // The no-crossing case must be a plain translation and come back exactly.
    const start = fixture();
    const before = labelOffsets(start);
    const startY = poolOf(start).y;
    const nudged = drag(start, startY + 60, 9);
    const back = labelOffsets(drag(nudged, startY, 9));
    for (const key of Object.keys(before)) {
      expect(back[key].y, `${key} after a short there-and-back`).toBeCloseTo(before[key].y, 0);
    }
  });

  it("is unchanged by a MOVE_END that carries no snapshot", () => {
    // Older call sites (and a click that never became a drag) send no preDrag.
    // That must be a no-op rather than a throw or a reset.
    const s = fixture();
    const pool = poolOf(s);
    const out = reducer(s, { type: "MOVE_END", payload: { id: pool.id } } as Action);
    expect(labelOffsets(out)).toEqual(labelOffsets(s));
  });

  it("changes nothing more once the pool is clear on the other side", () => {
    // Paul's rule, 2026-09-19: "when moving a Pool with messages attached from
    // elements that it is going to cross … the message attachment points and
    // labels don't need to be redone until the Pool is on the other side …
    // Once clear the message attachment points swap sides and the label are
    // place in the same relative place and if the movement continues they do
    // not need to change any more."
    //
    // So: one swap, then nothing. Dragging further and further past must keep
    // giving the same offsets — the label is placed relative to the pool's own
    // attachment, and that relationship stops changing once the sides settle.
    const clear = drag(fixture(), ABOVE_Y, 6);
    const gaps = gapDistances(clear);
    let s = clear;
    for (const further of [ABOVE_Y - 150, ABOVE_Y - 500, ABOVE_Y - 1200]) {
      s = drag(s, further, 6);
      const now = gapDistances(s);
      for (const key of Object.keys(gaps)) {
        expect(now[key], `${key} must keep its place beside the pool at y=${further}`)
          .toBeCloseTo(gaps[key], 0);
      }
    }
  });

  it("keeps the same distance beside the pool across the crossing", () => {
    // The other half of Paul's rule: once clear, the attachments swap sides
    // "and the label are place in the same relative place". Measured from the
    // pool's own attachment, that distance is the thing that must survive.
    const start = fixture();
    const before = gapDistances(start);
    const after = gapDistances(drag(start, ABOVE_Y, 6));
    for (const key of Object.keys(before)) {
      expect(after[key], `${key} beside the pool, after the swap`).toBeCloseTo(before[key], 0);
    }
  });

  it("keeps each label in the gap between the pool and its partner", () => {
    // The reason the offsets matter: a label that leaves the gap ends up
    // underneath the pool, which is exactly what Paul saw.
    const movedState = drag(fixture(), ABOVE_Y, 7);
    const pool = poolOf(movedState);
    for (const c of movedState.connectors as Connector[]) {
      if (c.type !== "messageBPMN") continue;
      if (c.sourceId !== pool.id && c.targetId !== pool.id) continue;
      const wp = c.waypoints;
      const a = wp[c.sourceInvisibleLeader ? 1 : 0];
      const b = wp[c.targetInvisibleLeader ? wp.length - 2 : wp.length - 1];
      const midY = (a.y + b.y) / 2;
      const centreY = midY + (c.labelOffsetY ?? 0) + 7;
      const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
      expect(centreY, `${c.label} must sit between the two attachments`).toBeGreaterThanOrEqual(lo - 1);
      expect(centreY, `${c.label} must sit between the two attachments`).toBeLessThanOrEqual(hi + 1);
    }
  });
});
