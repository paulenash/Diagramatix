import { describe, it, expect, vi, beforeEach } from "vitest";
import { looksTruncated } from "@/app/lib/valueChain/checkPromptTruncated";

/**
 * A prompt that stops mid-sentence must not be saved.
 *
 * Paul, 2026-09-04, regenerating V22 on Opus 5. V22.07 came back at 1,878
 * characters where its siblings ran 6,000-8,000, ending on
 *
 *     - branch "
 *
 * It was saved, PUBLISHED, and used to generate a diagram — which was then
 * missing its whole decline path and looked like a model failure. Six of that
 * chain's ten prompts were truncated the same way, and `AiInvocation.truncated`
 * had recorded the max_tokens stop for 7 of the run's 35 calls. Nothing acted on
 * it, and no check could see it: `checkPromptBranches` looks for a MALFORMED
 * branch, and `- branch "` is not malformed, it is absent.
 *
 * Paul: "No silent truncations!!"
 *
 * The signals below were validated against all 277 stored BPMN prompts before
 * being trusted — together they flag exactly the 6 known-bad and none of the
 * 271 others. That is why both exist: neither alone is sufficient.
 */
describe("looksTruncated", () => {
  const COMPLETE = [
    'BPMN: V22.07 Approve or Decline — the decision point of the claim.',
    "",
    "4. Lane contents in flow order (Insurer)",
    "Claims Assessment lane:",
    'Message start event "Assessment outcome received from Assess Loss"',
    'User task "Review cover terms"',
    'Exclusive gateway "Claim approved?"',
    '  - branch "approved": End event "Claim approved — ready for Settle"',
    '  - branch "otherwise — declined": End event "Claim declined"',
  ].join("\n");

  it("T3203 accepts a complete prompt", () => {
    expect(looksTruncated(COMPLETE)).toBeNull();
  });

  it("T3204 reports a name opened and never closed", () => {
    // The V22.07 shape exactly.
    expect(looksTruncated(COMPLETE + '\n  - branch "')).toMatch(/unbalanced quotes/);
  });

  it("T3205 reports an unclosed final line even when the totals balance", () => {
    // V22.10: quotes balanced across the document, but the last instruction
    // breaks off inside a name. The total count cannot see this.
    const out = looksTruncated(COMPLETE + '\n- Data Object "Claim File" — read by "');
    expect(out).toMatch(/unclosed name|unbalanced/);
  });

  it("T3206 reports a last line that ends mid-sentence", () => {
    expect(looksTruncated(COMPLETE + "\n- The claim is then passed to the")).toMatch(/mid-sentence/);
    // And does not fire on an ordinary finished line.
    expect(looksTruncated(COMPLETE + "\n- This subprocess hands a decided claim to Settle Claim.")).toBeNull();
  });

  it("T3207 says nothing about an empty prompt — that is a different fault", () => {
    expect(looksTruncated("")).toBeNull();
    expect(looksTruncated("   ")).toBeNull();
  });
});

/**
 * The real fix is upstream: refuse the response while the stop reason is still
 * known, so the partial text never reaches the database at all.
 *
 * Partial-mocked on purpose. A whole-module mock of an AI seam has already
 * broken an unrelated suite here once, when a new export appeared in the module
 * being replaced.
 */
vi.mock("@/app/lib/ai/anthropicClient", async (importActual) => ({
  ...(await importActual<typeof import("@/app/lib/ai/anthropicClient")>()),
  makeAiClient: vi.fn(),
}));

describe("generateMdPrompt refuses an unfinished response", () => {
  let makeAiClient: ReturnType<typeof vi.fn>;
  let generateMdPrompt: typeof import("@/app/lib/valueChain/generatePrompt").generateMdPrompt;

  beforeEach(async () => {
    ({ makeAiClient } = await import("@/app/lib/ai/anthropicClient") as never);
    ({ generateMdPrompt } = await import("@/app/lib/valueChain/generatePrompt"));
  });

  const call = (text: string, stop_reason: string) => {
    makeAiClient.mockReturnValue({
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text }], stop_reason }) },
    });
    return generateMdPrompt({
      apiKey: "k", model: "claude-opus-5", briefing: "b",
      chainCode: "V22", chainTitle: "Claim to Settlement",
      narrative: "A claim is assessed and then approved or declined.",
      subs: [{ code: "V22.07", title: "Approve or Decline" }],
      target: { type: "bpmn", code: "V22.07", title: "Approve or Decline" },
    } as never);
  };

  const BODY = [
    "BPMN: V22.07 Approve or Decline — the decision point.",
    "",
    "4. Lane contents in flow order (Insurer)",
    'User task "Review cover terms"',
  ].join("\n");

  it("T3208 refuses a max_tokens stop and does not return the partial text", async () => {
    const r = await call(BODY, "max_tokens");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/ran out of room|NOT saved/i);
  });

  it("T3209 refuses text that LOOKS cut even when the stop reason is clean", async () => {
    // Truncation also arrives with no stop reason to consult -- a dropped
    // stream, a proxy trimming a response.
    const r = await call(BODY + '\n  - branch "', "end_turn");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/unfinished|NOT saved/i);
  });

  it("T3210 accepts a complete response", async () => {
    const r = await call(BODY + '\nEnd event "Claim decided — ready for Settle Claim"', "end_turn");
    expect(r.ok).toBe(true);
  });
});
