/**
 * Find 3-D methuselahs — long-lived seeds that end up throwing off gliders.
 *
 *   npx tsx scripts/find-3d-methuselahs.ts [--rule B6/S567] [--seeds 40000] [--min 60]
 *
 * Paul, 2026-09-07: "Add any long life 3-D Life patterns that eventually decay
 * to one or more gliders."
 *
 * The 2-D methuselahs are famous BY NAME — the acorn, the R-pentomino — and
 * their figures are published, so a library of them can be transcribed and
 * checked. There is no such list for the cubic lattice, so these are found the
 * same way the gliders were: run seeds, measure what happens, keep what
 * qualifies.
 *
 * Two things have to be true at once, and the second is the hard one:
 *
 *   - it lives a long time. The population is still changing well after a small
 *     object would have settled.
 *   - it LEAVES a glider. That cannot be tested on the whole final state — a
 *     glider inside a field of debris is invisible to any test applied to
 *     everything at once — so the state is split into its separate objects and
 *     each is run on its own to see whether it flies.
 */
import fs from "node:fs";
import path from "node:path";
import {
  cells3From, decay3, canonical3, boundingBox3, type Cells3,
} from "../app/lib/life/engine3d";
import { parseRule3d } from "../app/lib/life/rules3d";
import { randomSoup3 } from "../app/lib/life/patterns3d";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ruleText = arg("--rule", "B6/S567");
const seeds = Number(arg("--seeds", "40000"));
const minLife = Number(arg("--min", "60"));
const rule = parseRule3d(ruleText);
if (!rule) { console.error(`not a rule: ${ruleText}`); process.exit(1); }

interface Hit {
  cells: Cells3;
  settled: number;
  peak: number;
  population: number;
  gliders: number;
  stills: number;
  oscillators: number;
  key: string;
}

const hits: Hit[] = [];
const seen = new Set<string>();
let tried = 0, died = 0, never = 0, noGlider = 0;

for (let i = 0; i < seeds; i++) {
  // Bigger and denser than the glider search used. A methuselah needs enough
  // material to make a mess before it tidies itself up, and a four-cube box
  // simply cannot: under B6/S567 nothing is born without six live neighbours.
  const box = 4 + Math.floor(Math.random() * 3);
  const seed = cells3From(randomSoup3(box, 0.4 + Math.random() * 0.25));
  if (seed.size < 12) continue;
  tried++;

  const d = decay3(seed, rule, 3000, 60);
  if (d.population === 0) { died++; continue; }
  if (d.gaveUp) { never++; continue; }
  if (d.gliders === 0) { noGlider++; continue; }
  if (d.settled < minLife) continue;

  const key = canonical3(seed);
  if (seen.has(key)) continue;
  seen.add(key);
  hits.push({
    cells: seed, settled: d.settled, peak: d.peakPopulation, population: d.population,
    gliders: d.gliders, stills: d.stills, oscillators: d.oscillators, key,
  });
}

hits.sort((a, b) => b.settled - a.settled || a.cells.size - b.cells.size);

console.log(`\nrule ${ruleText} — ${tried} seeds; ${died} died out, ${never} never settled, ${noGlider} left no glider`);
console.log(`${hits.length} that live past generation ${minLife} AND leave a glider:\n`);
for (const h of hits.slice(0, 20)) {
  const b = boundingBox3(h.cells)!;
  console.log(
    `  ${String(h.cells.size).padStart(3)} cubes  ${b.width}x${b.height}x${b.depth}` +
    `  settles at ${String(h.settled).padStart(4)}  peak ${String(h.peak).padStart(4)}` +
    `  leaves ${h.gliders} glider(s), ${h.stills} still, ${h.oscillators} osc`);
}

const out = hits.slice(0, 10).map((h) => {
  const b = boundingBox3(h.cells)!;
  return {
    cells: [...h.cells].map((k) => {
      const e = require("../app/lib/life/engine3d");
      return [e.x3(k) - b.x, e.y3(k) - b.y, e.z3(k) - b.z];
    }),
    size: [b.width, b.height, b.depth],
    settled: h.settled, peak: h.peak, population: h.population,
    gliders: h.gliders, stills: h.stills, oscillators: h.oscillators,
  };
});
const file = path.join(process.cwd(), "scripts", `3d-meth-${ruleText.replace(/[^A-Za-z0-9]/g, "")}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`\nwrote ${file}`);
