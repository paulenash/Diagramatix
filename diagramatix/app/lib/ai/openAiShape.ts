/**
 * An Anthropic-Messages-shaped façade over an **OpenAI Chat Completions**
 * endpoint.
 *
 * Every one of the ~21 AI call sites in this codebase speaks the Anthropic SDK:
 * `client.messages.create({ model, max_tokens, system, messages })`, reading
 * `.content[]` and `.usage` off the reply. That is a good seam and there is no
 * reason to widen it — so a provider that only speaks OpenAI gets an object
 * that quacks the same way, and not one call site changes.
 *
 * **Why this is worth having at all.** Until now, a provider that was not
 * Anthropic-Messages-native could only be reached through a gateway somebody
 * had to run (that is what `GOOGLE_BASE_URL` and `MICROSOFT_BASE_URL` are). That
 * is a reasonable answer for a self-hosted tenant and a poor one for "I have an
 * OpenRouter key". This makes every OpenAI-compatible endpoint — OpenRouter,
 * OpenAI direct, Groq, Together, Fireworks, Mistral — reachable with a key and
 * a URL.
 *
 * **What it does not do**, said plainly rather than discovered later:
 *   - PDF (`document`) blocks have no Chat Completions equivalent. They are
 *     dropped and REPORTED, because a PDF that silently vanished would look
 *     like the model ignoring its attachment.
 *   - Streaming is not implemented; nothing here streams.
 */
import type Anthropic from "@anthropic-ai/sdk";

/** The subset of the Anthropic client the call sites actually use. */
export interface MessagesClientLike {
  messages: {
    create(params: Anthropic.Messages.MessageCreateParams): Promise<Anthropic.Messages.Message>;
  };
}

interface OpenAiChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
}

/** Anthropic content blocks → OpenAI content, keeping images as data URLs. */
function toOpenAiContent(
  content: Anthropic.Messages.MessageCreateParams["messages"][number]["content"],
  dropped: string[],
): OpenAiChatMessage["content"] {
  if (typeof content === "string") return content;

  const parts: Exclude<OpenAiChatMessage["content"], string> = [];
  for (const block of content) {
    const b = block as unknown as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      parts.push({ type: "text", text: b.text });
      continue;
    }
    if (b.type === "image") {
      const src = b.source as Record<string, unknown> | undefined;
      if (src?.type === "base64" && typeof src.data === "string" && typeof src.media_type === "string") {
        parts.push({ type: "image_url", image_url: { url: `data:${src.media_type};base64,${src.data}` } });
        continue;
      }
      if (src?.type === "url" && typeof src.url === "string") {
        parts.push({ type: "image_url", image_url: { url: src.url } });
        continue;
      }
    }
    // A PDF, or something new. Chat Completions has no equivalent, and a
    // silently-dropped attachment looks exactly like a model ignoring it.
    dropped.push(String(b.type ?? "unknown"));
  }
  // An all-image message with no text confuses some endpoints; a single text
  // part is the safe shape when nothing survived.
  return parts.length ? parts : "";
}

/**
 * Build a client that speaks Anthropic Messages on the outside and OpenAI Chat
 * Completions on the wire.
 *
 * `baseURL` is the root (e.g. `https://openrouter.ai/api/v1`); `/chat/completions`
 * is appended, which is where every OpenAI-compatible endpoint puts it.
 */
export function makeOpenAiShapeClient(opts: {
  apiKey: string;
  baseURL: string;
  /** Sent as OpenRouter's attribution headers when provided; harmless elsewhere. */
  referer?: string;
  title?: string;
  fetchImpl?: typeof fetch;
}): MessagesClientLike {
  const root = opts.baseURL.replace(/\/+$/, "");
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    messages: {
      async create(params) {
        const dropped: string[] = [];
        const messages: OpenAiChatMessage[] = [];

        // Anthropic carries the system prompt beside the messages; OpenAI wants
        // it as the first message.
        if (typeof params.system === "string" && params.system.trim()) {
          messages.push({ role: "system", content: params.system });
        } else if (Array.isArray(params.system)) {
          const text = params.system.map((b) => ("text" in b ? b.text : "")).join("\n").trim();
          if (text) messages.push({ role: "system", content: text });
        }

        for (const m of params.messages) {
          messages.push({
            role: m.role === "assistant" ? "assistant" : "user",
            content: toOpenAiContent(m.content, dropped),
          });
        }

        if (dropped.length) {
          // Loud, not silent. The caller cannot see this conversion happening.
          console.warn(
            `[openAiShape] ${dropped.length} attachment block(s) had no Chat Completions equivalent and were dropped: ${[...new Set(dropped)].join(", ")}`,
          );
        }

        const res = await doFetch(`${root}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
            ...(opts.referer ? { "HTTP-Referer": opts.referer } : {}),
            ...(opts.title ? { "X-Title": opts.title } : {}),
          },
          body: JSON.stringify({
            model: params.model,
            max_tokens: params.max_tokens,
            ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
            messages,
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // Carry the provider's own words through. A generic "AI call failed"
          // is what makes a bad key indistinguishable from a bad model id.
          throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 500)}` : ""}`);
        }

        const json = await res.json() as {
          id?: string;
          model?: string;
          choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        const text = json.choices?.[0]?.message?.content ?? "";
        const stop = json.choices?.[0]?.finish_reason;

        // Back into the Anthropic shape the call sites read. `usage` matters
        // beyond tidiness: the telemetry seam bills from these two numbers, so
        // getting them wrong makes every cost figure for this provider wrong.
        return {
          id: json.id ?? "openai-shape",
          type: "message",
          role: "assistant",
          model: json.model ?? String(params.model),
          content: [{ type: "text", text, citations: null }],
          stop_reason: stop === "length" ? "max_tokens" : "end_turn",
          stop_sequence: null,
          usage: {
            input_tokens: json.usage?.prompt_tokens ?? 0,
            output_tokens: json.usage?.completion_tokens ?? 0,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            server_tool_use: null,
            service_tier: null,
          },
        } as unknown as Anthropic.Messages.Message;
      },
    },
  };
}
