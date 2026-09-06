import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { LifeClient } from "./LifeClient";

/**
 * SuperAdmin: Conway's Game of Life, with a pattern library and a settable rule.
 *
 * Entirely client-side — no DB, no AI, nothing to save. The grid is SPARSE (only
 * live cells are stored), so a generation costs time proportional to the
 * population rather than to the grid, and the acorn's five thousand generations
 * are affordable at any grid size.
 *
 * The rule is not hard-coded. Conway's Life is B3/S23 — born on three
 * neighbours, surviving on two or three — and changing those two sets turns the
 * same engine into HighLife, Seeds, Day & Night or anything else in B/S
 * notation.
 */
export default async function LifePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <LifeClient />;
}
