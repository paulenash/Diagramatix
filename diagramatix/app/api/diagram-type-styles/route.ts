/**
 * Diagram-type visual styles API.
 *
 *   GET  /api/diagram-type-styles
 *     Returns the effective style for every editable diagram type — the
 *     static defaults (app/lib/diagram/diagramTypeStyles.ts) overlaid with
 *     any SuperAdmin overrides in the DiagramTypeStyle table. Public to
 *     any signed-in user: the badge/chip colours are non-sensitive UI and
 *     are shown across the whole app.
 *
 *   PUT  /api/diagram-type-styles
 *     Body: { styles: { typeKey, code, bgColor, textColor }[] }
 *     Upserts each row by typeKey. SuperAdmin only. Returns the new
 *     effective list.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import {
  DEFAULT_DIAGRAM_TYPE_STYLES,
  EDITABLE_DIAGRAM_TYPE_KEYS,
  isHexColor,
  type DiagramTypeStyle,
} from "@/app/lib/diagram/diagramTypeStyles";

interface StyleInput {
  typeKey?: string;
  code?: string;
  bgColor?: string;
  textColor?: string;
}

const EDITABLE = new Set(EDITABLE_DIAGRAM_TYPE_KEYS);

/** Build the effective list: defaults overlaid with DB override rows. */
async function effectiveStyles(): Promise<DiagramTypeStyle[]> {
  const rows = await prisma.diagramTypeStyle.findMany();
  const byKey = new Map(rows.map((r) => [r.typeKey, r]));
  return DEFAULT_DIAGRAM_TYPE_STYLES.map((d) => {
    const o = byKey.get(d.typeKey);
    return o
      ? { ...d, code: o.code, bgColor: o.bgColor, textColor: o.textColor }
      : d;
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ styles: await effectiveStyles() });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { styles?: StyleInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const incoming = Array.isArray(body.styles) ? body.styles : null;
  if (!incoming) {
    return NextResponse.json({ error: "Missing styles array" }, { status: 400 });
  }

  // Validate every row before touching the DB.
  for (const s of incoming) {
    if (typeof s.typeKey !== "string" || !EDITABLE.has(s.typeKey)) {
      return NextResponse.json({ error: `Unknown diagram type: ${s.typeKey}` }, { status: 400 });
    }
    const code = typeof s.code === "string" ? s.code.trim() : "";
    if (code.length < 1 || code.length > 3) {
      return NextResponse.json({ error: `Code for ${s.typeKey} must be 1–3 characters` }, { status: 400 });
    }
    if (!isHexColor(s.bgColor) || !isHexColor(s.textColor)) {
      return NextResponse.json({ error: `Colours for ${s.typeKey} must be #rrggbb hex` }, { status: 400 });
    }
  }

  const defaultsByKey = new Map(DEFAULT_DIAGRAM_TYPE_STYLES.map((d) => [d.typeKey, d]));
  await prisma.$transaction(
    incoming.map((s) =>
      prisma.diagramTypeStyle.upsert({
        where: { typeKey: s.typeKey! },
        create: {
          typeKey: s.typeKey!,
          code: s.code!.trim().toUpperCase(),
          bgColor: s.bgColor!,
          textColor: s.textColor!,
          sortOrder: defaultsByKey.get(s.typeKey!)?.sortOrder ?? 0,
        },
        update: {
          code: s.code!.trim().toUpperCase(),
          bgColor: s.bgColor!,
          textColor: s.textColor!,
        },
      }),
    ),
  );

  return NextResponse.json({ styles: await effectiveStyles() });
}
