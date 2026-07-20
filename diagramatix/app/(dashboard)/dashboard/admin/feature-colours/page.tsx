import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { getFeatureColors } from "@/app/lib/theme/featureColorsSetting";
import { FeatureColoursClient } from "./FeatureColoursClient";

/**
 * SuperAdmin: Feature Colours. Set the Background + Text colour for each product /
 * role area; the Highlight (hover / selected) is the background darkened by one
 * global percentage. The scheme is a single global setting applied across the
 * dashboard menus, admin tiles, AI-generation controls and the Entity-Drift ring.
 */
export default async function FeatureColoursPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <FeatureColoursClient initial={await getFeatureColors()} />;
}
