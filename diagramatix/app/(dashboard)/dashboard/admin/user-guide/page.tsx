import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { isMicrosoftConnected } from "@/app/lib/microsoft/connection";
import { UserGuideEditorClient } from "./UserGuideEditorClient";

export const metadata = { title: "Document Editor — SuperAdmin" };

export default async function UserGuideAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  // Whether the SuperAdmin has connected SharePoint (per-user DB link) — gates the
  // "Other Documents" (SharePoint) button. Same source the dashboard uses.
  const hasMicrosoft = await isMicrosoftConnected(session.user.id);
  // useSearchParams (document selector) needs a Suspense boundary in Next 16.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <UserGuideEditorClient hasMicrosoft={hasMicrosoft} />
    </Suspense>
  );
}
