import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ValueChainLibraryClient } from "../admin/value-chain-library/ValueChainLibraryClient";

export const metadata = { title: "Diagramatix — My Value Chains" };

/**
 * My Value Chains — the value chains a user created with "Create a New Value Chain" (Paul, 2026-10-10), on the same editor the OrgAdmin and the
 * SuperAdmin use. A user sees and manages their own; an OrgAdmin sees every user-created chain in their Org. What each person may do to a given chain
 * is decided by the API (app/api/repository/my-chains), not by this page: it only needs a signed-in user.
 */
export default async function MyValueChainsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <ValueChainLibraryClient scope="mine" />;
}
