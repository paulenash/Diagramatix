/**
 * N-body physics core — the Velocity-Verlet integrator + virial initialisation.
 * These pin the properties that make the sim behave: energy is conserved, the
 * cluster starts centred + momentum-free at virial equilibrium, and a run is
 * reproducible from its seed.
 */
import { describe, it, expect } from "vitest";
import {
  initBodies, verletStep, energy, centreOfMass, bodyColour, makeRng,
  type InitConfig, type Vec3,
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
