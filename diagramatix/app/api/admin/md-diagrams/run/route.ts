import { runLibraryProject } from "@/app/lib/valueChain/runLibraryProject";

/**
 * SuperAdmin — "Create Project Diagrams from .md" batch runner. The runner itself lives in app/lib/valueChain/runLibraryProject.ts, shared with
 * the user-facing Create Project from Process Repository (app/api/repository/create-project); this route is the SuperAdmin mode of it.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  return runLibraryProject(req, "superadmin");
}
