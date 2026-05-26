/**
 * Bubble Help API.
 *
 *   GET  /api/bubble-helps?diagramType=<type>
 *     Returns every BubbleHelp row for that diagramType, sorted by
 *     sortOrder. Public — the content is non-sensitive UI text and
 *     every signed-in or signed-out viewer of a diagram needs it to
 *     render the help cloud.
 *
 *   PUT  /api/bubble-helps
 *     Body: { diagramType, rows: BubbleHelpInput[] }
 *     Replaces the entire row set for that diagramType in a single
 *     transaction (delete-then-insert). Admin only (isSuperuser).
 *     Returns the new set.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

interface BubbleHelpInput {
  topicKey: string;
  conditionLabel: string;
  text: string;
  durationMs?: number;
  sortOrder?: number;
}

const KNOWN_DIAGRAM_TYPES = new Set([
  "context", "basic", "process-context", "state-machine",
  "bpmn", "domain", "value-chain", "archimate",
]);

// Clamp durationMs to a sensible range — admins shouldn't be able to
// set a value so small the cloud dismisses before it renders, or so
// large it lingers forever.
const MIN_DURATION_MS = 500;
const MAX_DURATION_MS = 60_000;
const DEFAULT_DURATION_MS = 10_000;

function clampDuration(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_DURATION_MS;
  return Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, Math.round(v)));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const diagramType = url.searchParams.get("diagramType");
  if (!diagramType || !KNOWN_DIAGRAM_TYPES.has(diagramType)) {
    return NextResponse.json({ error: "Invalid or missing diagramType" }, { status: 400 });
  }
  const rows = await prisma.bubbleHelp.findMany({
    where: { diagramType },
    orderBy: [{ sortOrder: "asc" }, { topicKey: "asc" }],
  });
  return NextResponse.json({ rows });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { diagramType?: string; rows?: BubbleHelpInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const diagramType = body.diagramType;
  if (!diagramType || !KNOWN_DIAGRAM_TYPES.has(diagramType)) {
    return NextResponse.json({ error: "Invalid or missing diagramType" }, { status: 400 });
  }
  const incoming = Array.isArray(body.rows) ? body.rows : null;
  if (!incoming) {
    return NextResponse.json({ error: "Missing rows array" }, { status: 400 });
  }

  // Validate each row — topicKey + conditionLabel + text required.
  // Empty topicKey would never match a code-side trigger, but allow
  // empty conditionLabel / text so the admin can stage rows before
  // filling them in.
  const seenKeys = new Set<string>();
  for (const r of incoming) {
    if (typeof r.topicKey !== "string" || r.topicKey.trim().length === 0) {
      return NextResponse.json({ error: "Each row needs a non-empty topicKey" }, { status: 400 });
    }
    if (seenKeys.has(r.topicKey)) {
      return NextResponse.json({ error: `Duplicate topicKey: ${r.topicKey}` }, { status: 400 });
    }
    seenKeys.add(r.topicKey);
  }

  const normalised = incoming.map((r, i) => ({
    diagramType,
    topicKey: r.topicKey.trim(),
    conditionLabel: typeof r.conditionLabel === "string" ? r.conditionLabel : "",
    text: typeof r.text === "string" ? r.text : "",
    durationMs: clampDuration(r.durationMs),
    sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : i,
  }));

  // Replace the whole set atomically.
  await prisma.$transaction([
    prisma.bubbleHelp.deleteMany({ where: { diagramType } }),
    prisma.bubbleHelp.createMany({ data: normalised }),
  ]);

  const fresh = await prisma.bubbleHelp.findMany({
    where: { diagramType },
    orderBy: [{ sortOrder: "asc" }, { topicKey: "asc" }],
  });
  return NextResponse.json({ rows: fresh });
}
