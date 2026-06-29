/**
 * Auth — superuser impersonation + effective-user authz.
 *
 * Pure-function tests over app/lib/superuser.ts — no app changes, no DB. We
 * construct sessions + a fake cookie store directly and assert the resolvers
 * that every impersonation-aware route relies on.
 *
 * The single most important guard: a NON-superuser cannot impersonate even with
 * the cookie present — getViewAsUserId / isImpersonating gate on isSuperuser
 * first, so the cookie is inert for normal users.
 *
 * Superuser matching is case-INSENSITIVE: the session email is lowercased before
 * the SUPERUSER_EMAILS lookup, so a superuser whose stored email differs only in
 * casing is still recognised.
 */
import { describe, it, expect } from "vitest";
import {
  isSuperuser,
  getViewAsUserId,
  getEffectiveUserId,
  isImpersonating,
  getImpersonationMode,
  isReadOnlyImpersonation,
  IMPERSONATE_COOKIE,
  IMPERSONATE_MODE_COOKIE,
  SUPERUSER_EMAILS,
} from "@/app/lib/superuser";

// A real superuser email + a normal one.
const SUPER_EMAIL = [...SUPERUSER_EMAILS][0];
const NORMAL_EMAIL = "normal-user@diagramatix.test";

// Fake cookie store: map of cookie-name → value.
const cookies = (m: Record<string, string>) => ({
  get: (n: string) => (n in m ? { value: m[n] } : undefined),
});

const superSession = { user: { id: "super-id", email: SUPER_EMAIL } };
const normalSession = { user: { id: "normal-id", email: NORMAL_EMAIL } };
const TARGET = "target-user-id";

describe("isSuperuser", () => {
  it("a SUPERUSER_EMAILS email → true", () => {
    expect(isSuperuser(superSession)).toBe(true);
  });
  it("a normal email → false", () => {
    expect(isSuperuser(normalSession)).toBe(false);
  });
  it("a null session → false", () => {
    expect(isSuperuser(null)).toBe(false);
  });
  it("matching is case-INSENSITIVE (an uppercase variant of a superuser email still matches)", () => {
    expect(isSuperuser({ user: { id: "x", email: SUPER_EMAIL.toUpperCase() } })).toBe(true);
    expect(isSuperuser({ user: { id: "x", email: "Paul@NashCC.com.AU" } })).toBe(true);
    // a non-superuser is still not matched, regardless of casing
    expect(isSuperuser({ user: { id: "x", email: "NotAnAdmin@Example.com" } })).toBe(false);
  });
});

describe("getViewAsUserId", () => {
  it("superuser + impersonate cookie set → that value", () => {
    expect(
      getViewAsUserId(superSession, cookies({ [IMPERSONATE_COOKIE]: TARGET })),
    ).toBe(TARGET);
  });
  it("NON-superuser + cookie set → null (a normal user can't impersonate)", () => {
    expect(
      getViewAsUserId(normalSession, cookies({ [IMPERSONATE_COOKIE]: TARGET })),
    ).toBeNull();
  });
  it("superuser + no cookie → null", () => {
    expect(getViewAsUserId(superSession, cookies({}))).toBeNull();
  });
});

describe("getEffectiveUserId", () => {
  it("superuser impersonating → the impersonated id", () => {
    expect(
      getEffectiveUserId(superSession, cookies({ [IMPERSONATE_COOKIE]: TARGET })),
    ).toBe(TARGET);
  });
  it("non-superuser with the cookie → their OWN id (cookie inert)", () => {
    expect(
      getEffectiveUserId(normalSession, cookies({ [IMPERSONATE_COOKIE]: TARGET })),
    ).toBe("normal-id");
  });
  it("nobody impersonating → own id", () => {
    expect(getEffectiveUserId(superSession, cookies({}))).toBe("super-id");
  });
  it("null session → empty string", () => {
    expect(getEffectiveUserId(null, cookies({}))).toBe("");
  });
});

describe("isImpersonating", () => {
  it("true only when a superuser has the cookie", () => {
    expect(isImpersonating(superSession, cookies({ [IMPERSONATE_COOKIE]: TARGET }))).toBe(true);
    expect(isImpersonating(normalSession, cookies({ [IMPERSONATE_COOKIE]: TARGET }))).toBe(false);
    expect(isImpersonating(superSession, cookies({}))).toBe(false);
  });
});

describe("getImpersonationMode", () => {
  it('mode cookie "edit" → "edit"', () => {
    expect(getImpersonationMode(cookies({ [IMPERSONATE_MODE_COOKIE]: "edit" }))).toBe("edit");
  });
  it('"view" / absent / other → "view"', () => {
    expect(getImpersonationMode(cookies({ [IMPERSONATE_MODE_COOKIE]: "view" }))).toBe("view");
    expect(getImpersonationMode(cookies({}))).toBe("view");
    expect(getImpersonationMode(cookies({ [IMPERSONATE_MODE_COOKIE]: "garbage" }))).toBe("view");
  });
});

describe("isReadOnlyImpersonation", () => {
  it("superuser impersonating in view mode → true", () => {
    expect(
      isReadOnlyImpersonation(
        superSession,
        cookies({ [IMPERSONATE_COOKIE]: TARGET, [IMPERSONATE_MODE_COOKIE]: "view" }),
      ),
    ).toBe(true);
  });
  it("superuser impersonating in edit mode → false", () => {
    expect(
      isReadOnlyImpersonation(
        superSession,
        cookies({ [IMPERSONATE_COOKIE]: TARGET, [IMPERSONATE_MODE_COOKIE]: "edit" }),
      ),
    ).toBe(false);
  });
  it("not impersonating (even with mode=view) → false", () => {
    expect(
      isReadOnlyImpersonation(superSession, cookies({ [IMPERSONATE_MODE_COOKIE]: "view" })),
    ).toBe(false);
  });
  it("non-superuser with both cookies → false", () => {
    expect(
      isReadOnlyImpersonation(
        normalSession,
        cookies({ [IMPERSONATE_COOKIE]: TARGET, [IMPERSONATE_MODE_COOKIE]: "view" }),
      ),
    ).toBe(false);
  });
});
