/**
 * Find 3-D Life patterns by running them, not by remembering them.
 *
 *   npx tsx scripts/find-3d-life-patterns.ts [--rule B6/S567] [--seeds 200000]
 *
 * The 2-D library could be transcribed from published ASCII art and then CHECKED
 * against published figures — the R-pentomino's 1,103 generations, the acorn's
 * 5,206 — so a typo could not survive. Nothing equivalent exists for the cubic
 * lattice at hand: Bays' patterns are published as coordinate lists in papers,
 * and a half-remembered coordinate list is exactly the kind of thing that
 * produces a library full of shapes that die in four generations while claiming
 * to be gliders.
 *
 * So the patterns are SEARCHED FOR. Random small seeds are run under the rule
 * and classified by what they actually do — extinct, still, oscillator,
 * spaceship — and whatever the search finds is what goes in the library, with
 * its measured period and displacement. Nothing is claimed that was not seen.
 */
import fs from "node:fs";
import path from "node:path";
import {
  cells3From, fate3, canonical3, boundingBox3, translate3, type Cells3, type Fate3,
} from "../app/lib/life/engine3d";
import { parseRule3d, RULE_3D_LIBRARY } from "../app/lib/life/rules3d";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ruleText = arg("--rule", "B6/S567");
const seeds = Number(arg("--seeds", "120000"));
const rule = parseRule3d(ruleText);
if (!rule) { console.error(`not a rule: ${ruleText}`); process.exit(1); }

/** A random blob inside a small box — the shape a hand-built seed would be. */
function randomSeed(box: number, fill: number): Cells3 {
  const out: [number, number, number][] = [];
  for (let x = 0; x < box; x++) {
    for (let y = 0; y < box; y++) {
      for (let z = 0; z < box; z++) {
        if (Math.random() < fill) out.push([x, y, z]);
      }
    }
  }
  return cells3From(out);
}

interface Found { kind: Fate3["kind"]; key: string; cells: Cells3; fate: Fate3 }

const best = new Map<string, Found>();
let tried = 0, extinct = 0, growing = 0;

for (let i = 0; i < seeds; i++) {
  // Small boxes and middling fills: a 6/567 universe needs six neighbours to
  // bring anything to life, so a sparse seed simply dies and a dense one is a
  // solid block. 3–5 cubes at 35–60% is where the interesting things live.
  const box = 3 + Math.floor(Math.random() * 3);
  const fill = 0.35 + Math.random() * 0.25;
  const seed = randomSeed(box, fill);
  if (seed.size < 4) continue;
  tried++;

  const f = fate3(seed, rule, 120);
  if (f.kind === "extinct") { extinct++; continue; }
  if (f.kind === "growing") { growing++; continue; }

  // The object it settled INTO is the pattern worth keeping, not the seed that
  // happened to produce it — a seed is a starting shape, an object is a thing.
  let cells = seed;
  for (let g = 0; g < f.generation; g++) {
    cells = require("../app/lib/life/engine3d").step3(cells, rule);
  }
  const key = `${f.kind}:${f.period}:${cells.size}:${canonical3(cells)}`;
  if (best.has(key)) continue;
  best.set(key, { kind: f.kind, key, cells, fate: f });
}

const found = [...best.values()];
const by = (k: Fate3["kind"]) => found.filter((f) => f.kind === k)
  .sort((a, b) => a.cells.size - b.cells.size);

console.log(`\nrule ${ruleText} — ${tried} seeds tried, ${extinct} died, ${growing} never settled`);
for (const kind of ["still", "oscillator", "spaceship"] as const) {
  const list = by(kind);
  console.log(`\n${kind.toUpperCase()} — ${list.length} distinct`);
  for (const f of list.slice(0, 12)) {
    const b = boundingBox3(f.cells)!;
    const d = f.fate.displacement;
    console.log(
      `  ${String(f.cells.size).padStart(3)} cells  ${b.width}x${b.height}x${b.depth}` +
      `  period ${f.fate.period}${d ? `  moves (${d.join(",")})` : ""}`);
  }
}

// The smallest few of each, written out as coordinate lists for the library.
const out: Record<string, unknown[]> = {};
for (const kind of ["still", "oscillator", "spaceship"] as const) {
  out[kind] = by(kind).slice(0, 8).map((f) => {
    const b = boundingBox3(f.cells)!;
    const at0 = translate3(f.cells, -b.x, -b.y, -b.z);
    return {
      cells: [...at0].map((k) => {
        const e = require("../app/lib/life/engine3d");
        return [e.x3(k), e.y3(k), e.z3(k)];
      }),
      size: [b.width, b.height, b.depth],
      period: f.fate.period,
      displacement: f.fate.displacement ?? null,
      population: f.cells.size,
    };
  });
}
const file = path.join(process.cwd(), "scripts", `3d-found-${ruleText.replace(/[^A-Za-z0-9]/g, "")}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`\nwrote ${file}`);
void RULE_3D_LIBRARY;
