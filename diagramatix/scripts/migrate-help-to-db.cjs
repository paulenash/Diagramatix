/**
 * One-time migration: the hardcoded User Guide (app/(dashboard)/help/chapters.tsx)
 * → the HelpChapter / HelpSection DB tables, as GFM Markdown.
 *
 * chapters.tsx has only a type-only import, so we transpile it in-process with
 * the TypeScript compiler (JSX → React.createElement, React injected), read the
 * CHAPTERS array, render each section.body to static HTML, convert HTML→Markdown
 * (turndown + GFM tables), and upsert rows.
 *
 * Target DB = process.env.DATABASE_URL, DEFAULTING TO THE diagramatix_test SANDBOX
 * for safety. Set DATABASE_URL explicitly to target local/prod.
 *
 *   node scripts/migrate-help-to-db.cjs            # → diagramatix_test (safe)
 *   DATABASE_URL=postgres://…/diagramatix node scripts/migrate-help-to-db.cjs
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const TurndownService = require("turndown");
const { gfm } = require("turndown-plugin-gfm");
const { Client } = require("pg");

const DB_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/diagramatix_test";

// ── 1. Load CHAPTERS by transpiling chapters.tsx ────────────────────────────
function loadChapters() {
  const file = path.join(process.cwd(), "app", "(dashboard)", "help", "chapters.tsx");
  const src = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: {
      jsx: ts.JsxEmit.React, // classic → bare React.createElement (React injected below)
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function("exports", "require", "module", "React", js)(mod.exports, require, mod, React);
  if (!Array.isArray(mod.exports.CHAPTERS)) throw new Error("CHAPTERS not found / not an array");
  return mod.exports.CHAPTERS;
}

// ── 2. HTML → Markdown ──────────────────────────────────────────────────────
const td = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});
td.use(gfm);

function bodyToMarkdown(body) {
  if (body == null) return "";
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, body));
  return td.turndown(html).trim();
}

// ── 3. Write to the DB ──────────────────────────────────────────────────────
const rand = () => Math.random().toString(36).slice(2, 12);

async function main() {
  const chapters = loadChapters();
  console.log(`Loaded ${chapters.length} chapters from chapters.tsx → ${DB_URL.replace(/:[^:@/]+@/, ":****@")}`);

  const c = new Client(DB_URL);
  await c.connect();
  try {
    await c.query("BEGIN");
    // Idempotent: clear existing guide content first (FK: sections → chapters).
    await c.query('DELETE FROM "HelpSection"');
    await c.query('DELETE FROM "HelpChapter"');

    let totalSections = 0;
    for (let ci = 0; ci < chapters.length; ci++) {
      const ch = chapters[ci];
      const chId = "hc_" + rand() + rand();
      await c.query(
        'INSERT INTO "HelpChapter"(id, slug, title, "sortOrder", "adminOnly", "updatedAt") VALUES ($1,$2,$3,$4,$5, NOW())',
        [chId, String(ch.slug), String(ch.title), ci, !!ch.adminOnly],
      );
      const sections = Array.isArray(ch.sections) ? ch.sections : [];
      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        await c.query(
          'INSERT INTO "HelpSection"(id, "chapterId", heading, "bodyMarkdown", "adminOnly", image, "imageAlt", "imageCaption", "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())',
          [
            "hs_" + rand() + rand(),
            chId,
            sec.heading ?? null,
            bodyToMarkdown(sec.body),
            !!sec.adminOnly,
            sec.image ?? null,
            sec.imageAlt ?? null,
            sec.imageCaption ?? null,
            si,
          ],
        );
        totalSections++;
      }
    }
    await c.query("COMMIT");
    console.log(`✔ Migrated ${chapters.length} chapters, ${totalSections} sections.`);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("✘ Migration failed:", e.message);
  process.exit(1);
});
