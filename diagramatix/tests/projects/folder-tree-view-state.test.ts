/**
 * Paul, 2026-09-29: "Why is the APQC Project in prod always top left on the
 * Dashboard?" — the Dashboard lists projects by last modified, and expanding
 * or collapsing a folder saved the folder tree and bumped the project's
 * `updatedAt`. Browsing the APQC project's deep PCF folders did that on every
 * click. Only a change to the project's content moves it now.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg, createProject } from "../_setup/factories";
import { folderTreeContentChanged } from "@/app/lib/projects/folderTreeViewState";

const sess = vi.hoisted(() => ({ current: null as null | { user: { id: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => sess.current }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { PUT as putProject } from "@/app/api/projects/[id]/route";

const tree = (collapsed: Record<string, boolean>, extra: { id: string; name: string }[] = []) => ({
  folders: [
    { id: "f1", name: "1.0 Develop Vision and Strategy", parentId: null, ...(collapsed.f1 !== undefined ? { collapsed: collapsed.f1 } : {}) },
    { id: "f2", name: "1.1 Define the business concept", parentId: "f1", ...(collapsed.f2 !== undefined ? { collapsed: collapsed.f2 } : {}) },
    ...extra.map((f) => ({ ...f, parentId: "f1" })),
  ],
  diagramFolderMap: { d1: "f2" },
  folderOrder: { f1: ["f2"] },
});

describe("T5079 — expanding or collapsing folders does not make a project 'last modified'", () => {
  it("a change of expanded/collapsed state (or none, or only key order) is not a content change; anything else is", () => {
    expect(folderTreeContentChanged(tree({}), tree({ f1: true }))).toBe(false);
    expect(folderTreeContentChanged(tree({ f1: true, f2: true }), tree({ f1: false }))).toBe(false);
    expect(folderTreeContentChanged(tree({}), tree({}))).toBe(false);
    const reordered = { folderOrder: { f1: ["f2"] }, diagramFolderMap: { d1: "f2" }, folders: tree({}).folders };
    expect(folderTreeContentChanged(tree({}), reordered), "key order only").toBe(false);
    expect(folderTreeContentChanged(tree({}), tree({}, [{ id: "f3", name: "1.2 New" }])), "a new folder").toBe(true);
    expect(folderTreeContentChanged(tree({}), { ...tree({}), diagramFolderMap: { d1: "f1" } }), "a diagram moved").toBe(true);
    expect(folderTreeContentChanged(null, tree({})), "the first tree").toBe(true);
    expect(folderTreeContentChanged({}, {}), "nothing at all").toBe(false);
  });

  describe("through the project PUT", () => {
    beforeEach(async () => { await truncateAll(); sess.current = null; });

    it("toggling folders leaves updatedAt alone; adding a folder moves it", async () => {
      const { user, org } = await createUserWithOrg();
      const project = await createProject({ userId: user.id, orgId: org.id, name: "APQC PCF" });
      sess.current = { user: { id: user.id, email: user.email } };
      const put = (body: unknown) => putProject(new Request("http://x", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id: project.id }) });
      const stamp = async () => (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).updatedAt.getTime();

      expect((await put({ folderTree: tree({}) })).status).toBe(200);
      const t0 = await stamp();
      await new Promise((r) => setTimeout(r, 20));
      expect((await put({ folderTree: tree({ f1: true }) })).status).toBe(200);
      expect(await stamp(), "collapsing a folder is not a modification").toBe(t0);
      const stored = (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).folderTree as { folders: { id: string; collapsed?: boolean }[] };
      expect(stored.folders.find((f) => f.id === "f1")?.collapsed, "…but the state is still saved").toBe(true);

      await new Promise((r) => setTimeout(r, 20));
      expect((await put({ folderTree: tree({ f1: true }, [{ id: "f3", name: "1.2 New" }]) })).status).toBe(200);
      expect(await stamp(), "a new folder is").toBeGreaterThan(t0);
    });
  });
});
