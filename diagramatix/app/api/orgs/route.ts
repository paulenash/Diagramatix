import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { OrgEntityType } from "@/app/generated/prisma/enums";

const VALID_ENTITY_TYPES: ReadonlySet<OrgEntityType> = new Set([
  OrgEntityType.ADI,
  OrgEntityType.Insurer,
  OrgEntityType.LifeInsurer,
  OrgEntityType.HealthInsurer,
  OrgEntityType.RSE,
  OrgEntityType.Other,
]);

/**
 * GET /api/orgs
 *
 * SuperAdmin-only. Returns every Org in the system with the headline
 * counts the picker uses (members / projects / diagrams). Ordered by
 * name for a stable picker dropdown.
 *
 * No pagination — typical deployments have a handful of Orgs.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgs = await prisma.org.findMany({
    select: {
      id: true,
      name: true,
      entityType: true,
      createdAt: true,
      allowCrossOrgSharing: true,
      _count: { select: { members: true, projects: true, diagrams: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(orgs);
}

/**
 * POST /api/orgs
 *
 * SuperAdmin-only. Body { name, entityType, initialOwnerEmail }.
 *
 *   • Rejects on exact-match duplicate name (case-sensitive — the
 *     picker keys by name, so two "Acme" rows would be confusing).
 *   • Resolves the initial-owner email against existing Users (no
 *     auto-create — the new Owner must be a registered user).
 *   • Wraps Org create + OrgMember(role=Owner) in a single transaction
 *     so a half-created Org can't exist.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    entityType?: unknown;
    initialOwnerEmail?: unknown;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const entityType = body.entityType as OrgEntityType | undefined;
  if (!entityType || !VALID_ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: "entityType must be a valid OrgEntityType" }, { status: 400 });
  }

  const initialOwnerEmail =
    typeof body.initialOwnerEmail === "string" ? body.initialOwnerEmail.trim().toLowerCase() : "";
  if (!initialOwnerEmail) {
    return NextResponse.json({ error: "initialOwnerEmail is required" }, { status: 400 });
  }

  const owner = await prisma.user.findUnique({
    where: { email: initialOwnerEmail },
    select: { id: true },
  });
  if (!owner) {
    return NextResponse.json(
      { error: `No registered user found for ${initialOwnerEmail}` },
      { status: 404 },
    );
  }

  const existing = await prisma.org.findFirst({ where: { name }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "An Org with that name already exists" }, { status: 409 });
  }

  const actorUserId = session.user.id;
  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.org.create({
      data: { name, entityType },
      select: { id: true, name: true, entityType: true, allowCrossOrgSharing: true },
    });
    await tx.orgMember.create({
      data: {
        orgId: org.id,
        userId: owner.id,
        role: "Owner",
        createdBy: actorUserId,
      },
    });
    return org;
  });

  return NextResponse.json(result, { status: 201 });
}
