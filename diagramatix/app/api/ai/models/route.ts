import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getEffectiveUserId, isSuperuser } from "@/app/lib/superuser";
import { resolveOrgModel } from "@/app/lib/ai/orgModels";
import { allowedGenerateModels, modelCostUsd } from "@/app/lib/ai/modelAccess";
import { aiModelLabel, providerForModel } from "@/app/lib/ai/models";
import { listUserAiKeys } from "@/app/lib/ai/userAiKey";

/**
 * The generate models the CURRENT user may choose from, for the Regenerate control
 * and the AI panels. A normal user gets the current default (`ai.generate.model`)
 * plus every equal-or-cheaper model; a SuperAdmin acting in SuperAdmin mode gets
 * all of them. "SuperAdmin mode" is the client-side view toggle, passed as
 * `?saMode=1`; the actual generate routes independently trust `isSuperuser`, so the
 * param only widens what's DISPLAYED — it can't unlock a model at generate time for
 * a non-superuser.
 *
 * A provider the user has supplied their OWN key for is also listed, even when the
 * deployment has no key for it. Without that, storing a key unlocks nothing — the
 * picker is built from the deployment's environment, which has never heard of the
 * provider. Each such model is flagged `ownKey`, because a user has to be able to
 * see which choices spend their money rather than their allowance.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The EFFECTIVE user: a SuperAdmin viewing someone else sees what THAT person
  // can choose, since it is their key that would pay (SEC-21).
  const cookieStore = await cookies();
  const userId = getEffectiveUserId(session, cookieStore) ?? session.user.id;

  let byo = new Set<string>();
  try {
    byo = new Set((await listUserAiKeys(userId)).map((k) => k.provider));
  } catch { /* no own keys is the normal case; never fail the picker over it */ }

  // Only a SuperAdmin ever sees a model name (Paul, 2026-10-05: "Only OrgAdmins and SuperAdmins should ever see what model is being used";
  // an OrgAdmin sees theirs on their own AI Models page). Everyone else gets nothing to show and nothing to pick.
  if (!isSuperuser(session)) return NextResponse.json({ current: null, models: [] });

  // The model in force for THIS person: their Org's for an ordinary user, the global setting for a SuperAdmin (orgModels.ts).
  const current = await resolveOrgModel({ hasImage: false });
  const saMode = new URL(req.url).searchParams.get("saMode") === "1" && isSuperuser(session);
  // Ordinary users do not choose (Paul, 2026-10-05): the list is the one model in force. A SuperAdmin in SuperAdmin mode gets them all.
  const offered = saMode ? allowedGenerateModels(current, true, byo) : allowedGenerateModels(current, false, byo).filter((m) => m.id === current);
  const models = offered.map((m) => ({
    id: m.id,
    label: m.label,
    costUsd: modelCostUsd(m.id),
    /** True when this model runs on the user's own key, not the deployment's. */
    ownKey: byo.has(providerForModel(m.id)),
  }));
  return NextResponse.json({ current: { id: current, label: aiModelLabel(current) }, models });
}
