import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { VoiceAssistTestClient } from "./VoiceAssistTestClient";

export const metadata = { title: "Test Voice Assist — SuperAdmin" };

export default async function VoiceAssistTestPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <VoiceAssistTestClient />;
}
