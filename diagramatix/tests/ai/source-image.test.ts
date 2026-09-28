/**
 * The image an AI generation was drawn from, kept (Paul, 2026-09-28):
 *   a) "generating from an image which needs "Free Form" set on seems to work
 *      fine, but I need a way to view the image after the diagram has been
 *      generated."
 *   b) "When re-generating there is no way to check "Free Form" for the
 *      regenerated diagram. Investigate and correct."
 * The image was never kept, so a re-generate had none: the Free Form choice
 * (which needs one) was hidden, the model drew from the file name, and the
 * layout came back auto-stacked with relaxedLayout wiped.
 *
 * The routes run against the real test database; only the signed-in session
 * and the cookie store are faked.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, createProject, addProjectShare, addOrgMember, createDiagram } from "../_setup/factories";
import {
  imageNameInPrompt, loadSourceImage, regenerateFreeForm, sourceImageUrl, storeSourceImage,
} from "@/app/lib/ai/sourceImage";
import { reducer } from "@/app/hooks/useDiagram";
import { eraseUser } from "@/app/lib/account/eraseUser";
import type { DiagramData } from "@/app/lib/diagram/types";

const sess = vi.hoisted(() => ({ current: null as null | { user: { id: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => sess.current }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { POST } from "@/app/api/diagrams/[id]/source-image/route";
import { GET } from "@/app/api/diagrams/[id]/source-image/[imageId]/route";

const as = (u: { id: string; email: string } | null) => { sess.current = u ? { user: { id: u.id, email: u.email } } : null; };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const upload = (diagramId: string, bytes: Uint8Array = PNG, type = "image/png", name = "Pizza Delivery.png", headers: Record<string, string> = {}) => {
  const form = new FormData();
  form.append("file", new File([bytes as BlobPart], name, { type }));
  form.append("width", "1600");
  form.append("height", "900");
  const req = { headers: new Headers(headers), formData: async () => form } as unknown as Request;
  return POST(req, { params: Promise.resolve({ id: diagramId }) });
};
const view = (diagramId: string, imageId: string) => GET(new Request("http://x"), { params: Promise.resolve({ id: diagramId, imageId }) });
/** Name the image on the saved diagram — as the editor's autosave does (JSON writes go through raw SQL). */
const nameOn = async (diagramId: string, imageId: string) => {
  const data = { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 }, aiGeneration: { sourceImage: { id: imageId, name: "Pizza Delivery.png", mimeType: "image/png" } } };
  await prisma.$executeRawUnsafe(`UPDATE "Diagram" SET data = $1::jsonb WHERE id = $2`, JSON.stringify(data), diagramId);
};

async function world() {
  const { user: owner, org } = await createUserWithOrg();
  const viewer = await createUser(); await addOrgMember(viewer.id, org.id, "Viewer");
  const outsider = await createUser();
  const project = await createProject({ userId: owner.id, orgId: org.id });
  await addProjectShare(project.id, viewer.id, "VIEW");
  const diagram = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id });
  return { owner, org, viewer, outsider, diagram };
}

describe("T4996 — the image is kept: once per organisation, only by someone who can edit the diagram", () => {
  beforeEach(async () => { await truncateAll(); });

  it("the editor keeps it with its size, in the diagram's organisation; the same image again is the same row", async () => {
    const w = await world();
    as(w.owner);
    const r = await upload(w.diagram.id);
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j).toMatchObject({ name: "Pizza Delivery.png", mimeType: "image/png", width: 1600, height: 900 });
    const row = await prisma.aiSourceImage.findUniqueOrThrow({ where: { id: j.id } });
    expect([row.orgId, row.createdById, Buffer.from(row.bytes).equals(Buffer.from(PNG))]).toEqual([w.org.id, w.owner.id, true]);
    const again = await upload(w.diagram.id);
    expect(again.status).toBe(200);
    expect((await again.json()).id).toBe(j.id);
    expect(await prisma.aiSourceImage.count()).toBe(1);
  });

  it("a colleague's identical image is never revealed: the same bytes from someone else are their own row, under their own name", async () => {
    const w = await world();
    as(w.owner);
    const mine = await (await upload(w.diagram.id, PNG, "image/png", "secret-screenshot.png")).json();
    const colleague = await createUser(); await addOrgMember(colleague.id, w.org.id, "Viewer");
    const theirs = await createDiagram({ userId: colleague.id, orgId: w.org.id, projectId: null });
    as(colleague);
    const r = await upload(theirs.id, PNG, "image/png", "whiteboard.png");
    expect(r.status, "not 200: nothing says the org has seen these bytes").toBe(201);
    const j = await r.json();
    expect(j.id).not.toBe(mine.id);
    expect(j.name).toBe("whiteboard.png");
  });

  it("refused: signed out (401), a VIEW collaborator (403), an outsider (403), not an image the model reads (415), too large (413)", async () => {
    const w = await world();
    as(null); expect((await upload(w.diagram.id)).status).toBe(401);
    as(w.viewer); expect((await upload(w.diagram.id)).status).toBe(403);
    as(w.outsider); expect((await upload(w.diagram.id)).status).toBe(403);
    as(w.owner);
    expect((await upload(w.diagram.id, new TextEncoder().encode("<svg/>"), "image/svg+xml", "x.svg")).status).toBe(415);
    expect((await upload(w.diagram.id, new TextEncoder().encode("hello"), "text/plain", "x.txt")).status).toBe(415);
    expect((await upload(w.diagram.id, PNG, "image/png", "big.png", { "content-length": String(20 * 1024 * 1024) })).status).toBe(413);
    expect(await prisma.aiSourceImage.count()).toBe(0);
  });
});

describe("T4997 — the image is seen only THROUGH a diagram that names it, in its own organisation", () => {
  beforeEach(async () => { await truncateAll(); });

  it("named on the diagram: its editor and its viewers see it, served safely", async () => {
    const w = await world();
    as(w.owner);
    const { id } = await (await upload(w.diagram.id)).json();
    await nameOn(w.diagram.id, id);
    for (const who of [w.owner, w.viewer]) {
      as(who);
      const r = await view(w.diagram.id, id);
      expect(r.status).toBe(200);
      expect(Buffer.from(await r.arrayBuffer()).equals(Buffer.from(PNG))).toBe(true);
      expect(r.headers.get("content-type")).toBe("image/png");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("content-security-policy")).toContain("sandbox");
    }
    as(w.outsider);
    expect((await view(w.diagram.id, id)).status).toBe(403);
  });

  it("before the autosave names it, only the person who stored it can see it", async () => {
    const w = await world();
    as(w.owner);
    const { id } = await (await upload(w.diagram.id)).json();
    expect((await view(w.diagram.id, id)).status).toBe(200);
    as(w.viewer);
    expect((await view(w.diagram.id, id)).status).toBe(404);
  });

  it("an id written into a diagram never reaches another organisation's image", async () => {
    const w = await world();
    const b = await createUserWithOrg();
    const other = await createDiagram({ userId: b.user.id, orgId: b.org.id, projectId: null });
    as(b.user);
    const { id: theirs } = await (await upload(other.id, new Uint8Array([...PNG, 9, 9]))).json();
    await nameOn(w.diagram.id, theirs);          // crafted into org A's diagram
    as(w.owner);
    expect((await view(w.diagram.id, theirs)).status).toBe(404);
    expect((await view(w.diagram.id, "cnonexistent000000000000")).status).toBe(404);
  });
});

describe("T4998 — the client half: keep it, load it back, and what a re-generate offers", () => {
  it("Free Form's default on a re-generate: as chosen, else as the diagram is", () => {
    expect(regenerateFreeForm({ freeForm: false }, true)).toBe(false);
    expect(regenerateFreeForm({ freeForm: true }, undefined)).toBe(true);
    expect(regenerateFreeForm({}, true), "Paul's original — generated before the choice was recorded").toBe(true);
    // Nothing to restore: undefined, so the console's own default (ticked) stands.
    expect(regenerateFreeForm(undefined, undefined)).toBeUndefined();
    expect(regenerateFreeForm({}, false)).toBeUndefined();
  });

  it("the image a “from an image” prompt names — for the “attach it again” note", () => {
    expect(imageNameInPrompt("I have attached an image of a process diagram (Pizza Delivery - 2 white-box pools and free format.jpg). Reverse-engineer the BPMN from it."))
      .toBe("Pizza Delivery - 2 white-box pools and free format.jpg");
    expect(imageNameInPrompt("Draw the claims process (as agreed).")).toBeNull();
    expect(imageNameInPrompt(undefined)).toBeNull();
  });

  it("storeSourceImage posts the image once; a re-attached one is not sent again; a failure only loses the link", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const ok = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body });
      return new Response(JSON.stringify({ id: "img1", name: "p.png", mimeType: "image/png" }), { status: 201 });
    }) as unknown as typeof fetch;
    const b64 = Buffer.from(PNG).toString("base64");
    expect(await storeSourceImage("d1", { name: "p.png", mediaType: "image/png", data: b64, width: 10, height: 5 }, ok))
      .toEqual({ id: "img1", name: "p.png", mimeType: "image/png", width: 10, height: 5 });
    expect(calls[0].url).toBe("/api/diagrams/d1/source-image");
    const sent = (calls[0].body as FormData).get("file") as File;
    expect(Buffer.from(await sent.arrayBuffer()).equals(Buffer.from(PNG))).toBe(true);
    expect((calls[0].body as FormData).get("width")).toBe("10");
    expect(await storeSourceImage("d1", { name: "p.png", mediaType: "image/png", storedId: "img1" }, ok)).toEqual({ id: "img1", name: "p.png", mimeType: "image/png" });
    expect(calls).toHaveLength(1);
    const fail = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    expect(await storeSourceImage("d1", { name: "p.png", mediaType: "image/png", data: b64 }, fail)).toBeNull();
    expect(await storeSourceImage("d1", { name: "p.svg", mediaType: "image/svg+xml", data: b64 }, ok)).toBeNull();
  });

  it("loadSourceImage turns the stored bytes back into the consoles' base64 attachment", async () => {
    const f = (async (url: string) => {
      expect(url).toBe(sourceImageUrl("d 1", "img1"));
      return new Response(PNG as BodyInit, { status: 200, headers: { "content-type": "image/png" } });
    }) as unknown as typeof fetch;
    expect(await loadSourceImage("d 1", { id: "img1", name: "p.png", mimeType: "image/png" }, f))
      .toEqual({ data: Buffer.from(PNG).toString("base64"), mediaType: "image/png" });
  });
});

describe("T4999 — wired: kept at apply, shown in Properties, re-attached with Free Form on a re-generate", () => {
  const ed = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
  const plan = readFileSync("app/(dashboard)/diagram/[id]/PlanPanel.tsx", "utf8");

  it("apply shows the diagram at once; the image lands on THAT generation when its upload does; Free Form is never wiped", () => {
    expect(ed).toContain("void storeSourceImage(diagramId, meta.sourceImage).then((img) => { if (img) setAiSourceImage(stamp, img); });");
    expect(ed, "no longer held back for the upload").not.toContain("Promise.all([");
    expect(ed).toContain("...(meta.freeForm !== undefined ? { freeForm: meta.freeForm } : {}),");
    expect(ed).toContain("...(meta.promptFromImage !== undefined ? { fromImage: meta.promptFromImage } : {}),");
    expect(ed).toContain("relaxedLayout: aiData.relaxedLayout ?? (meta?.freeForm ? true : undefined),");
    for (const f of ["app/(dashboard)/diagram/[id]/PlanPanel.tsx", "app/(dashboard)/diagram/[id]/ai-generate/AiGenerateScreen.tsx"]) {
      const src = readFileSync(f, "utf8");
      // The plain apply AND the compare fill.
      expect(src.split(`freeForm: !flatPlan && attachment?.type === "image" ? preserveLayout : undefined,`).length - 1, f).toBe(2);
      expect(src.split(/sourceImage: attachment\?\.type === "image" \? \{/).length - 1, f).toBe(2);
    }
    expect(readFileSync("app/(dashboard)/diagram/[id]/AiPanel.tsx", "utf8").split("sourceImage: attachment?.type === \"image\" && attachment.mediaType").length - 1).toBe(2);
  });

  it("a re-generate prefills Free Form and the kept image — or says the image was not kept, only when it was drawn from one", () => {
    expect(ed).toContain("const freeForm = regenerateFreeForm(gen, data.relaxedLayout);");
    expect(ed).toContain("...(freeForm !== undefined ? { freeForm } : {}),");
    expect(ed).toContain("const drawnFromImage = gen.fromImage ?? (fromImage || !!imageNameInPrompt(promptText));");
    expect(ed).toContain("...(gen.sourceImage ? { sourceImage: gen.sourceImage } : {}),");
    expect(ed).toContain("initialFreeForm={aiPrefill?.freeForm}");
    expect(ed.split("initialSourceImage={aiPrefill?.sourceImage}").length - 1, "all three consoles").toBe(3);
    expect(plan).toContain("if (initialFreeForm !== undefined) setPreserveLayout(initialFreeForm);");
    // The re-attach is guarded (useReattachSourceImage): whatever the user does meanwhile wins, and Plan waits.
    const hook = readFileSync("app/(dashboard)/diagram/[id]/useReattachSourceImage.ts", "utf8");
    expect(hook).toContain("if (mine !== token.current) return;");
    for (const [f, src] of [["PlanPanel", plan], ["AiPanel", readFileSync("app/(dashboard)/diagram/[id]/AiPanel.tsx", "utf8")]] as const) {
      expect(src, f).toContain("reattach.start(stored, (img) => {");
      expect(src, f).toContain("<button onClick={() => { reattach.cancel(); setAttachment(null); }}");
      expect(src, f).toMatch(/reattach\.cancel\(\);\s+setImageNotKept\(null\);/);
    }
    expect(plan).toContain("disabled={!prompt.trim() || busy !== null || !!reattach.pending}");
    expect(plan).toContain("Attaching the source image ({reattach.pending})…");
    expect(plan).toContain("Free Form — reproduce the image&apos;s layout");
    expect(plan).toContain("that wasn&apos;t kept. Attach it again to use it");
    expect(plan, "the model picker is read when it changes").toContain("}, [prompt, setPlan, attachment, apiBase, preserveLayout, pcf?.nodeId, model]);");
  });

  it("Diagram Properties offers “View source image”; a Save As copy never rewrites its original's prompt", () => {
    const props = readFileSync("app/components/canvas/PropertiesPanel.tsx", "utf8");
    expect(props).toContain("{aiGeneration.sourceImage && diagramId && (");
    expect(props).toContain("View source image");
    expect(props).toContain("url: sourceImageUrl(diagramId, aiGeneration.sourceImage.id) }}");
    expect(ed).toContain("data: data.aiGeneration?.autoNamed ? { ...data, aiGeneration: { ...data.aiGeneration, autoNamed: false } } : data,");
  });
});

describe("T5000 — the image lands on its own generation, and goes with a user who is erased", () => {
  beforeEach(async () => { await truncateAll(); });

  it("SET_AI_SOURCE_IMAGE patches only the generation it belongs to", () => {
    const img = { id: "img1", name: "p.png", mimeType: "image/png" };
    const base = { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
      aiGeneration: { promptId: "p", promptName: "P", promptText: "t", model: "m", generatedAt: "2026-09-28T01:00:00.000Z" } } as unknown as DiagramData;
    const hit = reducer(base, { type: "SET_AI_SOURCE_IMAGE", payload: { generatedAt: "2026-09-28T01:00:00.000Z", sourceImage: img } });
    expect(hit.aiGeneration?.sourceImage).toEqual(img);
    expect(hit.aiGeneration?.promptText, "the rest of the record kept").toBe("t");
    const later = reducer(base, { type: "SET_AI_SOURCE_IMAGE", payload: { generatedAt: "2026-09-28T00:59:00.000Z", sourceImage: img } });
    expect(later, "a superseded generation's image is dropped").toBe(base);
    const none = { ...base, aiGeneration: undefined } as DiagramData;
    expect(reducer(none, { type: "SET_AI_SOURCE_IMAGE", payload: { generatedAt: "x", sourceImage: img } })).toBe(none);
  });

  it("erasing a user erases the images they kept — except one a remaining diagram still names", async () => {
    const w = await world();
    const leaver = await createUser(); await addOrgMember(leaver.id, w.org.id, "Viewer");
    const theirs = await createDiagram({ userId: leaver.id, orgId: w.org.id, projectId: null });
    as(leaver);
    const gone = await (await upload(theirs.id, PNG, "image/png", "a.png")).json();
    const kept = await (await upload(theirs.id, new Uint8Array([...PNG, 7]), "image/png", "b.png")).json();
    await nameOn(w.diagram.id, kept.id);         // the owner's diagram names one of them
    await eraseUser(leaver.id);
    expect(await prisma.aiSourceImage.findUnique({ where: { id: gone.id } })).toBeNull();
    expect(await prisma.aiSourceImage.findUnique({ where: { id: kept.id } })).not.toBeNull();
  });
});

describe("T5001 — the NEW AI Generate console too (Paul, 2026-09-28: “Don't forget to check New AI Generate!!”)", () => {
  const ed = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
  const ag = readFileSync("app/(dashboard)/diagram/[id]/ai-generate/AiGenerateScreen.tsx", "utf8");
  const sp = readFileSync("app/(dashboard)/diagram/[id]/ai-generate/SourcesPanel.tsx", "utf8");
  const props = readFileSync("app/components/canvas/PropertiesPanel.tsx", "utf8");

  it("Diagram Properties can re-generate IN the new console — for whoever can open it", () => {
    expect(props).toContain("in ✨ NEW");
    expect(props).toContain("onRegenerateNew={onRegenerateNew}");
    expect(ed).toContain(`onRegenerateNew={!readOnly && diagramType === "bpmn" && aiAllowedHere && isActingAdmin ? (m: string) => { void handleRegenerate(m, "new"); } : undefined}`);
    expect(ed).toContain(`if (console === "new") { setShowAiGenerateScreen(true); setShowPlanPanel(false); setShowAiPanel(false); }`);
    expect(ed).toContain("initialFreeForm={aiPrefill?.freeForm}");
  });

  it("…and there the kept image goes back on, with Free Form as it was — guarded, with Plan waiting for it", () => {
    expect(ag).toContain("if (initialFreeForm !== undefined) setPreserveLayout(initialFreeForm);");
    expect(ag).toContain("reattach.start(stored, (img) => {");
    expect(ag).toContain("onRemoveAttachment={() => { reattach.cancel(); setAttachment(null); imageDimsRef.current = null; }}");
    expect(ag).toMatch(/const handleFileAttach = useCallback\(async \(file: File\) => \{\s+reattach\.cancel\(\);/);
    expect(ag).toMatch(/reattach\.cancel\(\);\s+setImageNotKept\(null\);/);
    expect(ag).toContain("disabled={!prompt.trim() || busy !== null || !!reattach.pending}");
    expect(ag).toContain("Attaching the source image (${reattach.pending})…");
    expect(ag).toContain("that wasn't kept. Attach it again to use it");
    expect(ag.split("...(attachment.storedId ? { storedId: attachment.storedId } : { data: attachment.data }),").length - 1, "apply and compare: not uploaded again").toBe(2);
    expect(sp).toContain("{sourceNote && (");
    expect(sp).toContain("Free Form — reproduce the image&apos;s layout");
  });
});
