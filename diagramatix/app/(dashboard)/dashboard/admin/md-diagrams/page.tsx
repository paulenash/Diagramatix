import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { MdDiagramsClient } from "./MdDiagramsClient";

export const metadata = { title: "Create Project Diagrams from .md — SuperAdmin" };

export default async function MdDiagramsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <MdDiagramsClient />;
}
