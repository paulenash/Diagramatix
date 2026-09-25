/**
 * PUT /api/admin/text-to-speech/users/[id]  { on: boolean } — switch speech on or
 * off for one user. SuperAdmin only.
 *
 * ONE key changes, atomically, in the database. The general per-user features
 * route replaces the whole override map, so using it here would mean read, edit,
 * write back — and a second SuperAdmin changing another feature for the same
 * user in between would lose their change without either of them knowing.
 *
 * Off REMOVES the grant rather than writing "hidden": the user goes back to what
 * their tier says, which — with speech off at every tier — is off. The tile
 * lists any tier that has been switched on as a whole, so that case is visible.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pgPool } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { SPEECH_FEATURE_KEY } from "@/app/lib/voice/speechAccess";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const readOnly = await blockReadOnlyImpersonation(session);
  if (readOnly) return readOnly;
  if (!isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { on?: unknown } | null;
  if (typeof body?.on !== "boolean") return NextResponse.json({ error: "on must be true or false" }, { status: 400 });

  // Prisma 7 omits JSON fields from model update inputs → raw SQL (and it is
  // the atomic single-key update we want anyway).
  const { rowCount } = body.on
    ? await pgPool.query(
        `UPDATE "User"
            SET "featureOverrides" = COALESCE("featureOverrides", '{}'::jsonb) || jsonb_build_object($2::text, 'available')
          WHERE id = $1`,
        [id, SPEECH_FEATURE_KEY],
      )
    : await pgPool.query(
        `UPDATE "User" SET "featureOverrides" = COALESCE("featureOverrides", '{}'::jsonb) - $2::text WHERE id = $1`,
        [id, SPEECH_FEATURE_KEY],
      );

  if (!rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, on: body.on });
}
