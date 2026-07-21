import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { allModels } from "@/app/lib/ai/models";
import { getAiGenerateModel, getAiVisionModel } from "@/app/lib/ai/aiModelSetting";
import { AiModelClient } from "./AiModelClient";

/**
 * SuperAdmin: choose the model AI Generate uses. Default is Haiku 4.5; the list
 * includes any local/self-hosted models declared via AI_CUSTOM_MODELS (which pair
 * with ANTHROPIC_BASE_URL for on-prem AI).
 */
export default async function AiModelPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return (
    <AiModelClient
      models={allModels()}
      initialModel={await getAiGenerateModel()}
      initialVisionModel={(await getAiVisionModel()) ?? ""}
    />
  );
}
