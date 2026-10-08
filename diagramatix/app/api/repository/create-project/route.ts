import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { runLibraryProject } from "@/app/lib/valueChain/runLibraryProject";

/**
 * POST { source:"library", chainCode, diagramKeys?, projectName?, projectId?, answers? } — Create Project from Process Repository, for a USER.
 *
 * The user mode of the shared runner (app/lib/valueChain/runLibraryProject.ts): the published library only, only the diagrams the user's Process
 * Repository feature opens (enforced there, whatever this request asks for), the Org's model, and one AI attempt per diagram generated. Streams
 * NDJSON exactly as the SuperAdmin tool does.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  return runLibraryProject(req, "user");
}
