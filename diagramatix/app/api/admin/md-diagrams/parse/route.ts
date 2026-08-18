import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { parseValueChainMd } from "@/app/lib/valueChain/parseValueChainMd";

/**
 * SuperAdmin — parse an uploaded Value-Chain `.md` (the "Process Repository"
 * format) into a list of value chains and the diagrams each one would create.
 * Returns summaries only (name + type per diagram, no prompt bodies) so the tool
 * can show the pick-list; the run route re-parses to get the prompts. The client
 * sends the file text as JSON `{ md }`.
 */
const MAX_MD_CHARS = 4 * 1024 * 1024; // ~4 MB of text — generous for these docs.

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { md?: unknown } | null;
  const md = typeof body?.md === "string" ? body.md : "";
  if (!md.trim()) return NextResponse.json({ error: "An .md file with content is required" }, { status: 400 });
  if (md.length > MAX_MD_CHARS) {
    return NextResponse.json({ error: `File too large (${(md.length / 1048576).toFixed(1)} MB, max 4 MB)` }, { status: 413 });
  }

  const chains = parseValueChainMd(md).map((c) => ({
    code: c.code,
    title: c.title,
    diagrams: c.diagrams.map((d) => ({ name: d.name, type: d.type })),
  }));

  if (chains.length === 0) {
    return NextResponse.json({ error: "No value chains found. Expected '## Vnn — Title' headings." }, { status: 422 });
  }
  return NextResponse.json({ chains });
}
