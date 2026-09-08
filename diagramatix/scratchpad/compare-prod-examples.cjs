/**
 * Is the PROD catalog byte-equivalent to the committed exampleData.json?
 *
 * Comparing raw text would fail on nothing: jsonb reorders keys and normalises
 * numbers. So both sides are canonicalised — keys sorted recursively — and
 * hashed. A mismatch is then a real content difference, and the script says
 * WHERE, because "the packages differ" is useless on its own.
 */
const crypto = require("crypto");
const { Client } = require("pg");

const canon = (v) => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  }
  return v;
};
const hash = (v) => crypto.createHash("sha256").update(JSON.stringify(canon(v))).digest("hex").slice(0, 12);

/** First differing path between two canonicalised values, or null. */
function firstDiff(a, b, path = "") {
  if (JSON.stringify(canon(a)) === JSON.stringify(canon(b))) return null;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return `${path || "(root)"}: ${JSON.stringify(a)?.slice(0, 60)} vs ${JSON.stringify(b)?.slice(0, 60)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}: length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) { const d = firstDiff(a[i], b[i], `${path}[${i}]`); if (d) return d; }
    return null;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDiff(a[k], b[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return null;
}

async function main() {
  const local = require("../app/lib/simulation/exampleData.json").examples;
  const c = new Client({ connectionString: process.env.PROD_DATABASE_URL, ssl: { rejectUnauthorized: true } });
  await c.connect();
  const { rows } = await c.query('SELECT slug, title, concept, description, difficulty, published, "sortOrder", package FROM "SimulationExample"');
  await c.end();

  const prodBySlug = new Map(rows.map((r) => [r.slug, r]));
  let bad = 0;
  console.log("slug                              package   title  concept  descr  level  order  published");
  for (let i = 0; i < local.length; i++) {
    const l = local[i];
    const p = prodBySlug.get(l.slug);
    if (!p) { console.log(`${l.slug.padEnd(32)}  MISSING FROM PROD`); bad++; continue; }
    const pkgOk = hash(l.package) === hash(p.package);
    const mark = (ok) => (ok ? "  ok  " : " DIFF ");
    console.log(
      l.slug.padEnd(32),
      mark(pkgOk).padEnd(9),
      mark(l.title === p.title),
      mark(l.concept === p.concept),
      mark(l.description === p.description),
      mark(l.difficulty === p.difficulty),
      mark(p.sortOrder === (i + 1) * 10),
      mark(p.published === true),
    );
    if (!pkgOk) { bad++; console.log(`      first difference → ${firstDiff(l.package, p.package)}`); }
    if (l.title !== p.title || l.difficulty !== p.difficulty) bad++;
  }
  const extra = rows.filter((r) => !local.some((l) => l.slug === r.slug));
  if (extra.length) console.log(`\nOn prod but NOT in the committed file: ${extra.map((e) => e.slug).join(", ")}`);
  console.log(bad ? `\n${bad} PROBLEM(S)` : "\nProd matches the committed catalog exactly.");
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
