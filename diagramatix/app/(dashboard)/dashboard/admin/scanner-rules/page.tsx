import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { rulesMetadata } from "@/app/lib/diagram/checks/diagramChecks";
import { ScannerRulesClient } from "./ScannerRulesClient";

/**
 * Admin-only view of the shared diagram-check registry. Auth-gates on
 * the server, then hands the (pure) rules metadata to the client for
 * the category-sidebar UI.
 */
export default async function ScannerRulesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <ScannerRulesClient rules={rulesMetadata()} />;
}
