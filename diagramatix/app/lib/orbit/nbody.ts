/**
 * N-body point-mass gravity — pure, deterministic, unit-testable. No rendering.
 *
 * Physics:
 *  - Newton's law with Plummer softening: a_i = Σ_{j≠i} G m_j (r_j−r_i) / (|Δ|²+ε²)^{3/2}
 *    (the softened potential −G m_i m_j / √(|Δ|²+ε²) is its exact energy partner, so
 *    energy is conserved to integrator order — used by the tests).
 *  - Velocity-Verlet (symplectic) integration: stable orbits, unlike Euler.
 *  - Initial state: uniform-random positions in a cube, centred on the COM; random
 *    velocity directions with net momentum zeroed; then optionally virial-scaled so
 *    the cluster is gravitationally bound (KE = −PE/2 ⇒ virial ratio Q = 0.5).
 */

export type Vec3 = [number, number, number];
export interface Body { mass: number; pos: Vec3; vel: Vec3 }

export type VelocityMode = "virial" | "random" | "cold";

export interface InitConfig {
  n: number;
  cubeSize: number;      // spawn-cube edge; positions drawn from [−L/2, L/2]³
  masses: number[];      // length n (caller computes per-body / random-within-bounds)
  velocityMode: VelocityMode;
  speedBound: number;    // max initial speed for "random" mode
  G: number;
  softening: number;     // ε
  seed: number;
}

/** Deterministic PRNG (mulberry32) so a seed reproduces a run exactly. */
export function makeRng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniformly-random unit vector on the sphere. */
function randUnit(rng: () => number): Vec3 {
  const u = rng() * 2 - 1;
  const theta = rng() * 2 * Math.PI;
  const r = Math.sqrt(Math.max(0, 1 - u * u));
  return [r * Math.cos(theta), r * Math.sin(theta), u];
}

/** Softened gravitational accelerations for every body. O(n²). */
export function accelerations(bodies: Body[], G: number, softening: number): Vec3[] {
  const n = bodies.length;
  const acc: Vec3[] = bodies.map(() => [0, 0, 0]);
  const s2 = softening * softening;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[j].pos[0] - bodies[i].pos[0];
      const dy = bodies[j].pos[1] - bodies[i].pos[1];
      const dz = bodies[j].pos[2] - bodies[i].pos[2];
      const r2 = dx * dx + dy * dy + dz * dz + s2;
      const inv = 1 / Math.sqrt(r2);
      const inv3 = inv * inv * inv; // 1 / (r²+ε²)^{3/2}
      const ai = G * bodies[j].mass * inv3;
      acc[i][0] += ai * dx; acc[i][1] += ai * dy; acc[i][2] += ai * dz;
      const aj = G * bodies[i].mass * inv3;
      acc[j][0] -= aj * dx; acc[j][1] -= aj * dy; acc[j][2] -= aj * dz;
    }
  }
  return acc;
}

/**
 * One Velocity-Verlet step (mutates `bodies` in place). Pass the previous step's
 * returned accelerations as `accPrev` to avoid recomputing them; returns the new
 * accelerations to feed into the next step.
 */
export function verletStep(
  bodies: Body[], dt: number, G: number, softening: number, accPrev?: Vec3[],
): Vec3[] {
  const a = accPrev ?? accelerations(bodies, G, softening);
  const half = 0.5 * dt * dt;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.pos[0] += b.vel[0] * dt + a[i][0] * half;
    b.pos[1] += b.vel[1] * dt + a[i][1] * half;
    b.pos[2] += b.vel[2] * dt + a[i][2] * half;
  }
  const a2 = accelerations(bodies, G, softening);
  const hdt = 0.5 * dt;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.vel[0] += (a[i][0] + a2[i][0]) * hdt;
    b.vel[1] += (a[i][1] + a2[i][1]) * hdt;
    b.vel[2] += (a[i][2] + a2[i][2]) * hdt;
  }
  return a2;
}

/** Kinetic, (softened) potential, and total energy — for diagnostics + tests. */
export function energy(bodies: Body[], G: number, softening: number): { ke: number; pe: number; total: number } {
  let ke = 0;
  for (const b of bodies) ke += 0.5 * b.mass * (b.vel[0] ** 2 + b.vel[1] ** 2 + b.vel[2] ** 2);
  let pe = 0;
  const s2 = softening * softening;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[j].pos[0] - bodies[i].pos[0];
      const dy = bodies[j].pos[1] - bodies[i].pos[1];
      const dz = bodies[j].pos[2] - bodies[i].pos[2];
      pe += -G * bodies[i].mass * bodies[j].mass / Math.sqrt(dx * dx + dy * dy + dz * dz + s2);
    }
  }
  return { ke, pe, total: ke + pe };
}

/** Mass-weighted centre-of-mass position + velocity. */
export function centreOfMass(bodies: Body[]): { pos: Vec3; vel: Vec3 } {
  let M = 0; const p: Vec3 = [0, 0, 0]; const v: Vec3 = [0, 0, 0];
  for (const b of bodies) {
    M += b.mass;
    for (let k = 0; k < 3; k++) { p[k] += b.mass * b.pos[k]; v[k] += b.mass * b.vel[k]; }
  }
  if (M > 0) for (let k = 0; k < 3; k++) { p[k] /= M; v[k] /= M; }
  return { pos: p, vel: v };
}

/** Scale all velocities so the cluster sits at virial equilibrium (KE = −PE/2). */
function virialScale(bodies: Body[], G: number, softening: number): void {
  const { ke, pe } = energy(bodies, G, softening);
  if (ke <= 0 || pe >= 0) return;
  const s = Math.sqrt(-0.5 * pe / ke);
  for (const b of bodies) { b.vel[0] *= s; b.vel[1] *= s; b.vel[2] *= s; }
}

/** Build the initial cluster from a config (deterministic given `seed`). */
export function initBodies(cfg: InitConfig): Body[] {
  const rng = makeRng(cfg.seed);
  const L = cfg.cubeSize;
  const bodies: Body[] = [];
  for (let i = 0; i < cfg.n; i++) {
    bodies.push({
      mass: cfg.masses[i] ?? 1,
      pos: [(rng() - 0.5) * L, (rng() - 0.5) * L, (rng() - 0.5) * L],
      vel: [0, 0, 0],
    });
  }

  // Centre positions on the COM so the cluster starts at the origin.
  const com = centreOfMass(bodies);
  for (const b of bodies) for (let k = 0; k < 3; k++) b.pos[k] -= com.pos[k];

  if (cfg.velocityMode !== "cold") {
    for (const b of bodies) {
      const dir = randUnit(rng);
      // "random": real magnitude now; "virial": unit magnitude, rescaled below.
      const speed = cfg.velocityMode === "random" ? rng() * cfg.speedBound : 1;
      b.vel = [dir[0] * speed, dir[1] * speed, dir[2] * speed];
    }
    // Zero the net momentum so the whole cluster doesn't drift off-screen.
    const cv = centreOfMass(bodies).vel;
    for (const b of bodies) for (let k = 0; k < 3; k++) b.vel[k] -= cv[k];
    if (cfg.velocityMode === "virial") virialScale(bodies, cfg.G, cfg.softening);
  }

  return bodies;
}

/** Bright per-body colour: the caller's picks for the first `perBody.length` (≤10),
 *  then evenly spread across the hue wheel for auto-generated bodies. Returns hex. */
export function bodyColour(index: number, total: number, perBody: string[]): string {
  if (index < perBody.length) return perBody[index];
  const hue = (index / Math.max(1, total)) * 360;
  return hslToHex(hue, 85, 60);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
