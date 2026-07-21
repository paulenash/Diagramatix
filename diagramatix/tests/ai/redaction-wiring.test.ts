/**
 * ENT-06 wiring — proves the redactor is applied END TO END in an AI lib:
 * the prompt that reaches the (mocked) Anthropic client carries ONLY tokens
 * (no real names), and the caller gets the real names restored in the reply.
 * Guards against a future edit that redacts but forgets to restore, or sends
 * the raw prompt.
 */
import { describe, it, expect, vi } from "vitest";

// Capture what the client is asked to send, and echo the tokens back so we can
// verify restore. The narrative "quotes" the user content the model received.
const sent: string[] = [];
const fakeClient = {
  messages: {
    create: async ({ messages }: { messages: { content: string }[] }) => {
      const content = messages[0].content;
      sent.push(content);
      // Pretend the model wrote a narrative that reuses the tokens it saw.
      return { content: [{ type: "text", text: `The narrative mentions ${content}` }] };
    },
  },
};
vi.mock("@/app/lib/ai/anthropicClient", () => ({
  makeAiClient: () => fakeClient,
  makeAnthropic: () => fakeClient,
}));
vi.mock("@/app/lib/ai/aiModelSetting", () => ({ getAiGenerateModel: async () => "test-model" }));

import { generateStaffNarrative } from "@/app/lib/ai/staffNarrative";
import { makeRedactor } from "@/app/lib/ai/redaction";

describe("ENT-06 redaction wiring — staff narrative", () => {
  it("T0945 — sends tokens only, restores real names in the result", async () => {
    const redactor = makeRedactor(["Sara in Compliance", "Membership CRM"]);
    const res = await generateStaffNarrative(
      { apiKey: "k", technicalDescription: "Sara in Compliance updates the Membership CRM.", briefing: "b" },
      redactor,
    );

    // What crossed the wire had NO real names.
    expect(sent[0]).not.toMatch(/Sara|Compliance|Membership CRM/);
    expect(sent[0]).toContain("Entity_1");
    expect(sent[0]).toContain("Entity_2");

    // What the caller received had the real names back.
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.narrative).toContain("Sara in Compliance");
      expect(res.narrative).toContain("Membership CRM");
      expect(res.narrative).not.toMatch(/Entity_\d/);
    }
  });

  it("T0946 — with no redactor, the raw description is sent unchanged", async () => {
    sent.length = 0;
    const res = await generateStaffNarrative(
      { apiKey: "k", technicalDescription: "Bob approves it.", briefing: "b" },
    );
    expect(sent[0]).toBe("Bob approves it.");
    expect(res.ok).toBe(true);
  });
});
