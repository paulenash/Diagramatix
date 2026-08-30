/**
 * The URL a caller uses to reach us, versus the one we use to reach ourselves.
 *
 * Conflating these produced two real failures on the same day:
 *  - the harness proxy fetched `https://0.0.0.0:3000` and spoke TLS at a plain
 *    HTTP listener, failing with an SSL record error that said nothing about the
 *    actual mistake;
 *  - and a deep link built the same way would have read
 *    `https://0.0.0.0:3000/diagram/…` — useless to the partner it is handed to.
 *
 * In a standalone build `new URL(req.url)` is rebuilt from the listener, so its
 * host is the BIND address and its scheme is whatever a proxy declared. The
 * forwarded headers are what the reverse proxy actually knows.
 */
import { describe, it, expect, afterEach } from "vitest";
import { publicBaseUrl } from "@/app/lib/partner/publicUrl";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });
const savedEnv = process.env.APP_BASE_URL;
afterEach(() => {
  if (savedEnv === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = savedEnv;
});

describe("publicBaseUrl", () => {
  it("T3018 — the forwarded host beats the bind address", () => {
    // The exact shape that produced https://0.0.0.0:3000.
    const r = req("https://0.0.0.0:3000/api/public/v1/process-map", {
      "x-forwarded-host": "app.diagramatix.com.au",
      "x-forwarded-proto": "https",
    });
    expect(publicBaseUrl(r)).toBe("https://app.diagramatix.com.au");
  });

  it("T3019 — a forwarded chain uses the CLIENT's protocol, the first in the list", () => {
    const r = req("http://0.0.0.0:3000/x", {
      "x-forwarded-host": "app.diagramatix.com.au",
      "x-forwarded-proto": "https, http",
    });
    expect(publicBaseUrl(r)).toBe("https://app.diagramatix.com.au");
  });

  it("T3020 — APP_BASE_URL overrides everything, trailing slash and all", () => {
    // The same variable the cron routes already use for this exact problem.
    process.env.APP_BASE_URL = "https://example.test/";
    const r = req("https://0.0.0.0:3000/x", { "x-forwarded-host": "wrong.test" });
    expect(publicBaseUrl(r)).toBe("https://example.test");
  });

  it("T3021 — in dev it is just the host header", () => {
    delete process.env.APP_BASE_URL;
    const r = req("http://localhost:3000/api/public/v1", { host: "localhost:3000" });
    expect(publicBaseUrl(r)).toBe("http://localhost:3000");
  });

  it("T3022 — with no headers at all it falls back to the request's own origin", () => {
    delete process.env.APP_BASE_URL;
    expect(publicBaseUrl(req("http://127.0.0.1:3000/x"))).toBe("http://127.0.0.1:3000");
  });
});
