/**
 * Every path the contract endpoint advertises must actually resolve to a route.
 *
 * This exists because it did not, and nothing noticed. The artifact handler lived
 * at `…/artifact/route.ts`, which serves `/artifact` and nothing below it, while
 * the contract, both design documents and every job response handed out
 * `…/artifact/diagram.pdf`. Every artifact URL 404'd from the day it shipped.
 *
 * The unit tests did not catch it because they called the handler directly — a
 * handler can be perfect and still be unreachable. What was missing was a check
 * that the ADVERTISED path and the ROUTE FILE agree, which is a structural fact
 * and cheap to assert.
 *
 * So this walks the app router the way Next does: an exact directory, else a
 * `[dynamic]` one, else a `[...catchAll]`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const APP = path.join(process.cwd(), "app");

/** Can the app router serve this pathname? */
function resolves(pathname: string): boolean {
  const segments = pathname.replace(/^https?:\/\/[^/]+/, "").split("/").filter(Boolean);
  let dir = APP;
  for (const raw of segments) {
    if (!fs.existsSync(dir)) return false;
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    const names = entries.map((e) => e.name);

    // A literal segment wins; a route group "(x)" is transparent but none of
    // ours sit under /api, so it is not worth walking.
    if (names.includes(raw)) { dir = path.join(dir, raw); continue; }

    // A single dynamic segment: [jobId], [file].
    const dyn = names.find((n) => /^\[[^.\]]+\]$/.test(n));
    if (dyn) { dir = path.join(dir, dyn); continue; }

    // A catch-all swallows the rest.
    if (names.some((n) => /^\[\.\.\..+\]$/.test(n))) return true;

    return false;
  }
  return fs.existsSync(path.join(dir, "route.ts")) || fs.existsSync(path.join(dir, "route.tsx"));
}

/** The paths the contract endpoint publishes, read from its source so the test
 *  cannot drift from what is actually served. */
function advertisedPaths(): string[] {
  const src = fs.readFileSync(path.join(APP, "api/public/v1/route.ts"), "utf8");
  return [...src.matchAll(/path:\s*`\$\{base\}([^`]*)`/g)]
    .map((m) => "/api/public/v1" + m[1])
    // {jobId} is the contract's placeholder; any id stands in for it.
    .map((p) => p.replace(/\{[^}]+\}/g, "SOME_ID"));
}

describe("the contract only advertises paths that exist", () => {
  it("T3096 — every advertised endpoint resolves to a route file", () => {
    const paths = advertisedPaths();
    expect(paths.length, "the contract should advertise several endpoints").toBeGreaterThan(4);
    for (const p of paths) {
      expect(resolves(p), `${p} is advertised but no route file serves it`).toBe(true);
    }
  });

  it("T3097 — the artifact paths in particular, which shipped broken", () => {
    for (const file of ["diagram.bpmn", "diagram.json", "diagram.pdf", "diagram.svg"]) {
      expect(
        resolves(`/api/public/v1/process-map/SOME_ID/artifact/${file}`),
        `${file} does not resolve — the handler is unreachable however correct it is`,
      ).toBe(true);
    }
  });

  it("T3098 — the matcher is not simply saying yes to everything", () => {
    // Without this, the two tests above would pass on a broken router.
    expect(resolves("/api/public/v1/process-map/SOME_ID/no-such-thing/x")).toBe(false);
    expect(resolves("/api/definitely/not/a/route")).toBe(false);
  });
});
