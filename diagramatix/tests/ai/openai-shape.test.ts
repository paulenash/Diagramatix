/**
 * The OpenAI-shaped façade, and OpenRouter on top of it.
 *
 * This is the only adapter in the codebase that CONVERTS a request rather than
 * routing it, so it is the only place a provider can be wired up and still be
 * quietly wrong — the call succeeds, the diagram comes back, and the system
 * prompt was never sent.
 *
 * The conversions worth testing are the ones with no symptom when they fail:
 *   - the SYSTEM prompt (Anthropic carries it beside the messages; OpenAI wants
 *     it as the first message — drop it and generation just gets worse);
 *   - IMAGES (a different block shape entirely — drop them and image-to-diagram
 *     silently becomes text-to-diagram);
 *   - USAGE (the telemetry seam bills from these two numbers, so mapping them
 *     wrongly makes every cost figure for this provider wrong).
 */
import { describe, it, expect, vi } from "vitest";
import { makeOpenAiShapeClient } from "@/app/lib/ai/openAiShape";
import { providerOf } from "@/app/lib/ai/aiRates";

/** A fetch that records what it was sent and replies like Chat Completions. */
function recordingFetch(reply?: Record<string, unknown>) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const impl = vi.fn(async (url: unknown, init?: unknown) => {
    const i = init as { body: string; headers: Record<string, string> };
    calls.push({ url: String(url), body: JSON.parse(i.body), headers: i.headers });
    return {
      ok: true,
      json: async () => reply ?? {
        id: "gen-1", model: "openai/gpt-5.2",
        choices: [{ message: { content: "hello" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 11, completion_tokens: 22 },
      },
    } as unknown as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const client = (f: typeof fetch) =>
  makeOpenAiShapeClient({ apiKey: "sk-test", baseURL: "https://openrouter.ai/api/v1/", fetchImpl: f });

describe("the request is converted, not merely forwarded", () => {
  it("T4197 - the system prompt becomes the FIRST message", () => {
    // Anthropic carries it beside the messages. Lose it and nothing errors —
    // generation simply gets worse, everywhere, with no symptom to chase.
    const { impl, calls } = recordingFetch();
    return client(impl).messages.create({
      model: "openai/gpt-5.2", max_tokens: 100,
      system: "You are a BPMN expert.",
      messages: [{ role: "user", content: "Draw an order process" }],
    }).then(() => {
      const msgs = calls[0].body.messages as { role: string; content: unknown }[];
      expect(msgs[0]).toEqual({ role: "system", content: "You are a BPMN expert." });
      expect(msgs[1].role).toBe("user");
    });
  });

  it("T4198 - it posts to /chat/completions with Bearer auth, and no double slash", () => {
    const { impl, calls } = recordingFetch();
    return client(impl).messages.create({
      model: "m", max_tokens: 10, messages: [{ role: "user", content: "hi" }],
    }).then(() => {
      expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(calls[0].headers.Authorization).toBe("Bearer sk-test");
    });
  });

  it("T4199 - an image becomes a data URL, not a dropped block", () => {
    // Image-to-diagram is a shipped feature. Converting the block wrongly turns
    // it into text-to-diagram with no error anywhere.
    const { impl, calls } = recordingFetch();
    return client(impl).messages.create({
      model: "m", max_tokens: 10,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
          { type: "text", text: "Rebuild this" },
        ],
      }],
    }).then(() => {
      const msgs = calls[0].body.messages as { content: { type: string; image_url?: { url: string } }[] }[];
      const img = msgs[0].content.find((c) => c.type === "image_url");
      expect(img?.image_url?.url).toBe("data:image/png;base64,AAAA");
      expect(msgs[0].content.some((c) => c.type === "text")).toBe(true);
    });
  });

  it("T4200 - a PDF is dropped LOUDLY, because it has no equivalent", () => {
    // Chat Completions has nowhere to put one. A silent drop looks exactly like
    // a model ignoring the attachment somebody just uploaded.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { impl } = recordingFetch();
    return client(impl).messages.create({
      model: "m", max_tokens: 10,
      messages: [{
        role: "user",
        content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBER" } } as never],
      }],
    }).then(() => {
      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0][0])).toMatch(/dropped/i);
      warn.mockRestore();
    });
  });
});

describe("the response is converted back", () => {
  it("T4201 - it comes back in the Anthropic shape the call sites read", () => {
    const { impl } = recordingFetch();
    return client(impl).messages.create({
      model: "m", max_tokens: 10, messages: [{ role: "user", content: "hi" }],
    }).then((res) => {
      // Every call site does `content.find(b => b.type === "text")`.
      const block = res.content.find((b) => b.type === "text");
      expect(block && "text" in block ? block.text : null).toBe("hello");
      expect(res.role).toBe("assistant");
    });
  });

  it("T4202 - usage maps to input/output tokens, or every cost figure is wrong", () => {
    const { impl } = recordingFetch();
    return client(impl).messages.create({
      model: "m", max_tokens: 10, messages: [{ role: "user", content: "hi" }],
    }).then((res) => {
      expect(res.usage.input_tokens).toBe(11);
      expect(res.usage.output_tokens).toBe(22);
    });
  });

  it("T4203 - a truncated reply says so, rather than looking complete", () => {
    // finish_reason "length" is a cut-off answer. Reporting it as a clean end
    // is how a half-written plan gets treated as a whole one.
    const { impl } = recordingFetch({
      choices: [{ message: { content: "{\"elements\":[" }, finish_reason: "length" }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
    return client(impl).messages.create({
      model: "m", max_tokens: 10, messages: [{ role: "user", content: "hi" }],
    }).then((res) => expect(res.stop_reason).toBe("max_tokens"));
  });

  it("T4204 - a provider error carries the provider's own words", () => {
    // A generic "AI call failed" makes a bad key indistinguishable from a bad
    // model id, and those need completely different fixes.
    const impl = (async () => ({
      ok: false, status: 401, statusText: "Unauthorized",
      text: async () => '{"error":{"message":"No auth credentials found"}}',
    })) as unknown as typeof fetch;
    return expect(
      client(impl).messages.create({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/401.*No auth credentials found/);
  });
});

describe("OpenRouter is billed as OpenRouter", () => {
  it("T4205 - a namespaced id is not billed at its vendor's own rates", () => {
    // "anthropic/claude-sonnet-4.6" through OpenRouter is NOT an Anthropic
    // call, and pricing it as one would quietly report the wrong cost for every
    // generation — the check has to come before the vendor-prefix rules.
    expect(providerOf("anthropic/claude-sonnet-4.6")).toBe("openrouter");
    expect(providerOf("openai/gpt-5.2")).toBe("openrouter");
    // …while a direct Anthropic id keeps its own provider.
    expect(providerOf("claude-opus-5")).toBe("anthropic");
    // …and a local Ollama id is not OpenRouter despite carrying a slash.
    expect(providerOf("ollama/llama3.1")).toBe("ollama");
  });
});
