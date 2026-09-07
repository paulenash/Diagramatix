import { describe, it, expect } from "vitest";
import {
  cells3From, step3, fate3, boundingBox3, sameShape3, sameCells3, pack3, x3, y3, z3,
  NEIGHBOUR_COUNT,
} from "@/app/lib/life/engine3d";
import {
  BAYS_6567, parseRule3d, formatRule3d, describeRule3d, RULE_3D_LIBRARY, rule3dFor, sameRule3d,
} from "@/app/lib/life/rules3d";
import { LIFE_3D_PATTERNS, pattern3dById, randomSoup3 } from "@/app/lib/life/patterns3d";

/**
 * Life on a cubic lattice.
 *
 * Paul, 2026-09-07, with Bays' argument: 26 neighbours rather than 8, and
 * B3/S23 is far too permissive there — "random configurations tend to expand
 * explosively rather than producing the balanced mixture… familiar from Conway
 * Life", which is why B6/S567 exists.
 *
 * The 2-D library could be checked against published figures. Nothing equivalent
 * is available here, so the patterns were SEARCHED FOR rather than remembered
 * (scripts/find-3d-life-patterns.ts) and every one is re-verified below against
 * the behaviour it claims. A coordinate typed wrongly cannot survive that, which
 * matters more here than in two dimensions: a wrong 3-D coordinate list still
 * looks like a plausible cluster of cubes on the screen.
 */

const cellsOf = (id: string) => cells3From(pattern3dById(id)!.cells);

describe("the cubic lattice", () => {
  it("T3340 packs three coordinates and reads them back, negatives included", () => {
    for (const [x, y, z] of [[0, 0, 0], [1, 2, 3], [-1, -1, -1], [-400, 0, 511], [511, -512, 7]] as [number, number, number][]) {
      const k = pack3(x, y, z);
      expect([x3(k), y3(k), z3(k)], `${x},${y},${z}`).toEqual([x, y, z]);
    }
  });

  it("T3341 a cube has 26 neighbours — 6 by face, 12 by edge, 8 by corner", () => {
    expect(NEIGHBOUR_COUNT.moore).toBe(26);
    expect(NEIGHBOUR_COUNT.faces).toBe(6);
    // Counted the way the engine counts: a lone dead cube at the centre of a
    // full 3x3x3 shell is born under a rule that fires on 26 and not on 25.
    const shell: [number, number, number][] = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (x || y || z) shell.push([x, y, z]);
    }
    expect(shell).toHaveLength(26);
    const born = step3(cells3From(shell), { birth: new Set([26]), survive: new Set() });
    expect(born.has(pack3(0, 0, 0)), "the centre should be born on 26").toBe(true);
    const notBorn = step3(cells3From(shell), { birth: new Set([25]), survive: new Set() });
    expect(notBorn.has(pack3(0, 0, 0))).toBe(false);
  });

  it("T3342 the face-only neighbourhood really is only the six faces", () => {
    // Paul: "Another possible 3-D neighbourhood uses only the 6 face-sharing
    // cells." A corner-touching cube must not count there.
    const corners: [number, number, number][] = [[1, 1, 1], [-1, -1, -1], [1, -1, 1], [-1, 1, -1]];
    const faces: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0]];
    const rule = { birth: new Set([3]), survive: new Set<number>() };
    expect(step3(cells3From(corners), rule, undefined, "faces").has(pack3(0, 0, 0))).toBe(false);
    expect(step3(cells3From(faces), rule, undefined, "faces").has(pack3(0, 0, 0))).toBe(true);
  });

  it("T3343 a bounded cube is a CULL, not a wrap", () => {
    const atEdge = cells3From([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1]]);
    const bounded = step3(atEdge, BAYS_6567, { size: 4 });
    for (const k of bounded) {
      for (const v of [x3(k), y3(k), z3(k)]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(4);
      }
    }
  });

  it("T3344 a generation follows the population, not the volume", () => {
    // The reason the lattice can be unbounded at all: Paul's suggested 100³ is a
    // million cells, and a dense array would visit every one of them.
    const g = cells3From(pattern3dById("glider")!.cells.map(([x, y, z]) => [x + 200, y + 200, z + 200] as [number, number, number]));
    const time = (bounds?: { size: number }) => {
      let c = g;
      const t0 = performance.now();
      for (let i = 0; i < 200; i++) c = step3(c, BAYS_6567, bounds);
      return performance.now() - t0;
    };
    const small = time({ size: 500 });
    const huge = time();
    expect(huge).toBeLessThan(Math.max(60, small * 10));
  });
});

describe("the pattern library does what it says", () => {
  it("T3345 every entry is re-verified against its own claim", () => {
    // The load-bearing test. Each pattern was found by search, and this re-runs
    // it: the category, the period, and for a glider the exact displacement.
    for (const p of LIFE_3D_PATTERNS) {
      const rule = parseRule3d(p.rule);
      expect(rule, `${p.id} names an unparseable rule`).not.toBeNull();
      const f = fate3(cells3From(p.cells), rule!, 200);
      const expectedKind = p.category === "spaceship" ? "spaceship" : p.category;
      expect(f.kind, `${p.id} is a ${f.kind}, not a ${expectedKind}`).toBe(expectedKind);
      expect(f.period, `${p.id} period`).toBe(p.period);
      if (p.displacement) expect(f.displacement, `${p.id} travel`).toEqual(p.displacement);
      else expect(f.displacement, `${p.id} should not move`).toBeUndefined();
    }
  });

  it("T3346 B6/S567 has a glider — Bays' own test for a 3-D Life", () => {
    // "It should naturally produce gliders, while random soups should not simply
    // grow without bound." This is the first half, and it is why the rule is the
    // default: without a glider it would just be an interesting automaton.
    const gliders = LIFE_3D_PATTERNS.filter((p) => p.category === "spaceship" && p.rule === "B6/S567");
    expect(gliders.length).toBeGreaterThan(0);
    const g = cellsOf("glider");
    let c = g;
    for (let i = 0; i < 4; i++) c = step3(c, BAYS_6567);
    expect(sameShape3(g, c), "it should return to its own shape").toBe(true);
    expect(sameCells3(g, c), "...somewhere else").toBe(false);
    const a = boundingBox3(g)!, b = boundingBox3(c)!;
    expect([b.x - a.x, b.y - a.y, b.z - a.z]).toEqual([1, 0, 1]);
  });

  it("T3347 the glider keeps flying — it is not a four-generation coincidence", () => {
    // Twenty periods. A shape that merely happens to repeat once would not.
    const g = cellsOf("glider");
    let c = g;
    for (let i = 0; i < 80; i++) c = step3(c, BAYS_6567);
    expect(sameShape3(g, c)).toBe(true);
    const a = boundingBox3(g)!, b = boundingBox3(c)!;
    expect([b.x - a.x, b.y - a.y, b.z - a.z]).toEqual([20, 0, 20]);
  });

  it("T3348 the solid 2×2×2 cube never changes", () => {
    // Every cube in it touches exactly seven others, and 7 is a survival count.
    const cube = cellsOf("cube");
    expect(cube.size).toBe(8);
    expect(sameCells3(step3(cube, BAYS_6567), cube)).toBe(true);
  });

  it("T3349 the same glider does NOT fly under Conway's rule", () => {
    // The whole point of Bays' work: B3/S23 on 26 neighbours is a different
    // universe, and a pattern described under one rule means nothing under
    // another — which is why choosing a pattern selects its rule too.
    const conway = { birth: new Set([3]), survive: new Set([2, 3]) };
    const g = cellsOf("glider");
    let c = g;
    for (let i = 0; i < 4; i++) c = step3(c, conway);
    expect(sameShape3(g, c)).toBe(false);
  });

  it("T3350 born on three of twenty-six, a soup runs away", () => {
    // Bays: "rules allowing birth with four or fewer neighbours generally suffer
    // this sort of rapid expansion." Measured rather than asserted — the same
    // soup under B6/S567 settles or dies, and under B3/S23 it explodes.
    const soup = cells3From(randomSoup3(6, 0.4));
    const conway = { birth: new Set([3]), survive: new Set([2, 3]) };
    let a = soup, b = soup;
    for (let i = 0; i < 30; i++) {
      a = step3(a, conway);
      b = step3(b, BAYS_6567);
    }
    expect(a.size, "B3/S23 should be running away").toBeGreaterThan(soup.size * 5);
    expect(b.size, "B6/S567 should not").toBeLessThan(a.size);
  });
});

describe("the rule notation copes with 26 neighbours", () => {
  it("T3351 Bays' own spelling reads as he wrote it", () => {
    const r = parseRule3d("B6/S567")!;
    expect([...r.birth]).toEqual([6]);
    expect([...r.survive].sort((x, y) => x - y)).toEqual([5, 6, 7]);
  });

  it("T3352 counts above nine need a list or a range, and get one", () => {
    // The reason this parser is not the 2-D one: on 26 neighbours "S12" cannot
    // be told from "S1,2" by reading characters, so both spellings exist and
    // only the unambiguous one is used for anything above 9.
    // A digits-only side keeps the 2-D reading, so Bays' own B6/S567 still means
    // 5, 6 and 7 rather than five hundred and sixty-seven. "B12" is therefore 1
    // and 2 — which is why anything above nine must carry a separator, and why
    // the screen says so.
    expect([...parseRule3d("B12/S23")!.birth]).toEqual([1, 2]);
    expect([...parseRule3d("B12,/S23")!.birth], "a trailing comma makes it twelve").toEqual([12]);
    expect([...parseRule3d("B12-12/S23")!.birth], "or a degenerate range").toEqual([12]);
    expect([...parseRule3d("B6/S10-16")!.survive]).toEqual([10, 11, 12, 13, 14, 15, 16]);
    expect([...parseRule3d("B12,14/S6,7")!.birth]).toEqual([12, 14]);
    expect([...parseRule3d("B6,7/S6,7")!.birth]).toEqual([6, 7]);
    // ...and a count that cannot occur is refused rather than quietly dropped.
    // (Written with a separator, since "B27" on its own is the digits 2 and 7.)
    expect(parseRule3d("B27,/S5")).toBeNull();
    expect(parseRule3d("B6/S5-30")).toBeNull();
    expect(parseRule3d("B27/S5"), "digits-only stays the 2-D reading").not.toBeNull();
  });

  it("T3353 rubbish is refused", () => {
    for (const bad of ["", "B6", "S567", "B6S567", "hello", "B6/Sx", "B-/S5"]) {
      expect(parseRule3d(bad), bad).toBeNull();
    }
  });

  it("T3354 a rule always formats unambiguously, as a comma list", () => {
    // "567" is only readable because every count happens to be one digit. The
    // canonical form never relies on that.
    expect(formatRule3d(BAYS_6567)).toBe("B6/S5,6,7");
    expect(sameRule3d(parseRule3d("B6/S567")!, parseRule3d("B6/S5,6,7")!)).toBe(true);
    expect(sameRule3d(parseRule3d("B6/S567")!, parseRule3d("B6/S5-7")!)).toBe(true);
  });

  it("T3355 every rule in the library parses and carries a real note", () => {
    for (const e of RULE_3D_LIBRARY) {
      expect(parseRule3d(e.notation), e.name).not.toBeNull();
      expect(rule3dFor(e)).toBeTruthy();
      expect(e.note.length, `${e.name} has no note`).toBeGreaterThan(30);
    }
    expect(RULE_3D_LIBRARY[0].notation, "Bays' analogue leads").toBe("B6/S567");
    expect(RULE_3D_LIBRARY.some((e) => e.notation === "B3/S23"),
      "Conway's own is kept so the difference can be seen").toBe(true);
  });

  it("T3356 the rules panel describes the ACTIVE rule and the right neighbourhood", () => {
    const bays = describeRule3d(BAYS_6567, 26).map((r) => `${r.when} ${r.then}`).join(" ");
    expect(bays).toContain("5–7");
    expect(bays).toContain("exactly 6");
    expect(bays).toContain("26 neighbours");
    expect(describeRule3d(BAYS_6567, 6).map((r) => r.when).join(" ")).toContain("6 neighbours");
  });
});
