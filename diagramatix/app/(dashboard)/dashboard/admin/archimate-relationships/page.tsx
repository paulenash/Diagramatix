import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { RelationshipExplorerClient } from "./RelationshipExplorerClient";

export default async function ArchimateRelationshipsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <RelationshipExplorerClient />;
}
