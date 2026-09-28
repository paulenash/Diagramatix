/**
 * Paul, 2026-09-28: "Add image to diagram-bundle." The SuperAdmin diagram
 * bundle carries the image a diagram was AI-generated from (AiSourceImage), so
 * an imported diagram still shows it ("View source image") and re-generates
 * with it. Routes run against the real test database; only the session and
 * the cookie store are faked.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, createProject, addOrgMember, createDiagram } from "../_setup/factories";
import { BUNDLE_VERSION, remapDiagramData, sourceImageIdOf, type DiagramBundle } from "@/app/lib/diagram/diagramBundle";

const sess = vi.hoisted(() => ({ current: null as null | { user: { id: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => sess.current }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { GET as exportBundle } from "@/app/api/admin/diagram-bundle/[id]/route";
import { POST as importBundle } from "@/app/api/admin/import-diagram-bundle/route";
import { GET as viewImage } from "@/app/api/diagrams/[id]/source-image/[imageId]/route";

const as = (u: { id: string; email: string }) => { sess.current = { user: { id: u.id, email: u.email } }; };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6, 7, 8]);
const nameOn = async (diagramId: string, imageId: string) => {
  const data = {
    elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
    aiGeneration: { promptId: "p-none", promptName: "P", promptText: "t", model: "m", generatedAt: "2026-09-28T00:00:00.000Z",
      sourceImage: { id: imageId, name: "Pizza.png", mimeType: "image/png", width: 800, height: 600 } },
  };
  await prisma.$executeRawUnsafe(`UPDATE "Diagram" SET data = $1::jsonb WHERE id = $2`, JSON.stringify(data), diagramId);
};
const keep = (orgId: string, userId: string, bytes = PNG) =>
  prisma.aiSourceImage.create({ data: { orgId, createdById: userId, sha256: `sha-${bytes.toString("hex")}`, mimeType: "image/png", bytes, name: "Pizza.png", width: 800, height: 600 } });
const exportOf = async (id: string) => (await (await exportBundle(new Request("http://x"), { params: Promise.resolve({ id }) })).json()) as DiagramBundle;
const importInto = (projectId: string, bundle: unknown) =>
  importBundle(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bundle, projectId }) }));

async function world() {
  const admin = await createUser({ email: "paul@nashcc.com.au" });   // a SuperAdmin
  const { user: other, org: orgA } = await createUserWithOrg();
  await addOrgMember(admin.id, orgA.id, "Owner");
  const projectA = await createProject({ userId: admin.id, orgId: orgA.id });
  const diagram = await createDiagram({ userId: admin.id, orgId: orgA.id, projectId: projectA.id });
  const { org: orgB } = await createUserWithOrg();
  await addOrgMember(admin.id, orgB.id, "Owner");
  const projectB = await createProject({ userId: admin.id, orgId: orgB.id });
  return { admin, other, orgA, orgB, projectA, projectB, diagram };
}

describe("T5002 — the bundle format: the image id is remapped like the prompt id", () => {
  it("remapDiagramData rewrites aiGeneration.sourceImage.id, keeping its name and size; unmapped is left alone", () => {
    const data = { elements: [], aiGeneration: { promptId: "old-p", promptText: "t", sourceImage: { id: "old-i", name: "Pizza.png", mimeType: "image/png", width: 8 } } };
    const out = remapDiagramData(data, new Map([["old-p", "new-p"]]), new Map([["old-i", "new-i"]])) as typeof data;
    expect(out.aiGeneration.promptId).toBe("new-p");
    expect(out.aiGeneration.sourceImage).toEqual({ id: "new-i", name: "Pizza.png", mimeType: "image/png", width: 8 });
    expect(data.aiGeneration.sourceImage.id, "input not mutated").toBe("old-i");
    const imageOnly = remapDiagramData(data, new Map(), new Map([["old-i", "new-i"]])) as typeof data;
    expect([imageOnly.aiGeneration.promptId, imageOnly.aiGeneration.sourceImage.id]).toEqual(["old-p", "new-i"]);
    expect(remapDiagramData(data, new Map(), new Map())).toBe(data);
    expect(sourceImageIdOf(data)).toBe("old-i");
    expect(sourceImageIdOf({ aiGeneration: { promptId: "p" } })).toBeNull();
    expect(sourceImageIdOf(null)).toBeNull();
    expect(BUNDLE_VERSION).toBe("1.1");
  });
});

describe("T5003 — export carries the kept image — only from the organisation of the diagram that names it", () => {
  beforeEach(async () => { await truncateAll(); });

  it("the image travels whole, base64, with its name and size", async () => {
    const w = await world();
    const img = await keep(w.orgA.id, w.admin.id);
    await nameOn(w.diagram.id, img.id);
    as(w.admin);
    const b = await exportOf(w.diagram.id);
    expect(b.bundleVersion).toBe("1.1");
    expect(b.sourceImages).toHaveLength(1);
    expect(b.sourceImages![0]).toMatchObject({ originalId: img.id, name: "Pizza.png", mimeType: "image/png", width: 800, height: 600 });
    expect(Buffer.from(b.sourceImages![0].data, "base64").equals(PNG)).toBe(true);
  });

  it("an id written into the diagram that names ANOTHER organisation's image is not carried out", async () => {
    const w = await world();
    const foreign = await keep(w.orgB.id, w.admin.id);
    await nameOn(w.diagram.id, foreign.id);
    as(w.admin);
    expect((await exportOf(w.diagram.id)).sourceImages).toEqual([]);
  });
});

describe("T5004 — import keeps it in the TARGET organisation, remapped, checked again, reused", () => {
  beforeEach(async () => { await truncateAll(); });

  it("into another organisation: a new row there, the diagram names it, and “View source image” serves it", async () => {
    const w = await world();
    const img = await keep(w.orgA.id, w.admin.id);
    await nameOn(w.diagram.id, img.id);
    as(w.admin);
    const bundle = await exportOf(w.diagram.id);
    const r = await importInto(w.projectB.id, bundle);
    expect(r.status).toBe(201);
    const { id } = await r.json();
    const made = await prisma.diagram.findUniqueOrThrow({ where: { id } });
    const newImageId = sourceImageIdOf(made.data);
    expect(newImageId).not.toBe(img.id);
    const row = await prisma.aiSourceImage.findUniqueOrThrow({ where: { id: newImageId! } });
    expect([row.orgId, row.createdById, Buffer.from(row.bytes).equals(PNG), row.name, row.width]).toEqual([w.orgB.id, w.admin.id, true, "Pizza.png", 800]);
    const shown = await viewImage(new Request("http://x"), { params: Promise.resolve({ id, imageId: newImageId! }) });
    expect(shown.status).toBe(200);
    expect(Buffer.from(await shown.arrayBuffer()).equals(PNG)).toBe(true);
    // Imported again: the same image row is reused.
    const again = await (await importInto(w.projectB.id, bundle)).json();
    const second = await prisma.diagram.findUniqueOrThrow({ where: { id: again.id } });
    expect(sourceImageIdOf(second.data)).toBe(newImageId);
    expect(await prisma.aiSourceImage.count({ where: { orgId: w.orgB.id } })).toBe(1);
  });

  it("nothing in a bundle is trusted: a non-image is skipped, an image no diagram names is not kept, the diagram still imports; a 1.0 bundle imports as before", async () => {
    const w = await world();
    const img = await keep(w.orgA.id, w.admin.id);
    await nameOn(w.diagram.id, img.id);
    as(w.admin);
    const bundle = await exportOf(w.diagram.id);
    const evil = { ...bundle, sourceImages: [
      { ...bundle.sourceImages![0], mimeType: "text/html", data: Buffer.from("<script>x</script>").toString("base64") },
      // …and an extra image no diagram in the bundle names: never kept.
      { ...bundle.sourceImages![0], originalId: "not-named-anywhere", data: Buffer.from([...PNG, 1]).toString("base64") },
    ] };
    const r = await importInto(w.projectB.id, evil);
    expect(r.status).toBe(201);
    expect(await prisma.aiSourceImage.count({ where: { orgId: w.orgB.id } })).toBe(0);
    const old: Record<string, unknown> = { ...bundle, bundleVersion: "1.0" };
    delete old.sourceImages;
    const r10 = await importInto(w.projectB.id, old);
    expect(r10.status).toBe(201);
    const made = await prisma.diagram.findUniqueOrThrow({ where: { id: (await r10.json()).id } });
    expect(sourceImageIdOf(made.data), "the source id is left, and simply not available here").toBe(img.id);
  });
});
