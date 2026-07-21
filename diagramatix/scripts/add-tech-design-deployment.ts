/**
 * Add "Publishing to production — the CI/CD pipeline" to the SuperAdmin
 * **Technical Design Notes** (`data-ops` chapter of the `tech-design` collection):
 * an end-to-end walk of what happens on `git push` to main — every step, the
 * products used, and where each runs (local / GitHub / Azure). Idempotent +
 * LIVING: upsert by heading, so re-running (incl. on deploy) refreshes the body.
 * Mirrors scripts/add-tech-design-import-competitor-bpmn.ts.
 *
 * Run: DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" npx tsx scripts/add-tech-design-deployment.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";
const CHAPTER_SLUG = "data-ops";
const HEADING = "Publishing to production — the CI/CD pipeline";

const BODY = [
  "**Delivery model in one line:** *merge to `main` → GitHub Actions → Azure.* There is no manual release step, no server to SSH into, and no hand-run SQL — a push to `main` builds a container, applies the database schema, seeds content, and swaps the running image, with a smoke test at the end.",
  "",
  "### Where each part runs",
  "",
  "| Where | What happens |",
  "|---|---|",
  "| **Local (VS Code)** | Write code; run `npm run go` / `npm run build` / `npx vitest` to check locally; branch, commit, and `git push` (or merge a PR into `main`). Nothing is deployed from the developer's machine. |",
  "| **GitHub (Actions)** | On every push/PR, two workflows run on GitHub-hosted Ubuntu runners: **`ci.yml`** (the test + build gate) and, for pushes to `main`, **`azure-deploy.yml`** (build + ship). All build/migrate/seed orchestration lives here. |",
  "| **Azure** | Hosts the artefacts and the running app: Container Registry (image), App Service (runtime), PostgreSQL Flexible Server (data), Key Vault (secrets), Entra ID (deploy identity). GitHub drives Azure via the `az` CLI + Docker. |",
  "",
  "### Products used",
  "",
  "- **Git / GitHub** — source of truth + **GitHub Actions** CI/CD runner.",
  "- **Docker (Buildx)** — builds the multi-stage production image.",
  "- **Azure Container Registry (ACR, `dgxprodacr`)** — stores the image (tagged `:sha-<commit>` + `:latest`, with a registry-side `buildcache`).",
  "- **Azure App Service (Linux, `dgx-prod-app`)** — pulls + runs the container.",
  "- **Azure Database for PostgreSQL Flexible Server** — the production database (PostgreSQL 18).",
  "- **Azure Key Vault (`dgx-kv`)** — holds `DATABASE_URL` and the app's runtime secrets, surfaced to App Service as application settings.",
  "- **Microsoft Entra ID (Azure AD)** — an app registration with an **OIDC federated credential** so GitHub authenticates to Azure with a short-lived token — **no cloud password is stored in GitHub**.",
  "- **Prisma 7 CLI** — applies the schema; **`tsx`** — runs the idempotent content seeds.",
  "",
  "### Stage 1 — the gate (`ci.yml`, GitHub)",
  "",
  "Runs on every PR and every push to `main` (so a red ✗ lands before/with the deploy). Two jobs, each with their own **PostgreSQL 18 service container**:",
  "",
  "- **`test`** — Node 20 → `npm ci` (full, incl. dev deps) → `npx prisma generate` → `npm test` (Vitest; `globalSetup` does `prisma db push` against the throwaway test DB) → `npm run build` (catches type/build breaks).",
  "- **`e2e`** — Playwright/Chromium journeys via `scripts/e2e-server.cjs` (db push + seed + build + serve on :3001), uploading a report artefact.",
  "",
  "Turn on branch protection's *Require status checks* for `test` to make green CI a true merge gate. `azure-deploy.yml` **does not** re-run the suite — CI and deploy run in parallel.",
  "",
  "### Stage 2 — build & ship (`azure-deploy.yml`, GitHub → Azure)",
  "",
  "Triggered by push to `main` (or the manual *Run workflow* button). One job, gated on the GitHub **`production` environment** (add required reviewers/wait-timers there). Concurrency `cancel-in-progress: false` so an in-flight migration is never cut off. Steps:",
  "",
  "1. **Checkout** (full history — needed so `git rev-list --count HEAD` gives the real commit count).",
  "2. **Compute commit count** → `NEXT_PUBLIC_COMMIT_COUNT` (the build/version stamp shown in the app header and used to reset the SuperAdmin view mode per deploy).",
  "3. **Azure login (OIDC)** — `azure/login@v2` trades a GitHub OIDC token for an Azure token via the federated credential (no stored secret; only the client/tenant/subscription **IDs** are in GitHub secrets).",
  "4. **ACR login** — `az acr login` mints an admin-less registry token.",
  "5. **Build & push image** — Docker Buildx builds `diagramatix/Dockerfile` and pushes `:sha-<commit>` + `:latest`, using the registry `buildcache` for fast warm builds.",
  "6. **Fetch `DATABASE_URL` from Key Vault** — masked, surfaced only as a step output (never a top-level env the runner logs).",
  "7. **Node 20 + Prisma CLI** — `npm ci --omit=dev --ignore-scripts` then `npx prisma generate` (a lean install just for the migrate/seed steps).",
  "8. **Apply database schema** — `npx prisma db push --accept-data-loss --url <prod>`. *This runs BEFORE the container is swapped*, so the new code never meets an old schema (the failure mode that 500'd the Subscriptions release in 2026-05). The project has **no `prisma/migrations/`** — the schema file is the single source of truth, so reviewers must read `schema.prisma` diffs carefully (a column drop/rename would land unconfirmed).",
  "9. **Seed content** — idempotent, **non-blocking** (`continue-on-error`) `tsx` scripts: example galleries (simulator/mining/risk-control), User-Guide + Feature-catalog rows, Technical Design Notes (incl. this section and the Enterprise Governance ones), and data backfills. Feature rows land as **drafts** — publishing marketing copy stays a manual click.",
  "10. **Update App Service container image** — `az webapp config container set` points the app at the new `:sha-<commit>` tag.",
  "11. **Restart App Service** — explicit restart so the new container is active before the check.",
  "12. **Smoke test** — curls the public URL until it returns 200/302/307 (12 × 10s); a failure fails the workflow.",
  "13. **Azure logout** (always).",
  "",
  "### The container image (multi-stage `Dockerfile`)",
  "",
  "Node 20 Alpine, three stages: **deps** (`npm ci --ignore-scripts` + `prisma generate` → client at `app/generated/prisma`), **builder** (copy source, bake `NEXT_PUBLIC_COMMIT_COUNT`, `npm run build` → Next.js **standalone** output), **runner** (slim: the standalone `server.js` + `.next/static` + `public/` stencils + the Prisma schema, run as the non-root `nextjs` user, `CMD node server.js` on :3000). Runtime secrets are **not** baked in — they come from App Service application settings (sourced from Key Vault); only the public commit count is compiled in.",
  "",
  "### Safety, rollback & manual steps",
  "",
  "- **Ordering guarantees** — schema push and seeds happen *before* the image swap; a schema failure aborts the deploy with the old container still serving.",
  "- **Rollback** — re-run an older workflow run, or `az webapp config container set` to a prior `:sha-<commit>` tag (images are immutable per commit).",
  "- **Schema managed by `db push`, not migrations** — additive changes auto-apply on deploy; destructive changes need care (no confirmation prompt on the runner).",
  "- **Manual post-deploy** — new **Feature** catalog entries are drafts: a SuperAdmin clicks *Publish* in **SuperAdmin → Features Catalog** to make them public. `SubscriptionLevel` prices/limits are deliberately **not** seeded on deploy (managed live in the Subscriptions editor).",
].join("\n");

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const chapter = await prisma.helpChapter.findFirst({ where: { slug: CHAPTER_SLUG, collection: COLLECTION }, include: { sections: true } });
    if (!chapter) { console.error(`No "${CHAPTER_SLUG}" ${COLLECTION} chapter — run scripts/add-tech-design-notes.ts first.`); process.exit(1); }

    const existing = chapter.sections.find((s) => s.heading === HEADING);
    if (existing) {
      await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: BODY } });
      console.log(`Updated existing section "${HEADING}".`);
    } else {
      const sortOrder = Math.max(-1, ...chapter.sections.map((s) => s.sortOrder)) + 1;
      await prisma.helpSection.create({
        data: { chapterId: chapter.id, collection: COLLECTION, heading: HEADING, bodyMarkdown: BODY, sortOrder },
      });
      console.log(`Inserted section "${HEADING}" into "${chapter.title}".`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
