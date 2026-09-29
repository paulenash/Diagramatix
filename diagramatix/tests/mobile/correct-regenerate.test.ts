/**
 * Stage 3 — "✎ Correct" and re-generate on the phone
 * (Paul, 2026-09-28: "Follow on with Stage 3").
 *
 * The plan: "At the end: say what's wrong ('the approval happens before
 * payment') and re-generate. Appends to the prompt; warns that the whole
 * diagram, and its review comments, will be replaced."
 *
 * Pure parts first; then the server run against the real test database (the
 * model call faked, its arguments captured).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, createProject, addProjectShare, addOrgMember, createDiagram } from "../_setup/factories";
import {
  CORRECTIONS_HEADING, PHOTO_CORRECTIONS_HEADING, correctionAdded, hasCorrections, regeneratePromptText, withCorrection, withPhotoNote,
  withSpokenPreamble, photoNoteParts,
} from "@/app/lib/ai/promptPreambles";
import {
  correctionErrorText, correctionFromRun, correctionRefusalText, correctionRequest, correctionSource, replaceWarning, reviewCommentCount,
} from "@/app/lib/mobile/correction";
import { CLARIFICATIONS_HEADER, appendClarifications, appendRefinements } from "@/app/lib/diagram/clarifications";
import { nextAiGeneration } from "@/app/lib/ai/applyGeneration";
import type { DiagramData } from "@/app/lib/diagram/types";

const read = (p: string) => readFileSync(p, "utf8");

const sess = vi.hoisted(() => ({ current: null as null | { user: { id: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => sess.current }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const ai = vi.hoisted(() => ({
  lastOpts: null as null | Record<string, unknown>,
  /** Runs inside the model call — something that happens while the AI is working. */
  during: null as null | (() => Promise<void>),
  label: "Check claim",
}));
vi.mock("@/app/lib/ai/planBpmn", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/ai/planBpmn")>()),
  planBpmn: vi.fn(async (opts: Record<string, unknown>) => {
    ai.lastOpts = opts;
    if (ai.during) { const f = ai.during; ai.during = null; await f(); }
    return {
      ok: true, model: "claude-opus-5",
      plan: {
        elements: [
          { id: "p1", type: "pool", label: "Claims", poolType: "white-box" },
          { id: "e1", type: "start-event", label: "Claim in", pool: "p1" },
          { id: "t1", type: "task", label: ai.label, taskType: "user", pool: "p1" },
          { id: "e2", type: "end-event", label: "Paid", pool: "p1" },
        ],
        connections: [{ sourceId: "e1", targetId: "t1", type: "sequence" }, { sourceId: "t1", targetId: "e2", type: "sequence" }],
      },
    };
  }),
}));
vi.mock("@/app/lib/ai/aiModelSetting", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/ai/aiModelSetting")>()),
  resolveGenerateModel: async () => "claude-opus-5",
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

import { POST as startJob } from "@/app/api/diagrams/[id]/generate/route";
import { buildBpmnRequest, buildSystemPrompt } from "@/app/lib/ai/planBpmn";
import { editorSource } from "../diagram/assistApplySource";

const NAME = "Whiteboard photo 2026-09-28 14.05.jpg";
const userText = (req: ReturnType<typeof buildBpmnRequest>) =>
  (req.messages[0].content as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");

// ── pure ─────────────────────────────────────────────────────────────────────

describe("T5040 — a correction goes on the END of the prompt, and they add up", () => {
  it("under its own heading; a second one is another bullet; read back exactly", () => {
    const base = "A customer submits a claim. The claims officer pays it, then approves it.";
    const once = withCorrection(base, "  The approval happens before payment. ");
    expect(once).toBe(`${base}\n\n${CORRECTIONS_HEADING}\n- The approval happens before payment.`);
    const twice = withCorrection(once, "Rejected claims are emailed.");
    expect(twice).toBe(`${once}\n- Rejected claims are emailed.`);
    expect(hasCorrections(base)).toBe(false);
    expect(hasCorrections(once)).toBe(true);
    expect(correctionAdded(base, once)).toBe("The approval happens before payment.");
    expect(correctionAdded(once, twice)).toBe("Rejected claims are emailed.");
    expect(withCorrection(base, "   "), "nothing said, nothing added").toBe(base);
  });

  it("a bare photo's first words go under the photo's own heading; later ones under CORRECTIONS, which outranks those words too", () => {
    const bare = withPhotoNote(NAME, "");
    const one = withCorrection(bare, "Approval first.");
    expect(one).toBe(withPhotoNote(NAME, "Approval first."));
    expect(photoNoteParts(one)?.words, "read back as the photo's words").toBe("Approval first.");
    const two = withCorrection(one, "Payments are made by Finance.");
    expect(two).toBe(`${one}\n\n${CORRECTIONS_HEADING}\n- Payments are made by Finance.`);
    expect(two.split(PHOTO_CORRECTIONS_HEADING)).toHaveLength(2);
    expect(correctionAdded(bare, one)).toBe("Approval first.");
    expect(correctionAdded(one, two)).toBe("Payments are made by Finance.");
    const three = withCorrection(two, "Accounts pays refunds.");
    expect(three).toBe(`${two}\n- Accounts pays refunds.`);
    expect(correctionAdded(two, three)).toBe("Accounts pays refunds.");
  });

  it("a correction never lands inside a CLARIFICATIONS block added after it, nor answers inside CORRECTIONS", () => {
    const fb = (q: string, a: string) => ({ questions: [{ q, a }] }) as never;
    const c1 = withCorrection("Claims process.", "Approval first.");
    const answered = appendClarifications(c1, fb("Who pays?", "Finance"));
    const c2 = withCorrection(answered, "Rejected claims are emailed.");
    expect(c2).toBe(`${answered}\n\n${CORRECTIONS_HEADING}\n- Rejected claims are emailed.`);
    expect(correctionAdded(answered, c2)).toBe("Rejected claims are emailed.");
    // …and a Refine round after a correction starts its own block, where it is still merged next time.
    const refined = appendRefinements(c1, [{ label: "Trigger", answer: "Customer submits claim" }]);
    expect(refined).toBe(`${c1}\n\n${CLARIFICATIONS_HEADER}\n- Trigger: Customer submits claim`);
    expect(appendRefinements(refined, [{ label: "End", answer: "Paid" }])).toBe(`${refined}\n- End: Paid`);
  });

  it("the desktop re-generate starts from the diagram's record when it is the linked prompt plus corrections it never got", () => {
    const row = "A claim is paid.";
    const snap = withCorrection(row, "Approval first.");
    expect(regeneratePromptText(row, snap), "an editor's correction is not dropped").toBe(snap);
    expect(regeneratePromptText("An edited prompt.", snap), "a prompt edited since wins").toBe("An edited prompt.");
    expect(regeneratePromptText(row, row)).toBe(row);
    expect(regeneratePromptText(row, `${row} More words.`), "only corrections, not any longer text").toBe(row);
    expect(editorSource()).toContain("promptText = regeneratePromptText(p.text, gen.promptText);");
  });

  it("a spoken description keeps its note at the top; the server's trim does not lose the read-back", () => {
    const spoken = withSpokenPreamble("um so a claim comes in and it gets paid");
    const c = withCorrection(`  ${spoken}  `, "Approval first.");
    expect(c.startsWith(spoken)).toBe(true);
    expect(correctionAdded(spoken, c.trim())).toBe("Approval first.");
  });

  it("anything that is not the base plus one correction reads back as nothing", () => {
    const base = "A claim is paid.";
    expect(correctionAdded(base, base)).toBeNull();
    expect(correctionAdded(base, "Something else entirely, and longer.")).toBeNull();
    expect(correctionAdded(base, `${base} and more`)).toBeNull();
    expect(correctionAdded("", "x")).toBeNull();
  });
});

describe("T5041 — a correction wins over an attached image; nothing else changes", () => {
  const png = { type: "image" as const, data: "AAAA", mediaType: "image/png", name: "diagram.png" };

  it("a diagram image: the image is still the source of truth — EXCEPT the corrections", () => {
    const req = buildBpmnRequest({ apiKey: "k", prompt: withCorrection("From the attached diagram.", "Approval first."), rules: "", attachment: png });
    expect(req.system).toContain("Where the prompt CONTRADICTS the image, prefer the image. EXCEPT the CORRECTIONS at the end of the prompt");
    expect(userText(req)).toContain("The one exception is the CORRECTIONS section at the end of the text");
  });

  it("with no corrections the wording is exactly what it was", () => {
    const req = buildBpmnRequest({ apiKey: "k", prompt: "From the attached diagram.", rules: "", attachment: png });
    expect(req.system).toBe(buildSystemPrompt("", false, "diagram"));
    expect(req.system).not.toContain("CORRECTIONS");
    expect(userText(req)).not.toContain("CORRECTIONS");
    // and a correction with no image attached only adds the words
    const words = buildBpmnRequest({ apiKey: "k", prompt: withCorrection("A claim is paid.", "Approval first."), rules: "" });
    expect(words.system).toBe(buildSystemPrompt("", false));
  });

  it("a whiteboard photo already follows the words: its wording is not doubled", () => {
    const jpg = { type: "image" as const, data: "AAAA", mediaType: "image/jpeg", name: NAME };
    const req = buildBpmnRequest({ apiKey: "k", prompt: withCorrection(withPhotoNote(NAME, ""), "Approval first."), rules: "", attachment: jpg });
    expect(req.system).toContain("FOLLOW THE TEXT PROMPT");
    expect(req.system).not.toContain("EXCEPT the CORRECTIONS");
  });

  it("the SuperAdmin prompt export shows the same wording", () => {
    expect(read("app/api/ai/generate-bpmn/export-prompt/route.ts")).toContain("correctionsOverrideImage(promptText");
  });
});

describe("T5042 — what the phone re-generates from, and what it warns", () => {
  const base = (g: Record<string, unknown> | undefined, elements: unknown[] = []): DiagramData =>
    ({ elements, connectors: [], ...(g ? { aiGeneration: g } : {}) }) as unknown as DiagramData;
  const gen = { promptId: "p", promptName: "P", promptText: "A claim is paid.", model: "m", generatedAt: "g" };

  it("a generated diagram: its prompt; one drawn from a kept image: that image too; one whose image was not kept: refused", () => {
    expect(correctionSource(base(undefined))).toEqual({ ok: false, reason: "not_generated" });
    expect(correctionSource(base({ ...gen, promptText: "  " }))).toEqual({ ok: false, reason: "not_generated" });
    expect(correctionSource(base(gen))).toEqual({ ok: true, basePrompt: "A claim is paid.", sourceImageId: null, imageName: null, freeForm: false });
    const photo = { ...gen, promptText: withPhotoNote(NAME, ""), fromImage: true, sourceImage: { id: "img1", name: NAME, mimeType: "image/jpeg" } };
    expect(correctionSource(base(photo))).toMatchObject({ ok: true, sourceImageId: "img1", imageName: NAME });
    expect(correctionSource(base({ ...gen, fromImage: true }))).toEqual({ ok: false, reason: "image_not_kept" });
    expect(correctionSource(base({ ...gen, promptText: withPhotoNote(NAME, "") }))).toEqual({ ok: false, reason: "image_not_kept" });
  });

  it("an older image diagram (no record) or a document one — desktop, or the Partner API's — is refused; a Free Form one is re-generated as Free Form (2026-09-29)", () => {
    expect(correctionSource(base({ ...gen, promptText: "I have attached an image of a process diagram (invoice.png). Reverse-engineer the BPMN from it." })))
      .toEqual({ ok: false, reason: "image_not_kept" });
    expect(correctionSource(base({ ...gen, promptText: "I have attached a document, SOP.pdf" }))).toEqual({ ok: false, reason: "document_not_kept" });
    expect(correctionSource(base({ ...gen, promptText: "Model this. The attached document describes the process. Follow it.", source: "partner-api" })))
      .toEqual({ ok: false, reason: "document_not_kept" });
    expect(correctionSource(base({ ...gen, fromDocument: true }))).toEqual({ ok: false, reason: "document_not_kept" });
    expect(correctionSource(base({ ...gen, fromImage: false, promptText: "Explain (invoice.png) naming." })), "the record wins over the words").toMatchObject({ ok: true });
    const kept = { id: "img1", name: "d.png", mimeType: "image/png" };
    expect(correctionSource(base({ ...gen, fromImage: true, freeForm: true, sourceImage: kept }))).toMatchObject({ ok: true, freeForm: true });
    expect(correctionSource({ ...base({ ...gen, fromImage: true, sourceImage: kept }), relaxedLayout: true } as DiagramData)).toMatchObject({ ok: true, freeForm: true });
    expect(correctionSource({ ...base({ ...gen, fromImage: false }), relaxedLayout: true } as DiagramData), "no image: laid out normally").toMatchObject({ ok: true, freeForm: false });
    for (const r of ["not_generated", "image_not_kept", "document_not_kept"] as const) expect(correctionRefusalText(r).length).toBeGreaterThan(20);
  });

  it("the record says what a generation was drawn from — a document too — in every console and the Partner API", () => {
    const linked = { id: "p", name: "P", autoNamed: true };
    expect(nextAiGeneration({ prev: undefined, linked, meta: { promptText: "t", model: "m", promptFromImage: false, promptFromDocument: true }, generatedAt: "g" }))
      .toMatchObject({ fromImage: false, fromDocument: true });
    for (const f of ["app/(dashboard)/diagram/[id]/ai-generate/AiGenerateScreen.tsx", "app/(dashboard)/diagram/[id]/AiPanel.tsx", "app/(dashboard)/diagram/[id]/PlanPanel.tsx"]) {
      expect(read(f).match(/promptFromDocument: !!attachment && attachment\.type !== "image",/g) ?? [], f).toHaveLength(2);
    }
    expect(read("app/lib/partner/worker.ts")).toContain(`fromDocument: input.attachment.type !== "image"`);
  });

  it("a failure is said in the phone's terms, not the empty diagram's", () => {
    expect(correctionErrorText("worker_lost", "This generation was interrupted before it finished. Tap Generate to try again.")).not.toContain("Generate");
    expect(correctionErrorText("image_gone", "x")).toContain("can’t be re-generated on the phone");
    expect(correctionErrorText("ai_failed", "AI planning failed: overloaded")).toBe("AI planning failed: overloaded");
  });

  it("the request: the corrected prompt, the image again, an explicit replace of the version on screen; read back from the run", () => {
    const src = correctionSource(base({ ...gen, sourceImage: { id: "img1", name: "d.png", mimeType: "image/png" } }));
    if (!src.ok) throw new Error("expected ok");
    const req = correctionRequest(src, "Approval first.", 7);
    expect(req).toEqual({ prompt: withCorrection("A claim is paid.", "Approval first."), version: 7, replace: true, sourceImageId: "img1", freeForm: false });
    expect(correctionRequest(src, "Approval first.", 7, true).freeForm, "the sheet's choice").toBe(true);
    expect("freeForm" in correctionRequest({ ...src, sourceImageId: null }, "x", 7, true), "no image, no Free Form").toBe(false);
    expect(correctionFromRun(base(gen), req.prompt)).toBe("Approval first.");
    expect(correctionFromRun(base({ ...gen, promptText: "Changed since." }), req.prompt), "not a correction of THIS diagram").toBeNull();
  });

  it("the warning counts the review comments and says the old version is kept", () => {
    const d = base(gen, [{ id: "a", type: "task" }, { id: "c1", type: "review-comment" }, { id: "c2", type: "review-comment" }]);
    expect(reviewCommentCount(d)).toBe(2);
    expect(replaceWarning(2, false)).toBe("This replaces the whole diagram, and its 2 review comments, with a new one. The current version stays in the diagram’s history, so it can be restored on the desktop.");
    expect(replaceWarning(1, true)).toContain("and its 1 review comment,");
    expect(replaceWarning(1, true)).toContain("Comments you haven’t saved are lost.");
    expect(replaceWarning(0, false)).toMatch(/^This replaces the whole diagram with a new one\./);
  });
});

// ── the server run ───────────────────────────────────────────────────────────

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 1, 2, 3, 4, 5, 6]);
const as = (u: { id: string; email: string } | null) => { sess.current = u ? { user: { id: u.id, email: u.email } } : null; };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string, body: unknown) => startJob(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), params(id));
const row = (id: string) => prisma.diagram.findUniqueOrThrow({ where: { id } });
const dataOf = async (id: string) => (await row(id)).data as unknown as DiagramData;

async function world() {
  const { user: owner, org } = await createUserWithOrg();
  const editor = await createUser(); await addOrgMember(editor.id, org.id, "Viewer");
  const project = await createProject({ userId: owner.id, orgId: org.id });
  await addProjectShare(project.id, editor.id, "EDIT");
  const diagram = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id, name: "Claims" });
  await prisma.diagram.update({ where: { id: diagram.id }, data: { type: "bpmn" } });
  await prisma.$executeRawUnsafe(`UPDATE "Diagram" SET data = $1::jsonb WHERE id = $2`,
    JSON.stringify({ elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } }), diagram.id);
  const keep = (userId: string) => prisma.aiSourceImage.create({
    data: { orgId: org.id, sha256: `${userId}-${Math.random()}`, mimeType: "image/jpeg", bytes: JPEG, name: NAME, width: 2236, height: 1677, createdById: userId },
  });
  return { owner, org, editor, diagram, keep };
}
async function finished(jobId: string) {
  for (let i = 0; i < 200; i++) {
    const j = await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: jobId } });
    if (j.status === "succeeded" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("job never finished");
}
/** Generate the empty diagram first, as the phone does; then a review comment is added without going through history. */
async function generated(w: Awaited<ReturnType<typeof world>>, body: Record<string, unknown> = { prompt: "A claim is paid, then approved." }) {
  as(w.owner);
  const r = await post(w.diagram.id, body);
  expect(r.status).toBe(202);
  expect((await finished((await r.json()).jobId)).status).toBe("succeeded");
  const d = await dataOf(w.diagram.id);
  const comment = { id: "rc1", type: "review-comment", x: 0, y: 0, width: 24, height: 24, label: "Wrong order", properties: {} };
  await prisma.$executeRawUnsafe(`UPDATE "Diagram" SET data = $1::jsonb WHERE id = $2`,
    JSON.stringify({ ...d, elements: [...d.elements, comment] }), w.diagram.id);
  return { data: await dataOf(w.diagram.id), version: (await row(w.diagram.id)).version };
}

beforeEach(async () => {
  await truncateAll();
  ai.lastOpts = null;
  ai.during = null;
  ai.label = "Check claim";
  as(null);
});

describe("T5043 — the re-generate replaces the diagram only when asked, and only the version on screen", () => {
  it("replace asked for, current version: the diagram and its comments are replaced; the prompt carries the correction; the old version is in history", async () => {
    const w = await world();
    const before = await generated(w);
    const promptId = before.data.aiGeneration!.promptId;
    const src = correctionSource(before.data);
    if (!src.ok) throw new Error("expected ok");
    ai.label = "Approve claim";
    const r = await post(w.diagram.id, correctionRequest(src, "The approval happens before payment.", before.version));
    expect(r.status).toBe(202);
    expect((await finished((await r.json()).jobId)).status).toBe("succeeded");

    const after = await dataOf(w.diagram.id);
    expect(after.elements.some((e) => e.label === "Approve claim")).toBe(true);
    expect(reviewCommentCount(after), "the comments went with the old diagram").toBe(0);
    expect(after.aiGeneration!.promptText).toBe(withCorrection("A claim is paid, then approved.", "The approval happens before payment."));
    expect(after.aiGeneration!.promptId, "the diagram's own prompt, updated in place").toBe(promptId);
    expect(after.aiGeneration, "the record says: words only").toMatchObject({ fromImage: false, fromDocument: false });
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: promptId } })).text).toBe(after.aiGeneration!.promptText);
    expect(ai.lastOpts!.prompt).toBe(after.aiGeneration!.promptText);

    // The version with the comment (never snapshotted — written round history) was kept first.
    const history = await prisma.diagramHistory.findMany({ where: { diagramId: w.diagram.id }, orderBy: { createdAt: "asc" } });
    const held = history.map((h) => reviewCommentCount((h.snapshot as { data: DiagramData }).data));
    expect(held, "first run, the commented version, the corrected one").toEqual([0, 1, 0]);
  });

  it("the previous version already in history is not stored twice", async () => {
    const w = await world();
    as(w.owner);
    const r0 = await post(w.diagram.id, { prompt: "A claim is paid." });
    await finished((await r0.json()).jobId);
    const d = await dataOf(w.diagram.id);
    const r = await post(w.diagram.id, correctionRequest(correctionSource(d) as Extract<ReturnType<typeof correctionSource>, { ok: true }>, "Approval first.", (await row(w.diagram.id)).version));
    await finished((await r.json()).jobId);
    expect(await prisma.diagramHistory.count({ where: { diagramId: w.diagram.id } })).toBe(2);
  });

  it("without replace a full diagram is refused; replace needs a version; an old version is a conflict — and none of them runs", async () => {
    const w = await world();
    const before = await generated(w);
    const prompt = withCorrection("A claim is paid, then approved.", "Approval first.");
    const refused = await post(w.diagram.id, { prompt, version: before.version });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toBe("has_content");
    const noVersion = await post(w.diagram.id, { prompt, replace: true });
    expect(noVersion.status).toBe(400);
    expect((await noVersion.json()).error).toBe("version_required");
    const stale = await post(w.diagram.id, { prompt, replace: true, version: before.version - 1 });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toBe("conflict");
    expect(await prisma.diagramGenerateJob.count(), "only the first run").toBe(1);
  });

  it("the server refuses a replace that is not THIS diagram's prompt plus a correction, or cannot be re-generated", async () => {
    const w = await world();
    const before = await generated(w);
    const other = await post(w.diagram.id, { prompt: "Something else entirely.", replace: true, version: before.version });
    expect(other.status).toBe(400);
    expect((await other.json()).error).toBe("not_a_correction");
    // A diagram drawn from a document (the record says so): refused however it is asked.
    const d = await dataOf(w.diagram.id);
    await prisma.$executeRawUnsafe(`UPDATE "Diagram" SET data = $1::jsonb WHERE id = $2`,
      JSON.stringify({ ...d, aiGeneration: { ...d.aiGeneration, fromDocument: true } }), w.diagram.id);
    const doc = await post(w.diagram.id, { prompt: withCorrection(d.aiGeneration!.promptText, "Approval first."), replace: true, version: before.version });
    expect(doc.status).toBe(400);
    expect(await doc.json()).toMatchObject({ error: "document_not_kept", message: correctionRefusalText("document_not_kept") });
    expect(await prisma.diagramGenerateJob.count(), "only the first run").toBe(1);
  });

  it("a save while the AI is working (a comment, anything) and nothing is replaced", async () => {
    const w = await world();
    const before = await generated(w);
    ai.during = async () => { await prisma.diagram.update({ where: { id: w.diagram.id }, data: { version: { increment: 1 } } }); };
    const src = correctionSource(before.data) as Extract<ReturnType<typeof correctionSource>, { ok: true }>;
    const r = await post(w.diagram.id, correctionRequest(src, "Approval first.", before.version));
    const done = await finished((await r.json()).jobId);
    expect(done).toMatchObject({ status: "failed", errorCode: "changed_meanwhile" });
    expect(done.errorMessage).toContain("nothing was replaced");
    expect(reviewCommentCount(await dataOf(w.diagram.id)), "the commented diagram is untouched").toBe(1);
    expect(correctionFromRun(before.data, done.promptText), "the phone gets the words back").toBe("Approval first.");
  });
});

describe("T5044 — a photo diagram is re-generated from the same photo, by its owner or an editor", () => {
  it("an editor corrects the owner's photo diagram: the diagram's photo is sent again; the owner's OTHER photos stay refused", async () => {
    const w = await world();
    const img = await w.keep(w.owner.id);
    const other = await w.keep(w.owner.id);
    const before = await generated(w, { prompt: withPhotoNote(NAME, ""), sourceImageId: img.id });
    expect(before.data.aiGeneration!.sourceImage!.id).toBe(img.id);
    const src = correctionSource(before.data);
    if (!src.ok) throw new Error("expected ok");
    expect(src.sourceImageId).toBe(img.id);

    as(w.editor);
    const notTheirs = await post(w.diagram.id, { ...correctionRequest(src, "Approval first.", before.version), sourceImageId: other.id });
    expect(notTheirs.status).toBe(400);
    expect((await notTheirs.json()).error, "a re-generate sends THIS diagram's image, nothing else").toBe("image_mismatch");

    const r = await post(w.diagram.id, correctionRequest(src, "Approval first.", before.version));
    expect(r.status).toBe(202);
    expect((await finished((await r.json()).jobId)).status).toBe("succeeded");
    const att = ai.lastOpts!.attachment as { data: string };
    expect(Buffer.from(att.data, "base64").equals(JPEG)).toBe(true);
    const after = await dataOf(w.diagram.id);
    expect(after.aiGeneration!.promptText).toBe(withPhotoNote(NAME, "Approval first."));
    expect(after.aiGeneration!.sourceImage!.id, "still names the photo").toBe(img.id);
  });

  it("a photo diagram re-sent without its photo is refused", async () => {
    const w = await world();
    const img = await w.keep(w.owner.id);
    const before = await generated(w, { prompt: withPhotoNote(NAME, ""), sourceImageId: img.id });
    const r = await post(w.diagram.id, { prompt: withCorrection(before.data.aiGeneration!.promptText, "x"), version: before.version, replace: true });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("image_mismatch");
  });

  it("the phone: Correct above Comment, both away while a run is on; Save still; words back on failure; the warning before sending", () => {
    const screen = read("app/m/diagram/[id]/MobileDiagramScreen.tsx");
    expect(screen).toContain("const request = correctionRequest(src, words, d.version, correctFreeForm);");
    expect(screen).toContain("body: JSON.stringify(request),");
    expect(screen).toContain("{d?.canReview && !empty && !picking && !busy && (");
    expect(screen).toContain("disabled={saving || !dirty || busy}");
    expect(screen, "a failed correction gives the words back").toContain("setCorrection((w) => w || words);");
    expect(screen, "a reload mid-run: a re-generate only when the run's prompt is this diagram's plus a correction").toContain(`kind: words !== null ? "correct" : "generate"`);
    expect(screen, "…and anything opened before it was found is closed").toMatch(/setCorrecting\(false\);\s*setPicking\(false\);\s*setAddTarget\(null\);/);
    expect(screen, "a conflict reloads in place, keeping the words").toContain("const hadUnsaved = dirty;");
    expect(screen, "a run already under way is said").toContain("A re-generate is already under way");
    expect(screen, "a run started elsewhere is followed honestly").toContain("const other = j.duplicate === true && j.promptText !== request.prompt;");
    expect(screen, "words cleared only when they were applied").toContain("const mine = !pending || applied === pending;");
    const sheet = read("app/components/mobile/MobileCorrectionSheet.tsx");
    expect(sheet).toContain("{replaceWarning(comments, unsaved)}");
    expect(sheet).toContain("withCorrection(basePrompt, words");
    expect(sheet, "nothing closes the sheet while the start is in flight").toContain("if (starting) return;");
  });
});
