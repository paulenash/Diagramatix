# Diagramatix — Source Code Audit

| | |
|---|---|
| **Audit started** | 2026-06-13 |
| **Commit audited** | `bbc8716` (Stages 1–3) |
| **Re-audited** | 2026-06-26 — Stages 1–3 re-verified against current code (4 findings now fixed, 4 changed, 41 still stand) + Stages 4–7 completed. New findings folded in below. |
| **Remediation** | **36 of ~103 fixed** (as of 2026-06-26): 6 pre-existing (DATA-01/02/03, ENG-01/02/03) + 4 re-audit interim (DATA-06/07/22/23) + Wave 1 (8) + Wave 2 (12) + urgent batch (6: SEC-02/04/06/11/12, IO-01). ~67 open. ⚠️ Stripe fixes DATA-04/17/31 await Stripe **test-mode** verification; per-table restore (DATA-27/28) warrants a sandbox re-test. |
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
| 3 | Diagram Engine Core | ✅ Done — 13 findings (1 Critical, 2 High, 5 Medium, 5 Low); Critical + both High fixed v1.20 |
| 4 | Canvas & Renderers | ✅ Done — 9 findings (5 High, 1 Medium, 3 Low) |
| 5 | Dashboard & Page Clients | ✅ Done — 9 findings (4 High, 4 Medium, 1 Low); 6 are `?from=` open-redirects folded into SEC-15 |
| 6 | Import/Export & Interop | ✅ Done — 13 findings (4 High, 6 Medium, 3 Low); 3 Visio-export IDORs fold into SEC-07 |
| 7 | Build, Config & Dependencies | ✅ Done — 14 findings (3 High, 5 Medium, 6 Low); the 1 "Critical" (.env secrets) **downgraded** — `.env` is gitignored/never committed; Graph-token folds into SEC-05 |

**Re-audit of Stages 1–3 (2026-06-26)** — every still-open finding was re-checked against current code. **Now fixed by interim work:** DATA-06, DATA-07, DATA-22, DATA-23. **Changed (still open, code moved):** SEC-03, DATA-08, DATA-20, ENG-07. The fresh-finder pass also re-confirmed many open findings (Visio IDOR↔SEC-07, Graph token↔SEC-05, `?from=`↔SEC-15, Stripe races↔DATA-04/15/17, lane recursion↔ENG-04, swapLane cap↔ENG-10, ancestor O(n²)↔ENG-12) and surfaced genuinely new ones (SEC-19/20/21, DATA-25…31, ENG-14…19) — all listed below.

---

## Findings summary

| ID | Severity | Area | Title | Status |
|---|---|---|---|---|
| SEC-01 | High | Access control | VIEW-share recipient can delete an entire project (wrong-org OrgAdmin check) | Open |
| SEC-02 | High | Access control | Empty `ADMIN_PASSWORD` lets any user edit/delete global built-in templates | ✅ Fixed (urgent batch) |
| SEC-03 | High | Secrets | OrgAdmin backup leaks every member's password hash, reset token, Stripe IDs | Open (re-audit: code restructured, leak intact) |
| SEC-04 | High | Auth flow | No email verification on register → account pre-hijacking via Entra auto-link | ✅ Fixed (urgent batch — SSO-link disables pw) |
| SEC-05 | High | Secrets | Microsoft Graph access token leaked to the client via the session object | ✅ Fixed (Wave 1) |
| SEC-06 | High | Auth flow | No rate limiting / lockout on login, register, or password reset | ✅ Fixed (urgent batch) |
| SEC-07 | High | IDOR | Visio export endpoints authorise by Org membership, not project access | ✅ Fixed (Wave 1) |
| SEC-08 | Medium | Privacy | User search leaks every user's name + email across all tenants | Open |
| SEC-09 | Medium | Info leak | Raw Postgres/internal error text returned to clients | Open |
| SEC-10 | Medium | DoS | No size/zip-bomb limit on backup-restore upload | Open |
| SEC-11 | Medium | Auth flow | No password strength/length check on registration | ✅ Fixed (urgent batch) |
| SEC-12 | Medium | Auth flow | Login `authorize()` skips bcrypt when user missing (timing enumeration) | ✅ Fixed (urgent batch) |
| SEC-13 | Medium | Impersonation | Archived-diagram delete/restore skip the read-only impersonation guard | Open |
| SEC-14 | Medium | Impersonation | `scan-links` POST mutates diagram JSON without the read-only guard | Open |
| SEC-15 | Low | Open redirect | `?from=` `startsWith('/')` accepts protocol-relative URLs | ✅ Fixed (Wave 1) |
| SEC-16 | Low | Secrets | Password reset token stored in plaintext at rest | Open |
| SEC-17 | Low | Impersonation | Impersonation identity/mode in unsigned, non-httpOnly cookies | Open |
| SEC-18 | Low | Correctness | OrgAdmin impersonation is a server-side no-op (misleading UI) | Open |
| DATA-01 | Critical | Schema/FK | User delete throws (Restrict FK) for anyone who ever published — undeletable | ✅ Fixed v1.19 |
| DATA-02 | Critical | Backup | Full-backup wipe-restore TRUNCATEs ~15 tables it never re-inserts → permanent loss | ✅ Fixed v1.19 |
| DATA-03 | Critical | Backup | Wipe-restore re-inserts `Diagram.currentPublishedVersionId` but never backs up `PublishedVersion` → FK abort | ✅ Fixed v1.19 |
| DATA-04 | High | Races | Stripe webhook has no event-ordering guard → stale event resurrects canceled subs | ✅ Fixed (Wave 2 — verify in Stripe test mode) |
| DATA-05 | High | Races | `archiveDiagram` read-modify-writes `data` across two pools → lost update clobbers saves | ✅ Fixed (Wave 2) |
| DATA-06 | High | Transactions | `restoreUserBackup` runs dozens of writes with no transaction → partial restore | ✅ Fixed (re-audit: now one `$transaction`) |
| DATA-07 | High | Transactions | Backup phase-2 JSON writes outside the row creates → crash leaves dangling links | ✅ Fixed (re-audit: folded into the transaction) |
| DATA-08 | High | Restore | Subprocess link remap only walks `properties.linkedDiagramId` → misses other refs | Changed (re-audit: remap moved to `backup.ts:497`; variant remains) |
| DATA-09 | High | Transactions | Bundle-invite promotion catch-all deletes the pending row on *any* error | Open |
| DATA-10 | High | Email | Invite email Subject built from unescaped inviter/bundle name → header injection | Needs manual confirmation |
| DATA-11 | High | Restore | Additive full-restore matches users by bare email → re-parents data onto wrong live user | ✅ Fixed (Wave 2 — audit log) |
| DATA-12 | High | Restore | Additive restore mints a project id without inserting the project → dangling FK abort | ✅ Fixed (Wave 2) |
| DATA-13 | High | Restore | Org restore silently adds matched live users to the target org as Viewer (cross-tenant) | ✅ Fixed (Wave 2) |
| DATA-14 | High | Backup | Org backup pulls rules by member `userId` → drops org/admin-default rules (`userId` null) | Needs manual confirmation |
| DATA-15 | High | Races | `checkLimit`/`recordUsage` TOCTOU lets concurrent requests exceed hard caps | Open |
| DATA-16 | High | Schema/FK | Project delete `SetNull`s `projectId` but leaves PUBLISHED diagrams as invisible orphans | ✅ Fixed (Wave 2) |
| DATA-17 | Medium | Races | Monthly counter reset on renewal races concurrent usage / nukes unrelated counters | ✅ Fixed (Wave 2 — verify in Stripe test mode) |
| DATA-18 | Medium | Multi-tenant | `restoreDiagram` trusts archived `userId`, never re-validates org membership | Open |
| DATA-19 | Medium | Backup | Per-user backup captures cross-org prompts but restore dedups them into one org → loss | Open |
| DATA-20 | Medium | Email | `sendMail` failures unhandled → DB may record an invite/notification as delivered | Changed (re-audit: partially remediated; `PendingBundleAudience` variant persists) |
| DATA-21 | Medium | Restore | `shortCuid()` (Math.random + Date.now) can collide mid-restore → duplicate-PK abort/mis-parent | Open |
| DATA-22 | Medium | Transactions | `restoreRulesPrefsBundle` upserts in a bare loop, no transaction → partial merge | ✅ Fixed (re-audit: both loops now one `$transaction`) |
| DATA-23 | Medium | Restore | Rules upsert keyed only by `id` violates `@@unique([category,userId,orgId])` → abort | ✅ Fixed (re-audit: now `findUnique(id) ?? findFirst(natural key)`) |
| DATA-24 | Low | Architecture | Two independent connection pools (Prisma adapter + raw `pgPool`) can't share a transaction | Open |
| ENG-01 | Critical | Undo/redo | Undo/redo wipes title, fonts, database, processOwner, parentDiagramIds → auto-saved data loss | ✅ Fixed v1.20 |
| ENG-02 | High | Reducer | `DELETE_ELEMENT` leaves dangling connectors on the deleted host's boundary events | ✅ Fixed v1.20 |
| ENG-03 | High | Undo/redo | Title/font/database setters mutate persisted state but don't invalidate the redo stack | ✅ Fixed v1.20 |
| ENG-04 | Medium | Reducer | `collectCascadeLanes` recurses with no visited guard → stack overflow on cyclic lane chain | ✅ Fixed (Wave 1) |
| ENG-05 | Medium | Space tools | `REMOVE_SPACE` leaves corner elements un-shifted in cross (both-axis) zones | Open |
| ENG-06 | Medium | Undo/redo | Interleaved second drag overwrites the pre-drag snapshot → first action lost from history | Open |
| ENG-07 | Medium | Geometry | `offsetAlongFromPoint`/`getOffsetAlong` divide by element w/h with no zero-guard → NaN offset | Open (re-audit: 0–1 clamp added but divisor still unguarded → NaN survives) |
| ENG-08 | Medium | Routing | Containment clamp can invert detour lines → route crosses through obstacle | Needs manual confirmation |
| ENG-09 | Low | Mutation | `SWAP_LANES_VERTICAL` reorders the connectors array → silent draw-order change | Open |
| ENG-10 | Low | Undo/redo | `swapLane` bypasses the 100-entry history cap | Open |
| ENG-11 | Low | Space tools | `INSERT_SPACE` pushes a history snapshot every mouse-move frame of a shift-drag | Open |
| ENG-12 | Low | Performance | `ancestorsOf` does a linear `find()` per hop → O(n²) obstacle setup per recompute | Open |
| ENG-13 | Low | Mutation | `consolidateWaypoints` returns its input array by reference for short paths (aliasing trap) | Open |
| SEC-19 | High | Secrets | Deepgram master API key returned to any authenticated client in the dictation-token fallback | ✅ Fixed (Wave 1) |
| SEC-20 | High | Impersonation | Archive (soft-delete) route ignores the read-only impersonation guard | Open |
| SEC-21 | Low | Impersonation | Prompt routes scope org to the impersonated user but key writes on the superuser's own id | Open |
| DATA-25 | High | Restore | Per-table restore NULLs live published diagrams' `currentPublishedVersionId` (deferred-FK nulled on UPDATE, best-effort relink) | ✅ Fixed (Wave 1) |
| DATA-26 | High | Transactions | New per-table restore runs all upserts + FK re-links with NO transaction → half-merged DB | ✅ Fixed (Wave 1) |
| DATA-27 | Medium | Restore | Per-table restore silently skips rows colliding on a non-PK unique key (regresses the DATA-23 fix) | ✅ Fixed (Wave 2) |
| DATA-28 | Medium | Restore | Per-table restore drops a Diagram row when nullable `diagramOwnerId` points to a non-restored user (should null it) | ✅ Fixed (Wave 2) |
| DATA-29 | Medium | Races | Wipe-restore data-loss guard runs its COUNT checks outside the TRUNCATE transaction (TOCTOU) | Open |
| DATA-30 | Low | Robustness | Per-table `inserted` count excludes updates; malformed payload → unguarded TypeError 500 | Open |
| DATA-31 | Low | Transactions | `getOrCreateStripeCustomer` creates a Stripe customer then persists its id separately → dangling/duplicate customers | ✅ Fixed (Wave 2 — verify in Stripe test mode) |
| ENG-14 | Medium | Undo/redo | `updateLabelLive` mutates persisted label+geometry after an undo without invalidating the redo branch | Needs manual confirmation |
| ENG-15 | Low | Undo/redo | `correctAllConnectors` rewrites persisted waypoints without `pushHistory`/`invalidateRedo` | Open |
| ENG-16 | Low | Routing | Rectilinear waypoint-preservation uses a different obstacle set than the main pass (data-object flip-flop) | Open |
| ENG-17 | Low | Performance | `recomputeAllConnectors([conn])` rebuilds the full element Map per connector, per drag frame | Open |
| ENG-18 | Low | Performance | `ensureContainersEncloseChildren` recomputes ancestor depth inside the sort comparator (O(n²log n)) | Open |
| ENG-19 | Low | Performance | `getAllDescendantIds` O(subtree×n) per column inside the vswimlane drag frame | Open |
| CANVAS-01 | High | XSS | `RichTextEditor` assigns stored `description` to `innerHTML` on init without `sanitizeRichText` (stored XSS) | ✅ Fixed (Wave 1) |
| CANVAS-02 | High | Performance | O(n²) connector-hump computation rebuilt every render (`indexOf` + slice/map per connector) | Open |
| CANVAS-03 | High | Performance | `nonContainers` sort O(n²log n): comparator calls `elements.find()` in a parent-walk | Open |
| CANVAS-04 | High | Performance | Domain-diagram obstacle check O(connectors×elements×waypoints), unmemoised, every render | Open |
| CANVAS-05 | High | Performance | `SymbolRenderer`/`ConnectorRenderer` unmemoised + fresh inline closures → full re-render every pan/zoom frame | Open |
| CANVAS-06 | Medium | Performance | Connector-drop highlight O(n²) via `getElementPoolId` linear find per element | Open |
| CANVAS-07 | Low | Listener leak | Pre-drag gesture listeners never cleaned up on unmount | Open |
| CANVAS-08 | Low | Listener leak | Connector-label focus-clear listener leaks if unmounted before next mousedown | Open |
| CANVAS-09 | Low | Robustness | Group-drag auto-scroll `setInterval` cleared only on mouseup, not unmount | Open |
| UI-01 | High | Data loss | Ctrl+S calls a stale `saveNow()` closure → silently overwrites edits with `initialData` | ✅ Fixed (Wave 2) |
| UI-02 | High | Data loss | Previewing a history snapshot auto-saves it over the live diagram | ✅ Fixed (Wave 2) |
| UI-03 | Medium | Data loss | Folder-tree changes lost on navigation (module-level 500 ms debounce, no flush) | Open |
| IO-01 | High | DoS | No upload size limit before `.vsdx` is fully decompressed in memory (zip-bomb / OOM) | ✅ Fixed (urgent batch) |
| IO-02 | High | Data integrity | DDL importer drops FK relationships when table-name casing differs between definition and reference | Open |
| IO-03 | Medium | DoS | Unbounded recursion on nested sub-processes / lane sets (no depth guard) | Needs manual confirmation |
| IO-04 | Medium | Performance | O(n²) element lookups via `ctx.elements.find` during BPMN flow/lane wiring | Open |
| IO-05 | Medium | Data integrity | BPMN importer discards sequence-flow condition expressions (writes literal `"true"`) | Open |
| IO-06 | Medium | Data integrity | BPMN importer leaves dangling `boundaryHostId` when the host has no `BPMNShape` | Needs manual confirmation |
| IO-07 | Medium | Header injection | Unsanitized diagram name interpolated into the `Content-Disposition` export header (v2/v3/test-vsdx) | Open |
| IO-08 | Low | Proto pollution | DDL parser writes attacker-controlled table names into a plain-object map key | Needs manual confirmation |
| IO-09 | Low | Data integrity | BPMN importer id minting uses `Math.random()` with no cross-mint collision guard | Open |
| IO-10 | Low | Data integrity | DDL enum detection case-sensitive on PK column `code` → enum tables imported as plain classes | Open |
| CFG-01 | Low | Secrets | Live secrets in local `.env` — gitignored/never committed; **rotate** + keep off shared/backup locations (downgraded from Critical) | Open |
| CFG-02 | High | Secrets | `AUTH_SECRET` is the literal placeholder in local `.env`; no code-side weak-secret guard | Open |
| CFG-03 | High | Hardening | No CSP / X-Frame-Options / HSTS / X-Content-Type-Options anywhere (no `headers()` block) | Open |
| CFG-04 | Medium | Config | No env-var validation; security-critical secrets read via non-null assertion only | Open |
| CFG-05 | Medium | Config | `proxy` matcher misses `(dashboard)` route-group URLs; auth depends on per-page `auth()` | Open |
| CFG-06 | Medium | Config | `/matrix` is publicly reachable despite a comment asserting route-group auth | Open |
| CFG-07 | Low | Hardening | `X-Powered-By: Next.js` header not disabled | Open |
| CFG-08 | Low | Dependencies | Unused PGlite packages remain in production `dependencies` | Open |
| CFG-09 | Low | Dependencies | Production auth depends on a pre-release (beta) of `next-auth` | Open |
| CFG-10 | Low | Robustness | Microsoft token refresh computes `NaN` expiry when `expires_in` is absent → refresh silently disabled | Open |

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
>
> **Update — all three Critical findings (DATA-01, DATA-02, DATA-03) were fixed in schema v1.19** (commit follows). The fix was verified with a real round-trip of the dev DB (197 diagrams, 345 history rows, 6 published versions, 3 bundles, 7 notifications): all 26 tables now capture + restore with zero count drift, and the 5 published-diagram pointers re-link without the FK abort. See each finding below for the fix detail.

### Critical

#### DATA-01 — User delete throws (Restrict FK) for anyone who ever published — and orphans can't be removed
**`app/api/admin/users/[id]/route.ts:97`** (schema FKs at `prisma/schema.prisma:339, 423, 470, 494`)

> **✅ Fixed in v1.19.** All four author/attribution FKs (`PublishedVersion.publishedById`, `PublicationBundle.publishedById`, `PublicationBundleAudience.addedById`, `PendingBundleAudience.invitedById`) are now nullable with `onDelete: SetNull` (verified in the DB catalog: all four report `delete_rule = SET NULL`). The published artifact survives the author's deletion with a null author slot; the delete no longer 500s. Ownership checks (`bundle.publishedById === userId`) and the `ProcessView`/bundle-page reads were updated to treat null as "former member".

`prisma.user.delete()` relies on cascade, but four `User` relations are `onDelete: Restrict`, not `Cascade`: `PublishedVersion.publishedById`, `PublicationBundle.publishedById`, `PublicationBundleAudience.addedById`, `PendingBundleAudience.invitedById`. Postgres aborts the DELETE on any Restrict FK, so **any user who has ever published a version or bundle (i.e. essentially every active designer) cannot be deleted at all** — the endpoint 500s with an FK violation. The route's cascade doc lists only the Cascade relations and is unaware of the Restrict ones, and the UI offers no way to reassign `publishedById` first.

**Suggested fix:** decide the intended semantics. If published artifacts should survive author deletion, make these author FKs nullable with `onDelete: SetNull` (mirroring `DiagramFeedback.resolvedById`); if they should die with the user, switch to `onDelete: Cascade`. Then `db push` and update the route doc. Until then, pre-reassign/null those columns in the delete path, or catch the FK error and return a 409 explaining why.

#### DATA-02 — Full-backup wipe-restore TRUNCATEs ~15 tables it never re-inserts → permanent data loss
**`app/lib/full-backup.ts:42`**

> **✅ Fixed in v1.19.** `buildFullBackup` and the restore now capture and re-insert **all 26 models** (was 11) — `FULL_BACKUP_TABLE_ORDER`, the payload `tables` type, the build `findMany`/counts/tables block, `DATE_FIELDS_BY_MODEL`, and the restore dispatch were all extended (ProjectShare, PublishedVersion, PublicationBundle/Diagram/Audience, PendingBundleAudience, DiagramFeedback, Feature, BubbleHelp, Notification, CollaborationGroup/Member, DiagramReview/Reviewer, OwnershipTransfer). A pre-TRUNCATE guard additionally refuses a wipe restore when an older/partial backup omits a model that holds live data, so a stale file can never silently nuke newer tables. Round-trip verified: the 7 notifications, 3 bundles, 9 bundle-diagrams, 3 audience grants, and 1 ownership-transfer row that previously vanished now restore with zero count drift.

`FULL_BACKUP_TABLE_ORDER` and `buildFullBackup` capture only 11 models (Org, SubscriptionLevel, User, UsageCounter, OrgMember, Project, Diagram, DiagramHistory, DiagramTemplate, Prompt, DiagramRules). But `restoreFullBackupWipe()` runs `TRUNCATE ... RESTART IDENTITY CASCADE`, and CASCADE physically deletes every dependent row — including all rows of models never captured: `PublishedVersion`, `DiagramFeedback`, `PublicationBundle(/Diagram/Audience)`, `PendingBundleAudience`, `ProjectShare`, `Notification`, `CollaborationGroup(/Member)`, `DiagramReview(/Reviewer)`, `OwnershipTransfer`, `Feature`, `BubbleHelp`. The restore loop re-inserts only the 11 captured tables, so after a "DR" wipe-and-reload every published version, bundle/audience grant, share, review, feedback, notification, and feature/bubble-help row is **gone forever** — and it all commits in one transaction, so it "succeeds" silently.

**Suggested fix:** either extend the backup to capture and re-insert *all* models (correct for a true DR tool), or refuse to TRUNCATE tables not represented in the backup. At minimum, before TRUNCATE assert the live DB has zero rows in the uncaptured tables and abort with a clear error otherwise, so a partial backup can never nuke live publish/bundle/review data.

#### DATA-03 — Wipe-restore re-inserts `Diagram.currentPublishedVersionId` but never backs up `PublishedVersion` → FK abort
**`app/lib/full-backup.ts:294`** (insert) / **`:259`** (transaction)

> **✅ Fixed in v1.19.** Two parts: (1) `PublishedVersion` is now captured/restored (DATA-02), and (2) the cyclic `Diagram↔PublishedVersion` FK is broken explicitly — diagrams insert with `currentPublishedVersionId = null`, the intended pointers are collected, and they are re-linked with `tx.diagram.update` after the `PublishedVersion` rows land. Also fixed a contributing bug: `Diagram.nextReviewDate` and `lastReviewDueNotifiedAt` were missing from `DATE_FIELDS_BY_MODEL`, so a published diagram passed ISO strings to a `DateTime` column. The additive-restore path strips the pointer too (it never carries versions). Round-trip verified: 5 published-diagram pointers re-linked, before=5/after=5, no FK abort.

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

> **✅ Fixed (re-audit 2026-06-26).** `restoreUserBackup` now wraps the entire additive restore (phase-1 creates + both phase-2 raw-SQL passes) in one interactive `prisma.$transaction(async (tx) => {…}, { timeout: 120_000, maxWait: 15_000 })` — every write routes through `tx`, so a mid-way failure rolls back cleanly. Resolves DATA-07 too.

The entire restore (project/diagram/unfiled-diagram/template/prompt creates, then two phase-2 raw-SQL passes) is a sequence of independent `prisma.create` / `$executeRawUnsafe` calls with **no surrounding `$transaction`**. Any mid-way throw (oversized JSON, connection drop, constraint error, aborted request) leaves every already-created row committed — a half-restored set with no clean undo. Re-running doubles the rows that landed (only prompts dedup; projects/diagrams/templates are purely additive and already suffixed " (restored)").

**Suggested fix:** wrap the whole body through both phase-2 passes in a single `prisma.$transaction(async (tx) => {...})`, routing every create and `$executeRawUnsafe` through `tx` (Prisma 7 interactive transactions expose `$executeRawUnsafe` on the tx client, so the raw JSON writes roll back together). Raise the tx timeout for large backups.

#### DATA-07 — Backup phase-2 JSON writes happen after all rows commit → crash leaves blank config + dangling links
**`app/lib/backup.ts:389`**

> **✅ Fixed (re-audit 2026-06-26).** Phase 2 now runs inside the same `prisma.$transaction` as phase 1 (see DATA-06) — the two phases commit atomically, so a crash between them no longer leaves blank config + dangling subprocess links.

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

> **✅ Fixed (re-audit 2026-06-26).** Both the rules loop and the prompts loop now run inside a single `prisma.$transaction(async (tx) => {…})` — all-or-nothing merge.

The rules and prompts loops issue per-row find+update/create with no enclosing `$transaction`. A mid-batch failure (a JSON `planJson` cast rejected, a connection drop) leaves some rows merged and others not, and the function throws with no result object, so the caller can't tell how far it got. Idempotent on re-run, but a robustness gap for a cross-environment migration tool.

**Suggested fix:** wrap both loops in one interactive `$transaction` (all-or-nothing), or catch per-row errors into `skippedReasons` and continue so the function always returns a complete result.

#### DATA-23 — Rules upsert keyed only by `id` violates `@@unique([category,userId,orgId])` → abort
**`app/lib/rules-prefs-backup.ts:142`**

> **✅ Fixed (re-audit 2026-06-26).** Each incoming row now resolves `existing = findUnique({id}) ?? findFirst({category,userId,orgId})` and updates that row if either key matches — no more unique-constraint abort when migrating local rules into prod.

`restoreRulesPrefsBundle` upserts `DiagramRules` by `id` only. When migrating local-dev rules into prod (the stated use case), a prod row may already exist with the same `(category, userId, orgId)` tuple but a different `id`; the incoming row has no id match, takes the create branch, and Prisma throws a unique-constraint violation. System-wide rules (`userId`/`orgId` null) are especially prone since only one per category can exist.

**Suggested fix:** before create, look up by `{ category, userId, orgId }` and update that row (keeping its id) if found; only insert when neither id nor the composite key matches. Or use `prisma.diagramRules.upsert` with the composite unique where-clause.

### Low

#### DATA-24 — Two independent connection pools can't share a transaction
**`app/lib/db.ts:24`**

`prisma` uses a `PrismaPg` adapter pool (max 10) and `pgPool` is a *second* independent `pg.Pool` (max 5) over the same `DATABASE_URL`. Any path mixing a Prisma write with a `pgPool` write operates on two connections that cannot participate in one transaction — the structural root of DATA-05, and a limiter on making the backup/restore JSON writes atomic. It also doubles the connection budget against the DB.

**Suggested fix:** prefer `prisma.$executeRaw(Unsafe)` for raw SQL so it shares the adapter pool and can run inside `prisma.$transaction` (as `backup.ts` phase 2 already does). Reserve the standalone `pgPool` for genuinely standalone reads; where a raw write + model write must be atomic, run both via `tx.$executeRaw` / `tx.*` inside one transaction.

---

## Stage 3 — Diagram Engine Core

**Scope:** `app/hooks/useDiagram.ts` (~8,380-line `useReducer` state), `app/lib/diagram/routing.ts`, `bpmnLayout.ts`, `genericLayout.ts`, `linkClosure.ts`, `checks/diagramChecks.ts`, `checks/loadExport.ts`, `textMetrics.ts`.
**Method:** 5 finder lenses (reducer invariants, undo/redo consistency, state-mutation purity, geometry NaN/÷0, unbounded loops + INSERT/REMOVE_SPACE) → 25 raw findings → 23 after dedupe → each adversarially verified by 2 skeptics reading the real code (finders Grep'd + read targeted ranges given the file size). **13 confirmed, 10 refuted.** ENG-08 is *Needs manual confirmation*.

> The standout is **ENG-01**: undo/redo silently drops every diagram field except elements/connectors — and because the editor auto-saves the whole `data` blob, one Ctrl+Z after setting a title or font **permanently writes the loss to the database**. The link-closure cycle guard the lens specifically probed (`walkForwardClosure`) came back clean — it was not flagged.
>
> **Update — the Critical and both High findings (ENG-01, ENG-02, ENG-03) were fixed in v1.20** (commit follows). All three were surgical, mirror existing correct patterns in the same file, and the production build is green. See each finding below for the fix detail. The remaining Medium/Low items are open.

### Critical

#### ENG-01 — Undo/redo wipes title, fonts, database, processOwner & parentDiagramIds (persisted data loss)
**`app/hooks/useDiagram.ts:8244`** (redo at `:8253`)

> **✅ Fixed in v1.20.** `undo()` and `redo()` now dispatch `SET_DATA` with `{ ...dataRef.current, elements: snap.elements, connectors: snap.connectors }`, so the non-snapshotted fields (title, all font sizes, database, processOwner, parentDiagramIds, displayMode) are preserved from live state instead of being replaced with `undefined`. Undoing a geometry change no longer touches diagram metadata.

Undo snapshots store only `{ elements, connectors }`. `undo()`/`redo()` dispatch `SET_DATA` with `{ ...snap, viewport }`, and the `SET_DATA` reducer replaces the **whole** state object verbatim (`:3102`). Every other `DiagramData` field — `title`, all six font-size fields, `database`, `parentDiagramIds`, `processOwner` — is therefore set to `undefined` on any undo/redo. Because title and font changes do **not** push history, the repro is brutal: set a title (or change a font), move any element, press Ctrl+Z — the move is undone *and the title/fonts vanish*. `DiagramEditor` then auto-saves the whole `data` object, so the wipe is persisted permanently, not a transient glitch. `cancelLabelEdit` already does it right (`:7907` spreads `...dataRef.current`), proving the intended pattern.

**Suggested fix:** preserve non-snapshotted fields in both `undo()`/`redo()` — `dispatch({ type: "SET_DATA", payload: { ...dataRef.current, elements: snap.elements, connectors: snap.connectors } })` — or widen the snapshot to capture the full `DiagramData` (minus viewport).

### High

#### ENG-02 — `DELETE_ELEMENT` leaves dangling connectors on the deleted host's boundary events
**`app/hooks/useDiagram.ts:5749`**

> **✅ Fixed in v1.20.** Before filtering connectors, `DELETE_ELEMENT` now builds a `removedElementIds` set of the host id plus every element with `boundaryHostId === id`, and drops any connector whose source or target is in that set — mirroring the `REMOVE_SPACE` handler. The pool/lane cascade path (`:5405`) was given the same treatment for completeness. No more orphaned connectors after deleting a boundary host.

When a boundary host (task/subprocess/EP) is deleted, its boundary-event children are removed as elements (`:5440`), but the connector cleanup (`:5749-5751`) only drops connectors touching the host's **own** id — not connectors referencing the removed boundary-event children. Boundary events legitimately carry connectors (event-to-event `associationBPMN`, sequence in/out of edge-mounted start/end/intermediate events). Repro: mount an intermediate event on a task, draw a connector to it, delete the task → the event vanishes but its connector survives pointing at a missing id. `recomputeAllConnectors` no-ops on the missing endpoint, so the orphan persists with stale waypoints, renders as a stray line, is saved/exported, and trips `checkReferentialIntegrity` as a hard error. The sibling `REMOVE_SPACE` already does this correctly (`:6744`/`:6915`), confirming the oversight.

**Suggested fix:** build `const removedIds = new Set([id]); for (const e of state.elements) if (e.boundaryHostId === id) removedIds.add(e.id);` and filter connectors with `!removedIds.has(c.sourceId) && !removedIds.has(c.targetId)`. Apply the same set to the pool/lane cascade filter at `:5405-5407`.

#### ENG-03 — Title/font/database setters mutate persisted state but don't invalidate the redo stack
**`app/hooks/useDiagram.ts:8295`**

> **✅ Fixed in v1.20.** Added an `invalidateRedo()` helper (clears `futureRef` + `setCanRedo(false)`) and call it from the eight non-history setters (`updateDiagramTitle`, the six font setters, `setDatabase`). A content edit after an undo now kills the stale redo branch, so Ctrl+Y can't replay diverged geometry. Viewport pans are deliberately excluded. (`setProcessOwner` already pushed history, so it was already covered.) Combined with ENG-01, even an accidental redo no longer wipes metadata.

`updateDiagramTitle`, the six `setFontSize`-family setters, `setDatabase`, and `setViewport` only dispatch — they never call `pushHistory` and never clear `futureRef` (the only place the redo branch is reset). Repro: move an element → Ctrl+Z (redo now armed) → edit the title → Ctrl+Y: redo is still enabled and replays the stale post-move snapshot, which (per ENG-01) also clobbers the title you just set. A new edit after an undo must invalidate the redo branch.

**Suggested fix:** route these setters through `pushHistory(snapshotData())` (preferred for title/fonts/database — users expect to undo them), or at minimum add `futureRef.current = []; setCanRedo(false);` to each. A shared `commitEdit()` helper would prevent the whole class of omission.

### Medium

#### ENG-04 — `collectCascadeLanes` recurses with no visited guard → stack overflow on a cyclic lane chain
**`app/hooks/useDiagram.ts:5420`**

The inner `collectCascadeLanes(parentId)` adds matching lanes and recurses into each child id but never checks whether an id was already visited. A lane whose `parentId` chain forms a cycle (corrupt import, hand-edited JSON, or an upstream bug) makes deleting a lane recurse unboundedly and overflow the stack, crashing the editor with no recovery. The other recursive walker in the same handler (`walk`, `:5369`) *does* guard with `!containerIds.has(e.id)` — the protection is simply missing here.

**Suggested fix:** track visited ids and skip already-seen lanes before recursing, mirroring `walk`.

#### ENG-05 — `REMOVE_SPACE` leaves corner elements un-shifted in cross (both-axis) zones
**`app/hooks/useDiagram.ts:6831`**

`REMOVE_SPACE` builds a cross-shaped zone (vertical strip + horizontal strip). `partialOverlap()` is true if an element overlaps *either* strip, and the non-structural branch leaves any such element untouched. An element cleanly to the right of the vertical strip but whose y-range crosses the horizontal band is left in place even though it should slide left by `zone.width` — so on a diagonal Remove-Space it stays put while neighbours slide under it, producing overlaps.

**Suggested fix:** evaluate overlap per-axis (`ovV`, `ovH` separately); skip the X-shift only when the element straddles the vertical strip, and the Y-shift only when it straddles the horizontal strip.

#### ENG-06 — Interleaved second drag overwrites the pre-drag snapshot → first action lost from history
**`app/hooks/useDiagram.ts:7816`**

Coalesced drags key their snapshot on `draggingRef`: `if (draggingRef.current !== id) { draggingRef.current = id; preMoveRef.current = snapshotData(); }`. If a new drag for a different id begins before the prior `elementMoveEnd` fires (rapid pointer-capture loss, swallowed mouseup), `preMoveRef` is overwritten with a snapshot already containing the first move. When the second drag ends, only its pre-snapshot is pushed; the first change becomes un-undoable and one Ctrl+Z reverts both. Same hazard for resize and waypoint drags.

**Suggested fix:** flush the pending snapshot when a new coalesced drag starts while a different id is still open (`if (draggingRef.current && draggingRef.current !== id && preMoveRef.current) pushHistory(preMoveRef.current);`), and guarantee `elementMoveEnd`/`resizeElementEnd` fire on `pointercancel`/`blur`/`lostpointercapture`, not only `mouseup`.

#### ENG-07 — `offsetAlongFromPoint`/`getOffsetAlong` divide by element w/h with no zero-guard → NaN offset
**`app/lib/diagram/routing.ts:48`** (and `:95`)

Both compute `(pt.x - el.x) / el.width` (or `/ el.height`) with no guard against a zero dimension (unlike `getClosestSideOfElement` at `:88`, which uses `|| 1`). A zero-width/height element (e.g. from import) yields `NaN`/`±Infinity`, which is persisted as `conn.sourceOffsetAlong`/`targetOffsetAlong`, then fed to `sidePoint()` → `el.x + el.width*NaN = NaN`. The connector's stored attachment becomes permanently NaN and silently fails to render even after the element is fixed.

**Suggested fix:** divide by a guarded extent and clamp: `Math.max(0, Math.min(1, (pt.x - el.x) / (el.width || 1)))`, mirroring `getClosestSideOfElement`.

#### ENG-08 — Containment clamp can invert detour lines → route crosses through obstacle *(Needs manual confirmation)*
**`app/lib/diagram/routing.ts:379`**

`buildOrthogonalPath` clamps the four detour lines into the containment box. When a tall obstacle nearly fills a small Expanded Subprocess, the clamp can pin `bottomY` above the obstacle's real bottom edge (and `topY` below its top), so all four candidate paths run *through* the obstacle; `pathHitsObstacles` rejects them all and the function falls through to `return ordered[0].path` — a path that visibly slices across the obstacle. No crash; wrong route until the user moves a shape. *(Skeptics split on how often the clamp actually collapses a candidate onto the blocker vs. the far-path fallback saving it — verify with a small-EP/large-obstacle repro.)*

**Suggested fix:** after clamping, re-validate that a clamped line still clears the obstacle; drop candidates whose clamp collapsed them onto/through the blocker so a genuinely-clear (or far-path) candidate is chosen. Guard the degenerate `cBottom < cTop` case.

### Low

#### ENG-09 — `SWAP_LANES_VERTICAL` reorders the connectors array → silent draw-order change
**`app/hooks/useDiagram.ts:4545`**

Returns `[...validated, ...unchanged]` — a new array (not a purity violation), but it hoists rerouted connectors to the front and pushes untouched ones to the back. Draw order for overlapping connectors (and any order-sensitive export consumer) silently changes on each lane swap: a message connector that was on top can drop underneath.

**Suggested fix:** preserve original order by mapping a `Map` of validated connectors over the original array: `connectors.map(c => vmap.get(c.id) ?? c)`.

#### ENG-10 — `swapLane` bypasses the 100-entry history cap
**`app/hooks/useDiagram.ts:7827`**

`pushHistory` enforces the cap by shifting when length > 100, but `swapLane` pushes directly via `pastRef.current.push(...)` and never trims — the only history path not subject to the bound.

**Suggested fix:** replace the inline push/clear block with a single `pushHistory(snapshotData())` call, matching every other one-shot action.

#### ENG-11 — `INSERT_SPACE` pushes a history snapshot every mouse-move frame of a shift-drag
**`app/hooks/useDiagram.ts:8189`**

`insertSpace()` calls `pushHistory()` before each dispatch, and `Canvas` fires `onInsertSpace` on every mousemove during a shift-drag — so one gesture pushes dozens-to-hundreds of full-diagram snapshots and re-runs `recomputeAllConnectors` + `validateConnectorsAgainstObstacles` per frame. Undo becomes per-pixel and large diagrams stutter.

**Suggested fix:** coalesce — snapshot once on drag start, dispatch deltas without `pushHistory` during the drag (or accumulate dx/dy and dispatch one `INSERT_SPACE` on mouseup).

#### ENG-12 — `ancestorsOf` does a linear `find()` per hop → O(n²) obstacle setup per recompute
**`app/lib/diagram/routing.ts:750`**

`ancestorsOf` walks the parent chain with `allElements.find(...)` on every hop, and `computeWaypoints` runs per connector inside `recomputeAllConnectors` (every move/space frame). On deep pool/lane/EP hierarchies this is O(connectors × elements × depth) per frame.

**Suggested fix:** hoist an `id → element` `Map` once (or pass the `elementMap` `recomputeAllConnectors` already builds) and use `map.get(parentId)`.

#### ENG-13 — `consolidateWaypoints` returns its input array by reference for short paths (aliasing trap)
**`app/lib/diagram/routing.ts:1116`**

Returns the same `wps` reference when `wps.length <= 4` instead of a fresh array (the `> 4` branch returns a new one). Nothing breaks today because the dispatcher passes a fresh array, but any future caller passing an array it also retains would alias two connectors' `.waypoints` onto one array — a later in-place edit of one would corrupt the other and the undo snapshots that captured them shallowly.

**Suggested fix:** always return a fresh array — `if (wps.length <= 4) return wps.slice();`.

---

## Stage 4 — Canvas & Renderers

**Scope:** `app/components/canvas/` — `Canvas.tsx`, `SymbolRenderer.tsx`, `ConnectorRenderer.tsx`, `RichTextEditor.tsx`, and siblings.
**Method:** 4 finder lenses (SVG/HTML injection, event/leak handling, render performance, geometry math) → verified by 2 skeptics each. The dominant theme is **per-frame render cost on large diagrams** (pan/zoom jank), plus one stored-XSS sink.

### High

#### CANVAS-01 — `RichTextEditor` injects unsanitized stored description into `innerHTML` (stored XSS)
**`app/components/canvas/RichTextEditor.tsx:26`**

On mount the editor sets `ref.current.innerHTML = isRichText(value) ? value : plainToHtml(value)`. `isRichText` only requires any tag, so a `description` like `<img src=x onerror=...>` is assigned to `innerHTML` **without** passing through `sanitizeRichText`. `value` is `element.properties.description`, which can arrive from imported JSON or AI output that never went through the editor's sanitize path → script runs when a user opens Properties on the offending element. The *display* path (`SymbolRenderer` RichDescriptionBox) is safe because it sanitizes at the call site; only this editor-init path is unguarded.

**Suggested fix:** `ref.current.innerHTML = sanitizeRichText(isRichText(value) ? value : plainToHtml(value ?? ""))`.

#### CANVAS-02 — O(n²) connector-hump computation rebuilt every render
**`app/components/canvas/Canvas.tsx:5113-5121`** (duplicated at `:5821-5828`)

Inside the per-connector render `.map()`, `otherConnectorWaypoints` is `humpEligible.slice(0, humpEligible.indexOf(conn)).map(...)`. `indexOf` is an O(n) scan per connector (→ O(n²)) and the slice/map allocates up to n waypoint-arrays per connector, all inline with no memoisation — paid on **every** render including every pan/zoom frame.

**Suggested fix:** precompute a `conn → index` Map and the prefix once; memoise on `[connectors]`.

#### CANVAS-03 — `nonContainers` sort runs O(n²log n)
**`app/components/canvas/Canvas.tsx:4022-4053`**

`nonContainers` is an unmemoised IIFE whose sort comparator calls `getParentDepth`, which walks the parent chain via `data.elements.find(...)` (O(n)) per level → ~O(n²log n) per render, on every pan/zoom/drag frame.

**Suggested fix:** build a `byId` Map + memoised depth map once.

#### CANVAS-04 — Domain-diagram obstacle check is O(connectors×elements×waypoints) and unmemoised
**`app/components/canvas/Canvas.tsx:4178-4290`**

`obstacleViolationConnIds` runs in render-body code (no `useMemo`): per connector → per element → per segment `segCrossesRect`, on every render even though it only changes when geometry does.

**Suggested fix:** `useMemo` on `[data.elements, data.connectors, diagramType]`.

#### CANVAS-05 — `SymbolRenderer`/`ConnectorRenderer` unmemoised + fresh closures → per-frame re-render storm
**`app/components/canvas/SymbolRenderer.tsx:1840`, `ConnectorRenderer.tsx:533`** (closures at `Canvas.tsx:5097-5132`)

Neither child is `React.memo`'d, and the parent passes brand-new inline closures (`onSelect`, `onMove`, `onUpdateLabel`, …) every render, so prop identity always changes. Pan/zoom are Canvas `useState` updated on every mousemove (no rAF throttle) → every symbol + connector re-renders on every pan/zoom/drag frame, on top of the O(n²) work above.

**Suggested fix:** `React.memo` the children, stabilise per-item callbacks (or apply the pan/zoom transform on a wrapper so the data subtree doesn't re-render).

### Medium

#### CANVAS-06 — Connector-drop highlighting is O(n²)
**`app/components/canvas/Canvas.tsx:5138-5226`** (`getElementPoolId` at `:59-79`)

While dragging a connector, `nonContainers.map()` calls `getElementPoolId` (up to three `elements.find` scans) per element, plus extra `find`s per branch — O(n²) per render, fired on every drag-move frame.

**Suggested fix:** precompute `elementById` + `element→poolId` Maps, memoised on `data.elements`.

### Low

#### CANVAS-07 — Pre-drag gesture listeners never cleaned up on unmount
**`app/components/canvas/SymbolRenderer.tsx:2084-2085`** — window `mousemove`/`mouseup` attached outside any `useEffect`, self-removing only when they fire; an unmount mid-pre-drag leaks them with a stale closure.

#### CANVAS-08 — Connector-label focus-clear listener leaks on unmount
**`app/components/canvas/ConnectorRenderer.tsx:398-402`** — window `mousedown` listener removes itself only on the next click; unmount-while-focused leaks it.

#### CANVAS-09 — Group-drag auto-scroll `setInterval` cleared only on mouseup
**`app/components/canvas/SymbolRenderer.tsx:2104-2152`** — `startAutoScroll`'s interval is cleared in `onMouseUp`/`onMouseMove` only; unmount mid-group-drag keeps it firing against stale state.

---

## Stage 5 — Dashboard & Page Clients

**Scope:** `app/(dashboard)/` client components — `DiagramEditor.tsx`, project/admin clients, menus.
**Method:** 4 lenses (client-side access control, data exposure, async/state correctness, unsafe rendering). The 6 `?from=` open-redirect sites this stage surfaced are all already catalogued under **SEC-15** (which lists exactly these clients) — folded there, not re-numbered. Genuinely new here are two auto-save data-loss races + one debounce-loss.

### High

#### UI-01 — Ctrl+S calls a stale `saveNow()` closure → overwrites edits with `initialData`
**`app/(dashboard)/diagram/[id]/DiagramEditor.tsx:824-843`** (autosave `:145-176`)

The keydown effect wiring Ctrl+S has deps `[undo, redo]` — both stable `useCallback([])` — so it runs once on mount and captures the first-render `saveNow`, whose closure reads the original `initialData`. After edits (autosave advances `lastSaved.current`), pressing Ctrl+S runs the stale `saveNow`, which PUTs the original `initialData` back, silently discarding everything since load. The editor keeps `saveNowRef.current` precisely to avoid this for navigation, but the keydown path bypasses it.

**Suggested fix:** call `saveNowRef.current()` from the keydown handler (or add `saveNow` to deps).

#### UI-02 — Previewing a history snapshot auto-saves it over the live diagram
**`app/(dashboard)/diagram/[id]/DiagramEditor.tsx:3887-3900`** (autosave gate `:807`)

`HistoryPanel.onPreview` calls `setData(oldSnapshot)` ("do NOT save"), but autosave is only disabled when `templateEditState!==null || readOnly` — neither holds during preview. So 1.5 s later `saveNow()` PUTs the *previewed historical snapshot* over the user's newer diagram. The save/discard choice never happens.

**Suggested fix:** add a `previewing` flag to the autosave disable condition (and restore on discard).

### Medium

#### UI-03 — Folder-tree changes lost on navigation (module-level debounce, no flush)
**`app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx:270-284, 900-906`**

`saveFolderTreeToDb` debounces the PUT 500 ms via a single module-level timer. Navigating away (open a diagram → `router.push`) within 500 ms discards the pending timer before the fetch fires — the folder layout silently reverts. No unmount/`beforeunload` flush; the module-level timer also lets a second project view clear the first's pending save.

**Suggested fix:** per-instance timer + flush on unmount and route change.

---

## Stage 6 — Import/Export & Interop

**Scope:** `app/lib/diagram/v3/` (Visio V3), `exportVisio*`, `bpmn/importBpmnXml.ts`, `ddlImport.ts`, `app/api/export|import/**`, SharePoint.
**Method:** 4 lenses (parse robustness/zip-bomb/XXE, data integrity, output injection, endpoint authz). The 3 Visio-export IDORs (V3/V2/test-vsdx) are the same defect as **SEC-07** — folded there. Below are the parse-robustness + data-integrity findings.

### High

#### IO-01 — No upload size limit before `.vsdx` is fully decompressed in memory (zip-bomb / OOM)
**`app/api/import/visio-v3/route.ts`** (also `bulk/route.ts`, `sharepoint/download`)

All Visio import routes do `upload.arrayBuffer()` → `JSZip.loadAsync` → `zip.file(...).async("string")` with no Content-Length / `upload.size` check and no per-entry decompression cap. A few-KB DEFLATE bomb expands to hundreds of MB–GB and `importVisioV3` then runs global regex scans over the giant strings. One authenticated low-tier request can OOM/stall the shared B1 instance. The element-count gate runs only *after* parse.

**Suggested fix:** reject by `upload.size` before reading (hard cap, e.g. 25 MB); cap cumulative uncompressed bytes + entry count during unzip.

#### IO-02 — DDL importer drops FK relationships when table-name casing differs
**`app/lib/diagram/ddlImport.ts:279, 327-328`**

`elementMap` is keyed by the raw `CREATE TABLE` name; FK lookup uses `elementMap[c.fkTable]` with original case. SQL identifiers are case-insensitive, so `CREATE TABLE Orders` + `REFERENCES orders(id)` misses, and `if (!tgtId) continue;` silently drops the connector — common in cross-dialect dumps.

**Suggested fix:** normalise unquoted identifiers (lowercase) on both insert and lookup.

### Medium

#### IO-03 — Unbounded recursion on nested sub-processes / lane sets *(needs manual confirmation)*
**`app/lib/diagram/bpmn/importBpmnXml.ts:591`** — `walkProcessBody`/`applyLaneParenting` recurse with no depth limit; a hostile `.bpmn` nesting expanded subprocesses thousands deep overflows the stack. *Confirm how deep the element-cap lets parsing get before the stack blows.* **Fix:** depth guard.

#### IO-04 — O(n²) element lookups during BPMN flow/lane wiring
**`app/lib/diagram/bpmn/importBpmnXml.ts:751,795,940,949`** — `buildFlows`/`buildDataAssociations`/`applyLaneParenting` resolve elements via `ctx.elements.find(...)` inside loops → O(F·N). **Fix:** `Map<id,element>`.

#### IO-05 — BPMN importer discards sequence-flow condition expressions
**`app/lib/diagram/bpmn/importBpmnXml.ts:952-974`** — records only `hasCondition` and stamps an off-schema `_condition = "true"`, throwing away the real expression; the schema already has `branchCondition`/`isDefaultFlow` (`types.ts:227`). Gateway branch logic is lost on import. **Fix:** map the expression to `branchCondition` and `default=` to `isDefaultFlow`.

#### IO-06 — BPMN importer leaves dangling `boundaryHostId` when host has no `BPMNShape` *(needs manual confirmation)*
**`app/lib/diagram/bpmn/importBpmnXml.ts:541-545, 621-642`** — if a boundary event's host task is dropped (no shape) but the event has its own shape, it is pushed with `boundaryHostId` pointing at a non-existent element → renders detached. **Fix:** post-pass validating every `boundaryHostId` resolves; drop/re-anchor otherwise.

#### IO-07 — Unsanitized diagram name in `Content-Disposition` export header
**`app/api/export/visio-v3/route.ts:89`** (also `visio-v2:70`, `sharepoint/test-vsdx:897`) — raw `diagram.name` interpolated into `filename="..."`; a `"` breaks quoting and injects header params. The bulk route already sanitizes (`replace(/[\\/:*?"<>|]/g,"_")`); the single routes don't. (Node blocks raw CR/LF → Medium.) **Fix:** reuse the bulk sanitizer / RFC 5987 `filename*=`.

### Low

#### IO-08 — DDL parser writes attacker-controlled table names into a plain-object map key *(needs manual confirmation)*
**`app/lib/diagram/ddlImport.ts:279`** — a table named `__proto__`/`constructor` pollutes the prototype chain. Currently client-only (own session), but the helper is exported. **Fix:** `Map` or `Object.create(null)`.

#### IO-09 — BPMN importer id minting uses `Math.random()` with no collision guard
**`app/lib/diagram/bpmn/importBpmnXml.ts:191-194, 403-409`** — `mintId` has no `usedIds` set (the Visio importer does), so element/connector/boundary ids can collide and corrupt `find()` lookups. **Fix:** track and re-roll on collision.

#### IO-10 — DDL enum detection case-sensitive on PK column `code`
**`app/lib/diagram/ddlImport.ts:162-167`** — only `columns[0].name === "code"` (lowercase) triggers enum import; `Code`/`CODE` imports as a plain `uml-class` and drops the enum values. **Fix:** case-insensitive compare.

---

## Stage 7 — Build, Config & Dependencies

**Scope:** `package.json`, `next.config.ts`, `tsconfig.json`, `prisma/schema.prisma`, `proxy.ts`, `auth.ts`, `auth.config.ts`, `app/lib/db.ts`, `.env`.
**Method:** 4 lenses (secrets/env, security headers, dependency/build hygiene, config correctness). The Graph-token leak this stage found is **SEC-05** (folded). **Note on the downgraded "Critical":** the finder flagged live secrets in `.env`, but `.env` is gitignored and was never committed (only `.env.example` is tracked) — so it is **not** a repo leak; it is reclassified **CFG-01 (Low)**: real production secrets sitting in cleartext on the dev disk that should be rotated and kept out of shared/backed-up copies.

### High

#### CFG-02 — `AUTH_SECRET` is the literal placeholder; no weak-secret guard
**`.env:3`** (consumed via `auth.config.ts`)

Local `.env` has `AUTH_SECRET="your-secret-key-change-this-in-production"`, the well-known throwaway that signs JWT sessions. If this value is ever replicated to a network-reachable environment, anyone who knows the placeholder can forge a session JWT for any user (incl. superusers). No code rejects a known-weak/short/empty secret. *(Prod sources its own secret from Azure; this is a local-file + missing-guard finding.)*

**Suggested fix:** generate a strong value locally; add a boot assertion that `AUTH_SECRET` is present, ≥ 32 bytes, and not the placeholder.

#### CFG-03 — No CSP / clickjacking / HSTS / nosniff headers anywhere
**`next.config.ts`** (consolidates 3 near-duplicate findings)

`next.config.ts` defines only `output` + `experimental.staleTimes`; there is no `headers()` block and `proxy.ts` sets no headers. The app ships with **no** Content-Security-Policy, X-Frame-Options/`frame-ancestors`, Strict-Transport-Security, or X-Content-Type-Options. For an SVG-canvas tool rendering user-authored content (and embedding SharePoint preview iframes) on CPS 230 data, that is no defence-in-depth against XSS and no clickjacking protection on authenticated destructive actions.

**Suggested fix:** add an `async headers()` block with a baseline CSP, `frame-ancestors 'self'`/X-Frame-Options, HSTS, `nosniff`, Referrer-Policy.

### Medium

#### CFG-04 — No env-var validation; security secrets via non-null assertion only
**`app/lib/db.ts:11`** (also `auth.ts:63-64,165-166`) — `process.env.DATABASE_URL!` / `AZURE_*!` are erased at runtime; a missing/weak var surfaces as an opaque crash instead of fail-fast, and a weak/empty `AUTH_SECRET` or missing `STRIPE_WEBHOOK_SECRET` boots happily. **Fix:** a single validated env module (zod) asserting presence + minimum strength at startup.

#### CFG-05 — `proxy` matcher misses `(dashboard)` route-group URLs
**`proxy.ts:8-10`** (consolidates the matcher duplicate) — matcher is `['/dashboard/:path*','/diagram/:path*']`, but route groups add no URL segment, so `/matrix`, `/processes/[id]`, `/notifications`, `/help` are never seen by the middleware. Most self-gate with `auth()` by accident; there is no `(dashboard)/layout.tsx` gate. Any new group page added without an explicit `auth()` is silently public. **Fix:** widen the matcher or add a `(dashboard)/layout.tsx` gate.

#### CFG-06 — `/matrix` publicly reachable despite a comment asserting route-group auth
**`app/(dashboard)/matrix/page.tsx:6-9`** — the docstring claims "auth-gated by being inside the (dashboard) route group"; false (no group layout gate, matcher excludes it), and the page does no `auth()` check, so it serves to anonymous visitors. Content is harmless, but the comment propagates the wrong mental model. **Fix:** correct the comment + add a real gate (covered by CFG-05).

### Low

- **CFG-01** — Live secrets in local `.env` (Anthropic/Deepgram/Entra/SMTP). Gitignored/never committed → not a repo leak, but **rotate** them and keep the file off shared/backed-up locations. *(Downgraded from the finder's "Critical".)*
- **CFG-07** — `poweredByHeader` not disabled → `X-Powered-By: Next.js` fingerprinting. **`next.config.ts`**
- **CFG-08** — `@electric-sql/pglite*` remain in production `dependencies` though PGlite is no longer used → larger dep tree / audit surface. **`package.json:22-23`**
- **CFG-09** — `next-auth: ^5.0.0-beta.30` — the auth boundary runs on a beta with a `^` range. **`package.json:31`** **Fix:** pin exactly, track to stable v5.
- **CFG-10** — `token.msTokenExpires = Date.now() + data.expires_in*1000` is `NaN` when `expires_in` is absent → `Date.now() > NaN` is always false → token never refreshes again. **`auth.ts:171-174`** **Fix:** default (e.g. 3600 s) when absent.

---

## Re-audit additions to Stages 1–3 (new findings, 2026-06-26)

### Stage 1 — Security (new)

#### SEC-19 — Deepgram master API key returned to any authenticated client in the dictation-token fallback
**`app/api/ai/dictation/token/route.ts:72`**

When both the short-lived grant and the temp sub-key mint fail, the route returns the raw long-lived master key to the browser: `return NextResponse.json({ token: masterKey, scheme: "token", direct: true, expiresIn: 0 })`. Gated only by a logged-in session — no admin/quota check — so any user can trigger the fallback and receive `process.env.DEEPGRAM_API_KEY` in plaintext with no expiry, reusable against the account's quota/billing until rotated.

**Suggested fix:** fail closed (HTTP 503) instead of returning the master key; never send a non-expiring key to a client.

#### SEC-20 — Archive (soft-delete) route ignores the read-only impersonation guard
**`app/api/diagrams/[id]/archive/route.ts:21`**

POST archives a diagram, gated only by `requireDiagramAccess(..., 'owner')`, which resolves the caller via `getEffectiveUserId` — so under impersonation it archives the *impersonated* user's diagram. It never calls `isReadOnlyImpersonation`, so a SuperAdmin in default read-only "view" mode can soft-delete another user's diagram (the same class as SEC-13/SEC-14, a different route).

**Suggested fix:** add the standard `isReadOnlyImpersonation` 403 guard at the top of POST.

#### SEC-21 — Prompt routes scope org to the impersonated user but key writes on the superuser's own id
**`app/api/prompts/[id]/route.ts:14,23`** (same split in `prompts/route.ts`)

`orgId` comes from `getCurrentOrgId` (impersonation-aware) but the row guard uses `userId: session.user.id` (the real superuser, not `getEffectiveUserId`). Incoherent under impersonation (org follows the target, ownership follows the caller); no cross-user write occurs, so it's a latent correctness inconsistency rather than an access hole — and these routes also permit writes with no `isReadOnlyImpersonation` guard.

**Suggested fix:** pick one identity consistently (`getEffectiveUserId` for both) and add the read-only guard.

### Stage 2 — Data Integrity (new — the per-table restore path, commit `6206efd`)

> The new **per-table restore** (`restoreFullBackupTables`) lets a SuperAdmin tick individual tables to restore. Unlike its two siblings (wipe + additive), it was written **without a transaction** and **nulls deferred cyclic FKs on UPDATE of live rows** — re-introducing several data-integrity hazards the earlier Criticals had closed. Treat DATA-25/26 as the headline regressions.

#### DATA-25 — Per-table restore NULLs live published diagrams' `currentPublishedVersionId`
**`app/lib/full-backup.ts`** (deferred-FK null + best-effort relink)

For tables with a deferred cyclic-FK column (`Diagram.currentPublishedVersionId`), every row is written with that column forced to `null`, queued for a best-effort relink. Because it's an **upsert**, the `update` branch applies `currentPublishedVersionId: null` to an **already-live** published Diagram. If the admin selects `Diagram` but not `PublishedVersion` (separate ticks), every matching live published diagram silently loses its current-version pointer; the relink `try/catch` swallows the miss. Combined with DATA-26 a crash makes it permanent.

**Suggested fix:** don't null the deferred FK on the UPDATE branch for rows whose target already exists live; only defer for genuinely new inserts, and skip the column entirely when `PublishedVersion` isn't in the selection.

#### DATA-26 — New per-table restore runs all upserts + FK re-links with NO transaction
**`app/lib/full-backup.ts:356-397`**

`restoreFullBackupTables` upserts directly on the top-level `prisma` client and runs the deferred-FK relink pass on `prisma` too — no `$transaction` anywhere (the per-row `try/catch` only swallows individual constraint errors). A connection drop / redeploy / non-row error mid-run leaves a half-merged DB and de-linked published diagrams, exactly what the sibling paths were written to prevent.

**Suggested fix:** wrap the whole per-table restore (upserts + relink pass) in one `prisma.$transaction`, routing every write through `tx`.

#### DATA-27 — Per-table restore silently skips rows colliding on a non-PK unique key
**`app/lib/full-backup.ts:352,371-385`** — upsert keys only on PK (`id`); a backup row with a fresh id but a matching secondary unique (`User.email`, or `DiagramRules (category,userId,orgId)`) throws on create and is merely counted "skipped". This regresses the **DATA-23** fix for the generic path. **Fix:** `findUnique(id) ?? findFirst(natural key)` before upsert, per table.

#### DATA-28 — Per-table restore drops a Diagram row when `diagramOwnerId` points to a non-restored user
**`app/lib/full-backup.ts`** — `Diagram.diagramOwnerId` (nullable, not a cycle) is written verbatim; if the owner is neither restored nor live, the create throws and the row is skipped. The additive paths null it for exactly this reason; the per-table path doesn't. **Fix:** null nullable cross-table FKs whose target is absent (mirror `full-backup.ts:766`).

#### DATA-29 — Wipe-restore data-loss guard runs its COUNT checks outside the TRUNCATE transaction (TOCTOU)
**`app/lib/full-backup.ts`** — `restoreFullBackupWipe` runs `SELECT COUNT(*)` on payload-missing tables via `$queryRawUnsafe` *before* entering `$transaction(... TRUNCATE ...)`. Rows inserted into a newer table between the check and the TRUNCATE…CASCADE are silently cascade-deleted. **Fix:** run the guard COUNTs inside the same transaction, before TRUNCATE.

### Low

- **DATA-30** — Per-table `inserted` count returns only inserts (updates excluded), under-reporting writes; and `inspect`/`additive`/`org` restore do `payload.tables.X.map(...)` with no array guard → a malformed/older payload throws an unguarded TypeError 500. **`app/lib/full-backup.ts:151-153,466,628`**
- **DATA-31** — `getOrCreateStripeCustomer` creates a Stripe customer then persists `stripeCustomerId` in a separate write with no compensation; a failure of the second write leaves a Stripe customer with no DB link, and the next call creates a *second* customer (cross-system analogue of the known double-subscription bug). **`app/lib/stripe.ts`** **Fix:** look up existing customer by `metadata.diagramatixUserId` before create, or roll back the Stripe customer on persist failure.

### Stage 3 — Diagram Engine (new)

#### ENG-14 — `updateLabelLive` mutates persisted label+geometry after an undo without invalidating redo *(needs manual confirmation)*
**`app/hooks/useDiagram.ts`** — `UPDATE_LABEL_LIVE` applies a real autosize + label change to persisted state, but the setter calls neither `pushHistory` nor `invalidateRedo` (added for ENG-03). After an undo, typing in a label leaves a stale redo branch that Ctrl+Y can replay from a diverged future, until a commit/cancel fires. **Fix:** call `invalidateRedo()` in the setter (mirror the title/font setters).

#### ENG-15 — `correctAllConnectors` rewrites persisted waypoints without `pushHistory`/`invalidateRedo`
**`app/hooks/useDiagram.ts`** — `CORRECT_ALL_CONNECTORS` rebuilds connector geometry and returns new state, but the exported setter neither snapshots nor invalidates redo. Currently exercised only internally (post-drag, already snapshotted), so Low — but any future direct call reintroduces a stale-redo / non-undoable mutation. **Fix:** route through `pushHistory`/`invalidateRedo`.

#### ENG-16 — Rectilinear waypoint-preservation uses a different obstacle set than the main pass
**`app/lib/diagram/routing.ts:1408-1412`** — the user-route-preservation branch builds `SEQ_OBS` **including** data-object/data-store, while `computeWaypoints` uses `SEQ_OBSTACLE_TYPES` which **excludes** them (sequence flow may overlap data artifacts). A preserved route grazing a Data Object is judged "blocked" → falls back to a full recompute, discarding the user's custom waypoints. Cosmetic (no data loss). **Fix:** align the two obstacle sets.

#### ENG-17 — `recomputeAllConnectors([conn])` rebuilds the full element Map per connector, per drag frame
**`app/lib/diagram/routing.ts:1205`** (14 call sites) — `state.connectors.map(conn => recomputeAllConnectors([conn], elements)[0])` rebuilds `new Map(elements...)` for *one* connector each iteration → O(C·E) per frame on drag paths. **Fix:** call once with the full list, or pass a shared prebuilt `elementMap`.

#### ENG-18 — `ensureContainersEncloseChildren` recomputes ancestor depth inside the sort comparator
**`app/hooks/useDiagram.ts:1990-2002`** — `depthOf` walks ancestors via `elements.find` (O(depth·E)) twice per comparison in a `.sort()` → ~O(n log n·depth·E) on every drop/resize tick; a `byId` map built right after isn't used by `depthOf`. **Fix:** precompute a depth Map before sorting.

#### ENG-19 — `getAllDescendantIds` O(subtree×n) per column inside the vswimlane drag frame
**`app/hooks/useDiagram.ts:441`** — iterates the full elements array per dequeued node, called per-column inside the vertical-swimlane drag loop → O(columns·subtree·E) per frame. **Fix:** build a `childrenByParent` index once per frame.

---

## Remediation Plan

**Totals:** ~103 findings; **10 fixed** (DATA-01/02/03, ENG-01/02/03, DATA-06/07/22/23), ~93 open. Ordered by risk × effort. Each wave is independently shippable.

> **Single-org caveat:** several "within-org IDOR / elevation" findings (SEC-01, SEC-07) are **not exploitable** in the default single-member personal org — they need a second member in the same org. They still matter for the multi-member CPS 230 tenants the product targets, so they stay High, but they are not a live breach today.

### Wave 1 — High-severity security (do first; mostly small, well-scoped)
| Finding | Fix | Effort |
|---|---|---|
| **SEC-07** Visio export IDOR (v2/v3/test-vsdx) | Replace org-only `findFirst` with `requireDiagramAccess(..., 'view')` | S |
| **SEC-05** Graph token on client session | Drop `session.msAccessToken`; SharePoint route reads it from the JWT server-side | S |
| **SEC-19** Deepgram master key to client | Fail closed (503) in the fallback; never return a non-expiring key | XS |
| **CANVAS-01** RichTextEditor stored XSS | `sanitizeRichText(...)` before `innerHTML` on init | XS |
| **SEC-15** `?from=` open redirect (~8 sites) | Shared `isSafeInternalPath()` rejecting `//`/`/\`/scheme; use everywhere | S |
| **SEC-13/14/20** impersonation write guards | Add `isReadOnlyImpersonation` 403 to deleted-delete/restore, scan-links POST, archive POST | S |
| **SEC-03** OrgAdmin backup leaks hashes/tokens | Strip `password`/`resetToken*`/`stripe*` from User rows before serialising | S |
| **SEC-02** empty `ADMIN_PASSWORD` fails open | Treat empty secret as elevation-disabled + `timingSafeEqual` | S |
| **SEC-06 / SEC-04 / SEC-11** auth hardening | Rate-limit/lockout on login+register+forgot; email-verification gate; shared password policy | M |
| **SEC-16/17** token-at-rest + impersonation cookie | Hash reset token; signed/httpOnly impersonation cookie + audit row | M |

### Wave 2 — High data-integrity / data-loss
| Finding | Fix | Effort |
|---|---|---|
| **DATA-25 / DATA-26** new per-table restore | Wrap in `$transaction`; stop nulling live `currentPublishedVersionId` on UPDATE *(addressed in this pass)* | M |
| **DATA-27/28** per-table natural-key + null-FK | Natural-key fallback before upsert; null absent nullable FKs | S |
| **UI-01 / UI-02** Ctrl+S + history-preview auto-save | Call `saveNowRef.current()`; gate autosave during preview | S |
| **DATA-04 / DATA-17** Stripe webhook ordering + counter reset | Event-recency guard / re-fetch canonical sub; scope counter reset to the renewed period | M |
| **DATA-05** archive lost-update across two pools | Merge in one DB statement / `SELECT … FOR UPDATE` in a single tx | M |
| **DATA-11/12/13/16** restore re-parenting + orphans | Confirm email matches; guard `projectIdMap`; require existing membership; re-home published diagrams on project delete | M |
| **DATA-15** usage-cap TOCTOU | Atomic increment-then-check / per-user lock in the create tx | M |
| **DATA-31** dangling Stripe customer | Look up by metadata before create / compensate on failure | S |

### Wave 3 — Config & platform hardening
- **CFG-03** add `headers()`: CSP, `frame-ancestors`/X-Frame-Options, HSTS, nosniff, Referrer-Policy. *(One change, broad protection — high leverage.)*
- **CFG-02 / CFG-04** boot-time env validation (zod) asserting presence + strength of `AUTH_SECRET`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, `AZURE_*`; reject the placeholder.
- **CFG-05/06** add a `(dashboard)/layout.tsx` auth gate (or widen the matcher); fix the `/matrix` comment.
- **CFG-01** rotate the live `.env` secrets (Anthropic/Deepgram/Entra/SMTP) and keep the file out of shared/backed-up copies.
- **CFG-07/08/09** `poweredByHeader:false`; move PGlite to devDeps; pin `next-auth` exactly.

### Wave 4 — Medium correctness & robustness
ENG-04 (lane-cascade visited guard) · ENG-05 (REMOVE_SPACE corners) · ENG-06/14 (drag/label redo) · ENG-07 (NaN offset divisor) · ENG-08 (containment clamp) · IO-01 (zip-bomb cap) · IO-02/05/06/09/10 (DDL/BPMN import fidelity) · IO-03/04 (recursion + O(n²) parse) · IO-07 (Content-Disposition) · SEC-09/10/12 · DATA-09/18/19/21/29/30 · UI-03 (folder-tree flush).

### Wave 5 — Performance (large-diagram pan/zoom)
CANVAS-02/03/04/05/06 + ENG-12/16/17/18/19 — memoise the render-body computations, `React.memo` the canvas children with stable callbacks, hoist `id→element` maps. Biggest perceived-quality win; ship as one focused pass.

### Wave 6 — Low / cleanup
Remaining Low items (SEC-18, SEC-21, ENG-09/10/11/13/15, DATA-24, CANVAS-07/08/09, IO-08, CFG-10) — fold into normal maintenance.

**Suggested first commit:** Wave 1's XS/S items (SEC-07, SEC-05, SEC-19, CANVAS-01, SEC-15) + the DATA-25/26 transaction fix — high risk-reduction, low blast radius, all build-verifiable.

