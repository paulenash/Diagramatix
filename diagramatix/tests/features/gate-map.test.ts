/**
 * Feature Availability slice 3 (plan 2026-09-30): the registry is the map of
 * what enforces each feature — and the map is CHECKED against the source, so
 * it cannot go stale and a typo in a gate cannot lock a feature out.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURES, FEATURE_KEYS } from "@/app/lib/features/registry";
import { FEATURE_GATES } from "@/app/lib/features/gateMap";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** Every source file under app/ that is ours (not generated, not the map itself). */
function appFiles(dir = "app", out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "generated" || e.name === "node_modules") continue;
      appFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const SKIP = new Set([join("app", "lib", "features", "gateMap.ts"), join("app", "lib", "features", "registry.ts")]);
const files = appFiles().filter((f) => !SKIP.has(f));
const sources = new Map(files.map((f) => [f, read(f)]));

/** The ways code reads a feature's state, each capturing the key. */
const GATE_PATTERNS: RegExp[] = [
  /gateFeature\(\s*[^,()]+(?:\([^)]*\))?[^,()]*,\s*"([^"]+)"/g,
  /isFeatureAvailable\(\s*[^,()]+,\s*"([^"]+)"/g,
  /useFeatureState\(\s*"([^"]+)"\s*\)/g,
  /<FeatureGate[^>]*\bfeature="([^"]+)"/g,
  // the route guards take the feature as an option (not the colour-theme `feature:` keys in AdminClient)
  /guard(?:Org|Project)Route\([^)]*\{[^}]*\bfeature:\s*"([^"]+)"/g,
  /featureStates\[\s*"([^"]+)"\s*\]/g,
];

function gateReferences(): { key: string; file: string }[] {
  const refs: { key: string; file: string }[] = [];
  for (const [file, src] of sources) {
    for (const re of GATE_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) refs.push({ key: m[1], file });
    }
  }
  return refs;
}
const refs = gateReferences();

describe("T5113 — every feature says what enforces it", () => {
  it("the gate map has an entry for every registry feature, and nothing else", () => {
    expect(Object.keys(FEATURE_GATES).sort()).toEqual([...FEATURE_KEYS].sort());
    for (const f of FEATURES) expect(FEATURE_GATES[f.key].description, f.key).toBeTruthy();
  });

  it("an enforced or partly enforced feature names real places: the file exists and still contains the gate", () => {
    for (const f of FEATURES) {
      const g = FEATURE_GATES[f.key];
      if (g.status !== "wired" && g.status !== "partial") continue;
      expect(g.ui.length + g.server.length, `${f.key}: ${g.status} but names no place`).toBeGreaterThan(0);
      for (const r of [...g.ui, ...g.server]) {
        expect(existsSync(r.file), `${f.key}: ${r.file} is missing`).toBe(true);
        expect(read(r.file), `${f.key}: ${r.file} no longer contains ${r.needle}`).toContain(r.needle);
        expect(r.what, `${f.key}: a place needs a description`).toBeTruthy();
      }
      if (g.status === "wired") expect(g.server.length, `${f.key}: wired means enforced on the server`).toBeGreaterThan(0);
    }
  });

  it("a feature marked not-enforced really is: no gate anywhere reads its key (else it was wired and the map is stale)", () => {
    for (const f of FEATURES) {
      const g = FEATURE_GATES[f.key];
      if (g.status !== "unwired") continue;
      const hits = refs.filter((r) => r.key === f.key).map((r) => r.file);
      expect(hits, `${f.key} is marked unwired but is read by a gate in ${hits.join(", ")} — mark it wired/partial in gateMap.ts`).toEqual([]);
      expect(g.ui.length + g.server.length, `${f.key}: unwired but lists places`).toBe(0);
    }
  });

  it("no gate in the app names a feature that is not in the registry (a typo would lock the feature out for everyone but a SuperAdmin)", () => {
    const known = new Set(FEATURE_KEYS);
    const bad = refs.filter((r) => !known.has(r.key)).map((r) => `${r.key} in ${r.file}`);
    expect(bad).toEqual([]);
  });

  it("the not-enforced list is a RATCHET: 23 today, and it can only shrink (edit this down when you wire one)", () => {
    const unwired = FEATURES.filter((f) => FEATURE_GATES[f.key].status === "unwired").map((f) => f.key).sort();
    expect(unwired).toEqual([
      "ai-generate-audio", "ai-generate-dictated", "ai-generate-image", "ai-generate-record", "ai-generate-refine", "ai-generate-typed",
      "bpmn-templates", "choice-of-llms", "co-authoring", "collaboration-groups", "diff-processes", "local-llm", "nl-assist",
      "process-portal", "risk-control-examples", "sharepoint", "sharing", "simulator-examples", "sop-generation",
      "visio-export-bulk", "visio-export-individual", "visio-import-bulk", "visio-import-individual",
    ].sort());
    const count = (s: string) => FEATURES.filter((f) => FEATURE_GATES[f.key].status === s).length;
    expect({ wired: count("wired"), partial: count("partial"), unwired: count("unwired"), informational: count("informational") })
      .toEqual({ wired: 4, partial: 7, unwired: 23, informational: 1 });
  });
});

describe("T5114 — the map reaches the SuperAdmin grid", () => {
  it("the matrix API sends each feature with its gate info", () => {
    const api = read("app/api/admin/feature-availability/route.ts");
    expect(api).toContain('import { FEATURE_GATES } from "@/app/lib/features/gateMap";');
    expect(api).toContain("FEATURES.map((f) => ({ ...f, gate: FEATURE_GATES[f.key] ?? null }))");
  });

  it("the grid shows an enforcement badge, an ⓘ 'where is this enforced' panel, the summary, a 'not fully enforced only' filter and the effective state after prerequisites", () => {
    const ui = read("app/(dashboard)/dashboard/admin/feature-availability/FeatureAvailabilityEditor.tsx");
    expect(ui).toContain("STATUS_BADGE[f.gate.status]");
    expect(ui).toContain("function GateDetail(");
    expect(ui).toContain("Nothing reads this cell yet");
    expect(ui).toContain("Not fully enforced only");
    expect(ui).toContain('aria-label="Enforcement summary"');
    expect(ui).toContain("applyDependencies(");
    expect(ui).toContain("in effect: ");
  });
});
