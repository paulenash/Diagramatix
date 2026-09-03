/**
 * Re-export of the layout invariants, which now live in production code so a
 * generation can run them too (Paul, 2026-09-03: one-pass output must be a
 * readable PDF, so these are a correctness bar rather than a test convenience).
 */
export * from "@/app/lib/diagram/checks/layoutViolations";
