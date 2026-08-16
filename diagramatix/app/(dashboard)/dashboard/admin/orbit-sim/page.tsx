import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { OrbitSimClient } from "./OrbitSimClient";

/** SuperAdmin-only N-body orbit simulator. */
export default async function OrbitSimPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <OrbitSimClient />;
}
