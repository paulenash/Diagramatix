import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const source = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    include: { diagrams: true },
  });

  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const newProject = await prisma.project.create({
    data: { name: `${source.name} (Clone)`, userId: session.user.id },
  });

  for (const diagram of source.diagrams) {
    await prisma.diagram.create({
      data: {
        name: diagram.name,
        type: diagram.type,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: diagram.data as any,
        userId: session.user.id,
        projectId: newProject.id,
      },
    });
  }

  return NextResponse.json(newProject, { status: 201 });
}
