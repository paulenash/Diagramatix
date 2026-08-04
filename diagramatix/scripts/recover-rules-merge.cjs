/**
 * Full DiagramRules recovery by UNION MERGE from a restored (PITR) server.
 *
 *   SOURCE_DATABASE_URL — restored/PITR server (authoritative pre-accident rules)
 *   DATABASE_URL        — target to recover (current prod, or local)
 *
 * For each category present in the source, the target's default row is rebuilt as:
 *   restored text  +  any rule the TARGET has that the restored set lacks
 * (those extra rules are spliced back in id-order). So the result is the UNION —
 * it can never drop a rule from either side, and prefers the restored wording for
 * shared rules. Categories absent from the source (e.g. "assist") are left as-is.
 *
 * DRY-RUN by default (prints the plan, writes nothing). Pass --apply to write.
 */
const pg = require("pg");

const SRC = process.env.SOURCE_DATABASE_URL;
if (!SRC) { console.error("SOURCE_DATABASE_URL (restored server) required."); process.exit(1); }
const TGT = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
const APPLY = process.argv.includes("--apply");

const RULE_RE = /^([A-Z]\d+(?:\.\d+)*):/;
const idOf = (line) => { const m = line.match(RULE_RE); return m ? m[1] : null; };
const tuple = (id) => { const mm = id.match(/^([A-Z])(.+)$/); return [mm[1], ...mm[2].split(".").map(Number)]; };
const cmp = (a, b) => { const A = tuple(a), B = tuple(b); for (let i = 0; i < Math.max(A.length, B.length); i++) { const x = A[i] ?? -1, y = B[i] ?? -1; if (x < y) return -1; if (x > y) return 1; } return 0; };

function mergeCategory(restoredText, targetText) {
  const rLines = restoredText.split("\n");
  const rIds = new Set(rLines.map(idOf).filter(Boolean));
  const extras = []; // rules in TARGET but not in restored
  for (const line of targetText.split("\n")) { const id = idOf(line); if (id && !rIds.has(id)) extras.push({ id, line }); }
  if (extras.length === 0) return { text: restoredText, added: [] };
  for (const { id, line } of extras) {
    // insert after the last rule line whose id sorts below this id (same letter group)
    let insertAt = -1;
    for (let i = 0; i < rLines.length; i++) { const lid = idOf(rLines[i]); if (lid && tuple(lid)[0] === tuple(id)[0] && cmp(lid, id) < 0) insertAt = i; }
    if (insertAt === -1) rLines.push(line); else rLines.splice(insertAt + 1, 0, line);
  }
  return { text: rLines.join("\n"), added: extras.map((e) => e.id) };
}

(async () => {
  const mask = (u) => u.replace(/\/\/[^@]*@/, "//***@");
  console.log(`SOURCE (restored): ${mask(SRC)}`);
  console.log(`TARGET           : ${mask(TGT)}   ${APPLY ? "[APPLY]" : "[DRY-RUN]"}\n`);
  const s = new pg.Pool({ connectionString: SRC, max: 1 });
  const t = new pg.Pool({ connectionString: TGT, max: 1 });
  const q = `SELECT category, rules FROM "DiagramRules" WHERE "isDefault"=true AND "userId" IS NULL AND "orgId" IS NULL`;
  const src = new Map((await s.query(q)).rows.map((r) => [r.category, r.rules]));
  const tgt = new Map((await t.query(q)).rows.map((r) => [r.category, r.rules]));
  const count = (txt) => (String(txt).match(/^[A-Z]\d+(?:\.\d+)*:/gm) || []).length;

  let wrote = 0;
  for (const [cat, restored] of src) {
    const cur = tgt.get(cat);
    const { text, added } = cur === undefined ? { text: restored, added: [] } : mergeCategory(restored, cur);
    const before = count(cur ?? ""), after = count(text);
    const note = added.length ? `  (kept target-only: ${added.join(", ")})` : "";
    console.log(`${cat.padEnd(16)} ${String(before).padStart(3)} → ${String(after).padStart(3)}${note}`);
    if (APPLY) {
      await t.query(
        `INSERT INTO "DiagramRules" (id, category, rules, "isDefault", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,true,NOW(),NOW())
         ON CONFLICT (id) DO UPDATE SET rules=EXCLUDED.rules, "updatedAt"=NOW()`,
        [`default-${cat}`, cat, text],
      );
      wrote++;
    }
  }
  const onlyTarget = [...tgt.keys()].filter((c) => !src.has(c));
  if (onlyTarget.length) console.log(`\nLeft untouched (not in source): ${onlyTarget.join(", ")}`);
  console.log(APPLY ? `\nApplied ${wrote} categories.` : `\nDRY-RUN — nothing written. Re-run with --apply to write.`);
  await s.end(); await t.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
