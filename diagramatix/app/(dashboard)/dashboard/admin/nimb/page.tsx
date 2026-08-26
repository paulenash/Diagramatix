import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { NimbClient } from "./NimbClient";

/**
 * SuperAdmin: n × n Nimb — a two-player misère placement game, with a solver.
 *
 * Rules: an n × n grid; a turn places 1..n x's — up to a whole line — on
 * CONSECUTIVE empty squares in a single row or column; no passing; whoever
 * places the LAST x loses.
 *
 * Entirely client-side — no DB, no AI, nothing to save. The solver is exhaustive
 * to n = 5: up to 4 × 4 inline (65k positions, ~100ms), 5 × 5 in a worker
 * (33.5M positions, ~3s, solved once). Beyond that the tile says plainly that a
 * board is too large rather than offering a guess dressed up as analysis.
 */
export default async function NimbPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <NimbClient />;
}
