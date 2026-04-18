import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { DeletedDiagramsClient } from "./DeletedDiagramsClient";

export const metadata = { title: "Diagramatix — Deleted Diagrams" };

export default async function DeletedDiagramsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <DeletedDiagramsClient />;
}
