import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PromptMaintenance } from "./PromptMaintenance";

export const metadata = { title: "Diagramatix — AI Prompt Maintenance" };

export default async function PromptsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return <PromptMaintenance />;
}
