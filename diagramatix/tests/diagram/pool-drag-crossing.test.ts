/**
 * Dragging a pool across the diagram (Paul, 2026-09-18).
 *
 *   "I tried to move Pool 1 manually upwards to move it above Pool 2. As soon as
 *    it engulfed the lowest task for which it became a Parent all edge-mounted
 *    events on EP Document Handling started moving upwards with it. Also Pool 1
 *    was underneath elements as it moved upwards."
 *
 *   "I want moving pools travelling up or down across other pools or even just
 *    pooless elements to be always on top and not interact at all with elements
 *    they cross over."
 *
 * Three separate things, all in the drag path rather than the voice path:
 *
 *  1. WHAT TRAVELS is decided ONCE, when the drag starts. It was recomputed on
 *     every frame, so a pool moving up the page kept acquiring whatever it had
 *     come to be drawn around — which is the "interaction" being complained
 *     about, and it is unfixable while membership is a function of the current
 *     position.
 *  2. The single-element drag walked parentId alone, with no host rule, so it
 *     carried five events mounted on a subprocess that was standing still.
 *  3. The moving group draws above what it crosses, as a block.
 */
import { describe, it, expect } from "vitest";
import { expandMoveSet } from "@/app/lib/diagram/moveSet";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiagramElement } from "@/app/lib/diagram/types";

const CONTAINERS = new Set(["pool", "lane", "sublane", "subprocess-expanded", "group"]);
const isContainer = (t: string) => CONTAINERS.has(t);
const descendantsOf = (elements: DiagramElement[], id: string): string[] => {
  const out = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of elements) {
      if (out.has(e.id)) continue;
      if (e.parentId === id || (e.parentId && out.has(e.parentId))) { out.add(e.id); grew = true; }
    }
  }
  return [...out];
};

const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 100, y: 0, width: 102, height: 65, properties: {}, ...extra } as DiagramElement);

/** Paul's shape: a strip at the bottom, a subprocess above it with mounted events. */
const shape = (poolY = 788): DiagramElement[] => [
  el("EP", "subprocess-expanded", { x: 300, y: 170, width: 900, height: 420 }),
  el("POOL", "pool", { x: 187, y: poolY, width: 1112, height: 78 }),
  el("lowest", "task", { x: 400, y: 620 }),
  // Parented to the pool but drawn far above it — the stale record again, and
  // the one that changes hands as the pool rises past it.
  el("stray", "task", { parentId: "POOL", x: 700, y: 300 }),
  // Mounted on the subprocess, parented to the pool — the stale record.
  el("Start", "start-event", { parentId: "POOL", boundaryHostId: "EP", x: 383, y: 235, width: 36, height: 36 }),
  el("Ev1", "intermediate-event", { parentId: "POOL", boundaryHostId: "EP", x: 955, y: 537, width: 36, height: 36 }),
];

const travellingWith = (els: DiagramElement[], id: string) =>
  [...expandMoveSet(els, [id], isContainer, descendantsOf)].sort();

describe("T4512 — a pool crossing the diagram picks nothing up", () => {
  it("carries only itself when it starts clear of everything", () => {
    expect(travellingWith(shape(), "POOL")).toEqual(["POOL"]);
  });

  it("is decided at the start, so moving up the page changes nothing", () => {
    // The membership at the start is what matters. Recomputed part-way up — the
    // old behaviour — the pool has come to enclose the task and the events, and
    // would take them along.
    const atStart = travellingWith(shape(788), "POOL");
    const partWayUp = travellingWith(shape(290), "POOL");
    expect(atStart).toEqual(["POOL"]);
    expect(partWayUp, "which is exactly why it cannot be recomputed per frame")
      .toContain("stray");
  });

  it("never takes an event mounted on something that is standing still", () => {
    // Even mid-crossing, when the events are inside the pool's box, the host
    // rule keeps them where they are.
    expect(travellingWith(shape(150), "POOL")).not.toContain("Start");
    expect(travellingWith(shape(150), "POOL")).not.toContain("Ev1");
  });

  it("still carries what genuinely lives in the pool", () => {
    const withKid = [...shape(), el("kid", "task", { parentId: "POOL", x: 400, y: 800 })];
    expect(travellingWith(withKid, "POOL")).toEqual(["POOL", "kid"].sort());
  });
});

describe("T4513 — the drag path uses the same rule as everything else", () => {
  const UD = readFileSync(join(process.cwd(), "app", "hooks", "useDiagram.ts"), "utf8");

  it("decides the travelling set once, at drag start, and hands it to the reducer", () => {
    expect(UD).toContain("dragTravellingRef");
    expect(UD).toContain("travellingIds");
    // The reducer must PREFER what it was handed over recomputing.
    expect(UD).toMatch(/action\.payload\.travellingIds[\s\S]{0,120}expandMoveSet/);
  });

  it("no longer walks parentId alone in the single-element drag", () => {
    // The shortcut beside the set put the stale-parented elements straight back.
    expect(UD).not.toContain("movingIsContainer && (e.parentId === id || descendantIds.has(e.id))");
    expect(UD).toContain("movingIsContainer && descendantIds.has(e.id)");
  });

  it("clears the set when the drag ends, so it cannot leak into the next one", () => {
    expect(UD).toContain("dragTravellingRef.current = null;");
  });
});

describe("T4514 — the moving group draws on top of what it crosses", () => {
  const CANVAS = readFileSync(join(process.cwd(), "app", "components", "canvas", "Canvas.tsx"), "utf8");

  it("draws the group in a LATER pass, which is the only thing that moves it up", () => {
    // SVG paints in document order, and a pool is rendered in the container
    // pass — long before the tasks it crosses. A sort rank inside a list that
    // does not contain pools cannot fix that, which is why the first attempt
    // changed nothing on screen. There has to be a pass after the others.
    expect(CANVAS).toContain('data-lifted-drag="true"');
    const containerPass = CANVAS.indexOf("renderContainerEl = (el: DiagramElement)");
    const nonContainerPass = CANVAS.indexOf("renderNonContainerEl = (el: DiagramElement)");
    const liftedPass = CANVAS.indexOf('data-lifted-drag="true"');
    expect(containerPass).toBeGreaterThan(-1);
    expect(liftedPass, "after the containers").toBeGreaterThan(containerPass);
    expect(liftedPass, "and after the ordinary elements").toBeGreaterThan(nonContainerPass);
  });

  it("holds the lifted elements OUT of their normal passes", () => {
    // Rendered twice they would be drawn in both places and carry two sets of
    // event handlers.
    expect(CANVAS).toContain("!inActiveGroup(el.id) && !isLifted(el.id)");
    expect(CANVAS).toMatch(/isDataArtifactType\(el\.type\) && !isLifted\(el\.id\)/);
  });

  it("draws containers before the rest inside the lifted pass", () => {
    // Otherwise a pool would paint over its own contents and hide them.
    const pass = CANVAS.slice(CANVAS.indexOf('data-lifted-drag="true"'));
    const c = pass.indexOf("renderContainerEl && ");
    const nc = pass.indexOf("renderNonContainerEl && ");
    expect(c).toBeGreaterThan(-1);
    expect(nc).toBeGreaterThan(c);
  });

  it("keeps the rank that orders the group internally", () => {
    expect(CANVAS).toMatch(/lifted\?\.has\(el\.id\)\)\s*return 3;/);
    expect(CANVAS).toMatch(/if \(ra !== rb\) return ra - rb;[\s\S]{0,80}getParentDepth/);
  });

  it("does not lift a lone element being dragged", () => {
    // One id means nothing is travelling with it, and the existing data-artifact
    // rule already handles that case.
    expect(CANVAS).toContain("liftedIds.length > 1");
  });
});
