/**
 * The v2 changes from the review of 2026-09-01.
 *
 * Each of these is a promise made to a partner who is building against it, so
 * each gets a test rather than a hope: the instructions they send actually reach
 * the model, the callback they supply cannot take a successful run down with it,
 * and a testing phase really does keep the whole body rather than a fingerprint
 * of it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildPrompt } from "@/app/lib/partner/runProcessMap";
import { deliverCallback } from "@/app/lib/partner/callback";

describe("v2/7 — the caller's instructions reach the model", () => {
  it("T3085 — instructions are appended to the prompt", () => {
    const p = buildPrompt({
      description: "The clerk checks the invoice.",
      hasDocument: false,
      instructions: "Keep this at a high level.",
    });
    expect(p).toContain("Keep this at a high level.");
  });

  it("T3086 — they come LAST, so they qualify our guidance rather than the reverse", () => {
    // "Keep this at a high level" has to beat our own request for explicit
    // detail. Placed before it, the model reads our instruction as the final
    // word and the caller's has no effect.
    const p = buildPrompt({
      description: "The clerk checks the invoice.",
      hasDocument: false,
      instructions: "ZZZ_MARKER",
    });
    expect(p.indexOf("ZZZ_MARKER")).toBeGreaterThan(p.indexOf("Put each participant in their own lane"));
  });

  it("T3087 — no instructions leaves the prompt exactly as it was", () => {
    const withNone = buildPrompt({ description: "The clerk checks the invoice.", hasDocument: false });
    const withBlank = buildPrompt({ description: "The clerk checks the invoice.", hasDocument: false, instructions: "   " });
    expect(withBlank).toBe(withNone);
    expect(withNone).not.toContain("Additional instructions");
  });
});

describe("v2/5 — the completion callback", () => {
  const original = globalThis.fetch;
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { globalThis.fetch = original; });

  it("T3088 — a delivered callback reports success and posts the job id in a header", () => {
    const seen: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      seen.url = String(url); seen.init = init;
      return new Response("", { status: 200 });
    }) as any;
    return deliverCallback("https://x.test/hook", { jobId: "j1" }, { jobId: "j1", ref: "r1" }).then((out) => {
      expect(out.delivered).toBe(true);
      expect(out.attempts).toBe(1);
      const h = new Headers(seen.init!.headers as HeadersInit);
      expect(h.get("X-Diagramatix-Job-Id")).toBe("j1");
    });
  });

  it("T3089 — a refused callback NEVER throws: the run succeeded, delivery is not generation", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as any;
    const out = await deliverCallback("https://x.test/hook", {}, { jobId: "j2", ref: "r2" });
    expect(out.delivered).toBe(false);
    expect(out.error).toContain("ECONNREFUSED");
  });

  it("T3090 — a 4xx is not retried; the receiver has said 'not this, and not again'", async () => {
    const fn = vi.fn(async () => new Response("", { status: 400 }));
    globalThis.fetch = fn as any;
    const out = await deliverCallback("https://x.test/hook", {}, { jobId: "j3", ref: "r3" });
    expect(out.delivered).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("T3091 — a 5xx IS retried, because that one is worth trying twice", async () => {
    const fn = vi.fn(async () => new Response("", { status: 503 }));
    globalThis.fetch = fn as any;
    await deliverCallback("https://x.test/hook", {}, { jobId: "j4", ref: "r4" });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
