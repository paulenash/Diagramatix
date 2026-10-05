/**
 * Stage 2 — photograph a whiteboard on the phone and get a diagram
 * (Paul, 2026-09-28: "Then onto Stage 2 - Photograph a whiteboard").
 *
 * The plan: "take a photo of a whiteboard or sketch and get a diagram; the photo
 * is kept ("View source image"), as on desktop … resize on the phone to ≤ 2576
 * px JPEG … whiteboard wording in the prompt; the spoken correction outranks
 * the photo; Free Form off for photos." Approved: "voice correction beats the
 * photo".
 *
 * Pure parts first; then the server run against the real test database (the
 * model call faked, its arguments captured).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, createProject, addProjectShare, addOrgMember, createDiagram } from "../_setup/factories";
import { fitPhoto, photoName, PHOTO_MAX_EDGE, PHOTO_MAX_PIXELS } from "@/app/lib/mobile/photoShrink";
import {
  PHOTO_CORRECTIONS_HEADING, WHITEBOARD_PHOTO_OPENING, isWhiteboardPhotoPrompt, photoNoteParts, whiteboardPhotoNote, withPhotoNote,
} from "@/app/lib/ai/promptPreambles";
import { imageNameInPrompt, regenerateFreeForm, uploadSourceImageBlob, storeSourceImage } from "@/app/lib/ai/sourceImage";
import {
  EMPTY_DRAFT, draftFromFailedJob, draftToRequest, draftWordsForStorage, draftWordsFromStorage, photoToUpload, withRestoredPhoto,
  type GenerateDraft,
} from "@/app/lib/mobile/generateDraft";
import { nextAiGeneration } from "@/app/lib/ai/applyGeneration";
import type { DiagramData } from "@/app/lib/diagram/types";

const read = (p: string) => readFileSync(p, "utf8");

const sess = vi.hoisted(() => ({ current: null as null | { user: { id: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => sess.current }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const ai = vi.hoisted(() => ({
  model: "claude-opus-5",
  lastOpts: null as null | Record<string, unknown>,
  hasImageAsked: [] as boolean[],
  failNext: false,
}));
vi.mock("@/app/lib/ai/planBpmn", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/ai/planBpmn")>()),
  planBpmn: vi.fn(async (opts: Record<string, unknown>) => {
    ai.lastOpts = opts;
    if (ai.failNext) { ai.failNext = false; return { ok: false, status: 529, error: "overloaded_error" }; }
    return {
      ok: true, model: "claude-opus-5",
      plan: {
        elements: [
          { id: "p1", type: "pool", label: "Claims", poolType: "white-box" },
          { id: "e1", type: "start-event", label: "Claim in", pool: "p1" },
          { id: "t1", type: "task", label: "Check claim", taskType: "user", pool: "p1" },
          { id: "e2", type: "end-event", label: "Paid", pool: "p1" },
        ],
        connections: [{ sourceId: "e1", targetId: "t1", type: "sequence" }, { sourceId: "t1", targetId: "e2", type: "sequence" }],
      },
    };
  }),
}));
vi.mock("@/app/lib/ai/aiModelSetting", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/ai/aiModelSetting")>()),
  resolveGenerateModel: async (hasImage: boolean) => { ai.hasImageAsked.push(hasImage); return ai.model; },
}));
// The route asks the per-Org resolver now (2026-10-05); the question it asks — "is there an image?" — is the same.
vi.mock("@/app/lib/ai/orgModels", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/ai/orgModels")>()),
  resolveOrgModel: async (o: { hasImage?: boolean } = {}) => { ai.hasImageAsked.push(!!o.hasImage); return ai.model; },
}));
vi.mock("@/app/lib/ai/anthropicClient", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/ai/anthropicClient")>()),
  aiApiKey: () => "test-key",
}));
vi.mock("@/app/lib/subscription-route", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/subscription-route")>()),
  gateLimit: async () => null,
  gateElementCount: async () => null,
  recordUsage: async () => {},
}));

import { POST as startJob, GET as latestJob } from "@/app/api/diagrams/[id]/generate/route";
import { GET as viewImage } from "@/app/api/diagrams/[id]/source-image/[imageId]/route";
import { buildBpmnRequest } from "@/app/lib/ai/planBpmn";

// ── pure ─────────────────────────────────────────────────────────────────────

describe("T5033 — the phone shrinks a photo to what the model reads at full detail", () => {
  it("within 2576px on the long edge AND ~3.75 MP; the area binds first for a 4:3 photo; never enlarged", () => {
    expect(fitPhoto(4032, 3024)).toEqual({ w: 2236, h: 1677 });
    expect(fitPhoto(3024, 4032)).toEqual({ w: 1677, h: 2236 });
    expect(fitPhoto(8064, 6048)).toEqual({ w: 2236, h: 1677 });
    expect(fitPhoto(4032, 2268)).toEqual({ w: 2576, h: 1449 });
    expect(fitPhoto(1920, 1080), "small enough already").toEqual({ w: 1920, h: 1080 });
    for (const [w, h] of [[4032, 3024], [4032, 2268], [12000, 1000]]) {
      const f = fitPhoto(w, h);
      expect(Math.max(f.w, f.h)).toBeLessThanOrEqual(PHOTO_MAX_EDGE);
      expect(f.w * f.h).toBeLessThanOrEqual(PHOTO_MAX_PIXELS);
    }
  });

  it("the photo's name has no brackets, so the prompt that names it reads back", () => {
    const name = photoName(new Date(2026, 8, 28, 14, 5));
    expect(name).toBe("Whiteboard photo 2026-09-28 14.05.jpg");
    expect(imageNameInPrompt(whiteboardPhotoNote(name))).toBe(name);
  });
});

describe("T5034 — the prompt says it is a photo, and that the person's words win over it", () => {
  const name = "Whiteboard photo 2026-09-28 14.05.jpg";

  it("the note alone; the note with corrections under their heading; taken apart again for a retry", () => {
    expect(withPhotoNote(name, "")).toBe(whiteboardPhotoNote(name));
    const full = withPhotoNote(name, "  The approval happens before payment. ");
    expect(full).toBe(`${whiteboardPhotoNote(name)}\n\n${PHOTO_CORRECTIONS_HEADING}\nThe approval happens before payment.`);
    expect(isWhiteboardPhotoPrompt(full)).toBe(true);
    expect(isWhiteboardPhotoPrompt("A customer orders a pizza.")).toBe(false);
    expect(photoNoteParts(full)).toEqual({ imageName: name, words: "The approval happens before payment." });
    expect(photoNoteParts(whiteboardPhotoNote(name))).toEqual({ imageName: name, words: "" });
    expect(whiteboardPhotoNote(name), "roles, never a person's name").toContain("never an individual person's name");
  });

  it("with the photo attached, the model is told to read it as a whiteboard and to FOLLOW THE TEXT where they disagree", () => {
    const img = { type: "image" as const, data: "AAAA", mediaType: "image/jpeg", name };
    const req = buildBpmnRequest({ apiKey: "k", prompt: withPhotoNote(name, "Approval before payment."), rules: "", attachment: img });
    expect(req.system).toContain("The image is a PHOTO of a whiteboard");
    expect(req.system).toContain("FOLLOW THE TEXT PROMPT");
    expect(req.system).not.toContain("Where the prompt CONTRADICTS the image, prefer the image.");
    expect(req.system).toContain("On a whiteboard a sticky note is usually a STEP");
    const text = (req.messages[0].content as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    expect(text).toContain("CORRECTS the photo: where the two disagree, follow the text, not the photo");
    expect(text).not.toContain("prefer what the image shows");
  });

  it("every other image keeps its wording exactly: the image is the source of truth", () => {
    const img = { type: "image" as const, data: "AAAA", mediaType: "image/png", name: "diagram.png" };
    const req = buildBpmnRequest({ apiKey: "k", prompt: "I have attached an image of a process diagram (diagram.png).", rules: "", attachment: img });
    expect(req.system).toContain("Where the prompt CONTRADICTS the image, prefer the image.");
    expect(req.system).not.toContain("PHOTO of a whiteboard");
    // …and a photo prompt with no image attached changes nothing either.
    const noImg = buildBpmnRequest({ apiKey: "k", prompt: withPhotoNote(name, ""), rules: "" });
    expect(noImg.system).not.toContain("PHOTO of a whiteboard");
  });
});

describe("T5035 — the draft with a photo", () => {
  const photo = { name: "Whiteboard photo 2026-09-28 14.05.jpg", width: 2236, height: 1677, storedId: "img1" };
  const d = (x: Partial<GenerateDraft>): GenerateDraft => ({ ...EMPTY_DRAFT, ...x });

  it("the photo alone is enough; words go under the corrections heading; no spoken-description note; never a saved prompt", () => {
    expect(draftToRequest(d({ photo }))).toEqual({ prompt: whiteboardPhotoNote(photo.name) });
    const r = draftToRequest(d({ photo, prompt: "Approval first.", dictated: true, selected: { id: "s", name: "S", text: "t" } }));
    expect(r).toEqual({ prompt: withPhotoNote(photo.name, "Approval first."), promptSource: "dictated" });
    expect(r.prompt.startsWith(WHITEBOARD_PHOTO_OPENING)).toBe(true);
  });

  it("a failed photo run comes back with its (kept) photo and the person's own words", () => {
    const job = { promptText: withPhotoNote(photo.name, "Approval first."), sourceImageId: "img1" };
    expect(withRestoredPhoto(draftFromFailedJob(job.promptText), job)).toEqual({
      ...EMPTY_DRAFT, prompt: "Approval first.", photo: { storedId: "img1", name: photo.name, width: 0, height: 0 },
    });
    const words = { promptText: "Plain words.", sourceImageId: null };
    expect(withRestoredPhoto(draftFromFailedJob(words.promptText), words).photo).toBeNull();
  });

  it("the words wait in the tab while the camera has the screen, and come back", () => {
    const back = draftWordsFromStorage(draftWordsForStorage(d({ prompt: "Said so far", dictated: true, photo })));
    expect(back).toEqual({ prompt: "Said so far", dictated: true, questions: [] });
    expect(draftWordsFromStorage("not json")).toBeNull();
    expect(draftWordsFromStorage(null)).toBeNull();
  });

  it("the generation record names an already-kept photo (the server's save); a still-to-upload one waits (desktop)", () => {
    const linked = { id: "p", name: "P", autoNamed: true };
    const meta = { promptText: "t", model: "m", promptFromImage: true, freeForm: false,
      sourceImage: { name: photo.name, mediaType: "image/jpeg", storedId: "img1", width: 2236, height: 1677 } };
    expect(nextAiGeneration({ prev: undefined, linked, meta, generatedAt: "g" })).toMatchObject({
      fromImage: true, freeForm: false,
      sourceImage: { id: "img1", name: photo.name, mimeType: "image/jpeg", width: 2236, height: 1677 },
    });
    const later = nextAiGeneration({ prev: undefined, linked, meta: { ...meta, sourceImage: { name: "x.png", mediaType: "image/png", data: "AAAA" } }, generatedAt: "g" })!;
    expect("sourceImage" in later).toBe(false);
  });
});

// ── the server run ───────────────────────────────────────────────────────────

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 1, 2, 3, 4, 5, 6]);
const as = (u: { id: string; email: string } | null) => { sess.current = u ? { user: { id: u.id, email: u.email } } : null; };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string, body: unknown) => startJob(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), params(id));
const dataOf = async (id: string) => (await prisma.diagram.findUniqueOrThrow({ where: { id } })).data as unknown as DiagramData;
const NAME = "Whiteboard photo 2026-09-28 14.05.jpg";

async function world() {
  const { user: owner, org } = await createUserWithOrg();
  const colleague = await createUser(); await addOrgMember(colleague.id, org.id, "Viewer");
  const viewer = await createUser(); await addOrgMember(viewer.id, org.id, "Viewer");
  const project = await createProject({ userId: owner.id, orgId: org.id });
  await addProjectShare(project.id, viewer.id, "VIEW");
  const diagram = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id, name: "Claims" });
  await prisma.diagram.update({ where: { id: diagram.id }, data: { type: "bpmn" } });
  await prisma.$executeRawUnsafe(`UPDATE "Diagram" SET data = $1::jsonb WHERE id = $2`,
    JSON.stringify({ elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } }), diagram.id);
  const keep = (userId: string, orgId = org.id, bytes = JPEG) => prisma.aiSourceImage.create({
    data: { orgId, sha256: `${userId}-${bytes.length}-${Math.random()}`, mimeType: "image/jpeg", bytes, name: NAME, width: 2236, height: 1677, createdById: userId },
  });
  return { owner, org, colleague, viewer, diagram, keep };
}
async function finished(jobId: string) {
  for (let i = 0; i < 200; i++) {
    const j = await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: jobId } });
    if (j.status === "succeeded" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("job never finished");
}

beforeEach(async () => {
  await truncateAll();
  ai.model = "claude-opus-5";
  ai.lastOpts = null;
  ai.hasImageAsked = [];
  ai.failNext = false;
  as(null);
});

describe("T5036 — a photo run: the photo read, laid out normally, and kept with the diagram", () => {
  it("the model gets the photo (JPEG, base64, Free Form off) with the vision model; the diagram records it; a viewer can see it", async () => {
    const w = await world();
    const img = await w.keep(w.owner.id);
    as(w.owner);
    const r = await post(w.diagram.id, { prompt: withPhotoNote(NAME, "Approval first."), promptSource: "dictated", sourceImageId: img.id });
    expect(r.status).toBe(202);
    const done = await finished((await r.json()).jobId);
    expect(done).toMatchObject({ status: "succeeded", sourceImageId: img.id });

    expect(ai.hasImageAsked).toEqual([true]);
    const att = ai.lastOpts!.attachment as { type: string; mediaType: string; data: string; name: string };
    expect(att).toMatchObject({ type: "image", mediaType: "image/jpeg", name: NAME });
    expect(Buffer.from(att.data, "base64").equals(JPEG)).toBe(true);
    expect(ai.lastOpts!.captureGeometry, "Free Form off").toBeUndefined();

    const gen = (await dataOf(w.diagram.id)).aiGeneration!;
    expect(gen).toMatchObject({ fromImage: true, freeForm: false, sourceImage: { id: img.id, name: NAME, mimeType: "image/jpeg", width: 2236, height: 1677 } });
    expect(regenerateFreeForm(gen, undefined), "a desktop re-generate starts with Free Form off").toBe(false);
    expect((await dataOf(w.diagram.id)).relaxedLayout).toBeUndefined();
    const prompt = await prisma.prompt.findUniqueOrThrow({ where: { id: gen.promptId } });
    expect(prompt.fromImage).toBe(true);

    as(w.viewer);
    const seen = await viewImage(new Request("http://x"), { params: Promise.resolve({ id: w.diagram.id, imageId: img.id }) });
    expect(seen.status, "“View source image” works for the diagram's viewers").toBe(200);
  });

  it("a FAILED run is tried again with the same photo: the run gives it back, the retry reuses it (no upload)", async () => {
    const w = await world();
    const img = await w.keep(w.owner.id);
    as(w.owner);
    ai.failNext = true;
    const first = await (await post(w.diagram.id, { prompt: withPhotoNote(NAME, "Approval first."), promptSource: "typed", sourceImageId: img.id })).json();
    expect((await finished(first.jobId)).status).toBe("failed");
    const view = (await (await latestJob(new Request("http://x"), params(w.diagram.id))).json()).job;
    expect(view).toMatchObject({ status: "failed", sourceImageId: img.id });
    // What the phone rebuilds from it — the kept photo and the person's words — and sends again.
    const back = withRestoredPhoto(draftFromFailedJob(view.promptText), view);
    expect(back).toMatchObject({ prompt: "Approval first.", photo: { storedId: img.id } });
    expect(photoToUpload(back), "already kept: reuse, do not upload").toBe("reuse");
    const retry = await post(w.diagram.id, { ...draftToRequest(back), sourceImageId: back.photo!.storedId });
    expect(retry.status).toBe(202);
    expect((await finished((await retry.json()).jobId)).status).toBe("succeeded");
    const att = ai.lastOpts!.attachment as { data: string };
    expect(Buffer.from(att.data, "base64").equals(JPEG), "the same photo").toBe(true);
    expect(await prisma.aiSourceImage.count()).toBe(1);
  });

  it("photoToUpload: a fresh photo uploads, a kept one is reused, one with neither is missing, none is none", () => {
    const blob = new Blob([JPEG as BlobPart], { type: "image/jpeg" });
    expect(photoToUpload({ ...EMPTY_DRAFT, photo: { blob, name: NAME, width: 1, height: 1 } })).toBe("upload");
    expect(photoToUpload({ ...EMPTY_DRAFT, photo: { storedId: "i", name: NAME, width: 0, height: 0 } })).toBe("reuse");
    expect(photoToUpload({ ...EMPTY_DRAFT, photo: { name: NAME, width: 0, height: 0 } })).toBe("missing");
    expect(photoToUpload(EMPTY_DRAFT)).toBe("none");
  });

  it("a text-only run on the phone still asks for the ordinary (non-vision) model", async () => {
    const w = await world();
    as(w.owner);
    const r = await post(w.diagram.id, { prompt: "A claim comes in and is checked." });
    expect(r.status).toBe(202);
    await finished((await r.json()).jobId);
    expect(ai.hasImageAsked).toEqual([false]);
    expect(ai.lastOpts!.attachment).toBeUndefined();
  });
});

describe("T5037 — whose photo, which model, and a photo that has gone", () => {
  it("only the caller's OWN photo, in the diagram's organisation: a colleague's or another org's id is refused, no run", async () => {
    const w = await world();
    const theirs = await w.keep(w.colleague.id);
    const other = await createUserWithOrg();
    const elsewhere = await w.keep(w.owner.id, other.org.id);
    as(w.owner);
    for (const id of [theirs.id, elsewhere.id, "no-such-image"]) {
      const r = await post(w.diagram.id, { prompt: withPhotoNote(NAME, ""), sourceImageId: id });
      expect(r.status, id).toBe(400);
      expect((await r.json()).error).toBe("image_gone");
    }
    expect(await prisma.diagramGenerateJob.count()).toBe(0);
  });

  it("a model that cannot read images is refused up front with what to do", async () => {
    const w = await world();
    const img = await w.keep(w.owner.id);
    ai.model = "deepseek-flash"; // text-only (models.ts: vision false)
    // The DeepSeek models are listed only where DeepSeek is configured, as it is when one is chosen.
    const was = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    as(w.owner);
    let r: Response;
    try { r = await post(w.diagram.id, { prompt: withPhotoNote(NAME, ""), sourceImageId: img.id }); }
    finally { if (was === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = was; }
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("Vision model");
  });

  it("a photo gone before the run reads it fails as such", async () => {
    const w = await world();
    const img = await w.keep(w.owner.id);
    const job = await prisma.diagramGenerateJob.create({ data: { diagramId: w.diagram.id, userId: w.owner.id, orgId: w.org.id, promptText: withPhotoNote(NAME, ""), sourceImageId: img.id } });
    await prisma.aiSourceImage.delete({ where: { id: img.id } });
    const { runGenerateJob } = await import("@/app/lib/ai/generateJob");
    await runGenerateJob({
      jobId: job.id, diagramId: w.diagram.id, userId: w.owner.id, promptOwnerId: w.owner.id, orgId: w.org.id,
      aiContext: { userId: w.owner.id, orgId: w.org.id, invocationPoint: "mobile.generate" }, ownKey: null,
      model: "claude-opus-5", apiKey: "k", prompt: withPhotoNote(NAME, ""), promptMeta: {}, baseVersion: 0,
      diagramOrgId: w.org.id, sourceImageId: img.id,
    });
    expect(await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "failed", errorCode: "image_gone" });
  });
});

describe("T5038 — the phone's upload says why it failed; the sheet and screen are wired", () => {
  const res = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body }) as Response;

  it("uploadSourceImageBlob: the kept record, or the status and reason; the desktop helper still gives null on failure", async () => {
    const blob = new Blob([JPEG as BlobPart], { type: "image/jpeg" });
    const ok = await uploadSourceImageBlob("d1", blob, NAME, 2236, 1677, (async () => res(201, { id: "i1", name: NAME, mimeType: "image/jpeg" })) as unknown as typeof fetch);
    expect(ok).toEqual({ ok: true, image: { id: "i1", name: NAME, mimeType: "image/jpeg", width: 2236, height: 1677 } });
    const big = await uploadSourceImageBlob("d1", blob, NAME, 1, 1, (async () => res(413, { error: "Too large" })) as unknown as typeof fetch);
    expect(big).toEqual({ ok: false, status: 413, error: "Too large" });
    const offline = await uploadSourceImageBlob("d1", blob, NAME, 1, 1, (async () => { throw new Error("offline"); }) as unknown as typeof fetch);
    expect(offline).toEqual({ ok: false, status: null, error: null });
    expect(await storeSourceImage("d1", { name: "a.png", mediaType: "image/png", data: "AAAA" }, (async () => res(500, {})) as unknown as typeof fetch)).toBeNull();
  });

  it("the sheet: Take photo (camera) and Choose photo; the photo alone can Generate; Tidy and saved prompts put away with a photo", () => {
    const sheet = read("app/components/mobile/MobileGenerateSheet.tsx");
    expect(sheet).toContain('accept="image/*" {...(capture ? { capture: "environment" as const } : {})}');
    expect(sheet).toContain('photoInput(true, "📷 Take photo"');
    expect(sheet).toContain('photoInput(false, "🖼 Choose photo"');
    expect(sheet).toContain("const canSend = hasText || hasPhoto;");
    expect(sheet).toContain("{!hasPhoto && <div className=\"flex items-center gap-2 mt-3\">");
    expect(sheet).toContain("{showSaved && !hasPhoto && (");
    expect(sheet, "the words are kept before the camera takes the screen").toContain("sessionStorage.setItem(draftStorageKey(diagramId), draftWordsForStorage(d))");
    expect(sheet, "no browser dialogs").not.toMatch(/\b(alert|confirm|prompt)\(/);
  });

  it("the screen: the photo is kept first (once), then the run starts with its id; a failed run gives the photo back; View photo", () => {
    const screen = read("app/m/diagram/[id]/MobileDiagramScreen.tsx");
    expect(screen).toContain("const kept = await uploadSourceImageBlob(diagramId, sent, src.photo.name, src.photo.width, src.photo.height);");
    expect(screen).toContain("const photoStep = photoToUpload(src);");
    expect(screen).toContain("const body = { ...request, ...(sourceImageId ? { sourceImageId } : {}) };");
    expect(screen).toContain("body: JSON.stringify({ ...body, version: d.version }),");
    expect(screen).toContain("withRestoredPhoto(draftFromFailedJob(job.promptText, job.selectedPrompt), job)");
    expect(screen).toContain("📷 Photograph a whiteboard");
    expect(screen).toContain("sourceImageUrl(diagramId, d.data.aiGeneration.sourceImage.id)");
  });
});

describe("T5039 — the 2026-09-28 review of stage 2", () => {
  it("a prompt written for a photo is not run without it (a saved photo prompt picked again)", async () => {
    const w = await world();
    as(w.owner);
    const r = await post(w.diagram.id, { prompt: withPhotoNote(NAME, "Approval first.") });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("photo_needed");
    expect(await prisma.diagramGenerateJob.count()).toBe(0);
    const sheet = read("app/components/mobile/MobileGenerateSheet.tsx");
    expect(sheet, "the phone keeps its corrections and asks for the photo").toContain("if (isWhiteboardPhotoPrompt(p.text)) {");
  });

  it("unused phone photos are deleted after a week; a named one, a recent one, a desktop image and a live run's are kept", async () => {
    const w = await world();
    const { sweepUnusedPhonePhotos, KEEP_UNUSED_PHOTOS_MS } = await import("@/app/lib/ai/generateJob");
    const old = new Date(Date.now() - KEEP_UNUSED_PHOTOS_MS - 60_000);
    const mk = (name: string, createdAt: Date, bytes: Buffer) => prisma.aiSourceImage.create({
      data: { orgId: w.org.id, sha256: `${name}-${createdAt.getTime()}-${bytes.length}`, mimeType: "image/jpeg", bytes, name, createdById: w.owner.id, createdAt },
    });
    const unused = await mk("Whiteboard photo 2026-09-01 10.00.jpg", old, Buffer.from([1]));
    const named = await mk("Whiteboard photo 2026-09-01 10.01.jpg", old, Buffer.from([2]));
    const recent = await mk("Whiteboard photo 2026-09-28 10.02.jpg", new Date(), Buffer.from([3]));
    const desktop = await mk("Pizza Delivery.png", old, Buffer.from([4]));
    const live = await mk("Whiteboard photo 2026-09-01 10.03.jpg", old, Buffer.from([5]));
    const inHistory = await mk("Whiteboard photo 2026-09-01 10.04.jpg", old, Buffer.from([6]));
    await prisma.$executeRawUnsafe(`UPDATE "Diagram" SET data = $1::jsonb WHERE id = $2`,
      JSON.stringify({ elements: [], connectors: [], aiGeneration: { sourceImage: { id: named.id, name: named.name, mimeType: "image/jpeg" } } }), w.diagram.id);
    await prisma.diagramGenerateJob.create({ data: { diagramId: w.diagram.id, userId: w.owner.id, orgId: w.org.id, promptText: "x", status: "running", sourceImageId: live.id } });
    await prisma.diagramHistory.create({ data: { diagramId: w.diagram.id, snapshot: { data: { aiGeneration: { sourceImage: { id: inHistory.id } } } } as never } });

    await sweepUnusedPhonePhotos();
    const left = new Set((await prisma.aiSourceImage.findMany({ select: { id: true } })).map((r) => r.id));
    expect(left.has(unused.id), "unused, a week old: gone").toBe(false);
    for (const [k, r] of Object.entries({ named, recent, desktop, live, inHistory })) expect(left.has(r.id), k).toBe(true);
  });

  it("Free Form ticked on a photo prompt asks for the drawn layout consistently; the prompt export shows the photo wording", () => {
    const img = { type: "image" as const, data: "AAAA", mediaType: "image/jpeg", name: NAME };
    const req = buildBpmnRequest({ apiKey: "k", prompt: withPhotoNote(NAME, ""), rules: "", attachment: img, captureGeometry: true });
    const text = (req.messages[0].content as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    expect(req.system).toContain("GEOMETRY CAPTURE");
    expect(text).toContain("we are reproducing the photo's layout");
    expect(text).not.toContain("do not reproduce the photo's positions");
    expect(read("app/api/ai/generate-bpmn/export-prompt/route.ts")).toContain("imageSourceFor(promptText");
  });

  it("the phone: a replaced photo never takes the old one's id; the run owns the words once started; the viewer's taps stay in the viewer", () => {
    const screen = read("app/m/diagram/[id]/MobileDiagramScreen.tsx");
    expect(screen).toContain("cur.photo && cur.photo.blob === sent ? { ...cur, photo: { ...cur.photo, storedId: kept.image.id } } : cur");
    expect(screen).toMatch(/r\.status === 202[\s\S]{0,200}sessionStorage\.removeItem\(draftStorageKey\(diagramId\)\)/);
    expect(screen, "a failed photo run wins over words kept for the camera").toContain("function restoreFailedRun(\n  cur: GenerateDraft,");
    expect(read("app/components/mobile/MobilePhotoViewer.tsx").match(/e\.stopPropagation\(\); onClose\(\);/g) ?? []).toHaveLength(2);
    const sheet = read("app/components/mobile/MobileGenerateSheet.tsx");
    expect(sheet).toContain("disabled={photoBusy || tidying || starting}");
  });

  it("the image limit is the model's conservative 5 MB (base64), and the phone's photo always fits it", async () => {
    const { MAX_ENCODED_IMAGE_BYTES } = await import("@/app/lib/ai/generateJob");
    const { PHOTO_MAX_OUTPUT_BYTES } = await import("@/app/lib/mobile/photoShrink");
    expect(MAX_ENCODED_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    expect(Math.ceil(PHOTO_MAX_OUTPUT_BYTES / 3) * 4).toBeLessThanOrEqual(MAX_ENCODED_IMAGE_BYTES);
  });
});
