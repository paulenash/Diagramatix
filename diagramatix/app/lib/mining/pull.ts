/**
 * Pull-source polling for live mining connectors. Fetches new event-log files
 * from a watched folder (Azure Blob container SAS URL, or a SharePoint/OneDrive
 * folder), parses them, and appends the rows to the source's rolling buffer.
 * `appendRowsToSource` is shared with the webhook ingest path.
 */
import { prisma, pgPool } from "@/app/lib/db";
import { parseAnyLog } from "./parseAnyLog";
import { getMsAccessToken } from "@/app/lib/sharepoint-token";
import { listFolder, downloadFileContent } from "@/app/lib/sharepoint";

type SourceRow = {
  id: string; maxEvents: number; headerFields: unknown; buffer: unknown; config: unknown; cursor: unknown;
};

/** Merge new rows (given their own header order) into the source buffer, realigned
 *  to the source's stable headerFields, capped at maxEvents. Persists buffer + counters. */
export async function appendRowsToSource(source: SourceRow, incomingHeaders: string[], incomingRows: string[][]): Promise<number> {
  if (incomingRows.length === 0) return 0;
  const fields = (source.headerFields as string[]) ?? [];
  const idx = new Map(incomingHeaders.map((h, i) => [h, i]));
  const aligned = incomingRows.map((r) => fields.map((f) => { const i = idx.get(f); return i == null ? "" : String(r[i] ?? ""); }));

  const existing = (source.buffer as string[][]) ?? [];
  let merged = [...existing, ...aligned];
  const cap = source.maxEvents || 100000;
  if (merged.length > cap) merged = merged.slice(merged.length - cap); // drop oldest

  await pgPool.query('UPDATE "MiningSource" SET buffer = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(merged), source.id]);
  await prisma.miningSource.update({ where: { id: source.id }, data: { eventCount: merged.length, lastIngestAt: new Date() } });
  return aligned.length;
}

/** Split a container SAS URL into its base and query (SAS token). */
function splitSas(url: string): { base: string; sas: string } {
  const q = url.indexOf("?");
  return q < 0 ? { base: url, sas: "" } : { base: url.slice(0, q), sas: url.slice(q + 1) };
}

/** Poll an Azure Blob container (SAS URL) for blobs newer than the cursor. */
export async function pollBlobSource(source: SourceRow): Promise<number> {
  const cfg = (source.config ?? {}) as { blobListUrl?: string };
  if (!cfg.blobListUrl) throw new Error("No blob SAS URL configured");
  const { base, sas } = splitSas(cfg.blobListUrl);
  const listUrl = `${base}?${sas ? sas + "&" : ""}restype=container&comp=list`;
  const res = await fetch(listUrl);
  if (!res.ok) throw new Error(`Blob list ${res.status}`);
  const xml = await res.text();
  const blobs = [...xml.matchAll(/<Blob>[\s\S]*?<Name>(.*?)<\/Name>[\s\S]*?<Last-Modified>(.*?)<\/Last-Modified>[\s\S]*?<\/Blob>/g)]
    .map((m) => ({ name: m[1], modified: Date.parse(m[2]) || 0 }));

  const cur = (source.cursor ?? {}) as { seenNames?: string[] };
  const seen = new Set(cur.seenNames ?? []);
  const fresh = blobs.filter((b) => !seen.has(b.name) && /\.(csv|tsv|txt|xes|json|ocel)$/i.test(b.name)).sort((a, b) => a.modified - b.modified);

  let total = 0;
  for (const b of fresh) {
    const dl = await fetch(`${base}/${b.name.split("/").map(encodeURIComponent).join("/")}?${sas}`);
    if (!dl.ok) continue;
    const text = await dl.text();
    const parsed = parseAnyLog(text, b.name);
    // Re-read the source so the buffer accumulates across files in this poll.
    const s = await prisma.miningSource.findUnique({ where: { id: source.id } });
    if (s) total += await appendRowsToSource(s, parsed.headers, parsed.rows);
    seen.add(b.name);
  }
  await pgPool.query('UPDATE "MiningSource" SET cursor = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify({ seenNames: [...seen].slice(-2000) }), source.id]);
  return total;
}

/** Poll a SharePoint/OneDrive folder using the signed-in user's Graph token. */
export async function pollSharePointSource(source: SourceRow, req: Request): Promise<number> {
  const cfg = (source.config ?? {}) as { driveId?: string; itemId?: string };
  if (!cfg.driveId || !cfg.itemId) throw new Error("No SharePoint folder configured");
  const token = await getMsAccessToken(req);
  if (!token) throw new Error("Sign in with Microsoft to refresh a SharePoint source");

  const items = await listFolder(token, cfg.driveId, cfg.itemId);
  const cur = (source.cursor ?? {}) as { seenNames?: string[] };
  const seen = new Set(cur.seenNames ?? []);
  const fresh = items.filter((it) => it.name && /\.(csv|tsv|txt|xes|json|ocel)$/i.test(it.name) && !seen.has(it.id));

  let total = 0;
  for (const it of fresh) {
    const text = await downloadFileContent(token, cfg.driveId, it.id);
    const parsed = parseAnyLog(text, it.name);
    const s = await prisma.miningSource.findUnique({ where: { id: source.id } });
    if (s) total += await appendRowsToSource(s, parsed.headers, parsed.rows);
    seen.add(it.id);
  }
  await pgPool.query('UPDATE "MiningSource" SET cursor = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify({ seenNames: [...seen].slice(-2000) }), source.id]);
  return total;
}
