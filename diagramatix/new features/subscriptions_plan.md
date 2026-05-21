# Diagramatix — Subscriptions (4 tiers + admin editor + per-user usage popover)

## Context

Diagramatix today has no concept of subscription tiers. Every signed-in user has unlimited projects, diagrams, AI generations, and exports. The only gating is the `SUPERUSER_EMAILS` allowlist in [app/lib/superuser.ts](../app/lib/superuser.ts) that distinguishes admins from regular users.

This plan introduces four real subscription tiers — **Free, Introductory, Professional, Expert** — plus a synthetic **Administration** tier for users in the existing superuser allowlist. Each tier carries ten enforceable limits (projects, diagrams-per-type-per-project, archimate total, element counts, AI attempts, individual exports/imports, bulk exports/imports). Admins can edit those tier limits via a new Admin sub-screen, set any user's tier from the registered-users table, and inspect any user's live usage in a popover keyed to the tier's limits.

**Out of scope for this round (deferred to a Phase 2):** Stripe / self-serve payment processing. Prices ($0 / $70 / $150 / $270 per month) are display-only; the admin manually assigns tiers from the registered-users table for now.

### Decisions captured

- **Counter reset boundary**: anniversary-day monthly. Each user's period starts on their registration day-of-month (e.g. user registered 15 May → reset on 15th of each subsequent month). If the anniversary day doesn't exist in a given month (registered 31st → February), the period ends on the last day of that month. Period key stored as the ISO date of the period start (`"YYYY-MM-DD"`). Free's lifetime counters use period key `all-time`.
- **Archimate cap**: total across all projects (not per project) — matches the "X archimate diagrams included" wording.
- **Free tier individual exports/imports ("2")**: lifetime totals (matches the parallel "5 AI Generate attempts in total" wording).
- **Element count semantics**: nodes only. Connectors and artifacts (data-object / data-store / text-annotation) do not count.
- **Admin tier**: derived from `isSuperuser(session)`, not stored. Admins always bypass enforcement; their popover shows usage but every "limit" displays as "—".
- **Subscription scope**: per User (not per Org). `User.subscriptionLevelId` foreign-keys the `SubscriptionLevel` table.
- **Existing-user default at launch**: all existing users are grandfathered to **Expert** (the top tier). New signups after launch start on **Free**. Admin downgrades grandfathered users manually as the user base evolves.
- **Over-limit handling**: soft block. Existing over-limit content stays read/edit-able; new creation / new AI attempt / new export is blocked until the user is back under the cap or upgrades.

---

## Architecture

### Data model

Two new Prisma models + one User field.

**`SubscriptionLevel`** — one row per tier (Free, Introductory, Professional, Expert). Editable via the Admin screen. Limits stored as nullable integers where `null` means "unlimited".

```prisma
model SubscriptionLevel {
  id                          String   @id            // "free" | "introductory" | "professional" | "expert"
  name                        String                  // display name
  priceMonthly                Int      @default(0)    // AUD cents
  sortOrder                   Int                     // for UI ordering

  // Limits (null = unlimited)
  maxProjects                 Int?
  maxDiagramsPerTypePerProject Int?
  maxArchimateDiagramsTotal   Int?
  maxNonBpmnElementsPerDiagram Int?
  maxBpmnElementsPerDiagram   Int?
  maxAiAttempts               Int?
  aiAttemptsResetMonthly      Boolean  @default(true) // false → counter is lifetime (Free)
  maxIndividualExports        Int?
  individualExportsResetMonthly Boolean @default(true)
  maxIndividualImports        Int?
  individualImportsResetMonthly Boolean @default(true)
  maxBulkExports              Int?
  maxBulkImports              Int?

  users                       User[]
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt
}
```

**`UsageCounter`** — one row per `(userId, periodKey, metric)`. Period key is `"YYYY-MM"` for monthly metrics and `"all-time"` for lifetime metrics. Incremented in-event by the enforcement layer.

```prisma
model UsageCounter {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  periodKey String                  // "2026-05" | "all-time"
  metric    String                  // "ai_attempts" | "individual_exports" | "individual_imports" | "bulk_exports" | "bulk_imports"
  count     Int      @default(0)
  updatedAt DateTime @updatedAt
  @@unique([userId, periodKey, metric])
}
```

**`User`** — one new field:

```prisma
subscriptionLevelId String?
subscriptionLevel   SubscriptionLevel? @relation(fields: [subscriptionLevelId], references: [id])
usageCounters       UsageCounter[]
```

Migration seeds four `SubscriptionLevel` rows with the values from the spec. Existing users are grandfathered to `subscriptionLevelId = "expert"` so launch doesn't impose new limits on anyone already using the system; new signups default to `"free"` (set by the registration flow, not the migration).

### Enforcement library

NEW [`app/lib/subscription.ts`](../app/lib/subscription.ts) — single entry point for every limit check + counter increment.

```typescript
export type LimitMetric =
  | "projects" | "diagramsPerTypePerProject" | "archimateDiagramsTotal"
  | "nonBpmnElementsPerDiagram" | "bpmnElementsPerDiagram"
  | "aiAttempts" | "individualExports" | "individualImports"
  | "bulkExports" | "bulkImports";

export type EnforcementResult =
  | { ok: true }
  | { ok: false; reason: string; metric: LimitMetric; current: number; limit: number };

// Server-side check. Auto-bypasses for isSuperuser(session).
export async function checkLimit(
  userId: string,
  metric: LimitMetric,
  ctx?: { projectId?: string; diagramType?: string; elementCount?: number },
): Promise<EnforcementResult>;

// Idempotent post-event counter bump. No-op for superusers.
export async function recordUsage(
  userId: string,
  metric: "aiAttempts" | "individualExports" | "individualImports" | "bulkExports" | "bulkImports",
  delta?: number,                       // default 1
): Promise<void>;

// Full snapshot for the user — drives the admin popover.
export async function getUsageSnapshot(userId: string): Promise<{
  tier: { id: string; name: string };
  isAdmin: boolean;
  metrics: Array<{
    metric: LimitMetric;
    label: string;
    current: number;
    limit: number | null;
    periodLabel: string;              // "this month" | "lifetime" | "current count"
    overLimit: boolean;
  }>;
}>;
```

The current period key is computed by `currentPeriodKey(user, now)` which walks back to the most recent anniversary date at or before `now`, falling back to the month's last day when the anniversary day doesn't exist in that month. Point-in-time metrics (projects, diagrams-per-type, archimate total, element counts) are computed by counting the actual DB rows — no `UsageCounter` row needed. Event metrics (AI attempts, exports, imports) use `UsageCounter` keyed by `(userId, periodKey, metric)` where `periodKey` is the ISO date of the current period's start.

### Wiring points (limit checks + recordUsage)

Every check is added at the **server entry point** (API route), not in the React component. UI-side disabled buttons are a UX nicety but must NOT be the only barrier.

| Limit | Wire point | Action on fail |
|---|---|---|
| `projects` | `app/api/projects/route.ts` POST | 403 with reason |
| `diagramsPerTypePerProject` | `app/api/projects/[id]/diagrams/route.ts` POST | 403 |
| `archimateDiagramsTotal` | same — extra check when `type === "archimate"` | 403 |
| `nonBpmnElementsPerDiagram` + `bpmnElementsPerDiagram` | `useDiagram` `ADD_ELEMENT` reducer **AND** the diagram save endpoint (so paste/import can't sneak past) | UI: toast + disable; server: 409 on save |
| `aiAttempts` | every `/api/ai/**` POST route | 402 with reason; UI shows upgrade prompt |
| `individualExports` | `/api/export/visio-v3/route.ts`, `/api/export/diagram/**` if present | 402 |
| `individualImports` | `/api/import/visio-v3/route.ts`, any other single-diagram import | 402 |
| `bulkExports` | `/api/export/visio-v3/bulk/route.ts` (if implemented; otherwise the future endpoint) | 402 |
| `bulkImports` | `/api/import/visio-v3/bulk/route.ts` | 402 |

`recordUsage()` fires AFTER successful completion (e.g. after the AI response streams back, after the export file is generated). Limit check happens BEFORE the work starts. This ordering means a user who tries an AI attempt that errors out doesn't get charged a counter increment.

### Admin: Subscription Prices and Limits editor

NEW page at `/dashboard/admin/subscriptions`.
NEW button on `AdminClient.tsx` header — "Subscription Prices and Limits", same style as "AI Rules & Preferences" and "Database Access" buttons (lines ~83-94).

Page structure mirrors the existing `RulesEditor` pattern (header with back-to-Admin link + brand icon, form below). One table with four tier columns; each row is one limit, each cell is an input (`null` / empty for unlimited). Save button persists via a new `PUT /api/admin/subscriptions` route guarded by `isSuperuser(session)`. Optimistic UI is unnecessary — page reloads fresh from server on save.

### Admin: Registered Users — Subscription column + popover

`AdminClient.tsx` table gets a new column **Subscription**, inserted between "Working on" and "Projects" (right of impersonation-target name, left of usage counts so the popover button reads alongside numeric usage). The cell is a button styled like the existing View/Edit pills. Label is the tier name ("Free", "Introductory", "Administration" for superusers, etc.).

Clicking the button opens a small **UsagePopover** component (NEW, in the admin folder) — a centred modal showing:
- User name + email + current tier.
- A table of the ten metrics with columns: Metric | Current | Limit | Period.
- "—" in the Limit column for the admin tier; rows for the user's own tier show `null` limits as "Unlimited".
- Visual flag (red text) for any metric where `current >= limit`.
- Two action buttons: **Change Tier** (dropdown of the four tiers, posts to `PATCH /api/admin/users/[id]/subscription`) and **Close**.

Data comes from `getUsageSnapshot(userId)` exposed via a new `GET /api/admin/users/[id]/usage` route, again guarded by `isSuperuser(session)`. Refreshed on every popover open (no cache).

### Existing-user UX

Each user's own dashboard header gets a small chip next to the version number reading e.g. **Free • 1/1 projects** — a click on the chip opens the same popover (their own, no Change Tier action — replaced by an "Upgrade" placeholder that's disabled with tooltip "Coming soon" while Stripe is out of scope). This is the user-facing entry point to the same data the admin sees.

Server-side enforcement uses 402 (Payment Required) status for over-limit cases so the UI layer can distinguish "you hit a limit" from genuine errors and display the upgrade prompt accordingly.

---

## Critical files

**New:**
- `prisma/schema.prisma` — add `SubscriptionLevel`, `UsageCounter`, two new User columns.
- `prisma/migrations/<ts>_subscriptions/migration.sql` — created by `prisma migrate dev` (or hand-rolled and `db push`'d, matching the project's current Prisma 7 workflow per CLAUDE.md).
- `app/lib/subscription.ts` — enforcement library (`checkLimit`, `recordUsage`, `getUsageSnapshot`, `periodKeyFor`).
- `app/(dashboard)/dashboard/admin/subscriptions/page.tsx` + `SubscriptionsEditor.tsx` — admin editor for prices and limits.
- `app/(dashboard)/dashboard/admin/UsagePopover.tsx` — modal shown from the registered-users table.
- `app/api/admin/subscriptions/route.ts` — `GET` (list four tiers) + `PUT` (save edits). `isSuperuser` gated.
- `app/api/admin/users/[id]/subscription/route.ts` — `PATCH` to change a user's tier.
- `app/api/admin/users/[id]/usage/route.ts` — `GET` returning the usage snapshot.

**Modified:**
- `app/lib/superuser.ts` — no change to the email allowlist itself; export a helper used by `subscription.ts`.
- `app/(dashboard)/dashboard/admin/AdminClient.tsx` — new "Subscription Prices and Limits" button (header) and new column + button in the users table.
- `app/(dashboard)/dashboard/admin/page.tsx` — server query: include `subscriptionLevel.name` per user.
- `app/api/projects/route.ts` — `checkLimit("projects")` before insert.
- `app/api/projects/[id]/diagrams/route.ts` (or equivalent — see exploration if path differs) — `checkLimit("diagramsPerTypePerProject")` + `checkLimit("archimateDiagramsTotal")` when relevant.
- `app/api/ai/bpmn/plan/route.ts`, `apply-layout/route.ts`, `generate-bpmn/route.ts`, `generate-diagram/route.ts` — `checkLimit("aiAttempts")` before; `recordUsage("aiAttempts")` after success.
- `app/api/export/visio-v3/route.ts` + import route — `checkLimit` + `recordUsage` for individual exports/imports.
- The bulk export/import routes (existing import; export is future) — same pattern with `bulkExports` / `bulkImports`.
- `app/hooks/useDiagram.ts` `ADD_ELEMENT` reducer — soft client-side check for element-count limits with toast; server-side check on save remains the authority.
- `app/(dashboard)/dashboard/DashboardClient.tsx` — small tier chip next to the version number; click → UsagePopover (user's own).

**Read-only references (no changes):**
- `app/lib/db.ts` — Prisma client + `pgPool` for any raw queries needed.
- `app/(dashboard)/dashboard/rules/RulesEditor.tsx` — copy the page-layout pattern (back link + icon + heading + scrollable form body).

---

## Implementation order

Five sub-deliverables, each independently committable and testable:

1. **Schema + seed + migration**. `prisma db push` adds tables and User column; seed script inserts the four `SubscriptionLevel` rows + grandfathers every existing user to `subscriptionLevelId = "expert"`. Registration flow (`app/api/auth/**` and/or `auth.ts`) updated to set `"free"` on new sign-ups. Verify with `prisma studio`.
2. **`app/lib/subscription.ts` enforcement library**. Unit-style smoke test: write a small script that calls `checkLimit` and `recordUsage` against a test user; manually inspect `UsageCounter` rows.
3. **Wire the limits**. Add `checkLimit` calls at every API entry point listed in the table. `recordUsage` calls on success. Verify by manually creating a Free user via `prisma studio`, hitting the limits (1 project, 5 AI attempts) and confirming 402 responses.
4. **Admin: Subscription Prices and Limits editor**. New page, route, button on Admin. Verify by editing a limit (e.g. lower Free projects to 0), refreshing a Free user's project page, and confirming "create project" is blocked.
5. **Admin: Subscription column + UsagePopover + Change Tier action**. Verify by changing a user's tier from Free → Professional in the admin table; refreshing their dashboard chip; opening the popover from both admin and user-self entry points.

---

## Verification

End-to-end test checklist (after all five sub-deliverables ship):

1. Type-check: `npm run build` clean.
2. **Free user**: register a NEW user (post-launch sign-ups default to Free, not Expert). Confirm subscription chip reads "Free". Create one project (ok). Try a second (blocked, 402). Create one BPMN diagram in that project (ok). Create another BPMN (blocked). Create one process-context diagram (ok — different type). Attempt to drop a 16th non-BPMN element on a 15-element diagram (toast appears; save returns 409 if forced). Attempt AI Generate six times (5 succeed, 6th blocked).
3. **Admin manually upgrades the user to Professional** via the registered-users popover. Refresh the user's dashboard. Chip now reads "Professional". The same actions all succeed. AI attempts counter visible in popover.
4. **Admin edits limits**: open Subscription Prices and Limits, lower Free `maxProjects` to 0. Sign in as another fresh Free user; confirm even the first project is blocked.
5. **Admin tier**: sign in as `paul@nashcc.com.au`. Subscription chip reads "Administration". All actions succeed regardless of limits.
6. **Monthly reset**: manually fast-forward by setting `UsageCounter.periodKey` on a test user from "2026-05" → "2026-06" in `prisma studio`. Confirm the popover for May shows N attempts and June shows 0.
7. **Soft-block on downgrade**: create 8 projects as Professional. Admin downgrades to Introductory. Refresh dashboard: existing 8 projects all listed and openable. Create-project button is disabled with tooltip "Limit 5 reached on Introductory". Delete 4; create one succeeds.
8. **Usage popover**: every metric row shows current/limit/period. Over-limit rows are red. Admin sees "—" for their own popover's limits.

---

## Out of scope (deferred)

- **Stripe / payment processing.** Admin sets tiers manually. Prices are display-only this round.
- **User self-serve upgrade flow.** No "Upgrade" button on the dashboard chip yet (placeholder reads "Coming soon").
- **Org-level subscriptions.** Per-user only. Org evolution is a later refactor.
- **Pro-rata / partial-month accounting.** Calendar-month counter, period change at midnight UTC on the 1st.
- **Counter backfill for historical AI attempts / exports.** New counters start at 0 for everyone at launch.
- **Downgrade-time deletion UI.** Soft block at creation; no "you must delete 3 to downgrade" wizard.
- **Email notifications** (limit hit, monthly reset, upgrade nudge). Telemetry-only for now.
- **Audit log** of tier changes. Admin can edit but actions aren't logged beyond Prisma's `updatedAt`.
