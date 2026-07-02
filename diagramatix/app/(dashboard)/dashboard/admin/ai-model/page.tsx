import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { AI_MODELS } from "@/app/lib/ai/models";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { AiModelClient } from "./AiModelClient";

/**
 * SuperAdmin: choose the Claude model AI Generate uses. The default is Haiku 4.5
 * (consistently the best BPMN generator in practice); a SuperAdmin can switch it
 * to any model the comparison tool offers.
 */
export default async function AiModelPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <AiModelClient models={AI_MODELS} initialModel={await getAiGenerateModel()} />;
}
