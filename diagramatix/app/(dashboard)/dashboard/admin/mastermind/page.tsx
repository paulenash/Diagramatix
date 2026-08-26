import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { MastermindClient } from "./MastermindClient";

/**
 * SuperAdmin: Mastermind, with the code breaker's decision shown as information.
 *
 * The setter configures 6–10 colours and a 3–6 peg code (repeats allowed) and
 * either holds the code, hands it to the tile, or answers from outside. Each turn
 * the breaker sees the Shannon entropy of the guess being built — the bits the
 * setter's answer is expected to hand over — the split that entropy comes from,
 * a ranking of the sharpest questions available, and a picture of what is left.
 *
 * Entirely client-side: no DB, no AI, nothing to save. The engine is exact for
 * every configuration, and says plainly when a ranking is estimated from a sample
 * rather than computed over the whole space.
 */
export default async function MastermindPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <MastermindClient />;
}
