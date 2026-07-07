/** Build a project folder tree from a PCF branch — Level 2 "structure seeding".
 *  Each PCF node (down to `maxLevel`) becomes a folder "<code> <name>"; the
 *  folder hierarchy mirrors the PCF parent links. Purely additive: the returned
 *  tree keeps the project's existing folders + diagram map and appends the new
 *  ones under `underFolderId` (null = project root). Pure + injectable id-gen so
 *  it's deterministic under test. */
import { randomUUID } from "node:crypto";

export interface SeedFolderNode { id: string; name: string; parentId: string | null; collapsed?: boolean }
export interface SeedFolderTree {
  folders: SeedFolderNode[];
  diagramFolderMap?: Record<string, string>;
  diagramOrder?: Record<string, string[]>;
  folderOrder?: Record<string, string[]>;
}
export interface SeedPcfNode { id: string; hierarchyId: string; name: string; level: number; parentId: string | null }

export function seedFoldersFromPcf(
  existing: SeedFolderTree,
  pcfNodes: SeedPcfNode[],
  opts: { maxLevel: number; underFolderId?: string | null; newId?: () => string },
): { tree: SeedFolderTree; added: number } {
  const newId = opts.newId ?? randomUUID;
  const under = opts.underFolderId ?? null;
  const inScope = pcfNodes.filter((n) => n.level <= opts.maxLevel).sort((a, b) => a.level - b.level);

  const folderIdByPcf = new Map<string, string>();
  const newFolders: SeedFolderNode[] = [];
  for (const n of inScope) {
    const id = newId();
    folderIdByPcf.set(n.id, id);
    // Parent folder = the seeded folder for the PCF parent (if it's in scope),
    // else the chosen root/anchor folder.
    const parentId = n.parentId && folderIdByPcf.has(n.parentId) ? folderIdByPcf.get(n.parentId)! : under;
    newFolders.push({ id, name: `${n.hierarchyId} ${n.name}`, parentId });
  }

  return {
    tree: { ...existing, folders: [...(existing.folders ?? []), ...newFolders] },
    added: newFolders.length,
  };
}
