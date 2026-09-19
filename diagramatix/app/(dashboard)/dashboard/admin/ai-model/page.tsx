import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { allModels } from "@/app/lib/ai/models";
import {
  getAiGenerateModel, getAiVisionModel,
  getAiCommandModel, DEFAULT_AI_COMMAND_MODEL, AI_COMMAND_MODEL_KEY,
} from "@/app/lib/ai/aiModelSetting";
import { prisma } from "@/app/lib/db";
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
  // The STORED override, not the effective model: "" has to mean "following
  // the default" so the picker can say so instead of inventing an override.
  const storedCommand = await prisma.appSetting
    .findUnique({ where: { key: AI_COMMAND_MODEL_KEY } })
    .catch(() => null);
  return (
    <AiModelClient
      models={allModels()}
      initialModel={await getAiGenerateModel()}
      initialVisionModel={(await getAiVisionModel()) ?? ""}
      initialCommandModel={storedCommand?.value?.trim() ?? ""}
      commandModelDefault={DEFAULT_AI_COMMAND_MODEL}
      commandModelInUse={await getAiCommandModel()}
    />
  );
}
