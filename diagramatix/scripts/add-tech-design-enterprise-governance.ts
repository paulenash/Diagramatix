/**
 * Add an "Enterprise governance — per-tenant policy, view modes & audit" section
 * to the SuperAdmin **Technical Design Notes** (`identity-access` chapter of the
 * `tech-design` collection). The low-level design of the enterprise-readiness
 * programme (see diagramatix/enterprise/). Idempotent + LIVING: upsert by heading,
 * so re-running (incl. on deploy) refreshes the body as the programme progresses.
 * Mirrors scripts/add-tech-design-import-competitor-bpmn.ts.
 *
 * Run: DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" npx tsx scripts/add-tech-design-enterprise-governance.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";
const CHAPTER_SLUG = "identity-access";
const HEADING = "Enterprise governance — per-tenant policy, view modes & audit";

const BODY = [
  "The enterprise-readiness programme lets a large organisation impose **their** policy on how their process data is handled. The full analysis + plan live in the repo at `diagramatix/enterprise/` (findings register, gating plan, and a living implementation log). Status: **Phase A1 + most of A2 shipped**.",
  "",
  "### Organisation Policy engine",
  "",
  "Per-tenant governance mirrors the existing `Org.allowCrossOrgSharing` precedent. `Org` carries boolean policy columns — `allowAi`, `allowVoiceAi`, `allowExternalExport`, `allowSharePoint`, `allowSupportDiagram` (all default **true**, backward-compatible). `app/lib/auth/orgPolicy.ts` exposes `getOrgPolicy(orgId)`, `orgPolicyAllows(session, key)` and **`gateOrgPolicy(session, key)`** — a route guard that returns a `403 NextResponse` (or `null`) based on the caller's **active org**. It's enforced at ~19 routes (all `/api/ai/**`, mining discover/explain AI branches, sim assess, SharePoint browse/download/upload, and the support-diagram route, which strips the diagram + skips the vendor copy when disallowed).",
  "",
  "OrgAdmins edit the flags in a **Data & AI Governance** card on Org Settings (same gate as cross-org sharing), with an **Apply Enterprise Mode** button that turns everything (plus cross-org sharing) off. The client mirrors enforcement in the UI via `useOrgPolicy()` + `GET /api/org/policy` (e.g. the Diagram toolbar hides AI Generate live when AI is disallowed).",
  "",
  "### SuperAdmin view modes (superadmin / orgadmin / user)",
  "",
  "Double-clicking the logo cycles a SuperAdmin through three views (`app/hooks/useSuperAdminChrome.ts`, tri-state; `hidden = mode !== \"superadmin\"` keeps existing consumers working). The mode is mirrored to the **`dgx_sa_mode` cookie** so the server can act on it, and is **versioned to `NEXT_PUBLIC_COMMIT_COUNT`** so it resets to `superadmin` on every deploy.",
  "",
  "- **Policy binding** — `orgPolicy.ts`'s `policyBindsCaller` treats the org policy as binding everyone **except a SuperAdmin in the `superadmin` view**. So a SuperAdmin keeps full access, and switching to orgadmin/user makes the policy apply (also how a SuperAdmin demos it).",
  "- **Surface downgrade** — `isActingSuperuser(session)` (= real superuser **and** superadmin view) replaces `isSuperuser` on the SuperAdmin surfaces: all 22 `/dashboard/admin/**` pages (super-only pages redirect away in orgadmin/user view; dual OrgAdmin pages fall to their OrgAdmin-scoped branch). The OrgAdmin button routes to the OrgAdmin screen. *(Deep API-route downgrade is still TODO — impersonation/backup/break-glass keep the real `isSuperuser`.)* The mode cookie is a view preference, **not** a trust boundary — hence it is paired with the audit log.",
  "",
  "### AI egress controls",
  "",
  "`app/lib/ai/anthropicClient.ts` `makeAnthropic()` is the single Anthropic-client factory and honours **`ANTHROPIC_BASE_URL`**, so all Claude traffic can be routed through an enterprise proxy / private gateway / region-pinned endpoint without touching call sites. All AI features run on the single admin-selected model (`getAiGenerateModel()`) — the three previously model-pinned features (staff narrative, transcript clean-up, sim assessment) were folded in.",
  "",
  "### Audit log",
  "",
  "`AuditLog` is an append-only table; **`recordAudit()`** (`app/lib/audit.ts`) writes one row and never throws (auditing must not break the primary action). `meta` is a JSON **string** (avoids the Prisma-7 JSON-omit-on-write caveat) and carries ids / counts / modes / hashes only — never raw process or PII content. Instrumented events: impersonation start/stop, full-backup export + wipe restore, org-admin backup, user delete, and org settings / governance-policy updates. A SuperAdmin **Audit Log** viewer (filter by actor / action / target) reads it. It is system-global telemetry, so it is excluded from tenant backups (SuperAdmin full backup only).",
  "",
  "### Impersonation hardening & sessions",
  "",
  "Impersonation cookies (`dgx_view_as` / `_mode`) are **HttpOnly + Secure**; the banner runs off a server-computed flag. **Edit-mode** impersonation now requires a **reason** (captured via `PromptDialog`, stored in the audit start entry) and is time-boxed to **1 hour** (view mode stays 8h and is the default). Session lifetime is configurable (`auth.config.ts`): an absolute `maxAge` (default 7 days) + daily `updateAge`, overridable via `AUTH_SESSION_MAX_AGE` / `AUTH_SESSION_UPDATE_AGE` (was the uncapped 30-day NextAuth default).",
  "",
  "### Deliberately still open",
  "",
  "SuperAdmin is still the three hard-coded `SUPERUSER_EMAILS` (now **audit-detectable**); moving it to a stored `User.isSuperAdmin` role + MFA is scoped as A2c. SSO/SAML, GDPR self-erasure, pre-egress AI redaction and a dedicated single-tenant instance tier are Phase A3/B. See `diagramatix/enterprise/06` (plan) and `07` (log).",
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
