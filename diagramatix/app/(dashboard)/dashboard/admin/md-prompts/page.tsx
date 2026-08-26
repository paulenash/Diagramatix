import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { MdPromptsClient } from "./MdPromptsClient";

/**
 * SuperAdmin: generate the diagram prompts inside a Process Repository .md.
 *
 * The counterpart to "Create Project Diagrams from .md": that tool consumes the
 * prompt blocks, this one writes them — from the chain's narrative and an
 * editable master template per diagram type. Together they close the loop, with
 * the templates as the single editable point controlling every prompt.
 *
 * Every generated block is parsed straight back with parseValueChainMd before it
 * is shown, so a prompt the batch tool could not read is reported here rather
 * than discovered 140 diagrams later.
 */
export default async function MdPromptsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <MdPromptsClient />;
}
