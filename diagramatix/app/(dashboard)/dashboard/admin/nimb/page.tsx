import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { NimbClient } from "./NimbClient";

/**
 * SuperAdmin: n × n Nimb — a two-player misère placement game, with a solver.
 *
 * Rules: an n × n grid; a turn places 1–4 x's on CONSECUTIVE empty squares in a
 * single row or column; no passing; whoever places the LAST x loses.
 *
 * Entirely client-side — no DB, no AI, nothing to save. The solver is exhaustive
 * for n ≤ 4 (16 squares ≈ 65k positions, ~100ms) and the tile says plainly when
 * a board is too large to solve rather than offering a guess dressed as analysis.
 */
export default async function NimbPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <NimbClient />;
}
