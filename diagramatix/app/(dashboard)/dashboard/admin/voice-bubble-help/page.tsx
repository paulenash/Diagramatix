import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { VoiceBubbleHelpClient } from "./VoiceBubbleHelpClient";

export const metadata = { title: "Voice Assist Bubble Help — SuperAdmin" };

export default async function VoiceBubbleHelpPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <VoiceBubbleHelpClient />;
}
