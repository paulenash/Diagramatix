/**
 * The phone's Generate, run as a server job (2026-09-28, mobile voice stage 1).
 *
 * Plan: "a server test of the generate-and-save job (a locked phone
 * mid-generation still gets its diagram) … reviewers are not offered Generate."
 *
 * Real test database. Faked: the session and cookies, the model call
 * (planBpmn), the model/key lookup, and the subscription gates (so a test can
 * make one refuse). Everything else — access checks, the layout, the prompt
 * link, the save, the history row — is the production code.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, createProject, addProjectShare, addOrgMember, createDiagram } from "../_setup/factories";
import { AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";

const sess = vi.hoisted(() => ({ current: null as null | { user: { id: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => sess.current }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const ai = vi.hoisted(() => ({
  plan: null as null | (() => unknown),
  tooBig: false,
  usage: [] as string[],
}));
vi.mock("@/app/lib/ai/planBpmn", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/ai/planBpmn")>()),
  planBpmn: vi.fn(async () => ai.plan!()),
}));
vi.mock("@/app/lib/ai/aiModelSetting", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/ai/aiModelSetting")>()),
  resolveGenerateModel: async () => "claude-opus-5",
}));
vi.mock("@/app/lib/ai/anthropicClient", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/ai/anthropicClient")>()),
  aiApiKey: () => "test-key",
}));
vi.mock("@/app/lib/subscription-route", async (orig) => {
  const { NextResponse } = await import("next/server");
  return {
    ...(await orig<typeof import("@/app/lib/subscription-route")>()),
    gateLimit: async () => null,
    gateElementCount: async () => (ai.tooBig
      ? NextResponse.json({ error: "Free plans are limited to 20 BPMN elements per diagram." }, { status: 403 })
      : null),
    recordUsage: async (_u: string, metric: string) => { ai.usage.push(metric); },
  };
});

import { runGenerateJob, reapStaleGenerateJobs, STALE_GENERATE_JOB_MS, KEEP_FINISHED_GENERATE_JOBS_MS } from "@/app/lib/ai/generateJob";
import { POST as startJob, GET as latestJob } from "@/app/api/diagrams/[id]/generate/route";
import { GET as pollJob } from "@/app/api/diagrams/[id]/generate/[jobId]/route";
import { GET as getDiagram } from "@/app/api/diagrams/[id]/route";
import { PUT as putPrompt } from "@/app/api/prompts/[id]/route";
import type { DiagramData } from "@/app/lib/diagram/types";

const PLAN = () => ({
  ok: true, model: "claude-opus-5",
  plan: {
    elements: [
      { id: "p1", type: "pool", label: "Pizza shop", poolType: "white-box" },
      { id: "e1", type: "start-event", label: "Order received", pool: "p1" },
      { id: "t1", type: "task", label: "Bake pizza", taskType: "user", pool: "p1" },
      { id: "e2", type: "end-event", label: "Delivered", pool: "p1" },
    ],
    connections: [
      { sourceId: "e1", targetId: "t1", type: "sequence" },
      { sourceId: "t1", targetId: "e2", type: "sequence" },
    ],
  },
});

const as = (u: { id: string; email: string } | null) => { sess.current = u ? { user: { id: u.id, email: u.email } } : null; };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string, body: unknown) =>
  startJob(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), params(id));
const EMPTY = { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 }, title: { text: "Keep this title" } };

async function asBpmn(diagramId: string, data: unknown = EMPTY) {
  await prisma.diagram.update({ where: { id: diagramId }, data: { type: "bpmn" } });
  await prisma.$executeRawUnsafe(`UPDATE "Diagram" SET data = $1::jsonb WHERE id = $2`, JSON.stringify(data), diagramId);
}

async function world() {
  const { user: owner, org } = await createUserWithOrg();
  const viewer = await createUser(); await addOrgMember(viewer.id, org.id, "Viewer");
  const reviewer = await createUser(); await addOrgMember(reviewer.id, org.id, "Viewer");
  const project = await createProject({ userId: owner.id, orgId: org.id });
  await addProjectShare(project.id, viewer.id, "VIEW");
  const diagram = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id, name: "Pizza orders" });
  await asBpmn(diagram.id);
  // A live review round with `reviewer` assigned: they may add comments, never content.
  const group = await prisma.collaborationGroup.create({ data: { name: "Reviewers", ownerId: owner.id } });
  const review = await prisma.diagramReview.create({
    data: { diagramId: diagram.id, groupId: group.id, requesterId: owner.id, objective: "Check it", dueDate: new Date(Date.now() + 86_400_000) },
  });
  await prisma.diagramReviewer.create({ data: { reviewId: review.id, userId: reviewer.id } });
  return { owner, org, viewer, reviewer, diagram };
}

/** The job's own input, as the route would build it (the version is the one read now). */
async function jobInput(w: Awaited<ReturnType<typeof world>>, jobId: string, prompt = "A customer orders a pizza. The shop bakes it and delivers it.", who?: { id: string }) {
  const u = who ?? w.owner;
  return {
    jobId, diagramId: w.diagram.id, userId: u.id, promptOwnerId: u.id, orgId: w.org.id,
    aiContext: { userId: u.id, orgId: w.org.id, invocationPoint: AI_INVOCATION_POINTS.MobileGenerate },
    ownKey: null, model: "claude-opus-5", apiKey: "test-key", prompt,
    promptMeta: { promptSource: "dictated" as const },
    baseVersion: (await prisma.diagram.findUniqueOrThrow({ where: { id: w.diagram.id } })).version,
  };
}
const newJob = (w: Awaited<ReturnType<typeof world>>, prompt = "x") =>
  prisma.diagramGenerateJob.create({ data: { diagramId: w.diagram.id, userId: w.owner.id, orgId: w.org.id, promptText: prompt } });
const dataOf = async (id: string) => (await prisma.diagram.findUniqueOrThrow({ where: { id } })).data as unknown as DiagramData;

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
  ai.plan = PLAN;
  ai.tooBig = false;
  ai.usage = [];
  as(null);
});

describe("T5010 — the job plans, lays out, links the prompt and SAVES — with nobody waiting for it", () => {
  it("the diagram is saved on the server: content, the generation record, a new version and a history row", async () => {
    const w = await world();
    const before = await prisma.diagram.findUniqueOrThrow({ where: { id: w.diagram.id } });
    const job = await newJob(w);
    await runGenerateJob(await jobInput(w, job.id));

    const done = await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done).toMatchObject({ status: "succeeded", stage: "done", model: "claude-opus-5", version: before.version + 1 });
    const data = await dataOf(w.diagram.id);
    expect(data.elements.map((e) => e.label)).toEqual(expect.arrayContaining(["Bake pizza"]));
    expect((data as unknown as { title: unknown }).title, "diagram-level fields are kept").toEqual({ text: "Keep this title" });
    expect(data.aiGeneration).toMatchObject({ model: "claude-opus-5", autoNamed: true, promptName: "Pizza orders — AI prompt" });
    expect(data.aiGeneration?.plan?.elements, "the plan is kept on the diagram (replay)").toHaveLength(4);
    const after = await prisma.diagram.findUniqueOrThrow({ where: { id: w.diagram.id } });
    expect(after.version).toBe(before.version + 1);
    expect(await prisma.diagramHistory.count({ where: { diagramId: w.diagram.id } })).toBe(1);
    expect(ai.usage, "one AI attempt counted").toEqual(["aiAttempts"]);
    expect(await prisma.aiDiagramGeneration.count({ where: { source: "mobile-generate" } })).toBe(1);
  });

  it("the prompt is auto-saved for the diagram — dictated, with its plan, counted once — and re-used next time", async () => {
    const w = await world();
    await runGenerateJob(await jobInput(w, (await newJob(w)).id));
    const prompts = await prisma.prompt.findMany({ where: { userId: w.owner.id } });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({ name: "Pizza orders — AI prompt", source: "dictated", useCount: 1, modelUsed: "claude-opus-5" });
    expect(prompts[0].planUpdatedAt).not.toBeNull();
    expect((await dataOf(w.diagram.id)).aiGeneration?.promptId).toBe(prompts[0].id);

    // Clear it and generate again: the SAME auto-named prompt is updated, not a second one.
    await asBpmn(w.diagram.id, { ...EMPTY, aiGeneration: (await dataOf(w.diagram.id)).aiGeneration, elements: [] });
    await runGenerateJob(await jobInput(w, (await newJob(w)).id, "A customer orders a pizza by phone."));
    const again = await prisma.prompt.findMany({ where: { userId: w.owner.id } });
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ text: "A customer orders a pizza by phone.", useCount: 2 });
  });

  it("started through the route and never polled (the phone locked), the diagram is still saved", async () => {
    const w = await world();
    as(w.owner);
    const r = await post(w.diagram.id, { prompt: "A customer orders a pizza.", promptSource: "dictated" });
    expect(r.status).toBe(202);
    const j = await r.json();
    expect(j).toMatchObject({ status: "queued", pollAfterSeconds: 3 });
    const done = await finished(j.jobId);
    expect(done.status).toBe("succeeded");
    expect((await dataOf(w.diagram.id)).elements.length).toBeGreaterThan(0);
    // …and when the phone wakes, one poll says so.
    const polled = await (await pollJob(new Request("http://x"), { params: Promise.resolve({ id: w.diagram.id, jobId: j.jobId }) })).json();
    expect(polled).toMatchObject({ status: "succeeded", version: done.version });
  });
});

describe("T5011 — a run that fails says why, in the user's terms, and costs nothing it should not", () => {
  it("the AI refusing: failed with a readable reason; no attempt counted; the diagram untouched", async () => {
    const w = await world();
    ai.plan = () => ({ ok: false, status: 529, error: "Error 529: overloaded_error" });
    const job = await newJob(w);
    await runGenerateJob(await jobInput(w, job.id));
    const done = await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done).toMatchObject({ status: "failed", errorCode: "ai_failed" });
    expect(done.errorMessage).toContain("overloaded right now");
    expect(ai.usage).toEqual([]);
    expect((await dataOf(w.diagram.id)).elements).toEqual([]);
  });

  it("a plan over the plan's element limit: the gate's own words; no attempt counted", async () => {
    const w = await world();
    ai.tooBig = true;
    const job = await newJob(w);
    await runGenerateJob(await jobInput(w, job.id));
    const done = await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done).toMatchObject({ status: "failed", errorCode: "element_limit", errorMessage: "Free plans are limited to 20 BPMN elements per diagram." });
    expect(ai.usage).toEqual([]);
  });

  it("an unexpected error inside: a curated message, never the raw exception", async () => {
    const w = await world();
    ai.plan = () => ({ ok: true, model: "m", plan: { elements: "not an array", connections: [] } });
    const job = await newJob(w);
    await runGenerateJob(await jobInput(w, job.id));
    const done = await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe("failed");
    expect(["plan_invalid", "server_error"]).toContain(done.errorCode);
    expect(done.errorMessage).not.toMatch(/TypeError|undefined|prisma/i);
  });

  it("a diagram deleted before the save: failed, and nothing is written", async () => {
    const w = await world();
    const job = await newJob(w);
    ai.plan = async () => { await prisma.diagram.delete({ where: { id: w.diagram.id } }); return PLAN(); };
    await expect(runGenerateJob(await jobInput(w, job.id))).resolves.toBeUndefined();
    // The run's row goes with its diagram (cascade); nothing was recreated.
    expect(await prisma.diagramGenerateJob.findUnique({ where: { id: job.id } })).toBeNull();
    expect(await prisma.diagram.findUnique({ where: { id: w.diagram.id } })).toBeNull();
  });
});

describe("T5012 — a run lost to a restart is reported, and old runs are cleared away", () => {
  it("not heard from for 10 minutes, or queued that long → failed (worker_lost); finished over a week ago → deleted; a live or slow-but-beating one is left alone", async () => {
    const w = await world();
    const now = Date.now();
    const old = new Date(now - STALE_GENERATE_JOB_MS - 60_000);
    const lost = await prisma.diagramGenerateJob.create({ data: { diagramId: w.diagram.id, userId: w.owner.id, orgId: w.org.id, promptText: "a", status: "running", startedAt: old, updatedAt: old } });
    // Started long ago but still beating: a slow model call, not a lost run.
    const slow = await prisma.diagramGenerateJob.create({ data: { diagramId: w.diagram.id, userId: w.owner.id, orgId: w.org.id, promptText: "s", status: "running", startedAt: new Date(now - 14 * 60_000), updatedAt: new Date(now - 30_000) } });
    const neverStarted = await prisma.diagramGenerateJob.create({ data: { diagramId: w.diagram.id, userId: w.owner.id, orgId: w.org.id, promptText: "b", createdAt: old } });
    const live = await prisma.diagramGenerateJob.create({ data: { diagramId: w.diagram.id, userId: w.owner.id, orgId: w.org.id, promptText: "c", status: "running", startedAt: new Date(now - 30_000) } });
    const ancient = await prisma.diagramGenerateJob.create({ data: { diagramId: w.diagram.id, userId: w.owner.id, orgId: w.org.id, promptText: "d", status: "succeeded", finishedAt: new Date(now - KEEP_FINISHED_GENERATE_JOBS_MS - 60_000) } });

    await reapStaleGenerateJobs(now);
    for (const j of [lost, neverStarted]) {
      expect(await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: j.id } })).toMatchObject({ status: "failed", errorCode: "worker_lost" });
    }
    expect((await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: live.id } })).status).toBe("running");
    expect((await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: slow.id } })).status, "a slow run that still beats").toBe("running");
    expect(await prisma.diagramGenerateJob.findUnique({ where: { id: ancient.id } })).toBeNull();
  });
});

describe("T5013 — who may generate: owners and editors of a BPMN diagram — never a reviewer or a viewer", () => {
  it("GET says canEdit for the owner only; a reviewer can review but not edit", async () => {
    const w = await world();
    for (const [u, canReview, canEdit] of [[w.owner, true, true], [w.reviewer, true, false], [w.viewer, false, false]] as const) {
      as(u);
      const j = await (await getDiagram(new Request("http://x"), params(w.diagram.id))).json();
      expect({ canReview: j.canReview, canEdit: j.canEdit }, u.email).toEqual({ canReview, canEdit });
    }
  });

  it("the start is refused to a reviewer and a viewer, and to a non-BPMN diagram, with no job created", async () => {
    const w = await world();
    for (const u of [w.reviewer, w.viewer]) {
      as(u);
      expect((await post(w.diagram.id, { prompt: "p" })).status, u.email).toBe(403);
    }
    as(w.owner);
    await prisma.diagram.update({ where: { id: w.diagram.id }, data: { type: "value-chain" } });
    expect((await post(w.diagram.id, { prompt: "p" })).status).toBe(400);
    expect(await prisma.diagramGenerateJob.count()).toBe(0);
  });

  it("no prompt → 400; a stale copy (another device changed it) → 409; a second tap → the same run", async () => {
    const w = await world();
    as(w.owner);
    expect((await post(w.diagram.id, { prompt: "   " })).status).toBe(400);
    const v = (await prisma.diagram.findUniqueOrThrow({ where: { id: w.diagram.id } })).version;
    const stale = await post(w.diagram.id, { prompt: "p", version: v + 7 });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toBe("conflict");

    ai.plan = () => new Promise(() => { /* the model is thinking */ });
    const first = await (await post(w.diagram.id, { prompt: "p", version: v })).json();
    const second = await post(w.diagram.id, { prompt: "p", version: v });
    expect(second.status).toBe(202);
    expect(await second.json()).toMatchObject({ jobId: first.jobId, duplicate: true });
  });

  it("a run is its starter's: another user polls “not found”; GET latest returns only your own", async () => {
    const w = await world();
    as(w.owner);
    ai.plan = () => new Promise(() => { /* still thinking */ });
    const j = await (await post(w.diagram.id, { prompt: "My words" })).json();
    as(w.reviewer);
    expect((await pollJob(new Request("http://x"), { params: Promise.resolve({ id: w.diagram.id, jobId: j.jobId }) })).status).toBe(404);
    expect((await (await latestJob(new Request("http://x"), params(w.diagram.id))).json()).job).toBeNull();
    as(w.owner);
    expect((await (await latestJob(new Request("http://x"), params(w.diagram.id))).json()).job).toMatchObject({ jobId: j.jobId, promptText: "My words" });
  });
});

describe("T5014 — a saved prompt is linked only if it is yours and unchanged", () => {
  it("unchanged → linked as it is (no new prompt); someone else's id → ignored, a new one is made", async () => {
    const w = await world();
    as(w.owner);
    const mine = await prisma.prompt.create({ data: { name: "Pizza v1", text: "A customer orders a pizza.", diagramType: "bpmn", userId: w.owner.id, orgId: w.org.id } });
    const r = await post(w.diagram.id, { prompt: "A customer orders a pizza.", selectedPromptId: mine.id, promptSource: "typed" });
    await finished((await r.json()).jobId);
    const gen = (await dataOf(w.diagram.id)).aiGeneration;
    expect(gen).toMatchObject({ promptId: mine.id, promptName: "Pizza v1", autoNamed: false });
    expect(await prisma.prompt.count()).toBe(1);
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: mine.id } })).useCount).toBe(1);

    const other = await prisma.prompt.create({ data: { name: "Not yours", text: "Something else.", diagramType: "bpmn", userId: w.reviewer.id, orgId: w.org.id } });
    await asBpmn(w.diagram.id);
    const r2 = await post(w.diagram.id, { prompt: "Something else.", selectedPromptId: other.id });
    await finished((await r2.json()).jobId);
    const gen2 = (await dataOf(w.diagram.id)).aiGeneration;
    expect(gen2?.promptId).not.toBe(other.id);
    expect(gen2?.autoNamed).toBe(true);
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: other.id } })).text, "someone else's prompt is never written").toBe("Something else.");
  });
});

describe("T5018 — a run the reaper gave up on neither charges nor saves (the 2026-09-28 review)", () => {
  it("reaped while the model was still thinking: it stays failed, no attempt is counted, the diagram is untouched", async () => {
    const w = await world();
    const job = await newJob(w);
    ai.plan = async () => {
      // The reaper, meanwhile, presumed a restart.
      await prisma.diagramGenerateJob.update({ where: { id: job.id }, data: { status: "failed", errorCode: "worker_lost", finishedAt: new Date() } });
      return PLAN();
    };
    await runGenerateJob(await jobInput(w, job.id));
    expect(await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "failed", errorCode: "worker_lost" });
    expect(ai.usage).toEqual([]);
    expect((await dataOf(w.diagram.id)).elements).toEqual([]);
    expect(await prisma.prompt.count(), "no prompt made either").toBe(0);
  });
});

describe("T5019 — Generate fills an EMPTY diagram and never replaces content unseen (the 2026-09-28 review)", () => {
  it("content saved on another device during the run: the run fails, and that content is kept", async () => {
    const w = await world();
    const job = await newJob(w);
    const input = await jobInput(w, job.id);
    ai.plan = async () => {
      // A co-author on the desktop draws a task and autosaves, mid-run.
      await asBpmn(w.diagram.id, { ...EMPTY, elements: [{ id: "mine", type: "task", x: 0, y: 0, width: 100, height: 60, label: "Mine", properties: {} }] });
      await prisma.diagram.update({ where: { id: w.diagram.id }, data: { version: { increment: 1 } } });
      return PLAN();
    };
    await runGenerateJob(input);
    expect(await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "failed", errorCode: "has_content" });
    expect((await dataOf(w.diagram.id)).elements.map((e) => e.id)).toEqual(["mine"]);
  });

  it("a harmless save during the run (the view moved; still empty) does not stop it", async () => {
    const w = await world();
    const job = await newJob(w);
    const input = await jobInput(w, job.id);
    ai.plan = async () => {
      await asBpmn(w.diagram.id, { ...EMPTY, viewport: { x: 40, y: 40, zoom: 1.5 } });
      await prisma.diagram.update({ where: { id: w.diagram.id }, data: { version: { increment: 1 } } });
      return PLAN();
    };
    await runGenerateJob(input);
    expect((await prisma.diagramGenerateJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("succeeded");
    expect((await dataOf(w.diagram.id)).elements.length).toBeGreaterThan(0);
  });

  it("the start is refused on a diagram that already has content", async () => {
    const w = await world();
    await asBpmn(w.diagram.id, { ...EMPTY, elements: [{ id: "x", type: "task", x: 0, y: 0, width: 100, height: 60, label: "X", properties: {} }] });
    as(w.owner);
    const r = await post(w.diagram.id, { prompt: "p" });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("has_content");
    expect(await prisma.diagramGenerateJob.count()).toBe(0);
  });
});

describe("T5020 — another editor's prompt stays linked; only a DELETED one is replaced (the 2026-09-28 review)", () => {
  it("owner generates, an editor re-generates, the owner again: still one prompt, still the owner's", async () => {
    const w = await world();
    const editor = await createUser();
    await addOrgMember(editor.id, w.org.id, "Viewer");
    const project = (await prisma.diagram.findUniqueOrThrow({ where: { id: w.diagram.id } })).projectId!;
    await addProjectShare(project, editor.id, "EDIT");

    await runGenerateJob(await jobInput(w, (await newJob(w)).id, "Version one."));
    const pA = (await dataOf(w.diagram.id)).aiGeneration!.promptId;
    const clear = async () => asBpmn(w.diagram.id, { ...EMPTY, aiGeneration: (await dataOf(w.diagram.id)).aiGeneration });

    await clear();
    await runGenerateJob(await jobInput(w, (await newJob(w)).id, "Version two, by the editor.", editor));
    expect((await dataOf(w.diagram.id)).aiGeneration?.promptId, "the editor's run keeps the owner's link").toBe(pA);
    expect(await prisma.prompt.count(), "and adds no copy").toBe(1);
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: pA } })).text, "nor writes the owner's prompt").toBe("Version one.");

    await clear();
    await runGenerateJob(await jobInput(w, (await newJob(w)).id, "Version three."));
    expect(await prisma.prompt.count()).toBe(1);
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: pA } })).text).toBe("Version three.");
  });

  it("a deleted auto-named prompt is replaced by a new one", async () => {
    const w = await world();
    await runGenerateJob(await jobInput(w, (await newJob(w)).id, "First."));
    const pA = (await dataOf(w.diagram.id)).aiGeneration!.promptId;
    await prisma.prompt.delete({ where: { id: pA } });
    await asBpmn(w.diagram.id, { ...EMPTY, aiGeneration: (await dataOf(w.diagram.id)).aiGeneration });
    await runGenerateJob(await jobInput(w, (await newJob(w)).id, "Second."));
    const pB = (await dataOf(w.diagram.id)).aiGeneration!.promptId;
    expect(pB).not.toBe(pA);
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: pB } })).text).toBe("Second.");
  });

  it("PUT /api/prompts/[id] tells the desktop which: gone (deleted) or not yours", async () => {
    const w = await world();
    const theirs = await prisma.prompt.create({ data: { name: "Theirs", text: "t", diagramType: "bpmn", userId: w.reviewer.id, orgId: w.org.id } });
    as(w.owner);
    const put = (id: string) => putPrompt(new Request("http://x", { method: "PUT", body: JSON.stringify({ text: "x" }) }), { params: Promise.resolve({ id }) });
    const foreign = await put(theirs.id);
    expect(foreign.status).toBe(404);
    expect((await foreign.json()).gone).toBe(false);
    const missing = await put("no-such-prompt");
    expect(missing.status).toBe(404);
    expect((await missing.json()).gone).toBe(true);
  });
});
