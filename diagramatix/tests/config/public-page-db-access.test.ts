/**
 * SEC-28 — a page that reads the database must not be reachable anonymously.
 *
 * `app/test/db/page.tsx` was scratch debugging code that ran
 * `prisma.user.findMany({ select: { email: true, name: true } })` and rendered
 * the result. `/test` was never in the proxy matcher, so on the production host
 * any anonymous visitor could read every customer's email address and display
 * name — a ready-made phishing list. Two siblings hard-coded a database
 * connection string. The tree was deleted (2026-09-16).
 *
 * The matcher-parity test next door cannot catch this: it proves the prefixes
 * that ARE declared stay in sync, and `/test` was never declared. This one
 * approaches from the other side — it looks at what a file actually does. Any
 * page or route outside `app/api` that touches the database must either call
 * `auth()` or be named here as deliberately public.
 *
 * `app/api` is excluded because those handlers self-guard by design and are
 * covered elsewhere; this is about the pages the middleware is responsible for.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP = join(process.cwd(), "app");

/** Pages that read the database and are public on purpose. Keep this list short and justified. */
const DELIBERATELY_PUBLIC = new Set<string>([
  // The marketing feature list renders rows an admin has explicitly published.
  "app/(marketing)/features/page.tsx",
]);

function pagesAndRoutes(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;
      pagesAndRoutes(full, acc);
    } else if (/^(page|route)\.tsx?$/.test(entry.name)) {
      acc.push(relative(process.cwd(), full).split(sep).join("/"));
    }
  }
  return acc;
}

/** Does this source reach the database at all? */
const touchesDb = (src: string) =>
  /@\/app\/lib\/db|from ["']pg["']|new pg\.Pool|\bprisma\./.test(src);

describe("public pages must not read the database", () => {
  it("T4423 — every non-API page/route that touches the DB calls auth(), or is an allowed public page", () => {
    const files = pagesAndRoutes(APP).filter((f) => !f.startsWith("app/api/"));
    expect(files.length, "sanity: the app should have plenty of pages").toBeGreaterThan(50);

    const unguarded: string[] = [];
    for (const file of files) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      if (!touchesDb(src)) continue;
      if (DELIBERATELY_PUBLIC.has(file)) continue;
      if (/\bauth\(\)/.test(src)) continue;
      unguarded.push(file);
    }

    expect(
      unguarded,
      "these pages read the database without authenticating — either call auth() or justify them in DELIBERATELY_PUBLIC",
    ).toEqual([]);
  });

  it("T4424 — the deleted scratch tree has not come back, and nothing hard-codes a database URL", () => {
    const files = pagesAndRoutes(APP);
    expect(
      files.filter((f) => f.startsWith("app/test/")),
      "app/test was scratch code that leaked the user table anonymously; it must stay deleted",
    ).toEqual([]);

    // Two of those files carried a literal connection string. A credential in
    // source is worse than the leak it enabled, so pin it across the whole app.
    const withLiteralDsn = files.filter((f) =>
      /postgres(ql)?:\/\/[^\s"')]+/.test(readFileSync(join(process.cwd(), f), "utf8")),
    );
    expect(withLiteralDsn, "a database connection string is hard-coded here; read it from the environment").toEqual([]);
  });
});
