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

/**
 * Advance the system by `simTime` using ADAPTIVE Velocity-Verlet sub-steps.
 *
 * A fixed step conserves energy well for smooth orbits, but a close encounter /
 * slingshot spikes the force faster than a coarse `dtMax` can resolve, injecting
 * energy. Here the step shrinks with the peak acceleration (Δt ∝ √(ε/|a|max)), so
 * close passes are resolved and total energy stays bounded — while distant, slow
 * configurations still run at the full `dtMax`. Returns the final accelerations to
 * seed the next call. `guard` caps the worst-case sub-step count so a pathological
 * frame can't hang the loop.
 */
export function advance(
  bodies: Body[],
  simTime: number,
  opts: { dtMax: number; G: number; softening: number; eta?: number },
): Vec3[] {
  const { dtMax, G, softening, eta = 0.03 } = opts;
  const n = bodies.length;
  const s2 = softening * softening;
  // Generous floor purely to guarantee termination — `guard` is the real bound.
  const dtFloor = dtMax / 65536;
  let acc = accelerations(bodies, G, softening);
  let remaining = simTime;
  let guard = 0;
  while (remaining > 1e-12 && guard++ < 1_000_000) {
    // Smallest pairwise timescale — crossing time r/v and free-fall time
    // √(r³/G·M). Basing the step on these (not just the start-of-step force)
    // resolves fast fly-throughs, so total energy stays bounded.
    let tmin = dtMax / eta;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = bodies[j].pos[0] - bodies[i].pos[0];
        const dy = bodies[j].pos[1] - bodies[i].pos[1];
        const dz = bodies[j].pos[2] - bodies[i].pos[2];
        const r2 = dx * dx + dy * dy + dz * dz + s2;
        const r = Math.sqrt(r2);
        const dvx = bodies[j].vel[0] - bodies[i].vel[0];
        const dvy = bodies[j].vel[1] - bodies[i].vel[1];
        const dvz = bodies[j].vel[2] - bodies[i].vel[2];
        const v = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
        const tCross = v > 1e-9 ? r / v : Infinity;
        const tFree = Math.sqrt(r2 * r / (G * (bodies[i].mass + bodies[j].mass)));
        if (tCross < tmin) tmin = tCross;
        if (tFree < tmin) tmin = tFree;
      }
    }
    let step = Math.min(dtMax, eta * tmin, remaining);
    step = Math.max(step, Math.min(dtFloor, remaining));
    acc = verletStep(bodies, step, G, softening, acc);
    remaining -= step;
  }
  return acc;
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

/** Two-body Keplerian orbital elements from a relative state (unsoftened — a good
 *  approximation for a real binary whose separation ≫ ε). */
export function twoBodyOrbit(bi: Body, bj: Body, G: number): {
  bound: boolean; e: number; a: number; sep: number; period: number; energy: number;
} {
  const rx = bj.pos[0] - bi.pos[0], ry = bj.pos[1] - bi.pos[1], rz = bj.pos[2] - bi.pos[2];
  const vx = bj.vel[0] - bi.vel[0], vy = bj.vel[1] - bi.vel[1], vz = bj.vel[2] - bi.vel[2];
  const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const v2 = vx * vx + vy * vy + vz * vz;
  const mu = G * (bi.mass + bj.mass);
  const energy = 0.5 * v2 - mu / r;              // specific orbital energy
  // Specific angular momentum h = r × v.
  const hx = ry * vz - rz * vy, hy = rz * vx - rx * vz, hz = rx * vy - ry * vx;
  const h2 = hx * hx + hy * hy + hz * hz;
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h2) / (mu * mu)));
  const bound = energy < 0;
  const a = bound ? -mu / (2 * energy) : Infinity; // semi-major axis
  const period = bound ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity;
  return { bound, e, a, sep: r, period, energy };
}

export interface OrbitAnalysis {
  /** speed of each body relative to the cluster COM */
  speeds: number[];
  /** local escape speed √(2|Φ|) at each body */
  escapeSpeeds: number[];
  /** GENUINE escapers: unbound (speed ≥ escape speed) AND out beyond the cluster
   *  (r > escapeRadiusMult × RMS radius) AND receding. All three are required so a
   *  momentarily-fast core body isn't flagged (and, when the caller removes
   *  escapers, isn't wrongly deleted). */
  escaping: boolean[];
  /** every binary: a pair of bodies that are MUTUALLY each other's most-bound
   *  partner (and bound to each other). Disjoint by construction. */
  binaries: { i: number; j: number; e: number; sep: number; period: number }[];
  /** mean eccentricity across `binaries` (0 when there are none). */
  avgEccentricity: number;
}

/**
 * Escape analysis + binary detection.
 * Escape speed at body i is √(2|Φ_i|) with Φ_i = −Σ_{j≠i} G·m_j/√(r²+ε²) — the
 * softened potential from every OTHER body. A body genuinely escapes when it is
 * unbound, out past `escapeRadiusMult`× the RMS cluster radius, and receding.
 * A binary is a mutually-most-bound bound pair; the average eccentricity is over
 * all such pairs.
 */
export function analyse(
  bodies: Body[], G: number, softening: number,
  opts?: { escapeRadiusMult?: number; detectBinaries?: boolean },
): OrbitAnalysis {
  const n = bodies.length;
  const s2 = softening * softening;
  const escapeRadiusMult = opts?.escapeRadiusMult ?? 3;
  const detectBinaries = opts?.detectBinaries ?? true;
  const com = centreOfMass(bodies);

  // Radii from the COM + the MEDIAN radius as the cluster scale (robust — a lone
  // far escaper doesn't inflate it the way an RMS radius would).
  const rad = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const dx = bodies[i].pos[0] - com.pos[0], dy = bodies[i].pos[1] - com.pos[1], dz = bodies[i].pos[2] - com.pos[2];
    rad[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const sortedRad = [...rad].sort((a, b) => a - b);
  const median = n > 0 ? sortedRad[Math.floor(n / 2)] : 0;

  const speeds: number[] = [];
  const escapeSpeeds: number[] = [];
  const escaping: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const vx = bodies[i].vel[0] - com.vel[0], vy = bodies[i].vel[1] - com.vel[1], vz = bodies[i].vel[2] - com.vel[2];
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    let phi = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = bodies[j].pos[0] - bodies[i].pos[0];
      const dy = bodies[j].pos[1] - bodies[i].pos[1];
      const dz = bodies[j].pos[2] - bodies[i].pos[2];
      phi += -G * bodies[j].mass / Math.sqrt(dx * dx + dy * dy + dz * dz + s2);
    }
    const vesc = Math.sqrt(Math.max(0, -2 * phi));
    const px = bodies[i].pos[0] - com.pos[0], py = bodies[i].pos[1] - com.pos[1], pz = bodies[i].pos[2] - com.pos[2];
    const receding = vx * px + vy * py + vz * pz > 0;
    speeds.push(speed);
    escapeSpeeds.push(vesc);
    escaping.push(vesc > 0 && speed >= vesc && rad[i] > escapeRadiusMult * median && receding);
  }

  // Binaries: each body's most-bound partner, kept when the choice is mutual.
  const binaries: { i: number; j: number; e: number; sep: number; period: number }[] = [];
  if (detectBinaries && n >= 2) {
    const best = new Array<number>(n).fill(-1);
    for (let i = 0; i < n; i++) {
      let bi = -1, be = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = twoBodyOrbit(bodies[i], bodies[j], G);
        if (o.bound && o.energy < be) { be = o.energy; bi = j; }
      }
      best[i] = bi;
    }
    for (let i = 0; i < n; i++) {
      const j = best[i];
      if (j > i && best[j] === i) {
        const o = twoBodyOrbit(bodies[i], bodies[j], G);
        binaries.push({ i, j, e: o.e, sep: o.sep, period: o.period });
      }
    }
  }
  const avgEccentricity = binaries.length ? binaries.reduce((s, b) => s + b.e, 0) / binaries.length : 0;

  return { speeds, escapeSpeeds, escaping, binaries, avgEccentricity };
}

/** Total angular momentum L = Σ mᵢ (rᵢ × vᵢ) about the origin (= about the COM,
 *  since the COM is held at the origin). Conserved to machine precision by
 *  Velocity-Verlet because the (softened) forces are central. */
export function angularMomentum(bodies: Body[]): Vec3 {
  const L: Vec3 = [0, 0, 0];
  for (const b of bodies) {
    L[0] += b.mass * (b.pos[1] * b.vel[2] - b.pos[2] * b.vel[1]);
    L[1] += b.mass * (b.pos[2] * b.vel[0] - b.pos[0] * b.vel[2]);
    L[2] += b.mass * (b.pos[0] * b.vel[1] - b.pos[1] * b.vel[0]);
  }
  return L;
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
