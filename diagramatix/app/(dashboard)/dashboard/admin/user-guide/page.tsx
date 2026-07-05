import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isSuperuser } from "@/app/lib/superuser";
import { UserGuideEditorClient } from "./UserGuideEditorClient";

export const metadata = { title: "Document Editor — SuperAdmin" };

export default async function UserGuideAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  // useSearchParams (collection selector) needs a Suspense boundary in Next 16.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <UserGuideEditorClient />
    </Suspense>
  );
}
