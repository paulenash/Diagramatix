/**
 * Repair diagrams already saved with duplicate connector ids.
 *
 * Paul, 2026-09-13: a curated State Machine "exhibits weird ghosting of
 * connectors. If I delete a connector it still appears on the diagram but
 * unselectable." That is a duplicate id seen from the outside — delete removes
 * the record the id resolves to, the other copy keeps drawing, and every click
 * lands on something that is already gone.
 *
 * The generators no longer produce them, but a diagram saved before that fix
 * keeps its duplicates until something rewrites them. Hence this.
 *
 *   npx tsx scripts/fix-duplicate-connector-ids.ts --dry-run
 *   npx tsx scripts/fix-duplicate-connector-ids.ts
 *   DATABASE_URL="<prod url>" npx tsx scripts/fix-duplicate-connector-ids.ts --dry-run
 *
 * TWO KINDS OF DUPLICATE, TREATED DIFFERENTLY.
 *
 *   • Same id, and identical in every other respect (source, target, label) —
 *     one of them is a redundant copy that was never meant to exist. Dropped.
 *   • Same id, but genuinely different connectors — two transitions on different
 *     events, say. Both are real; the later ones are RE-IDENTIFIED, never
 *     dropped, because losing a real transition is a far worse outcome than an
 *     odd-looking id.
 *
 * Written with raw SQL: `data` is a Json column and Prisma 7 omits Json fields
 * from model update inputs.
 */
import "dotenv/config";
import { prisma, pgPool } from "../app/lib/db";

interface Conn { id?: string; sourceId?: string; targetId?: string; label?: string; type?: string; [k: string]: unknown }

/** What makes two connectors "the same connector", beyond the id. */
const sameness = (c: Conn) =>
  [c.sourceId ?? "", c.targetId ?? "", c.type ?? "", (c.label ?? "").trim()].join("");

function repair(connectors: Conn[]): { connectors: Conn[]; dropped: number; renamed: number } {
  const seenId = new Set<string>();
  const seenWhole = new Set<string>();
  const out: Conn[] = [];
  let dropped = 0, renamed = 0;

  for (const c of connectors) {
    const id = typeof c.id === "string" ? c.id : "";
    const whole = sameness(c);

    if (id && seenId.has(id)) {
      // An exact repeat of one already kept: a copy nobody authored.
      if (seenWhole.has(whole)) { dropped++; continue; }
      // A different connector wearing a taken id. Keep it, give it its own.
      let n = 2, next = `${id}-${n}`;
      while (seenId.has(next)) next = `${id}-${++n}`;
      out.push({ ...c, id: next });
      seenId.add(next);
      seenWhole.add(whole);
      renamed++;
      continue;
    }

    if (id) seenId.add(id);
    seenWhole.add(whole);
    out.push(c);
  }
  return { connectors: out, dropped, renamed };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const diagrams = await prisma.diagram.findMany({ select: { id: true, name: true, type: true, data: true } });

  let touched = 0, totalDropped = 0, totalRenamed = 0;
  for (const d of diagrams) {
    const data = (d.data ?? {}) as unknown as { connectors?: Conn[] };
    const conns = Array.isArray(data.connectors) ? data.connectors : null;
    if (!conns?.length) continue;

    const ids = conns.map((c) => c.id).filter((x): x is string => typeof x === "string");
    if (new Set(ids).size === ids.length) continue;      // already clean

    const r = repair(conns);
    touched++; totalDropped += r.dropped; totalRenamed += r.renamed;
    console.log(
      `  ${dryRun ? "WOULD fix" : "fixed"}  ${d.type.padEnd(14)} "${d.name}" — ` +
      `${r.dropped} exact duplicate${r.dropped === 1 ? "" : "s"} dropped, ${r.renamed} re-identified`,
    );
    if (dryRun) continue;

    await pgPool.query(
      `UPDATE "Diagram" SET data = jsonb_set(data::jsonb, '{connectors}', $1::jsonb) WHERE id = $2`,
      [JSON.stringify(r.connectors), d.id],
    );
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}${touched} diagram(s) affected — ` +
    `${totalDropped} exact duplicate(s) dropped, ${totalRenamed} re-identified. ` +
    `${diagrams.length - touched} already clean.`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
