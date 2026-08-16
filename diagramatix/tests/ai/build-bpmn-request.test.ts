/**
 * buildBpmnRequest is the single source of truth for the BPMN messages.create
 * body — shared by planBpmn (sends it) and the SuperAdmin "Export Full AI Prompt"
 * endpoint (serialises it). These tests pin what the export captures so it can't
 * silently diverge from what the model actually receives.
 */
import { describe, it, expect } from "vitest";
import { buildBpmnRequest } from "@/app/lib/ai/planBpmn";

const RULES = "R1: tasks must have a verb. R2: one start event.";

describe("buildBpmnRequest — text scenario", () => {
  const req = buildBpmnRequest({
    apiKey: "", prompt: "Order to cash process", rules: RULES, model: "claude-haiku-4-5-20251001",
  });

  it("embeds framework + green rules in the system prompt", () => {
    expect(req.system).toContain("USER RULES AND PREFERENCES");
    expect(req.system).toContain(RULES);
    expect(req.system.length).toBeGreaterThan(RULES.length); // framework present too
  });

  it("puts the user prompt in the final content block", () => {
    const blocks = req.messages[0].content;
    const last = blocks[blocks.length - 1] as { type: string; text: string };
    expect(last.type).toBe("text");
    expect(last.text).toContain("Order to cash process");
    // No image block in the text scenario.
    expect(blocks.some((b) => (b as { type: string }).type === "image")).toBe(false);
  });

  it("keeps the full token budget for a cloud model", () => {
    expect(req.max_tokens).toBe(16000); // haiku → non-opus/sonnet default
  });
});

describe("buildBpmnRequest — image scenario", () => {
  const req = buildBpmnRequest({
    apiKey: "", prompt: "Reproduce this diagram",
    rules: RULES, model: "claude-haiku-4-5-20251001",
    attachment: { type: "image", data: "QUJD", mediaType: "image/png", name: "diagram.png" },
  });

  it("includes the image block (base64 + media type) before the prompt", () => {
    const blocks = req.messages[0].content as Array<{ type: string; source?: { data: string; media_type: string } }>;
    const img = blocks.find((b) => b.type === "image");
    expect(img).toBeTruthy();
    expect(img!.source!.data).toBe("QUJD");
    expect(img!.source!.media_type).toBe("image/png");
    // ends with the user's prompt text.
    expect((blocks[blocks.length - 1] as unknown as { text: string }).text).toContain("Reproduce this diagram");
  });
});

describe("buildBpmnRequest — local model", () => {
  it("caps max_tokens for an ollama-prefixed model", () => {
    const req = buildBpmnRequest({ apiKey: "", prompt: "x", rules: "", model: "ollama/google/gemma-4-e4b" });
    expect(req.max_tokens).toBe(4096); // OLLAMA_MAX_TOKENS default
    expect(req.model).toBe("ollama/google/gemma-4-e4b"); // registry id kept; strip happens at send
  });
});
