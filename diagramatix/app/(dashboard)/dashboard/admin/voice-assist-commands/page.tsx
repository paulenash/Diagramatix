import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { VoiceAssistCommandsClient } from "./VoiceAssistCommandsClient";

/**
 * SuperAdmin reference: every command Voice Assist accepts, by family, with
 * example phrases — rendered from `app/lib/assist/commandCatalog.ts`, the same
 * catalogue behind the bar's "Commands" button, which a test holds to the
 * grammar (every example must parse). Read-only: the phrasings are code; what
 * IS editable is linked from the page.
 */
export default async function VoiceAssistCommandsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <VoiceAssistCommandsClient />;
}
