/**
 * Find long-lived 3-D patterns by COLLIDING things, not by stirring soup.
 *
 *   npx tsx scripts/find-3d-collisions.ts [--rule B6/S567] [--min 40]
 *
 * The soup search (find-3d-methuselahs.ts) answered its own question and the
 * answer was no: across 5,000 random soups under B6/S567, from 4³ up to 12³ and
 * from 30% to 60% dense, the longest anything took to settle was 42 generations
 * and roughly one seed in 250 left a glider behind. There is no 3-D acorn to be
 * stumbled on that way.
 *
 * That is not a failure of the search — it is the rule doing what Bays chose it
 * for. He wanted a rule where soups DO NOT run away, and a rule that settles in
 * tens of generations is exactly that. The 2-D methuselahs live so long because
 * B3/S23 sits much closer to the edge of chaos.
 *
 * So the long-lived patterns have to be built rather than found: a glider
 * running into something is the classic way one arises, and the space of
 * collisions is small enough to search exhaustively. Every offset of a glider
 * against a still life, and of a glider against another glider, at every phase.
 */
import fs from "node:fs";
import path from "node:path";
import {
  cells3From, step3, decay3, canonical3, boundingBox3, translate3, x3, y3, z3, type Cells3,
} from "../app/lib/life/engine3d";
import { parseRule3d } from "../app/lib/life/rules3d";
import { LIFE_3D_PATTERNS } from "../app/lib/life/patterns3d";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ruleText = arg("--rule", "B6/S567");
const minLife = Number(arg("--min", "40"));
const rule = parseRule3d(ruleText);
if (!rule) { console.error(`not a rule: ${ruleText}`); process.exit(1); }

const cellsOf = (id: string) => {
  const p = LIFE_3D_PATTERNS.find((x) => x.id === id);
  if (!p) { console.error(`no pattern ${id}`); process.exit(1); }
  return cells3From(p.cells);
};

const glider = cellsOf("glider");
const cube = cellsOf("cube");
const chipped = cellsOf("chipped-cube");
const slab = cellsOf("slab");

/** The glider at each of its four phases — a collision depends on which. */
const phases: Cells3[] = [];
{
  let c = glider;
  for (let i = 0; i < 4; i++) { phases.push(c); c = step3(c, rule); }
}

interface Hit { seed: Cells3; settled: number; peak: number; gliders: number; stills: number; oscillators: number; what: string }
const hits: Hit[] = [];
const seen = new Set<string>();
let tried = 0;

const consider = (seed: Cells3, what: string) => {
  tried++;
  const d = decay3(seed, rule, 4000, 80);
  if (d.population === 0 || d.gaveUp || d.gliders === 0 || d.settled < minLife) return;
  const key = canonical3(seed);
  if (seen.has(key)) return;
  seen.add(key);
  hits.push({ seed, settled: d.settled, peak: d.peakPopulation, gliders: d.gliders, stills: d.stills, oscillators: d.oscillators, what });
};

// ── A glider into a stationary object ────────────────────────────────────
const targets: [string, Cells3][] = [["cube", cube], ["chipped cube", chipped], ["slab", slab]];
for (const [name, target] of targets) {
  for (let p = 0; p < 4; p++) {
    for (let dx = -6; dx <= 6; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dz = -6; dz <= 6; dz++) {
          const g = translate3(phases[p], dx, dy, dz);
          // Overlapping the two is not a collision, it is a different object.
          let clash = false;
          for (const k of g) if (target.has(k)) { clash = true; break; }
          if (clash) continue;
          consider(new Set([...g, ...target]), `glider (phase ${p}) into ${name} at (${dx},${dy},${dz})`);
        }
      }
    }
  }
}

// ── Two gliders into each other ──────────────────────────────────────────
// The second is mirrored so the two actually approach; two travelling the same
// way never meet.
const mirror = (c: Cells3): Cells3 => {
  const b = boundingBox3(c)!;
  const out: Cells3 = new Set();
  for (const k of c) {
    const e = require("../app/lib/life/engine3d");
    out.add(e.pack3(b.x + b.width - 1 - (x3(k) - b.x), y3(k), b.z + b.depth - 1 - (z3(k) - b.z)));
  }
  return out;
};
for (let p = 0; p < 4; p++) {
  for (let q = 0; q < 4; q++) {
    const other = mirror(phases[q]);
    for (let dx = 3; dx <= 10; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dz = 3; dz <= 10; dz++) {
          const b = translate3(other, dx, dy, dz);
          let clash = false;
          for (const k of b) if (phases[p].has(k)) { clash = true; break; }
          if (clash) continue;
          consider(new Set([...phases[p], ...b]), `glider (phase ${p}) meets glider (phase ${q}) at (${dx},${dy},${dz})`);
        }
      }
    }
  }
}

hits.sort((a, b) => b.settled - a.settled || a.seed.size - b.seed.size);
console.log(`\nrule ${ruleText} — ${tried} collisions tried`);
console.log(`${hits.length} that live past generation ${minLife} AND leave a glider:\n`);
for (const h of hits.slice(0, 20)) {
  const b = boundingBox3(h.seed)!;
  console.log(
    `  ${String(h.seed.size).padStart(3)} cubes  ${b.width}x${b.height}x${b.depth}` +
    `  settles at ${String(h.settled).padStart(4)}  peak ${String(h.peak).padStart(4)}` +
    `  leaves ${h.gliders}g ${h.stills}s ${h.oscillators}o   ${h.what}`);
}

const out = hits.slice(0, 12).map((h) => {
  const b = boundingBox3(h.seed)!;
  return {
    what: h.what,
    cells: [...h.seed].map((k) => [x3(k) - b.x, y3(k) - b.y, z3(k) - b.z]),
    size: [b.width, b.height, b.depth],
    settled: h.settled, peak: h.peak,
    gliders: h.gliders, stills: h.stills, oscillators: h.oscillators,
  };
});
const file = path.join(process.cwd(), "scripts", `3d-coll-${ruleText.replace(/[^A-Za-z0-9]/g, "")}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`\nwrote ${file}`);
