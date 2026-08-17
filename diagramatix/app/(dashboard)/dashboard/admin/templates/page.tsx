import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { TemplatesClient } from "./TemplatesClient";

/** SuperAdmin-only Template Management — every diagram template (built-in + all
 *  users'): preview, edit name/group/description, delete, regenerate thumbnails. */
export default async function TemplatesAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <TemplatesClient />;
}
