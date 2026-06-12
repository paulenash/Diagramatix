# Diagramatix — Source Code Audit

| | |
|---|---|
| **Audit started** | 2026-06-13 |
| **Commit audited** | `bbc8716` |
| **Scope** | All hand-written source (~98k lines TS/TSX): API routes, server libraries, diagram engine, canvas/renderers, page clients, import/export, build & config. Excludes `app/generated/`, `node_modules`, binary assets, and the test suite (flagged separately for its own review). |
| **Method** | Staged multi-agent review. Each stage: 3–5 specialist finder agents with distinct lenses over an explicit file manifest → dedupe → every finding adversarially verified by 2 independent skeptic agents reading the real code. Only findings that survive verification are documented. |

**Severity rubric**

| Severity | Meaning |
|---|---|
| **Critical** | Exploitable security hole or data-loss bug |
| **High** | Correctness bug users will hit, or a security weakness requiring circumstance |
| **Medium** | Latent bug, race condition, or robustness gap |
| **Low** | Code-quality, performance, or minor hardening |

**Stages**

| # | Stage | Status |
|---|---|---|
| 1 | Security & Access Control | ✅ Done — 18 findings (7 High, 7 Medium, 4 Low) |
| 2 | Data Integrity & Server Libs | ✅ Done — 24 findings (3 Critical, 13 High, 7 Medium, 1 Low) |
| 3 | Diagram Engine Core | Pending |
| 4 | Canvas & Renderers | Pending |
| 5 | Dashboard & Page Clients | Pending |
| 6 | Import/Export & Interop | Pending |
| 7 | Build, Config & Dependencies + Remediation Plan | Pending |

---

## Findings summary

| ID | Severity | Area | Title | Status |
|---|---|---|---|---|
| SEC-01 | High | Access control | VIEW-share recipient can delete an entire project (wrong-org OrgAdmin check) | Open |
| SEC-02 | High | Access control | Empty `ADMIN_PASSWORD` lets any user edit/delete global built-in templates | Open |
| SEC-03 | High | Secrets | OrgAdmin backup leaks every member's password hash, reset token, Stripe IDs | Open |
| SEC-04 | High | Auth flow | No email verification on register → account pre-hijacking via Entra auto-link | Open |
| SEC-05 | High | Secrets | Microsoft Graph access token leaked to the client via the session object | Open |
| SEC-06 | High | Auth flow | No rate limiting / lockout on login, register, or password reset | Open |
| SEC-07 | High | IDOR | Visio export endpoints authorise by Org membership, not project access | Open |
| SEC-08 | Medium | Privacy | User search leaks every user's name + email across all tenants | Open |
| SEC-09 | Medium | Info leak | Raw Postgres/internal error text returned to clients | Open |
| SEC-10 | Medium | DoS | No size/zip-bomb limit on backup-restore upload | Open |
| SEC-11 | Medium | Auth flow | No password strength/length check on registration | Open |
| SEC-12 | Medium | Auth flow | Login `authorize()` skips bcrypt when user missing (timing enumeration) | Open |
| SEC-13 | Medium | Impersonation | Archived-diagram delete/restore skip the read-only impersonation guard | Open |
| SEC-14 | Medium | Impersonation | `scan-links` POST mutates diagram JSON without the read-only guard | Open |
| SEC-15 | Low | Open redirect | `?from=` `startsWith('/')` accepts protocol-relative URLs | Open |
| SEC-16 | Low | Secrets | Password reset token stored in plaintext at rest | Open |
| SEC-17 | Low | Impersonation | Impersonation identity/mode in unsigned, non-httpOnly cookies | Open |
| SEC-18 | Low | Correctness | OrgAdmin impersonation is a server-side no-op (misleading UI) | Open |
| DATA-01 | Critical | Schema/FK | User delete throws (Restrict FK) for anyone who ever published — undeletable | Open |
| DATA-02 | Critical | Backup | Full-backup wipe-restore TRUNCATEs ~15 tables it never re-inserts → permanent loss | Open |
| DATA-03 | Critical | Backup | Wipe-restore re-inserts `Diagram.currentPublishedVersionId` but never backs up `PublishedVersion` → FK abort | Open |
| DATA-04 | High | Races | Stripe webhook has no event-ordering guard → stale event resurrects canceled subs | Open |
| DATA-05 | High | Races | `archiveDiagram` read-modify-writes `data` across two pools → lost update clobbers saves | Open |
| DATA-06 | High | Transactions | `restoreUserBackup` runs dozens of writes with no transaction → partial restore | Open |
| DATA-07 | High | Transactions | Backup phase-2 JSON writes outside the row creates → crash leaves dangling links | Open |
| DATA-08 | High | Restore | Subprocess link remap only walks `properties.linkedDiagramId` → misses other refs | Needs manual confirmation |
| DATA-09 | High | Transactions | Bundle-invite promotion catch-all deletes the pending row on *any* error | Open |
| DATA-10 | High | Email | Invite email Subject built from unescaped inviter/bundle name → header injection | Needs manual confirmation |
| DATA-11 | High | Restore | Additive full-restore matches users by bare email → re-parents data onto wrong live user | Open |
| DATA-12 | High | Restore | Additive restore mints a project id without inserting the project → dangling FK abort | Open |
| DATA-13 | High | Restore | Org restore silently adds matched live users to the target org as Viewer (cross-tenant) | Open |
| DATA-14 | High | Backup | Org backup pulls rules by member `userId` → drops org/admin-default rules (`userId` null) | Needs manual confirmation |
| DATA-15 | High | Races | `checkLimit`/`recordUsage` TOCTOU lets concurrent requests exceed hard caps | Open |
| DATA-16 | High | Schema/FK | Project delete `SetNull`s `projectId` but leaves PUBLISHED diagrams as invisible orphans | Open |
| DATA-17 | Medium | Races | Monthly counter reset on renewal races concurrent usage / nukes unrelated counters | Open |
| DATA-18 | Medium | Multi-tenant | `restoreDiagram` trusts archived `userId`, never re-validates org membership | Open |
| DATA-19 | Medium | Backup | Per-user backup captures cross-org prompts but restore dedups them into one org → loss | Open |
| DATA-20 | Medium | Email | `sendMail` failures unhandled → DB may record an invite/notification as delivered | Needs manual confirmation |
| DATA-21 | Medium | Restore | `shortCuid()` (Math.random + Date.now) can collide mid-restore → duplicate-PK abort/mis-parent | Open |
| DATA-22 | Medium | Transactions | `restoreRulesPrefsBundle` upserts in a bare loop, no transaction → partial merge | Open |
| DATA-23 | Medium | Restore | Rules upsert keyed only by `id` violates `@@unique([category,userId,orgId])` → abort | Open |
| DATA-24 | Low | Architecture | Two independent connection pools (Prisma adapter + raw `pgPool`) can't share a transaction | Open |

---

## Stage 1 — Security & Access Control

**Scope:** all 104 `app/api/**/route.ts`, `auth.ts`, `auth.config.ts`, `proxy.ts`, `app/lib/auth/orgContext.ts`, `app/lib/superuser.ts`.
**Method:** 5 finder lenses (authz/IDOR, injection/validation, impersonation/elevation, secrets leak, auth flow) → 25 raw findings → 19 after dedupe → each adversarially verified by 2 independent skeptics reading the real code. **18 confirmed, 1 refuted.** No Critical findings.

> Note on severity: several findings are rated High because Diagramatix targets multi-member enterprise/CPS 230 tenants. In the single-user default org created at registration, the within-org IDOR and elevation findings (SEC-01, SEC-07) are not exploitable — they require a second member in the same org.

### High

#### SEC-01 — VIEW-share recipient can delete an entire project
**`app/api/projects/[id]/route.ts:193`** (also `:203`/`:205` default branch)

The DELETE handler establishes only a `requireProjectAccess(..., 'view')` floor (line 166), which any VIEW `ProjectShare` recipient passes. Both non-owner destructive branches — `?cascade=archive` (line 193) and the default hard-delete (line 205) — then authorise with `requireRole(session, cookies, ['Owner','Admin'])`. But `requireRole` resolves the role against the **caller's active org** via `getCurrentOrgId` (`orgContext.ts:99`), *not* the project's org (`access.projectOrgId`). Every user is `Owner` of their own auto-created personal org, so `requireRole(['Owner','Admin'])` succeeds for any signed-in user by default. Net effect: a user holding only a VIEW share can call `DELETE /api/projects/[id]` and permanently delete the project and archive/orphan every diagram in it — data loss reachable from the lowest-privilege grant. The `hardDelete` branch correctly gates on `isProjectOwner` (line 181), confirming the other two branches' use of org-agnostic `requireRole` is the defect.

**Suggested fix:** authorise the OrgAdmin tiers against the project's org, not the caller's active org — use the existing `requireOrgAdminFor(session, await cookies(), access.projectOrgId)` primitive (`orgContext.ts:127`) in both branches.

#### SEC-02 — Empty `ADMIN_PASSWORD` lets any user edit/delete global built-in templates
**`app/api/templates/[id]/route.ts:76`** (also `:164` DELETE, `app/api/templates/route.ts:80` POST)

The elevation guard is `if ((!userEmail || !SUPERUSER_EMAILS.has(userEmail)) && adminPassword !== ADMIN_PASSWORD)`, with `ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""`. The comment claims an empty value "disables the elevation path" — it does the opposite. When `ADMIN_PASSWORD` is unset, a non-superuser sending `{"adminPassword":""}` makes `"" !== ""` false, so the whole AND is false and the guard is skipped. Built-in template UPDATE/DELETE have no `userId` filter, so any logged-in user can tamper with or wipe every global built-in template. **Verified exploitable in the current deployment:** the live `dgx-prod-app` has no `ADMIN_PASSWORD` app setting and local `.env` lacks it too, so it defaults to `""` and fails open.

**Suggested fix:** treat an empty secret as *elevation-disabled*: `const pwOk = ADMIN_PASSWORD.length > 0 && typeof adminPassword === 'string' && adminPassword.length === ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(adminPassword), Buffer.from(ADMIN_PASSWORD));` then `if ((!userEmail || !SUPERUSER_EMAILS.has(userEmail)) && !pwOk) return 403;`. Apply to all three call sites.

#### SEC-03 — OrgAdmin backup leaks every member's password hash, reset token, Stripe IDs
**`app/lib/org-backup.ts:118`** (fetch at `:77`)

`buildOrgBackup()` fetches full `User` rows with no field selection and serialises them verbatim into the `.diag-full` zip. The `User` model includes `password` (bcrypt hash), `resetToken`, `resetTokenExpiry`, `stripeCustomerId`, `stripeSubscriptionId`. `GET /api/org-admin/backup` is authorised for any **OrgAdmin** (Owner/Admin of the active org — the customer-grantable orange role, not SuperAdmin). An OrgAdmin can download the backup and obtain (a) every member's bcrypt hash for offline cracking and (b) any member's still-valid plaintext `resetToken`, then visit `/reset-password?token=<token>` to take over the account. These columns are unnecessary for restore — `restoreOrgBackupAdditive` re-parents users by email.

**Suggested fix:** strip sensitive columns before serialising: `const safeUsers = users.map(({ password, resetToken, resetTokenExpiry, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, ...rest }) => rest);` then `User: serialise(safeUsers)`.

#### SEC-04 — No email verification on register enables account pre-hijacking via Entra auto-link
**`app/api/register/route.ts:17`** + Entra `signIn` callback **`auth.ts:84-107`**

Registration creates a fully usable credentials account for any email with zero ownership verification (no confirmation email), and grants `Owner` org role at register time. Separately, the Entra `signIn` callback links an SSO login to a pre-existing local `User` row purely by matching email (`user.id = existing.id`, line 104). Exploit: an attacker registers a local password account for `victim@company.com` before the victim first signs in; when the victim later uses "Sign in with Microsoft", the callback binds the SSO identity to the attacker's row, and the attacker's known password still authenticates against the same record — persistent account co-occupation. There is no `emailVerified` field on the `User` model to gate on.

**Suggested fix:** issue a signed verification token on register and gate login (or data access) on a verified flag; only auto-link SSO to an already-verified local row; don't grant `Owner` until verified.

#### SEC-05 — Microsoft Graph access token leaked to the client via the session object
**`auth.ts:189`**

The `session()` callback copies the raw Graph token onto the session: `(session as any).msAccessToken = token.msAccessToken`. Auth.js serialises the session callback's return value and serves it to any authenticated browser via `GET /api/auth/session` and `useSession()`. The token carries `Files.ReadWrite.All` + `Sites.Read.All` scopes (`auth.ts:68`), so any XSS, malicious extension, or shared-machine attacker reading the session JSON gets a live OneDrive/SharePoint read/write bearer token. The only legitimate consumer (`app/api/sharepoint/route.ts`) reads it server-side from `auth()`, which still works from the JWT — it never needs to be in the client-facing session.

**Suggested fix:** replace lines 188-189 with an exposure-free boolean `(session as any).hasMicrosoft = !!token.msAccessToken;` and have the SharePoint route read the token from the decoded JWT server-side.

#### SEC-06 — No rate limiting / lockout on login, register, or password reset
**`auth.ts:39`** (and `/api/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`)

The credentials `authorize()` and the three auth routes have no rate limiting, lockout, or CAPTCHA, and `proxy.ts` matches only `/dashboard` and `/diagram` (not the auth endpoints). An attacker can run unlimited online password-guessing / credential-stuffing against any known email; `register` additionally returns a distinct 409 "Email already registered" enumeration oracle. The bcrypt cost only slows each attempt, not the volume. (Sub-claim about brute-forcing reset *tokens* is not practical — they're 256-bit — but the credential-guessing surface is real.)

**Suggested fix:** per-IP and per-account rate limiting / exponential backoff in front of `authorize` and the three routes (token bucket or WAF/edge rule), plus temporary lockout after N failures; consider CAPTCHA on register and forgot-password.

#### SEC-07 — Visio export endpoints authorise by Org membership, not project access (within-org IDOR)
**`app/api/export/visio-v3/route.ts:37`** (also `visio-v2/route.ts:35`, `sharepoint/test-vsdx/route.ts:33`)

These export routes resolve the diagram with `prisma.diagram.findFirst({ where: { id: diagramId, orgId } })`, where `orgId` is the *caller's* active org. This grants access to any diagram that merely lives in the same org, bypassing the project-based access model every other diagram route enforces via `requireDiagramAccess` (which grants only owners, ProjectShare holders, admin-elevated users, and bundle grantees). In a multi-member org, a member can export the full content of another member's **unshared** diagram just by knowing its id. (The bulk route additionally scopes by `userId`, so it is *not* affected.)

**Suggested fix:** replace the org-scoped lookup with `requireDiagramAccess(session, await cookies(), diagramId, 'view')` (catching `OrgContextError`) + `findUnique`, identical to the canonical read path. Apply to all three routes.

### Medium

#### SEC-08 — User search leaks every user's name + email across all tenants
**`app/api/users/search/route.ts:51`**

`GET /api/users/search` runs `prisma.user.findMany` over the entire user table filtered only by a substring match on email/name, with no org scoping — gated only by `auth()`. Any authenticated user can enumerate all registered users across all tenants by iterating short prefixes (q ≥ 1, 20 rows/page) and harvest emails — a phishing/enumeration aid. Contrast `share-candidates/route.ts`, which restricts the pool to org members unless `allowCrossOrgSharing` is set.

**Suggested fix:** scope to the caller's org membership and only widen when `allowCrossOrgSharing` is set; or, if group invites need cross-org reach, fall back to **exact-email match** (no substring enumeration).

#### SEC-09 — Raw Postgres/internal error text returned to clients
**`app/api/templates/route.ts:53`** (and many others: `:102`, `backup/route.ts:57/106`, `org-admin/backup`, `admin/full-backup`, `bundles/route.ts:297`, `diagrams/[id]`, `projects/[id]`, …)

Many handlers return the caught error's raw message straight to the client in a 500/400 body. Raw Postgres/Prisma errors disclose table/column/constraint names and SQL fragments, helping an attacker map the schema. The templates and bundles routes are reachable by ordinary authenticated users. `support/diagram/route.ts:98-101` already does the right thing (generic message + server-side log).

**Suggested fix:** return a generic client message and `console.error` the detail, e.g. `return NextResponse.json({ error: 'Failed to save template' }, { status: 500 })`. Continue to surface intentional `OrgContextError.message`. (`admin/database` is a superuser-only SQL console where raw errors are by-design.)

#### SEC-10 — No size/zip-bomb limit on backup-restore upload
**`app/api/backup/route.ts:93`** (also `import/visio-v3`, `admin/full-backup`)

POST `/api/backup` reads the upload with `file.arrayBuffer()` (no size check), then `restoreUserBackup` calls `JSZip.loadAsync(bytes)` and `entry.async("string")`, fully decompressing into memory. A few-KB DEFLATE zip bomb expands to GBs; any authenticated write-role user can OOM/stall the single shared App Service instance (B1, ~1.75 GB RAM), affecting all tenants. App Router route handlers impose no default body-size cap.

**Suggested fix:** reject if `file.size` exceeds a hard cap (e.g. 25 MB) before reading; after unzip, cap cumulative uncompressed bytes and entry count, aborting past a threshold.

#### SEC-11 — No password strength/length check on registration
**`app/api/register/route.ts:10`**

`register` validates only `if (!email || !password)` then bcrypt-hashes whatever was sent — a 1-character password is accepted server-side. By contrast `reset-password` enforces ≥ 8 and `account` password-change enforces ≥ 6, so the primary account-creation path is the weakest. The client form's `minLength={8}` is trivially bypassed by calling the API directly.

**Suggested fix:** add a single shared password-policy check (min length 8, `typeof === 'string'`) called from register, reset-password, and account password-change.

#### SEC-12 — Login `authorize()` skips bcrypt when user missing (timing enumeration)
**`auth.ts:46`**

A non-existent email returns `null` immediately (cheap DB lookup), whereas an existing email always runs the deliberately-slow `bcrypt.compare`. The measurable timing difference distinguishes registered from unregistered emails. (Marginal value is reduced by the register 409 oracle in SEC-06, but the login surface itself leaks.)

**Suggested fix:** always compare against a fixed dummy hash when the user is missing — `await bcrypt.compare(password, user?.password || DUMMY_HASH)` — then branch on existence + match so both paths take comparable time.

#### SEC-13 — Archived-diagram delete/restore skip the read-only impersonation guard
**`app/api/diagrams/deleted/route.ts:57`** (DELETE) and **`:85`** (POST restore)

Both handlers resolve the acting user with `getEffectiveUserId` (so they operate on the impersonated target's data) but never call `isReadOnlyImpersonation` — the file doesn't even import it. Every sibling write route does. Consequence: a SuperAdmin in a VIEW (read-only) impersonation session can permanently delete or restore another user's archived diagrams — a destructive write read-only mode is meant to forbid. (Limited to the two hardcoded superuser accounts, hence Medium.)

**Suggested fix:** add the standard guard at the top of both handlers: `if (isReadOnlyImpersonation(session, await cookies())) return NextResponse.json({ error: 'Read-only: viewing another user' }, { status: 403 });`.

#### SEC-14 — `scan-links` POST mutates diagram JSON without the read-only guard
**`app/api/projects/[id]/scan-links/route.ts:273`**

The POST handler rewrites every BPMN diagram's `data` JSON via raw pg UPDATE (and an unconditional project-wide normalize pass that runs even on an empty body), gated only by `requireProjectAccess(..., 'edit')` using `getEffectiveUserId`. It never calls `isReadOnlyImpersonation`, so a read-only impersonation session can silently rewrite the target's link graph and strip return-link symbols. This is the sole unguarded project write path.

**Suggested fix:** add the `isReadOnlyImpersonation` guard at the start of POST, mirroring the other write routes.

### Low

#### SEC-15 — `?from=` open-redirect accepts protocol-relative URLs
**`app/(dashboard)/dashboard/admin/AdminClient.tsx:91`** (also `AdminSharingClient.tsx:73`, `OrgSettingsClient.tsx:224`, `BubbleHelpClient.tsx:32`, `notifications/page.tsx:26`, `diagram/[id]/page.tsx:41`)

The back-link guard only checks `rawFrom.startsWith('/')`. A value like `//evil.com/x` passes but is a protocol-relative URL, so clicking Back navigates off-site (phishing). For `<a href>` cases the browser navigates directly; for `router.push` cases Next.js resolves the cross-origin target and hard-navigates.

**Suggested fix:** reject protocol-relative and scheme URLs in a shared helper: `const safe = rawFrom && rawFrom.startsWith('/') && !rawFrom.startsWith('//') && !rawFrom.startsWith('/\\') ? rawFrom : null;`. Use `isSafeInternalPath()` in all sites.

#### SEC-16 — Password reset token stored in plaintext at rest
**`app/api/auth/forgot-password/route.ts:29`**

The 32-byte token is written unhashed to `User.resetToken` and looked up by direct equality. Any read of the User table (DB dump, backup, or the OrgAdmin export in SEC-03) yields a directly-usable reset token. The 1-hour expiry and post-use clearing narrow the window but don't eliminate it.

**Suggested fix:** store only `sha256(raw)` in `resetToken`, email the raw token, and hash the incoming token on verify. This also defangs the backup-leak path.

#### SEC-17 — Impersonation identity/mode in unsigned, non-httpOnly cookies
**`app/api/admin/impersonate/route.ts:59`** (also `:56`, `:62`)

`dgx_view_as` (target) and `dgx_view_as_mode` (privilege) are set `httpOnly:false` with no integrity protection, and the server trusts them verbatim for any superuser session. XSS in a SuperAdmin's browser could rewrite the target to an arbitrary victim and flip mode to `edit`. Marginal impact is limited (same-origin script could also just POST the impersonate endpoint), and the mode cookie is already coerced to `view` for any non-`edit` value — so the substantive gaps are the **unsigned identity cookie** and the **absence of any server-side audit log** of impersonation start.

**Suggested fix:** keep the authoritative target/mode in an httpOnly, signed/encrypted cookie (or JWT claim); expose only a non-sensitive boolean for the banner. Stamp an audit row (actor, target, mode, timestamp) when impersonation starts.

#### SEC-18 — OrgAdmin impersonation is a server-side no-op (misleading UI)
**`app/lib/superuser.ts:34`**

`getViewAsUserId` returns null unless `isSuperuser(session)`, but `impersonate/route.ts` lets an OrgAdmin set the impersonation cookies for an in-org target. For a non-superuser those cookies are ignored by every server helper — fail-closed (no cross-tenant exposure today), but a correctness gap and a latent escalation if `getViewAsUserId` is ever broadened to honour OrgAdmins (the only gate would then be the one-time org check on a long-lived, client-writable cookie). Note: OrgAdmin "support edits" actually land via the separate silent-elevation path (`isAdminElevatedForOrg`), and because `isReadOnlyImpersonation` never engages for them, their "View" mode is not actually read-only.

**Suggested fix:** make it explicit — either remove the OrgAdmin branch from the impersonate POST (return "not supported"), or implement it properly by extending `getViewAsUserId` to re-verify on every request that the caller is Owner/Admin of an org the target belongs to.

---

## Stage 2 — Data Integrity & Server Libs

**Scope:** `app/lib/` data layer — `backup.ts`, `full-backup.ts`, `org-backup.ts`, `rules-prefs-backup.ts`, `bundleInvites.ts`, `notifications.ts`, `notificationDisplay.ts`, `email.ts`, `subscription.ts`, `subscription-route.ts`, `stripe.ts`, `archive.ts`, `reviewProjects.ts`, `db.ts` — plus `prisma/schema.prisma`.
**Method:** 5 finder lenses (transaction boundaries, race conditions, FK/cascade hazards, restore id-remap, JSON-write + email integrity) → 47 raw findings → 33 after dedupe → each adversarially verified by 2 independent skeptics. **24 surviving findings after consolidating cross-lens duplicates** (8 outright refuted). Four are marked *Needs manual confirmation* (the two skeptics split). The Prisma-7 raw-pg JSON-write pattern and intentional `as any` casts were excluded as project convention; the SEC-03 org-backup secrets leak was excluded to avoid double-counting.

> The headline risk this stage surfaced is **the full-backup "disaster recovery" path is itself a disaster**: the wipe-restore truncates ~15 tables it never re-inserts (DATA-02) and aborts outright on any published diagram (DATA-03). A real production DB cannot currently be restored from its own full backup. These should be treated as fix-before-relying-on-backups.

### Critical

#### DATA-01 — User delete throws (Restrict FK) for anyone who ever published — and orphans can't be removed
**`app/api/admin/users/[id]/route.ts:97`** (schema FKs at `prisma/schema.prisma:339, 423, 470, 494`)

`prisma.user.delete()` relies on cascade, but four `User` relations are `onDelete: Restrict`, not `Cascade`: `PublishedVersion.publishedById`, `PublicationBundle.publishedById`, `PublicationBundleAudience.addedById`, `PendingBundleAudience.invitedById`. Postgres aborts the DELETE on any Restrict FK, so **any user who has ever published a version or bundle (i.e. essentially every active designer) cannot be deleted at all** — the endpoint 500s with an FK violation. The route's cascade doc lists only the Cascade relations and is unaware of the Restrict ones, and the UI offers no way to reassign `publishedById` first.

**Suggested fix:** decide the intended semantics. If published artifacts should survive author deletion, make these author FKs nullable with `onDelete: SetNull` (mirroring `DiagramFeedback.resolvedById`); if they should die with the user, switch to `onDelete: Cascade`. Then `db push` and update the route doc. Until then, pre-reassign/null those columns in the delete path, or catch the FK error and return a 409 explaining why.

#### DATA-02 — Full-backup wipe-restore TRUNCATEs ~15 tables it never re-inserts → permanent data loss
**`app/lib/full-backup.ts:42`**

`FULL_BACKUP_TABLE_ORDER` and `buildFullBackup` capture only 11 models (Org, SubscriptionLevel, User, UsageCounter, OrgMember, Project, Diagram, DiagramHistory, DiagramTemplate, Prompt, DiagramRules). But `restoreFullBackupWipe()` runs `TRUNCATE ... RESTART IDENTITY CASCADE`, and CASCADE physically deletes every dependent row — including all rows of models never captured: `PublishedVersion`, `DiagramFeedback`, `PublicationBundle(/Diagram/Audience)`, `PendingBundleAudience`, `ProjectShare`, `Notification`, `CollaborationGroup(/Member)`, `DiagramReview(/Reviewer)`, `OwnershipTransfer`, `Feature`, `BubbleHelp`. The restore loop re-inserts only the 11 captured tables, so after a "DR" wipe-and-reload every published version, bundle/audience grant, share, review, feedback, notification, and feature/bubble-help row is **gone forever** — and it all commits in one transaction, so it "succeeds" silently.

**Suggested fix:** either extend the backup to capture and re-insert *all* models (correct for a true DR tool), or refuse to TRUNCATE tables not represented in the backup. At minimum, before TRUNCATE assert the live DB has zero rows in the uncaptured tables and abort with a clear error otherwise, so a partial backup can never nuke live publish/bundle/review data.

#### DATA-03 — Wipe-restore re-inserts `Diagram.currentPublishedVersionId` but never backs up `PublishedVersion` → FK abort
**`app/lib/full-backup.ts:294`** (insert) / **`:259`** (transaction)

`Diagram.currentPublishedVersionId` is a non-null-when-published FK to `PublishedVersion`. `PublishedVersion` is neither truncated, captured, nor restored. On wipe restore, `diagram.createMany()` inserts diagrams carrying a populated `currentPublishedVersionId` that no longer exists post-TRUNCATE → FK violation. Because the whole restore is one transaction, **a single published diagram rolls back the entire restore** — a real production DB can never be loaded from its own full backup. (Confirmed by two lenses — restore-remap and fk-cascade — as the same defect.)

**Suggested fix:** the org-backup path already does this right (`org-backup.ts:279-283`): null out FKs that reference un-backed-up tables before insert (map `Diagram` rows to `currentPublishedVersionId = null`). Alternatively include `PublishedVersion` in the backup graph and insert it before patching the pointer (two-pass). Add a round-trip test using a published diagram.

### High

#### DATA-04 — Stripe webhook has no event-ordering guard → stale event resurrects canceled subscriptions
**`app/api/stripe/webhook/route.ts:147`** (apply at `:318`)

Stripe doesn't guarantee delivery order and retries interleave. `handleSubscriptionUpdated` / `applySubscriptionToUser` unconditionally overwrite `subscriptionLevelId` / `stripeSubscriptionStatus` / `subscriptionEndsAt` from whatever event is in hand. If `customer.subscription.deleted` is processed first and a stale `customer.subscription.updated` arrives afterward, the user is set back to `active` with `subscriptionEndsAt = null` — **re-granting a paid tier to someone who canceled** (and likewise a downgrade can overwrite a later upgrade). The "idempotent upsert" note addresses duplicates, not ordering.

**Suggested fix:** persist a monotonic marker (e.g. `User.stripeEventTs`) and skip writes when `event.created` is older; or re-retrieve the live subscription from Stripe inside the handler and apply that canonical state instead of the event payload.

#### DATA-05 — `archiveDiagram` read-modify-writes `data` across two pools → lost update clobbers concurrent saves
**`app/lib/archive.ts:80`** (read) → **`:103`** (write); same shape in `restoreDiagram` `:111-146`

`archiveDiagram` reads `diagram.data` via Prisma, mutates it in JS to inject the `_archive` blob, then writes the whole blob back via the **separate `pgPool` connection** — no row lock, no transaction spanning read and write, two different pools. A concurrent editor auto-save between the read and the write is silently overwritten (last-writer-wins on the entire JSON column). The reverse race leaves a diagram in the archive project with the user's freshly-saved content but no `_archive` metadata, so it can never be restored. (Found by both the transactions and races lenses; root cause is the two-pool design in DATA-24.)

**Suggested fix:** merge in the database with one statement — `UPDATE "Diagram" SET data = jsonb_set(data,'{_archive}',$1::jsonb), "userId"=$2, "projectId"=$3, "updatedAt"=NOW() WHERE id=$4` (restore uses `data - '_archive'`). If the JS merge must stay, do `SELECT ... FOR UPDATE` + UPDATE in one transaction on a single connection.

#### DATA-06 — `restoreUserBackup` runs dozens of writes with no transaction → partial restore
**`app/lib/backup.ts:276`**

The entire restore (project/diagram/unfiled-diagram/template/prompt creates, then two phase-2 raw-SQL passes) is a sequence of independent `prisma.create` / `$executeRawUnsafe` calls with **no surrounding `$transaction`**. Any mid-way throw (oversized JSON, connection drop, constraint error, aborted request) leaves every already-created row committed — a half-restored set with no clean undo. Re-running doubles the rows that landed (only prompts dedup; projects/diagrams/templates are purely additive and already suffixed " (restored)").

**Suggested fix:** wrap the whole body through both phase-2 passes in a single `prisma.$transaction(async (tx) => {...})`, routing every create and `$executeRawUnsafe` through `tx` (Prisma 7 interactive transactions expose `$executeRawUnsafe` on the tx client, so the raw JSON writes roll back together). Raise the tx timeout for large backups.

#### DATA-07 — Backup phase-2 JSON writes happen after all rows commit → crash leaves blank config + dangling links
**`app/lib/backup.ts:389`**

Projects are created in phase 1 with no `colorConfig`/`folderTree` (default `{}`); diagrams keep their original `data` with **old** `linkedDiagramId` values. The real `colorConfig`, remapped `folderTree`, and remapped subprocess `linkedDiagramId` are written only in the phase-2 raw-SQL loops. With no transaction binding the phases, a server kill/redeploy between them permanently leaves projects with blank config + empty folder tree and every restored subprocess link pointing at backup-era ids that don't exist in this org — a "successful-looking" restore with corrupted cross-references.

**Suggested fix:** fold phase 2 into the same transaction as phase 1 (DATA-06). Better, build the remapped `folderTree`/`colorConfig`/`data` *before* the create and write each row's final JSON in one statement, eliminating the separate-pass window.

#### DATA-08 — Subprocess link remap only walks `properties.linkedDiagramId` → misses other reference shapes *(Needs manual confirmation)*
**`app/lib/backup.ts:405`**

User restore mints new diagram ids and rewrites cross-diagram references by walking `data.elements[].properties.linkedDiagramId` only. Any diagram-id reference stored elsewhere in the JSON (on a connector, a different property key, or nested groups) is left pointing at the old id and dangles after restore. The doc comment promises subprocess links "can be rewritten", but the walk is shallow and key-specific. *(Skeptics split: the impact depends on whether any reference shape other than `properties.linkedDiagramId` actually exists in the schema — verify against `app/lib/diagram/types.ts`.)*

**Suggested fix:** enumerate every field that can hold a diagram id from `types.ts` (element `linkedDiagramId` plus any on connectors/groups) and remap all of them, or do a generic deep-walk rewriting any string equal to a known old diagram id. Add a test with a subprocess link on a connector.

#### DATA-09 — Bundle-invite promotion catch-all deletes the pending row on *any* error
**`app/lib/bundleInvites.ts:75`** (and the post-commit notification at `:68`)

In `promotePendingAudienceMemberships` the grant + pending-row delete run inside a `$transaction` (good), but the per-row `catch` treats **every** error as a benign unique-constraint collision and unconditionally deletes the `PendingBundleAudience` row. A transient error (connection blip, deadlock, statement timeout) during promotion therefore destroys the invite permanently: no grant now, and no future sign-in can ever re-promote it — the invitee is silently locked out. Separately, `createNotification` runs after the transaction commits and isn't independently guarded, so a notification failure re-enters the same catch. (Both bundleInvites findings are the same root bug.)

**Suggested fix:** only delete the pending row when the error is a real unique violation (`err.code === 'P2002'`); for any other error, log and leave the row in place so the next sign-in retries. Move `createNotification` into its own try/catch.

#### DATA-10 — Invite email Subject built from unescaped inviter/bundle name → header injection *(Needs manual confirmation)*
**`app/lib/email.ts:158`** (same shape in `sendSupportDiagramEmail` `:106`)

The Subject is `` `${inviterName ?? inviterEmail} invited you to view "${bundleName}"` ``. `inviterName` and `bundleName` are user-controlled and unsanitised. A CR/LF embedded in either could inject extra SMTP headers (Bcc smuggling / spoofing). `escapeHtml` protects only HTML bodies, not headers. *(Skeptics split: nodemailer generally rejects newlines in header values, so exploitability depends on transport/version — but relying on that is fragile.)*

**Suggested fix:** strip CR/LF/control chars from any user value used in a header — `headerSafe(s) => s.replace(/[\r\n\t]+/g,' ').slice(0,200)` — applied to `inviterName`, `bundleName`, `subject`, `diagramName`. Validate `replyTo` addresses before use.

#### DATA-11 — Additive full-restore matches users by bare email → re-parents data onto the wrong live user
**`app/lib/full-backup.ts:570`**

`restoreFullBackupAdditive` looks up live users by email alone and, on any match, attaches all the backup user's projects/diagrams/prompts to that live row — under a brand-new org owned by the unrelated live user. There's no confirmation the matched live user is the intended target. Restoring org A's backup into a DB where the same email belongs to a different account context silently re-homes data onto the wrong person.

**Suggested fix:** surface email matches to the admin for explicit confirmation (dry-run match list) before re-parenting, or key on email + a stable external identifier with per-user opt-in. At minimum, log each reused email with the live user id for auditability and document the global-email-identity assumption.

#### DATA-12 — Additive restore mints a project id without inserting the project → dangling FK abort
**`app/lib/full-backup.ts:661`**

A selected diagram's `projectId` is remapped via `projectIdMap.get(...)`, and `projectIdMap` is populated for every id in `projectSet` — but the Projects insert loop only creates rows that actually exist in `payload.tables.Project`. If the backup is internally inconsistent (diagram references a project filtered out by `scopePayloadToOrg` or an export bug), the map still returns a freshly-minted cuid while no Project row is inserted, so the diagram points at a project id that never existed → FK violation aborts the transaction.

**Suggested fix:** only add to `projectSet` / allocate `projectIdMap` entries for project ids that resolve to a real row (`if (d.projectId && projectsById.has(String(d.projectId)))`), so a missing project cleanly falls back to `projectId = null`.

#### DATA-13 — Org restore silently adds matched live users to the target org as Viewer (cross-tenant)
**`app/lib/org-backup.ts:248`**

`restoreOrgBackupAdditive` maps every backup user to a live user by email, then force-adds an `OrgMember(role: Viewer)` into `targetOrgId` for every mapped user. Because matching is by email across the whole live DB, an unrelated live user (same email, different org) can be added to the OrgAdmin's org without consent — cross-tenant membership injection. An OrgAdmin restoring a diagram owned by `alice@x.com` silently makes the live alice a Viewer of their org.

**Suggested fix:** only auto-add `OrgMember` rows for users newly created during this restore. For users matched to an existing live row, require they already belong to `targetOrgId`; otherwise skip the data or surface a warning rather than silently granting membership.

#### DATA-14 — Org backup pulls rules by member `userId` → drops org/admin-default rules *(Needs manual confirmation)*
**`app/lib/org-backup.ts:83`**

`buildOrgBackup` queries `DiagramRules` with `where: { userId: { in: memberUserIds } }`, but `DiagramRules.userId` is nullable — system/admin default rules have `userId = NULL` and are excluded by the `in` filter (and again by `scopePayloadToOrg`, where `has('null')` is false). The backup that claims to carry the org's AI rules silently omits the org-level defaults members actually use; a restore leaves the org with no rules. *(Skeptics split on whether org/admin defaults are in scope for an org-level backup — confirm intended semantics.)*

**Suggested fix:** scope `DiagramRules` by `orgId` (the org dimension of the `@@unique([category,userId,orgId])` key) rather than `userId` alone, handling `NULL userId` explicitly so default rule sets round-trip.

#### DATA-15 — `checkLimit`/`recordUsage` TOCTOU lets concurrent requests exceed hard caps
**`app/lib/subscription.ts:523`**

`checkLimit` reads usage and compares to the limit, then the route does the work and calls `recordUsage` afterward — two separate awaits. Two concurrent requests both read `current = limit-1`, both pass, both proceed. For point-in-time metrics (projects, diagrams-per-type, archimate totals) it's worse: there's no counter — the gate `count`s rows and the route then creates one, so N parallel create-project requests all see `count < max` and all create. A Free user can exceed every cap by firing parallel requests.

**Suggested fix:** for event metrics, increment the `UsageCounter` atomically first, then check the returned count and refund if over. For point-in-time metrics, enforce in the same transaction as the create (`SELECT ... FOR UPDATE` on a per-user lock row, or a DB-level cap constraint). At minimum serialize per-user create paths.

#### DATA-16 — Project delete `SetNull`s `projectId` but leaves PUBLISHED diagrams as invisible orphans
**`prisma/schema.prisma:270`**

`Project→Diagram` is `onDelete: SetNull` on `projectId`, while `PublicationBundle.project` is `onDelete: Cascade`. Deleting a Project hard-deletes its bundles (and `PublicationBundleDiagram` rows) but only nulls the diagrams' `projectId` — leaving published, audience-granted diagrams suddenly unfiled, with no bundle membership and no way for business users to reach them, yet still `lifecycle = PUBLISHED` with a live `currentPublishedVersionId`. They become invisible orphans rather than being archived or re-homed.

**Suggested fix:** on the project-delete path, before deleting, archive/re-home child diagrams or reset their lifecycle to DRAFT and clear `currentPublishedVersionId` + bundle memberships; or block project deletion while it still has PUBLISHED diagrams or active bundles.

### Medium

#### DATA-17 — Monthly counter reset on renewal races concurrent usage / nukes unrelated counters
**`app/api/stripe/webhook/route.ts:236`**

`handleInvoicePaymentSucceeded` `deleteMany`s all non-`all-time` `UsageCounter` rows for the user to reset monthly metrics. This is unsynchronized with `recordUsage` — a metered action at the same moment can lose a consumed unit, and the delete is keyed only on `periodKey != 'all-time'`, so it also wipes counters for unrelated billing anchors (e.g. always-monthly `bulk_*`).

**Suggested fix:** scope the delete to the specific period that just renewed (compute the prior `periodKey`), run it in a transaction, or rely on the period key rolling forward naturally (next period simply has no row yet, so an explicit delete may be unnecessary).

#### DATA-18 — `restoreDiagram` trusts archived `userId`, never re-validates org membership
**`app/lib/archive.ts:120`**

`restoreDiagram` restores ownership to `_archivedFromUserId` and verifies the user/project rows exist, but never checks the user is still a member of the diagram's `orgId`, nor that the target project's `orgId` matches. A diagram restored to a user who has since left the org ends up owned by a non-member — violating the multi-tenant boundary `orgId` is meant to enforce. The `folderId` from `diagramFolderMap` is likewise trusted even if the folder was since removed.

**Suggested fix:** re-derive `orgId` from the target project (or current membership) on restore and verify the user is an `OrgMember` of it before proceeding; validate the restored `folderId` still exists.

#### DATA-19 — Per-user backup captures cross-org prompts but restore dedups them into one org → silent loss
**`app/lib/backup.ts:159`**

`buildUserBackup` pulls every `Prompt` the user owns across all orgs (no `orgId` filter); `restoreUserBackup` re-creates them all into the single current org, dedup-keyed on `name|diagramType`. A user owning same-named prompts in two source orgs loses the second on restore. The backup carries no per-prompt `orgId` to disambiguate.

**Suggested fix:** restrict the backup to the org being backed up, or carry `orgId` per prompt and dedup per `(orgId, name, diagramType)`.

#### DATA-20 — `sendMail` failures unhandled → DB may record an invite/notification as delivered *(Needs manual confirmation)*
**`app/lib/email.ts:68`**

`sendBundleInvitationEmail` / `sendSupportDiagramEmail` `await transport.sendMail(...)` with no try/catch and no status return. If the calling route writes the `PendingBundleAudience` row and then the SMTP send rejects, a pending invite exists that was never emailed, with no retry path; a route that ignores the rejection reports success to the inviter. *(Skeptics split: depends on each caller's write/send ordering — verify at the call sites.)*

**Suggested fix:** have the send helpers surface a clear outcome and order the DB write vs. send (or add a compensating step / `unsent` flag) so a send failure never leaves the DB claiming delivery. Don't swallow the rejection.

#### DATA-21 — `shortCuid()` (Math.random + Date.now) can collide mid-restore → duplicate-PK abort / mis-parent
**`app/lib/full-backup.ts:499`** and **`app/lib/org-backup.ts:59`**

`shortCuid()` = `'c' + Date.now().toString(36) + 8 random base36 chars`, used to mint ids for every remapped Org/Project/Diagram/OrgMember/History/Template/Prompt in additive restores. Rows minted in the same millisecond share the time component, so entropy is effectively only 8 random chars; a birthday-paradox collision within one batch produces a duplicate-PK insert that aborts the whole transaction (or, if two child rows collide, a wrong re-parent). The helper is also copy-pasted across two files. (Three findings across the two files consolidated.)

**Suggested fix:** use the same collision-resistant generator Prisma uses for `@default(cuid())` (`createId` from `@paralleldrive/cuid2`) and dedupe the helper into one shared module.

#### DATA-22 — `restoreRulesPrefsBundle` upserts in a bare loop, no transaction → partial merge
**`app/lib/rules-prefs-backup.ts:126`**

The rules and prompts loops issue per-row find+update/create with no enclosing `$transaction`. A mid-batch failure (a JSON `planJson` cast rejected, a connection drop) leaves some rows merged and others not, and the function throws with no result object, so the caller can't tell how far it got. Idempotent on re-run, but a robustness gap for a cross-environment migration tool.

**Suggested fix:** wrap both loops in one interactive `$transaction` (all-or-nothing), or catch per-row errors into `skippedReasons` and continue so the function always returns a complete result.

#### DATA-23 — Rules upsert keyed only by `id` violates `@@unique([category,userId,orgId])` → abort
**`app/lib/rules-prefs-backup.ts:142`**

`restoreRulesPrefsBundle` upserts `DiagramRules` by `id` only. When migrating local-dev rules into prod (the stated use case), a prod row may already exist with the same `(category, userId, orgId)` tuple but a different `id`; the incoming row has no id match, takes the create branch, and Prisma throws a unique-constraint violation. System-wide rules (`userId`/`orgId` null) are especially prone since only one per category can exist.

**Suggested fix:** before create, look up by `{ category, userId, orgId }` and update that row (keeping its id) if found; only insert when neither id nor the composite key matches. Or use `prisma.diagramRules.upsert` with the composite unique where-clause.

### Low

#### DATA-24 — Two independent connection pools can't share a transaction
**`app/lib/db.ts:24`**

`prisma` uses a `PrismaPg` adapter pool (max 10) and `pgPool` is a *second* independent `pg.Pool` (max 5) over the same `DATABASE_URL`. Any path mixing a Prisma write with a `pgPool` write operates on two connections that cannot participate in one transaction — the structural root of DATA-05, and a limiter on making the backup/restore JSON writes atomic. It also doubles the connection budget against the DB.

**Suggested fix:** prefer `prisma.$executeRaw(Unsafe)` for raw SQL so it shares the adapter pool and can run inside `prisma.$transaction` (as `backup.ts` phase 2 already does). Reserve the standalone `pgPool` for genuinely standalone reads; where a raw write + model write must be atomic, run both via `tx.$executeRaw` / `tx.*` inside one transaction.

---
