import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { RulesEditor } from "./RulesEditor";
import { isSuperuser } from "@/app/lib/superuser";

export const metadata = { title: "Diagramatix — Rules & Preferences" };

export default async function RulesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    // RulesEditor uses useSearchParams (for the ?category= scope link
    // from the per-diagram menu). Next 15 requires that to sit under
    // a Suspense boundary so the static prerender doesn't bail.
    <Suspense fallback={null}>
      <RulesEditor isAdmin={isSuperuser(session)} />
    </Suspense>
  );
}
