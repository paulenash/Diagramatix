import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { ValueChainLibraryClient } from "./ValueChainLibraryClient";

/**
 * SuperAdmin: the Process Repository — 26 value chains, their processes and the
 * diagram prompts generated from the master templates.
 *
 * The repository used to be a 500 KB markdown file uploaded by hand; it lives in
 * the database now, with the .md kept as the import/export format. Drafts are
 * edited here and only a PUBLISHED chain is visible to project generation, so a
 * chain can be rewritten and regenerated without anything downstream seeing a
 * half-finished state.
 *
 * SuperAdmin-only until Paul releases it.
 */
export default async function ValueChainLibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <ValueChainLibraryClient />;
}
