/**
 * T5255 — per-Org AI models, slice 1 (Paul, 2026-10-05; plan: new features/ai-model-selection-changes-plan-2026-10-05.md):
 * SuperAdmin offers each Org lists of models (Default / Vision / Voice Assist Command); the Org's chosen model is what its people
 * run; ordinary users never choose; a SuperAdmin keeps the global settings. Every route that calls a provider picks its model
 * through ONE resolver.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("@/app/lib/db", () => ({
  prisma: {
    appSetting: {
      findUnique: async ({ where }: { where: { key: string } }) => (store.has(where.key) ? { key: where.key, value: store.get(where.key)! } : null),
      upsert: async ({ where, create, update }: { where: { key: string }; create: { value: string }; update: { value: string } }) => { store.set(where.key, store.has(where.key) ? update.value : create.value); },
      deleteMany: async ({ where }: { where: { key: string } }) => { store.delete(where.key); },
    },
  },
}));

import { chooseModel } from "@/app/lib/ai/modelAccess";
import {
  chosenKey, defaultOfferedModels, getChosenModel, getOfferedModels, modelInForce, offeredKey, pickModelInForce,
  resetOfferedModels, resolveOrgModel, setChosenModel, setOfferedModels,
} from "@/app/lib/ai/orgModels";
import { AI_MODELS } from "@/app/lib/ai/models";

const OPUS = "claude-opus-5", SONNET = "claude-sonnet-5-5", HAIKU = "claude-haiku-4-5-20251001";
const all = () => AI_MODELS.map((m) => m.id);

beforeEach(() => { store.clear(); process.env.ANTHROPIC_API_KEY = "sk-test"; });

describe("T5255 the pure choice", () => {
  const base = { defaults: [OPUS, SONNET, HAIKU], usable: () => true };
  it("the Org's chosen model wins when it is offered and runnable", () => {
    expect(pickModelInForce({ ...base, offered: [OPUS, SONNET], chosen: SONNET, globalModel: OPUS })).toBe(SONNET);
  });
  it("a chosen model that is no longer offered is ignored", () => {
    expect(pickModelInForce({ ...base, offered: [OPUS], chosen: SONNET, globalModel: OPUS })).toBe(OPUS);
  });
  it("an Org nobody has curated runs on the global setting — nothing changes the day this ships", () => {
    expect(pickModelInForce({ ...base, offered: null, chosen: null, globalModel: "gemini-x" })).toBe("gemini-x");
  });
  it("a curated list that leaves out the global model uses the first runnable model in the list", () => {
    expect(pickModelInForce({ ...base, offered: [SONNET, HAIKU], chosen: null, globalModel: OPUS })).toBe(SONNET);
    expect(pickModelInForce({ ...base, usable: (id) => id === HAIKU, offered: [SONNET, HAIKU], chosen: null, globalModel: OPUS })).toBe(HAIKU);
  });
  it("an EMPTY list means “use the global setting” — AI keeps working", () => {
    expect(pickModelInForce({ ...base, offered: [], chosen: null, globalModel: OPUS })).toBe(OPUS);
  });
  it("when nothing in the list can run here, the global setting is the answer", () => {
    expect(pickModelInForce({ ...base, usable: () => false, offered: [SONNET], chosen: SONNET, globalModel: OPUS })).toBe(OPUS);
  });
});

describe("T5255 the starting lists", () => {
  it("Default and Command: every Anthropic model; Vision: the Anthropic models that read images; nothing from another provider", () => {
    const def = defaultOfferedModels("default");
    expect(def).toEqual(defaultOfferedModels("command"));
    expect(def).toEqual(AI_MODELS.filter((m) => (m.provider ?? "anthropic") === "anthropic").map((m) => m.id));
    expect(def).toContain("claude-fable-5-1");
    expect(def).toContain("claude-opus-5-5");
    expect(def).toContain(HAIKU);
    const vision = defaultOfferedModels("vision");
    expect(vision.every((id) => AI_MODELS.find((m) => m.id === id)?.vision !== false)).toBe(true);
    expect(def.every((id) => AI_MODELS.some((m) => m.id === id && (m.provider ?? "anthropic") === "anthropic"))).toBe(true);
  });
});

describe("T5255 what SuperAdmin offers and what the OrgAdmin chooses", () => {
  it("an Org with nothing stored is offered the default list, and says it is not customised", async () => {
    const o = await getOfferedModels("org1", "default");
    expect(o.customised).toBe(false);
    expect(o.ids).toEqual(defaultOfferedModels("default"));
  });
  it("SuperAdmin sets the list; unknown ids are refused; a reset goes back to the default", async () => {
    expect(await setOfferedModels("org1", "default", [OPUS, SONNET, OPUS])).toEqual([OPUS, SONNET]);
    expect(await getOfferedModels("org1", "default")).toEqual({ ids: [OPUS, SONNET], customised: true });
    await expect(setOfferedModels("org1", "default", ["no-such-model"])).rejects.toThrow(/Unknown model/);
    await resetOfferedModels("org1", "default");
    expect((await getOfferedModels("org1", "default")).customised).toBe(false);
  });
  it("lists are per Org and per purpose", async () => {
    await setOfferedModels("org1", "default", [OPUS]);
    expect((await getOfferedModels("org2", "default")).customised).toBe(false);
    expect((await getOfferedModels("org1", "vision")).customised).toBe(false);
  });
  it("the OrgAdmin can choose only from the list; a blank clears the choice", async () => {
    await setOfferedModels("org1", "default", [OPUS, SONNET]);
    expect(await setChosenModel("org1", "default", SONNET)).toBe(SONNET);
    await expect(setChosenModel("org1", "default", HAIKU)).rejects.toThrow(/not offered/);
    expect(await getChosenModel("org1", "default")).toBe(SONNET);
    expect(await setChosenModel("org1", "default", "")).toBeNull();
    expect(await getChosenModel("org1", "default")).toBeNull();
  });
  it("removing a model from the list clears an Org choice that depended on it", async () => {
    await setOfferedModels("org1", "default", [OPUS, SONNET]);
    await setChosenModel("org1", "default", SONNET);
    await setOfferedModels("org1", "default", [OPUS]);
    expect(await getChosenModel("org1", "default")).toBeNull();
  });
  it("the model in force follows the Org's choice", async () => {
    await setOfferedModels("org1", "default", [OPUS, SONNET]);
    await setChosenModel("org1", "default", SONNET);
    expect(await modelInForce("org1", "default")).toBe(SONNET);
    expect(await modelInForce("org2", "default")).toBe(OPUS);          // never curated → the global setting (Opus 5 unless a row says otherwise)
  });
  it("the stored keys are the documented ones", () => {
    expect(offeredKey("o", "vision")).toBe("ai.org.o.offered.vision");
    expect(chosenKey("o", "command")).toBe("ai.org.o.chosen.command");
  });
});

describe("T5255 users do not choose", () => {
  it("chooseModel ignores a requested model for everyone but a SuperAdmin — even one an own key unlocks", () => {
    expect(chooseModel(HAIKU, SONNET, false)).toBe(SONNET);
    expect(chooseModel("claude-fable-5-1", SONNET, false)).toBe(SONNET);
    expect(chooseModel(undefined, SONNET, false)).toBe(SONNET);
    expect(chooseModel(HAIKU, SONNET, true)).toBe(HAIKU);              // a SuperAdmin still picks
    expect(chooseModel("made-up", SONNET, true)).toBe(SONNET);
  });
  it("outside a request (no session) the resolver falls back to the global setting — AI never fails over a model lookup", async () => {
    expect(all()).toContain(await resolveOrgModel());
    expect(all()).toContain(await resolveOrgModel({ purpose: "command" }));
    expect(all()).toContain(await resolveOrgModel({ hasImage: true }));
  });
  it("the models list for an ordinary user is the one model in force", () => {
    const src = readFileSync("app/api/ai/models/route.ts", "utf8");
    expect(src).toContain("allowedGenerateModels(current, false, byo).filter((m) => m.id === current)");
    expect(src).toContain("resolveOrgModel({ hasImage: false })");
  });
});

describe("T5255 one resolver (a ratchet)", () => {
  function files(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "generated") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...files(p));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  }
  /** The places that legitimately read the GLOBAL setting: the settings themselves, SuperAdmin tools, and the partner worker (no session). */
  const GLOBAL_OK = (rel: string) =>
    rel === "app/lib/ai/aiModelSetting.ts" || rel === "app/lib/ai/orgModels.ts" || rel === "app/lib/ai/planGeneric.ts" ||
    rel.startsWith("app/api/admin/") || rel.startsWith("app/(dashboard)/dashboard/admin/") ||
    rel === "app/lib/partner/worker.ts" || rel === "app/api/ai/generate-bpmn/export-prompt/route.ts" || rel === "app/api/ai/generate-bpmn/compare/route.ts";
  it("no other file reads the global model getters — a route that calls a provider goes through resolveOrgModel()", () => {
    const bad: string[] = [];
    for (const f of [...files("app/api"), ...files("app/lib"), ...files("app/(dashboard)"), ...files("app/components")]) {
      const rel = f.split("\\").join("/");
      if (GLOBAL_OK(rel)) continue;
      readFileSync(f, "utf8").split("\n").forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        if (/\b(getAiGenerateModel|resolveGenerateModel|getAiCommandModel|getAiVisionModel)\s*\(/.test(l)) bad.push(`${rel}:${i + 1}: ${l.trim().slice(0, 100)}`);
      });
    }
    expect(bad).toEqual([]);
  });
  it("the user-facing generate routes use it, with the image flag", () => {
    for (const r of ["ai/generate-bpmn", "ai/generate-diagram", "ai/bpmn/plan", "ai/epc/plan", "ai/flowchart/plan"]) {
      expect(readFileSync(`app/api/${r}/route.ts`, "utf8"), r).toContain("resolveOrgModel({ hasImage:");
    }
    expect(readFileSync("app/api/diagrams/[id]/generate/route.ts", "utf8")).toContain("resolveOrgModel({ hasImage: !!photo })");
    expect(readFileSync("app/api/ai/command/route.ts", "utf8")).toContain('resolveOrgModel({ purpose: "command" })');
  });
});
