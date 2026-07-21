import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { ImageLibraryClient } from "./ImageLibraryClient";

export const metadata = { title: "Image Library — SuperAdmin" };

export default async function ImageLibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <ImageLibraryClient />;
}
