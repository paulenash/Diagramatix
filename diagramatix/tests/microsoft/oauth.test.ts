/**
 * Pure OAuth helpers for the standalone "Connect SharePoint" flow
 * (app/lib/microsoft/oauth.ts) — PKCE, authorize URL, id_token decode, and the
 * same-origin returnTo guard.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { buildAuthorizeUrl, decodeIdToken, pkcePair, sanitizeReturnTo, MS_ORGANIZATIONS } from "@/app/lib/microsoft/oauth";

const b64url = (b: Buffer) => b.toString("base64url");

describe("microsoft oauth helpers", () => {
  it("T2254 — pkcePair produces a verifier whose S256 challenge matches", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThan(20);
    expect(challenge).toBe(b64url(createHash("sha256").update(verifier).digest()));
  });

  it("T2255 — authorize URL targets the multi-tenant authority with PKCE + select_account", () => {
    const url = new URL(buildAuthorizeUrl({ clientId: "cid", redirectUri: "https://app/api/microsoft/callback", state: "st", challenge: "ch" }));
    expect(`${url.origin}${url.pathname}`).toBe(`${MS_ORGANIZATIONS}/oauth2/v2.0/authorize`);
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("code_challenge")).toBe("ch");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("scope")).toContain("Files.ReadWrite.All");
    expect(url.searchParams.get("scope")).toContain("offline_access");
  });

  it("T2256 — decodeIdToken pulls tid + UPN + name from the payload", () => {
    const payload = b64url(Buffer.from(JSON.stringify({ tid: "tenant-123", preferred_username: "user@acme.com", name: "A User" })));
    const idToken = `hdr.${payload}.sig`;
    expect(decodeIdToken(idToken)).toEqual({ tid: "tenant-123", upn: "user@acme.com", name: "A User" });
    expect(decodeIdToken(undefined)).toEqual({});
    expect(decodeIdToken("not-a-jwt")).toEqual({});
  });

  it("T2257 — sanitizeReturnTo keeps same-origin targets and rejects cross-origin", () => {
    const origin = "https://app.diagramatix.com";
    expect(sanitizeReturnTo("/dashboard/projects/1", origin)).toBe(`${origin}/dashboard/projects/1`);
    expect(sanitizeReturnTo(`${origin}/diagram/9`, origin)).toBe(`${origin}/diagram/9`);
    expect(sanitizeReturnTo("https://evil.example.com/x", origin)).toBe(`${origin}/dashboard`);
    expect(sanitizeReturnTo(null, origin)).toBe(`${origin}/dashboard`);
  });
});
