import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { VoiceDebugClient } from "./VoiceDebugClient";

export const metadata = { title: "Voice Assist Debug Sessions — SuperAdmin" };

export default async function VoiceDebugPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <VoiceDebugClient />;
}
