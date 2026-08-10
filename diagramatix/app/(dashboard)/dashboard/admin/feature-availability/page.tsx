import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { FeatureAvailabilityEditor } from "./FeatureAvailabilityEditor";

export const metadata = { title: "Feature Availability — SuperAdmin" };

export default async function FeatureAvailabilityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <FeatureAvailabilityEditor />;
}
