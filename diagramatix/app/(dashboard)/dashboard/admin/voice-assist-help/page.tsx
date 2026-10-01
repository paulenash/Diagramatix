import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { VoiceAssistHelpClient } from "./VoiceAssistHelpClient";

export const metadata = { title: "Voice Assist Help — SuperAdmin" };

export default async function VoiceAssistHelpPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <VoiceAssistHelpClient />;
}
