import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/db";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { SubscriptionsEditor, type TierRow } from "./SubscriptionsEditor";

export const metadata = { title: "Diagramatix — Subscription Prices and Limits" };

export default async function SubscriptionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");

  const tiers = await prisma.subscriptionLevel.findMany({
    orderBy: { sortOrder: "asc" },
  });

  // Serialise Dates so the client component gets plain JSON.
  const serialised: TierRow[] = tiers.map((t) => ({
    id: t.id,
    name: t.name,
    priceMonthly: t.priceMonthly,
    sortOrder: t.sortOrder,
    maxProjects: t.maxProjects,
    maxDiagramsPerTypePerProject: t.maxDiagramsPerTypePerProject,
    maxArchimateDiagramsTotal: t.maxArchimateDiagramsTotal,
    maxNonBpmnElementsPerDiagram: t.maxNonBpmnElementsPerDiagram,
    maxBpmnElementsPerDiagram: t.maxBpmnElementsPerDiagram,
    maxAiAttempts: t.maxAiAttempts,
    aiAttemptsResetMonthly: t.aiAttemptsResetMonthly,
    maxIndividualExports: t.maxIndividualExports,
    individualExportsResetMonthly: t.individualExportsResetMonthly,
    maxIndividualImports: t.maxIndividualImports,
    individualImportsResetMonthly: t.individualImportsResetMonthly,
    maxBulkExports: t.maxBulkExports,
    maxBulkImports: t.maxBulkImports,
    trialDays: t.trialDays,
    stripePriceId: t.stripePriceId,
    hasSimulator: t.hasSimulator,
    hasProcessMining: t.hasProcessMining,
    hasRiskControl: t.hasRiskControl,
    hasApqc: t.hasApqc,
  }));

  return <SubscriptionsEditor initialTiers={serialised} />;
}
