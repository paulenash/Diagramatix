/**
 * MINE-01 — SSRF guard on a mining source's blob URL. The URL is editor-supplied
 * and fetched server-side, so it must be restricted to Azure Blob Storage
 * endpoints; anything else (cloud metadata, internal hosts, non-https) is refused.
 */
import { describe, it, expect } from "vitest";
import { assertSafeBlobUrl, validateBlobUrl, UnsafeBlobUrlError } from "@/app/lib/mining/blobUrl";

describe("assertSafeBlobUrl — accepts genuine Azure Blob URLs", () => {
  it("accepts a public-cloud container SAS URL", () => {
    const u = assertSafeBlobUrl("https://acct.blob.core.windows.net/logs?sv=2022&sig=abc");
    expect(u.hostname).toBe("acct.blob.core.windows.net");
  });

  it("accepts the sovereign-cloud endpoints", () => {
    expect(() => assertSafeBlobUrl("https://a.blob.core.chinacloudapi.cn/c")).not.toThrow();
    expect(() => assertSafeBlobUrl("https://a.blob.core.usgovcloudapi.net/c")).not.toThrow();
  });
});

describe("assertSafeBlobUrl — refuses the SSRF vectors", () => {
  const bad: Array<[string, string]> = [
    ["cloud metadata IP", "http://169.254.169.254/latest/meta-data/"],
    ["metadata over https", "https://169.254.169.254/"],
    ["localhost", "https://localhost/x"],
    ["loopback IP", "https://127.0.0.1/x"],
    ["internal hostname", "https://internal-service.corp/x"],
    ["private IP", "https://10.0.0.5/x"],
    ["non-https azure", "http://acct.blob.core.windows.net/c"],
    ["azure-lookalike suffix trick", "https://acct.blob.core.windows.net.evil.com/c"],
    ["bracketed IPv6", "https://[::1]/x"],
    ["empty", ""],
    ["not a url", "not a url"],
  ];
  for (const [label, url] of bad) {
    it(`rejects ${label}`, () => {
      expect(() => assertSafeBlobUrl(url), url).toThrow(UnsafeBlobUrlError);
    });
  }

  it("the lookalike host is not treated as Azure (suffix must be a real boundary)", () => {
    // endsWith(".blob.core.windows.net") would be true for the evil host without
    // care — assert it's rejected so the suffix check can't be defeated.
    expect(validateBlobUrl("https://x.blob.core.windows.net.attacker.test/c")).toBeTruthy();
  });
});

describe("validateBlobUrl — non-throwing form", () => {
  it("returns null for a valid URL and a message for an invalid one", () => {
    expect(validateBlobUrl("https://a.blob.core.windows.net/c")).toBeNull();
    expect(validateBlobUrl("http://169.254.169.254/")).toMatch(/Azure Blob|https/);
  });
});
