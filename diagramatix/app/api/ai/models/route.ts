import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { resolveGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { allowedGenerateModels, modelCostUsd } from "@/app/lib/ai/modelAccess";
import { aiModelLabel } from "@/app/lib/ai/models";

/**
 * The generate models the CURRENT user may choose from, for the Regenerate control
 * and the AI panels. A normal user gets the current default (`ai.generate.model`)
 * plus every equal-or-cheaper model; a SuperAdmin acting in SuperAdmin mode gets
 * all of them. "SuperAdmin mode" is the client-side view toggle, passed as
 * `?saMode=1`; the actual generate routes independently trust `isSuperuser`, so the
 * param only widens what's DISPLAYED — it can't unlock a model at generate time for
 * a non-superuser.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await resolveGenerateModel(false);
  const saMode = new URL(req.url).searchParams.get("saMode") === "1" && isSuperuser(session);
  const models = allowedGenerateModels(current, saMode).map((m) => ({
    id: m.id,
    label: m.label,
    costUsd: modelCostUsd(m.id),
  }));
  return NextResponse.json({ current: { id: current, label: aiModelLabel(current) }, models });
}
