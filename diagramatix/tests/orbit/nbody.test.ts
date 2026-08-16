/**
 * N-body physics core — the Velocity-Verlet integrator + virial initialisation.
 * These pin the properties that make the sim behave: energy is conserved, the
 * cluster starts centred + momentum-free at virial equilibrium, and a run is
 * reproducible from its seed.
 */
import { describe, it, expect } from "vitest";
import {
  initBodies, verletStep, advance, energy, centreOfMass, bodyColour, makeRng,
  analyse, twoBodyOrbit,
  type InitConfig, type Vec3, type Body,
} from "@/app/lib/orbit/nbody";

const cfg = (over: Partial<InitConfig> = {}): InitConfig => ({
  n: 4, cubeSize: 2, masses: [1, 1, 1, 1], velocityMode: "virial",
  speedBound: 1, G: 1, softening: 0.25, seed: 42, ...over,
});

const mag = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

describe("nbody — initialisation", () => {
  it("is deterministic for a given seed", () => {
    expect(initBodies(cfg())).toEqual(initBodies(cfg()));
  });

  it("centres the cluster on the origin and zeroes net momentum", () => {
    const b = initBodies(cfg());
    const com = centreOfMass(b);
    expect(mag(com.pos)).toBeLessThan(1e-9);
    expect(mag(com.vel)).toBeLessThan(1e-9); // momentum / totalMass
  });

  it("virial mode puts the cluster at KE = −PE/2 (Q = 0.5)", () => {
    const b = initBodies(cfg({ velocityMode: "virial" }));
    const { ke, pe } = energy(b, 1, 0.25);
    expect(ke / -pe).toBeCloseTo(0.5, 6);
  });

  it("cold mode starts at rest", () => {
    const b = initBodies(cfg({ velocityMode: "cold" }));
    expect(energy(b, 1, 0.25).ke).toBe(0);
  });
});

describe("nbody — integration", () => {
  it("conserves total energy under Velocity-Verlet", () => {
    const b = initBodies(cfg({ n: 5, masses: [2, 1, 1, 1, 1], seed: 7 }));
    const e0 = energy(b, 1, 0.25).total;
    let acc: Vec3[] | undefined;
    for (let s = 0; s < 400; s++) acc = verletStep(b, 0.004, 1, 0.25, acc);
    const e1 = energy(b, 1, 0.25).total;
    // Symplectic ⇒ bounded drift; comfortably under 2% for these params.
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(0.02);
  });

  it("keeps net momentum ~zero as it evolves", () => {
    const b = initBodies(cfg({ seed: 3 }));
    let acc: Vec3[] | undefined;
    for (let s = 0; s < 200; s++) acc = verletStep(b, 0.005, 1, 0.25, acc);
    expect(mag(centreOfMass(b).vel)).toBeLessThan(1e-9);
  });
});

describe("nbody — adaptive advance conserves energy through close encounters", () => {
  // A near-head-on slingshot: a light body whips past a heavy one with a tiny
  // impact parameter — the case a fixed coarse step mishandles.
  const scenario = (): Body[] => [
    { mass: 10, pos: [-1, 0, 0], vel: [0.5, 0, 0] },
    { mass: 1, pos: [1, 0.05, 0], vel: [-1.5, 0, 0] },
  ];
  const G = 1, soft = 0.05, dtMax = 0.05, frames = 90;

  it("total energy drifts <1% across the encounter", () => {
    const b = scenario();
    const e0 = energy(b, G, soft).total;
    for (let f = 0; f < frames; f++) advance(b, dtMax, { dtMax, G, softening: soft });
    expect(Math.abs((energy(b, G, soft).total - e0) / e0)).toBeLessThan(0.01);
  });

  it("resolves the close pass far better than an equal fixed coarse step", () => {
    const a = scenario(); const e0 = energy(a, G, soft).total;
    for (let f = 0; f < frames; f++) advance(a, dtMax, { dtMax, G, softening: soft });
    const driftAdaptive = Math.abs((energy(a, G, soft).total - e0) / e0);

    const c = scenario();
    let acc: Vec3[] | undefined;
    for (let s = 0; s < frames; s++) acc = verletStep(c, dtMax, G, soft, acc); // same total time, one coarse step/frame
    const driftFixed = Math.abs((energy(c, G, soft).total - e0) / e0);

    expect(driftAdaptive).toBeLessThan(driftFixed);
  });

  it("is deterministic", () => {
    const a = scenario(), b = scenario();
    for (let f = 0; f < 20; f++) { advance(a, dtMax, { dtMax, G, softening: soft }); advance(b, dtMax, { dtMax, G, softening: soft }); }
    expect(a).toEqual(b);
  });
});

describe("nbody — two-body orbit", () => {
  const G = 1;
  it("a circular orbit has eccentricity ≈ 0", () => {
    const v = Math.SQRT2 / 2; // each body's speed for a circular relative orbit (mu=2, d=1)
    const o = twoBodyOrbit(
      { mass: 1, pos: [-0.5, 0, 0], vel: [0, -v, 0] },
      { mass: 1, pos: [0.5, 0, 0], vel: [0, v, 0] }, G);
    expect(o.bound).toBe(true);
    expect(o.e).toBeLessThan(0.02);
    expect(o.a).toBeCloseTo(1, 3);
  });
  it("a radial (head-on) orbit has eccentricity ≈ 1", () => {
    const o = twoBodyOrbit(
      { mass: 1, pos: [-0.5, 0, 0], vel: [0.1, 0, 0] },
      { mass: 1, pos: [0.5, 0, 0], vel: [-0.1, 0, 0] }, G);
    expect(o.bound).toBe(true);
    expect(o.e).toBeGreaterThan(0.99);
  });
  it("a fast pair is unbound (e > 1)", () => {
    const o = twoBodyOrbit(
      { mass: 1, pos: [-0.5, 0, 0], vel: [0, -3, 0] },
      { mass: 1, pos: [0.5, 0, 0], vel: [0, 3, 0] }, G);
    expect(o.bound).toBe(false);
    expect(o.e).toBeGreaterThan(1);
  });
});

describe("nbody — escape + binary analysis", () => {
  const G = 1, soft = 0.05;
  // Heavy centre, one slow bound satellite, one fast escaper receding radially.
  const system = (): Body[] => [
    { mass: 20, pos: [0, 0, 0], vel: [0, 0, 0] },
    { mass: 1, pos: [0.5, 0, 0], vel: [0, 1, 0] },
    { mass: 1, pos: [5, 0, 0], vel: [6, 0, 0] },
  ];
  it("flags only a genuine escaper (unbound + far + receding)", () => {
    const a = analyse(system(), G, soft);
    expect(a.escaping).toEqual([false, false, true]);
    expect(a.speeds[2]).toBeGreaterThan(a.escapeSpeeds[2]); // escaper is unbound
    expect(a.speeds[1]).toBeLessThan(a.escapeSpeeds[1]);    // satellite is bound
  });
  it("does NOT flag an unbound-but-inbound body (not receding)", () => {
    const s = system();
    s[2].vel = [-6, 0, 0]; // fast, far, but heading back toward the cluster
    expect(analyse(s, G, soft).escaping[2]).toBe(false);
  });
  it("reports the bound pair as a binary with eccentricity 0 < e < 1", () => {
    const a = analyse(system(), G, soft);
    expect(a.binaries).toHaveLength(1);
    expect(new Set([a.binaries[0].i, a.binaries[0].j])).toEqual(new Set([0, 1]));
    expect(a.binaries[0].e).toBeGreaterThan(0);
    expect(a.binaries[0].e).toBeLessThan(1);
    expect(a.avgEccentricity).toBeCloseTo(a.binaries[0].e, 10);
  });
  it("counts multiple binaries and averages their eccentricity", () => {
    // Two well-separated circular pairs → two binaries, each e ≈ 0.
    const v = Math.SQRT2 / 2; // circular relative speed for m=1,d=1 (mu=2)
    const pair = (x: number): Body[] => [
      { mass: 1, pos: [x - 0.5, 0, 0], vel: [0, -v, 0] },
      { mass: 1, pos: [x + 0.5, 0, 0], vel: [0, v, 0] },
    ];
    const a = analyse([...pair(-8), ...pair(8)], G, soft);
    expect(a.binaries).toHaveLength(2);
    expect(a.avgEccentricity).toBeLessThan(0.05);
  });
});

describe("nbody — colours", () => {
  it("uses the caller's picks for the first bodies, then spreads across the hue wheel", () => {
    const picks = ["#ff0000", "#00ff00"];
    expect(bodyColour(0, 6, picks)).toBe("#ff0000");
    expect(bodyColour(1, 6, picks)).toBe("#00ff00");
    // auto-generated bodies get a valid bright hex
    expect(bodyColour(4, 6, picks)).toMatch(/^#[0-9a-f]{6}$/);
    expect(bodyColour(5, 6, picks)).not.toBe(bodyColour(4, 6, picks));
  });
});

describe("nbody — rng", () => {
  it("makeRng is deterministic and in [0,1)", () => {
    const r1 = makeRng(99), r2 = makeRng(99);
    for (let i = 0; i < 100; i++) {
      const v = r1();
      expect(v).toBe(r2());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
