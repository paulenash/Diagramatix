import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isImpersonating } from "@/app/lib/superuser";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cookieStore = await cookies();
    if (isImpersonating(session, cookieStore)) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch {
    // proceed normally
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
    data: {
      name: `${source.name} (Clone)`,
      description: source.description,
      ownerName: source.ownerName,
      userId: session.user.id,
    },
  });

  // Clone diagrams and build old→new ID map for folder tree remapping
  const idMap = new Map<string, string>();
  for (const diagram of source.diagrams) {
    const newDiagram = await prisma.diagram.create({
      data: {
        name: diagram.name,
        type: diagram.type,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: diagram.data as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        colorConfig: diagram.colorConfig as any,
        displayMode: diagram.displayMode,
        userId: session.user.id,
        projectId: newProject.id,
      },
    });
    idMap.set(diagram.id, newDiagram.id);
  }

  // Clone colorConfig and folderTree (with remapped diagram IDs) via raw SQL
  const sourceTree = source.folderTree as Record<string, unknown> | null;
  let clonedTree = sourceTree ?? {};

  if (sourceTree && typeof sourceTree === "object" && Object.keys(sourceTree).length > 0) {
    // Remap diagram IDs in diagramFolderMap
    const oldMap = (sourceTree.diagramFolderMap as Record<string, string>) ?? {};
    const newMap: Record<string, string> = {};
    for (const [oldId, folderId] of Object.entries(oldMap)) {
      const newId = idMap.get(oldId);
      if (newId) newMap[newId] = folderId;
    }

    // Remap diagram IDs in diagramOrder
    const oldOrder = (sourceTree.diagramOrder as Record<string, string[]>) ?? {};
    const newOrder: Record<string, string[]> = {};
    for (const [folderId, ids] of Object.entries(oldOrder)) {
      newOrder[folderId] = ids.map(oid => idMap.get(oid) ?? oid);
    }

    clonedTree = {
      folders: sourceTree.folders ?? [],
      diagramFolderMap: newMap,
      diagramOrder: newOrder,
      folderOrder: sourceTree.folderOrder ?? {},
    };
  }

  await prisma.$executeRawUnsafe(
    'UPDATE "Project" SET "colorConfig" = $1::jsonb, "folderTree" = $2::jsonb WHERE id = $3',
    JSON.stringify(source.colorConfig),
    JSON.stringify(clonedTree),
    newProject.id
  );

  return NextResponse.json(newProject, { status: 201 });
}
