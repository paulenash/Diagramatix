/**
 * POST /api/groups/[id]/members/[userId]   { action }
 *   Single-member membership transitions.
 *   action="accept"  — invitee accepts their own invitation
 *   action="decline" — invitee declines their own invitation
 *   action="leave"   — accepted member leaves the group
 *   action="remove"  — owner removes any other member
 *
 *   On accept: notifies the owner (group-invite-accepted).
 *   On decline: notifies the owner (group-invite-declined).
 *   On remove: notifies the removed user (group-removed).
 *   On leave: no notification (silent).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { groupMemberAction, type GroupMemberAction } from "@/app/lib/groups/membership";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = session.user.id;
  const { id: groupId, userId: targetUserId } = await context.params;

  let body: { action?: GroupMemberAction };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = body.action;
  if (!action || !["accept", "decline", "leave", "remove"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const result = await groupMemberAction(groupId, callerId, targetUserId, action);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, status: result.status });
}
