/**
 * The "push everything" checklist, as a program.
 *
 * PUSH_EVERYTHING.md lists what must be true before and after a release. A list
 * that only a person checks is a list that quietly stops being true: three
 * different suite totals once coexisted inside TESTS_SUMMARY.md, and
 * VERSION_HISTORY.md went five releases without an entry, because nothing ever
 * looked. So the list is executable, and "up to date" is something this prints
 * rather than something anyone asserts.
 *
 * Exit code 0 = everything it could check is current; 1 = something is behind.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/check-push-everything.ts             # local checks only
 *   npx tsx scripts/check-push-everything.ts --prod      # + live site and prod DB
 *
 * --prod needs DATABASE_URL for the content checks; without it those report as
 * skipped rather than passing, because a check that cannot run has not passed.
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

type State = "ok" | "behind" | "skip" | "manual";
interface Row { step: string; what: string; state: State; detail: string }

const rows: Row[] = [];
const add = (step: string, what: string, state: State, detail: string) => rows.push({ step, what, state, detail });
const sh = (cmd: string): string => {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
};
const read = (p: string): string => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };

async function main() {
  const prod = process.argv.includes("--prod");
  const ROOT = process.cwd();

  // ── Step 1 — the version constants ──────────────────────────────────────
  const types = read("app/lib/diagram/types.ts");
  const schemaV = types.match(/SCHEMA_VERSION = "(\d+)"/)?.[1] ?? "?";
  const productV = types.match(/PRODUCT_VERSION = "([\d.]+)"/)?.[1] ?? "?";
  add("1", "types.ts constants", schemaV !== "?" && productV !== "?" ? "ok" : "behind",
      `SCHEMA_VERSION=${schemaV}  PRODUCT_VERSION=${productV}`);

  // ── Step 2 — the XSD declares what the app exports ──────────────────────
  const xsd = read("public/diagramatix-export.xsd");
  const xsdBlocks = new Map<string, string[]>();
  for (const m of xsd.matchAll(/<xs:simpleType name="([^"]+)">([\s\S]*?)<\/xs:simpleType>/g))
    xsdBlocks.set(m[1], [...m[2].matchAll(/enumeration value="([^"]+)"/g)].map((e) => e[1]));
  const union = (name: string): string[] => {
    const i = types.indexOf("export type " + name + " =");
    if (i < 0) return [];
    return [...types.slice(i, types.indexOf(";", i)).matchAll(/"([a-zA-Z0-9-]+)"/g)].map((m) => m[1]);
  };
  const drift: string[] = [];
  for (const [ts, en] of [["SymbolType", "SymbolTypeEnum"], ["ConnectorType", "ConnectorTypeEnum"],
                          ["EventType", "EventTypeEnum"], ["GatewayType", "GatewayTypeEnum"], ["DiagramType", "DiagramTypeEnum"]]) {
    const declared = new Set(xsdBlocks.get(en) ?? []);
    for (const v of union(ts)) if (!declared.has(v)) drift.push(`${ts}.${v}`);
  }
  const hasBlock = xsd.includes(`  v${schemaV} —`);
  add("2", "XSD shape + history", drift.length === 0 && hasBlock ? "ok" : "behind",
      drift.length ? `${drift.length} undeclared: ${drift.slice(0, 4).join(", ")}` : `v${schemaV} history block ${hasBlock ? "present" : "MISSING"}, 0 enum drift`);

  // ── Step 3 — Logical DDL, only when the physical DB changed ─────────────
  // -G, not -S: `-S` counts occurrences of the string, so changing the VALUE
  // ("2.1.1" -> "2.2") leaves the count identical and it walks back to whenever
  // the constant was first introduced. That anchored this check to a commit from
  // two releases earlier and reported a long-since-shipped prisma change as
  // outstanding. `-G` matches any changed line containing the pattern.
  const lastProductBump = sh('git log -1 --format=%H -G"PRODUCT_VERSION = " -- app/lib/diagram/types.ts');
  const prismaChanges = lastProductBump ? sh(`git log --oneline ${lastProductBump}..HEAD -- prisma/schema.prisma`).split("\n").filter(Boolean).length : -1;
  add("3", "ddlGenerate.ts", prismaChanges === 0 ? "ok" : "manual",
      prismaChanges === 0 ? "N/A — prisma/schema.prisma unchanged since the last PRODUCT_VERSION bump"
                          : `${prismaChanges} prisma change(s) since the last bump — check the Logical DDL`);

  // ── Step 4 — the schema changelog agrees with the constant ──────────────
  const chg = read("schema/SCHEMA_CHANGELOG.md");
  const chgV = chg.match(/Current XSD schema version:\*\*\s*`(\d+)`/)?.[1] ?? "?";
  add("4", "SCHEMA_CHANGELOG.md", chgV === schemaV ? "ok" : "behind", `states ${chgV}, constant is ${schemaV}`);

  // ── Step 5 — VERSION_HISTORY carries every release ──────────────────────
  // Per Paul (2026-08-24): one entry may cover the several commits that fixed a
  // single issue, but a new feature or product change belongs in the entry for
  // the release it shipped in. So the check is "how far behind HEAD is it".
  const vh = read("VERSION_HISTORY.md");
  const newest = vh.match(/^## ([\d.]+)/m)?.[1] ?? "?";
  const newestBuild = Number(newest.split(".")[2] ?? 0);
  const head = Number(sh("git rev-list --count HEAD") || 0);
  const behindBy = head - newestBuild;
  add("5", "VERSION_HISTORY.md", behindBy <= 1 ? "ok" : "behind",
      `newest ${newest}; HEAD is build ${head} → ${behindBy <= 1 ? "current" : `${behindBy} commits unlogged`}`);

  // ── Working tree / push state ───────────────────────────────────────────
  const dirty = sh("git status --porcelain").split("\n").filter(Boolean).length;
  const unpushed = sh("git log --oneline origin/main..HEAD").split("\n").filter(Boolean).length;
  add("7-8", "commit + push", dirty === 0 && unpushed === 0 ? "ok" : "behind",
      `${dirty} uncommitted file(s), ${unpushed} unpushed commit(s)`);

  // ── TESTS_SUMMARY — every test has a row, and the header tells the truth ─
  const doc = read("tests/TESTS_SUMMARY.md");
  const ID = /T\d{4}/g;
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(d, e.name);
    return e.isDirectory() ? walk(full) : (e.isFile() && e.name.endsWith(".ts") ? [full] : []);
  });
  const inTree = [...new Set(walk(path.join(ROOT, "tests")).flatMap((f) => read(f).match(ID) ?? []))].sort();
  const recorded = new Set(doc.match(ID) ?? []);
  const missing = inTree.filter((id) => !recorded.has(id));
  const highest = inTree[inTree.length - 1] ?? "?";
  const headerRef = doc.match(/\*\*Highest ref:\*\*\s*(T\d{4})/)?.[1] ?? "?";
  const noteRef = doc.match(/Highest ref allocated:\s*`(T\d{4})`/)?.[1] ?? "?";
  const refsAgree = headerRef === highest && noteRef === highest;
  add("T", "TESTS_SUMMARY.md", missing.length === 0 && refsAgree ? "ok" : "behind",
      missing.length ? `${missing.length} test id(s) with no row (first: ${missing[0]})`
                     : refsAgree ? `${inTree.length} ids, all recorded; highest ${highest}`
                                 : `highest is ${highest} but header says ${headerRef}, note says ${noteRef}`);

  // ── Steps 9-12 — the deployed site and the per-environment content ──────
  if (!prod) {
    add("9-12", "deploy + DB content", "skip", "run with --prod to check the live schema, User Guide, Features and Tech Notes");
  } else {
    const live = sh(`curl -s --max-time 25 https://app.diagramatix.com.au/api/schema`);
    const liveV = live.match(/version="(\d+)"/)?.[1] ?? "?";
    add("9", "live /api/schema", liveV === schemaV ? "ok" : "behind", `live ${liveV}, expected ${schemaV}`);

    if (!process.env.DATABASE_URL) {
      add("10-12", "DB content", "skip", "no DATABASE_URL — cannot check the Guide version, Features or Tech Notes");
    } else {
      const { PrismaClient } = await import("../app/generated/prisma/client");
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
      try {
        const gs = await db.helpChapter.findFirst({ where: { collection: "user-guide", slug: "getting-started" }, include: { sections: { orderBy: { sortOrder: "asc" } } } });
        const guideV = gs?.sections[0]?.bodyMarkdown.match(/covers version\s+\*{0,2}([\d.]+)/i)?.[1] ?? "?";
        const expected = `${productV}.${head}`;
        add("10a", "User Guide version", guideV === expected ? "ok" : "behind", `guide says ${guideV}, deployed build would be ${expected}`);

        const feats = await db.feature.findMany();
        const unpub = feats.filter((f) => !f.publishedAt).length;
        const empty = feats.filter((f) => !f.summary?.trim() || !f.details?.trim()).length;
        add("11", "Features catalog", unpub === 0 && empty === 0 ? "ok" : "behind",
            `${feats.length} rows, ${unpub} unpublished, ${empty} empty`);

        const chapters = await db.helpChapter.findMany({ include: { sections: true } });
        const misfiled = chapters.flatMap((c) => c.sections.filter((s) => s.collection !== c.collection)).length;
        add("12", "Tech Notes / Guide integrity", misfiled === 0 ? "ok" : "behind",
            misfiled === 0 ? "every section matches its chapter's collection" : `${misfiled} section(s) filed under the wrong collection`);
      } finally { await db.$disconnect(); }
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────
  const mark = { ok: "OK    ", behind: "BEHIND", skip: "skip  ", manual: "check " } as const;
  console.log("\nPUSH EVERYTHING — checklist status\n");
  for (const r of rows) console.log(`  [${mark[r.state]}] ${r.step.padEnd(5)} ${r.what.padEnd(28)} ${r.detail}`);
  const behind = rows.filter((r) => r.state === "behind");
  const skipped = rows.filter((r) => r.state === "skip");
  console.log("");
  if (behind.length === 0) {
    console.log(skipped.length ? `Up to date on everything checked (${skipped.length} skipped — see above).` : "Up to date.");
  } else {
    console.log(`${behind.length} item(s) BEHIND: ${behind.map((r) => r.what).join(", ")}`);
  }
  process.exit(behind.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
