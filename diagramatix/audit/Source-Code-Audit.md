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
| 2 | Data Integrity & Server Libs | Pending |
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
