import { test as setup, expect } from "@playwright/test";
import { E2E_USER } from "./_user";

/**
 * Seed the e2e account via the REAL register endpoint — no app-code import (so
 * no Prisma/ESM loading inside Playwright's runner), and the webServer is
 * guaranteed up because this runs as a project dependency before the specs.
 * Idempotent: 201 the first time, 409 (duplicate email) on every run after.
 */
setup("seed the e2e user via /api/register", async ({ request }) => {
  const res = await request.post("/api/register", {
    data: { email: E2E_USER.email, name: E2E_USER.name, password: E2E_USER.password },
  });
  expect([201, 409], `register returned ${res.status()}`).toContain(res.status());
});
