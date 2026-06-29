/**
 * POST /api/groups/[id]/members
 *   Invite a set of users to a group. Owner only. Body { userIds }.
 *   Creates a CollaborationGroupMember row (status="invited") for each
 *   userId AND a Notification for each so the recipients see it in
 *   their bell. Skips users who are already invited/accepted in this
 *   group (idempotent re-invite of left/declined users reinstates the
 *   row as invited).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inviteGroupMembers } from "@/app/lib/groups/membership";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = session.user.id;
  const { id: groupId } = await context.params;

  let body: { userIds?: string[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const userIds = Array.isArray(body.userIds) ? [...new Set(body.userIds)] : null;
  if (!userIds || userIds.length === 0) {
    return NextResponse.json({ error: "Missing userIds" }, { status: 400 });
  }

  const result = await inviteGroupMembers(groupId, callerId, userIds);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, invited: result.invited });
}
