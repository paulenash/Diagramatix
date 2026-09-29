/**
 * Paul, 2026-09-29: "1. Add ability to do Free Form diagrams from image if the
 * user desires. 2. Add ability to edit the Project or Diagram names. 3. correct
 * the known gaps."
 *
 * The known gaps (from the stage 3 hand-over, and the stage 1 review):
 *   • an editor's correction never reached the owner's linked prompt;
 *   • two simultaneous starts on one diagram were not strictly prevented;
 *   • the AI policy was read from the caller's org, not the diagram's;
 *   • a failed run restored after a reload lost its saved-prompt link;
 *   • the partner PDF ignored the project's colours.
 * (The state-machine shapes on the phone are tested in phone-shapes-parity.test.ts.)
 *
 * Pure parts first; then the routes against the real test database (the model
 * call faked, its arguments captured).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, createOrg, createProject, addProjectShare, addOrgMember, createDiagram } from "../_setup/factories";
import { freeFormLayout, planHasBounds } from "@/app/lib/ai/freeForm";
import { withPhotoNote } from "@/app/lib/ai/promptPreambles";
import { correctionRequest, correctionSource } from "@/app/lib/mobile/correction";
import { EMPTY_DRAFT, draftFromFailedJob, draftToRequest, withRestoredPhoto } from "@/app/lib/mobile/generateDraft";
import { cleanName, renameFailureText } from "@/app/lib/mobile/rename";
import { renderDiagramSvg } from "@/app/lib/partner/renderDiagramSvg";
import { renderTemplateThumbnailSvg } from "@/app/lib/diagram/templateThumbnail";
import { isSafeColor } from "@/app/lib/diagram/colors";
import type { DiagramData } from "@/app/lib/diagram/types";

const read = (p: string) => readFileSync(p, "utf8");

const sess = vi.hoisted(() => ({ current: null as null | { user: { id: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => sess.current }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const PLAIN = {
  elements: [
    { id: "p1", type: "pool", label: "Claims", poolType: "white-box" },
    { id: "e1", type: "start-event", label: "Claim in", pool: "p1" },
    { id: "t1", type: "task", label: "Check claim", taskType: "user", pool: "p1" },
    { id: "e2", type: "end-event", label: "Paid", pool: "p1" },
  ],
  connections: [{ sourceId: "e1", targetId: "t1", type: "sequence" }, { sourceId: "t1", targetId: "e2", type: "sequence" }],
};
/** The same process with each shape's drawn position (0..1 of the image) — what a Free Form plan carries. */
const DRAWN = {
  elements: [
    { ...PLAIN.elements[0], bounds: { x: 0.02, y: 0.05, w: 0.96, h: 0.6 } },
    { ...PLAIN.elements[1], bounds: { x: 0.06, y: 0.3, w: 0.03, h: 0.05 } },
    { ...PLAIN.elements[2], bounds: { x: 0.42, y: 0.28, w: 0.12, h: 0.09 } },
    { ...PLAIN.elements[3], bounds: { x: 0.9, y: 0.3, w: 0.03, h: 0.05 } },
  ],
  connections: PLAIN.connections,
};

const ai = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
  failNext: false,
  hang: false,
  drawn: false,
}));
vi.mock("@/app/lib/ai/planBpmn", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/ai/planBpmn")>()),
  planBpmn: vi.fn(async (opts: Record<string, unknown>) => {
    ai.calls.push(opts);
    if (ai.hang) return new Promise(() => { /* the AI is still thinking */ });
    if (ai.failNext) { ai.failNext = false; return { ok: false, status: 529, error: "overloaded_error" }; }
    return { ok: true, model: "claude-opus-5", plan: JSON.parse(JSON.stringify(ai.drawn ? DRAWN : PLAIN)) };
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

import { POST as startJob, GET as latestJob } from "@/app/api/diagrams/[id]/generate/route";
import { GET as pollJob } from "@/app/api/diagrams/[id]/generate/[jobId]/route";
import { PUT as putDiagram } from "@/app/api/diagrams/[id]/route";
import { GET as getProject, PUT as putProject } from "@/app/api/projects/[id]/route";
import { PUT as putPrompt } from "@/app/api/prompts/[id]/route";
import { POST as promptLink } from "@/app/api/diagrams/[id]/prompt-link/route";

const NAME = "Whiteboard photo 2026-09-29 09.00.jpg";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 1, 2, 3, 4, 5, 6]);
const as = (u: { id: string; email: string } | null) => { sess.current = u ? { user: { id: u.id, email: u.email } } : null; };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown, method = "POST") => new Request("http://x", { method, body: JSON.stringify(body) });
const post = (id: string, body: unknown) => startJob(json(body), params(id));
const row = (id: string) => prisma.diagram.findUniqueOrThrow({ where: { id } });
const dataOf = async (id: string) => (await row(id)).data as unknown as DiagramData;
const byLabel = (d: DiagramData, label: string) => d.elements.find((e) => e.label === label)!;

async function world() {
  const { user: owner, org } = await createUserWithOrg();
  const editor = await createUser(); await addOrgMember(editor.id, org.id, "Viewer");
  const viewer = await createUser(); await addOrgMember(viewer.id, org.id, "Viewer");
  const project = await createProject({ userId: owner.id, orgId: org.id, name: "Claims" });
  await addProjectShare(project.id, editor.id, "EDIT");
  await addProjectShare(project.id, viewer.id, "VIEW");
  const diagram = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id, name: "Claims" });
  await empty(diagram.id);
  const keep = (userId: string) => prisma.aiSourceImage.create({
    data: { orgId: org.id, sha256: `${userId}-${Math.random()}`, mimeType: "image/jpeg", bytes: JPEG, name: NAME, width: 2000, height: 1000, createdById: userId },
  });
  return { owner, org, editor, viewer, project, diagram, keep };
}
async function empty(diagramId: string, extra: Record<string, unknown> = {}) {
  await prisma.diagram.update({ where: { id: diagramId }, data: { type: "bpmn" } });
  await prisma.$executeRawUnsafe(`UPDATE "Diagram" SET data = $1::jsonb WHERE id = $2`,
    JSON.stringify({ elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 }, ...extra }), diagramId);
}
async function finished(jobId: string) {
  for (let i = 0; i < 200; i++) {
    const j = await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: jobId } });
    if (j.status === "succeeded" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("job never finished");
}
async function run(diagramId: string, body: Record<string, unknown>) {
  const r = await post(diagramId, body);
  expect(r.status, JSON.stringify(await r.clone().json())).toBe(202);
  return finished((await r.json()).jobId);
}

beforeEach(async () => {
  await truncateAll();
  ai.calls = [];
  ai.failNext = false;
  ai.hang = false;
  ai.drawn = false;
  as(null);
});

// ── 1. Free Form ─────────────────────────────────────────────────────────────

describe("T5045 — Free Form from a photo on the phone: the drawn layout kept, if the person asks", () => {
  it("one rule: drawn positions only when asked for AND the plan carries them; the image's size only when real", () => {
    expect(planHasBounds(DRAWN)).toBe(true);
    expect(planHasBounds(PLAIN)).toBe(false);
    expect(planHasBounds(null)).toBe(false);
    expect(freeFormLayout(true, DRAWN, { w: 2000, h: 1000 })).toEqual({ preservePositions: true, imageAspect: { w: 2000, h: 1000 } });
    expect(freeFormLayout(true, PLAIN, { w: 2000, h: 1000 })).toEqual({ preservePositions: false });
    expect(freeFormLayout(false, DRAWN, { w: 2000, h: 1000 })).toEqual({ preservePositions: false });
    expect(freeFormLayout(true, DRAWN, { w: 0, h: 1000 })).toEqual({ preservePositions: true });
    // The review, 2026-09-29: one step the model could not place (a step only in the words) —
    // the drawn layout would drop it with its flows, so the normal layout is used.
    const oneUnplaced = { ...DRAWN, elements: DRAWN.elements.map((e) => (e.id === "t1" ? PLAIN.elements[2] : e)) };
    expect(planHasBounds(oneUnplaced)).toBe(false);
    expect(freeFormLayout(true, oneUnplaced).preservePositions).toBe(false);
    const noPoolBox = { ...DRAWN, elements: DRAWN.elements.map((e) => (e.id === "p1" ? PLAIN.elements[0] : e)) };
    expect(planHasBounds(noPoolBox), "nothing boxed to hold them").toBe(false);
    // …and it is the rule the desktop consoles, the comparison route and the phone's job all use.
    for (const f of ["app/(dashboard)/diagram/[id]/ai-generate/AiGenerateScreen.tsx", "app/(dashboard)/diagram/[id]/PlanPanel.tsx"]) {
      expect(read(f), f).toContain("const { preservePositions } = freeFormLayout(!flatPlan && preserveLayout, plan);");
    }
    expect(read("app/api/ai/generate-bpmn/compare/route.ts")).toContain("freeFormLayout(wantGeometry, res.plan)");
    expect(read("app/lib/ai/generateJob.ts")).toContain("...freeFormLayout(!!attachment && input.promptMeta.freeForm === true, plan,");
  });

  it("a photo with Free Form: the model is asked where each shape sits, and the diagram keeps the board's layout", async () => {
    const w = await world();
    const img = await w.keep(w.owner.id);
    as(w.owner);
    ai.drawn = true;
    expect((await run(w.diagram.id, { prompt: withPhotoNote(NAME, ""), sourceImageId: img.id, freeForm: true })).status).toBe("succeeded");
    expect(ai.calls[0].captureGeometry).toBe(true);
    const d = await dataOf(w.diagram.id);
    expect(d.relaxedLayout).toBe(true);
    expect(d.aiGeneration).toMatchObject({ freeForm: true, fromImage: true, sourceImage: { id: img.id } });
    const spread = byLabel(d, "Paid").x - byLabel(d, "Claim in").x;
    expect(spread, "start and end as far apart as on the board").toBeGreaterThan(900);

    // The same plan without Free Form is laid out afresh — close together.
    await empty(w.diagram.id);
    expect((await run(w.diagram.id, { prompt: withPhotoNote(NAME, ""), sourceImageId: img.id })).status).toBe("succeeded");
    expect(ai.calls[1].captureGeometry).toBeUndefined();
    const n = await dataOf(w.diagram.id);
    expect(n.relaxedLayout).toBeUndefined();
    expect(n.aiGeneration?.freeForm).toBe(false);
    expect(byLabel(n, "Paid").x - byLabel(n, "Claim in").x).toBeLessThan(spread);
  });

  it("a Free Form run where the model could not place a step keeps every step and flow (the normal layout)", async () => {
    const w = await world();
    const img = await w.keep(w.owner.id);
    as(w.owner);
    ai.drawn = true;
    const saved = { ...DRAWN };
    // The model leaves out the box of a step it cannot see on the board.
    DRAWN.elements = DRAWN.elements.map((e) => (e.id === "t1" ? { ...PLAIN.elements[2] } : e));
    try {
      expect((await run(w.diagram.id, { prompt: withPhotoNote(NAME, "A check happens in the middle."), sourceImageId: img.id, freeForm: true })).status).toBe("succeeded");
    } finally { DRAWN.elements = saved.elements; }
    const d = await dataOf(w.diagram.id);
    expect(d.elements.map((e) => e.label)).toEqual(expect.arrayContaining(["Claim in", "Check claim", "Paid"]));
    expect(d.connectors.filter((c) => c.type === "sequence").length, "both flows kept").toBe(2);
  });

  it("Free Form asked for with no photo is ignored — there is no drawing to keep", async () => {
    const w = await world();
    as(w.owner);
    expect((await run(w.diagram.id, { prompt: "A claim is paid.", freeForm: true })).status).toBe("succeeded");
    expect(ai.calls[0].captureGeometry).toBeUndefined();
    const d = await dataOf(w.diagram.id);
    expect(d.relaxedLayout).toBeUndefined();
    expect(d.aiGeneration?.freeForm).toBeUndefined();
  });

  it("✎ Correct on a Free Form photo diagram keeps Free Form by default; turned off, it is laid out afresh", async () => {
    const w = await world();
    const img = await w.keep(w.owner.id);
    as(w.owner);
    ai.drawn = true;
    await run(w.diagram.id, { prompt: withPhotoNote(NAME, ""), sourceImageId: img.id, freeForm: true });
    const before = await dataOf(w.diagram.id);
    const src = correctionSource(before);
    if (!src.ok) throw new Error("expected ok");
    expect(src.freeForm).toBe(true);
    const kept = correctionRequest(src, "Approval first.", (await row(w.diagram.id)).version);
    expect(kept.freeForm).toBe(true);
    expect((await run(w.diagram.id, kept)).status).toBe("succeeded");
    expect(ai.calls[1].captureGeometry).toBe(true);
    expect((await dataOf(w.diagram.id)).aiGeneration?.freeForm).toBe(true);

    const src2 = correctionSource(await dataOf(w.diagram.id));
    if (!src2.ok) throw new Error("expected ok");
    const off = correctionRequest(src2, "Payments by Finance.", (await row(w.diagram.id)).version, false);
    expect((await run(w.diagram.id, off)).status).toBe("succeeded");
    expect(ai.calls[2].captureGeometry).toBeUndefined();
    const after = await dataOf(w.diagram.id);
    expect(after.aiGeneration?.freeForm).toBe(false);
    expect(after.relaxedLayout).toBeUndefined();
  });

  it("the draft: Free Form goes only with a photo, only when ticked, and comes back with a failed photo run", () => {
    const photo = { storedId: "img1", name: NAME, width: 1, height: 1 };
    expect(draftToRequest({ ...EMPTY_DRAFT, photo, freeForm: true }).freeForm).toBe(true);
    expect("freeForm" in draftToRequest({ ...EMPTY_DRAFT, photo })).toBe(false);
    expect("freeForm" in draftToRequest({ ...EMPTY_DRAFT, prompt: "Words.", freeForm: true })).toBe(false);
    const job = { promptText: withPhotoNote(NAME, "Approval first."), sourceImageId: "img1", freeForm: true };
    expect(withRestoredPhoto(draftFromFailedJob(job.promptText), job).freeForm).toBe(true);
    expect(withRestoredPhoto(draftFromFailedJob(job.promptText), { ...job, freeForm: false }).freeForm).toBeUndefined();
    // The ✎ Correct sheet keeps the choice with the words: a correction tried again keeps it.
    const screen = read("app/m/diagram/[id]/MobileDiagramScreen.tsx");
    expect(screen).toContain("if (correctSrc && !correction.trim()) setCorrectFreeForm(correctSrc.freeForm);");
    expect(screen.match(/setCorrectFreeForm\(job(\?)?\.freeForm === true\)/g) ?? [], "both failure paths give it back").toHaveLength(2);
    // Both sheets offer it, and the job row keeps the choice.
    expect(read("app/components/mobile/MobileGenerateSheet.tsx")).toContain("Free Form — keep the layout as drawn on the board");
    expect(read("app/components/mobile/MobileCorrectionSheet.tsx")).toContain("Free Form — keep the layout as it was drawn");
    expect(read("prisma/schema.prisma")).toMatch(/freeForm\s+Boolean\s+@default\(false\)/);
  });
});

// ── 2. Renaming ──────────────────────────────────────────────────────────────

describe("T5046 — renaming a project or a diagram on the phone", () => {
  it("the name to send is trimmed; empty or unchanged sends nothing; failures in plain words", () => {
    expect(cleanName("  Claims v2 ", "Claims")).toEqual({ ok: true, name: "Claims v2" });
    expect(cleanName("   ", "Claims")).toEqual({ ok: false, reason: "empty" });
    expect(cleanName(" Claims ", "Claims")).toEqual({ ok: false, reason: "unchanged" });
    expect(renameFailureText(403, null)).toBe("You can’t rename this.");
    expect(renameFailureText(400, "Name is required")).toBe("Name is required");
    expect(renameFailureText(0, null)).toContain("check your connection");
  });

  it("a diagram's name: a non-empty string, stored trimmed; no version move, no history row", async () => {
    const w = await world();
    as(w.editor);
    const put = (body: unknown) => putDiagram(json(body, "PUT"), params(w.diagram.id));
    const v0 = (await row(w.diagram.id)).version;
    expect((await put({ name: "   " })).status).toBe(400);
    expect((await put({ name: 5 })).status).toBe(400);
    expect((await row(w.diagram.id)).name, "an empty name is never stored").toBe("Claims");
    const ok = await put({ name: "  Claims v2  " });
    expect(ok.status).toBe(200);
    expect((await ok.json()).name).toBe("Claims v2");
    expect((await row(w.diagram.id)).version, "a rename never conflicts with the content").toBe(v0);
    expect(await prisma.diagramHistory.count({ where: { diagramId: w.diagram.id } })).toBe(0);
    as(w.viewer);
    expect((await put({ name: "Viewer was here" })).status).toBe(403);
  });

  it("the project says what the caller may do, by the rules its writes use; a bad name is a 400, not a crash", async () => {
    const w = await world();
    const rights = async (u: { id: string; email: string }) => {
      as(u);
      const j = await (await getProject(new Request("http://x"), params(w.project.id))).json();
      return { role: j.role, canRename: j.canRename, canEditDiagrams: j.canEditDiagrams };
    };
    expect(await rights(w.owner)).toEqual({ role: "owner", canRename: true, canEditDiagrams: true });
    expect(await rights(w.editor)).toEqual({ role: "edit", canRename: false, canEditDiagrams: true });
    expect(await rights(w.viewer)).toEqual({ role: "view", canRename: false, canEditDiagrams: false });

    const put = (u: { id: string; email: string }, body: unknown) => { as(u); return putProject(json(body, "PUT"), params(w.project.id)); };
    expect((await put(w.owner, { name: 5 })).status).toBe(400);
    expect((await put(w.owner, { name: "  " })).status).toBe(400);
    expect((await put(w.editor, { name: "Mine now" })).status).toBe(403);
    const ok = await put(w.owner, { name: " Claims 2026 " });
    expect(ok.status).toBe(200);
    expect((await ok.json()).name).toBe("Claims 2026");
  });

  it("the phone offers rename only where it will work, in a sheet — never a browser dialog", () => {
    const screen = read("app/m/diagram/[id]/MobileDiagramScreen.tsx");
    expect(screen).toContain("{d?.canEdit ? (");
    expect(screen, "the ✎ is outside the part that is cut short").toContain('<span className="truncate min-w-0">{d.name}</span>');
    expect(screen).toContain("<MobileRenameSheet title=\"Rename diagram\"");
    expect(screen, "a name only — never the content or its version").toContain("body: JSON.stringify({ name: newName }),");
    const page = read("app/m/project/[id]/MobileProjectClient.tsx");
    expect(page).toContain("{canRename && !loading && (");
    expect(page).toContain("{canEditDiagrams && (");
    expect(page).toContain("{!creating && canEditDiagrams && (");
    for (const src of [screen, page, read("app/components/mobile/MobileRenameSheet.tsx")]) {
      expect(src).not.toMatch(/\b(alert|confirm|prompt)\(/);
    }
    // The desktop panel no longer sends an emptied name.
    expect(read("app/(dashboard)/dashboard/projects/[id]/DiagramPropertiesPanel.tsx")).toContain("if (!v) { e.target.value = diagram.name; return; }");
  });
});

// ── 3. The gaps ──────────────────────────────────────────────────────────────

describe("T5047 — the diagram's own prompt: bound to it, kept current by its editors, never anyone else's", () => {
  it("an editor's re-generate writes the owner's diagram prompt; the owner's own saved prompt it cannot write, even when the diagram JSON claims it", async () => {
    const w = await world();
    as(w.owner);
    await run(w.diagram.id, { prompt: "A claim is paid." });
    const auto = (await dataOf(w.diagram.id)).aiGeneration!;
    const bound = await prisma.prompt.findUniqueOrThrow({ where: { id: auto.promptId } });
    expect(bound).toMatchObject({ forDiagramId: w.diagram.id, userId: w.owner.id });

    // The editor corrects it on the phone: the owner's prompt follows.
    as(w.editor);
    const src = correctionSource(await dataOf(w.diagram.id));
    if (!src.ok) throw new Error("expected ok");
    await run(w.diagram.id, correctionRequest(src, "Approval first.", (await row(w.diagram.id)).version));
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: auto.promptId } })).text).toContain("Approval first.");
    expect(await prisma.prompt.count()).toBe(1);

    // A forged claim: the diagram says the OWNER's saved prompt is its auto prompt.
    const saved = await prisma.prompt.create({ data: { name: "Owner's own", text: "Keep me.", diagramType: "bpmn", userId: w.owner.id, orgId: w.org.id } });
    await empty(w.diagram.id, { aiGeneration: { promptId: saved.id, promptName: saved.name, promptText: "Keep me.", model: "m", generatedAt: "g", autoNamed: true } });
    await run(w.diagram.id, { prompt: "Something else entirely." });
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: saved.id } })).text, "never written by the editor").toBe("Keep me.");
  });

  it("words go only into the diagram owner's library: a prompt an editor made first is left to them, and the owner gets their own", async () => {
    const w = await world();
    as(w.editor);
    await run(w.diagram.id, { prompt: "The editor's first words." });
    const editors = (await dataOf(w.diagram.id)).aiGeneration!.promptId;
    expect(await prisma.prompt.findUniqueOrThrow({ where: { id: editors } })).toMatchObject({ userId: w.editor.id, forDiagramId: w.diagram.id });
    as(w.owner);
    await empty(w.diagram.id, { aiGeneration: (await dataOf(w.diagram.id)).aiGeneration }); // cleared: a fresh generate, as on an empty diagram
    await run(w.diagram.id, { prompt: "The owner's confidential words." });
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: editors } })).text, "never written into the editor's library").toBe("The editor's first words.");
    const owners = (await dataOf(w.diagram.id)).aiGeneration!.promptId;
    expect(owners).not.toBe(editors);
    expect(await prisma.prompt.findUniqueOrThrow({ where: { id: owners } })).toMatchObject({ userId: w.owner.id, forDiagramId: w.diagram.id, text: "The owner's confidential words." });
    // …and from then on the editor keeps the OWNER's current.
    as(w.editor);
    await empty(w.diagram.id, { aiGeneration: (await dataOf(w.diagram.id)).aiGeneration }); // cleared: a fresh generate, as on an empty diagram
    await run(w.diagram.id, { prompt: "The editor's later words." });
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: owners } })).text).toBe("The editor's later words.");
  });

  it("renaming a prompt in the library makes it the owner's own: unbound, and no editor writes it again", async () => {
    const w = await world();
    as(w.owner);
    await run(w.diagram.id, { prompt: "A claim is paid." });
    const pid = (await dataOf(w.diagram.id)).aiGeneration!.promptId;
    const r = await putPrompt(json({ name: "Invoice master", text: "Curated words." }, "PUT"), { params: Promise.resolve({ id: pid }) });
    expect(r.status).toBe(200);
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: pid } })).forDiagramId).toBeNull();
    as(w.editor);
    await empty(w.diagram.id, { aiGeneration: (await dataOf(w.diagram.id)).aiGeneration }); // cleared: a fresh generate, as on an empty diagram
    await run(w.diagram.id, { prompt: "The editor's words." });
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: pid } })).text).toBe("Curated words.");
  });

  it("a use of your own prompt is counted wherever it is bound (counting is not writing)", async () => {
    const w = await world();
    as(w.owner);
    await run(w.diagram.id, { prompt: "A claim is paid." });
    const p = await prisma.prompt.findUniqueOrThrow({ where: { id: (await dataOf(w.diagram.id)).aiGeneration!.promptId } });
    const other = await createDiagram({ userId: w.owner.id, orgId: w.org.id, projectId: w.project.id, name: "Other" });
    await empty(other.id);
    await run(other.id, { prompt: p.text, selectedPromptId: p.id, promptSource: "typed" });
    expect((await dataOf(other.id)).aiGeneration?.promptId, "linked, not copied").toBe(p.id);
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: p.id } })).useCount).toBe(p.useCount + 1);
  });

  it("the prod binding script binds only the diagram owner's own prompt, stops before the column exists, and reports it", () => {
    const sql = read("scripts/sql/bind-auto-prompts-to-diagrams.sql");
    expect(sql).toContain(`AND d."userId" = p."userId"`);
    expect(sql).toContain("RAISE EXCEPTION 'NOT YET");
    const guide = read("scripts/sql/patch-phone-freeform-rename.sql");
    expect(guide, "a section edited since is left alone").toContain("AND s.\"bodyMarkdown\" LIKE '%not as a copy of where things sat on the board.%'");
    expect(guide).toContain("AND (SELECT count(*) FROM phone WHERE b LIKE '%tick **Free Form** to keep the layout%') = 1");
  });

  it("a copied diagram gets its own prompt; the one bound to the original is left alone", async () => {
    const w = await world();
    as(w.owner);
    await run(w.diagram.id, { prompt: "Original words." });
    const original = (await dataOf(w.diagram.id)).aiGeneration!;
    const copy = await createDiagram({ userId: w.owner.id, orgId: w.org.id, projectId: w.project.id, name: "Claims (copy)" });
    await empty(copy.id, { aiGeneration: original });
    await run(copy.id, { prompt: "The copy's words." });
    const copied = (await dataOf(copy.id)).aiGeneration!;
    expect(copied.promptId).not.toBe(original.promptId);
    expect(await prisma.prompt.findUniqueOrThrow({ where: { id: copied.promptId } })).toMatchObject({ forDiagramId: copy.id, text: "The copy's words." });
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: original.promptId } })).text).toBe("Original words.");
  });

  it("an older, unbound auto prompt: its owner's runs write it, as before; an editor's keep the link and write nothing", async () => {
    const w = await world();
    const legacy = await prisma.prompt.create({ data: { name: "Claims — AI prompt", text: "Old.", diagramType: "bpmn", userId: w.owner.id, orgId: w.org.id } });
    const gen = { promptId: legacy.id, promptName: legacy.name, promptText: "Old.", model: "m", generatedAt: "g", autoNamed: true };
    await empty(w.diagram.id, { aiGeneration: gen });
    as(w.editor);
    await run(w.diagram.id, { prompt: "Editor's words." });
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: legacy.id } })).text).toBe("Old.");
    expect((await dataOf(w.diagram.id)).aiGeneration?.promptId, "still linked").toBe(legacy.id);
    await empty(w.diagram.id, { aiGeneration: gen });
    as(w.owner);
    await run(w.diagram.id, { prompt: "Owner's words." });
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: legacy.id } })).text).toBe("Owner's words.");
    // The prod file that binds these conservatively exists.
    expect(read("scripts/sql/bind-auto-prompts-to-diagrams.sql")).toContain(`AND p."forDiagramId" IS NULL`);
  });

  it("the desktop's link goes through the same rule: edit access, a checked action, the bound prompt written and counted", async () => {
    const w = await world();
    as(w.owner);
    await run(w.diagram.id, { prompt: "A claim is paid." });
    const auto = (await dataOf(w.diagram.id)).aiGeneration!;
    const link = (u: { id: string; email: string } | null, body: unknown) => { as(u); return promptLink(json(body), params(w.diagram.id)); };
    const action = {
      kind: "update", linked: { id: auto.promptId, name: auto.promptName, autoNamed: true }, text: "Desktop words.",
      orCreate: { name: "Claims — AI prompt", text: "Desktop words.", diagramType: "bpmn" },
    };
    expect((await link(null, { action })).status).toBe(401);
    expect((await link(w.viewer, { action })).status).toBe(403);
    expect((await link(w.editor, { action: { kind: "delete" } })).status).toBe(400);
    const r = await link(w.editor, { action, model: "claude-opus-5" });
    expect(r.status).toBe(200);
    expect((await r.json()).linked.id).toBe(auto.promptId);
    expect(await prisma.prompt.findUniqueOrThrow({ where: { id: auto.promptId } })).toMatchObject({ text: "Desktop words.", useCount: 2, modelUsed: "claude-opus-5" });
    const created = await (await link(w.editor, { action: { kind: "create", body: { name: "New — AI prompt", text: "t", diagramType: "bpmn" } } })).json();
    expect(await prisma.prompt.findUniqueOrThrow({ where: { id: created.linked.id } })).toMatchObject({ forDiagramId: w.diagram.id, userId: w.editor.id });
  });
});

describe("T5048 — one run per diagram, even when two starts land at the same moment", () => {
  it("the same person twice at once: one run, the other handed it; two people at once: one run, the other told it is busy", async () => {
    const w = await world();
    ai.hang = true; // the AI is still working, so the first run stays under way
    as(w.owner);
    const same = await Promise.all([post(w.diagram.id, { prompt: "A." }), post(w.diagram.id, { prompt: "A." })]);
    expect(same.map((r) => r.status)).toEqual([202, 202]);
    const bodies = await Promise.all(same.map((r) => r.json()));
    expect(bodies.filter((b) => b.duplicate === true)).toHaveLength(1);
    expect(new Set(bodies.map((b) => b.jobId)).size, "both hold the one run").toBe(1);
    expect(await prisma.diagramGenerateJob.count()).toBe(1);

    const other = await createDiagram({ userId: w.owner.id, orgId: w.org.id, projectId: w.project.id, name: "Two" });
    await empty(other.id);
    const a = post(other.id, { prompt: "B." });
    as(w.editor);
    const b = post(other.id, { prompt: "B." });
    const both = await Promise.all([a, b]);
    expect(both.map((r) => r.status).sort()).toEqual([202, 409]);
    expect(await prisma.diagramGenerateJob.count({ where: { diagramId: other.id } })).toBe(1);
    expect(read("app/api/diagrams/[id]/generate/route.ts")).toContain("pg_advisory_xact_lock(hashtextextended(");
  });
});

describe("T5049 — the AI policy of the diagram's own organisation applies", () => {
  it("a diagram in an organisation that turned AI off is not sent to the AI, whatever the caller's own organisation allows", async () => {
    const { user, org: home } = await createUserWithOrg();
    const strict = await createOrg({ name: "Strict Pty Ltd" });
    await prisma.org.update({ where: { id: strict.id }, data: { allowAi: false } });
    await addOrgMember(user.id, strict.id, "Owner");
    const project = await createProject({ userId: user.id, orgId: strict.id });
    const diagram = await createDiagram({ userId: user.id, orgId: strict.id, projectId: project.id, name: "Locked" });
    await empty(diagram.id);
    expect(home.allowAi ?? true, "the caller's own org allows AI").toBe(true);
    as(user);
    const r = await post(diagram.id, { prompt: "A claim is paid." });
    expect(r.status).toBe(403);
    expect(await prisma.diagramGenerateJob.count()).toBe(0);
    expect(ai.calls).toHaveLength(0);
  });
});

describe("T5050 — a failed run tried again after a reload is the same run: its saved prompt, its Free Form", () => {
  it("the saved prompt is kept with the run, handed back by both reads, and linked again on the retry", async () => {
    const w = await world();
    const saved = await prisma.prompt.create({ data: { name: "Claims intake", text: "A claim is paid, then approved.", diagramType: "bpmn", userId: w.owner.id, orgId: w.org.id } });
    as(w.owner);
    ai.failNext = true;
    const first = await (await post(w.diagram.id, { prompt: saved.text, promptSource: "typed", selectedPromptId: saved.id })).json();
    expect(first.selectedPrompt).toEqual({ id: saved.id, name: saved.name, text: saved.text });
    const failed = await finished(first.jobId);
    expect(failed).toMatchObject({ status: "failed", selectedPromptId: saved.id });

    const view = (await (await latestJob(new Request("http://x"), params(w.diagram.id))).json()).job;
    expect(view.selectedPrompt).toEqual({ id: saved.id, name: saved.name, text: saved.text });
    const polled = await (await pollJob(new Request("http://x"), { params: Promise.resolve({ id: w.diagram.id, jobId: first.jobId }) })).json();
    expect(polled.selectedPrompt?.id).toBe(saved.id);

    // What the phone rebuilds and sends again — and the link it makes.
    const back = draftFromFailedJob(view.promptText, view.selectedPrompt);
    expect(back, "exactly as picked — not 'changed'").toMatchObject({ prompt: saved.text, dictated: false, selected: { id: saved.id } });
    expect(draftToRequest(back)).toEqual({ prompt: saved.text, promptSource: "typed", selectedPromptId: saved.id });
    expect((await run(w.diagram.id, draftToRequest(back) as unknown as Record<string, unknown>)).status).toBe("succeeded");
    expect((await dataOf(w.diagram.id)).aiGeneration?.promptId, "linked to the saved prompt, not a new copy").toBe(saved.id);
  });

  it("a Free Form photo run that failed comes back with Free Form ticked", async () => {
    const w = await world();
    const img = await w.keep(w.owner.id);
    as(w.owner);
    ai.failNext = true;
    const r = await (await post(w.diagram.id, { prompt: withPhotoNote(NAME, ""), sourceImageId: img.id, freeForm: true })).json();
    await finished(r.jobId);
    const view = (await (await latestJob(new Request("http://x"), params(w.diagram.id))).json()).job;
    expect(view.freeForm).toBe(true);
    expect(withRestoredPhoto(draftFromFailedJob(view.promptText, view.selectedPrompt), view).freeForm).toBe(true);
  });
});

describe("T5051 — the partner PDF is drawn in the project's colours", () => {
  it("only colours reach the markup: a stored value that is not a colour is dropped, and the default drawn (the 2026-09-29 review)", () => {
    for (const ok of ["#fff", "#FEF9C3", "red", "transparent", "rgb(1, 2, 3)", "rgba(0,0,0,0.5)", "hsl(120deg 50% 50%)"]) expect(isSafeColor(ok), ok).toBe(true);
    for (const bad of ['red"/><image href=x onerror=alert(1)>', "url(#x)", "", "expression(alert(1))", 5]) expect(isSafeColor(bad), String(bad)).toBe(false);
    const evil = 'red"/><image href=x onerror=alert(1)>';
    const data = {
      elements: [{ id: "t1", type: "task", x: 0, y: 0, width: 120, height: 60, label: "Check claim", properties: { fillColor: evil, strokeColor: evil } }],
      connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as DiagramData;
    for (const svg of [
      renderDiagramSvg(data, { task: evil } as never),
      renderTemplateThumbnailSvg(data as never, { trueColors: true, fullLabels: true, colorConfig: { task: evil } as never }),
    ]) {
      expect(svg).not.toContain("onerror");
      expect(svg).not.toContain("<image");
    }
  });

  it("the colours given are painted; none given keeps the type defaults; the worker passes the project's", () => {
    const data = {
      elements: [{ id: "t1", type: "task", x: 0, y: 0, width: 120, height: 60, label: "Check claim", properties: {} }],
      connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as DiagramData;
    expect(renderDiagramSvg(data, { task: "#123456" })).toContain("#123456");
    expect(renderDiagramSvg(data)).not.toContain("#123456");
    const worker = read("app/lib/partner/worker.ts");
    expect(worker).toContain("select: { id: true, colorConfig: true },");
    expect(worker).toContain(`renderDiagramSvg(run.data, effectiveSymbolColors(projectColors, {}, "normal"))`);
  });
});
