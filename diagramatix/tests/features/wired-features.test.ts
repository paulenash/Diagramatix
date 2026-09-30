/**
 * Feature Availability slice 6 (plan 2026-09-30): the 22 features that nothing
 * read are now enforced — and the matrix starts out KEEPING TODAY'S ACCESS, so
 * wiring them takes nothing away from anyone until a cell is edited on purpose.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const A = (p: string) => read(`app/api/${p}/route.ts`);

const LEVELS = ["free", "introductory", "professional", "expert", "enterprise"];
const TWENTY_TWO = [
  "ai-generate-typed", "ai-generate-image", "ai-generate-dictated", "ai-generate-audio", "ai-generate-refine", "ai-generate-record",
  "bpmn-templates", "nl-assist", "collaboration-groups", "sharing", "co-authoring", "diff-processes",
  "visio-import-individual", "visio-export-individual", "visio-import-bulk", "visio-export-bulk",
  "sharepoint", "sop-generation", "process-portal", "choice-of-llms", "local-llm", "risk-control-examples",
];

describe("T5127 — AI generation: typed vs image, refine, audio vs record, dictated prompts, model choice", () => {
  const PLAN = ["ai/bpmn/plan", "ai/generate-bpmn", "ai/generate-diagram", "ai/epc/plan", "ai/flowchart/plan"];

  it("every plan / generate route asks for Image to Diagram when the request carries an image, else Typed Prompt — BEFORE the attempts limit", () => {
    for (const r of PLAN) {
      const src = A(r);
      expect(src, r).toContain('attachment?.type === "image" ? "ai-generate-image" : "ai-generate-typed"');
      expect(src.indexOf("gateFeature("), `${r}: the feature is checked first`).toBeLessThan(src.indexOf('gateLimit(session.user.id, "aiAttempts")'));
    }
    const phone = A("diagrams/[id]/generate");
    expect(phone).toContain('photo ? "ai-generate-image" : "ai-generate-typed"');
  });

  it("naming a model other than the default is Choice of LLMs (the five plan routes)", () => {
    for (const r of PLAN) {
      const src = A(r);
      expect(src, r).toContain("requestedModel && requestedModel !== defaultModel");
      expect(src, r).toContain('"choice-of-llms"');
    }
  });

  it("Refine has its own feature", () => {
    const src = A("ai/bpmn/refine-questions");
    expect(src).toContain('"ai-generate-refine"');
    expect(src.indexOf('"ai-generate-refine"')).toBeLessThan(src.indexOf('gateLimit(session.user.id, "aiAttempts")'));
  });

  it("uploading audio and recording are two features, told apart by a header the caller sends", () => {
    const route = A("ai/audio/transcribe");
    expect(route).toContain('req.headers.get("x-audio-source") === "record" ? "ai-generate-record" : "ai-generate-audio"');
    expect(read("app/lib/dictation/audioInput.ts")).toContain('"X-Audio-Source": source');
    expect(read("app/lib/dictation/audioInput.ts")).toContain('source: "record" | "upload" = "upload"');
    expect(read("app/components/AudioToProcessButton.tsx")).toContain('transcribeAudioBlob(blob, "record")');
  });

  it("a spoken PROMPT is Dictated Prompt; the same token still serves commands and comments freely", () => {
    const route = A("ai/dictation/token");
    expect(route).toContain('if (purpose === "prompt")');
    expect(route).toContain('"ai-generate-dictated"');
    expect(route).toContain("export async function POST(req?: Request)");
    const client = read("app/lib/dictation/index.ts");
    expect(client).toContain('...(cb.prose ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "prompt" }) } : {})');
  });

  it("typed Assist: the command route opens for Voice Assist OR Assist", () => {
    const src = A("ai/command");
    expect(src).toContain('if (feat && (await gateFeature(session.user.id, "nl-assist"))) return feat;');
  });
});

describe("T5128 — Visio, SharePoint, SOP, diff, sharing, groups, co-authoring, portal, templates, examples", () => {
  const before = (route: string, key: string, limit: string) => {
    const src = A(route);
    expect(src, `${route}: ${key}`).toContain(`"${key}"`);
    expect(src.indexOf(`"${key}"`), `${route}: the feature is checked before the allowance`).toBeLessThan(src.indexOf(`gateLimit(session.user.id, "${limit}")`));
  };

  it("the four Visio features gate their routes ahead of the import / export allowances", () => {
    before("import/visio-v3", "visio-import-individual", "individualImports");
    before("import/visio-v3/bulk", "visio-import-bulk", "bulkImports");
    before("export/visio-v2", "visio-export-individual", "individualExports");
    before("export/visio-v3", "visio-export-individual", "individualExports");
    before("export/visio-v3/bulk", "visio-export-bulk", "bulkExports");
  });

  it("SOP generation (create and regenerate), diff, SharePoint (browse, upload, download)", () => {
    before("projects/[id]/sop", "sop-generation", "aiAttempts");
    before("sop/[id]/regenerate", "sop-generation", "aiAttempts");
    expect(A("diagrams/diff")).toContain('"diff-processes"');
    for (const r of ["sharepoint", "sharepoint/upload", "sharepoint/download"]) expect(A(r), r).toContain('"sharepoint"');
  });

  it("sharing, groups, co-authoring, the portal, templates and the Risk & Control examples", () => {
    expect(A("projects/[id]/shares")).toContain('"sharing"');
    expect(A("projects/[id]/share-candidates")).toContain('"sharing"');
    expect(A("groups")).toContain('"collaboration-groups"');
    expect(A("groups/[id]/members")).toContain('"collaboration-groups"');
    expect(A("collab/token")).toContain('"co-authoring"');
    expect(A("collab/flush")).toContain('"co-authoring"');
    expect(A("diagrams/[id]/publish")).toContain('"process-portal"');
    expect(A("templates")).toContain('"bpmn-templates"');
    expect(A("risk-control-examples")).toContain('"risk-control-examples"');
  });

  it("only the changing calls are gated: reading what you already have (shares list, groups list, published diagrams) is left open", () => {
    const shares = A("projects/[id]/shares");
    const get = shares.slice(shares.indexOf("export async function GET"), shares.indexOf("export async function DELETE"));
    expect(get).not.toContain("gateFeature(");
    const groups = A("groups");
    const gGet = groups.slice(groups.indexOf("export async function GET"), groups.indexOf("export async function POST"));
    expect(gGet).not.toContain("gateFeature(");
  });
});

describe("T5129 — the matrix keeps today's access; the xlsx intent is kept beside it", () => {
  const seed = JSON.parse(read("menus_and_features/feature-availability.seed.json")) as { rows: { key: string; states: Record<string, string> }[] };
  const intent = JSON.parse(read("menus_and_features/feature-availability.xlsx-intent.json")) as { rows: { key: string; states: Record<string, string> }[]; note: string };

  it("all 22 are Available at every level in the seed — wiring the gates takes nothing away", () => {
    for (const k of TWENTY_TWO) {
      const row = seed.rows.find((r) => r.key === k)!;
      for (const l of LEVELS) expect(row.states[l], `${k} @ ${l}`).toBe("available");
    }
  });

  it("the xlsx intent is preserved for exactly those 22 (e.g. Image to Diagram not on Free, Choice of LLMs Enterprise-only)", () => {
    expect(intent.rows.map((r) => r.key).sort()).toEqual([...TWENTY_TWO].sort());
    const row = (k: string) => intent.rows.find((r) => r.key === k)!.states;
    expect(row("ai-generate-image").free).toBe("hidden");
    expect(row("ai-generate-image").introductory).toBe("available");
    expect(row("sharing")).toMatchObject({ free: "hidden", introductory: "hidden", professional: "available" });
    expect(row("choice-of-llms")).toMatchObject({ expert: "hidden", enterprise: "available" });
    expect(intent.note).toContain("scripts/sql/apply-xlsx-restrictions.sql");
  });

  it("the keep-access SQL sets the 22 x 5 to Available with an idempotent upsert, touching only FeatureAvailability", () => {
    const sql = read("scripts/sql/patch-wire-features-keep-todays-access.sql");
    for (const k of TWENTY_TWO) expect(sql, k).toContain(`('${k}')`);
    expect(sql).toContain('ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = \'available\'');
    expect(sql.match(/\b(INSERT INTO|DELETE FROM)\s+"?(\w+)"?/g)).toEqual(['INSERT INTO "FeatureAvailability"']);
    expect(sql).toContain("Keep today's access");
  });

  it("the apply-intent SQL carries all 110 cells, warns loudly, and is idempotent too", () => {
    const sql = read("scripts/sql/apply-xlsx-restrictions.sql");
    expect(sql.match(/^ {4}\('(?:free|introductory|professional|expert|enterprise)', '[a-z-]+', '(?:available|hidden)'\)/gm)?.length).toBe(110);
    expect(sql).toContain("Do NOT run it casually.");
    expect(sql).toContain('ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state"');
    for (const r of intent.rows) for (const l of LEVELS) expect(sql, `${r.key} @ ${l}`).toContain(`('${l}', '${r.key}', '${r.states[l]}')`);
  });
});
