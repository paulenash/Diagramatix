/**
 * SEC-09 — a catch-all 500 must not echo raw error text (which can carry
 * Postgres table/column/constraint names) to the client.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { serverError } from "@/app/lib/apiError";

afterEach(() => vi.restoreAllMocks());

describe("serverError", () => {
  it("returns 500 with a generic message + a correlation ref, never the raw detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = 'relation "User" violated unique constraint "User_email_key"';
    const res = serverError(new Error(secret), "PUT /api/x");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("User_email_key");
    expect(body.error).not.toContain("constraint");
    expect(typeof body.ref).toBe("string");
    expect(body.ref.length).toBeGreaterThan(0);
  });

  it("logs the full detail server-side under the same ref", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = serverError(new Error("boom-internal-detail"));
    const { ref } = await res.json();

    const logged = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain(ref);              // traceable
    expect(logged).toContain("boom-internal-detail"); // full detail is logged, not sent
  });

  it("handles a non-Error throwable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = serverError("a bare string");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Something went wrong on our end. Please try again.");
  });
});
