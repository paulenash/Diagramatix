import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { getPcfLevelColors } from "@/app/lib/pcf/levelColorsSetting";
import { PcfColoursClient } from "./PcfColoursClient";

/**
 * SuperAdmin: APQC PCF Hierarchy Colour Maintenance. Refine the main colour and
 * light-shade percentage for each of the five PCF levels (Category → Task). The
 * scheme is a single global setting applied wherever the APQC hierarchy renders.
 */
export default async function PcfColoursPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <PcfColoursClient initial={await getPcfLevelColors()} />;
}
