/**
 * T5211 — a connector attached to an expanded subprocess (EP) must not be clickable INSIDE that EP.
 *
 * Paul, 2026-10-02: "When clicking on an EP to select it … the connecting sequence connectors are selectable when
 * clicking inside the EP. They should only be selectable outside the boundary of their source or target EP."
 *
 * Why it happened (his debug capture): a flow into or out of an EP is stored with its route running ON to the EP's
 * centre — [1238,200] → [1470,200] for an EP spanning x 1238–1702 — and an EP is click-through inside, so the
 * connector's invisible 12 px hit stroke, drawn for the whole route, caught clicks anywhere along that line.
 * (The visible line is hidden under the EP; the hit area was not.) An association has always had its shapes cut
 * out of its hit area with a clip path; the other connectors now get the EP they are attached to cut out too.
 *
 * Blink does not apply `mask` to hit-testing, only `clip-path` — see the comment in ConnectorRenderer — so the
 * wiring is asserted on the source, as the association's own guard is.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const renderer = readFileSync("app/components/canvas/ConnectorRenderer.tsx", "utf8");
const canvas = readFileSync("app/components/canvas/Canvas.tsx", "utf8");

describe("T5211 connectors do not catch clicks inside the EP they are attached to", () => {
  it("Canvas hands a connector the bounds of its source / target when they are expanded subprocesses — and only those", () => {
    expect(canvas).toContain('e.type === "subprocess-expanded"');
    expect(canvas).toContain("[conn.sourceId, conn.targetId].flatMap((id) => { const b = epBoundsById.get(id); return b ? [b] : []; })");
  });
  it("both the ordinary pass and the selected-on-top pass pass it", () => {
    expect(canvas.match(/epHitHoles=\{epHolesOf\(conn\)\}/g) ?? []).toHaveLength(2);
  });
  it("the renderer cuts those rectangles out of the hit area with a clip path (evenodd), not a mask", () => {
    expect(renderer).toContain("epHitHoles?: { x: number; y: number; width: number; height: number }[];");
    expect(renderer).toContain("...(epHitHoles ?? []),");
    expect(renderer).toContain('clipRule="evenodd"');
    expect(renderer).toMatch(/clipPath=\{\(\(\(isAssocBPMN \|\| isReviewLink\)[^}]*\|\| \(epHitHoles\?\.length \?\? 0\) > 0\) \? `url\(#assoc-hit-clip-\$\{connector\.id\}\)` : undefined\}/);
  });
  it("an association keeps its own endpoint and shape masks; a non-association gets ONLY the EP holes", () => {
    expect(renderer).toContain("...(assocLike && sourceBounds ? [sourceBounds] : []),");
    expect(renderer).toContain("...(assocLike && targetBounds ? [targetBounds] : []),");
    expect(renderer).toContain("...(assocLike ? (maskBounds ?? []) : []),");
  });
  it("a connector with no EP end gets no clip at all (the guard is empty-aware)", () => {
    expect(renderer).toContain("(epHitHoles?.length ?? 0) > 0");
  });
});
