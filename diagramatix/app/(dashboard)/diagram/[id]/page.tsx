import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { DiagramEditor } from "./DiagramEditor";
import type { DiagramData, DiagramType } from "@/app/lib/diagram/types";
import { EMPTY_DIAGRAM } from "@/app/lib/diagram/types";

type Props = { params: Promise<{ id: string }> };

export default async function DiagramPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const diagram = await prisma.diagram.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!diagram) notFound();

  const data: DiagramData =
    diagram.data && typeof diagram.data === "object" && !Array.isArray(diagram.data)
      ? (diagram.data as unknown as DiagramData)
      : EMPTY_DIAGRAM;

  return (
    <DiagramEditor
      diagramId={diagram.id}
      diagramName={diagram.name}
      diagramType={diagram.type as DiagramType}
      initialData={data}
    />
  );
}
