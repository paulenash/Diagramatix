/** The seeded account the e2e smoke tests sign in as (created by auth.setup.ts). */
export const E2E_USER = {
  email: "e2e@diagramatix.test",
  password: "e2e-Password-123",
  name: "E2E Tester",
} as const;

/**
 * A SuperAdmin account for admin-surface e2e (catalog manager, capture). Its
 * email is on the SUPERUSER_EMAILS allowlist, so `isSuperuser` recognises it.
 * Seeded into diagramatix_test ONLY (scripts/e2e-seed-superadmin.ts) with this
 * known password; never touches prod.
 */
export const E2E_ADMIN = {
  email: "greg.nash@getai.com.au",
  password: "e2e-Admin-Password-123",
  name: "E2E Admin",
} as const;
