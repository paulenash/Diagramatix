import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { Life3dClient } from "./Life3dClient";

/**
 * SuperAdmin: Life on a cubic lattice.
 *
 * Entirely client-side. The lattice is SPARSE — only live cubes are stored — so
 * a generation costs 27 lookups per live cube whatever the volume, rather than
 * visiting a million cells of a 100³ array to find that almost all of them are
 * empty.
 *
 * The rule is B6/S567 by default: Carter Bays' closest analogue of Conway's Life
 * in three dimensions, and the one whose gliders this app's own search found.
 * Conway's own B3/S23 is in the list too, so the difference can be watched
 * rather than taken on trust — born on three of twenty-six, a soup runs away.
 */
export default async function Life3dPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <Life3dClient />;
}
