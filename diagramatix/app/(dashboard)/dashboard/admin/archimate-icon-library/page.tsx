import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { ArchimateIconLibraryClient } from "./ArchimateIconLibraryClient";

export default async function ArchimateIconLibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <ArchimateIconLibraryClient />;
}
