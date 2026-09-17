/**
 * SEC-24 — a bring-your-own key's endpoint is the server's next outbound
 * request, so it cannot be taken on trust.
 *
 * `saveUserAiKey` stored `baseUrl` verbatim and `aiClientConfig` handed it to
 * the SDK, so any signed-in user could point it at cloud instance metadata
 * (169.254.169.254) or an internal service and have the SERVER fetch it. The AI
 * error path reflects part of the upstream response back to the caller, which
 * makes it a readable request rather than a blind one.
 *
 * A host allow-list is not available here, unlike the blob-URL guard — the
 * whole point of the field is that the endpoint is the customer's own. So the
 * guard blocks what has no business being an AI provider and requires https.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertSafeAiBaseUrl, isSafeAiBaseUrl, UnsafeAiBaseUrlError } from "@/app/lib/ai/safeBaseUrl";

describe("user AI key endpoint", () => {
  it("T4427 — rejects loopback, private, link-local and metadata addresses, and anything not https", () => {
    const blocked = [
      "http://169.254.169.254/latest/meta-data/",   // the canonical target
      "https://169.254.169.254/",
      "https://metadata.google.internal/",
      "https://localhost/v1",
      "https://LOCALHOST/v1",
      "https://api.localhost/v1",
      "https://127.0.0.1/v1",
      "https://127.9.9.9/v1",
      "https://10.0.0.5/v1",
      "https://172.16.4.4/v1",
      "https://172.31.255.1/v1",
      "https://192.168.1.10/v1",
      "https://100.64.0.1/v1",                      // carrier-grade NAT
      "https://0.0.0.0/v1",
      "https://[::1]/v1",
      "https://[fd00::1]/v1",                        // unique-local
      "https://[fe80::1]/v1",                        // link-local
      "http://api.openai.com/v1",                    // plain http
      "ftp://api.openai.com/v1",
      "https://user:pass@api.openai.com/v1",         // credentials in the URL
      "not a url",
      "",
    ];
    for (const url of blocked) {
      expect(isSafeAiBaseUrl(url), `${url} should be rejected`).toBe(false);
      expect(() => assertSafeAiBaseUrl(url)).toThrow(UnsafeAiBaseUrlError);
    }
  });

  it("T4428 — still allows a customer's own public gateway, which is the point of the field", () => {
    const allowed = [
      "https://api.openai.com/v1",
      "https://openrouter.ai/api/v1",
      "https://gateway.mycompany.com/anthropic",
      "https://llm.example.co.uk:8443/v1",           // a non-default port is fine
      "https://172.15.0.1/v1",                       // just outside the private range
      "https://172.32.0.1/v1",                       // just outside the other end
      "https://11.0.0.1/v1",                         // not 10/8
    ];
    for (const url of allowed) {
      expect(isSafeAiBaseUrl(url), `${url} should be allowed`).toBe(true);
      expect(assertSafeAiBaseUrl(url).protocol).toBe("https:");
    }
  });

  it("T4429 — the guard runs on save AND at the point of use, so an older stored row cannot be honoured", () => {
    const save = readFileSync(join(process.cwd(), "app/lib/ai/userAiKey.ts"), "utf8");
    expect(save, "validate the endpoint before storing it").toMatch(/assertSafeAiBaseUrl\(/);
    expect(save, "a rejected endpoint should answer the caller, not throw past them").toMatch(/UnsafeAiBaseUrlError/);

    const use = readFileSync(join(process.cwd(), "app/lib/ai/anthropicClient.ts"), "utf8");
    expect(use, "re-check at the point of use — rows predate the save-time guard").toMatch(/isSafeAiBaseUrl\(/);
    // The endpoint must be dropped rather than passed through when it fails.
    expect(use).toMatch(/baseURL:\s*safeBase\s*\|\|/);
  });
});
