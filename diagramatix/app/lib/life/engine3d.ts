/**
 * Life on an infinite cubic lattice.
 *
 * Paul, 2026-09-07: "each little cube is either alive or dead… In a cubic 3-D
 * grid, the direct analogue is a 3 × 3 × 3 block around the cell: 6 neighbours
 * sharing a face, 12 sharing an edge, 8 touching at a corner. That gives 26
 * neighbours altogether."
 *
 * SPARSE, for the same reason the 2-D engine is: he suggested `cell[x][y][z]` on
 * a 100 × 100 × 100 grid, which is a million cells — and a dense array would
 * visit every one of them every generation, whether or not anything is happening
 * in it. Storing only the live cells makes a generation cost 27 × the population
 * instead, so a hundred-cell glider costs 2,700 lookups whatever the volume, and
 * the lattice can be genuinely unbounded rather than a million-cell box.
 *
 * And the rule is data, exactly as in two dimensions — the only differences are
 * the neighbourhood and the fact that the counts now run to 26, which is why the
 * notation has to be read more carefully than "each character is a digit".
 */
import type { Rule } from "./rules";

/**
 * A cell packed into one integer.
 *
 * Three coordinates in 31 bits means about ±512 per axis, which is a 1024-cube:
 * bigger than the 100-cube Paul suggested by a factor of a thousand in volume,
 * and small enough that keys stay SMIs and Set lookups stay fast. A pattern that
 * escapes that is not being watched any more.
 */
const OFF = 512;
const SPAN = 1024;
export const MIN3 = -OFF;
export const MAX3 = OFF - 1;

export const pack3 = (x: number, y: number, z: number): number =>
  ((x + OFF) * SPAN + (y + OFF)) * SPAN + (z + OFF);
export const x3 = (k: number): number => Math.floor(k / (SPAN * SPAN)) - OFF;
export const y3 = (k: number): number => (Math.floor(k / SPAN) % SPAN) - OFF;
export const z3 = (k: number): number => (k % SPAN) - OFF;

export type Cells3 = Set<number>;

export interface Bounds3 { size: number }

export function cells3From(coords: [number, number, number][]): Cells3 {
  return new Set(coords.map(([x, y, z]) => pack3(x, y, z)));
}

export function coords3Of(cells: Cells3): [number, number, number][] {
  return [...cells].map((k) => [x3(k), y3(k), z3(k)] as [number, number, number]);
}

/**
 * The 26 offsets of the Moore neighbourhood, precomputed.
 *
 * Rebuilding this triple loop inside the per-cell loop is the difference between
 * a generation that runs and one that crawls: it is entered once per live cell,
 * millions of times over a long run.
 */
const NEIGHBOURS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        out.push([dx, dy, dz]);
      }
    }
  }
  return out;
})();

/**
 * The 6 face-sharing offsets — the other neighbourhood Paul mentions.
 *
 * "Another possible 3-D neighbourhood uses only the 6 face-sharing cells." A
 * different neighbourhood is a different universe, not a different rule: B6/S567
 * means nothing when only six neighbours exist, so the two are never mixed.
 */
const FACES: [number, number, number][] =
  [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export type Neighbourhood = "moore" | "faces";

export const NEIGHBOUR_COUNT: Record<Neighbourhood, number> = { moore: 26, faces: 6 };

/**
 * One generation.
 *
 * `bounds` is a CULL, not a wrap, as in two dimensions: outside the cube is
 * dead. Absent, the lattice is infinite and a glider flies until it leaves the
 * addressable range.
 */
export function step3(
  cells: Cells3,
  rule: Rule,
  bounds?: Bounds3,
  neighbourhood: Neighbourhood = "moore",
): Cells3 {
  const offsets = neighbourhood === "faces" ? FACES : NEIGHBOURS;
  const counts = new Map<number, number>();
  const lo = bounds ? 0 : MIN3;
  const hi = bounds ? bounds.size - 1 : MAX3;

  for (const k of cells) {
    const x = x3(k), y = y3(k), z = z3(k);
    for (const [dx, dy, dz] of offsets) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < lo || nx > hi || ny < lo || ny > hi || nz < lo || nz > hi) continue;
      const nk = pack3(nx, ny, nz);
      counts.set(nk, (counts.get(nk) ?? 0) + 1);
    }
  }

  const next: Cells3 = new Set();
  for (const [k, n] of counts) {
    const alive = cells.has(k);
    if (alive ? rule.survive.has(n) : rule.birth.has(n)) next.add(k);
  }
  // A live cell with no live neighbours never reaches the tally, so a rule that
  // lets it survive on zero has to carry it across explicitly — the same case
  // Life Without Death exposes in two dimensions.
  if (rule.survive.has(0)) {
    for (const k of cells) if (!counts.has(k)) next.add(k);
  }
  return next;
}

export function boundingBox3(cells: Cells3) {
  if (cells.size === 0) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const k of cells) {
    const x = x3(k), y = y3(k), z = z3(k);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return {
    x: minX, y: minY, z: minZ,
    width: maxX - minX + 1, height: maxY - minY + 1, depth: maxZ - minZ + 1,
  };
}

export function translate3(cells: Cells3, dx: number, dy: number, dz: number): Cells3 {
  const out: Cells3 = new Set();
  for (const k of cells) out.add(pack3(x3(k) + dx, y3(k) + dy, z3(k) + dz));
  return out;
}

/** Same cells in the same arrangement, wherever they sit — how a glider is spotted. */
export function sameShape3(a: Cells3, b: Cells3): boolean {
  if (a.size !== b.size || a.size === 0) return a.size === b.size;
  const ba = boundingBox3(a)!, bb = boundingBox3(b)!;
  if (ba.width !== bb.width || ba.height !== bb.height || ba.depth !== bb.depth) return false;
  const shifted = translate3(a, bb.x - ba.x, bb.y - ba.y, bb.z - ba.z);
  for (const k of shifted) if (!b.has(k)) return false;
  return true;
}

export function sameCells3(a: Cells3, b: Cells3): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

/** Normalised to the origin, so two copies of one object compare equal. */
export function canonical3(cells: Cells3): string {
  const b = boundingBox3(cells);
  if (!b) return "";
  return [...translate3(cells, -b.x, -b.y, -b.z)].sort((p, q) => p - q).join(",");
}

export interface Fate3 {
  /** `extinct`, `still`, `oscillator`, `spaceship`, or `growing` if it never repeats. */
  kind: "extinct" | "still" | "oscillator" | "spaceship" | "growing";
  /** Generations until the repeat, 0 when it repeats immediately. */
  generation: number;
  /** 1 for a still life, n for an oscillator or a spaceship. */
  period: number;
  /** How far a spaceship moved in one period. */
  displacement?: [number, number, number];
  population: number;
  peakPopulation: number;
}

/**
 * Run a pattern until it repeats itself, and say what it turned out to be.
 *
 * Compares SHAPES rather than positions, so a spaceship is recognised as a
 * spaceship rather than mistaken for something that never settles — which is
 * exactly the distinction Bays used to judge whether a 3-D rule deserved to be
 * called an analogue of Life, and the reason this returns the displacement.
 */
export function fate3(
  start: Cells3, rule: Rule, limit = 200, neighbourhood: Neighbourhood = "moore",
): Fate3 {
  const seen = new Map<string, { gen: number; box: { x: number; y: number; z: number } }>();
  let cells = start;
  let peak = cells.size;
  const b0 = boundingBox3(cells);
  seen.set(canonical3(cells), { gen: 0, box: b0 ? { x: b0.x, y: b0.y, z: b0.z } : { x: 0, y: 0, z: 0 } });

  for (let gen = 1; gen <= limit; gen++) {
    cells = step3(cells, rule, undefined, neighbourhood);
    peak = Math.max(peak, cells.size);
    if (cells.size === 0) {
      return { kind: "extinct", generation: gen, period: 0, population: 0, peakPopulation: peak };
    }
    const key = canonical3(cells);
    const before = seen.get(key);
    if (before) {
      const box = boundingBox3(cells)!;
      const d: [number, number, number] = [box.x - before.box.x, box.y - before.box.y, box.z - before.box.z];
      const moved = d[0] !== 0 || d[1] !== 0 || d[2] !== 0;
      const period = gen - before.gen;
      return {
        kind: moved ? "spaceship" : period === 1 ? "still" : "oscillator",
        generation: before.gen, period,
        ...(moved ? { displacement: d } : {}),
        population: cells.size, peakPopulation: peak,
      };
    }
    const box = boundingBox3(cells)!;
    seen.set(key, { gen, box: { x: box.x, y: box.y, z: box.z } });
  }
  return { kind: "growing", generation: limit, period: 0, population: cells.size, peakPopulation: peak };
}

/**
 * Split a population into the objects it is actually made of.
 *
 * Two cubes belong to the same object when they touch — including at a corner,
 * because the neighbourhood is what decides whether one can affect the other,
 * and under the Moore neighbourhood a corner-toucher can.
 *
 * This is how a glider is spotted inside the debris of a long run: the final
 * state of a methuselah is not one thing, it is a scattering of still lifes,
 * oscillators and whatever is flying away, and each has to be judged on its own.
 */
export function components3(cells: Cells3, neighbourhood: Neighbourhood = "moore"): Cells3[] {
  const offsets = neighbourhood === "faces" ? FACES : NEIGHBOURS;
  const unseen = new Set(cells);
  const out: Cells3[] = [];
  while (unseen.size) {
    const root = unseen.values().next().value as number;
    unseen.delete(root);
    const comp: Cells3 = new Set([root]);
    const stack = [root];
    while (stack.length) {
      const k = stack.pop()!;
      const x = x3(k), y = y3(k), z = z3(k);
      for (const [dx, dy, dz] of offsets) {
        const nk = pack3(x + dx, y + dy, z + dz);
        if (!unseen.has(nk)) continue;
        unseen.delete(nk);
        comp.add(nk);
        stack.push(nk);
      }
    }
    out.push(comp);
  }
  return out;
}

/**
 * Run a pattern out and report what it LEAVES — the 3-D methuselah question.
 *
 * Paul, 2026-09-07: "Add any long life 3-D Life patterns that eventually decay
 * to one or more gliders."
 *
 * The population going quiet is the settling point, exactly as in two
 * dimensions: escaping gliders keep it constant while they fly, and everything
 * else has stopped changing. At that moment the state is split into its separate
 * objects and each is judged on its own, because a glider inside a field of
 * debris is invisible to any test applied to the whole.
 */
export interface Decay3 {
  /** The generation after which the population never changed again. */
  settled: number;
  peakPopulation: number;
  population: number;
  /** Objects the run left behind, and how many of them fly. */
  gliders: number;
  stills: number;
  oscillators: number;
  /** True when it never went quiet inside the limit. */
  gaveUp: boolean;
}

export function decay3(
  start: Cells3, rule: Rule, limit = 2000, quiet = 60, neighbourhood: Neighbourhood = "moore",
): Decay3 {
  let cells = start;
  let pop = cells.size, peak = cells.size, last = 0, g = 0;
  for (g = 1; g <= limit; g++) {
    cells = step3(cells, rule, undefined, neighbourhood);
    peak = Math.max(peak, cells.size);
    if (cells.size !== pop) { pop = cells.size; last = g; }
    if (cells.size === 0) break;
    if (g - last >= quiet) break;
  }
  let gliders = 0, stills = 0, oscillators = 0;
  for (const comp of components3(cells, neighbourhood)) {
    const f = fate3(comp, rule, 40, neighbourhood);
    if (f.kind === "spaceship") gliders++;
    else if (f.kind === "still") stills++;
    else if (f.kind === "oscillator") oscillators++;
  }
  return { settled: last, peakPopulation: peak, population: pop, gliders, stills, oscillators, gaveUp: g > limit };
}
