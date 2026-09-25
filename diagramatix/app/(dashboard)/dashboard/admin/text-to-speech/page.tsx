import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { TextToSpeechClient } from "./TextToSpeechClient";

export const metadata = { title: "Text to Speech — SuperAdmin" };

export default async function TextToSpeechPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <TextToSpeechClient />;
}
