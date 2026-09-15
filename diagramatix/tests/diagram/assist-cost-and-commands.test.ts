/**
 * Paul, 2026-09-15: "add a button at the top called Commands … a moveable
 * scrollable panel" and "a current usage cost button that calculates the cost
 * so far". The catalogue behind Commands is tested in assist-command-catalog;
 * this file pins the cost arithmetic and the wiring.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { summariseCommandUsage, formatCostReport, type UsageRow } from "@/app/lib/assist/usageCost";

const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, "..", "..", ...p), "utf8");

const row = (o: Partial<UsageRow>): UsageRow => ({
  invocationPoint: "bpmn.live-command", provider: "anthropic", model: "claude-opus-5",
  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, ...o,
});
const rates: Record<string, { inputPer1M: number; outputPer1M: number }> = { "claude-opus-5": { inputPer1M: 10, outputPer1M: 50 } };
const rateFor = (m: string) => rates[m];

describe("cost so far", () => {
  it("T4397 — AI calls at the rate catalogue, voice by the minute, the open mic added live, unpriced models named", () => {
    const rows = [
      row({ inputTokens: 1_000_000, outputTokens: 100_000 }),                       // $10 + $5
      row({ inputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 }),     // cache read at a tenth: $1
      row({ invocationPoint: "voice.dictation", provider: "deepgram", latencyMs: 120_000 }), // 2 min
      row({ invocationPoint: "voice.dictation", provider: "browser", latencyMs: 600_000 }),  // free
      row({ model: "mystery-model", inputTokens: 5_000_000 }),                      // no rate → 0, named
      row({ invocationPoint: "something.else", inputTokens: 9_999_999 }),           // not ours → ignored
    ];
    const r = summariseCommandUsage(rows, rateFor, 0.006, { sinceIso: "2026-09-15T00:00:00.000Z", liveVoiceSeconds: 60 });
    expect(r.aiCalls).toBe(3);
    expect(r.aiCostUsd).toBeCloseTo(16, 6);
    expect(r.voiceSessions).toBe(2);
    expect(r.voiceSeconds).toBe(120 + 600 + 60);
    expect(r.voiceCostUsd, "2 min closed + 1 min live, browser session free").toBeCloseTo(0.018, 6);
    expect(r.totalUsd).toBeCloseTo(16.018, 6);
    expect(r.unpricedModels).toEqual(["mystery-model"]);

    const empty = summariseCommandUsage([], rateFor, 0.006, { sinceIso: "x" });
    expect(empty.totalUsd).toBe(0);
    expect(formatCostReport(empty)).toBe("$0.00 so far · 0 AI calls ($0.00) · 0 s voice ($0.00)");
    expect(formatCostReport(r)).toBe("$16.02 so far · 3 AI calls ($16.00) · 13.0 min voice ($0.02)");
    // Below a cent the readout keeps four decimals so a small session is not shown as $0.00.
    const tiny = summariseCommandUsage([row({ invocationPoint: "voice.dictation", provider: "deepgram", latencyMs: 30_000 })], rateFor, 0.006, { sinceIso: "x" });
    expect(formatCostReport(tiny)).toBe("$0.0030 so far · 0 AI calls ($0.00) · 30 s voice ($0.0030)");
  });

  it("T4398 — the bar has Commands and Cost, the panel is draggable, and the editor adds the live mic seconds", () => {
    const bar = read("app", "components", "canvas", "AbracadabraBar.tsx");
    expect(bar).toContain(">Commands</button>");
    expect(bar).toContain("COMMAND_CATALOG.map(");
    expect(bar, "the reminder card scrolls").toContain('className="overflow-y-auto px-3 py-2"');
    expect(bar, "and moves by its title bar").toMatch(/onPointerDown=\{onDown\} onPointerMove=\{onMove\} onPointerUp=\{onUp\}/);
    expect(bar).toContain("formatCostReport(cost.report)");
    expect(bar, "the cost is labelled as an estimate").toContain(">estimate</span>");

    const editor = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    expect(editor).toContain("onCost={fetchAbraCost}");
    expect(editor, "the open mic session is added live").toMatch(/abraMicOpenedAt\.current = Date\.now\(\);/);
    expect(editor).toMatch(/\/api\/ai\/command\/usage\?\$\{q\}/);

    const route = read("app", "api", "ai", "command", "usage", "route.ts");
    expect(route).toContain("summariseCommandUsage(");
    expect(route).toContain("DEEPGRAM_USD_PER_MINUTE");
    expect(route, "only this feature's rows are summed").toContain("invocationPoint: { in: [LIVE_COMMAND_POINT, VOICE_POINT] }");
  });

  it("T4399 — the SuperAdmin tile 'Abracadabra Commands' is advertised, reachable, guarded, and renders the same catalogue", () => {
    const admin = read("app", "(dashboard)", "dashboard", "admin", "AdminClient.tsx");
    const tile = admin.match(/\{ id: "abracadabra-commands",[^\n]*\}/)?.[0] ?? "";
    expect(tile).toContain('href: "/dashboard/admin/abracadabra-commands"');
    // Advertised path must resolve to a real page (a handler can be perfect and unreachable).
    const pagePath = path.resolve(__dirname, "..", "..", "app", "(dashboard)", "dashboard", "admin", "abracadabra-commands", "page.tsx");
    expect(fs.existsSync(pagePath), "the tile's page exists").toBe(true);
    const page = fs.readFileSync(pagePath, "utf8");
    expect(page, "SuperAdmin-only").toContain("if (!(await isActingSuperuser(session))) redirect(\"/dashboard\");");
    const client = read("app", "(dashboard)", "dashboard", "admin", "abracadabra-commands", "AbracadabraCommandsClient.tsx");
    expect(client, "one catalogue for the bar and the tile").toContain("COMMAND_CATALOG.map(");
    expect(client, "says what is editable").toContain("/dashboard/admin/intent-keywords");
  });
});
