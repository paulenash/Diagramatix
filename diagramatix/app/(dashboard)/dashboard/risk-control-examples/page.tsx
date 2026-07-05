import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isSuperuser } from "@/app/lib/superuser";
import { RiskControlExamplesGallery } from "./RiskControlExamplesGallery";

export const metadata = { title: "Diagramatix — Risk & Control Examples" };

export default async function RiskControlExamplesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <RiskControlExamplesGallery isAdmin={isSuperuser(session)} />;
}
