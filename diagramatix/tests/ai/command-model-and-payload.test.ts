/**
 * T4562-T4564 — what the Voice Assist fallback costs.
 *
 * Plan item C5 + R4. When the deterministic grammar does not recognise a
 * command it falls through to the AI to be rewritten into a canonical command.
 * That path used to send the WHOLE diagram, on the global generation model
 * (Opus 5), with no timeout — defensible while the feature was SuperAdmin-only
 * and the only person spending was Paul, but it went Expert-and-above on
 * 2026-09-17.
 *
 * Paul, 2026-09-20: "Go ahead with your Haiku recommendation and the
 * abort/timeout, and an admin picker for the setting."
 *
 * Haiku is safe HERE and not for generation — where Paul's own 2026-09-04
 * measurement found it returning about a third of the content — because this is
 * not generation. The model picks from a listed vocabulary against a listed
 * diagram, and the grammar re-parses whatever comes back before anything
 * touches the canvas. A poor rewrite fails to parse; it cannot corrupt.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  serializeDiagramForCommand, COMMAND_SERIALISE_MAX,
} from "@/app/lib/assist/serializeDiagram";
import { DEFAULT_AI_COMMAND_MODEL } from "@/app/lib/ai/aiModelSetting";
import { isKnownAiModel } from "@/app/lib/ai/models";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const el = (id: string, label = id): DiagramElement =>
  ({ id, type: "task", label, x: 0, y: 0, width: 100, height: 60, properties: {} }) as unknown as DiagramElement;
const diagram = (n: number, connectors: unknown[] = []): DiagramData =>
  ({ elements: Array.from({ length: n }, (_, i) => el(`e${i}`)), connectors }) as unknown as DiagramData;

describe("T4562 — the payload is capped", () => {
  it("sends a small diagram whole, and says nothing about omissions", () => {
    const out = serializeDiagramForCommand(diagram(5));
    expect(out).toContain("e0");
    expect(out).toContain("e4");
    expect(out, "no note when nothing was left out").not.toContain("larger diagram");
  });

  it("stops at the cap on a big one and says how much is missing", () => {
    const out = serializeDiagramForCommand(diagram(400));
    const listed = (out.match(/^e\d+ \[/gm) ?? []).length;
    expect(listed).toBe(COMMAND_SERIALISE_MAX);
    expect(out, "the model must know the picture is partial").toContain("larger diagram");
    expect(out).toContain(`${400 - COMMAND_SERIALISE_MAX} more element`);
  });

  it("NEVER drops a selected element, however far down the diagram it is", () => {
    // These are the referents for "the selected task" / "these", so cutting one
    // would break the very command being interpreted.
    const out = serializeDiagramForCommand(diagram(400), ["e399", "e350"]);
    expect(out).toContain("e399");
    expect(out).toContain("e350");
    expect(out).toContain("[selected]");
    expect((out.match(/^e\d+ \[/gm) ?? []).length).toBe(COMMAND_SERIALISE_MAX);
  });

  it("does not list an element twice when it is both selected and in range", () => {
    const out = serializeDiagramForCommand(diagram(10), ["e0"]);
    expect((out.match(/^e0 \[/gm) ?? []).length).toBe(1);
  });

  it("drops a connector whose other end was cut", () => {
    // A connector pointing at an id the model cannot see invites an op against
    // an element that is not in the list — worse than leaving it out.
    const conns = [
      { id: "c1", sourceId: "e0", targetId: "e1", type: "sequence" },
      { id: "c2", sourceId: "e0", targetId: "e399", type: "sequence" },
    ];
    const out = serializeDiagramForCommand(diagram(400, conns), [], 10);
    expect(out).toContain("e0 -> e1");
    expect(out, "e399 was cut, so its connector goes too").not.toContain("e0 -> e399");
    expect(out).toContain("1 more connector");
  });

  it("is honest about an empty diagram", () => {
    const out = serializeDiagramForCommand(diagram(0));
    expect(out).toContain("(none)");
    expect(out).not.toContain("larger diagram");
  });

  it("is wired into the route", () => {
    expect(read("app", "api", "ai", "command", "route.ts"))
      .toContain("serializeDiagramForCommand(state, selectedIds)");
  });
});

describe("T4563 — the command model is small, and overridable", () => {
  it("defaults to Haiku", () => {
    expect(DEFAULT_AI_COMMAND_MODEL).toBe("claude-haiku-4-5-20251001");
    expect(isKnownAiModel(DEFAULT_AI_COMMAND_MODEL), "and it is a model this app knows").toBe(true);
  });

  it("is what the route asks for — not the generation model", () => {
    const route = read("app", "api", "ai", "command", "route.ts");
    expect(route).toContain("getAiCommandModel()");
    expect(route, "the generation default must not leak back in").not.toContain("getAiGenerateModel");
  });

  it("falls back when the default is unreachable on this deployment", () => {
    // A Haiku default is no use on an install with no Anthropic key, and a
    // command that cannot run is worse than a dearer one that can.
    const src = read("app", "lib", "ai", "aiModelSetting.ts");
    expect(src).toContain("isKnownAiModel(id) && !!aiApiKey(id)");
    expect(src).toContain("return getAiGenerateModel();");
  });

  it("treats a blank override as 'use the default', not as a model", () => {
    const src = read("app", "lib", "ai", "aiModelSetting.ts");
    expect(src).toContain("if (!trimmed) {");
    expect(src).toContain("deleteMany({ where: { key: AI_COMMAND_MODEL_KEY } })");
  });

  it("is offered in the admin picker, defaulting label and all", () => {
    const client = read("app", "(dashboard)", "dashboard", "admin", "ai-model", "AiModelClient.tsx");
    expect(client).toContain("Voice Assist command model");
    expect(client).toContain("commandModel");
    expect(client, "a blank option that names the default").toContain("commandModelDefault");
    const api = read("app", "api", "admin", "ai-model", "route.ts");
    expect(api).toContain("setAiCommandModel(body.commandModel)");
    expect(api).toContain("commandModelInUse");
  });

  it("marks the picker dirty so a choice cannot be left unsaved", () => {
    // Paul, 2026-09-06: "Not on Kimi K3 forgot to Save!!!"
    const client = read("app", "(dashboard)", "dashboard", "admin", "ai-model", "AiModelClient.tsx");
    expect(client).toContain("commandModel !== savedCommand");
  });
});

describe("T4564 — the fallback gives up rather than hanging", () => {
  const route = read("app", "api", "ai", "command", "route.ts");

  it("aborts after a bounded wait", () => {
    expect(route).toContain("new AbortController()");
    expect(route).toContain("setTimeout(() => ac.abort(), COMMAND_TIMEOUT_MS)");
    expect(route).toContain("{ signal: ac.signal }");
  });

  it("waits long enough for a one-sentence rewrite", () => {
    const m = route.match(/COMMAND_TIMEOUT_MS = ([\d_]+)/);
    expect(m).not.toBeNull();
    const ms = Number(m![1].replace(/_/g, ""));
    expect(ms).toBeGreaterThanOrEqual(10_000);
    expect(ms).toBeLessThanOrEqual(60_000);
  });

  it("clears the timer whichever way the call ends", () => {
    // Otherwise a fast call leaves a pending abort behind for 20 seconds.
    expect(route).toContain("finally {");
    expect(route).toContain("clearTimeout(timeout)");
  });

  it("tells the user it timed out rather than showing a stack message", () => {
    expect(route).toContain("ac.signal.aborted");
    expect(route).toContain("took longer than");
  });
});
