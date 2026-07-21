import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/db";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { FeaturesEditor, type FeatureRow } from "./FeaturesEditor";

export const metadata = { title: "Diagramatix — Features Catalog" };

export default async function FeaturesAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");

  const features = await prisma.feature.findMany({
    orderBy: { sortOrder: "asc" },
  });

  // Serialise Dates so the client component gets plain JSON.
  const serialised: FeatureRow[] = features.map((f) => ({
    id: f.id,
    name: f.name,
    summary: f.summary,
    details: f.details,
    hidden: f.hidden,
    sortOrder: f.sortOrder,
    publishedName: f.publishedName,
    publishedSummary: f.publishedSummary,
    publishedDetails: f.publishedDetails,
    publishedHidden: f.publishedHidden,
    publishedSortOrder: f.publishedSortOrder,
    publishedAt: f.publishedAt ? f.publishedAt.toISOString() : null,
  }));

  return <FeaturesEditor initial={serialised} />;
}
