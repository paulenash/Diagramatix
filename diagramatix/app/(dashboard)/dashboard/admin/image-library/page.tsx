import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isSuperuser } from "@/app/lib/superuser";
import { ImageLibraryClient } from "./ImageLibraryClient";

export const metadata = { title: "Image Library — SuperAdmin" };

export default async function ImageLibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <ImageLibraryClient />;
}
