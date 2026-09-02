# Diagramatix — Tests Summary

**As at:** 2026-09-01  ·  **Document version:** 6.7  ·  **Suite:** 376 test files · 2,460 tests (all green)  ·  **Runner:** Vitest  ·  **CI:** enforced on every PR + push to `main`  ·  **Highest ref:** T3146  ·  **Plus:** a Playwright browser e2e suite — see [Layer 11](#layer-11--end-to-end-playwright-browser-tests)

---

## 1. Executive summary

### What this is
Diagramatix has an automated **regression safety net** — a suite of **2,203 tests across 342 files** that runs the app's real code and fails loudly (“goes red”) the moment a change breaks documented behaviour. It is the early-warning system that lets the product change quickly without silently breaking sharing rules, data integrity, diagram layout, exports, the simulator, or AI generation.

### How it's built (philosophy)
- **Real code, not mocks.** Database tests run against a real PostgreSQL database (`diagramatix_test`) using the actual Prisma client and the real authorisation resolvers — no faked database, no faked sign-in. A signed-in user is supplied as a plain session object so the genuine permission logic is exercised. This catches whole classes of “missing access guard” and “broken cascade” bugs that mocks would hide.
- **Pure logic tested directly.** Layout, routing, exports, the rule-splitter, the simulator engine, and plan validation are pure functions, tested directly on in-memory data (no database needed).
- **Testable by extraction.** Where important logic lived inside a web route (project delete, publish/restore, entity-list adopt, the Stripe double-subscription guard), the *data effect* was extracted into a small library and pinned by tests, while the route keeps its security checks unchanged.
- **Several proven test styles**, chosen per area:
  - **Round-trip** — export → import and assert nothing was lost (JSON, XML, DDL, Visio, BPSim, backups).
  - **Structural / invariant** — assert a diagram is always well-formed (no dangling connectors, orthogonal routing, every type placed).
  - **Registry** — an executable list where every code-enforced rule (BPMN geometry, ArchiMate notation) has a matching behavioural test.
  - **Ratchet** — for a known, not-yet-fixed gap (the obstacle-avoidance router), the test pins the current count so it can only get *better*, never worse.

### How it runs
- Locally: `npm test` (which is `vitest run`) from the `diagramatix/` folder.
- Database tests share one test database, so files run **serially** (never in parallel) and every test wipes the tables before it runs.
- **CI gate** (`.github/workflows/ci.yml`): on every pull request and every push to `main`, GitHub spins up a PostgreSQL 18 container, runs the **entire suite**, and then runs a **production build**. A red suite or a broken build shows as a failed check on the commit.

### How to read this document
Each test file has its own section below, grouped into layers. Within each section is a table with four columns:

| Column | Meaning |
|---|---|
| **Ref** | A stable `Tnnnn` reference. The initial set was numbered top-to-bottom; thereafter every new test takes the next number after the current highest (see below), so a ref never changes. Use it to cite a check (e.g. "T0123"). |
| **Test** | The exact name of the individual check. |
| **Protects you against** | In plain terms, the real-world problem that would occur if this behaviour regressed. |
| **How it would break (go red)** | The kind of code or data change that would make this specific test fail — i.e. what the test is watching. |

**Maintaining the `Tnnnn` numbers — append-only from the highest.** When ANY test is added — including one slotted into an existing file's table — give it the **next number after the current highest ref**, and **never renumber or reuse** an existing one. So the next test added anywhere becomes **T3147**, the one after **T3148**, and so on. A consequence: after the first pass the numbers are **no longer in strict document order** (a new row in an early section may carry a high number) — that is deliberate, because a given `Tnnnn` must always point at the same check forever.

> **Highest ref allocated: `T3146`.** Update this line whenever you add tests, so the next continuation point is always obvious. It is CHECKED: `tests/config/tests-summary-coverage.test.ts` fails if it disagrees with the tree, and fails if any `Tnnnn` in the tree has no row in this document. Three different totals once coexisted in this file — 820, 436 and 131-vs-66 files — because nothing verified any of them. (T0639-T0640 = optional state + Activity→State table for logs with no state column; T0641-T0642 = governance aggregate from Control/Risk/Policy IDs on events + log-based control effectiveness; T0643-T0644 = IEEE XES import/export; T0645-T0646 = OCEL import/export; T0647-T0648 = Document Editor .docx export; T0649-T0650 = document-collection isolation, user-guide vs tech-design.) (T0617-T0619 = Excel-serial + sampleLog; T0620-T0623 = state-machine Layout red rules S3.01/02/04/05/06; T0624 = AI Explain-results prompt; T0625 = three choosable mining scenarios w/ declining compliance; T0626-T0635 = Risk & Control: element annotation, B38 coverage + B39 SoD checks, xlsx writer, adopt clone + RCM export, flat Activity×Risk×Control audit grid, GRC objects + traceability graph, control operating-effectiveness from mining conformance; T0636 = ready-made Order-to-Cash sample GRC library; T0637 = O2C mining example aligns with the library's control signatures; T0638 = Risk & Control Examples (3rd catalog) package + attach integrity.)

A few rows cover a *parameterised family* of tests (e.g. "one per scenario", or "all role combinations"), so the highest `Tnnnn` is lower than the headline test count (592).

A test going red is not a problem with the test; it's the net catching a change. If the change was intentional, the test is updated to match; if not, the net just prevented a regression from shipping.

### The layers at a glance

| Layer | What it guards | Files |
|---|---|---|
| 1. Access control, auth & sharing | Who can see/edit projects + diagrams; login, registration, password reset, impersonation, org-admin mgmt | 5 |
| 2. App-flow data integrity | Delete/publish/bundle/billing/backup effects + delete authz + Stripe webhook/checkout + notifications/groups/entity-nodes | 16 |
| 3. Export & interchange | JSON / XML / DDL / Visio / translation round-trips + SharePoint link | 12 |
| 4. Diagram structure & layout | BPMN/flowchart layout rules, type coverage, ArchiMate notation | 10 |
| 5. Connector routing & editor | Orthogonal routing, manual-edit re-routing, archi re-attach | 6 |
| 6. AI generation pipeline | Rule-filtering, plan validation, normalisation, prompt assembly | 6 |
| 7. Process Simulator | Engine correctness, determinism, hierarchy, BPSim interop | 17 |
| 8. Help content & dictation | Guide rendering/images, transcript parsing | 5 |
| 9. Test infrastructure | The harness itself | 1 |

### Known open item
One area is deliberately **ratcheted, not closed**: the editor's obstacle-avoidance re-routing (`tests/editor/obstacle-sweep.test.ts`) holds a baseline of 10 known connector-through-obstacle crossings. These are diagnosed (6 are gateways, deliberately not treated as obstacles; 4 are a vertical-channel case needing a deeper router detour). The test guarantees this number can only fall.

---

## Layer 1 — Access control, auth & sharing

### `tests/sharing/access-guards.test.ts` — Sharing permission matrix and cross-user diagram/project isolation

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0001 | (requireProjectAccess) owner has full access (view + edit) | A project owner being locked out of their own project | If ownership stopped resolving to the "owner" role |
| T0002 | (requireProjectAccess) EDIT sharee can view and edit | An invited editor losing the ability to edit a shared project | If an EDIT share stopped granting edit rights |
| T0003 | (requireProjectAccess) VIEW sharee can view but NOT edit (403) | A view-only collaborator being able to change a project they shouldn't | If a VIEW share stopped blocking edit (no 403) |
| T0004 | (requireProjectAccess) outsider is denied at any role (403) | A stranger reading or editing a project not shared with them | If a non-member/non-sharee was let in instead of denied |
| T0005 | (requireProjectAccess) not signed in → 401 | An anonymous visitor reaching project data | If a null session returned access instead of 401 |
| T0006 | (requireProjectAccess) nonexistent project → 403 (existence not leaked to non-members) | Leaking whether a project exists to outsiders | If a missing project returned 404 (leaking existence) instead of 403 |
| T0007 | (requireDiagramAccess) owner + EDIT edit; VIEW is view-only; outsider denied | A diagram not inheriting its project's sharing rules | If diagram access stopped inheriting project roles correctly |
| T0008 | (requireDiagramAccess) nonexistent diagram → 404 | Confusing errors when a diagram id doesn't exist | If a missing diagram stopped returning 404 |
| T0009 | (requireDiagramAccess) not signed in → 401 | An anonymous visitor reaching a diagram | If a null session returned diagram access instead of 401 |
| T0010 | (cross-user isolation) a legacy orphan diagram is reachable only by its owner — even an org-member project-sharee is denied | A project sharee seeing an old un-projected diagram they shouldn't | If orphan (no-project) diagrams became reachable via org/share access |
| T0011 | (cross-user isolation) a user in a DIFFERENT org with no share cannot reach the project or its diagram | One org's data leaking to an unrelated org | If a foreign-org user was granted access to a project/diagram |
| T0012 | (cross-user isolation) a VIEW share never escalates to edit (downgrade enforced on project AND diagram) | A view-only user quietly gaining edit rights | If a VIEW role escalated to edit on either project or diagram |
| T0013 | (cross-user isolation) a cross-org share is INERT without allowCrossOrgSharing — a sharee outside the project's org is still denied | A share to an outside-org user leaking access when cross-org sharing is off | If cross-org shares granted access without the org opt-in flag |

### `tests/auth/credentials.test.ts` — Login credential check + account registration

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0377 | (verifyCredentials) correct password → the user record | A valid login being rejected | If a correct email+password didn't return the user |
| T0378 | (verifyCredentials) wrong password → null | A wrong password being accepted | If an incorrect password returned a user |
| T0379 | (verifyCredentials) non-existent email → null (dummy hash never matches) | Login on a non-existent account, or timing-based account enumeration | If a missing email skipped the bcrypt compare or returned a user |
| T0380 | (verifyCredentials) email is matched case-insensitively | A user locked out by email casing | If the lookup became case-sensitive |
| T0381 | (registerUser) creates a new user with a HASHED password (not plaintext) + default Org/Owner | Passwords stored in plaintext, or a new user with no organisation | If the stored password was plaintext, or the Org/Owner membership wasn't created |
| T0382 | (registerUser) rejects a duplicate email (409) | Two accounts sharing one email | If a duplicate email created a second account instead of 409 |
| T0383 | (registerUser) rejects a password under the 8-char minimum (400) | Weak passwords being accepted | If a <8-char password registered instead of 400 |
| T0384 | (registerUser) rejects a missing email or password (400) | A malformed registration creating a broken account | If a missing field didn't return 400 |
| T0385 | (registerUser) a registered user can then log in via verifyCredentials | Registration + login drifting apart (hash-format mismatch) | If a freshly-registered user couldn't authenticate |

### `tests/auth/password-reset.test.ts` — Forgot-password token mint + reset redemption

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0407 | (createPasswordResetToken) sets a token + future (1h) expiry for a real user and returns a reset url | A reset request not producing a usable, time-limited link | If minting didn't store the token + ~1h expiry or didn't return the url |
| T0408 | (createPasswordResetToken) an UNKNOWN email returns null and writes no token (no enumeration) | Attackers learning which emails are registered from reset behaviour | If an unknown email wrote a token or behaved differently from a known one |
| T0409 | (resetPasswordWithToken) a valid token changes the password AND clears resetToken/resetTokenExpiry | A reset not actually changing the password, or leaving the token live | If the new password wasn't stored (bcrypt) or the token/expiry weren't cleared |
| T0410 | (resetPasswordWithToken) an EXPIRED token → 400 and the password is UNCHANGED | An old reset link still working after it should have expired | If an expired token reset the password instead of 400 |
| T0411 | (resetPasswordWithToken) an unknown token → 400 | A guessed/invalid token resetting an account | If an unknown token was accepted |
| T0412 | (resetPasswordWithToken) a <8-char password → 400 | A weak password being set via reset | If a <8-char password was accepted |
| T0413 | (resetPasswordWithToken) a missing token or password → 400 | A malformed reset request being mishandled | If a missing field didn't return 400 |
| T0414 | (resetPasswordWithToken) a token cannot be reused — second attempt → 400 | A reset link working more than once | If a used (cleared) token still worked |

### `tests/auth/impersonation.test.ts` — SuperAdmin "view as" + effective-user resolution

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0415 | (isSuperuser) a SUPERUSER_EMAILS email → true | A real admin not being recognised as SuperAdmin | If a superuser email resolved to false |
| T0416 | (isSuperuser) a normal email → false | A normal user being treated as SuperAdmin | If a non-superuser email resolved to true |
| T0417 | (isSuperuser) a null session → false | An anonymous caller treated as SuperAdmin | If a null session resolved to true |
| T0418 | (isSuperuser) matching is case-INSENSITIVE (an uppercase variant still matches; a non-admin never does) | A SuperAdmin losing admin because their stored email casing differs | If the email match became case-sensitive again, or matched a non-allow-listed email |
| T0419 | (getViewAsUserId) superuser + impersonate cookie set → that value | A SuperAdmin's "view as" target not resolving | If the cookie value wasn't returned for a superuser |
| T0420 | (getViewAsUserId) NON-superuser + cookie set → null | A normal user impersonating someone by forging the cookie (privilege escalation) | If a non-superuser's cookie returned a target id |
| T0421 | (getViewAsUserId) superuser + no cookie → null | A superuser treated as impersonating when they aren't | If no-cookie returned a value |
| T0422 | (getEffectiveUserId) superuser impersonating → the impersonated id | "View as" not scoping data to the target user | If it returned the superuser's own id while impersonating |
| T0423 | (getEffectiveUserId) non-superuser with the cookie → their OWN id (cookie inert) | A normal user's data scope hijacked by a forged cookie | If a non-superuser's cookie changed their effective id |
| T0424 | (getEffectiveUserId) nobody impersonating → own id | The normal path resolving the wrong user | If a plain session didn't resolve to its own id |
| T0425 | (getEffectiveUserId) null session → empty string | A crash / ambiguous id for an anonymous caller | If a null session didn't resolve to "" |
| T0426 | (isImpersonating) true only when a superuser has the cookie | Mis-detecting impersonation state (banner / read-only) | If it reported impersonating for a non-superuser or without the cookie |
| T0427 | (getImpersonationMode) the "edit" cookie → edit mode | An edit-mode impersonation not being recognised | If an "edit" cookie didn't return edit |
| T0428 | (getImpersonationMode) absent / "view" / other → view mode (default) | Defaulting to the wrong (less safe) mode | If the default wasn't the read-only "view" mode |
| T0429 | (isReadOnlyImpersonation) superuser impersonating in view mode → true | A view-only "view as" session being allowed to write | If view-mode impersonation wasn't flagged read-only |
| T0430 | (isReadOnlyImpersonation) superuser impersonating in edit mode → false | An edit-mode impersonation wrongly blocked from writing | If edit-mode impersonation was flagged read-only |
| T0431 | (isReadOnlyImpersonation) not impersonating (even with mode=view) → false | A normal session wrongly treated as read-only | If a non-impersonating session was flagged read-only |
| T0432 | (isReadOnlyImpersonation) non-superuser with both cookies → false | A forged cookie putting a normal user into a (mis-scoped) impersonation state | If a non-superuser's cookies produced a read-only impersonation |

### `tests/orgs/member-management.test.ts` — Org admin management (gate + cross-tenant + last-admin)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0461 | (requireOrgAdminFor) null session → 401 | An anonymous caller managing org admins | If a null session resolved the gate |
| T0462 | (requireOrgAdminFor) SuperAdmin passes everywhere with isSuperAdmin:true (even a foreign org) | A SuperAdmin being blocked from org administration | If a superuser didn't pass, or wasn't flagged isSuperAdmin |
| T0463 | (requireOrgAdminFor) an Owner of the org passes with isSuperAdmin:false | A legitimate Owner being blocked | If an Owner of the org was denied |
| T0464 | (requireOrgAdminFor) an Admin member of the org passes | A legitimate Admin being blocked | If an Admin of the org was denied |
| T0465 | (requireOrgAdminFor) a Viewer member of the org → 403 | A plain member managing org admins | If a Viewer passed the gate |
| T0466 | (requireOrgAdminFor) a non-member of the org → 403 | An outsider managing another org's admins | If a non-member passed the gate |
| T0467 | (promoteToAdmin) promotes an existing Viewer member to Admin (200) | An admin promotion not taking effect | If promoting an existing member didn't set role Admin |
| T0468 | (promoteToAdmin) resolves the target by EMAIL (key lowercased to match the stored email) | Promotion-by-email failing on casing | If the email key wasn't lowercased to resolve the user |
| T0469 | (promoteToAdmin) SuperAdmin promoting a NON-member CREATES an Admin OrgMember (201) | A SuperAdmin unable to add a user to an org in one step | If a SuperAdmin's promote of a non-member didn't create the Admin membership |
| T0470 | (promoteToAdmin) a non-superadmin OrgAdmin promoting a NON-member is REJECTED (400, cross-tenant) | An OrgAdmin pulling an outsider into their org (tenant-isolation breach) | If a non-superadmin could promote a non-member |
| T0471 | (promoteToAdmin) an unknown target → 404 | A confusing failure promoting a non-existent user | If an unknown target didn't 404 |
| T0472 | (promoteToAdmin) an empty userIdOrEmail → 400 | A malformed promote request being mishandled | If an empty key didn't 400 |
| T0473 | (demoteAdmin) demotes one of two admins to Viewer | A demotion not taking effect | If demoting an admin didn't set role Viewer |
| T0474 | (demoteAdmin) refuses to demote the LAST OrgAdmin (org keeps an admin) → 400 | Orphaning an org with no admin (nobody can manage it) | If demoting the last admin were allowed |
| T0475 | (demoteAdmin) demoting a non-admin member (Viewer) → 400 | A nonsensical demote of a non-admin | If demoting a non-admin didn't 400 |
| T0476 | (demoteAdmin) demoting a non-member → 404 | A confusing failure demoting a non-member | If demoting a non-member didn't 404 |

---

## Layer 2 — App-flow data integrity

### `tests/projects/delete-cascade.test.ts` — Data effects of deleting a project across unorganise/hard/archive modes

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0014 | unorganise — diagrams survive as Unorganised, published demoted, shares cascade away | Losing diagrams, or leaving an invisible published orphan, when a project is unorganised | If diagrams weren't re-parented to null, the published child wasn't demoted to DRAFT, or shares weren't removed |
| T0015 | hard — diagrams, history and versions are permanently purged | Leftover orphaned diagrams/history/versions after a hard delete | If a hard delete stopped purging diagrams, their history, or published versions |
| T0016 | archive — diagrams are moved into the system archive, then the project is deleted | Losing diagrams on an archive delete instead of preserving them | If diagrams weren't re-parented into the archive project before deleting the original |

### `tests/publish/publish-flow.test.ts` — Publish and version-history restore data effects

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0017 | publishing a DRAFT creates v1, flips lifecycle, sets the current pointer + review date | A first publish not going live or losing its review schedule | If publish stopped creating v1, flipping to PUBLISHED, setting the current pointer, or applying the review date/cadence |
| T0018 | publishing AGAIN increments to v2, re-points current, and supersedes v1 | Re-publishing not advancing the version or leaving two "current" versions | If a re-publish didn't bump to v2, re-point current, keep the prior cadence, or stamp v1 superseded |
| T0019 | publishing a missing diagram throws PublishError(404) | A confusing failure when publishing a deleted diagram | If publishing a nonexistent diagram stopped throwing a 404 PublishError |
| T0020 | restore saves the CURRENT state as a new history entry, THEN rolls back to the snapshot | Losing the current work when a user restores an old snapshot | If restore stopped saving the pre-restore state first or didn't roll back to the snapshot |
| T0021 | restore of a missing snapshot throws PublishError(404) and does not touch the diagram | A bad restore corrupting the diagram or creating junk history | If a missing snapshot stopped 404-ing, altered the diagram, or wrote a spurious history row |

### `tests/bundles/bundle-closure.test.ts` — Link-closure scope and business-user bundle access grants

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0022 | (bundle closure) closure from a root is exactly root + in-project linked descendants — no unrelated, no cross-project | A publication bundle pulling in the wrong diagrams or missing linked ones | If the closure walk included unrelated/cross-project diagrams or stopped following in-project links |
| T0023 | (bundle closure) a leaf root with no links closes to just itself | A linkless diagram bundling unexpected extras | If a leaf root's closure returned more than just itself |
| T0024 | (bundle business-user access) an audience member gets business-user access to a bundle diagram but NOT to one outside the bundle | A business viewer seeing diagrams not in their release bundle | If audience access stopped granting business-user on in-bundle diagrams or leaked to out-of-bundle ones |
| T0025 | (bundle business-user access) a non-audience user is denied even though the bundle exists | A non-audience user reaching a published bundle | If a user not in the audience was granted access |
| T0026 | (bundle business-user access) a superseded bundle no longer grants access | An old/archived release still being readable | If a superseded bundle kept granting access |
| T0027 | (bundle business-user access) the project owner still reaches a bundle diagram via the project path (role owner, not business-user) | The owner being demoted to a viewer role on their own bundled diagram | If the owner resolved as business-user instead of owner |

### `tests/entity-lists/own-copy.test.ts` — Project adopts an independent own-copy of an org-master list

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0028 | adopt clones the master into a SEPARATE project-scoped list + node tree | Adoption sharing rows with the org master instead of copying | If adopt reused master rows, mis-scoped the copy, or lost the parent/child structure |
| T0029 | renaming / adding / deleting on the PROJECT copy leaves the org master untouched | Editing a project's list silently mutating the shared org master | If a project-copy edit also changed the org master's nodes |
| T0030 | editing the org MASTER after adoption does NOT change the already-adopted project copy | An org-master edit retroactively rewriting projects that already adopted it | If master edits propagated into the frozen project copy |
| T0031 | one list per kind per project: re-adopt without replace throws 409, with replace overwrites | Duplicate lists of the same kind, or a replace not cleaning up the old copy | If re-adopt stopped 409-ing, or replace didn't delete the old list/nodes and leave exactly one |
| T0032 | a master from a DIFFERENT org cannot be adopted (404) | Adopting another org's list across tenant boundaries | If a foreign-org master could be adopted instead of 404 |

### `tests/notifications/notifications.test.ts` — Notification helpers write correct recipient rows and payloads

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0033 | createNotification writes one row for the recipient with type + payload | Notifications going to the wrong person or losing their details | If it wrote no row, the wrong type/payload, or also notified the actor |
| T0034 | createNotifications fans a bundle-published notification out to every audience member | A release notification missing some audience members or hitting the publisher | If it didn't notify each audience user, mis-set the payload, or also notified the publisher |
| T0035 | createNotifications with an empty list is a no-op | Spurious empty notifications | If an empty input created any notification rows |

### `tests/usage/usage-caps.test.ts` — Subscription usage caps enforce and record correctly

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0036 | recordUsage increments the UsageCounter and checkLimit blocks once the cap is hit (event metric) | A user exceeding their plan's metered limit (e.g. bulk exports) | If recordUsage didn't increment, checkLimit didn't block at the cap, or multiple counter rows appeared |
| T0037 | a point-in-time metric (projects) blocks when the actual count reaches the cap | A user creating more projects than their plan allows | If the project count check stopped blocking at the cap |
| T0038 | a null (unlimited) limit always passes | Unlimited-plan users being wrongly blocked | If a null/unlimited limit started blocking |
| T0039 | a SuperAdmin bypasses enforcement and recordUsage is a no-op for them | Admins being blocked by caps or accruing usage counters | If a SuperAdmin was blocked, or recordUsage wrote a counter for them |

### `tests/stripe/double-subscription.test.ts` — Guard preventing a paid user starting a second parallel subscription

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0040 | no subscription id → not blocking, Stripe never queried | Blocking a user who has no subscription, or wasting a Stripe call | If a null subscription id was treated as blocking or triggered a Stripe lookup |
| T0041 | subscription already lapsed (subscriptionEndsAt in the past) → not blocking, Stripe never queried | Blocking a lapsed user from re-subscribing, or a needless Stripe round-trip | If a past end-date was treated as blocking or queried Stripe |
| T0042 | live statuses BLOCK a fresh checkout | A paid user getting a second parallel subscription (the original bug) | If active/trialing/past_due/incomplete stopped blocking a new checkout |
| T0043 | dead statuses do NOT block (user may start a fresh subscription) | A user with a dead subscription being unable to start a new one | If canceled/incomplete_expired/unpaid wrongly blocked checkout |
| T0044 | Stripe 404 (status null) → subscription gone, not blocking | Blocking checkout when the stored subscription no longer exists at Stripe | If a null (404) status was treated as blocking |
| T0045 | active sub with no end date or a future end date → blocking | An open-ended or future-dated active sub allowing a duplicate | If an active sub with null/future end date stopped blocking |
| T0046 | a propagated (non-404) lookup error is not swallowed | A Stripe outage being silently treated as "no subscription" | If a thrown lookup error was swallowed instead of propagating |
| T0047 | ACTIVE_SUB_STATUSES includes the live set and excludes the dead set | The live/dead status classification drifting | If the status set added a dead status or dropped a live one |

### `tests/backup/coverage.test.ts` — Full and scoped backups account for every catalog table

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0048 | the full backup enumerates every catalog table with a working delegate | A table silently dropped from the full backup (data loss on restore) | If a catalog table lacked a working Prisma delegate, or EntityList/EntityNode/ScannerRule went missing |
| T0049 | orders all tables and defers the Diagram↔PublishedVersion cycle | A restore failing on the circular Diagram/PublishedVersion reference | If insert order didn't cover all tables or stopped deferring the Diagram→PublishedVersion edge |
| T0050 | scoped backups account for every catalog table (covered or consciously omitted) | A new table quietly slipping out of org/user backups unnoticed | If a new catalog table was neither covered nor listed in SCOPED_OMITTED |
| T0051 | deliberately omits the Simulator tables from scoped backups (asserted, not just commented) | The Simulator-omission decision drifting or referencing a renamed table | If a Simulator table vanished from the catalog, wasn't in SCOPED_OMITTED, or became scoped-covered without follow-up |

### `tests/backup/roundtrip.test.ts` — Full backup then wipe-restore preserves all data end-to-end

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0052 | restores every table, re-links the publish cycle, and rebuilds an entity tree | A backup/restore losing rows, breaking the publish pointer, entity trees, or simulator JSON | If any seeded table's count changed, the cyclic published-version pointer wasn't re-linked, entity parent links broke, or simulator relations/JSON didn't survive |

### `tests/help/guide-backup-roundtrip.test.ts` — User Guide backup→restore round-trip

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0053 | restores content + the whole image library with ids (and image refs) preserved | A guide restore that loses chapters/sections/images, corrupts image bytes, or breaks image links | If restore lost rows, changed image bytes, dropped ids/refs, or lost adminOnly/metadata |
| T0054 | is idempotent — restoring twice yields one set, not duplicates | Re-running a restore creating duplicate chapters/images | If restoring twice produced more than the original row counts |
| T0055 | rejects a non-guide / garbage upload before touching the DB | A bad upload wiping the live guide tables before failing | If a garbage upload didn't throw before the destructive wipe |

### `tests/stripe/webhook.test.ts` — Stripe webhook subscription state machine (grant / revert / dunning)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0386 | (tierIdForStripePriceId) maps a known price id to its tier; unknown → null | A paid price resolving to the wrong plan, or crashing on an unknown price | If the price→tier lookup returned the wrong tier or didn't null an unknown price |
| T0387 | (userIdForSubscription) resolves by stripeCustomerId; unknown customer → null | A webhook updating the wrong user, or erroring on an unknown customer | If the customer→user lookup mis-resolved or didn't null an unknown customer |
| T0388 | (applySubscriptionToUser) maps priceId → tier and stamps subscription fields | A completed payment not granting the tier / sub id / status | If applying a subscription didn't set the tier, stripeSubscriptionId, status, or hasChosenTier |
| T0389 | (applySubscriptionToUser) cancel_at_period_end:true sets subscriptionEndsAt to current_period_end | A scheduled cancellation not recording its end date | If a cancel-at-period-end sub didn't store subscriptionEndsAt |
| T0390 | (applySubscriptionToUser) reassignTrial:true restamps subscriptionAssignedAt; false leaves it | The monthly usage anniversary resetting at the wrong moment | If reassignTrial didn't restamp on checkout, or restamped on a routine update |
| T0391 | (applySubscriptionToUser) unknown priceId is a no-op (no tier written) | An unrecognised price corrupting the user's tier | If an unknown price wrote a tier/sub id instead of a no-op |
| T0392 | (handleSubscriptionDeleted) sets status canceled + grace end and KEEPS stripeSubscriptionId | A cancelled sub not entering grace, or losing the id needed to re-subscribe | If deletion didn't set canceled + end date, or cleared stripeSubscriptionId |
| T0393 | (handleSubscriptionDeleted) unknown customer → no-op | A deletion for an unknown customer crashing or mutating data | If an unknown customer caused an error or a write |
| T0394 | (handleInvoicePaymentFailed) sets status past_due | A failed payment not flagging the account for the warning UI | If a payment failure didn't set past_due |
| T0395 | (handleInvoicePaymentFailed) unknown subscription → no-op | A failure event for an unknown sub mutating data | If an unknown sub caused a write |
| T0396 | (handleInvoicePaymentFailed) no subscription on invoice → no-op | A non-subscription invoice being mishandled | If an invoice without a subscription caused a write or crash |
| T0397 | (handleInvoicePaymentSucceeded) sets status active and clears ONLY prior-period UsageCounter rows | A renewal wiping the CURRENT period's usage (free quota), or not clearing stale periods | If it cleared the current period / all-time row, or didn't set active |
| T0398 | (handleInvoicePaymentSucceeded) unknown subscription → no-op | A success event for an unknown sub mutating data | If an unknown sub caused a write |
| T0399 | (lazy downgrade via getEffectiveSubscriptionLevelId) past end date → Free; future → still paid | A cancelled user keeping paid access past their end date, or losing it early | If the effective level didn't drop to Free after the end date, or dropped before it |

### `tests/projects/delete-authorization.test.ts` — Project-delete tier authorization (requireRole + the verdict)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0400 | (requireRole) null session → 401 | An anonymous caller performing an org-admin action | If a null session resolved a role instead of 401 |
| T0401 | (requireRole) a user with no org membership cannot resolve an org → throws | A non-member being treated as having a role | If a membership-less user resolved a role instead of throwing |
| T0402 | (requireRole) a member whose role is NOT in allowedRoles → 403 | A Viewer/Editor performing an Owner/Admin-only action | If a disallowed role passed the gate |
| T0403 | (requireRole) an allowed role → returns { role } | A legitimate Owner/Admin being blocked | If an allowed role was denied |
| T0404 | (requireRole) an Admin member also passes when Admin is allowed | Admins being excluded from admin actions | If Admin failed when Admin was in the allowed set |
| T0405 | (authorizeProjectDelete) all combinations — hard=SuperAdmin+owner, archive=OrgAdmin, unorganise=owner/SuperAdmin/OrgAdmin | The wrong person being allowed (or denied) to hard-delete / archive / unfile a project | If any of the 3 booleans × 3 modes returned the wrong verdict |
| T0406 | (authorizeProjectDelete) hard denial carries the SuperAdmin-owner message | A confusing error when a non-SuperAdmin attempts a hard delete | If the hard-delete denial lost its specific message |

### `tests/stripe/checkout-wiring.test.ts` — Checkout/portal URL building, tier validation, customer dedup

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0433 | (originFromRequest) forwarded host + proto → proto://host | Stripe redirecting users to an unreachable internal address behind the proxy | If the X-Forwarded host/proto weren't used to build the origin |
| T0434 | (originFromRequest) forwarded host, no proto → defaults to https://host | A forwarded host without a proto producing a broken redirect URL | If the proto didn't default to https |
| T0435 | (originFromRequest) a non-https forwarded proto is honoured | A local/proxy http setup being forced to https incorrectly | If a provided proto were ignored |
| T0436 | (originFromRequest) no forwarded headers → new URL(req.url).origin | A direct (non-proxied) request building the wrong origin | If the fallback to the request's own origin broke |
| T0437 | (paid-tier validation) each paid tier id is accepted | A real plan being rejected at checkout | If a valid paid tier id failed validation |
| T0438 | (paid-tier validation) free / unknown / empty / missing are rejected | A checkout for Free or a bogus tier proceeding | If a non-paid/unknown tier passed validation |
| T0439 | (getOrCreateStripeCustomer) existing stripeCustomerId → returns it, Stripe never queried | A duplicate Stripe customer being created for an existing one | If an existing id triggered a Stripe lookup/create |
| T0440 | (getOrCreateStripeCustomer) null id + a tagged customer in the list → REUSES it, create NOT called | Duplicate customers (DATA-31) when a prior create persisted only partially | If a metadata-tagged customer wasn't reused and a second was created |
| T0441 | (getOrCreateStripeCustomer) null id + empty list → CREATES a new customer, persists it to the DB | A new payer not getting a Stripe customer, or it not being saved | If no customer was created, or the new id wasn't persisted |
| T0442 | (getOrCreateStripeCustomer) a soft-deleted customer with our tag is NOT reused | Re-attaching to a deleted Stripe customer | If a `deleted:true` tagged customer was reused |

### `tests/notifications/read.test.ts` — Marking notifications read (recipient-scoped)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0477 | a recipient marks their own notification read → readAt set | A user's "mark read" not working | If marking own notification didn't set readAt |
| T0478 | a second mark is idempotent → readAt unchanged | A re-mark overwriting the original read time | If a second mark changed readAt |
| T0479 | a DIFFERENT user cannot mark it → 404 AND it stays unread | One user marking (or peeking at) another user's notification | If a non-recipient could mark it, or it didn't 404 |
| T0480 | a missing notification → 404 | A confusing error on a non-existent notification | If a missing id didn't 404 |
| T0481 | mark-all marks ONLY the caller's unread | Mark-all touching other users' notifications | If mark-all read another user's notifications |

### `tests/groups/membership.test.ts` — Collaboration-group membership (owner-scoped + notifications)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0482 | owner invites a user → invited member row + a group-invite notification on the invitee | An invite not creating membership or not notifying | If invite didn't create the member row or the group-invite notification |
| T0483 | a NON-owner inviting → 403 and NO member created | A non-owner adding people to someone else's group | If a non-owner's invite succeeded or created a row |
| T0484 | owner inviting THEMSELVES → skipped (no row, no notification) | The owner being added as a member of their own group | If self-invite created a member/notification |
| T0485 | invitee ACCEPTS → status accepted + the owner gets a group-invite-accepted notification | An accept not registering or not notifying the owner | If accept didn't set status accepted or notify the owner |
| T0486 | invitee DECLINES → status declined + the owner is notified | A decline not registering or not notifying | If decline didn't set status declined or notify the owner |
| T0487 | owner REMOVES a member → soft-removed (status=removed) + the removed user notified | A removal not taking effect or not notifying the removed user | If remove didn't set status removed or send group-removed |
| T0488 | a non-owner trying to remove a different member → 403 (Owner only) | A member removing other members | If a non-owner could remove someone else |
| T0489 | an action on a non-member → 404 | A confusing error acting on a non-member | If an action on a non-member didn't 404 |

### `tests/entity-lists/node-ops.test.ts` — Entity-list node create/update/delete validation

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0490 | (createNode) empty name → 400 | A nameless node being created | If an empty name was accepted |
| T0491 | (createNode) invalid level → 400 | A node with an out-of-range hierarchy level | If an invalid level was accepted |
| T0492 | (createNode) parentId not in this list → 400 | A node parented to a node from a different list | If a foreign-list parent was accepted |
| T0493 | (createNode) valid → creates a top-level node in the list | Node creation not working | If a valid top-level create failed |
| T0494 | (createNode) valid with a parent → creates the node under that parent | Child-node creation not working | If a valid child create failed or mis-parented |
| T0495 | (updateNode) unknown node → 404 | A confusing error updating a non-existent node | If an unknown node didn't 404 |
| T0496 | (updateNode) empty name → 400 | Renaming a node to blank | If an empty name was accepted on update |
| T0497 | (updateNode) invalid level → 400 | Setting an out-of-range level on update | If an invalid level was accepted |
| T0498 | (updateNode) parentId === nodeId (self-parent) → 400 | A node becoming its own parent (a cycle) | If self-parenting was accepted |
| T0499 | (updateNode) parentId not in list → 400 | Reparenting to a node from another list | If a foreign-list parent was accepted on update |
| T0500 | (updateNode) valid rename applies | A rename not taking effect | If a valid rename failed |
| T0501 | (updateNode) valid reparent applies (move child to top level) | A reparent not taking effect | If a valid reparent failed |
| T0502 | (deleteNode) unknown node → 404 | A confusing error deleting a non-existent node | If an unknown node didn't 404 |
| T0503 | (deleteNode) valid leaf delete → the node is gone | Node deletion not working | If a valid delete didn't remove the node |
| T0504 | (deleteNode) deleting a parent cascades to its children | Orphaned child nodes after a parent delete | If deleting a parent left its children behind |

### `tests/entity-lists/bpmn-org-build.test.ts` — Build Org Hierarchy from BPMN + move entries between levels

Two pure units behind "Populate from BPMN" (`extractOrgTreeFromBpmn`) and the refine-by-moving controls (`planMove`). The org hierarchy invariant is `level == ORG_STRUCTURE_LEVELS[min(depth,3)]`, so a move re-levels the whole moved subtree by depth.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T1101 | extract: white-box Pool→Organisation, Lane→OrgUnit, Sublane→Team | The BPMN→level mapping drifting | If the pool/lane/sublane walk or level mapping regresses |
| T1102 | extract: black-box pools + blank labels are skipped | External-participant pools polluting the org hierarchy | If the white-box filter / blank-label trim regresses |
| T1103 | extract: deduped by name within the same parent, across diagrams | The same Organisation/Unit/Team appearing once per diagram | If cross-diagram dedupe regresses |
| T1108 | flat extract: pools/shapes → Participants / IT Systems / Documents / Data Stores, deduped | The named structure missing (or mis-classifying) the four flat lists | If `extractFlatEntitiesFromBpmn` classification/dedupe regresses |
| T1104 | move: promote re-parents to the grandparent and re-levels the subtree | A promoted node keeping its old level while its children mismatch depth | If `planMove` promote / subtree re-level regresses |
| T1105 | move: demote nests under the previous sibling and re-levels down | Demote landing at the wrong parent/level | If `planMove` demote regresses |
| T1106 | move: up/down swaps sortOrder with the adjacent sibling, no level change | Reorder accidentally re-levelling a node | If reorder changes level or picks the wrong sibling |
| T1107 | move: impossible moves are no-ops (top-level promote, first-sibling up/demote) | A move at a bound corrupting the tree | If the bound guards drop |

### `tests/conformance/connector-conformance.test.ts` — Connector conformance on layout output

Pins the deterministic connector-quality checks behind the AI-connector complaints ("too many segments", "endpoints not moveable"). The same `findConnectorConformance` net is reused by the AI conformance harness (`npm run ai:report`). The over-segmentation rule keys off the editor's ≥9-waypoint "user-customised, stop re-routing" lock.

| Ref | Test | Plain-English risk it heads off | Goes red if… |
|---|---|---|---|
| T0505 | over-segmentation detector flags a routed connector with > 8 waypoints | An auto/AI connector silently treated as user-customised — locked + too many segments | If a >8-waypoint routed connector wasn't flagged |
| T0506 | detector passes an auto route (≤ 8 waypoints) | False positives on normal L-shape / vertical-jog routes | If a 7 or 8-waypoint route was wrongly flagged |
| T0507 | detector ignores non-routed types (a message flow's fixed waypoints) | Message flows wrongly flagged as over-segmented | If a 12-waypoint message flow was flagged |
| T0508 | `layoutBpmnDiagram` linear flow → clean wiring (no crossing/over-segmented/non-moveable) | The layout emitting non-conformant connectors on a basic flow | If a linear layout had any conformance issue |
| T0509 | `layoutBpmnDiagram` gateway split + merge → clean wiring | The layout emitting crossings/over-segmentation on branching | If a gateway layout had any conformance issue |
| T0510 | rework loop (back-edge with a sibling stacked above the source) → clean wiring | The loop-back connector clipping through its own source body (the AI harness's `rework-loop` defect) | If the back-edge routed top→top into the blocking sibling and clipped the source |
| T0511 | book-trip compensation fan-out (real AI plan fixture) → clean wiring | A 2-way gateway with a level-right target clipping its own target body (the AI harness's `book-trip-allornothing` defect) | If the gateway forced top/bottom by index and jogged into the level target |
| T0512 | Cause A (clinical-trial-intake fixture): loop-node coincidence crossings ≤ 4 (ratchet) | The layout stacking rework-loop control gateways on one cell getting WORSE before fixed | If a change pushes coincidence foreign-node crossings above baseline |
| T0513 | Cause B (billing-claims fixture): dense-column crossings ≤ 5 (ratchet) | The router cutting through dense-column neighbours getting WORSE before fixed | If a change pushes dense-column foreign-node crossings above baseline |

---

## Layer 3 — Export & interchange

### `tests/json/roundtrip.test.ts` — Portable JSON export → import round-trip preserves diagram data

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0056 | (per scenario) `<name>` — survives JSON serialise → parse | A saved/exported diagram coming back missing shapes, connectors, or labels | If JSON export/import dropped or mangled any element, connector, or label, or altered the data structure |
| T0057 | element ids and connector source/target ids are preserved exactly | Connections silently pointing at the wrong shapes after a JSON save | If export/import changed element ids or rewired a connector's source/target |
| T0058 | numeric geometry + waypoints survive without precision loss | Shapes or connector lines shifting position after a save/reload | If export/import altered any x/y/width/height or connector waypoint coordinate |

### `tests/xml/roundtrip.test.ts` — XML export → import round-trip plus real XSD schema validation

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0059 | (XSD validation) is well-formed XML (parses without error) | A corrupt XML export file that no tool can open | If the exporter emitted malformed/unparseable XML |
| T0060 | (XSD validation) the XSD itself compiles (no duplicate global type definitions) | A broken schema that rejects every export under strict validators | If a global type were declared twice (or the schema otherwise failed to compile) |
| T0061 | (XSD validation) validates against public/diagramatix-export.xsd | Exports that don't match the published schema, breaking interop | If the export structure drifted from the XSD it claims to follow |
| T0062 | (XSD validation) declares the XSD's root element + target namespace | Files missing the namespace/version headers other tools rely on | If the root element, namespace URI, schemaVersion, or schemaLocation changed |
| T0063 | (XSD validation) contains the diagram payload (elements + connectors blocks) | An export that omits the actual diagram content | If the elements or connectors blocks were missing from the XML |
| T0064 | (every scenario) `<name>` — exported XML is XSD-valid | Specific diagram shapes producing schema-invalid exports | If any scenario's exported XML failed XSD validation |
| T0065 | (round-trip) `<name>` — survives export → parse | An XML save losing shapes, connectors, labels, type, or name | If export/import dropped any element/connector/label or lost the diagram type or name |
| T0066 | element ids + connector source/target ids round-trip exactly | Connectors rewiring to the wrong shapes through XML | If ids or connector endpoints changed across XML export/import |
| T0067 | every imported connector references existing elements (no dangling refs) | A reopened diagram with arrows pointing at deleted/missing shapes | If import produced a connector whose source or target element was absent |

### `tests/ddl/roundtrip.test.ts` — DDL generate → parse → import back to a Domain diagram

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0068 | (generation) `<dialect>` — generates non-empty DDL | The "export database schema as SQL" feature producing empty/broken SQL | If a dialect emitted no CREATE TABLE / missing core tables, or parsing it threw |
| T0069 | all three dialects produce DISTINCT, dialect-specific DDL | Postgres/MySQL/SQL Server exports being identical instead of dialect-correct | If two dialects produced the same SQL or lost their dialect markers (BIGSERIAL/AUTO_INCREMENT/IDENTITY/GO) |
| T0070 | `<dialect>` — round-trips into a Domain diagram (tables + FKs survive) | Importing a SQL schema losing tables, columns, PK/FK flags, or relationships | If import dropped tables, lost the project.user_id FK, or failed to draw the org_member→app_user link |
| T0071 | all three dialects yield the SAME table set + comparable FK counts | SQL Server imports silently losing all relationships (the old 0-FK bug) | If any dialect's imported table set differed or its FK connector count diverged |
| T0072 | (two-table model) reconstructs both tables with their columns | A hand-written SQL model importing with wrong/missing columns | If parsing lost columns or PK/NOT NULL flags on the sample model |
| T0073 | reconstructs the FK as a uml-association connector with multiplicities | A foreign key not drawn as a relationship with correct cardinality | If the FK connector was missing, mis-pointed, or had wrong multiplicities |
| T0074 | the same model parses in MySQL syntax (backtick ids) | MySQL-style backtick-quoted SQL failing to import | If backtick-quoted ids weren't parsed into tables + the FK connector |
| T0075 | the same model parses in SQL Server syntax (bracket-quoted ids, GO, schema prefixes) | SQL Server bracket/GO/schema-prefix SQL failing to import | If bracket ids, GO separators, or schema prefixes broke table/column/FK parsing |
| T0076 | SQL Server out-of-line ALTER TABLE … ADD … FOREIGN KEY is honoured | FKs added via ALTER TABLE being ignored on import | If an out-of-line ALTER TABLE foreign key didn't produce the FK flag + connector |

### `tests/visio/export-matrix.test.ts` — Visio export structural soundness across BPMN structures

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0077 | `<name>` — exports a structurally valid VSDX | Visio files with dropped, duplicated, or replicated shapes (the pool-onto-tasks bug) | If export gave any element not exactly one shape, left a dangling master, or duplicated shapes |

### `tests/visio/golden-snapshots.test.ts` — Visio export golden structural snapshots for canonical diagrams

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0078 | linear flow | An unnoticed change to how a simple flow exports to Visio | If any shape's master, name, geometry, or shape counts changed vs the blessed snapshot |
| T0079 | pool with two lanes | Collateral damage to Pool/Lane export structure | If the pool/lane snapshot (masters, geometry, sub-shape counts) shifted |
| T0080 | expanded subprocess with internals | A subprocess exporting with different/extra inner shapes | If the subprocess snapshot diverged from the blessed projection |

### `tests/visio/pool-lane-registry.test.ts` — Visio Pool/Lane invariant registry guarding Phase-3 rollback

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0081 | `<name>` — pool/lane + geometry invariants hold | Pools replicating onto tasks or pool/lane shapes being mis-sized/positioned | If findPoolLaneViolations or findGeometryViolations reported any problem for that structure |

### `tests/visio/roundtrip.test.ts` — Visio export → re-import round-trip is lossless

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0082 | `<name>` — survives export → import | A diagram sent to Visio and back losing shapes, labels, or connectors | If re-import changed element count/type mix, connector count, labels, or raised a data-loss warning |

### `tests/translate/flowchartToBpmn.test.ts` — Deterministic Standard-Flowchart → BPMN transform

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0083 | maps a linear terminator→process→terminator into start/task/end with a pool | Basic flowchart shapes mis-translating to BPMN equivalents | If terminator→start/end, process→task, the named pool, or the sequence flow changed |
| T0084 | maps a decision to an exclusive gateway and preserves Yes/No branch labels | Decisions losing their gateway type or branch labels | If the decision wasn't an exclusive gateway or the Yes/No labels were dropped |
| T0085 | splices a document out of the sequence and attaches it by association | A document shape clogging the flow instead of annotating an activity | If the document wasn't a data-object, stayed in sequence, or lost its association |
| T0086 | maps a database to a data-store | Database shapes not becoming BPMN data-stores | If the database didn't translate to a data-store or the count was wrong |
| T0087 | splices on/off-page connector jump pairs so flow stays connected | Off-page jump stubs breaking flow continuity | If the jump stubs were emitted or the flow wasn't stitched across them |
| T0088 | maps vertical swimlanes to a pool + lanes and assigns nodes by centre-x | Swimlanes not becoming lanes or nodes landing in the wrong lane | If lanes were wrong/mislabelled or a node was assigned to the wrong lane by centre-x |
| T0089 | is deterministic — identical input yields identical output | The same flowchart translating differently each run | If two runs of identical input produced different output |
| T0090 | swimlanes survive layout as pool lanes with the flow spread left-to-right | Lanes collapsing so every element stacks in one column | If lanes weren't parented to the pool, flow wasn't parented to lanes, or stayed in one x-column |
| T0091 | lays out through the real BPMN engine with non-empty waypoints on every connector | A translated diagram crashing the editor from missing connector routes | If layout yielded no connectors or any connector had no waypoints |

### `tests/translate/flowchart-parallel-comment.test.ts` — Flowchart → BPMN translation of parallel bars and comments

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0092 | maps both parallel bars to parallel gateways (the pair) | Fork/join bars not becoming proper parallel gateways | If either parallel bar translated to something other than a parallel gateway |
| T0093 | keeps the concurrent branches as sequence flow through the gateways | Parallel branches losing their connections through the gateways | If any fork/join branch wasn't emitted as a sequence connection |
| T0094 | maps the comment to a text-annotation attached by association, not sequence | A comment wrongly inserted into the process flow instead of annotating it | If the comment became non-annotation, lost its association, or got a sequence flow |
| T0095 | lays out through the BPMN engine with waypoints on every connector | The translated diagram crashing the editor due to missing connector routes | If layout produced no connectors or any connector lacked waypoints |

### `tests/translate/prompt-mapping.test.ts` — AI prompt line generated from the canonical flowchart mapping table

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0096 | includes every distinct promptText from the table | The AI prompt drifting out of sync with the code translator's mapping | If any mapping entry's promptText was missing from the rendered prompt |
| T0097 | opens with the TRANSLATE instruction and closes with the pool-wrap rule | The prompt losing its key opening instruction or pool-wrap rule | If the rendered prompt no longer started with the TRANSLATE line or contained the pool-wrap rule |
| T0098 | emits the shared on/off-page connector phrase only once | The prompt repeating a shared phrase and confusing the model | If the on/off-page phrase appeared more than once |
| T0099 | is embedded verbatim in the BPMN system prompt | The generated mapping not actually reaching the live AI system prompt | If buildSystemPrompt didn't contain the rendered mapping text |

### `tests/translate/refine-merge.test.ts` — AI tidy pass is structure-locked to the deterministic plan

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0100 | applies whitelisted label / taskType / gatewayType + connection label | The AI tidy pass failing to apply allowed label/type improvements | If a whitelisted label, taskType, gatewayType, or connection label wasn't overlaid |
| T0101 | ignores attempts to change id / type / pool | The AI silently re-typing or re-homing a node and corrupting the plan | If the merge let the model change an element's type or pool |
| T0102 | ignores added or removed elements and connections (count is preserved) | The AI adding ghost nodes or deleting real ones from the plan | If element/connection counts changed or a ghost node leaked through |
| T0103 | is a no-op when the model returns nothing useful | An empty AI response wiping or altering the deterministic plan | If an empty refinement changed the elements or connections |

### `tests/sharepoint/link-roundtrip.test.ts` — SharePoint file link on a Data Object survives save/load

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0443 | (JSON path) data-object sharepointLink (all four fields) round-trips intact | A linked SharePoint file silently unlinking after a JSON save/reload | If JSON export/import dropped or mangled `properties.sharepointLink` |
| T0444 | (JSON path) data-store sharepointLink (all four fields) round-trips intact | A Data Store's linked file unlinking on save/reload | If the data-store's sharepointLink didn't survive JSON |
| T0445 | (XML path) data-object sharepointLink round-trips intact via XML | A linked file unlinking through the XML export/import path | If the XML path dropped the data-object's link |
| T0446 | (XML path) data-store sharepointLink round-trips intact via XML | A Data Store's link unlinking through XML | If the XML path dropped the data-store's link |
| T0447 | the exported XML actually contains the serialised link (not silently dropped) | The XML carrying no link data, so import couldn't restore it | If the exported XML omitted the serialised sharepointLink |

### `tests/diagram/diagram-bundle.test.ts` — SuperAdmin diagram "bundle" export/import ID-remap

A bundle packages a diagram + its linked AI prompt (+ plan) + the aiComparison matrix + the per-model comparison diagrams. On import everything gets NEW ids, so the embedded cross-references must be rewritten. These pin the pure remap helpers.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T1096 | `remapDiagramData` rewrites `aiGeneration.promptId`, preserving the snapshot + other fields | An imported diagram's prompt link pointing at the source env's prompt id | If the promptId rewrite (or its immutability of siblings) regresses |
| T1097 | `remapDiagramData` is a no-op with no aiGeneration / an unmapped id | The remap corrupting a non-AI diagram or throwing on a missing map entry | If the guards drop |
| T1098 | `remapAiComparison` rewrites each `models[].diagramId`; unmapped ids are blanked | A comparison matrix pointing at source-env diagram ids (dangling links) | If the per-model remap / blank-on-miss regresses |
| T1099 | `comparisonDiagramIds` collects only real ids | The export missing (or over-collecting) per-model diagrams | If the id collector regresses |
| T1100 | `isDiagramBundle` validates the `kind` discriminator | Import accepting a non-bundle JSON | If the discriminator check regresses |

---

## Layer 4 — Diagram structure & layout

### `tests/bpmn/clean-layout.test.ts` — Global layout-invariant catcher across simple and dense BPMN diagrams

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0104 | linear flow — lays out with no global-invariant breaches | A basic start-to-end flow producing overlapping or malformed layout | If `findLayoutViolations` reports any breach for the linear diagram |
| T0105 | decision split + merge with labels — lays out with no global-invariant breaches | A labelled Yes/No split-and-merge colliding | If any global invariant breaks on the split+merge case |
| T0106 | rework loop-back (R8.04) under a forward flow — lays out with no global-invariant breaches | A backward rework loop overlapping the forward flow | If the loop-back layout violates a global invariant |
| T0107 | two pools + bidirectional messages — lays out with no global-invariant breaches | Cross-pool message flows colliding with pool contents | If the two-pool message case breaks a global invariant |
| T0108 | data objects + store around a task — lays out with no global-invariant breaches | Data objects/store overlapping the task or each other | If the data-object layout breaks a global invariant |
| T0109 | dense — 3-way decision, merge, boundary event, rework loop — lays out with no global-invariant breaches | Several rules firing at once and conflicting on a busy diagram | If any rule interaction produces a global-invariant breach |

### `tests/bpmn/layout-rules.test.ts` — Executable registry of code-enforced BPMN geometric layout rules

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0110 | registry is pinned — every rule has a unique id and an executable check | A layout rule being registered without proof it's enforced | If any rule id is duplicated or any rule lacks a check/title |
| T0111 | R5.09 — gateway labels sit top-left of the diamond, never on the right | Gateway question labels drifting to the right and overlapping branches | If the gateway label offset isn't both left and above the diamond |
| T0112 | R8.04 — right-to-left loop-back flows route via top/bottom, never the left face | Rework loops cutting across the left face of elements | If the backward connector's source or target side isn't top/bottom |
| T0113 | R8.11 — sequence connectors on the same element+face never share a connection point | Two arrows into one element stacking on the exact same point | If two incoming flows share the same target side and offset |
| T0114 | R3.06 — a flow to/from an Event attaches on the event's facing side | Start/end event arrows attaching on the wrong side | If the start flow doesn't exit right or the end flow doesn't enter left |
| T0115 | R6.16 — a decision gateway takes its incoming flow on the LEFT face | A gateway receiving its input on the wrong face | If the incoming connector's target side isn't left |
| T0116 | R3.10 — a decision gateway's branches fan out across distinct faces | Three branches piling onto one side of the gateway | If the three branch source sides aren't all distinct |
| T0117 | R6.19 — a merge gateway emits its outgoing flow from the RIGHT face | A merge's output leaving from the wrong side | If the merge's outgoing source side isn't right |
| T0118 | R6.25 — a merge gateway is placed to the RIGHT of all its source elements | A merge drawn left of or among its inputs, tangling the flow | If the merge x isn't past the right edge of both source tasks |
| T0119 | R8.10 — a boundary intermediate event emits from its OUTER face (away from the host) | A boundary event's flow exiting back into its host task | If a bottom-mounted boundary event's exit side isn't bottom |
| T0120 | R5.06 — two message flows on the same pool/task face don't share a connection point | Two message arrows on a task overlapping at one point | If the two message flows share the same side and offset |
| T0121 | R5.08 — every generated pool is rendered at the same (uniform) width | Pools rendering at ragged, mismatched widths | If the two pools end up with different rounded widths |
| T0122 | R6.18 — event-based gateway branches enter the target event on its LEFT face | Event-gateway branches entering target events on wrong sides | If any branch into an event has a target side other than left |
| T0123 | R6.17 — a decision gateway's top/bottom branches map to its top/bottom-most targets | Branches crossing because top/bottom exits don't match target order | If the top-most target's branch doesn't exit top or bottom-most doesn't exit bottom |
| T0124 | R8.02-input — an INPUT data object (data → element) is placed to the LEFT of its element | Input data objects appearing on the wrong side or mistagged | If the input data object isn't left of the task or isn't role=input |
| T0125 | R8.02-output — an OUTPUT data object (element → data) is placed to the RIGHT of its element | Output data objects appearing on the wrong side or mistagged | If the output data object isn't right of the task or isn't role=output |
| T0126 | R8.03 — a single-link Data Store is centred above/below its element, not beside it | A data store drawn beside its task instead of above/below | If the data store isn't horizontally centred or isn't above/below the task |

### `tests/bpmn/structural-rules.test.ts` — Executable registry of generative BPMN well-formedness rules

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0127 | registry is pinned — every rule has a unique id and an executable check | A generative rule registered without proof it's enforced | If any rule id is duplicated or any rule lacks a check/title |
| T0128 | R6.13 — a white-box pool with no start/end event gets a process-level start + end injected | A drawn process missing its required start and end events | If layout doesn't inject both a start-event and end-event |
| T0129 | R6.23 — a label-less exclusive decision gateway defaults to a "Decision?" question | A blank gateway being left without a question label | If the empty gateway's label isn't set to "Decision?" |
| T0130 | R3.08 — a process start event is forced into the pool's topmost lane | The start event staying stuck in a lower lane | If the start event's centre doesn't land within the top lane's band |
| T0131 | R6.12 — a connector pointing at a non-existent element is dropped | A broken arrow to a missing element surviving into the diagram | If a connector targeting the ghost element still exists after layout |

### `tests/bpmn/type-coverage.test.ts` — Cross-references that every BPMN type is wired everywhere

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0132 | every BPMN palette + AI element type has a symbol definition (size/label) | A placeable or AI-generated type with no shape definition | If a palette/AI type is missing from `ALL_SYMBOLS` |
| T0133 | every BPMN palette type is the AI schema can emit (or consciously palette-only) | A user-placeable type the AI can never generate | If a palette type isn't in the AI schema and isn't consciously excluded |
| T0134 | every BPMN element type is handled by the renderer | A type that has no SVG drawing branch | If a non-excluded type isn't referenced in `SymbolRenderer.tsx` |
| T0135 | every BPMN element type has an XSD export mapping (or a conscious exclusion) | A type missing from the export schema, breaking round-trips | If a type isn't found in `diagramatix-export.xsd` and isn't excluded |
| T0136 | every BPMN event-trigger type is handled by the renderer (the Cancel-bug guard) | An event trigger (e.g. Cancel) rendering with the wrong shape | If an event type isn't referenced in `SymbolRenderer.tsx` |

### `tests/flowchart/layout-decision-merge.test.ts` — Flowchart decision branching and merge convergence rules

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0137 | F4.02 — decision branches exit the left and right diamond points | Decision branches leaving the wrong corners of the diamond | If the two branches don't use left+right, or the left-placed one doesn't exit left |
| T0138 | F4.05 — merge inputs attach to the top edge, fanned apart | Merge inputs overlapping at one point on the wrong edge | If inputs don't both attach top with distinct left-to-right offsets |
| T0139 | every connector still has a non-empty waypoints array | A flowline rendering with no path | If any connector's waypoints array is missing or empty |

### `tests/flowchart/layout-parallel-database.test.ts` — Flowchart parallel-bar thickness/attachment and database placement

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0140 | (Parallel bar) F4.06 — keeps its default creation thickness | A parallel fork bar inflating into a labelled box | If the bar's height/width differ from the symbol definition defaults |
| T0141 | (Parallel bar) F4.07 — flowlines attach to the long (top/bottom) faces only | Flowlines attaching to the narrow ends of a parallel bar | If any flow attaches to the bar's left/right instead of top/bottom |
| T0142 | (Database) places the database to the side of its anchor, vertically centred | A database dropped into the vertical spine instead of beside its step | If the db isn't right of the anchor or isn't on the same row |
| T0143 | (Database) connects the database with a horizontal flowline | The database link routing vertically instead of straight across | If the db connector isn't right-to-left (horizontal) |
| T0144 | (Database) keeps the main flow vertical — the database is not in the spine | The database pushing the main flow off its vertical column | If process and end aren't in the same column |

### `tests/flowchart/layout-swimlane-crossing.test.ts` — Flowchart swimlane columns and crossing minimisation

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0145 | (swimlanes) creates one column per lane, left-to-right in first-appearance order | Swimlane columns appearing in the wrong order | If the columns don't read Customer, Sales, Billing left to right |
| T0146 | (swimlanes) parents each flow element to its lane column | Elements not belonging to their named lane | If any element's parentId isn't its lane's column id |
| T0147 | (swimlanes) positions each element within its lane column's x-range | An element drawn outside its own lane's column | If an element's centre falls outside its lane column's x-range |
| T0148 | (swimlanes) columns share the same top and height (one rigid band) | Lane columns rendering at ragged tops/heights | If the columns have more than one distinct y or height |
| T0149 | (crossing minimisation) places the re-converging node between its peers (not left-most as DFS would) | Connectors crossing because a merge node sits off to the side | If node m isn't positioned between p and q horizontally |

### `tests/diagram-type-matrix/structure.test.ts` — Structural soundness of laid-out non-BPMN diagram types

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0150 | (context / process-context / state-machine / value-chain cases) produces a non-empty diagram | A diagram type laying out to nothing | If `layoutGenericDiagram` returns zero elements for that case |
| T0151 | (each case) has no duplicate element ids | Two elements sharing an id and corrupting selection/editing | If the layout emits the same element id twice |
| T0152 | (each case) passes referential integrity (connectors + parent refs all resolve) | Connectors or container references pointing at missing elements | If `checkReferentialIntegrity` reports any dangling reference |
| T0153 | (each case) every connector references existing source + target elements | An arrow drawn to or from an element that doesn't exist | If any connector's source or target id isn't among the elements |
| T0154 | (each case) every parented child resolves to a real container of the expected type | A use-case/chevron/sub-state nested under a missing or wrong-type container | If a child's parent is missing, the wrong type, or a flat type wrongly nests |
| T0155 | (each case) every element has a finite, non-negative box | An element placed off-screen with broken or negative size | If any x/y/width/height is non-finite or width/height ≤ 0 |
| T0156 | dropped associations never leave a dangling connector (process-context use-case↔use-case) | A dropped use-case-to-use-case link leaving a broken arrow | If a surviving connector references a non-existent element after the drop |

### `tests/diagram-type-styles/order.test.ts` — Diagram-type sort order, default plus DB overrides

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0157 | default order is CO, VC, PC, AM, BP, FC, SM, DM | The built-in diagram-type ordering silently changing | If the default `sortOrder` values no longer produce that code sequence |
| T0158 | resolveDiagramTypeStyle returns the override sortOrder when present | An admin's custom tile order being ignored app-wide | If an override sortOrder isn't applied, or unrelated fields stop falling back to default |
| T0159 | a project-style comparator orders mixed diagrams by configured order then name | Project diagram lists sorting in the wrong order | If sorting by type-order then name no longer yields Alpha, Beta, Gamma, Zeta |

### `tests/diagram/archimate-preserved.test.ts` + `archimate-textgen-nesting.test.ts` — ArchiMate composition renders as VISUAL CONTAINMENT (nesting)

AI-generated ArchiMate expresses whole-part **composition** by nesting children inside their container (via `parentId`), not by drawing a composition line. Image reproduction honours the AI's per-shape `bounds` + `parent`; text-gen nests from `parent` alone.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T1068 | preserved: fractional `bounds` honoured (top-left origin, rows in drawn order) | The image reproduction ignoring geometry and re-flowing to a flat row | If `layoutArchimatePreserved` stops mapping bounds → px |
| T1069 | preserved: 3-level `parentId` chain set from `parent` | Nesting lost past 2 levels (ArchiSurance ⊃ Back Office ⊃ Car) | If parent resolution / depth handling regresses |
| T1070 | preserved: containers enclose their children + `archimateIsContainer` flag | A container drawn smaller than its contents (children spill out) | If the deepest-first grow pass regresses |
| T1071 | preserved: every nested composition line is dropped | Redundant composition lines drawn over the nesting | If the composition-drop filter regresses |
| T1072 | preserved: aggregation is kept as a drawn line | Aggregation wrongly swallowed by the composition drop | If the drop rule stops being composition-only |
| T1073 | preserved: parents render before children (array order) | Containers painted OVER their contents | If the ancestor-depth render sort regresses |
| T1074 | text-gen (no bounds): `parent` nesting → parentId chain + enclosing containers + no composition lines | Text-prompt composition staying a flat row of lines | If `layoutArchimateNested` regresses |
| T1075 | text-gen: a non-composition plan (serving/flow) is unchanged | The nesting path corrupting ordinary ArchiMate diagrams | If the `hasNesting` guard leaks into non-nested plans |
| T1076 | `notation: "icon"\|"box"` picks the expressed (`-icon`) or box catalogue master + `archimateIconOnly` | The image's icon-form Service/Event/etc. rendering as the wrong (box) form | If `archiShapeForm` / the notation plumbing regresses |
| T1078 | image elements render at STANDARD size (not scaled to image px); containers hug them | Ingested elements rendering ~4× too big | If `layoutArchimatePreserved` reverts to bounds×TARGET_W sizing |
| T1081 | Location type + Node/System Software icon forms ingest (composite-location; `-icon` masters; nested) | Location names rendering as Business Actors; Node/SysSw stuck in box form on ingestion | If `location` drops out of ARCHI_SHAPE or the notation plumbing regresses |
| T1082 | minimum inter-element gaps on ingestion — 20% BP general, 35% along a connector | Cramped, near-touching rows and connected elements with no room for the line | If `enforceArchiGaps` regresses |
| T1083 | connectors never share a connection point + the AI-reported side is honoured | Overlapping connector endpoints; connectors ignoring the drawn side | If the endpoint spread or `honorSides` in `buildArchiConnectors` regresses |
| T1084 | a Location may only be contained by a Location or a Grouping (illegal nesting dropped) | An Actor "containing" a Location; place-named actors wrongly nesting a Location | If the Location-containment guard in `resolveArchiParents` regresses |
| T1085 | a Node container wraps its children in the FRONT rectangle; trapeziums are external + capped at 80px | Children spilling into the 3D trapeziums; node depth ballooning on a big node | If the Node hug in `layoutArchimatePreserved` or `archiNodeDepth` regresses |
| T1086 | an opposing-parallel connector is straightened (both ends share an absolute coordinate) | The persistent sideways "kink" from independent source/target endpoint spreads | If the alignment/de-collide pass in `buildArchiConnectors` regresses |
| T1087 | a connector attaches to the reduced Service stadium (15% shorter), not the full bounds | A gap between the connector and the visible service pill | If the service-stadium branch in `projectToShapeBoundary` regresses |
| T1088 | a large drawn element replicates its size; typical elements stay ~standard | A wide role/process (Customer, Handle Claim) forced to a standard box on ingestion | If `layoutArchimatePreserved` reverts to fixed-size leaves |
| T1080 | long names WIDEN to stay ≤2 lines (height standard), and expanded siblings don't overlap (image gaps preserved) | Long labels cramming/growing tall, or expanded boxes colliding | If `archiFitSize` or `separateArchiSiblings` regresses |
| T1089 | And/Or junctions ingest → the `composite-junction-and`/`-or` masters (iconOnly) | Junctions dropped on image ingestion (no ARCHI_SHAPE mapping) — the original bug | If `and-junction`/`or-junction` fall out of `ARCHI_SHAPE` |
| T1090 | junctions render at a fixed 25px, not scaled to bounds or text-fit | A tiny junction inflating to a full labelled box | If the junction size guard in the layouts regresses |
| T1091 | relationships wired THROUGH a junction are kept as lines (source→junction→targets) | Junction edges being swallowed / not drawn | If the junction is no longer treated as a normal connector endpoint |

### `tests/archimate/relationship-matrix.test.ts` — Connector-picker validity matches ArchiMate 3.2 exactly

`public/archimate-relationships.json` is generated verbatim from the authoritative 3.2 workbook (Open Group cards + Archi's 62×62 matrix) by `scripts/gen-archimate-relationships.ts`. The picker highlights exactly what 3.2 permits (single tier — the spec's permitted set is derivation-inclusive; no direct/derived split).

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T1113 | matrix has 60 elements + version 3.2 + universal Association; Junction/Relationship excluded | The generated matrix losing elements or including pseudo-concepts | If the generator output shape regresses |
| T1114 | Equipment→Material permits Access (+ Assignment + Association) | The category-era gap (missing Access) creeping back | If the matrix drops the Equipment→Material Access triple |
| T1115 | matrix is DIRECTIONAL — Material→Equipment (realise+assoc) ≠ Equipment→Material | Treating relationships as symmetric | If lookup ignores source/target order |
| T1116 | a Grouping receives ≥11 relationships; Association is universal | Grouping under-handling (the old model's worst gap) returning | If Grouping rows or the universal add regress |
| T1117 | Assessment→Application Component does NOT permit Influence | Over-permits from the old category rules returning | If a spurious Influence triple appears |
| T1118 | Specialization only between the same concept | Specialisation offered across different types | If the diagonal-only rule regresses |
| T1119 | single tier — `derived` always empty; every element pair resolves to ≥1 | The picker showing a stale two-tier or an unresolved pair | If `getAllowedRelationships` regresses |
| T1120 | degraded mode — unknown element / missing name → allow all 12 (never blocks) | The picker hard-blocking on an unknown element | If the degraded fallback regresses |

### `tests/archimate/connectors.test.ts` — Pins distinct visual style for all 11 ArchiMate connector types

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0160 | has exactly 11 relationship types | The ArchiMate type list silently gaining or losing a relationship kind | If the `ALL_TYPES` list no longer holds exactly 11 unique types |
| T0161 | every type resolves to a defined style (no fall-through to undefined) | A connector type rendering as nothing because its style lookup falls through | If `styleFor` returns no style, a non-string colour, or zero width for any type |
| T0162 | no two types collapse to the same visual rendering | Two different relationship types looking identical on the canvas | If any two types share the same dash + start/end marker fingerprint |
| T0163 | influence is a dashed line + open arrowhead | The "influence" relationship losing its correct dashed open-arrow notation | If influence stops being dash `"6 3"` with a null start and open end arrow |
| T0164 | influence is visually distinct from access (dashed vs dotted) | "Influence" and "access" becoming indistinguishable (the original reported bug) | If influence and access end up with the same dash pattern |
| T0165 | composition — filled diamond at source, solid line, no target head | Composition losing its filled-diamond solid notation | If composition's start marker, end marker, or solid dash changes |
| T0166 | aggregation — open diamond at source, solid line, no target head | Aggregation losing its open-diamond solid notation | If aggregation's open-diamond start, null end, or solid dash changes |
| T0167 | assignment — filled ball at source, solid line, filled arrow at target | Assignment losing its filled-ball-to-filled-arrow notation | If assignment's circle-filled start, arrow-filled end, or solid dash changes |
| T0168 | serving — solid line, open arrowhead at target | Serving losing its solid open-arrow notation | If serving's null start, open end arrow, or solid dash changes |
| T0169 | access — dotted line, open arrowhead at target | Access losing its dotted open-arrow notation | If access stops being dotted `"2 3"` with an open end arrow |
| T0170 | triggering — SOLID line, filled arrowhead at target (not dashed) | Triggering wrongly rendering dashed instead of solid | If triggering becomes dashed or loses its filled end arrow |
| T0171 | flow — DASHED line, filled arrowhead at target (not dash-dot / open) | Flow losing its dashed filled-arrow notation | If flow stops being dash `"6 3"` with a filled end arrow |
| T0172 | specialisation — solid line, hollow triangle at target | Specialisation losing its solid hollow-triangle notation | If specialisation's open-triangle end or solid dash changes |
| T0173 | realisation — dotted line, hollow triangle at target | Realisation losing its dotted hollow-triangle notation | If realisation stops being dotted with an open-triangle end |
| T0174 | association — solid line, no arrowhead | Association gaining an unwanted arrowhead or dash | If association gains any marker or a dash pattern |
| T0175 | triggering vs flow differ ONLY by line style (both filled arrow) | Triggering and flow becoming indistinguishable | If both stop sharing a filled arrow, or their dash patterns become equal |
| T0176 | specialisation vs realisation differ ONLY by line style (both hollow triangle) | Specialisation and realisation becoming indistinguishable | If both stop sharing the open triangle, or their dash patterns become equal |
| T0177 | selection only changes cosmetics (colour/width), never the visual identity | Selecting a connector accidentally changing its notation, not just highlighting it | If selecting alters dash/markers, or doesn't turn it blue and thicker |

---

## Layer 5 — Connector routing & manual editor

### `tests/routing/invariants.test.ts` — Orthogonal router invariants over computeWaypoints directly

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0178 | every route is orthogonal (no diagonal segments) | Connectors drawing diagonal segments instead of right angles | If any segment across the compass-direction spread is neither horizontal nor vertical |
| T0179 | visible endpoints attach to the source + target element edges | Connector ends floating off the boxes they connect | If a route's first or last visible point isn't on the source/target edge |
| T0180 | a route never passes through its own source or target body | An arrow cutting through the box it starts or ends at | If a visible segment penetrates the source or target interior |
| T0181 | curvilinear + direct routings also stay attached at both ends | Curved or straight routing styles detaching from elements | If a curvilinear/direct route's endpoints aren't on the element edges |
| T0182 | obstacle on the straight line is detoured (crossings ≤ 0) | A single connector cutting straight through a third element | If any of the four directional routes crosses the obstacle box |

### `tests/editor/routing.test.ts` — Editor re-route characterisation on move actions

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0183 | baseline — fresh layouts route cleanly | A freshly generated linear/gateway diagram having bad routing | If `findRoutingViolations` flags either fresh layout |
| T0184 | re-route — moving a task DOWN keeps its connectors clean | Dragging a task down leaving broken connectors | If routing violations appear after moving task b down |
| T0185 | re-route — moving a task UP and back keeps its connectors clean | Dragging a task up leaving broken connectors | If routing violations appear after moving task c up |
| T0186 | obstacle — moving a branch task across the diagram re-routes around obstacles | Dragging a branch task past the gateway leaving a connector through an obstacle | If routing violations appear after moving Approve into the start column |

### `tests/editor/edits.test.ts` — Alignment, insert-space, and pool/lane edits keep routing clean

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0187 | (alignment) align top makes the selection share a top edge and keeps routing clean | Align-top not lining elements up, or breaking their connectors | If the aligned tops differ, or routing violations appear |
| T0188 | (alignment) smart align keeps routing clean | Smart align corrupting connector routing | If `findRoutingViolations` reports anything after smart align |
| T0189 | (insert space) inserting horizontal space shifts only the elements past the marker, routing clean | Insert-space moving the wrong elements or breaking arrows | If a left-of-marker element moves, a right-of-marker one doesn't shift, or routing breaks |
| T0190 | (pool / lane) adding a lane grows the pool's lane set, routing clean | Add-lane not adding a lane or breaking pool routing | If the lane count doesn't increase by one, or routing breaks |
| T0191 | (pool / lane) swapping two lanes keeps children with their lane and routing clean | Lane-swap losing children's positions or breaking connectors | If the two lanes don't swap their Y, or routing breaks |

### `tests/editor/edit-sequence.test.ts` — Random reducer edit sequences keep routing orthogonal and attached

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0192 | orthogonality + attachment hold across all random edit sequences | Combinations of moves/aligns/space-inserts producing broken connectors | If any non-crossing routing violation (diagonal or detached) appears in the seeded edit runs |

### `tests/editor/obstacle-sweep.test.ts` — Ratcheted sweep isolating editor re-route obstacle-avoidance gaps

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0193 | re-route never produces a non-crossing violation, and crossings stay ≤ 10 | A valid drag breaking orthogonality/attachment, or obstacle crossings getting worse | If any non-crossing violation appears, or the obstacle-crossing count exceeds the baseline of 10 |

### `tests/archimate/connector-rerouting.test.ts` — ArchiMate connectors re-attach on move so they never cross the element

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0194 | re-attaches an end whose stored side now faces AWAY (the through-the-body bug) | A connector cutting straight through the element you just moved | If a side facing away from the partner weren't re-picked to face it |
| T0195 | leaves a facing attachment untouched — keeps the user's exact click offset | A move needlessly snapping a still-valid attachment back to the side-centre | If a side already facing the partner had its offset reset or its side changed |
| T0196 | re-attaches only the offending end (the facing end keeps its offset) | Both ends being disturbed when only one needed re-routing | If the facing end's side/offset changed, or the offending end wasn't re-picked |
| T0197 | never leaves a side facing away across a spread of relative placements | Any element position / stored-side combo leaving a connector through a body | If, for any of the 8 placements × 16 side combos, a recomputed side still faced away |
| T0198 | AI-generated archimate connectors (real layoutGenericDiagram path) also re-attach after a move | AI-generated diagrams' connectors crossing elements on move (not just manual ones) | If a connector from the real archimate AI-layout faced away after the elements moved |

---

## Layer 6 — AI generation pipeline

### `tests/ai/ai-telemetry.test.ts` — AI usage telemetry context + measures

Every AI call records an `AiInvocation` row merged with the route's AsyncLocalStorage context (user/org/invocation-point). These pin the context plumbing (including the `enterWith`-in-helper bug that mis-attributed real usage as "unknown") and the User-Attempts / diagrams-generated split.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T1092 | context entered in the handler body reaches the seam across a following await | Route usage recorded with no user/org/label → "unknown" | If a route reverts to entering context inside an awaited helper |
| T1093 | the OLD form (enterWith INSIDE an awaited helper) loses the context → "unknown" | Silently reintroducing the mis-attribution bug | If the regression guard for the broken pattern is removed |
| T1094 | `AI_USER_METERED_POINTS` = the 11 quota-metered routes (incl. `sop.generate`); AI Tidy/Vectorize/Compare excluded | User Attempts drifting from the routes that actually consume quota | If the metered-set and the `recordUsage(...,"aiAttempts")` routes fall out of sync |
| T1095 | `recordDiagramGenerated` writes a row and never throws | "# diagrams generated" miscounting, or a telemetry failure breaking a generation | If the recorder throws or stops writing |

### `tests/sop/extractSkeleton.test.ts` — BPMN → SOP skeleton (deterministic)

The deterministic backbone of SOP generation: the AI only ever rewrites this structured skeleton, so these pin the extraction (never hallucinated) and — critically — the lane-scoping contract (global step numbers preserved) and both-direction hand-offs.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T2203 | whole-diagram scope → ordered steps with global numbers + data reads/writes + both hand-offs | Steps/roles/IO/hand-offs silently dropped from a generated SOP | If the extractor mis-orders steps or loses associations |
| T2204 | a LANE scope keeps GLOBAL step numbers (Requester = steps 1 & 3, not 1 & 2) | Role SOPs renumbering to 1,2,3 and losing cross-lane position | If lane filtering renumbers instead of filtering the global order |
| T2205 | a LANE scope surfaces inbound AND outbound hand-offs to the other lane | A role SOP missing "received from" / "handed off to" | If cross-lane connector detection regresses |
| T2206 | extraction is deterministic (same input → identical skeleton) | Non-deterministic SOP output run-to-run | If ordering/dedupe becomes order-dependent |

### `tests/archimate/relationship-matrix.test.ts` — junction targeting (subset)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T2201 | a junction TARGET permits Composition/Aggregation/Realisation + all directed relationships | Junctions wrongly rejecting valid relationships in the picker | If junction allow-all handling is removed |
| T2202 | a junction at EITHER end resolves to allow-all | Directed relationships blocked into/out of a junction | If `JUNCTION_NAMES` handling regresses |

### `tests/mining/parseEventLog.test.ts` — Process Mining event-log ingestion

The front door of Process Mining: CSV → normalised events → compressed variants. Everything downstream trusts this.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0584 | parseCsv handles quotes/embedded delimiters/CRLF/BOM + delimiter detection | Mangled logs (commas in fields, semicolon exports) | If the CSV scanner regressed |
| T0585 | guessMapping picks sensible columns from headers | A poor default column mapping | If the header heuristics regressed |
| T0586 | parseTimestamp accepts ISO + epoch s/ms, rejects junk | Events silently dropped or mis-timed | If timestamp parsing regressed |
| T0587 | buildEventLog groups by case, sorts by time, drops unmapped rows | Out-of-order traces / bad rows corrupting the log | If grouping/sorting/validation regressed |
| T0588 | identical traces compress to one variant with a frequency count | Variant explosion / wrong frequencies | If the variant keying/counting regressed |

### `tests/mining/discoverProcess.test.ts` — Process discovery (DFG → BPMN)

Variants → a directly-follows graph → a well-formed, simulatable BPMN plan.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0589 | buildDfg aggregates directly-follows counts, starts + ends | Wrong process frequencies | If the DFG aggregation regressed |
| T0590 | a branch → an exclusive split gateway; merges before End; refs resolve | Malformed/unroutable discovered BPMN | If gateway placement or referential integrity regressed |
| T0591 | a loop stays well-formed (back-edge + gateways) | Cyclic logs breaking discovery | If loop handling regressed |
| T0592 | edgeThreshold trims rare directly-follows edges | No way to tame spaghetti models | If frequency filtering regressed |

### `tests/mining/discoverStateMachine.test.ts` — candidate state-machine discovery

The log's state sequences → a UML state machine (states + event-labelled transitions + initial/final).

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0593 | extracts distinct states + event-labelled transitions with counts | Wrong state lifecycle / frequencies | If the state-transition extraction regressed |
| T0594 | entry transition labelled with the creating event; terminals reach Final | A malformed state machine (no start/end) | If initial/final wiring regressed |
| T0595 | discoverStateMachine lays out an editor-valid diagram with formal transitions | An unrenderable state machine / missing transition events | If layout or the transitionEvent tagging regressed |

### `tests/mining/transitionConformance.test.ts` — state-change conformance

Replay mined variants over a reference state machine → fitness % + deviations. The governance heart of Process Mining.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0596 | fitness = frequency-weighted fraction of cleanly-replaying cases | A wrong conformance headline | If the replay/fitness maths regressed |
| T0597 | flags undocumented transition + unknown state + unexpected exit | Real compliance breaches going unreported | If the deviation detectors regressed |
| T0598 | a fully-conforming log scores 100% with no violations | False positives on a clean process | If clean cases were mis-flagged |
| T0599 | a reference transition never seen is flagged as dead (w/ its connector id) | Dead/unused reference paths hidden + no overlay anchor | If dead-transition detection or the id passthrough regressed |

### `tests/mining/calibrate.test.ts` — the digital twin (mine → simulate)

Mined performance → a runnable simulation calibrated to reality.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0600 | sojourn durations, resource concurrency, clock unit + active hours | Wrong simulation inputs mined from the log | If the performance aggregation regressed |
| T0601 | fitDuration/fitArrival pick sensible SimDists; active hours → a calendar | Bad fitted distributions / working hours | If distribution fitting or the calendar derivation regressed |
| T0602 | calibrate writes cycle time, arrival, gateway branch probabilities + a team library | An uncalibrated / unusable twin | If the param-writing or branch-probability mapping regressed |
| T0603 | the whole pipeline yields a twin that actually simulates (completes work) | The mine→simulate loop silently producing a dead model | If any stage (parse→discover→calibrate→assemble→run) broke |

### `tests/diagram/state-machine-layout.test.ts` — state-machine Layout red rules

The dedicated `layoutStateMachine` (dispatched for flat state machines) enforces DiagramRules Group 3. These pin the geometry so a layout regression goes red.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0620 | S3.01/S3.02: initial top-left, finals bottom-right, left-to-right flow | The old grid's misplaced final + backward connectors returning | If placement stopped putting initial TL / finals BR or the LR layering broke |
| T0621 | S3.04: connection points on a node side ≥10px apart | Overlapping/coincident transition endpoints | If the endpoint fan-out regressed |
| T0622 | S3.05: reciprocal transitions (A↔B) don't cross | Crossing back-and-forth transitions | If reciprocal pairs stopped routing on different sides |
| T0623 | S3.06: horizontally-overlapping labels ≥ ½ label height apart | Transition labels stacking on top of each other | If the label de-overlap pass regressed |

### `tests/mining/validate-log.test.ts` — pre-import mapping verification

The advisory panel that confirms the column mapping and shows what would be discarded before ingesting a log.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0613 | a clean log: all usable, format + counts, no warnings, samples | The panel mis-reporting a good log | If usable/dropped counting, format detection or sampling regressed |
| T0614 | unparseable timestamps → dropped + format warnings | Silently ingesting a log whose timestamps don't parse | If the drop accounting or timestamp warning stopped firing |
| T0615 | single-value case id + all-single-event cases both warn | A mis-mapped case column producing garbage silently | If the "wrong case id" / "truncated log" heuristics regressed |
| T0616 | epoch timestamps are recognised | Flagging valid epoch logs as bad | If epoch (s/ms) detection regressed |

### `tests/mining/ai-process.test.ts` — AI-curated BPMN process

The miner's "✨ AI process" reuses the app's AI BPMN pipeline (rules + template + configured model) to curate a clean process from the mined paths. Only the prompt serialisation is pure; this pins it.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0611 | the brief carries activities + frequency-ranked paths | The model being fed an incomplete/mis-ordered picture of the mined process | If the serialisation dropped activities/paths or lost the frequency ordering |
| T0612 | uses the stats activity list when provided | Inconsistent activity ordering in the prompt | If the stats override was ignored |

### `tests/mining/ai-state-machine.test.ts` — AI-curated reference state machine

The miner's "✨ AI state machine" reuses the app's AI Generate pipeline (rules + template + configured model) to curate a clean reference from the mined lifecycle. Only the prompt serialisation is pure (the model call needs a live key); this pins it.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0609 | the brief carries states, entry, weighted transitions + terminals | The AI being fed an incomplete/incorrect picture of the mined lifecycle | If the serialisation dropped states/transitions/frequencies |
| T0610 | respects the stats state-list ordering when provided | Inconsistent state ordering in the prompt | If the stats override was ignored |

### `tests/mining/example-package.test.ts` — DiagramatixMINER Examples catalog

The adoptable process-mining sample (mirrors Simulator Examples): a portable package (compressed log + reference state machines) and the shipped Accounts Payable starter.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0604 | emptyMiningPackage is a version-1 scaffold (not yet adoptable) | A blank scaffold silently passing as a complete example | If the scaffold shape or validation floor changed |
| T0605 | validate catches the real failure modes (bad mapping, empty variants, dangling referenceSmKey) | A malformed package half-creating a project on adopt | If package validation weakened |
| T0606 | summarize counts references/cases/variants/states | Wrong catalog-card counts | If the summary shape drifted |
| T0607 | the shipped AP starter is a valid, self-consistent bundle | A broken/unadoptable seeded example shipping | If the generator or baked JSON regressed |
| T0608 | conformance oracle: permissive clean (181/200), strict flags 39 rework cases (144/200) | The sample's headline conformance story silently changing | If the baked log/references or the conformance engine changed |
| T0619 | ships a raw sampleLog that rebuilds to the same run (import-first flow) | The confirm-the-analysis import producing a different run than the baked one | If the sample log or the parser drifted |
| T0624 | the AI Explain-results brief carries the run's stats, top paths, conformance + artefacts (`explain-results.test.ts`) | The "Explain results" summary being fed wrong/empty numbers | If `buildExplainPrompt` stopped serialising a section |
| T0934-T0935 | `summariseMiningResults` — the deterministic (AI-off) Results summary templates paths/conformance/timing from the same facts, and degrades gracefully with no conformance/performance (`explain-results.test.ts`) | The AI-off mining fallback showing wrong numbers or crashing on partial runs | If the deterministic summariser drifted from the facts |
| T0625 | ships three choosable period scenarios (Jan 2025 / Jul 2025 / Jan 2026) with compliance DECLINING back in time (fitness strictly increasing toward the present; older months carry the unknown "Disputed" state + undocumented transitions) | The multi-scenario story silently flattening or reversing | If a period's mix/seed or the ordering changed |

### `tests/mining/` — standards interchange + optional state + governance (Changes A/B/C)

Accept a classic activity-only log (no state column), mine governance identifiers straight off events, and round-trip through IEEE XES + OCEL — the process-mining-standards gap analysis, made real.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0639 | `optional-state`: no state column → each event's state defaults to its activity name (classic 3-column log mines) | A standard Case/Activity/Timestamp log failing to import | If `buildEventLog` stopped deriving state |
| T0640 | `optional-state`: the Activity→State table supplies the lifecycle; `distinctActivities` seeds it in first-seen order | The Activity→State table (shown when no state column) not feeding discovery/the State Machine | If the `activityState` map or the seed helper regressed |
| T0641 | `governance`: control applied/expected/bypassed + effectiveness maths from Control IDs on events (governed activity ran without the control = bypass) | Mis-computing operating-effectiveness from mined Control IDs | If `computeGovernance` regressed |
| T0642 | `governance`: `logControlEffectiveness` surfaces it by control code (source "log"); unknown code → null; no ids → `hasGovernance` false (loop closure with GRC) | The GRC effectiveness panel not lighting up from Control IDs on the log | If the log-based effectiveness path or the query filter drifted |
| T0643 | `formats-xes`: parseXes maps concept/time/resource + custom keys, leaves state unmapped, flows through the normal pipeline | XES import mis-mapping the standard extensions | If the XES scanner or mapping guess regressed |
| T0644 | `formats-xes`: buildXes reconstructs traces from variants + round-trips back through parseXes | A corrupt/asymmetric XES export | If the exporter or its timestamps changed shape |
| T0645 | `formats-ocel`: parseOcel projects a multi-object OCEL log onto a chosen object type as the case (`ocelObjectTypes` ranks by reference count) | OCEL import silently dropping or mis-attributing events | If the OCEL normaliser (2.0/1.0) regressed |
| T0646 | `formats-ocel`: buildOcel emits single-object OCEL 2.0 that re-parses to the same variants | A non-round-tripping OCEL export | If the OCEL exporter shape drifted |

### `tests/documents/` — Document Editor (.docx export + collection isolation)

The User Guide editor generalised into a multi-collection **Document Editor** (`user-guide` + SuperAdmin `tech-design`), with a Markdown→Word `.docx` exporter.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0647 | `buildDocx` emits a valid `.docx` whose `word/document.xml` carries the title, chapter H1, section H2, a table, and a code fence | A corrupt/empty Word export | If the `docx` token-walk or the marked lexer usage regressed |
| T0648 | `:sym[…]:` symbol shortcodes render as their label text (no raw shortcode leaks into the Word doc) | Shortcodes leaking as literal `:sym[...]:` into exported docs | If the shortcode strip was dropped |
| T0649 | the composite unique allows the same slug in BOTH collections but rejects a duplicate within one | Slug collisions across documents, or losing per-collection uniqueness | If `@@unique([collection, slug])` changed |
| T0650 | a User Guide backup/restore (collection-scoped) leaves the Technical Design Notes intact | A user-guide restore wiping the tech-design notes — the central risk of the shared-model design | If `buildGuideBackup`/`restoreGuideBackup` lost their `collection` scoping |

### `tests/riskControls/` — Risk & Control (catalog + attach + RCM + checks)

Attach Risks/Controls (from an org-master → project-copy GRC catalog — Risks, Controls, Policies, Regulations, Audit Findings, KRIs, KPIs, joined by a directed traceability graph) to process steps, scan for coverage/segregation-of-duties gaps, and export a multi-sheet Risk-Control Matrix (flat audit grid + registers + traceability), and prove **operating effectiveness** by tying each Control to the DiagramatixMINER conformance deviation it guards ("bypassed in N of M cases"). Pure helpers + checks, the hand-built `.xlsx` writer, and DB round-trips for adopt + export + effectiveness.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0626 | `riskControlPatch` merges over the current annotation (shallow-merge safe) | Adding a control silently dropping the element's existing risks | If the patch stopped spreading the prior value (the reducer merges `properties` shallowly) |
| T0627 | B38 control-coverage flags a risk with no control; clean when covered | A Risk-Control Matrix coverage gap going unreported | If `checkControlCoverage` regressed |
| T0628 | B39 segregation-of-duties flags one lane that raises + approves; clean when split | A SoD breach (one team both raises and approves) going unflagged | If the lane-grouping / verb classification regressed |
| T0629 | the `.xlsx` writer builds a valid multi-sheet workbook with inline strings + XML escaping | A corrupt Risk-Control Matrix export that Excel can't open | If the OOXML zip shape or escaping broke |
| T0630 | adopt clones the org library into a SEPARATE project copy with items + links re-linked | The project copy sharing rows with the master, or dangling mitigation links | If `adoptLibrary`'s id-remap or isolation regressed |
| T0631 | the RCM export reflects on-model attachments + coverage (Covered / GAP) | The matrix mis-reporting where controls are attached or which risks are uncovered | If `buildRcmXlsx` gathering/coverage logic regressed |
| T0632 | the flat Audit Grid has one Activity×Risk×Control row carrying the audit/assurance columns (Automation, Evidence, Test method/frequency, Residual) | The auditor-standard flat RCM losing a mature column or mis-joining activity/risk/control | If the audit-grid builder or the audit-field wiring regressed |
| T0633 | GRC objects (Policy/Regulation) + the traceability graph clone on adopt and flow into the export (Traceability sheet verbs, GRC Register, audit-grid governance column) | The wider governance graph (policy↔control↔regulation) not persisting or not reaching the RCM | If the generalized `sourceId/targetId` links or the traceability/register export regressed |
| T0634 | control effectiveness: deviation-signature matching + bypassed/effectiveness maths (39/200 → 80.5%, unobserved → 100%, none → null) | Mis-computing "is the control operating" from mining conformance | If `deviationSignature`/`controlEffectiveness` regressed |
| T0635 | control operating-effectiveness from a real mining run's conformance flows into the export (bypassed cases + % in the Control Register; run named in the summary) | The RCM not reflecting whether controls actually operate on real data | If `loadLatestConformance` or the effectiveness export columns regressed |
| T0636 | the ready-made Order-to-Cash sample GRC library is internally consistent (unique codes, every kind present, links reference real items, every risk mitigated, governance chain present, monitor signatures well-formed) | The one-click O2C sample (`scripts/seed-risk-controls-o2c.ts`) seeding a broken/incoherent library | If `o2cSample.ts` data drifted |
| T0637 | the O2C mining example's deviations match the library's control monitor signatures (every monitored control finds its deviation in the mined log, cases > 0) — the self-contained demo | The demo project's controls showing no operating-effectiveness because the mined log and the library drifted apart | If the `gen-mining-examples.ts` O2C log or `o2cSample.ts` signatures changed independently |
| T0638 | the Risk & Control Examples package validates/summarizes + `O2C_ATTACH` references only real library codes | A GRC example (3rd catalog) adopting to a broken project or attaching to unresolvable codes | If `examplePackage.ts` validation or the `O2C_ATTACH` map drifted from the library |
| T0653 | org-wide renumber: clones of a master control collapse to one shared code; project-local items reusing a code stay distinct; each kind is one running org-wide sequence | Org-wide RCM numbering merging unrelated controls or splitting clones apart | If `assignOrgWideCodes` canonical grouping regressed |
| T0654 | the renumber is idempotent — re-running on already-numbered codes is a no-op | The renumber action churning codes every time it runs | If the stable ordering in `assignOrgWideCodes` regressed |
| T0655 | per-kind renumber scope — renumbering only Controls leaves Risks untouched (no code + no counter change) | The OrgAdmin "renumber one kind" action silently reflowing other kinds' codes | If the `kinds` filter in `assignOrgWideCodes` regressed |
| T0948 | re-home invariant — a project joining an org (its distinct items reusing the incumbent's codes) renumbers to collision-free codes; the moved items don't keep the incumbent's codes | Project Org Maintenance leaving duplicate RCM codes in the gaining org after a re-home | If `assignOrgWideCodes` stopped separating distinct-source items that reuse a code |
| T0656 | Compliance Monitoring rollup — Σapplied/Σexpected per control code over runs; below-threshold + declining detection; per-project latest | The org-wide compliance trend mis-aggregating effectiveness or missing at-risk controls | If `buildComplianceReport` rollup / flagging regressed |
| T0657 | Compliance falls back to conformance-deviation effectiveness when a run has no mined governance | Compliance ignoring controls that only have a `monitorSignature` (no Control-ID evidence) | If the `logControlEffectiveness ?? controlEffectiveness` fallback in `measure` regressed |

### `tests/ddl/physicalDdl.test.ts` — physical DDL of the live database

The SuperAdmin **DDL Generation** tile now offers, alongside the curated logical model, a **physical** DDL introspected straight from the live PostgreSQL catalog (real tables, native types, enums, keys, indexes). This pins the assembler.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0658 | `buildPhysicalDdl` emits enums, table columns (type / NOT NULL / DEFAULT), PK/unique/FK constraints and secondary indexes, filtering out indexes that back a constraint | A corrupt or duplicate-DDL physical export (e.g. re-emitting the PK's implicit index) | If the introspection-row assembly or the constraint-index filter regressed |

### `tests/pcf/importPcfXlsx.test.ts` — APQC PCF workbook parser

Level 0 of the APQC Process Classification Framework feature: hand-parsing the APQC PCF `.xlsx` (Combined sheet, via JSZip) into a node tree, deriving level + parent from the dotted Hierarchy ID.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0659 | `levelAndParent` derives the right level + parent code from a dotted Hierarchy ID (categories `N.0` = level 1; `N.M` parents to `N.0`; deeper drops the last segment) | A mis-built PCF tree (wrong depth or orphaned nodes) | If the dotted-code level/parent logic regressed |
| T0660 | `parsePcfWorkbook` parses a synthetic Combined sheet into a node tree — skips the header, unescapes XML entities, reads change-type / metrics-flag / description, keys on the stable PCF ID | A corrupt import (dropped rows, wrong names, broken parent links, lost attribution) | If the OOXML hand-parser or shared-string resolution regressed |
| T0661 | parses the **legacy per-category** format (no Combined sheet — one sheet per category, element in its level column, dotted code embedded in the cell) into the same node tree | Older APQC workbooks (e.g. Telecommunications v5.0.x) failing to import or building a wrong tree | If the legacy-format branch / embedded-code extraction regressed |
| T0662 | `seedFoldersFromPcf` (Level 2) mirrors a PCF branch to a depth cap, links folders to their PCF parent, and keeps the project's existing folders + diagram map | The "seed folders from PCF" action losing existing folders, ignoring the depth cap, or building flat/mis-parented folders | If the folder-seed builder regressed |
| T0663 | seeded folders anchor under a chosen parent folder | Seeded PCF folders always landing at the project root | If the `underFolderId` anchoring regressed |
| T0664 | (L3 AI grounding) `renderPcfBranchForPrompt` renders a classified process + its sub-activities as an aligned, indented reference block | AI generation losing the PCF alignment context or mis-nesting the sub-activities | If the branch-render / indentation regressed |
| T0665 | `groundRulesWithPcf` appends the PCF block to the AI rules, and is a no-op without a classification or when the node is a leaf | The PCF grounding silently dropping, or injecting an empty block | If the append / null-guard logic regressed |
| T0666 | (R6.14) `layoutBpmnDiagram` coerces a label-less element to an empty-string label (never `undefined`) so the renderer's `el.label.split` cannot white-screen the editor | A generated element with no label crashing the whole diagram editor on open | If the label-normalization pass in `layoutBpmnDiagram` regressed |
| T0667 | `buildPcfNodeWhere` resolves bare-code, bare-name and forgiving "code + name" APQC searches (code prefix OR name; bare integer also matches pcfId) | The Create-APQC pickers finding nothing when the field holds a seeded folder's "code + name" | If the search-matcher query shapes regressed |
| T0668 | (L4a) `computePcfCoverage` marks nodes modelled by nodeId or by pcfId (same framework only) and rolls modelled/total counts up the tree into per-category and per-level totals | APQC coverage over-counting cross-framework classifications, or mis-rolling category/level totals | If the coverage aggregation regressed |
| T0669 | (L4b) `buildComplianceReport` rolls control effectiveness up by APQC category (Σapplied/Σexpected + mean fitness per category), ordered worst-first and flagged below-threshold | The by-APQC-category compliance rollup mis-summing or mis-ordering | If the `byPcfCategory` grouping regressed |
| T0670 | (L5) `composeBranch` copies a subtree into a tailored framework with provenance (sourceFrameworkId/sourcePcfId), re-based levels, remapped parents and preserved sortOrder | The tailored-framework compose losing provenance or mis-nesting the grafted branch | If the compose logic regressed |
| T0671 | (L5) `diffPcfVersions` classifies added / removed / renamed nodes across two framework versions by stable pcfId (not the display code) | The upgrade wizard mis-detecting APQC version changes, or keying off the unstable hierarchyId | If the version-diff logic regressed |
| T0672 | `dataHasPcf` / `anyDiagramHasPcf` detect PCF-derived content (classification or a pcf-tagged element) so the APQC attribution notice rides along on exports; the notice carries APQC's derivative-works clause | An export leaking PCF content without the APQC attribution notice (licence breach) | If the export attribution-gating regressed |
| T0673 | (Live sources) `mintIngestKey`/`verifyIngestKey` mint a prefixed webhook key, store only its sha256 hash, verify the right key and reject wrong/missing keys (constant-time); `readIngestKey` reads X-Api-Key or Bearer | A webhook ingest key stored in plaintext, or accepting a wrong/blank key | If the ingest-key auth regressed |
| T0674 | (Live sources) `sourceHeaderFields` derives distinct role fields (dedup, drop blanks); `safeSource` never leaks the key hash, event buffer or secret connection config (Blob SAS URL / SharePoint ids) | A source-list response leaking the ingest hash or a Blob SAS URL | If the client-safe source projection regressed |
| T0675 | (Live sources) `parseAnyLog` routes CSV to headers/rows + guessed mapping and XES-shaped content to the XES parser | The pull connectors (Blob/SharePoint) mis-parsing a fetched log file | If the shared parse dispatch regressed |
| T0676 | (SuperAdmin bulk APQC gen) `folderSubtree`/`childrenInSubtree`/`orderDeepestFirst` walk the project's seeded folders (self+descendants, direct children, deepest-first so a child diagram exists before its parent links to it); `folderCode`/`folderCodeStrip` parse the APQC prefix | Bulk generation mis-counting diagrams, linking parents before children exist, or straying beyond the seeded folders | If the bulk folder-walk/ordering regressed |
| T0677 | (APQC descriptions) `addDescriptionAnnotation` appends a boxed (`properties.boxed`) text-annotation carrying the process's APQC element description above the flow of a non-leaf decomposition diagram; no-op on blank description or empty diagram; truncates very long text with an ellipsis | A non-leaf APQC diagram losing its element-description text box, or the annotation crashing on an empty/blank input | If the description-annotation helper regressed |
| T0678 | (APQC folder ids) `seedFoldersFromPcf` appends the stable 5-digit PCF id in parens to a seeded folder name ("1.0 Vision (10002)") when present, omits the suffix when absent | Seeded APQC project folders losing the 5-digit PCF id needed for later version diffs | If the folder-name id suffix regressed |
| T0679 | (APQC folder ids) `folderPcfId` parses the trailing 5-digit id from a folder name; `folderCode` still parses the leading dotted code and `folderCodeStrip` strips both ends to the bare name | The bulk generator mis-reading a folder's code or name once the 5-digit id suffix is present | If the folder-name parsers regressed |
| T0680 | (APQC level colours) `lightenHex` mixes a main colour toward white by %; `normalizeHex` validates hex; `pcfLevelStyle` yields the two-tone pair with white text on the main background and the main colour as text on the light background (deep levels fall back to the deepest); `normalizeScheme` fills every level from defaults, clamps `lightPct`, and ignores malformed/unknown input; `pcfLevelFromCode` derives the level from a dotted code (for folder colouring) | The APQC hierarchy colour scheme producing the wrong tone or unreadable text, a malformed stored scheme breaking a hierarchy render, or folders mis-coloured by level | If the level-colour maths/merge/level-derivation regressed |
| T0681 | (APQC Add option) `nextCopyName` appends the next "(n)" to a base name given the names already in a folder — starts at 1, skips existing "(k)" copies to max+1, treats the base literally (regex-escaped) | The "Add" conflict option colliding names or not incrementing "(n)" correctly | If the copy-name numbering regressed |
| T0682 | (Mining SM badges) `discoverStateMachine` carries each transition's case-count onto its connector (`transitionCount`) — entry, state→state, and terminal edges alike | The discovered state machine losing the per-transition frequency the green count badge shows | If the count-to-connector mapping regressed |
| T0683 | (Mining SM badges) `flagIllegalTransitions` marks discovered transition connectors the reference disallows (`inReference:false`) as `transitionIllegal` (→ red badge) and clears the flag on legal ones; never flags init/final edges | Illegal-vs-reference transitions not turning red, or legal ones wrongly flagged | If the illegal-transition flagging regressed |
| T0684 | (State-machine layout) S3.07: `layoutStateMachine` staggers states by column parity so successive states alternate above/below a central line (a near-linear chain zig-zags instead of sitting in one flat row), keeping the transition connectors distinguishable | A discovered/drawn state machine laying every state in one flat row with overlapping transitions | If the S3.07 zig-zag stagger regressed |
| T0685 | (Mining twin teams) `calibrateSimulation` falls a task with no mined resource back to its pool/lane team and returns a team library covering every team a task references (mined resources + pool fallbacks) — so a mined twin runs without a "team not in library" error | A mined simulation twin erroring on run because a task's team (e.g. the "Company" pool) isn't in the library | If the calibrate team fallback/library regressed |
| T0686 | (OCEL 2.0 object-centric) `parseOcelObjectCentric` projects EVERY object type to its own normalised table (not a single-type flatten), derives each object's `state` from a time-varying status attribute effective at each event's time, and extracts the object-to-object relationships (the Domain Diagram edges) | The OCEL importer silently discarding object types + relationships, or reading a status attribute's last value instead of its value at event time | If the OCEL 2.0 object-centric parse regressed |
| T0687 | (OCEL Domain Diagram) `buildDomainFromOcel` turns the OCEL object model into a Domain Diagram: one `uml-class` entity per object type (carrying its attributes), one `uml-association` per object-to-object relationship (labelled with its qualifier), and links each entity to its discovered state machine via `linkedDiagramId` when ids are supplied | The OCEL study's object-model backbone losing entities/associations, or classes not linking to their per-type lifecycle | If the domain-diagram generation regressed |
| T0688 | (OCEL study) `buildOcelStudy` mines ONE lifecycle per selected object type via the single-entity pipeline (variants + performance + governance + a deterministically discovered state machine with frequency badges), honours a per-type activity→state fallback, and keeps the object model for the Domain Diagram | The OCEL study mis-mining a type's lifecycle, ignoring the type selection, or not producing a discovered SM per type | If the OCEL study orchestrator regressed |
| T0689 | (OCEL interactions) `parseOcelObjectCentric` counts shared-event interactions per type pair (+ binding activity) and each activity's touched types; `buildDomainFromOcel` weights structural O2O associations (count → multiplicity + line thickness) and adds DASHED behavioural edges for shared-event-only pairs; `buildOcelStudy` tags a transition with the other object types its activity also touches | The object model losing the behavioural coupling between lifecycles — unweighted associations, missing behavioural edges, or absent "also touches" transition notes | If the interaction-weighting layer regressed |
| T0690 | (State naming + conformance) `buildEventLog` Capitalises state names (S1.06 — e.g. an OCEL status "placed" → "Placed"); `checkTransitionConformance` matches states case-insensitively (+ trimmed), keeping original labels for messages, so a lowercase discovered state machine conforms to a capitalised reference while genuine deviations are still caught | A discovered SM's lowercase states falsely deviating from a capitalised reference (and vice versa) | If state capitalisation or case-insensitive conformance regressed |
| T0691 | (Inferred state naming, S1.07) `pastParticiple`/`activityToState` turn an activity into a condition-style state — leading verb → past participle with irregulars (Pay→Paid), the e/y rules, and syllable-aware doubling (Ship→Shipped, Cancel→Cancelled, but Open→Opened not Openned); already-inflected words (Shipped, Closing) are left alone; used as the default when a log has no state column | Inferred states reading as commands ("Ship") or mangled ("Openned") | If the activity→state past-participle naming regressed |
| T0692 | (Domain layout clearance) a generated Domain Diagram lays its entities in a near-square, wide-clearance grid (e.g. 3 types → 2×2, not a flat row of 3) so associations have routing channels and fewer are forced across an entity box (the editor's red obstacle flag) | The object model packing entities into one long row so associations cross intervening boxes | If the domain grid clearance regressed |
| T0693 | (OCEL study example package) `validateMiningExamplePackage` accepts a study bundle — `runs[]` (one per object type) with per-run `discoveredSmKey` + `referenceSmKey`, plus a `domainDiagramKey` — and flags a dangling discoveredSmKey / domainDiagramKey that doesn't match a carried diagram | An OCEL study example capturing/adopting with a broken cross-reference (a run pointing at a diagram key that isn't in the bundle) | If the study-package schema/validation regressed |
| T0694 | (OCEL 2.0 XML) `parseOcelObjectCentric` parses the OCEL 2.0 XML serialization (`<log>` / `<object-types>` / `<objects>` with time-stamped `<attribute>`s + O2O `<relationship>`s / `<events>`) to the SAME object-centric model as OCEL JSON — per-type projections, status-attribute states (Capitalised), O2O + interactions — so the whole study pipeline works from an .xml log | OCEL 2.0 XML logs failing to import, or being mis-detected as XES | If the OCEL XML parse/dispatch regressed |
| T0695 | (Reference scoping) `runStates` collects a run's distinct observed states; `isRelevantReference` keeps a state machine as a conformance reference only when ≥ half the run's states overlap it (case-insensitive) — so an OCEL "Order" run's picker excludes the "Item"/"Invoice" machines (and, in the route, its own discovered mirror) | The reference picker offering cross-entity or self (discovered) state machines, letting a run be conformance-checked against the wrong lifecycle | If the reference-scoping overlap rule regressed |
| T0696 | (Simulation twin in an example) `validateMiningExamplePackage` accepts a calibrated run that carries its discovered BPMN (`discoveredBpmnKey`) + `twin` (SimulationStudy name + scenarios) with a package-level project-scoped team/calendar library; it flags a dangling `discoveredBpmnKey`, a `twin` with no BPMN root, and a team referencing a missing calendar | A captured OCEL study losing its mined digital twin on adopt, or a malformed twin package half-building a project | If the mining-twin package schema/validation regressed |
| T0697 | (Domain obstacle avoidance) `avoidObstaclesPostLayout` detours any Domain-Diagram association whose visible path crosses a non-endpoint entity box (matching Canvas's zero-margin `segCrossesRect` red flag) around the obstacle via `buildOrthogonalPath`, preserving the invisible centre leaders (arrowhead unmoved); an already-clear association is left byte-identical | A freshly-generated object model routing associations straight through unrelated entities so the editor flags them red | If domain association obstacle avoidance regressed |
| T0698 | (Process Portal search + facets) `reviewStatusOf` / `pcfTopCategory` / `filterRows` / `buildFacets` — the pure engine behind the Portal's in-memory browse: review-status classification, APQC top-category derivation from a hierarchyId, multi-term AND search across name/owner/pcf/type, facet counts over the full set with labels + ordering, and A–Z ↔ recency sort | The Portal mis-filtering, mis-counting a facet, or a search term silently matching nothing | If Portal search/facet logic regressed |
| T0699 | (Review-due cron) `isReviewDue` / `selectReviewDue` — a published diagram/bundle is due only once its review date has passed AND it hasn't been notified for the current window; idempotent after the cron stamps `lastReviewDueNotifiedAt`, and re-arms when the review date moves forward | The daily review cron spamming owners on every run, or never firing a genuine overdue reminder | If the review-due guard regressed |
| T0700 | (Diagram Portal denorm) `deriveDiagramDenorm` mirrors `DiagramData.pcf` + `.procedureDoc` onto the flat Diagram columns the Portal queries — classification (pcfId/hierarchyId/name), procedure URL with a name→URL fallback, clean nulls for absent/blank values, plus the extracted `entityRefs` | The Portal's category facet/search or procedure link going stale/blank because a save didn't sync the denormalised columns | If the save-path denormalisation regressed |
| T0701 | (Diagram entity extraction) `extractDiagramEntities` classifies a diagram's pools/lanes/systems into entity refs — white-box pools + lanes/sublanes → org names; black-box `isSystem` pools + data-stores/system shapes → systems; black-box non-system pools → external participants; case-insensitive dedup; blanks/junk dropped | The Portal's "which processes use System X / involve Team Y" mis-classifying or missing a pool/lane/system | If diagram entity extraction regressed |
| T0702 | (Portal canonical entity index) `resolveEntities`/`buildEntityFacets`/`matchesEntityValue`/`involvesMe` — normalized-exact match of diagram labels to Org Entity nodes, org refs rolled UP to ancestors (filter a Team → matches its child-Role processes), unmatched labels kept as flagged "uncatalogued" entries, and "Involving me" intersecting a reader's assigned nodes | Entity search mis-attributing a process to the wrong team/system, hiding un-catalogued processes, or the team roll-up / "Involving me" not matching child roles | If Portal entity canonicalisation/roll-up regressed |
| T0703 | (XML export — procedureDoc, schema 1.36) a diagram's `DiagramData.procedureDoc` (`{url,name?}`) is emitted as a `<dgx:procedureDoc>` element, the export stays valid against `public/diagramatix-export.xsd` (xmllint-wasm), url+name round-trip through export→parse, and the element is omitted (still valid) when absent | The new procedure-doc field silently dropped on XML export, or the v1.36 XSD change breaking export validity | If the procedureDoc export/XSD round-trip regressed |
| T0705 | (Split a sequence connector with an intermediate event) the `SPLIT_CONNECTOR` reducer replaces a sequence connector A→B with A→event and event→B when an intermediate event is dropped on it, the new event carries the chosen trigger type, and the original connector is removed | Dropping an intermediate event on a connector failing to divide it (as tasks/gateways do) | If intermediate-event connector splitting regressed |
| T0707 | (Attachment base64 encoding) `arrayBufferToBase64` encodes any-size ArrayBuffer without the call-stack argument limit (chunked apply), and round-trips — the old `btoa(String.fromCharCode(...bytes))` spread threw RangeError on larger files, silently breaking AI-Generate attachments (PNGs especially, being much bigger than the same JPEG) | Larger image/PDF attachments silently failing to attach to AI Generate | If the chunked base64 encoding regressed |
| T0706 | (Intermediate events aren't routing obstacles) a sequence flow passing an unconnected intermediate event stays straight (like a gateway — both excluded from the obstacle set), while it still detours around a task; so an event placed on a flow attaches instead of forcing the flow to bow around it | Sequence flows re-routing AROUND intermediate events (e.g. after a connector split) instead of passing through them | If the intermediate-event obstacle exclusion regressed |
| T0704 | (Single-lane BPMN pools) the `reducer` treats a pool with exactly one lane as valid: dropping Pool/Lane on an EMPTY pool adds ONE lane (not two); on a single-lane pool top→lane above / middle→two sublanes / bottom→lane below; deleting one of two lanes KEEPS the last lane (no `dissolveSingletons` on a pool parent) and a further delete empties the pool; a lone sublane still dissolves into its lane | A pool being forced to 0/≥2 lanes — the creation shortcuts seeding two lanes, or a lone lane collapsing on delete — regressing the single-lane workflow | If single-lane pool creation/insertion/deletion regressed |
| T0708 | (relaxedLayout suppresses geometry validation) `checkDiagram` emits `hanging-message` for a message flow between two non-x-overlapping elements normally, but suppresses it — along with the other pure-geometry rules (`containment`, `lane-tiling`, `element-overlap`) — when the diagram carries `relaxedLayout: true`, so an imported foreign layout isn't red-flagged | A competitor BPMN diagram imported as-is being buried in false layout errors, OR the flag over-suppressing semantic rules | If the relaxedLayout validation gating regressed |
| T0709 | (relaxedLayout routes messages rectilinearly) `recomputeAllConnectors` forces a messageBPMN onto a shared-x vertical dogleg (srcEdge.x === tgtEdge.x) when NOT relaxed, but routes it rectilinearly between the two attachment sides (edges at different x) when the `relaxedLayout` arg is passed — letting a message connect non-vertically-aligned elements | Message flows snapping back to forced-vertical (and becoming degenerate/red) on an imported diagram | If the relaxed message routing regressed |
| T0710 | (snapImportedBounds repair pass) the pure clean/snap over image-imported geometry: returns not-ok when no pool has bounds (→ auto-stack fallback), orders pools top→bottom by box y, snaps a lane's x/width to its parent pool, clusters near-aligned node centre-x into one column, and repairs a node's pool membership by containment (geometry beats the declared field) | Jittery vision boxes producing misaligned columns, lanes not tiling their pool, or children stranded in the wrong pool on image import | If the imported-geometry snap/repair regressed |
| T0711 | (layoutBpmnPreserved reproduces drawn positions) with `preservePositions` + normalised `bounds`, `layoutBpmnDiagram` scales bounds to canvas px (START_X + x·1600 …), nests nodes under their pool via `parentId`, preserves left→right order, and sets `relaxedLayout: true`; with bounds missing it silently falls back to the auto-stack engine (no `relaxedLayout`) | An image import either not reproducing the vendor's layout, or crashing/blanking instead of falling back to auto-stack when the AI's coordinates are unusable | If the preserved image-import layout or its fallback regressed |
| T0712 | (Imported connectors attach to their elements) `layoutBpmnPreserved` routes every connector through the relaxed router so the visible endpoints (`waypoints[1]` / `waypoints[len-2]`) land ON the source and target boundaries — it does NOT use the AI's raw image-space waypoint polyline as the path (which floated off the placed elements). Also: a relaxed messageBPMN recomputes with `routingType:"rectilinear"` and endpoints on both element sides | Imported connectors rendered detached from their (logically-connected) source/target, and message flows reverting to the forced vertical dogleg | If preserved connector attachment / relaxed-message rectilinear routing regressed |
| T0713 | (Imported edge events mount on their host) `layoutBpmnPreserved` detects an AI element with a `boundaryHost` (a non-pool/lane host), sets `boundaryHostId`, and snaps the event centre onto the nearest host edge (honouring `boundarySide` when given) instead of leaving it floating in the lane | An edge-mounted (boundary) intermediate event imported from an image not attaching to its activity's boundary | If preserved boundary-event mounting regressed |
| T0714 | (Edge-mounted event detach/attach) `SET_EVENT_BOUNDARY` — unchecking Edge-mounted moves a START/END event on an Expanded Subprocess INSIDE the EP + re-parents it to the EP, while an INTERMEDIATE event moves OUTSIDE into the EP's own container (not parented to the EP); passing a `hostId` attaches a free event by snapping its centre onto that host's boundary (so an existing intermediate event can always be edge-mounted) | Detaching an edge event stranding it (wrong side / wrong parent), or an existing intermediate event being un-attachable to an activity boundary | If edge-mounted event detach repositioning or attach-by-host regressed |
| T0715 | (Free-form message flows attach top/bottom) `recomputeAllConnectors` routes a relaxed `messageBPMN` so both endpoints attach to the TOP or BOTTOM of their elements — even for two side-by-side elements at the same y where a plain rectilinear connector would attach left/right (`sourceSide`/`targetSide` ∈ {top, bottom}) | Message flows on an imported diagram attaching to left/right sides instead of the BPMN-conventional top/bottom | If the relaxed-message top/bottom side rule regressed |
| T1041 | (`messageForcedVertical` repair) a relaxed `messageBPMN` with `messageForcedVertical:true` routes to a shared-x VERTICAL spine (waypoints[1].x === waypoints[2].x) with sides re-picked by position (upper bottom → lower top); the same message WITHOUT the flag stays a non-aligned rectilinear dogleg | The "Make vertical" repair on an imported message flow not producing a clean vertical drop onto the pool (or breaking the plain rectilinear import) | If the forced-vertical message branch or its recompute trigger regressed |
| T0716 | (Apply-Layout messages don't share attachment points) `layoutBpmnPreserved` spreads the `offsetAlong` of every message endpoint landing on the same element + side: two messages sharing a target pool attach to the same side but at DIFFERENT offsets (ordered by the partner's x so they don't cross) | Multiple imported message flows stacking on the exact same attachment point of a shared element | If the message attachment-point distribution regressed |
| T0717 | (Generated task-name hard wrapping) `hardWrapProcessName` inserts hard line breaks by word count — ≤2 words unchanged, 3-4 → break after word 2, 5-6 → after word 3, >6 → after every 3 words — and is idempotent (`\n` counts as whitespace) | Generated Task/Subprocess names rendering as one long single line | If the task-name hard-wrap rule regressed |
| T0718 | (BPMN generation rules in normaliseAiPlan) every generated `task`/`subprocess` label is hard-wrapped (events left alone); lanes with NO pool reference are wrapped, with their flow elements re-parented, into an injected white-box pool named "Process"; lanes that already reference a pool are left untouched | Generated tasks staying single-line, or a set of lanes having no containing pool | If the generation-time task-wrap / orphan-lane-pool rules regressed |
| T0727 | (Dictate Stop during async start) the shared dictation toggle absorbs a Stop pressed while `startDictation` (token fetch + getUserMedia) is still in flight — a `stopRequestedRef` set in the Stop branch makes the resolving handle get `.stop()`ed on arrival instead of being assigned to `dictRef`, so no orphaned live mic keeps recording; normal start→stop still stops the real handle exactly once | Clicking Stop before the async mic handle resolves leaving the microphone recording indefinitely (Stop was a no-op on the still-null handle ref) | If the dictation start/stop race guard regressed |
| T0740 | (Service marker guard) the message-driven marker rules PRESERVE a deliberate "service" (automated) marker — a task the model marked "service" stays "service" even when it exchanges a message with a black-box pool (would otherwise be forced to "user" for a system pool or "send" for an external entity). Guarded in both the generation path (`normaliseAiPlan` skips a service task) and the editor (message-connector creation leaves a service task's marker alone), honouring green rule R2.03 which allows "service" for a system-interacting task | An automated Service task being clobbered to User/Send/Receive by the red message-marker rule whenever it messaged a black-box pool | If the Service marker guard regressed |
| T0739 | (Deterministic task markers) `normaliseAiPlan` assigns the MESSAGE-driven task markers in code (not the model): a message to/from an IT-System black-box pool (isSystem=true, either direction) → "user"; only sends to an external-entity pool → "send"; only receives → "receive"; both directions with an external entity → "none" (overriding a wrong model marker). A task with NO black-box-pool message keeps the model's wording-based choice (service/user/send/receive), defaulting to "none"; a sequence flow (not a message) never drives a marker | Task markers being left to the model and coming out inconsistent — e.g. a task messaging an IT system not marked "user", or send/receive wrong per message direction | If deterministic message-driven marker assignment regressed |
| T0738 | (Preserved task sizing + lane containment) `layoutBpmnPreserved` sizes tasks / collapsed subprocesses to their TEXT via `autoSizeForType` (centred on the drawn box) instead of the oversized vendor box — a short-label task drawn huge shrinks to the text-fit size (<160w, <90h) — and clamps every lane-assigned flow element fully inside its assigned lane (growing the lane only if a child genuinely won't fit), so no task straddles a lane boundary | Image-imported tasks rendering far too large (sized to the drawn box, not the text) and tasks whose drawn position straddled a lane boundary sitting across two lanes | If preserved task text-sizing or lane containment regressed |
| T0737 | (Preserved pool stays visible behind its lanes) `layoutBpmnPreserved` adds a pool/lane tidy pass: because `snapImportedBounds` snaps each lane's x/width to the pool box (lanes coincide with the pool, hiding it), the pool is given a left header strip (`poolHeaderWidth`) and grown leftward so its name shows and it visibly encloses the lanes, while the lanes are normalised to one content column flush against the header — a pool + two coinciding lanes ends with pool.x < lane.x (header gap = headerW) and the pool enclosing every lane | An image-imported BPMN pool rendering hidden BEHIND its lanes (lanes have it as parent but it's not a visible container / its name is covered) | If the preserved pool-header tidy-up regressed |
| T0736 | (Lanes always get a Company pool) `normaliseAiPlan` treats a lane as orphan when it has NO pool reference OR its parentPool/pool points at a pool the AI never emitted (dangling reference), and wraps all orphan lanes in one white-box pool named "Company" (was "Process"), re-homing lanes + their flow elements (incl. flow elements that directly referenced the missing pool); lanes whose pool DOES exist are left untouched. The layout engine's no-pool default is also renamed to "Company" | Generated lanes rendering with no containing pool because the AI emitted lanes referencing a pool element it forgot to include, so the orphan check (which only caught lanes with no reference) missed them | If the orphan-lane pool guarantee / Company default regressed |
| T0735 | (State-machine reproduce-from-image layout) `layoutStateMachinePreserved` honours AI-transcribed geometry: normalised `bounds`→px (aspect-preserving via imageAspect) keep original left-to-right placement, a child's `parent` sets `parentId` and the composite-state grows to ENCLOSE it (nesting), pseudostates stay catalogue-small (not scaled to bounds), and transitions attach to the AI-declared `sourceSide`/`targetSide` faces; returns null (auto-layout fallback) when <60% of elements carry bounds, and `layoutGenericDiagram` routes a bounded state machine through this path | A state machine reproduced from an image losing composite-state nesting, connector faces, or original positions (everything re-flowed by auto-layout) | If the state-machine preserved-layout (nesting / faces / positions) regressed |
| T0734 | (State-machine image ingestion prompt) `buildGenericSystemPrompt("state-machine")` carries an IMAGE INPUT section mapping drawn shapes to element types (solid circle→initial-state, bullseye→final-state, rounded rect→state, diamond→gateway, bar→fork-join, arrows→transition), instructs OCR-verbatim labels + image-wins-over-prompt, and the block is state-machine-only (not injected for e.g. value-chain) | A state-machine image attachment being transcribed without shape→type guidance (wrong element types), or the image guidance leaking into other diagram-type prompts | If the state-machine vision prompt guidance regressed |
| T0733 | (Per-tier feature entitlements) `entitlementsForLevel` maps a SubscriptionLevel's `hasSimulator`/`hasProcessMining`/`hasRiskControl`/`hasApqc` columns to the `{simulator, processMining, riskControl, apqc}` entitlement shape; SuperAdmins (isAdmin) get every feature regardless of the columns, a null tier grants nothing (non-admin) but everything for an admin, and `EXAMPLE_FEATURE_KEYS` is exactly Simulator/Mining/Risk-Control (not APQC, which has no examples gallery) | Feature access resolving wrong per tier — a locked feature showing, or SuperAdmin being denied, or the Hide-Examples button keying off APQC | If the per-tier feature entitlement resolver regressed |
| T0732 | (Palette EP splits a connector) dropping a NEW Expanded Subprocess from the palette onto a connector (SPLIT_CONNECTOR with symbolType `subprocess-expanded`, now in the immediate-split list, not the intermediate-event picker) creates the EP and splits A→B into A→EP and EP→B | A palette-dropped Expanded Subprocess not splitting the connector (or wrongly triggering the intermediate-event trigger picker) | If palette EP connector-split regressed |
| T0731 | (Existing EP splits a connector, container-safe) an Expanded Subprocess (now a splittable drop type) dropped on A→B splits it into A→EP and EP→B, but as a CONTAINER it is NOT snap-moved onto the line (children would be stranded), does NOT split its own internal connector (connectors touching the EP or its descendants are skipped), and does not use the flow-line net (its big rect would straddle distant centre lines) | Dropping an Expanded Subprocess on a connector doing nothing, or splitting its own internal flow / a distant connector, or jumping the EP off its children | If EP connector-split container-safety regressed |
| T0947 | (Child-in-EP doesn't self-splice) moving/clicking a task INSIDE an Expanded Subprocess does NOT splice a connector that terminates on the EP (its ancestor) into external→child→EP — the flow-line net would otherwise fire because the EP's target-centre sits inside the box among its children; the moved element's ANCESTOR containers are excluded from splice candidates, and the child isn't lurched onto the line | Clicking a task inside an EP spuriously adding a connector + jumping the element left (the reported AI-Gen bug) | If the ancestor-container exclusion in the MOVE_END splice detector regressed |
| T0730 | (No mid-drag connector fleeing; drop then splits) MOVE_ELEMENT no longer re-routes connectors NOT attached to the moved element (obstacle re-routing now re-settles once at drop, in MOVE_END) — dragging a free task onto a straight A→B connector leaves A→B straight (y-spread ≤ 2px) instead of bending it away, so the drop lands ON it and MOVE_END splits it into A→F and F→B | Dragging a task onto a connector being impossible because the connector fled the task (an obstacle) mid-drag, so it was never under the task at drop | If mid-drag detached-connector routing suppression regressed |
| T0729 | (Split via the flow line when sides were re-picked) MOVE_END's drop-on-connector detection ORs in a routing-independent net — the straight source-centre→target-centre "flow line" — so a task dropped on a connector whose sides/offsets obstacle avoidance re-picked to route AROUND it (both the live route and the stored-sides fresh route arch away) still splits; a connector with both ends re-picked to exit `top` (arching above the line) still splits when a task lands on the direct A→B line | Dropping a task on a connector never splitting because the router re-picked the connector's sides to detour, so neither the live nor the stored-sides fresh route passed through the task | If the flow-line split net regressed |
| T0728 | (Split survives a >=9-waypoint bent route) the real-world failure: a longer / cross-lane connector bent around the dragged task can have >=9 waypoints, which `recomputeAllConnectors` PRESERVES as a hand-customised interior — so recomputing "as if the task weren't there" does NOT straighten it. MOVE_END therefore detects against a FRESH per-connector `computeWaypoints` obstacle-free route (which ignores the >=9 preservation); a 9-waypoint route detouring around F on the A→B line still splits into A→F + F→B | "Obstacle avoidance prevents it" — dropping a task on a connector with a >=9-waypoint (preserved) detour never splitting because the obstacle-free recompute kept the detour | If the per-candidate obstacle-free split detection regressed |
| T0726 | (Split survives obstacle avoidance) MOVE_END detects the connector to split against an OBSTACLE-FREE route computed per candidate with `computeWaypoints` (the dragged element removed from the obstacle set) so a connector the router bent AROUND the element during the drag is tested on its straight/orthogonal path; a task dropped on A→B whose LIVE 8-waypoint route detours above it (not overlapping) still splits into A→F and F→B | Dropping an activity onto a connector doing nothing because obstacle avoidance bent the live connector around the activity so its waypoints no longer overlapped it | If the obstacle-free split detection regressed |
| T0725 | (Insert existing activity onto a connector, halves parallel) MOVE_END's connector-split (drop an existing task/gateway on a connector to divide it into A→el and el→B) now SNAPS the dropped element's centre onto the connector line via `nearestOnSeg` before routing, so the incoming and outgoing halves attach on opposite sides (left in / right out) and run in the same direction; a task dropped overlapping A→B but centred below it is pulled back onto the line | The incoming and outgoing halves doglegging around an element dropped slightly off the connector line instead of staying parallel | If the drop-on-connector snap-to-parallel regressed |
| T0724 | (Data associations don't affect flow columns) `layoutBpmnDiagram`'s column BFS excludes connectors touching a Data Object / Data Store / Text Annotation (associations, not sequence flow) — adding a data-store input association or a data-object output to a linear flow leaves every flow element's column/x IDENTICAL | A data artifact pulling its consumer into a new column (gap around the artifact) or shoving a gateway out of topological order relative to its targets | If data associations leaking into column placement regressed |
| T0723 | (Data objects hug their activity) `layoutBpmnDiagram` re-runs the R8.02 data-object placement AFTER the gateway / start-end movement passes, so a data object (parented to the lane, not its activity) is re-hugged to its associated element's FINAL position instead of being stranded when the activity is repositioned; a cross-lane branch scenario keeps the data object < ~170px from its activity | Generated data objects (e.g. "Loan Offer"/"Decline Letter") ending up hundreds of px from their associated activity after cross-lane / start-end placement | If the data-object re-snap regressed |
| T0722 | (EP-internal start/end unlabelled) `normaliseAiPlan` strips the label from any start/end event with a `parentSubprocess` (an Expanded Subprocess's internal start/end are never labelled), while process-level start/end events at pool/lane level keep their labels | Generated Expanded Subprocesses showing labelled internal start/end events | If the EP-internal-event label strip regressed |
| T0721 | (Gateway connectors attach at the vertex) `layoutBpmnDiagram` keeps every gateway connection point at the diamond VERTEX (offset 0.5) — the connection-point de-overlap pass no longer spreads gateway ends off 0.5, so even a 4-branch gateway (two flows sharing a face) attaches both on the vertex, not mid-edge | Gateway (Apply-Layout) connectors rendering "near a vertex, not on it" because de-overlap spread them along the sloped diamond edge | If gateway vertex attachment regressed |
| T0720 | (AI Expanded-Subprocess markers) the plan schema accepts `repeatType` ("loop"/"mi-parallel"/"mi-sequential"), and `layoutBpmnDiagram` carries the Standard-Loop marker (`repeatType: "loop"`) and the Ad-Hoc marker (`properties.adHoc: true`) from the AI plan onto the built Expanded-Subprocess element; an ad-hoc EP gets NO injected start/end events | AI being unable to set a Loop or Ad-Hoc marker on a generated Expanded Subprocess, or an ad-hoc EP wrongly receiving injected start/end | If the AI marker wiring (repeatType / adHoc) regressed |
| T0719 | (Preserved-layout Expanded Subprocess containment) `layoutBpmnPreserved` parents `parentSubprocess` children to the EP (so routing treats the EP as a containment box, not an obstacle), grows the EP to enclose all its children (the vendor may draw it too small), and edge-mounts an intermediate event sitting on the EP boundary | Imported-diagram flows between EP children detouring OUTSIDE the EP boundary, an EP child (e.g. End event) left outside the EP, or a boundary event left floating | If preserved-layout EP containment / enclosure / edge-mount regressed |

### `tests/ai/pickBestModel.test.ts` — the multi-model comparison "winner" rule

The SuperAdmin "Compare all models" fills the current diagram with the BEST result. This pins what "best" means so the choice can't silently drift.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0573 | picks the fewest conformance issues among complete diagrams | Filling with a worse layout than another model produced | If the primary sort (fewest issues) regressed |
| T0574 | the completeness floor stops a near-empty 0-issue diagram winning | A sparse 2-box diagram "winning" because it has nothing to get wrong | If the size floor were dropped |
| T0575 | ties break to the richer diagram, then model-preference order | Nondeterministic / arbitrary winner on ties | If either tie-break regressed |
| T0576 | ignores failed/unsaved results; returns null when none qualify | Filling from a model that errored, or crashing when all failed | If the ok/diagramId filter or the empty case regressed |

### `tests/ai/aiModel.test.ts` — the AI-Generate model list + default resolver

The SuperAdmin-settable AI-Generate model. `resolveAiModel` guarantees a blank / removed setting never leaves generation pointing at a non-existent model.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0577 | the production default is Haiku 4.5 and is a known model | The default silently drifting or pointing at a bad id | If DEFAULT_AI_MODEL changed away from a real model |
| T0578 | resolveAiModel keeps a known id, falls back to the default for unset/blank/removed | Generation calling a non-existent model after a bad/emptied setting | If the fallback/validation regressed |
| T0579 | every model has an id + label; unknown ids are rejected | A malformed model list or an unknown id being accepted | If the list or isKnownAiModel regressed |
| T0949 | Moonshot models are offered ONLY when MOONSHOT_API_KEY is set (key gates the whole list) | Kimi models cluttering / half-working on a Claude-only deployment | If the key gate in moonshotModels() were removed |
| T0950 | with the key set, MOONSHOT_MODELS is parsed (id\|Label) and tagged provider=moonshot; Claude stays first | A mis-parsed Kimi list or wrong provider tag routing Kimi to Anthropic | If the parser or provider tagging regressed |
| T0951 | key set + MOONSHOT_MODELS unset → a curated default Kimi list | The feature being unusable without hand-listing model ids | If the default-list fallback regressed |
| T0952 | Claude + unknown + null ids all resolve provider=anthropic | A Claude/unknown id being sent to the Moonshot endpoint | If providerForModel's default regressed |
| T0960 | vision capability flags — Claude all true; default Kimi list (kimi-k3/k2.6 vision unset); env ids heuristic ("vision" in id → true, else unknown) | The optional Vision-model picker offering a text-only model, or wrongly flagging a capable default | If the `vision` flags or the env heuristic regressed |
| T0962 | an unresolved Azure Key Vault reference (`@Microsoft.KeyVault(...)` left literal in the env var) is treated as no key — model hidden, not offered-then-401 | A silent 401 "Invalid Authentication" loop when the KV reference doesn't resolve (managed-identity access), with the model still shown | If `resolvedEnvSecret`'s KV-reference guard regressed |
| T0963 | Test-mode C1.1 forward connector = facing-side midpoints (right→left), offset 0.5, endpoint on the source's right face | The experimental connector scheme mis-attaching forward sequence flows | If bpmnTestConnectors C1.1 facing-side logic regressed |
| T0964 | Test-mode C1.2 backward (target left of source) = TOP side on BOTH ends, offset 0.5 | Rework/loop edges not routing over the top in Test mode | If the back-edge detection or C1.2 rule regressed |
| T0965 | Test-mode C2 decision-gateway vertex per branch position (up→top / down→bottom / level→facing side), offset 0.5; stacked branches exercise both top and bottom | Decision branches attaching to the wrong diamond vertex | If gatewayVertexSide (C2.1/2.2/2.3) regressed |
| T0966 | Test-mode decision incoming = left vertex; merge stem outgoing = right vertex | Gateway stem ends not using the facing side vertex | If the fan-vs-stem gateway logic regressed |
| T0967 | every Test-mode sequence connector is orthogonal (each segment axis-aligned) | Non-orthogonal/ diagonal experimental connectors | If orthogonalNoAvoid produced a non-axis-aligned segment |
| T0968 | Normal path unchanged (omitted === mode:"normal"); Test keeps element positions + non-sequence connectors identical to Normal | The experimental mode leaking into the normal product path or moving elements | If the mode branch coupled into placement or non-sequence connectors |
| T0969 | Test-mode C3: an edge-mounted (boundary) event's sequence connector attaches at its OUTER face (away from the host), offset 0.5 | A boundary-event flow leaving from the inner face (into/across the host) | If the C3 boundary-event override regressed or lost precedence over C1/C2 |
| T0970 | Test-mode C3 on a WIDE EP uses the mounted host EDGE (getBoundaryEventOuterSide closest-edge), matching Normal — not a centre-delta guess | Boundary events on a wide Expanded Subprocess picking the wrong face (e.g. "right" when mounted on "bottom" off-centre) | If C3 reverted to a centre-delta side pick or diverged from Normal's outer-edge helper |
| T0971 | R8.01 fully cross-lane fan: a decision whose branches are ALL in other lanes (+ its paired merge) re-homes to the MIDDLE branch's lane and aligns vertically with that middle element | A cross-lane decision/merge clamped high in its upstream lane, far above its branches | If the fully-cross-lane re-home (median branch lane + Y) regressed |
| T2827 | R8.24 partial cross-lane fork/join: a merge gateway in a DIFFERENT lane from its paired decision is drawn level (same centre-Y) with the decision, as the final Y-affecting step before routing | A merge snapped back to its own (upper) lane band, no longer level with its decision (e.g. decision in Sales, merge in Front Office) | If a later lane-centring pass diverges a paired merge from its decision |
| T0972 | Screencast webcam inset pins to the chosen corner with the given margin (br/tl/tr) at 16:9 | Webcam PiP drifting off-corner or wrong-sized in the recording | If insetRect corner/margin math regressed |
| T0973 | Screencast inset clamps an absurd scale and always stays fully inside the frame | The webcam inset overflowing the video frame | If insetRect bounds-clamping regressed |
| T0974 | coverCrop crops the long axis to fill the inset without distortion (wide→crop sides, tall→crop top/bottom) | A squashed/stretched webcam inset | If coverCrop aspect logic regressed |
| T0975 | ffmpeg webm→mp4 args = H.264/AAC + yuv420p + `-movflags +faststart` + `-y`, input first / output last | Transcoded mp4 not playing on social/QuickTime or not streamable | If the ffmpeg arg builder regressed |
| T0976 | ffmpeg any→webm args = VP9/Opus with `-deadline realtime` for reasonable speed, input first / output last | A "convert to .webm" that's absurdly slow or wrong-codec | If ffmpegToWebmArgs regressed |
| T0980 | auto-repair fuseCollinearWaypoints drops redundant collinear waypoints (segment fuse), keeps genuine corners + endpoints | A moved segment leaving a redundant waypoint / not merging with its parallel neighbour | If the collinear-fuse pass regressed |
| T0981 | fuseCollinearWaypoints also fuses ALMOST-parallel segments (within tolerance) | A 1–3px near-parallel jog left behind after a segment move | If the fuse tolerance regressed |
| T0982 | fuseCollinearWaypoints leaves a genuine perpendicular zig-zag intact | Real corners wrongly collapsed, flattening a deliberate route | If the fuse over-merged perpendicular corners |
| T0983 | AI-usage: providerOf maps kimi/moonshot ids → moonshot, else anthropic | A Kimi model mis-attributed to the wrong provider in usage/cost | If the pricing provider mapping regressed |
| T0984 | AI-usage: costFrom multiplies tokens × per-1M rate (undefined rate → 0) | Wrong estimated cost shown next to token figures | If the cost maths regressed |
| T0985 | AI-usage: effectiveRates = pricing.ts defaults overlaid by AiModelRate DB rows (DB wins), incl. new models | A SuperAdmin rate override ignored, or a custom model priced as "varies" forever | If the rate-catalog overlay regressed |
| T0986 | AI-telemetry: recordAiInvocation merges the route's AsyncLocalStorage context (user/org/point) into the row | Usage rows missing user/org/invocation-point attribution | If the ALS context merge regressed |
| T0987 | AI-telemetry: outside any context, user/org are null and point is "unknown" (never lose provider/model/tokens) | A telemetry write throwing / dropped when no route context is set | If the fail-safe defaulting regressed |
| T0988 | AI-telemetry: recordAiInvocation never throws even if the DB write fails | A telemetry failure breaking a real AI generation | If the never-throw guard regressed |
| T0989 | AI-telemetry: every AI_INVOCATION_POINTS value has a friendly label + values are unique | A new invocation point with no report label / a duplicate key | If a label was forgotten or a value duplicated |
| T0990 | AI-telemetry seam: makeAiClient wrapper records a SUCCESS row with token usage + truncation flag, passing the response through | Token usage silently discarded again (as before this feature) | If the messages.create wrapper regressed |
| T0991 | AI-telemetry seam: makeAiClient wrapper records a FAILURE row with an error code and rethrows | AI failures invisible in usage / the error swallowed | If the failure-path wrapper regressed |
| T0992 | ArchiMate v3.2: every catalogue iconType in use has an ICON_DRAWERS drawer | A new element rendering as a blank box (missing glyph) | If a catalogue iconType lacks a drawer |
| T0993 | ArchiMate v3.2: every ARCHI_SHAPE key exists in the catalogue | AI-generated ArchiMate element referencing a non-existent shapeKey (renders nothing) | If a layout key/catalogue key drifts |
| T0994 | ArchiMate v3.2: new element types band correctly — Technology(+Physical)=11, Impl&Migration=12 | New layers laid out in the wrong row by AI generation | If ARCHI_BAND regressed |
| T0995 | ArchiMate v3.2: catalogue is version 3.2, Technology has 19 masters (Node + System Software gained icon forms), Impl&Migration + Composite categories present, typo/dupe keys removed | The upgrade half-applied / dead duplicate masters back | If the catalogue regressed to 3.1 |
| T1079 | Node, System Software + Application Component have selectable icon (expressed) forms — dual-form set + catalogue `-icon` master + whole-shape drawer (Node=3D box, System Software/Component=tabbed rectangle) | These three offering only the box form; ingestion/palette unable to show the icon form | If a `-icon` master or the dual-form entry is dropped |
| T0996 | ArchiMate v3.2: Directed Association relationship-name registered ("Association (directed)") | The new relationship missing its highlight label / picker entry | If the directed-association type was dropped |
| T0997 | ArchiMate v3.2: relationship compatibility matrix covers every new element + Directed Association is universal | New elements only offering Association in the picker / Directed Association always disabled | If the relationships matrix wasn't updated for new elements |
| T0998 | ArchiMate: Realisation is directly allowed (not derived) for elements that realise a Service (Process/Function/Component → Service) | A Process→Service Realisation hidden behind "show derived" | If the realise-a-Service overrides were dropped |
| T0999 | ArchiMate Icon Maintenance: default corner-glyph layout matches the built-in per-category geometry (27/36 box) | A silent shift in every glyph's default position/size | If defaultIconLayout regressed |
| T1000 | ArchiMate Icon Maintenance: Technology default nudges the glyph 2px right (xTweak) | Technology markers drifting off their tuned spot | If the category tweak was dropped |
| T1001 | ArchiMate Icon Maintenance: effective layout overlays a partial override on the default | A partial edit wiping the untouched fields | If effectiveIconLayout merge regressed |
| T1002 | ArchiMate Icon Maintenance: overrides are per element key, not shared by iconType | Editing one element's glyph moving another that shares a drawer | If keying regressed to iconType |
| T1003 | Icon Library: validateIconPrimitives drops malformed primitives and keeps the valid remainder | Bad AI/DB primitive data crashing or rendering garbage | If the validator trust boundary regressed |
| T1004 | Icon Library: validator coerces filled/z, drops bad colourRole, clamps strokeWidth | Unnormalised primitive fields reaching the renderer | If field normalisation regressed |
| T1005 | Icon Library: drawCustomIcon emits the right SVG node per primitive + sorts by z | Custom icons rendering the wrong shapes / wrong paint order | If the renderer or z-sort regressed |
| T1109 | Icon Library: regular polygon (Pentagon/Hexagon) — validated (sides clamped 3–12), renders as `<polygon>` with N vertices, rotation 0 = first vertex up | The new resizable/rotatable polygon primitive corrupting or mis-rendering | If the polygon type/validator/`polygonPoints` regresses |
| T1110 | Icon Library: parallelogram — validated, `parallelogramPoints` gives 4 vertices with the bottom edge leaned by `slant`, renders as `<polygon>` | The resizable parallelogram primitive corrupting or mis-rendering | If the parallelogram type/validator/`parallelogramPoints` regresses |
| T1111 | Icon Library: geared wheel — validated (teeth clamped 3–24), `gearPoints` = 4 vertices/tooth, tips at r+depth/2, renders as `<polygon>` | The gear/cog primitive corrupting or mis-rendering | If the gear type/validator/`gearPoints` regresses |
| T1112 | Icon Library: dog-eared page (Data Object) — validated, renders as a folded `<path>` (body + crease subpaths) | The document primitive losing its fold or mis-rendering | If the document type/validator/renderer regresses |
| T1006 | Icon Library: arrowheads emit a marker; orientable angle override changes it | Missing/incorrect arrowheads on custom icons | If the arrowhead renderer regressed |
| T1007 | Icon Library: normalised coords map into {cx,cy,size} + strokeWidth scales with a floor | Custom glyphs mis-positioned or hairline/blown-out strokes | If the coordinate/stroke mapping regressed |
| T1008 | Icon Library: effectiveCustomIcon returns the assigned icon or null (fallback to built-in) | A dangling assignment crashing a render instead of falling back | If the assignment resolver regressed |
| T1009 | Icon Library: assignment is per element key, not shared by iconType | Assigning one element's icon changing another that shares a drawer | If assignment keying regressed |
| T1010 | Icon Library: parseVectorizeResponse strips fences, parses, validates (good+malformed → only good) | AI vectorize output failing to load or trusting bad shapes | If the vectorize parser regressed |
| T1011 | Icon Library: defaultIconLayout baseSize replaces the category default + per-element override wins | An assigned icon's preferred size ignored, or override precedence wrong | If the baseSize/precedence logic regressed |
| T1012 | ArchiMate relationships: core elements Realise Strategy (Process → Capability) allowed | Process→Capability offering only Association | If the behaviour/active→strategy Realisation rule was dropped |
| T1013 | ArchiMate relationships: the 9 cross-category gaps + cross-level Realisation promoted to "allowed" | Missing serving/realisation/assignment/influence pairs; Realisation stuck behind "derived" | If the matrix rules regressed |
| T1014 | Icon Library: fillRole "background" paints the bg (opaque mask); "ink" paints the theme colour; none = transparent | A masking rectangle showing ink or letting lines through | If the 3-way fill regressed |
| T1015 | Icon Library: category glyph buffers set the top/right edge gap; precedence (override > baseSize > default) | Category buffer edits ignored or mis-ordered | If the buffer/precedence logic regressed |
| T1016 | Symbols Panel: buildElementRows = one row per element (box preferred) + configurable icon-only rows | Duplicate box/icon rows, or the palette not matching the assignment list | If the shared row builder regressed |
| T1017 | Project re-numbering: widthFor (≤9→1 digit, ≥10→2 zero-padded) + pad | Wrong digit width / padding in generated codes | If the width rule regressed |
| T1018 | Project re-numbering: full-mode nested tree walk builds dotted codes; folders numbered before diagrams | Codes not reflecting the folder-tree position | If the tree walk regressed |
| T1019 | Project re-numbering: full-mode alpha prefix attaches to the top-level number (ABC1…); empty prefix = bare | Prefix missing/misplaced in Option 2 codes | If prefix handling regressed |
| T1020 | Project re-numbering: activity ordering is deterministic reading order (y-band then x) | Non-deterministic / unstable activity numbers | If spatial ordering regressed |
| T1021 | Project re-numbering: APQC-mode re-normalisation closes gaps from deleted APQC activities | Deleted APQC activity leaving a hole in the numbering | If the contiguous re-number regressed |
| T1022 | Project re-numbering: APQC-mode appends non-APQC activities within the level; BARE numbers past 9 (no zero-pad) | Non-APQC items mis-placed, or APQC codes wrongly zero-padded | If APQC append/format regressed |
| T1023 | Project re-numbering: activity label line-1 = code\nname; strip-and-reapply is idempotent | Codes duplicating/stacking on re-run | If idempotence (stripLeadingCode) regressed |
| T1024 | Project re-numbering: folder + diagram names are code-prefixed | Folder/diagram names not showing their code | If name prefixing regressed |
| T1025 | Project re-numbering: RenumberDiff shape + counters correct | Preview/apply reading wrong diff fields | If the diff contract changed |

### `tests/diagram/archimate-containment.test.ts` — ArchiMate plain-drag containment

Extracting an ArchiMate shape from a container is a plain click-and-drag (no Shift — Shift is reserved for the tree-highlight). These drive the real reducer.

| # | What it checks | User-visible bug it prevents | Fails when |
|---|---|---|---|
| T1026 | Plain drag of a child OUT of an archimate container clears parentId | Shape stays stuck inside its container unless you hold Shift | If extraction ever required a modifier again |
| T1027 | Full cycle: plain drag IN adopts (container flag + child renders on top), plain drag OUT extracts | Dropped-in shape not adopted, or child hidden behind container so it can't be grabbed | If adoption/z-order/severing regressed |

### `tests/diagram/archimate-generation-sizing.test.ts` — Rule A4.09 (generated boxes contain their name)

An AI-generated ArchiMate box is sized to contain its wrapped name at the DEFAULT aspect ratio (128×76) — geometric rule enforced in `genericLayout` boxSize, not the prompt.

| # | What it checks | User-visible bug it prevents | Fails when |
|---|---|---|---|
| T1040 | Short name → default aspect ratio + footprint; long name → box grows (aspect ratio held) so the wrapped name fits inside with nothing spilling sideways | A long-named generated ArchiMate element with text overflowing its outline, or wildly non-uniform box shapes | If boxSize stopped enforcing the default aspect ratio or the contain-the-text sizing (A4.09) |

### `tests/ai/plan-json-extract.test.ts` — planBpmn JSON salvage

The model's plan response is clipped to the first COMPLETE brace-matched object (string/escape-aware) and trailing commas are stripped on a retry, so a note the model appends after the JSON no longer corrupts the parse.

| # | What it checks | User-visible bug it prevents | Fails when |
|---|---|---|---|
| T1042 | `extractBalancedJson` drops trailing notes (even with braces) + leading preamble, ignores braces inside strings, and returns the tail when truncated; `repairJsonCommas` strips trailing commas so a salvage parse succeeds | Image ingestion / BPMN generation failing with "Failed to parse AI response as JSON: Expected ',' or ']' … at position N" when a (verbose) model appends prose after the JSON | If the brace-matched extraction or the trailing-comma salvage regressed |
| T1043 | `closeTruncatedJson` trims a cut-off plan to its last complete element and closes the open brackets — mid-connections keeps the complete connections, mid-elements keeps the complete elements, complete JSON is untouched | "Unexpected end of JSON input" total failure when a verbose model (Opus) truncates the geometry-heavy image-ingestion plan at the token cap — now the arrived-complete part still renders | If the truncation salvage regressed (paired with the Opus/Sonnet max_tokens bump to 32000) |
| T1044 | (`tests/bpmn/lane-tiling.test.ts`) after layout, each lane with activities hugs its outermost activity to ≤ 1 Task-height (65px) clearance top & bottom, and never negatively (content stays inside) | The generated "Loan Assessment Team" lane rendering 1151px tall for 486px of content — hundreds of px of dead space above/below — because the maxStack lane-height reservation over-estimates when activities spread across columns | If the final `fitLanesToChildren(hug)` shrink pass regressed (grows back to the maxStack reservation or stops hugging) |
| T1045 | (`tests/diagram/import-geometry.test.ts`) `snapImportedBounds` nests a `sublane` inside its `parentLane`: flush to the lane's x/width, tiling the lane height contiguously (sub-band bottoms meet the next top, last covers the lane), emitted with `parentLaneId`/`parentPoolId`; a node whose centre sits in a sub-band resolves to the SUB-lane (innermost wins) | An image with a lane split into horizontal sub-bands ingesting as flat lanes — the sub-lane nesting lost | If the sub-lane nesting/containment in `snapImportedBounds` regressed |
| T1046 | (`tests/ai/normalise-plan.test.ts`) `normaliseAiPlan` turns a lane carrying `parentLane` (referencing an existing lane) into a `sublane`, inheriting `parentPool` from the parent lane when omitted; the outer lane is untouched | A plan's sub-lane (image ingest) staying a plain `lane`, or losing its pool, so it renders un-nested | If the sub-lane conversion pass (or the orphan-lane exclusion for `parentLane`) regressed |
| T1047 | (`tests/ai/normalise-plan.test.ts`) a lane whose `parentLane` points at a missing/non-lane id has `parentLane` dropped and stays a plain `lane` (no phantom sub-lane) | A hallucinated/dangling `parentLane` turning a normal lane into an orphaned sub-lane with no parent band | If the dangling-`parentLane` guard regressed |
| T1048 | (`tests/editor/smart-gateway.test.ts`) dropping a gateway with a Decision gateway (2 outgoing) nearest to its left defaults the new gateway to a Merge (`label:""`, `gatewayRole:"merge"`) | Smart Gateways not alternating — every dropped gateway defaulting to a Decision regardless of context | If the ADD_ELEMENT smart-gateway branch regressed |
| T1049 | (`tests/editor/smart-gateway.test.ts`) a Merge gateway (2 incoming) nearest to the left defaults the new gateway to a Decision (`label:"Decision?"`, `gatewayRole:"decision"`) | Same Smart-Gateway alternation, opposite direction | If the derive-role-from-connections (in≥2 = merge) regressed |
| T1050 | (`tests/editor/smart-gateway.test.ts`) no gateway to the left → new gateway defaults to a Decision | First-gateway / no-neighbour case losing the sensible Decision default | If the no-neighbour fallback regressed |
| T1051 | (`tests/editor/smart-gateway.test.ts`) an explicit `properties.gatewayRole` on the left neighbour wins over connection-derived role | A user-set role being ignored in the Smart-Gateway decision | If the explicit-role precedence regressed |
| T1052 | (`tests/bpmn/ep-boundary-interrupt.test.ts`) R8.19 — a timer/interrupt on an EP-INTERNAL task whose flow leaves the EP is re-homed onto the EP (boundaryHostId === ep.id), its centre sits on the EP rim, its End event is fully OUTSIDE the EP (in the timer's outward direction), no event→End waypoint lies inside the EP, AND (issue 3) the terminal End event is placed ADJACENT to the timer (≤120px) | A loop-terminating timeout ("10 working days elapsed") rendering inside the EP with its End event ("Lapse Application") stranded far left (x=300), or stranded far from the timer | If R8.19 EP-boundary re-homing, the exit-target ranking, or the issue-3 near-placement regressed |
| T1053 | (`tests/bpmn/ep-boundary-interrupt.test.ts`) R8.20 — after Start/End tightening, an EP hugs its rightmost real child (right gap ≤ ~SIDE_PAD, and ≥ 0 so it still encloses it) | The ~405px dead gap on the right of "Do Until Application Complete and Verified" because the EP wasn't re-tightened after its internal End event was pulled left | If the second `wrapEpsToChildren()` re-tighten call regressed |
| T2828 | (`tests/bpmn/emie-corner-clearance.test.ts`) R7.04/R7.05 — a top-mounted edge-mounted intermediate event (EMIE) on an EP stays ≥ one event-width clear of BOTH corners, keeps its stored side (no corner flip), defaults its label to the NORTH-WEST, and its outgoing sequence connector exits the event's top with no waypoint inside/on the EP boundary | An EMIE snapped ONTO an EP corner (R=0) with its connector attaching to a point ON the EP boundary, and its label sitting under the connector exit | If the corner-clearance re-snap (snapBoundaryEventToRim), the NW label default, or the outward-exit routing regressed |
| T2829 | (`tests/bpmn/emie-corner-clearance.test.ts`) R7.06 — an EMIE re-mounts on the host side that FACES its outgoing target (bottom when the target sits below the host, top when above), so the connector exits directly toward it (label follows: NW on top, SW on bottom) | A top-defaulted EMIE detouring up-and-over the host to reach a target drawn below it | If the target-facing side selection (top/bottom by target vertical position) regressed |
| T2830 | (`tests/bpmn/gateway-fan-vertices.test.ts`) R6.26–R6.29 — a 5-branch decision assigns outbound vertices top/right/bottom round-robin by target Y (merge: top/left/bottom by source Y), so branches past the 3rd reuse the same three vertices in vertical order instead of all piling on the bottom vertex | A 4th+ decision branch all dumping onto the bottom gateway vertex | If the round-robin (idx%3) gateway-fan vertex assignment (R6.27/R6.28) regressed |
| T2831 | (`tests/bpmn/left-to-right-flow.test.ts`) R8.21 back-edge detection runs on the COLLAPSED graph — an EP-internal element feeding an external gateway that loops back INTO the EP is a 2-cycle only after collapsing internals to their EP; the diagram width stays bounded (<3000px) instead of the L→R sweep cascading both nodes ~14,000px right | The ~14,000px empty band in V04.01 Workforce Planning (raw-id DFS missed the collapsed sp1<->gateway rework cycle) | If R8.21 reverts to raw-id back-edge detection or the collapsed-cycle skip regresses |
| T2832 | (`tests/simulation/boundary-catch-throw.test.ts`) boundary events on activities race the host cycle time: an interrupting event that fires first cancels the host (releasing its resource) and diverts; one that loses is disarmed; non-interrupting spawns a parallel flow while the host completes; fireProb 0 never fires | A boundary timer/error on a task doing nothing (orphaned) instead of interrupting/racing | If boundary-event arming (armBoundary/onBoundaryTrigger), disarm-on-serviceEnd, or the interrupt divert regressed |
| T2833 | (`tests/simulation/boundary-catch-throw.test.ts`) throw→catch synchronisation: a signal throw broadcasts to ALL waiting catches; a message throw releases exactly one (FIFO) and buffers when none waits; a catch timeout releases when no throw comes; a bare blocking catch deadlocks (engine-level) | A message/signal catch modelled as a plain timed delay with no real block-until-trigger | If the channel block/release, signal-broadcast, message-queue, or CATCH_TIMEOUT logic regressed |
| T2834 | (`tests/simulation/boundary-catch-throw.test.ts`) assembly maps a boundary catch event onto its host node.boundaryEvents (dropping it as a flow node), a throwing message event to node.throw {message:name}, and a catching signal to node.catch {signal:name}+catchTimeout | Boundary/catch/throw diagram fields not reaching the engine network | If assembleFromDiagram boundary/channel wiring regressed |
| T2835 | (`tests/simulation/boundary-catch-throw.test.ts`) boundary events on an EXPANDED SUBPROCESS race the whole inline body (armed at scope entry, disarmed at scope completion): interrupting fires mid-body → cancels the scope + diverts out of the EP; loses → never fires; non-interrupting → parallel flow while the EP completes; assembly attaches it to the EP subprocess node | A boundary timeout on a subprocess scope silently ignored | If armScopeBoundary / onScopeBoundaryTrigger or the EP-host assembly wiring regressed |
| T2836 | (`tests/simulation/boundary-catch-throw.test.ts`) the replay trace emits an element-activation `fire` event when a boundary event fires (variant boundary → red flash) and when a throw triggers a waiting catch (variant catch → green flash), but NOT when a catch releases via timeout | Boundary/catch activations invisible in the replay (no viewer cue) | If emitFlash on onBoundaryTrigger/onScopeBoundaryTrigger/releaseWaiter/buffered-message regressed |
| T2837 | (`tests/simulation/fill-provenance.test.ts`) Fill-missing provenance: filled element keys tagged in sim.autofilled + connector branchProbabilityAuto; a manual edit via simPatch un-tags that field; unfillSimulation clears only still-tagged auto-fills, keeping manual overrides | Unfill wiping a value the user had manually set, or Fill values untracked | If simPatch un-tag, autofill provenance, or unfillSimulation regressed |
| T2838 | (`tests/simulation/harvest-teams.test.ts`) harvestLaneTeams: team = the lowest lane/sublane a task sits in (pool fallback), deduped by name (case-insensitive) across the diagram hierarchy | Team library not derivable from the drawn org structure | If lane/sublane team derivation or cross-diagram dedupe regressed |
| T2839 | (`tests/simulation/default-setup.test.ts`) planDefaultSetup is idempotent: on an empty project it plans the 3 default calendars + lane teams + Initial Study/Baseline; when all exist (case-insensitive) it plans nothing | Simulator opening with an empty team/calendar/study library | If the missing-defaults planner regressed |
| T2840 | (`tests/simulation/token-table.test.ts`) buildTokenTable turns a replay trace into the token matrix: per-visit time is split into wait (enter→service) and service (service→leave), a cell accumulates repeat visits, total flow = exit−spawn; a token whose last node isn't a sink is "interrupted" and counted separately from completed in the flow stats | Trace table showing wrong per-cell time, mis-splitting wait vs service, or mislabelling interrupted tokens as completed | If buildTokenTable's per-visit accounting, column flow-ordering, or outcome/flow stats regressed |
| T2841 | (`tests/simulation/backdrop-container-order.test.ts`) orderBackdropContainers paints replay-backdrop containers pool → lane → subprocess-expanded, then parentId depth, then larger-behind-smaller — so an EP parented to the POOL (not the lane it sits in) is painted in FRONT of the lane instead of being hidden behind it | The "invisible EP box" bug: a full-diagram lane painting over a pool-parented expanded subprocess so only its children showed | If the backdrop container z-order (rank/depth/area) regressed |
| T2842 | (`tests/editor/edits.test.ts`) ADD_LANE adopts a pool-DIRECT child (an expanded subprocess added before the pool had lanes) into the lane whose bounds contain its centre; the EP's own descendants stay parented to the EP | An EP left parented to the pool after a lane was added, so nesting-aware consumers (replay backdrop, exporters) can't tell it sits inside the lane | If ADD_LANE's reconcileLaneMembership adoption regressed |
| T2843 | (`tests/editor/edits.test.ts`) MOVE_LANE_BOUNDARY re-homes an element whose centre the dragged divider crossed into the newly-owning lane, without moving the element itself | Dragging a lane divider past a task leaving the task parented to the wrong (old) lane | If reconcileLaneMembership on boundary-drag regressed |
| T2844 | (`tests/editor/edits.test.ts`) A Start / End event dropped inside an Expanded Subprocess is adopted by the EP with an EMPTY label; the same event dropped in free space keeps its default "Start"/"End" | Sub-process start/end nodes showing a stray "Start"/"End" label inside the EP boundary | If ADD_ELEMENT's EP start/end blank-label rule regressed |
| T2845 | (`tests/editor/edits.test.ts`) DELETE_ELEMENT of a lane re-homes its contents into the sibling lane that absorbs the vacated space (via the central reconcileLaneMembership pass), so the element is owned by the surviving lane rather than orphaned | A task left parented to a deleted lane (or the wrong lane) after a lane delete | If DELETE_ELEMENT lane-absorb + reconcile membership regressed |
| T2846 | (`tests/simulation/seed-defaults.test.ts`) seedSimulationDefaults on an empty project POSTs the 3 default calendars, one team per harvested lane (capacity 1, assigned the freshly-created Business Hours calendar) and an Initial Study + Baseline scenario; on a project that already has them it POSTs nothing (idempotent) | Simulator opening to an empty team/calendar/study library, or re-seeding duplicates on every open | If the on-open seed orchestration (order, Business-Hours resolution, idempotency) regressed |
| T2847 | (`tests/simulation/timer-label.test.ts`) parseTimerLabel reads a timer event's label across three tiers — fixed elapsed ("Wait 3 hours"→180 min, "7 days", "1.5h"), working-time ("10 working days"→4800 min via 8h day), absolute ("until 3pm"→"15:00") — and autofillSimulation fills a timer's delay from that duration (fixed/working), falling back to the flat default when the label carries none | A "Wait 3 hours" timer defaulting to a flat 2-unit delay; mis-parsed spellings/units | If timer-label parsing or its autofill wiring regressed |
| T2855 | (`tests/simulation/token-table.test.ts`) Trace-table columns follow the NETWORK's flow order when supplied, so a rarely-taken error branch an early token happened to hit sorts late rather than left; a trace-derived fallback still leads with the start event; and an unnamed node is labelled by what it is (`(end in Repeat Until error)`) never a raw id | An error step appearing as if it ran first, and columns headed by meaningless hex ids ("Event mnuzzcry") | If the flow-order column sort or the unnamed-node labelling regressed |
| T2853 | (`tests/editor/parentage.test.ts`) Container ownership is re-derived from geometry across the whole nesting chain (nested EP → lane → pool) on any structural change, including a drag's commit point (RESIZE_END, which changes no state itself): a child released from an inner EP lands in the enclosing OUTER EP (not the lane behind it), falls back to the lane then the pool, ORPHANS left by a lane/pool cascade delete are re-adopted (events as well as activities), and an EP whose lane was deleted re-homes to the pool while keeping its own children | A lane delete stranding its former contents — especially end events — so no later lane change ever re-adopts them; nested-EP children re-homed to the wrong container | If reconcileLaneMembership's EP-release / orphan / pool-fallback logic or the reducer's reconcile hook set regressed |
| T2854 | (`tests/editor/parentage.test.ts`) The B47 "parentage" scan rule reports an element whose declared owner is not the container it actually sits in (pool-owned while inside a lane; left on the outer EP when an inner one encloses it), passes a correctly-owned diagram, and exempts what it must not touch: boundary events (owned by their host), free-floating annotations, and any element held by a container the rule doesn't model (group / system-boundary / uml-package / composite-state / collapsed subprocess) | Stale ownership that is invisible on the canvas but exports to the wrong swimlane and bills simulation work to the wrong team — and, in the other direction, a "repair" that STRIPS a real group/system-boundary relationship (found by scanning the live example catalogues) | If checkParentage's expected-owner resolution or its exemptions regressed |
| T2851 | (`tests/simulation/arrival-sources-and-team.test.ts`) arrivalSourcesOf / isArrivalSource exclude a start event INSIDE an expanded subprocess (the assembler makes it a pass-through delay) and boundary events; autofillSimulation gives no arrival rate to an EP-internal start event while still filling a real one | A phantom "arrival" row for the EP's unnamed internal start event, with an invented arrival rate the run never uses | If the shared arrival-source rule or its autofill/panel wiring regressed |
| T2852 | (`tests/simulation/arrival-sources-and-team.test.ts`) deleting a lane re-homes its task into the surviving lane AND re-derives an AUTO-FILLED `sim.teamId` from the new lane; RENAMING a lane likewise re-derives it (UPDATE_LABEL changes no geometry, but an auto team is derived from the lane's NAME — without it a typo survives its own correction); a hand-set teamId is preserved (assigning a task across lanes is a legitimate model). `usedTeamNames` collects lane/pool labels + task teamIds so the Teams panel can mark library rows nothing references | A task still billed to a deleted or renamed lane's team, so the simulator keeps reporting a team that no longer exists; and old team rows silently accumulating in the project library | If retagAutoTeam, its reconcile hooks (incl. UPDATE_LABEL), or usedTeamNames regressed |
| T2849 | (`tests/simulation/bpmn-embedded-bpsim.test.ts`) buildBpmnXmlWithSim embeds a `<bpsim:BPSimData>` block in definitions-level `<extensionElements>` (with the bpsim namespace), references elements by the SAME `bpmnRefId` ids the BPMN document declares (every elementRef resolves to a declared id), omits the extension entirely when the diagram has no sim data, and round-trips — the embedded model re-applies via parseBpsimScenarios + applyBpsimToDiagram; identityIdMap still accepts raw refs so pre-alignment .bpsim.xml files still import | A .bpmn export silently dropping the whole simulation model; or a .bpmn + .bpsim.xml pair whose ids don't line up so no tool can resolve them | If BPSim embedding, the id alignment, or the BPSim round-trip regressed |
| T2850 | (`tests/simulation/clear-sim-data.test.ts`) clearSimData (backs the SuperAdmin "Clear simulation data" action) removes every element `sim` block and connector branch value, leaves the drawing intact — shapes, flows, labels and non-sim properties like fillColor — and is a no-op on an already-clear diagram | Clearing sim data for a re-test also destroying diagram content, or leaving stale annotations behind | If clearSimData's key-stripping or its non-sim property preservation regressed |
| T2848 | (`tests/simulation/timer-delay-engine.test.ts`) advanceWorkingClock consumes only open time (jumps the overnight closure; a full working week from Mon 09:00 lands Fri 17:00) and nextTimeOfDayClock returns today/tomorrow's time; the engine honours delayMode — a working delay spans the closure while the same magnitude elapsed does not, and an "until" delay resumes at the next wall-clock time; autofill→assemble attaches the lane team's calendar to a "10 working days" timer | Working/until timer delays behaving as plain elapsed time, or the lane calendar not reaching the delay node | If the working-clock/until-time helpers, engine delayResumeAt, or assemble's delay-calendar wiring regressed |
| T1054 | (`tests/bpmn/left-to-right-flow.test.ts`) R8.21 — a wide EP pushes a decision right; its three CROSS-LANE branch tasks land between the decision's right edge and the merge (not left of the decision) | The "Draft and Approve … Loan" tasks stranded at x=1260, left of the "Determine Loan Type" decision (x=2430) that feeds them, because the EP-clearance shift wasn't propagated to cross-lane successors | If the global L→R sweep (edge relaxation) regressed |
| T1055 | (`tests/bpmn/left-to-right-flow.test.ts`) R8.21 — in an acyclic fixture, every non-loop sequence edge runs left-to-right (target centre ≥ source centre) | Any residual right-to-left sequence flow (the signature of a misplaced element) | If the L→R relaxation or its back-edge (loop) skip regressed |
| T1056 | (`tests/bpmn/data-label-overlap.test.ts`) R8.23 — after layout, no two SAME-LANE data artifacts have overlapping label footprints (box widened by the label overhang) | Adjacent data objects' labels colliding ("Credit Report" + "Assessment Summary") because each picked a slot relative to its own element | If the data-artifact label de-overlap nudge regressed |
| T1059 | (`tests/bpmn/boundary-exit-outward.test.ts`) no connector leaving an edge-mounted (boundary) event has any waypoint strictly inside its host activity — for both a plain-task and an EP host | A boundary event's connector routing back INTO the activity it is mounted on instead of exiting outward and routing around it | If the "host stays an obstacle for its own boundary event's connector" rule in routing.ts regressed |
| T1057 | (`tests/bpmn/pool-gap.test.ts`) every vertical gap between stacked pools equals POOL_GAP (98 = 1.5 × Task height); a final `restackPoolsR52()` after the lane hug holds it | The inter-pool gap ballooning when the final lane hug shrinks the white-box pool | If POOL_GAP or the post-hug restack regressed |
| T1058 | (`tests/bpmn/pool-gap.test.ts`) R05.09 — each message-flow label is centred on its (vertical) connector (offsetX≈0) and lands inside an inter-pool gap band, recomputed from FINAL routed geometry | Message labels drifting hundreds of px out of the gap because their offsets were baked BEFORE the L→R sweep / lane hug / pool restack moved the pools | If the post-routing message-label recompute (anchored on the leader midpoint) regressed |
| T1067 | (`tests/bpmn/data-clearance.test.ts`) issue 2 — after layout no data artifact's footprint (box + label overhang) overlaps a non-associated flow element (start/end/intermediate event, task, subprocess, gateway) | A Data Object/Store or its label overlapping another element, e.g. a data object over a Start event | If the general data-artifact overlap-clearance pass regressed |
| T1066 | (`tests/bpmn/data-outside-ep.test.ts`) issue 5 — a Data Object/Store placed inside an EP is moved fully outside the EP's nearest boundary (above/below) and re-homed off the EP | A data artifact wedged inside an Expanded Subprocess crowding its flow ("Lending Policy") | If the issue-5 EP-exit tidy pass regressed |
| T1065 | (`tests/bpmn/end-event-near-pred.test.ts`) issue 7 — a process-level End event with a single incoming flow aligns to its predecessor's row (centre-Y within 1px) and follows the predecessor's lane | An End event floating at a lane's vertical centre / forced into a particular lane instead of sitting next to the element that flows into it | If the issue-7 End-event alignment pass regressed |
| T1064 | (`tests/bpmn/decision-label-in-ep.test.ts`) issue 6 — a gateway inside an EP places its label snug to the gateway (offset ≤ ~2 Task-heights), ignoring its own enclosing EP as an obstacle | A gateway label swept far out because the surrounding EP box read as an obstacle at every nearby angle | If the R5.09 ancestor-container exclusion regressed |
| T1063 | (`tests/bpmn/decision-vertical-attach.test.ts`) issue 4 — every connector from a Decision gateway enters its (event) target on a VERTICAL side (left/right), never top/bottom | A decision branch to an above/below event attaching on the event's top/bottom (via generic R3.06 sideFacing) instead of reading horizontally out of the gateway | If the decision-source vertical-attachment override in R3.06 regressed |
| T1060-T1062 | (`tests/routing/boundary-event-side.test.ts`) `pickBoundaryEventSide` corner disambiguation — a corner-mounted boundary event exits the outer side FACING its target (right vs bottom by target direction); a non-corner event keeps its plain nearest-edge outer side | A boundary-event connector exiting the mounted edge that faces AWAY from its target and doubling back around the host (the "10 working days" timer at the EP's bottom-right corner exiting down then looping up to Lapse) | If the corner-aware exit-side logic (or its final-geometry recompute in the computedConnectors pass) regressed |

### `tests/ai/aiClient.test.ts` — provider-aware client resolution (Moonshot/Kimi)

Which key + endpoint a model's provider uses. Pure (reads env, no network), so it pins the routing that decides where a prompt egresses.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0953 | a Claude model uses ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL; a caller-passed key overrides env | Claude traffic losing the enterprise proxy or the explicit key | If aiClientConfig's anthropic branch regressed |
| T0954 | a Kimi model uses MOONSHOT_API_KEY + the international endpoint; the Anthropic key is NOT used for it | Kimi calls going to Anthropic (or leaking the Anthropic key/endpoint) | If the moonshot branch or key selection regressed |
| T0955 | MOONSHOT_BASE_URL overrides the endpoint (e.g. mainland China) | Data-residency control over the Moonshot endpoint being ignored | If the base-URL override regressed |
| T0956 | aiApiKey is undefined when the selected provider's key is missing | A route proceeding without a key (and a confusing downstream error) | If aiApiKey stopped returning undefined on a missing key |
| T1028 | a Gemini model uses GOOGLE_API_KEY + GOOGLE_BASE_URL with Bearer auth (not x-api-key), never the Anthropic key | Gemini calls hitting Anthropic, or sending the wrong auth header (401) | If the google branch in aiClientConfig/makeAiClient regressed |
| T1036 | a Microsoft (GPT/Phi) model uses MICROSOFT_API_KEY + MICROSOFT_BASE_URL with Bearer auth, never the Anthropic key | GPT/Phi calls hitting Anthropic, or wrong auth header (401) | If the microsoft branch in aiClientConfig/makeAiClient regressed |
| T1029 | no Gemini models unless BOTH GOOGLE_API_KEY and GOOGLE_BASE_URL are set (gateway URL mandatory) | A Gemini model showing in the picker that can't resolve (no gateway) | If googleModels() stopped requiring the base URL |
| T1030 | an unresolved Key Vault reference for GOOGLE_API_KEY is treated as no key | A broken Gemini entry that 401s every call | If resolvedEnvSecret's KV-reference guard regressed |
| T1031 | configured: default lineup or GOOGLE_MODELS, tagged provider=google, vision default true ("-text" opts out); Claude still first | Wrong provider tag / vision flag, or Gemini pushing Claude out of first place | If googleModels() parsing or allModels() ordering regressed |
| T1037 | no Microsoft (Azure OpenAI + Phi) models unless BOTH MICROSOFT_API_KEY and MICROSOFT_BASE_URL are set | A GPT/Phi model showing that can't resolve (no gateway) | If microsoftModels() stopped requiring the base URL |
| T1038 | configured: default lineup or MICROSOFT_MODELS, provider=microsoft; GPT/o vision, base Phi text ("…multimodal/vision" opts in); Claude first | Wrong provider tag / vision flag on GPT vs Phi, or ordering | If microsoftModels() parsing or allModels() ordering regressed |

### `tests/ai/prompt-annotation.test.ts` — AI-Prompt annotation (persist the generating prompt)

The on-canvas "AI Prompt: … Generated on: …" note for AI-generated diagrams — heading format, placement (left of + vertically centred on the diagram), overwrite.

| # | What it checks | User-visible bug it prevents | Fails when |
|---|---|---|---|
| T1032 | `formatGeneratedOn` → `dd-mm-yyyy h:mm am\|pm` (no leading-zero hour, padded date/minute, lower-case meridiem); `promptHeading` shape | Wrong / ambiguous timestamp in the prompt annotation | If the date/time formatter regressed |
| T1033 | `buildPromptAnnotation` sits left-of + vertically-centred on the content bbox; `stripPromptAnnotations` removes ours + legacy R56 + script notes (overwrite) | Annotation overlapping the diagram, or duplicate prompt notes piling up on regenerate | If placement or the strip id-set regressed |
| T1033b | `contentBBox` is null for an empty / annotation-only diagram | Divide-by-nothing placement crash on an empty generate | If bbox null-guarding regressed |
| T1039b | `stripPromptAnnotationConnectors` drops the legacy R56 note→start-event association, keeps real sequence flow | A dangling association line left on the canvas after AI generation (its note element already stripped) | If the annotation-connector strip regressed |

### `tests/ai/model-access.test.ts` — cost-gated generate-model access

A normal user may pick the current default model + anything equal-or-cheaper; a SuperAdmin-in-SA-mode gets all. Enforced in the routes, so a crafted request can't smuggle a pricier model.

| # | What it checks | User-visible bug it prevents | Fails when |
|---|---|---|---|
| T1034 | `allowedGenerateModels`: normal = current + only ≤-cost; SA-mode = everything | A normal user picking (and being billed for) a pricier model than allowed | If the cost gate / SA-mode branch regressed |
| T1035 | `isModelAllowed` mirrors the list; unpriced/unknown ids rejected for a normal user | The route honouring a smuggled expensive/unknown model | If the route guard (`chooseModel`/`isModelAllowed`) regressed |

### `tests/theme/contrast.test.ts` — feature-tile contrast guarantee

`readableTextOn` keeps a palette's configured text when legible, but rescues an unreadable combination so admin tiles never render dark-on-dark (or light-on-light) under a customised Feature-Colours palette.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0957 | the default palette keeps its configured text (every feature already clears WCAG AA) | The default admin tiles changing appearance / the defaults being low-contrast | If a default colour pair dropped below 4.5:1, or readableTextOn over-rode a legible pair |
| T0958 | dark text on a dark customised bg is rescued to a light, readable colour | A customised palette making tile text invisible (dark-on-dark) | If the contrast fallback regressed |
| T0959 | light text on a light bg is rescued to a dark, readable colour | Light-on-light unreadable tiles | If the luminance branch of readableTextOn regressed |

### `tests/ai/split-rules.test.ts` — Only GREEN rules reach the AI model

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0199 | routes a rule under a normal group to aiRules and a rule under a layout group to layoutRules | Layout/positioning rules leaking into the AI prompt and confusing diagram generation | If a normal-group rule were mis-bucketed to layout, or a layout rule sent to the AI |
| T0200 | keeps each slice's own group heading and excludes the other slice's heading | Headings ending up in the wrong slice, breaking the structure given to the AI | If a group heading were copied into the opposite slice |
| T0201 | drops a [PROPOSED] rule line inside a layout group from BOTH slices | Draft, not-yet-live layout rules being acted on as if real | If a `[PROPOSED]` layout line stopped being filtered out |
| T0202 | drops a [MODIFIED] rule line inside a layout group from BOTH slices | Half-edited layout rules being acted on prematurely | If a `[MODIFIED]` layout line stopped being filtered out |
| T0203 | KEEPS a [PROPOSED] rule that sits in a NON-layout group (exclusion is layout-group-only) | Legitimate draft house-style rules being silently dropped from the AI prompt | If the `[PROPOSED]` drop were applied to non-layout groups too |
| T0204 | classifies all the rule-id formats from the header (R01, R04.1, G07, L23.2) | Some rule-id formats (dotted, G-prefix) being unrecognised and lost | If the rule-line regex stopped matching a format like `R04.1` or `G07` |
| T0205 | carries free-text (non-rule) lines into their group's bucket so each slice stays valid markdown | Explanatory prose detaching from its rules, corrupting the briefing text | If free-text lines were dropped or routed to the wrong slice |
| T0206 | handles a layout group FOLLOWED by a normal group (bucket switches correctly) | Group ordering errors causing rules after a layout section to be mis-bucketed | If the bucket failed to switch back when a normal group follows a layout group |
| T0207 | returns empty slices for an empty string | A crash or junk output when there are no rules at all | If empty input returned anything other than two empty strings |
| T0208 | sends everything to aiRules when there are no `##` headings at all | Ungrouped rules vanishing when an author writes no headings | If heading-less content were routed to layout or dropped |
| T0209 | matches CODE_REQUIRED group words case-insensitively as whole words | Wrong headings (e.g. "Displacement") being treated as layout, or real layout headings missed | If the layout-group matcher matched substrings or became case-sensitive |
| T0210 | PROPOSED_RE / MODIFIED_RE markers are recognised case-insensitively in a body | Lowercase `[proposed]`/`[modified]` markers slipping through unfiltered | If the marker regexes became case-sensitive |
| T0211 | realistic multi-group fixture splits cleanly with no leakage between slices | Cross-contamination between AI rules and layout rules on a real multi-section rules doc | If any content leaked across slices on a realistic combined input |

### `tests/ai/plan-schema.test.ts` — Zod gate the AI plan JSON must pass

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0212 | (accepts well-formed plans) accepts a complete elements + connections plan | A valid AI diagram plan being wrongly rejected before drawing | If the schema rejected a correct elements+connections plan |
| T0213 | (accepts well-formed plans) preserves unknown passthrough keys on elements and connections | Extra fields (waypoints, custom flags) being stripped from the plan | If the schema stopped passing through unknown keys |
| T0214 | (accepts well-formed plans) accepts every element type in the enum | A supported shape type (pool, gateway, data-store, etc.) being rejected | If any element type were dropped from the allowed enum |
| T0215 | (rejects malformed plans) rejects a missing elements array | A plan with no elements array silently reaching the layout engine | If a missing `elements` array were accepted |
| T0216 | (rejects malformed plans) rejects a missing connections array | A plan with no connections array slipping through | If a missing `connections` array were accepted |
| T0217 | (rejects malformed plans) rejects an element with a missing required id | An element without an id breaking connector wiring downstream | If an id-less element were accepted |
| T0218 | (rejects malformed plans) rejects an element with an empty-string id (min 1) | Blank ids that can't be referenced by connections | If empty-string ids passed validation |
| T0219 | (rejects malformed plans) rejects an element with a type not in the enum | A mistyped/unsupported shape type reaching the renderer | If an off-enum type like `startEvent` were accepted |
| T0220 | (rejects malformed plans) rejects an element with a wrong-typed label (number, not string) | Non-text labels corrupting display | If a numeric label passed validation |
| T0221 | (rejects malformed plans) rejects an element with a wrong-typed poolType (not in white-box/black-box) | An invalid pool kind producing a broken pool | If an unknown `poolType` like `grey-box` were accepted |
| T0222 | (rejects malformed plans) rejects a connection missing sourceId / targetId | A dangling connector with no endpoint | If a connection lacking `sourceId`/`targetId` were accepted |
| T0223 | (rejects malformed plans) rejects an entirely wrong root type (null) | A null/garbage payload crashing the pipeline | If `null` were accepted instead of rejected |
| T0224 | (rejects malformed plans) returns human-readable path-prefixed issues | Unhelpful validation errors that hide what's wrong with the AI output | If issues stopped being formatted as `path: message` |
| T0225 | (pinned actual behaviour) ACCEPTS an empty elements + connections plan (no .min(1) on the arrays) | Surprise if the schema's shape-only contract silently changed | If empty arrays started being rejected (behaviour drift) |
| T0226 | (pinned actual behaviour) ACCEPTS a connection referencing a non-existent element id (no cross-ref check) | Surprise if referential checks moved into the schema layer | If the schema began rejecting connections to unknown ids |

### `tests/ai/normalise-plan.test.ts` — Canonicalises loose AI plans, then lays out

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0227 | (type canonicalisation) rewrites legacy event type names to hyphenated forms | AI-emitted legacy names (startEvent etc.) producing unrecognised shapes | If `TYPE_MAP` stopped rewriting event aliases to hyphenated forms |
| T0228 | (type canonicalisation) maps gateway aliases to type 'gateway' AND fills gatewayType | Gateway variants losing their kind (exclusive/parallel/etc.) | If gateway aliases stopped mapping to `gateway` or stopped filling `gatewayType` |
| T0229 | (type canonicalisation) maps task aliases to type 'task' AND fills taskType | Task variants (send/user/service…) losing their marker | If task aliases stopped mapping to `task` or stopped filling `taskType` |
| T0230 | (type canonicalisation) leaves already-canonical types untouched | Correct types being needlessly rewritten or corrupted | If normalisation mangled already-canonical `task`/`pool` elements |
| T0231 | (field back-filling) back-fills a missing label from a stray `name` field | Elements rendering blank when the AI used `name` instead of `label` | If `name`→`label` back-fill were removed |
| T0232 | (field back-filling) does not overwrite an existing label with name | A real label being clobbered by a stray `name` | If back-fill overwrote an existing `label` |
| T0233 | (field back-filling) back-fills a lane's pool from parentPool | A lane losing its pool linkage when the AI used `parentPool` | If `parentPool`→`pool` back-fill were removed |
| T0234 | (field back-filling) does not overwrite an existing pool on a lane | A lane's real pool being replaced by `parentPool` | If back-fill overwrote an existing `pool` |
| T0235 | (R46 non-interrupting label detection) sets interruptionType for label %j | Events described as non-interrupting being drawn as interrupting | If the non-interrupting label detection (R46) stopped firing |
| T0236 | (R46 non-interrupting label detection) does NOT set interruptionType for an ordinary event label | Ordinary events wrongly flagged non-interrupting | If the detector matched plain labels like "Timeout" |
| T0237 | (R46 non-interrupting label detection) preserves existing properties while adding interruptionType | Existing event properties being wiped when interruptionType is added | If setting interruptionType discarded other properties |
| T0238 | (pinned non-behaviours) does NOT touch element ids | Ids being silently rewritten, breaking connections | If normalisation altered an element id |
| T0239 | (pinned non-behaviours) does NOT dedupe or add elements (count unchanged) | Element count changing unexpectedly during normalisation | If normalise started deduping or adding elements |
| T0240 | (pinned non-behaviours) does NOT modify connections | Connections being mutated during element normalisation | If normalise altered the connections array |
| T0241 | (normalise → layout) a normalised loose plan lays out with intact referential integrity and no dup ids | A messy AI plan producing a broken diagram (dup ids, dangling connectors, zero-size boxes) | If layout after normalisation produced duplicate ids, dangling connectors, integrity violations, or non-positive boxes |

### `tests/ai/staff-narrative.test.ts` — Staff-narrative extractor/briefing string helpers

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0242 | (extractAdditionalRules) returns '' for null / undefined / blank | Blank stored rules surfacing as junk additions | If blank/null input returned non-empty |
| T0243 | (extractAdditionalRules) returns the trimmed additions for a normal (new-style) row | New-style house-style additions being lost or untrimmed | If real additions were dropped or returned with whitespace |
| T0244 | (extractAdditionalRules) returns '' for a legacy full-briefing row (its content is the built-in default) | A legacy full briefing being shown as if it were user additions | If a legacy full-briefing row stopped being recognised and hidden |
| T0245 | (buildStaffNarrativeBriefing) uses the built-in default when nothing is stored | A missing briefing leaving the AI with no instructions | If null input failed to return the built-in default |
| T0246 | (buildStaffNarrativeBriefing) appends additional house-style rules under a heading for a new-style row | House-style additions not reaching the AI, or losing the default | If additions weren't appended under the heading alongside the default |
| T0247 | (buildStaffNarrativeBriefing) uses a legacy full-briefing verbatim | A legacy briefing being doubled or wrapped instead of used as-is | If a legacy full briefing weren't returned verbatim |

### `tests/ai/redaction.test.ts` + `redaction-wiring.test.ts` — pre-egress AI redaction (ENT-06)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0938 | redacts known names to opaque `Entity_N` tokens (no real name crosses the wire) | Identifiable content reaching the AI vendor when redaction is on | If `makeRedactor` stopped replacing a known literal |
| T0939 | restore is an exact inverse (round-trips the model's reply) | The user seeing raw `Entity_N` tokens instead of real names | If restore dropped or mis-mapped a token |
| T0940 | longest-first: an overlapping name isn't half-replaced | "Accounts Payable Clerk" becoming "\<token\> Clerk" | If the length-desc ordering were removed |
| T0941 | boundary-aware: substrings of larger words are left alone | "IT" the team redacting inside "WAIT"/"ITEM" | If the alphanumeric flank guards were dropped |
| T0942 | restore handles a possessive and doesn't clip `Entity_10` | `Entity_1` matching inside `Entity_10`; `Entity_1's` mis-restoring | If restore stopped being boundary-aware |
| T0943 | filters junk (blank / single-char / pure-number) and dedupes | Noise tokens or unstable placeholder numbering | If `cleanEntities` stopped filtering/deduping |
| T0944 | an empty vocabulary yields the identity redactor (no-op) | Needless work / accidental mangling when nothing is sensitive | If the empty-list short-circuit were removed |
| T0945 | (wiring) staff-narrative sends tokens only, restores real names in the result | A future edit redacting the prompt but forgetting to restore, or sending raw | If the lib stopped redacting-before-send or restoring-after |
| T0946 | (wiring) with no redactor, the raw description is sent unchanged | Redaction silently altering prompts when the org hasn't opted in | If the `redactor ?` guard were inverted/removed |

### `tests/staffNarrativeBriefing.test.ts` — Staff-narrative briefing assembly (no doubling)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0248 | uses the built-in default when there are no additional rules | Empty/blank/whitespace additions leaving the AI with no briefing | If empty, null, or whitespace input didn't return the built-in default |
| T0249 | appends additional rules to the built-in default | User house-style rules not being added on top of the default | If additions weren't appended after the default under an "Additional Rules" heading |
| T0250 | treats a legacy full-briefing row as the whole briefing (no doubling) | A legacy briefing being concatenated with a second copy of the default | If a legacy full-briefing row were appended rather than used as-is |
| T0251 | extractAdditionalRules hides legacy full briefings but keeps real additions | Legacy briefings shown as editable additions, or real additions hidden | If extraction stopped distinguishing legacy briefings from real additions |

### `tests/ai/prompt-assembly.test.ts` — AI prompt builders (green rules in, diagram described out)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0448 | (buildSystemPrompt / BPMN) embeds the rules marker verbatim and keeps the BPMN element vocabulary | Admin GREEN rules not reaching the model, or the BPMN vocabulary being dropped | If the rules weren't included verbatim or the BPMN structure was lost |
| T0449 | (buildSystemPrompt) omits the USER RULES block entirely when no rules are supplied | An empty rules set leaving a stray/confusing rules heading | If an empty rules set still emitted a USER RULES block |
| T0450 | (buildFlowchartSystemPrompt) embeds the rules marker verbatim and keeps the flowchart vocabulary | Green rules not reaching the flowchart prompt | If the rules weren't included or the flowchart vocabulary was dropped |
| T0451 | (buildFlowchartSystemPrompt) omits the USER RULES block when no rules are supplied | A stray rules heading on an empty set | If empty rules still emitted the block |
| T0452 | (buildGenericSystemPrompt) appends the rules marker for every diagram type and keeps the base prompt | A diagram type silently not receiving the green rules | If any type's prompt dropped the rules or its base prompt |
| T0453 | (buildGenericSystemPrompt) returns a sane fallback (no crash, no marker leak) for an unknown type | A crash / leaked rules on an unrecognised diagram type | If an unknown type crashed or leaked the marker into a non-prompt |
| T0454 | (buildGenericSystemPrompt) omits the rules block when rules is empty | A stray rules heading on an empty set | If empty rules still emitted the block |
| T0455 | (buildBpmnPrompt) emits the canonical narrative sections | The "describe this diagram" prompt losing its canonical structure | If the canonical sections (Trigger / What happens / …) weren't emitted |
| T0456 | (buildBpmnPrompt) mentions the task labels, the gateway and its branch labels | A re-generation prompt omitting the actual activities/decisions | If task or gateway/branch labels were missing from the prompt |
| T0457 | (buildBpmnPrompt) describes the trigger, the external participant and the structure | The prompt dropping the start trigger / external pools | If the trigger, external sender, or pool/lane structure was missing |
| T0458 | (buildPromptFromDiagram) routes a BPMN diagram to the BPMN builder | The generic entry point not dispatching BPMN to the BPMN describer | If a BPMN diagram wasn't routed to buildBpmnPrompt |
| T0459 | (buildBpmnPrompt) describes a plain linear flow (the engine wraps it in an auto-pool) | A poolless flow producing an empty/garbled description | If a laid-out linear flow wasn't described |
| T0460 | (buildBpmnPrompt) emits the explicit 'No pools' fallback when there are genuinely no pools | A genuinely poolless raw diagram producing no structure note | If the no-pools fallback branch stopped emitting |
| T1039 | (buildPromptFromDiagram) routes ArchiMate to the structural builder — never the BPMN "No pools" fallback; lists elements by layer, container contents ("contains:"), and each relationship WITH its meaning; empty canvas → "No ArchiMate elements" | ArchiMate Technical Description / Staff Narrative reporting "no pools — nothing to describe" instead of describing the model's elements + relationships | If ArchiMate wasn't routed to buildArchimatePrompt or the structural sections regressed |

---

## Layer 7 — Process Simulator

### `tests/simulation/foundation.test.ts` — RNG, distributions, ISO durations, and event-calendar ordering

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0252 | (rng) is deterministic for a given seed | Same seed no longer reproducing the same random sequence, so runs become unrepeatable | If the RNG algorithm changed or stopped being seeded purely from the seed value |
| T0253 | (rng) snapshot/restore reproduces the continuation exactly (Operator fork basis) | Operator "fork from here" producing a different future than the real run | If `snapshot()`/`restore()` failed to capture/restore the full RNG cursor state |
| T0254 | (rng) derives independent streams per replication | Every replication accidentally sharing one random stream (no real variance across reps) | If `deriveSeed` returned the same seed for different replication indices |
| T0255 | (distributions) fixed is exact; uniform + triangular stay in bounds | Sampled durations falling outside their configured min/max | If a distribution sampler returned values below min or above max |
| T0256 | (distributions) sample means converge to the analytic mean | A distribution being biased so long-run averages are wrong | If a sampler's formula drifted (e.g. wrong exponential/normal math) |
| T0257 | (ISO-8601 durations) parses common BPSim example values | Imported durations like PT24M being read as the wrong number of seconds | If the ISO duration parser mis-handled minutes/hours/days |
| T0258 | (ISO-8601 durations) round-trips seconds → ISO → seconds | Duration values drifting when converted to text and back | If `secondsToIso`/`isoToSeconds` lost precision or used wrong units |
| T0259 | (ISO-8601 durations) converts to/from a base unit | Durations shown in the wrong clock unit (minutes vs hours) | If `isoToUnit`/`unitToIso` applied the wrong unit conversion |
| T0260 | (ISO-8601 durations) rejects malformed input | Bad duration strings silently parsing to garbage instead of erroring | If the parser stopped validating and accepted malformed input |
| T0261 | (event calendar) pops in time order, FIFO on ties | Simulation events firing out of chronological order | If the calendar's ordering or same-time tie-breaking regressed |
| T0262 | (event calendar) serialises + restores preserving order (SimState snapshot) | A resumed run replaying queued events in a different order | If `toJSON`/`fromJSON` lost or reordered scheduled events |

### `tests/simulation/expr-pool.test.ts` — Expression evaluator plus resource-pool seize/release/queue contention

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0263 | (expr) evaluates the actual Car Repair expressions | Imported BPSim conditions/assignments computing wrong results | If `getProperty`, arithmetic, or BPSim `=`-equality handling regressed |
| T0264 | (expr) respects arithmetic precedence + parentheses | Formulas evaluating in the wrong order (e.g. ignoring brackets) | If the parser dropped operator precedence or parentheses |
| T0265 | (expr) handles booleans, comparisons and string concat | Routing conditions and string/`max` expressions returning wrong values | If boolean logic, comparisons, concat, or `max()` evaluation broke |
| T0266 | (expr) is safe — no host access, errors on unknowns | Untrusted expressions reaching host globals or silently passing on errors | If the evaluator exposed globals or stopped throwing on unknowns |
| T0267 | (resource pool) grants up to capacity, queues the rest, FIFO on release | Resources over-granting past capacity or serving the queue out of order | If the pool granted beyond capacity or dequeued non-FIFO |
| T0268 | (resource pool) computes time-weighted utilisation | Utilisation/queue stats being miscalculated over time | If utilisation stopped being weighted by busy duration |
| T0269 | (resource pool) setCapacity is the live Operator lever — grants queued work | Adding capacity mid-run not pulling waiting work off the queue | If `setCapacity` failed to release queued items on a capacity increase |
| T0270 | (resource pool) serialises + restores identically (SimState snapshot) | A resumed run's pool state diverging from the live one | If `toJSON`/`fromJSON` lost busy count or queued items |

### `tests/simulation/engine.test.ts` — Engine M/M/1 oracle, bit-identical resume, token-property condition loop

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0271 | (M/M/1 analytic check) matches utilisation, Wq and Lq for ρ=0.8 | The core queueing engine producing physically wrong utilisation/wait/queue numbers | If the engine's service/queue accounting drifted off the textbook M/M/1 result |
| T0272 | (determinism + snapshot/resume) two fresh runs with the same seed are identical | Identical inputs producing different results run-to-run | If any nondeterminism (unseeded randomness, map ordering) crept into the engine |
| T0273 | (determinism + snapshot/resume) snapshot mid-run + resume reproduces the uninterrupted result bit-identically | Pausing and resuming a run changing the outcome | If `snapshot`/`resume` failed to capture full engine state |
| T0274 | (token properties + condition loop) loops a decision on a token property until it reaches zero | Decision loops (e.g. "fix until no issues") running the wrong number of times | If property assignment, condition evaluation, or loop-back routing broke |

### `tests/simulation/runner.test.ts` — Monte-Carlo runner: determinism, percentile ranges, M/M/1 sanity

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0275 | (runMonteCarlo) is deterministic for the same network + config | A multi-replication run giving different summary stats each time | If replication seeding or aggregation became nondeterministic |
| T0276 | (runMonteCarlo) reports ordered percentiles and a non-degenerate range under variance | Percentile bands being out of order or collapsing a genuinely variable model | If p5/p50/p95 computation regressed or replications stopped varying |
| T0277 | (runMonteCarlo) recovers the M/M/1 utilisation ρ≈0.8 across replications | Aggregated utilisation across reps landing far from the true value | If per-rep utilisation or its mean was mis-aggregated |
| T0278 | (runMonteCarlo) collapses to a zero-width range for a fully deterministic model | A deterministic model wrongly showing spread between replications | If reps diverged despite no randomness in the model |

### `tests/simulation/replay.test.ts` — Trace recording, deterministic Operator forks, diagram→network assembler

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0279 | (trace recording) emits a coherent, time-ordered token-movement log | The green-token replay showing events out of order or missing spawn/exit | If trace events were unordered, or a token lacked a spawn-before-exit lifecycle |
| T0280 | (Operator intervention fork) is deterministic — same intervention + seed ⇒ identical fork | The same Operator action producing different "what-if" outcomes | If applying an intervention introduced nondeterminism into the fork |
| T0281 | (Operator intervention fork) intervening (more capacity) clears more work than leaving it alone | Adding capacity not actually improving throughput | If `applyIntervention` capacity change had no real effect on the engine |
| T0282 | (diagram → network assembler) maps BPMN types to engine nodes, teams and branch routing | Drawn BPMN shapes mapping to the wrong engine node/team/branch | If type mapping, team capacity wiring, or branch-probability conversion regressed |

### `tests/simulation/autofill.test.ts` — Autofill missing sim attributes without overwriting user values

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0283 | (autofillSimulation) fills the source arrival | A start event left without an arrival rate, so the sim can't generate work | If autofill stopped populating source arrival |
| T0284 | (autofillSimulation) fills task cycle time + assigns the lane team, keeps units | Tasks missing a cycle time or not inheriting the lane's team | If autofill stopped deriving cycle time, the lane team id, or default units |
| T0285 | (autofillSimulation) preserves user-entered values | Autofill clobbering values the user already set | If autofill overwrote existing sim params instead of skipping them |
| T0286 | (autofillSimulation) splits decision branch probabilities to 100 | Gateway branch probabilities not summing to 100% | If the probability-splitting math regressed |
| T0287 | (autofillSimulation) reports how many attributes it filled | The "filled N attributes" feedback being wrong/zero | If the filled-count return value stopped being tracked |

### `tests/simulation/cost.test.ts` — Per-team cost = busy-hours × rate; total and per-case roll-up

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0288 | (cost modelling) per-team cost = busy-hours × costPerHour | A team's cost being computed from the wrong busy time or rate | If cost stopped equalling busy-hours times the configured hourly rate |
| T0289 | (cost modelling) totalCost sums teams and costPerCase divides by completed | Total cost or cost-per-case rolling up incorrectly | If totalCost didn't sum teams, or costPerCase didn't divide by completed cases |
| T0290 | (cost modelling) unpriced teams cost nothing | Teams with no rate accruing phantom cost | If an unpriced team contributed non-zero cost |
| T0291 | (cost modelling) converts the clock unit correctly (minutes) | Cost being wrong when the clock runs in minutes instead of hours | If busy-time-to-hours conversion ignored the clock unit |

### `tests/simulation/overrides.test.ts` — Sparse scenario overrides deep-merge onto a shared baseline without mutation

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0292 | (applyOverrides) treats an absent / empty override set as a no-op clone | An empty scenario accidentally altering or aliasing the baseline | If empty-override detection failed or returned the same object reference |
| T0293 | (applyOverrides) sparsely overrides node params, edge probability and team capacity | A scenario's tweaks not actually applying to node/edge/team values | If the deep-merge dropped overridden cycle time, probability, or capacity |
| T0294 | (applyOverrides) never mutates the baseline | One scenario's overrides leaking into other scenarios via the shared baseline | If `applyOverrides` mutated the baseline in place |
| T0295 | (applyOverrides) creates a pool when a node override retargets to an unknown team | Retargeting a task to a new team leaving that team with no pool | If a newly referenced team wasn't auto-created with default capacity |
| T0296 | (applyOverrides) ignores unknown ids | Overrides for non-existent ids injecting phantom nodes | If unknown-id overrides created bogus elements |

### `tests/simulation/interventions.test.ts` — Planned timed interventions: capacity, arrival, branch-prob, inject, with revert

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0297 | (planned interventions) capacity surge raises throughput on a saturated line | A scheduled capacity boost not increasing completions | If a `capacity` intervention failed to enlarge the pool at its scheduled time |
| T0298 | (planned interventions) a time-boxed capacity surge reverts (less throughput than a permanent one) | A temporary surge staying on forever instead of reverting | If the intervention `duration` revert didn't fire |
| T0299 | (planned interventions) arrival scaling increases the number of arrivals | An arrival-rate intervention not changing the inflow of work | If the `arrival` intervention didn't rescale the source rate |
| T0300 | (planned interventions) branchProb override forces routing, and reverts after its duration | A forced routing override either not forcing, or never reverting | If `branchProb` override or its timed revert regressed |
| T0301 | (planned interventions) inject spawns tokens at a node | Token-injection not adding the expected number of cases | If the `inject` intervention spawned the wrong count |
| T0302 | (planned interventions) is deterministic with interventions across replications | Interventions making multi-rep runs non-reproducible | If scheduling interventions introduced nondeterminism |

### `tests/simulation/portfolio.test.ts` — Many diagrams → one network sharing team pools, with id namespacing

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0303 | (assemblePortfolio) merges per-teamId into a single shared pool and namespaces ids | Same-named elements colliding, or each diagram getting its own duplicate team pool | If id namespacing dropped, or shared teams weren't merged into one pool |
| T0304 | (assemblePortfolio) two processes saturate one shared capacity-1 pool (contention) | Cross-process contention being missed (each process behaving as if alone) | If the two processes didn't actually share the one capacity-1 pool |
| T0305 | (assemblePortfolio) a bigger shared pool relieves the same offered load | Adding capacity not easing utilisation/queue in capacity planning | If pool capacity from `teamCapacities` wasn't applied |
| T0306 | (portfolioClosure) follows in-set forward links from the roots, cycle-safe | The bundle missing linked child diagrams, or looping on a cycle | If link-following stopped recursing or didn't guard against cycles |
| T0307 | (portfolioClosure) ignores links that point outside the supplied set | Closure pulling in or erroring on diagrams not in the set | If external links weren't filtered out |

### `tests/simulation/subprocess.test.ts` — Hierarchical subprocess: recursion, loops, multi-instance, resume

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0308 | (subprocess recursion) runs the inline body once and returns to the parent flow | A subprocess body not executing or not returning the token to the parent | If scoped recursion into the body or the return-to-parent link broke |
| T0309 | (subprocess recursion) nested EPs recurse two levels | Subprocesses-within-subprocesses not fully descending | If nested-scope recursion stopped at one level |
| T0310 | (loop / multi-instance) standard loop repeats the body a fixed number of iterations | A standard loop running the wrong iteration count | If loop iteration counting regressed |
| T0311 | (loop / multi-instance) sequential multi-instance runs N body instances serially | Sequential multi-instance running the wrong number of instances | If sequential multi-instance instance-count logic broke |
| T0312 | (loop / multi-instance) parallel multi-instance seizes concurrently and joins before continuing | Parallel instances not running concurrently or not joining before continuing | If parallel seize/join logic or the contention spike regressed |
| T0313 | (subprocess snapshot/resume) is bit-identical across a looping subprocess | Resuming inside a looping subprocess changing the result | If snapshot/resume didn't capture in-flight subprocess/loop state |

### `tests/simulation/eventsub.test.ts` — Event subprocesses: non-interrupting alongside, interrupting cancel+release+divert

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0314 | (non-interrupting event subprocess) fires a handler alongside the parent while the scope is active | A non-interrupting handler not running, or wrongly disrupting the parent | If the timer handler failed to fire or interfered with the parent body |
| T0315 | (non-interrupting event subprocess) is missed if the scope has already finished when the timer fires | A handler firing after its scope has already closed | If the trigger wasn't cancelled once the parent scope completed |
| T0316 | (interrupting event subprocess) cancels the parent's in-flight work, releases its resource, and diverts | An interrupting event not stopping the body, freeing its resource, or rerouting flow | If interrupt cancellation, resource release, or divert-to-handler regressed |

### `tests/simulation/assemble-hier.test.ts` — Hierarchical diagram→network: drawn EP body + nested event-sub become engine nodes

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0317 | (hierarchical assembler) maps the EP to a subprocess node with a body + event sub | A drawn Expanded Subprocess not assembling into a real subprocess with its event sub | If EP-to-subprocess mapping or event-sub extraction (trigger/interrupting/bodyStart) broke |
| T0318 | (hierarchical assembler) scope-tags the body + makes the body start a pass-through | EP body nodes losing their scope tag or the body-start acting as a source | If body scoping or the start→delay pass-through conversion regressed |
| T0319 | (hierarchical assembler) skips the event-sub container + its trigger start event | The event-sub container/trigger leaking in as spurious engine nodes | If the assembler stopped omitting the EV container and its start event |
| T0320 | (hierarchical assembler) actually runs: body + the non-interrupting handler both execute | The assembled hierarchical network failing to run body and handler end-to-end | If the assembled EP or its event sub didn't execute at run time |
| T0321 | (lane → team inheritance) a teamless task inherits its lane's team; explicit team wins | Tasks not picking up their lane's team, or an explicit team being overridden | If lane-team inheritance or the explicit-team-wins precedence broke |

### `tests/simulation/splice-links.test.ts` — Linked subprocess roll-up: flatten child diagram inline, nested, isolated, cycle-safe

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0322 | (linked-subprocess roll-up) flattens a linked subprocess into an inline body and simulates it | A linked child diagram not actually simulating as part of the parent run | If `spliceLinkedSubprocesses` didn't inline+clone the child or wire its bodyStart |
| T0323 | (linked-subprocess roll-up) subMode 'summary' keeps it a black box (not rolled up) | A "summary" subprocess being wrongly expanded instead of kept as one task | If the summary opt-out stopped suppressing the roll-up |
| T0324 | (linked-subprocess roll-up) two parallel linked subprocesses stay isolated and contend on a shared team | Two uses of the same child colliding, or not sharing the child's team for contention | If per-use-site cloning/isolation or shared-team contention broke |
| T0325 | (linked-subprocess roll-up) rolls up NESTED links (A → B → C) | Deeply linked diagrams not flattening all the way down | If nested link splicing stopped before the deepest child |
| T0326 | (linked-subprocess roll-up) a cyclic link terminates (no infinite loop) | A circular link between diagrams hanging the assembler | If cycle detection regressed and the back-link wasn't kept a black box |

### `tests/simulation/bpsim.test.ts` — BPSim interop: import OMG examples + lossless export round-trip

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0327 | (Car Repair) reads the scenario run config | Imported BPSim run settings (replication count, horizon) being read wrong | If scenario config parsing or PT60H horizon conversion regressed |
| T0328 | (Car Repair) reads the InterTriggerTimer as an inter-arrival (PT24M → 24 min) | Inter-arrival timers not being imported as arrival rates | If InterTriggerTimer parsing or its duration conversion broke |
| T0329 | (Car Repair) reads a TruncatedNormal property init (noOfIssues ~ N(2, 1)) | Property initial-value distributions importing incorrectly | If TruncatedNormal→normal mapping or property-init parsing regressed |
| T0330 | (Car Repair) reads expression assignments + a routing Condition | Imported assignment expressions and gateway conditions being lost | If expression-assignment or condition extraction broke |
| T0331 | (Car Repair) reads branch probabilities (FloatingParameter) | Imported branch probabilities being dropped | If FloatingParameter probability parsing regressed |
| T0332 | (Technical Support) reads ProcessingTime distributions (TruncatedNormal + Duration) | Task processing-time distributions importing wrong | If ProcessingTime parsing or PT30S→0.5min conversion broke |
| T0333 | (Technical Support) reads resource Quantity and a Selection expression | Resource quantities and selection expressions being missed | If Quantity or Selection parsing regressed |
| T0334 | (round-trip) preserves every parameter category losslessly | Exporting then re-importing a scenario silently losing parameters | If `buildBpsimData`/`parseBpsimScenarios` dropped any parameter category |
| T0581 | a scenario's `<Calendar>` defs + a source's `calendarRef` survive export→import | Working-hours calendars being dropped by BPSim export/import | If Calendar emission/parsing or the calendarRef attribute regressed |
| T0582 | diagram → BPSim XML → back preserves sim params + source calendar | The Simulator's Export/Import BPSim losing element params on round-trip | If `diagramToBpsimScenario`/`applyBpsimToDiagram` (calendarRef, Selection) regressed |
| T0335 | (round-trip) emits a valid BPSimData wrapper | Exported BPSim XML lacking the required wrapper element | If the export stopped emitting the `<bpsim:BPSimData>` envelope |

### `tests/simulation/examplePackage.test.ts` — Structural validation guarding against malformed example bundles

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0336 | (validateExamplePackage) accepts a well-formed package | A valid bundle being wrongly rejected on adopt | If validation grew a false-positive error for good packages |
| T0337 | (validateExamplePackage) rejects a wrong/missing version | An incompatible-version bundle being accepted | If the version check stopped flagging bad/missing versions |
| T0338 | (validateExamplePackage) flags a study root that doesn't match a diagram key | A study pointing at a non-existent diagram slipping through | If root-key-to-diagram cross-check regressed |
| T0339 | (validateExamplePackage) flags duplicate diagram keys and team names | Duplicate diagram keys or team names corrupting an adopt | If duplicate detection for keys/team names broke |
| T0340 | (validateExamplePackage) requires at least one diagram and at most one baseline | An empty bundle or one with two baselines being accepted | If the no-diagram or single-baseline rule regressed |
| T0341 | (validateExamplePackage) emptyPackage is structurally sound except for the no-diagram rule | The empty-package helper or summary counts drifting | If `emptyPackage`/`summarizePackage` returned wrong counts |

### `tests/simulation/exampleSeeds.test.ts` — Seeded starter examples must validate, assemble, and run end-to-end

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0342 | (starter examples are operational) there is a non-trivial starter set with unique slugs | The starter set being empty or having clashing slugs | If `STARTER_EXAMPLES` shrank below 2 or two examples shared a slug |
| T0343 | (starter examples are operational) every diagram is EDITOR-valid (connectors fully formed, not just engine-valid) | A seeded diagram that runs in the engine but crashes the editor on open | If a seed connector lost waypoints/type/side/routing fields or an element lost finite geometry |
| T0344 | (\<example title\>) has a valid package | A specific starter package failing structural validation | If that example's package data became malformed |
| T0345 | (\<example title\>) assembles its study portfolio with shared team pools | A starter study not assembling, or not collapsing teams to one pool each | If portfolio assembly produced no nodes or the wrong team-pool count |
| T0346 | (\<example title\>) every scenario runs and completes work | A starter scenario that runs but produces zero throughput | If a scenario's overrides/config left the model unable to complete any case |
| T0347 | (starter examples are operational) staffing up relieves the busiest pool (baseline vs add-staff) | The "add staff" scenario not actually reducing the busiest team's load | If the staffed scenario's overrides didn't lower the bottleneck utilisation |

---

## Layer 8 — Help content & dictation

### `tests/help/render-markdown.test.ts` — Markdown→sanitised HTML for the live guide

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0348 | strips <script> while keeping the surrounding text | Malicious scripts in guide content executing in users' browsers | If the sanitiser stopped removing `<script>` tags |
| T0349 | renders a GFM table | Guide tables failing to display | If GFM table rendering were disabled |
| T0350 | swaps :sym[task]: for an inline SVG glyph | BPMN symbol shortcodes showing as raw text instead of icons | If the `:sym[]` shortcode swap stopped emitting SVG |
| T0351 | allows library image refs and data-URI images | Legitimate guide images (library + inline data URIs) being stripped | If the sanitiser blocked `/api/help/images/...` or `data:image` srcs |
| T0352 | drops a javascript: image src | A `javascript:` URL in an image being a security hole | If `javascript:` srcs were no longer stripped |
| T0353 | renders basic formatting (bold, lists, links) | Bold/lists/links not rendering in guide content | If basic Markdown formatting stopped rendering |
| T0354 | returns an empty string for empty input | A crash or stray markup on empty guide content | If empty input returned anything but `""` |

### `tests/help/image-formats.test.ts` — Guide image uploads restricted to displayable formats

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0355 | accepts every browser-displayable image MIME type | Valid image uploads (PNG/JPEG/GIF/WebP/AVIF/SVG/BMP/ICO) being rejected | If any displayable MIME type were removed from the allowlist |
| T0356 | rejects non-displayable image MIME types (TIFF / HEIC / PSD / RAW) | Uploads that render as broken images in browsers being stored | If TIFF/HEIC/PSD/RAW were accepted |
| T0357 | treats a concrete image/* MIME as authoritative over the extension | A misleading extension overriding the real (rejected/accepted) format | If extension were trusted over an explicit `image/*` MIME |
| T0358 | falls back to the extension when the MIME is empty or generic | Files with blank/octet-stream MIME being wrongly accepted or rejected | If extension fallback misjudged a `.png`/`.tiff`/`.heic` file |
| T0359 | is case-insensitive for both MIME and extension | Uppercase MIME/extensions (IMAGE/PNG, .JPG) being wrongly rejected | If matching became case-sensitive |
| T0360 | rejects when there is neither a usable MIME nor a known extension | A nameless/typeless blob being accepted | If empty/null MIME and extension returned true |
| T0361 | the upload accept attribute lists the allowed extensions + MIME types | The file picker offering wrong formats versus what's actually allowed | If `IMAGE_ACCEPT` dropped an allowed extension or MIME type |

### `tests/help/embed-images.test.ts` — Find + base64-embed guide images for export

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0362 | (findAppImageUrls) finds /api/help/images and /help/images refs, dedupes, ignores external | Library image refs being missed, duplicated, or external URLs wrongly grabbed | If detection missed a library ref, failed to dedupe, or matched external URLs |
| T0363 | (findAppImageUrls) returns [] when there are no library refs | Phantom refs found in markdown with only external images | If it returned non-empty when no library refs exist |
| T0364 | (embedMarkdownImages) embeds a library ref as base64, leaves external + missing untouched | Exported documents with broken image links (refs not inlined) or over-rewriting | If a fetched image weren't base64-embedded, or 404/external refs were altered |
| T0365 | (embedMarkdownImages) returns the markdown unchanged when there are no library refs | Needless rewriting of markdown that has nothing to embed | If markdown without library refs were modified |

### `tests/dictation/parse-vtt.test.ts` — WebVTT transcript→speaker-labelled plain text

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0366 | extracts speaker names from <v> voice tags and merges consecutive cues | Teams transcripts losing speaker names or fragmenting into many lines | If `<v>` voice-tag parsing or consecutive-cue merging broke |
| T0367 | handles a leading 'Name:' convention and numeric cue indices | Transcripts using "Name:" prefixes plus index numbers being mis-parsed | If numeric cue indices weren't stripped or "Name:" lines mis-split |
| T0368 | parses a Zoom cloud-recording transcript (WebVTT, 'Name:' prefix + indices) | Zoom transcripts not importing cleanly into the dictation feature | If Zoom-style index+timestamp+"Speaker: text" parsing/merging broke |
| T0369 | strips stray markup and keeps unlabelled lines | Leftover HTML markup, or unlabelled speech being dropped | If inline markup weren't stripped or unlabelled lines were lost |
| T0370 | isVttFile recognises .vtt by name or mime | VTT files not being recognised, or audio files wrongly treated as transcripts | If `.vtt` name/`text/vtt` mime weren't recognised, or audio files matched |

### `tests/dictation/browser-stop.test.ts` — Browser-fallback dictation Stop ends the session

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0371 | uses the browser engine and Stop fires onEnd exactly once | The Dictate UI getting stuck "listening" when Stop does nothing | If `stop()` didn't reset the host (fire `onEnd`), or fired it more than once |
| T0372 | returns a null handle (and ends) when the browser has no speech engine | A silent hang when the browser has no speech recognition support | If no-engine didn't return a null handle, report an error, and end |

---

## Layer 9 — Test infrastructure

### `tests/_setup/infrastructure.test.ts` — Smoke test for the test infrastructure itself

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0373 | connects to the test database (DATABASE_URL was overridden) | Tests accidentally running against the real/prod database | If `DATABASE_URL` weren't pointed at `diagramatix_test` |
| T0374 | can create and read back a user via the real Prisma client | A broken DB schema or factory making every DB test fail confusingly | If the user factory or Prisma read-back failed (e.g. schema not applied) |
| T0375 | creates a user-with-Org bundle with an Owner-role membership | The org/membership factory producing wrong roles for sharing/permission tests | If the bundle didn't create an `Owner`-role membership |
| T0376 | truncateAll wipes every row between tests | Test data leaking between tests and causing flaky failures | If `truncateAll()` left rows behind between tests |

---

## Layer 10 — BPMN geometry rules + Simulator results, run history, subprocess drill-through & working calendars

*(Added T0514–T0571 across the BPMN layout-rule window, the Simulator results/history/subprocess work, and the resource-calendars / working-hours feature.)*

### `tests/conformance/overlap-checks.test.ts` — element / label / lane / data-artifact overlap scanners (B33–B37)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0514 | fires when two tasks occupy the same box (coincidence) | The "Cause-A" bug where AI-placed siblings land on the same pixel | If the element-overlap check (B34) stopped detecting coincident boxes |
| T0515 | clean when elements are spaced apart | False overlap positives on a valid layout | If B34 flagged well-separated elements |
| T0516 | exempts a boundary event mounted on its host | A boundary event (correctly on its host's edge) counted as an overlap | If the boundary-host exemption were removed |
| T0517 | touching edges are not an overlap (no sub-pixel false positives) | Flaky overlap flags from adjacent elements just touching | If the check used `>=` instead of a strict-overlap test |
| T0518 | fires when an event label overlaps a neighbouring element | Event/boundary labels sitting on top of other elements (B33) | If the event-label overlap check stopped firing |
| T0519 | clean when the label sits in free space | False label-overlap positives | If B33 flagged labels in clear space |
| T0520 | exempts the event's own container ancestor (label inside its EP/pool) | A label inside its own EP/pool being wrongly flagged | If the container-ancestor exemption were dropped |
| T0528 | fires when two lanes in a pool overlap | Overlapping lanes that scramble order + block boundary drags (B35) | If the lane-tiling check stopped detecting overlaps |
| T0529 | clean when lanes tile contiguously | False lane-tiling positives on a valid pool | If B35 flagged a correctly tiled pool |
| T0533 | fires when a data object is far from its associated element | Data objects drifting away from their element (B36) | If the data-artifact-distance check stopped firing |
| T0534 | clean when the data object is adjacent to its element | False distance positives | If B36 flagged an adjacent data object |
| T0535 | fires when an input (outward-only) data object has no role | An input data object left without a role (B37) | If the data-object-role check stopped firing |
| T0536 | clean when an output (inward-only) data object is tagged role=output | False role positives on a correctly tagged output | If B37 mis-classified a valid output |

### `tests/bpmn/start-end-placement.test.ts` — Start/End placement + connector length (R8.14/15/18)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0521 | process start clears its lane inner boundary by ≥1 event width (R8.14) | A start event crammed against the lane header | If the start-clearance re-anchor regressed |
| T0522 | first connector (start → first element) ≤ 70% of a task width (R8.15) | An over-long first connector from the start event | If the first-gap shortening stopped applying |
| T0523 | End event hugs its last element ≤ 70% of a task width (R8.18) | An over-long gap before the End event | If the end-placement pass regressed |

### `tests/bpmn/lane-tiling.test.ts` — lanes tile contiguously + cover the pool

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0524 | lanes within a pool tile contiguously (no gaps, no overlaps) | Gaps/overlaps between lanes | If the lane re-tile pass regressed |
| T0525 | the lane stack exactly covers the pool height | Lanes not spanning the pool | If lane heights didn't sum to the pool |
| T0526 | lanes stay contiguous when a lane grows to fit an EP | Overlaps after late EP growth | If `fitLanesToChildren`/re-stack regressed |
| T0527 | the lane stack exactly covers the pool height (EP case) | Pool/lane mismatch after EP growth | If the EP-growth re-tile regressed |

### `tests/bpmn/event-label-nudge.test.ts` — event labels laid out clear of neighbours (R8.16)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0530 | laid-out event labels stay clear of elements and each other | Event labels overlapping after layout | If the label-nudge pass regressed |

### `tests/bpmn/data-object-assoc.test.ts` — data links placed + roled even when the AI emits them as sequence flows (R8.02/03)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0531 | data link emitted as a SEQUENCE flow (the AI's only option) gets role + placement | Data links the AI mis-types as sequence being left un-placed | If R8.02 matched only by connector type, not endpoints |
| T0532 | data link with NO type — R8.02 fires (role + placement correct) | Untyped data links being ignored | If the endpoint-based match regressed |
| T0537 | a Data Store linked by a sequence-typed association sits near its element (R8.03) | Data stores drifting from their element | If the data-store placement (R8.03) regressed |

### `tests/simulation/readiness.test.ts` — pre-run readiness check (surfaces un-set parameters)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0538 | flags a task with no team (warn) and one using an undefined team (error) | Silent defaults / a team that isn't in the library | If `checkSimReadiness` stopped flagging team issues |
| T0539 | flags a decision gateway whose branches have no probabilities/conditions | An unrouted decision silently splitting evenly | If the gateway-routing check regressed |
| T0540 | flags a property read but never initialised (and not one that is) | A `getProperty('x')` that always reads 0 slipping by | If the used-but-uninitialised check regressed |
| T0541 | clean when teams, arrival and routing are all set | False readiness warnings on a complete model | If the check flagged a fully-set process |

### `tests/simulation/caseDist.test.ts` — per-case flow-time distribution (Typical/Near-worst/Spread + histogram)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0544 | empty samples → zeroed distribution (no NaN) | NaN/crash on a run with no completed cases | If `caseDistOf([])` returned NaN |
| T0545 | 1..100: correct mean/sd/percentiles/range, histogram covers every case | Wrong percentiles/spread or a lossy histogram | If the percentile/sd/binning maths regressed |
| T0546 | a single repeated value → degenerate one-bin dist, zero spread | Divide-by-zero on a zero-range distribution | If the single-value/zero-range guard were removed |

### `tests/simulation/assessFacts.test.ts` — grounded facts for the AI comparison assessment

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0547 | computes case-level speed/cost/bottleneck deltas from the two runs | The AI assessment being fed wrong figures | If `buildComparisonFacts` mis-computed a delta |
| T0548 | omits the cost block when neither run has a cost | A phantom $0 cost saving in the prose | If the no-cost guard were removed |
| T0936-T0937 | `summariseComparison` — the deterministic (AI-off) Comparison summary templates flow/throughput/cost/bottleneck + a verdict, and omits the cost line when there's no cost | The AI-off sim fallback showing wrong deltas or a phantom cost line | If the deterministic summariser drifted from the facts |

### `tests/simulation/runHistory.test.ts` — Run History pruning policy

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0549 | keeps the newest N unpinned, prunes older unpinned, never touches pinned | Named/pinned runs being deleted, or unbounded growth | If `runIdsToPrune` pruned pinned runs or the wrong ones |
| T0550 | nothing to prune when unpinned count is within the keep limit | Recent runs being deleted too eagerly | If the keep-limit were ignored |

### `tests/simulation/runningStats.test.ts` — live replay stats timeline

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0551 | tracks completed / in-flight / queue / busy across the trace | Wrong live numbers as the replay plays | If the running-stats accumulator mis-counted |
| T0552 | two tokens contend: one in service, one queued | Queue/busy counters not reflecting contention | If service/queue transitions were mis-tracked |

### `tests/simulation/examplePackage.test.ts` (added) + `tests/simulation/exampleSeeds.test.ts` (added) — comparison + drill-through examples

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0543 | accepts a scenario variant root that matches a diagram key, rejects one that doesn't | A comparison example with a dangling As-is/To-be variant | If `validateExamplePackage` stopped checking `variantRootKeys` |
| T0542 | as-is/to-be comparison examples show the to-be relieving the busiest team | A seeded comparison that doesn't actually improve | If the Aardwolf to-be stopped beating the as-is |
| T0553 | the subprocess drill-through sample flattens its linked children (they carry work) | Linked subprocesses running as empty pass-throughs | If splice or the subtree body-start lookup regressed (child teams idle) |
| T0571 | every example carries a working calendar its human teams follow (AI teams stay 24/7) | The back-filled Business-hours calendar going missing or mis-linked | If the example calendar seed regressed or a human team lost its calendar link |

### `tests/simulation/calendar.test.ts` (added) — working-calendar maths (t=0 ≙ Monday 00:00, weekly repeat)

Pure helpers that convert a weekly `WorkCalendar` into sim-clock times — the correctness-critical core of the resource-calendars (working-hours) feature.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0554 | week length matches the clock unit (minute/hour/second/day) | Wrong week wrap when the scenario's clock unit changes | If the unit→clock conversion regressed |
| T0555 | `isOpenAt` reflects a 9–5 window (end exclusive) | Off-by-one open/closed at shift edges | If a window boundary was mis-evaluated |
| T0556 | weekend + 7-day wrap are closed / reopen next Monday | A calendar not repeating weekly | If the modulo-week logic broke |
| T0557 | hour units resolve the same windows | Calendars only working in minutes | If unit scaling regressed |
| T0558 | a lunch gap reads as closed between two windows | Breaks not modelled | If multi-window days broke |
| T0559 | `nextOpenAt` returns t when open, else the next boundary (incl. weekend + lunch) | Arrivals/queued work not resuming at the right time | If the next-open search regressed |
| T0560 | an empty calendar is always open (safe fallback) | A mis-set/deleted calendar silently starving the model | If empty stopped meaning always-open |
| T0561 | `rateAt` gives the window multiplier when open, 0 when closed | Wrong time-varying arrival rates | If per-window rate lookup regressed |
| T0562 | `boundariesIn` emits open/close transitions within the horizon | Team capacity toggles scheduled at wrong times | If boundary enumeration regressed |
| T0563 | touching windows collapse to one non-race boundary | A capacity flicker (close+open at the same instant) | If adjacent windows stopped collapsing |
| T0570 | `calendarWarnings` flags overlapping windows, not clean/empty ones | Silent data-entry mistakes in a calendar | If the overlap check regressed |
| T0572 | `closedReason` classifies a closure (Lunch / Off-hours / Weekend) for the replay dim cue | The off-shift lane cue mislabelling why work stopped | If the closure classifier regressed |
| T0580 | `serializeWorkCalendar`/`parseWorkCalendar` round-trip a calendar (BPSim `<Calendar>` value) | Working-hours calendars corrupting through BPSim export/import | If the compact calendar string encode/decode regressed |
| T0583 | `simClockLabel` shows the day + time of the working week (t=0 ≙ Mon 00:00) | The replay's day/time readout being wrong | If the sim-clock → "Mon 14:30" conversion regressed |

### `tests/simulation/calendarEngine.test.ts` (added) — working-hours behaviour in the engine

The simulation *effect* of a calendar: teams only work in-hours, in-service tasks finish at close, queued work resumes at open, utilisation is against staffed time, sources gate + rate-vary arrivals.

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0564 | a team on a 9–5 calendar only starts service during open hours | Work happening outside working hours | If capacity toggles stopped gating new seizes |
| T0565 | a token arriving overnight queues and starts at 09:00 | Queued work not resuming at shift open | If the open-boundary drain regressed |
| T0566 | a calendar throttles throughput vs the same model run 24/7 | Calendars having no real effect on results | If staffing toggles stopped reducing capacity |
| T0567 | utilisation is measured against staffed time, not wall-clock | Misleadingly low utilisation for part-time teams | If the pool's time-weighted denominator regressed |
| T0568 | a per-window rate multiplier makes arrivals time-varying (≈2×) | Peak/off-peak demand not modelled | If the arrival rate multiplier stopped applying |
| T0569 | an empty calendar is a no-op (always-open regression guard) | Adding calendars changing no-calendar behaviour | If the calendar code path perturbed the default run |

---

## Layer 10b — AI Assist + Abracadabra Mode (assist-while-you-draw + voice/typed command editing)

### `tests/diagram/assist-placement.test.ts` — ghost placement geometry (rules 1–4, R7)
| # | What it asserts | Bug it prevents | Fails if |
|---|---|---|---|
| T2207 | inline placement — target's near edge 51px right of the source, vertical centres aligned | Accepted ghosts landing at the wrong offset / mis-aligned | If `placeInline` gap or centring regresses |
| T2208 | gateway fan-out — 1st branch inline, then ±rows (h+51) apart, symmetric | Branches stacking on top of each other | If `placeGatewayBranch` sign/row maths regresses |
| T2209 | boundary event near-edge 18px from a corner; bottom-right → top-right → alternate; give up (null) when full | Boundary events overlapping / off the host | If `placeBoundaryEvent` stepping or the give-up guard regresses |
| T2210 | `findFreeSlot` returns the nearest slot ≥51px clear, never overlapping | New elements dropped on top of existing ones | If the overlap search regresses |
| T2211 | R7 — a task after a boundary event lands bottom/top-right, near edge 50px beyond the event's outer point | Boundary-follow task placed at the wrong height / inline | If `placeAfterBoundaryEvent` or `boundaryOuterSide` regresses |

### `tests/diagram/assist-command.test.ts` — the command interpreter (grammar + ref resolution)
| # | What it asserts | Bug it prevents | Fails if |
|---|---|---|---|
| T2212 | `parseCommand` maps add/connect/disconnect/delete/rename/undo phrasings to the right ops | Spoken/typed commands mis-parsed | If a grammar pattern regresses |
| T2213 | add/lanes/sublanes/boundary/move/wrap/clear/export/delete+compact parse to their ops (counts, Oxford comma, "and compact" tail) | Batch 1–3 commands not recognised | If the extended grammar regresses |
| T2214 | `resolveRef` — exact/substring/token-fuzzy name, bare type nouns, pronouns (it/last/previous), kind-prefix strip, positional (left/middle/right pool) | Commands resolving to the wrong element or failing | If reference resolution regresses |
| T2215 | `validateOps` keeps valid AI-returned ops and drops junk | Malformed AI output applied to the diagram | If op validation regresses |

### `tests/diagram/intent-match.test.ts` — semantic Assist/NL rules
| # | What it asserts | Bug it prevents | Fails if |
|---|---|---|---|
| T2216 | `keywordHits` matches whole words case-insensitively, not substrings inside other words | "Disapproved" wrongly triggering an approval suggestion | If the word-boundary regex regresses |
| T2217 | `matchIntent` / `matchAssistRules` return the mapped template/category (or data-object action), or null | Wrong or missing intent suggestions | If catalog matching regresses |

---

## Layer 11 — End-to-end (Playwright) browser tests

Real-browser journeys the Vitest suite can't reach — pointer drags on the SVG canvas, full navigation, cross-page flows. **Separate from the Vitest suite above** (different runner, different CI job) and **separate from deployment**.

### How the e2e layer works

- **Runner:** Playwright (`@playwright/test`), **Chromium only**, **serial** (`workers: 1`, `fullyParallel: false`), 1 retry in CI. Config: `playwright.config.ts`. Run locally: `npm run e2e` (headless) · `npm run e2e:headed` · `npm run e2e:ui`.
- **It is NOT part of the deploy.** It runs in the **`e2e` job of `.github/workflows/ci.yml`** (next to the `test` job, which runs the Vitest suite). The deploy workflow (`azure-deploy.yml`) builds + ships the container image and does **not** run e2e. The two workflows fire **in parallel** on every push to `main`, and the deploy does **not** wait on CI — so a red e2e does not block a deploy (a branch-protection gate is a noted follow-up).
- **Whole suite, every run — not scoped to the diff.** `playwright test` runs **every** spec in `e2e/` on every push, with no awareness of what changed. A change in one area is checked against every journey.
- **Its own app server + database.** `scripts/e2e-server.cjs` builds the app (non-standalone) and serves it on **:3001** against the **`diagramatix_test`** DB (a Postgres **service container** in CI; the local Postgres in dev). On startup it applies the schema (`prisma db push`) and seeds the reference data the journeys need: subscription levels, the Free-tier cap lift, the **mining example catalog**, and a known **SuperAdmin** account.
- **Authenticated by default.** The `setup` project (`auth.setup.ts`) registers the e2e account via the real `/api/register` and logs in once, saving the session to `e2e/.auth/user.json`; every spec reuses it. `auth-smoke` clears the session to test auth itself; the admin mining tests sign in fresh as the seeded SuperAdmin.
- **Asserts on PERSISTED data, not the DOM.** Most journeys drive a real pointer/drag, then read the **saved diagram via the API** (`_helpers.ts` → `diagramData`) — more robust than SVG-DOM assertions, and it proves autosave actually persisted the change. Elements expose `data-element-id`, resize hit-zones `data-resize-handle`, palette items `data-testid`, so tests target real rendered boxes (the editor re-fits the view after a drop, so fixed coordinates can't be assumed).
- **AI-dependent steps skip without a key.** Mining discovery is AI-only, so the "Create draft reference" journey needs a live model — it **skips** when `ANTHROPIC_API_KEY` is absent (e.g. CI) instead of failing.

### The e2e tests (each spec, each case)

**`e2e/auth.setup.ts` — session bootstrap** (runs first; a dependency of every spec)
- *authenticate* — registers the e2e account (201, or 409 if it exists) + logs in through the real form → `/dashboard`; saves the session for reuse.

**`e2e/auth-smoke.spec.ts` — auth itself** (runs UNauthenticated)
- *a seeded user can log in and reach the dashboard* — the login form lands on `/dashboard`.
- *an unauthenticated visitor is kept out of the dashboard* — `/dashboard` redirects to `/login`.

**`e2e/editor.spec.ts` — the create → edit → persist backbone**
- *the editor renders a created diagram's canvas* — a created BPMN diagram opens with the SVG canvas on `/diagram/{id}`.
- *a created diagram reopens (persists) on reload* — reload the editor; same diagram, canvas still renders (it was saved).

**`e2e/canvas.spec.ts` — SVG pointer interactions** (asserted on persisted data)
- *drag a Task from the palette onto the canvas → it persists* — a palette drag creates a task that autosaves.
- *move an element with the pointer → the new position persists* — drag a task down 160px; its saved Y increases.
- *drag-create a connector between two tasks → it persists* — drag from one task's connection point to another; a connector is created + saved.

**`e2e/reroute.spec.ts` — move-and-reroute** (parametrized: BPMN, Flowchart, ArchiMate)
- *move-and-reroute: {BPMN sequence | Flowchart flowline | ArchiMate serving} connector follows the moved element* — seed two connected elements, drag one down; a waypoint lands inside the moved element's new box (the connector re-routed to follow it).

**`e2e/routing-avoid.spec.ts` — obstacle avoidance** (parametrized: task, gateway, intermediate-event, data-object)
- *obstacle avoidance: A→B routes around a {…} between the endpoints* — seed A→B with a third element C in the channel, nudge an endpoint to force a re-route, assert the connector does NOT cross C's box. (Browser-level probe of the known obstacle-avoidance gap.)

**`e2e/ep-boundary.spec.ts` — expanded-subprocess edge-resize drift** (2 diagrams × top/left/right = 6)
- *{synthetic EP + nested | reported diagram}: {top|left|right}-edge live drag — only that edge moves* — grab a real edge resize hit-zone and drag it; assert (1) mid-drag the other three edges hold their screen position and (2) after release the dragged edge moved while the other three stayed put (no whole-element drift).

**`e2e/mining-examples.spec.ts` — Process Mining sample-catalog journeys**
- *gallery renders + Load & open pre-loads the sample CSV; import creates the run* — the gallery card → Load & open → the console opens with the Import panel pre-filled, offering the **three choosable period scenarios** (current month = default); switching to *January 2025* re-stages that log → Import log creates the run.
- *every mining route works over an authenticated session (import → calibrate)* — adopt → import the sample → discover → discover-SM → conformance (181/200) → calibrate, all over authenticated HTTP.
- *＋ Create draft reference scaffolds a reference for a run that has none* — the empty-state button scaffolds an (AI) reference and selects it. **Skips without `ANTHROPIC_API_KEY`.**
- *admin catalog routes are refused for a non-superuser (403)* — the admin API rejects a normal user.
- *(admin) catalog manager loads for a superuser and CRUD works* — the manager page + create / publish / duplicate / delete.
- *(admin) Save run as example: capture route works + the button renders in the console* — capture a run into a draft example; the admin capture button renders.

### Simulation — resources, repeats, recursive fill, the runaway guard, external waits & working timers (T2856–T2873)

| ID | File | What it pins |
|---|---|---|
| T2856 | `tests/simulation/arrival-sources-and-team.test.ts` | A sub-process with a body of its own is a SCOPE, not a unit of work — it takes no time itself. |
| T2857 | `tests/simulation/token-table.test.ts` | Token accounting: every row is a case or an internal token, and the two reconcile with the arrivals. |
| T2858 | `tests/simulation/task-repeats.test.ts` | A repeat / multi-instance marker on a task is simulated — sequential runs as one block, parallel spreads across units. |
| T2859 | `tests/simulation/arrival-sources-and-team.test.ts` | A team is only ever named after something the user drew; no resource is invented under the hood. |
| T2860 | `tests/simulation/default-setup.test.ts` | A model containing system work gets the one shared Automation resource (24/7), not a per-task invention. |
| T2861 | `tests/simulation/arrival-sources-and-team.test.ts` | A system task sitting in a human lane is charged to Automation, not to that lane's team. |
| T2862 | `tests/simulation/task-repeats.test.ts` | Resource accounting balances: what a repeat seizes is exactly what it releases (the capacity-leak guard). |
| T2863 | `tests/simulation/resource-integrity.test.ts` | Only visible, explicitly declared resources may affect a run. |
| T2864 | `tests/simulation/task-repeats.test.ts` | A repeat count is a distribution, so an implausible sample is reported BEFORE the run rather than silently clamped. |
| T2865 | `tests/simulation/autofill-project.test.ts` | Fill reaches the whole drill-down tree, each level taking its own lane as its resource; user-set values are never overwritten. |
| T2866 | `tests/simulation/autofill-project.test.ts` | A start event that is ENTERED (linked child, or expanded-subprocess body) reads fixed 0; an event-subprocess trigger does not. |
| T2867 | `tests/simulation/autofill-project.test.ts` | Resource seeding is scoped to one process tree — opening a process does not provision unrelated processes' teams. |
| T2868 | `tests/simulation/overload-guard.test.ts` | An unstable model is stopped AND explained — a part-run is never presented as a finished answer. |
| T2869 | `tests/xml/xsd-enum-drift.test.ts` | Every typed-enum value the app can export is declared in the XSD (structural, not sample-based). |
| T2870 | `tests/simulation/external-wait.test.ts` | A Receive task / Message catch event is filled as exponential — waiting on someone else is memoryless, not bounded work. |
| T2871 | `tests/simulation/external-wait.test.ts` | WaitTime is simulated as a NON-SEIZING delay: it lengthens the case without holding the resource. |
| T2872 | `tests/simulation/boundary-working-timer.test.ts` | A boundary timer reads its duration off the label; the working/business qualifier is honoured and an unqualified one stays elapsed. |
| T2873 | `tests/simulation/boundary-working-timer.test.ts` | A working boundary timer advances only through open hours, so it cannot expire overnight or across a weekend. |
| T2874 | `tests/config/tests-summary-coverage.test.ts` | Every `Tnnnn` in the test tree has a row in this document — the guard that stops it drifting again. |
| T2875 | `tests/simulation/replay-window.test.ts` | The cold-start replay window stretches past the first open moment, so a business-hours model is not replayed across a dead Monday night. |
| T2876 | `tests/simulation/replay-window.test.ts` | A non-timer edge-mounted trigger (error/escalation/conditional/signal/message) accrues only during the host team's open hours; a timer keeps the elapsed label rule. |
| T2877 | `tests/games/nimb.test.ts` | n × n Nimb move rules: 1..n ✕ (up to a whole line) on consecutive empty squares in one row or column; a single square is offered once, not once per orientation. |
| T2878 | `tests/games/nimb.test.ts` | The misère outcome (last ✕ loses), solved for n=1–5 — 3×3 and 5×5 are first-player wins, 2×2 and 4×4 are not. |
| T2879 | `tests/games/nimb.test.ts` | Symmetry reduction: 27 legal 3×3 moves collapse to 7 distinct, every legal move belongs to exactly one orbit, and green means the move hands over a lost position. |
| T2880 | `tests/games/nimb.test.ts` | The board decomposes into independent shapes no move can span; a move and its rotation leave the same shapes, and every empty square belongs to exactly one. |
| T2881 | `tests/games/nimb.test.ts` | Shape-level advice is only stated when every move it covers wins; classes are value-homogeneous and account for every legal move exactly once. |
| T2882 | `tests/games/nimb.test.ts` | The retrograde solved table agrees with the recursive solver on every position of 1×1–4×4, keeps the misère terminal, and reports progress that reaches exactly 100% — the guard that lets 5×5 be solved a different way. |
| T2883 | `tests/games/nimb.test.ts` | 5×5 is a first-player win with exactly three winning openings, all centred on the middle line, and the advice names the centre rather than pointing at shading. |
| T2884 | `tests/games/nimb.test.ts` | The shape catalogue: every one of the 1,280 forms that fit a 4×4 agrees with the independent shape solver, the per-size counts are the polyomino sequence (so symmetry really is collapsed), and capping the drawing never caps the counting. |
| T2885 | `tests/games/mastermind.test.ts` | Mastermind scoring: black/white pegs, the min-of-counts rule that makes repeated colours behave, symmetry over 80k+ pairs, and the fact that (length−1, 1) can never be answered — so 4 pegs have 14 answers, not 15. |
| T2886 | `tests/games/mastermind.test.ts` | Codes round-trip through their integer index for every code of a 7×5 game, digit 0 is the left-hand peg, and only the configurations the setter is offered (6–10 colours × 3–6 pegs) validate. |
| T2887 | `tests/games/mastermind.test.ts` | The opening shortcut: guesses of the same shape split the full space identically, so the opening ranking needs one representative per integer partition (5 for 6×4, 11 for 10×6) instead of the whole space — and is therefore exact, not sampled. |
| T2888 | `tests/games/mastermind.test.ts` | Narrowing the field: the real code is never filtered out (1,040 checks), a guess's buckets partition the candidates exactly and each equals what the filter keeps, and the position×colour picture matches the surviving codes. |
| T2889 | `tests/games/mastermind.test.ts` | The information theory against published results: Knuth's minimax opening (two pairs, worst case 256) and the maximum-entropy opening (four colours, 3.0567 bits) are both reproduced — including the fact that they are different guesses. |
| T2890 | `tests/games/mastermind.test.ts` | Entropy-greedy play breaks all 1,296 codes of the classic game, averaging 4.4653 turns with a worst case of 6, and finishes the largest 10×6 configuration from a real start. |
| T2891 | `tests/valueChain/prompt-templates.test.ts` | Reading a chain out of the real 463 KB repository document: every chain code found, the section sliced with its title and subprocesses, and the narrative stripped of every existing prompt — so a template change shows up instead of the model copying the block next to it. |
| T2892 | `tests/valueChain/prompt-templates.test.ts` | The five master templates: one per parsed diagram type, each stating the output contract, the BPMN template carrying its seven canonical sections in order, the built-in/additions split, and — since the loop-back defect — that the BPMN template never invites a loop-back and does carry the standard-loop, named-merge, wait-event, cross-reference and data-object instructions. |
| T2893 | `tests/valueChain/prompt-templates.test.ts` | The round trip: every generated block parses back through `parseValueChainMd` — the batch tool's own reader — a whole chain of blocks parses as one document with prompts verbatim, a block that would NOT parse is reported rather than passed through, and a model-added fence is undone. |
| T2894 | `tests/valueChain/prompt-templates.test.ts` | What a run asks for: targets expand to the chain-level prompts plus one per subprocess, only the requested types are generated, and every call is grounded in the narrative and the full subprocess list so a BPMN prompt can name what follows it. |
| T2895 | `tests/bpmn/generated-diagram-conventions.test.ts` | A generated BPMN diagram carries no "AI Generated" annotation even when a prompt label is passed, and no dangling association is left behind — the prompt now lives on `data.aiGeneration` instead. |
| T2896 | `tests/bpmn/generated-diagram-conventions.test.ts` | Every edge-mounted intermediate event comes back interrupting, including one the plan explicitly asked to be non-interrupting. |
| T2897 | `tests/bpmn/generated-diagram-conventions.test.ts` | The trap that guards T2896: an Event Subprocess's INTERNAL start event keeps its non-interrupting flavour, since that is what says its tasks run in parallel with the outer ones. |
| T2898 | `tests/diagram/process-diff.test.ts` | The process diff reads a boundary event's interrupting flag rather than assuming it: a generated event reports interrupting (the generator overrode the plan), while a hand-edited non-interrupting one still reports non-interrupting. |
| T2899 | `tests/valueChain/splice-blocks.test.ts` | The in-place splice of the repository .md: blocks are found and tagged by chain, replacing every block with its own text is byte-identical under BOTH LF and CRLF (the bug that shifted every offset by −1 on a CRLF working copy), a chain-level BPMN block cannot inherit the previous chain’s subprocess heading, and the audit counts the signals the master-template fix was for. |
| T2900 | `tests/valueChain/library.test.ts` | The Process Repository as data: 26 chains / 277 processes / 381 prompts import with their grouping, no key the unique index would reject, every BPMN prompt anchored to a declared process, local renumbering — and the ROUND TRIP, where exporting the library and re-reading it with `parseValueChainMd` gives identical names, types and prompts (a rename would silently break the link scan for every generated project). |
| T2901 | `tests/bpmn/dangling-references.test.ts` | A lane id the model mis-spelled (`Lane_Eng` for the lane element `eng`) is normalised back to the real lane, so its elements are homed and placed instead of parked — and the recovery is reported rather than silently applied. |
| T2902 | `tests/bpmn/dangling-references.test.ts` | An element whose `parentSubprocess` names nothing in the plan still lands inside a real container (and inside its pool) rather than falling through to the float fallback at arbitrary coordinates, and it always produces a diagnostic — the V06.08 failure mode, which used to report a clean success. |
| T2903 | `tests/bpmn/dangling-references.test.ts` | An expanded subprocess left with no children is reported, because it draws as a plausible-looking empty box. |
| T2904 | `tests/bpmn/dangling-references.test.ts` | The guard on the guard: a well-formed plan — including a lane declared as a standalone element with `parentPool`, the field the `AiElement` contract documents — produces NO diagnostics, so an unattended fifteen-diagram run never learns to ignore them. This is what caught `parentPool` being read for sub-lanes only, which orphaned the lane and parked every element assigned to it. |
| T2905 | `tests/bpmn/end-event-near-pred.test.ts` | R8.18 pulls an End event left to hug its sequence-flow predecessor — but that predecessor is not always the rightmost thing on the row. Four shapes where the model leaves a child off the internal chain (a stray child, one linked only to the outer flow, a second End event off a mid-flow task, a branch that never rejoins) must produce NO overlap between EP children; each used to drop the End straight on top of the off-chain child. |
| T2906 | `tests/bpmn/end-event-near-pred.test.ts` | The clamp does not simply disable R8.18: on a clean chain the End still lands within one task-width of its predecessor. |
| T2907 | `tests/valueChain/unique-diagram-name.test.ts` | Regenerating a diagram into a project that already holds one appends " (2)", " (3)", … — the existing diagram is never overwritten, because comparing the new against the old is the reason for regenerating into an existing project at all. |
| T2908 | `tests/valueChain/unique-diagram-name.test.ts` | The suffix fills a gap in the sequence rather than climbing past it. |
| T2909 | `tests/valueChain/unique-diagram-name.test.ts` | A name that already ends in a suffix is its own base — "X (2)" regenerated becomes "X (2) (2)", not "X (3)", which would collide with the third copy of X. |
| T2910 | `tests/valueChain/unique-diagram-name.test.ts` | Fifty names from one base are all distinct — the set is mutated as names are handed out, because one run is a stream of separate creates and re-reading the project between each would race with itself. |
| T2911 | `tests/bpmn/first-connector-slide.test.ts` | R8.15 shortens an over-long first connector by bringing the first element back towards the Start — but in the main pool it moved that element ALONE, closing the gap after the Start and opening an identical one at the very next link. The hole was relocated, not removed. Four EP sizes assert no gap is opened after the first element, and nothing overlaps. |
| T2912 | `tests/bpmn/first-connector-slide.test.ts` | The slide moves a block, so distances INSIDE the downstream flow are unchanged however far the block had to move. |
| T2913 | `tests/bpmn/close-flow-voids.test.ts` | R8.22 closes an EMPTY horizontal band in the flow. R8.21 only ever pushes right and nothing pulls the result back, so one element ranked far right drags the whole remaining flow and leaves slack behind. Pinned against the REAL geometry of V06.06 (1,488px) and V06.08 (1,622px) — every synthetic shape failed to reproduce the void, so a hand-written case would have pinned nothing; the test first asserts the fixture still carries the defect. |
| T2914 | `tests/bpmn/close-flow-voids.test.ts` | The safety property: closing a void moves a block by one dx, so no pair of elements can be brought on top of each other — only the void spacing changes. |
| T2915 | `tests/bpmn/close-flow-voids.test.ts` | A flow with no slack is left byte-identical, so compaction cannot creep a clean diagram left each release. |
| T2916 | `tests/bpmn/close-flow-voids.test.ts` | A gap with anything in it is carrying content, not slack, and is left alone. |
| T2917 | `tests/bpmn/data-object-role.test.ts` | A Data Object that is BOTH written and read carries NO input/output marker — it is neither. The role used to be read off whichever association happened to be first in the connector list, which for a read/write object is arbitrary; V06.08 had four wrongly showing the output marker. |
| T2918 | `tests/bpmn/data-object-role.test.ts` | Reversing the two associations does not flip the marker — the exact defect, since the old rule was order-dependent. |
| T2919 | `tests/bpmn/data-object-role.test.ts` | Written-only is still an output, read-only still an input. |
| T2920 | `tests/bpmn/data-object-role.test.ts` | B37 flags a both-directions Data Object that still carries a marker, so an imported or hand-edited diagram cannot keep one the generator would never produce. |
| T2921 | `tests/bpmn/orphan-ep-chain.test.ts` | An Expanded Subprocess with no children adopts a floating internal chain — an unlabelled start, activities, an unlabelled end, connected to nothing. V06.08 drew the EP as a small empty box while its four activities sat beside it in the lane: the model got the topology right and only the `parentSubprocess` links were missing, which no dangling-reference repair can fix because there is no bad reference, the field was never set. |
| T2922 | `tests/bpmn/orphan-ep-chain.test.ts` | Two empty subprocesses and two floating chains pair up in declaration order. |
| T2923 | `tests/bpmn/orphan-ep-chain.test.ts` | An ambiguous pairing is REFUSED and reported, never guessed — a wrong adoption is worse than an empty box. |
| T2924 | `tests/bpmn/orphan-ep-chain.test.ts` | The counter-guard: a normal main flow, whose start carries a real label and roots the flow, is never mistaken for an orphan chain. |
| T2925 | `tests/bpmn/containment-cycle.test.ts` | A subprocess naming ITSELF as its `parentSubprocess` is cleared and reported. The self-reference passes every check — naming an expanded subprocess is valid, unless you are that subprocess — and then costs the whole diagram: the subprocess is dropped from flow placement in favour of a child pass that positions children against a parent nobody placed, and the flow downstream goes with it. V06.08 returned eighteen "nothing placed it" with ZERO reference errors. |
| T2926 | `tests/bpmn/containment-cycle.test.ts` | A two-step containment cycle is broken the same way. |
| T2927 | `tests/bpmn/containment-cycle.test.ts` | An activity mounted on ITSELF as a boundary host is cleared — an event naming itself is already caught upstream (not a valid host), so the case that reaches this guard is one where every check passes. |
| T2928 | `tests/bpmn/containment-cycle.test.ts` | The counter-guard: real nesting is a chain, not a cycle, and survives untouched. |
| T2929 | `tests/bpmn/containment-cycle.test.ts` | A subprocess that names ITSELF keeps its real children. Confirmed on V06.08: `sp1` named `sp1`, and walking up from each of its seven children also reaches that self-loop — so a single combined pass blamed the CHILDREN, cleared their `parentSubprocess`, and emptied the very subprocess it was meant to save. The self-reference is cleared on its own, first; exactly one thing was wrong and exactly one thing is reported. |
| T2930 | `tests/bpmn/ep-boundary-crossing-flow.test.ts` | A sequence flow may not cross a subprocess boundary. V06.08 looped back from the viability gateway straight INTO an activity inside the subprocess; `canConnect` refuses to draw that in the editor, so a generated diagram must not carry it. The inner endpoint moves onto the subprocess itself — re-enter the loop, not jump into the middle of it. |
| T2931 | `tests/bpmn/ep-boundary-crossing-flow.test.ts` | A flow OUT of a subprocess's insides is repaired the same way. |
| T2932 | `tests/bpmn/ep-boundary-crossing-flow.test.ts` | A boundary event's outgoing flow is left alone — it lives on the rim, and leaving the subprocess is the entire point of it. |
| T2933 | `tests/bpmn/ep-boundary-crossing-flow.test.ts` | Flows entirely inside, or entirely outside, are untouched. |
| T2934 | `tests/bpmn/ep-contains-what-start-reaches.test.ts` | A subprocess contains what its internal Start Event can REACH. V06.08 declared fifteen children of a loop whose internal flow is six; the rest were pre-loop steps plus two post-loop ones the gateway branches to. Declared containment and declared flow contradicted each other, and the flow is the more reliable of the two — it is what the prompt describes and what simulation, the link scan and the .bpmn exporter all read. |
| T2935 | `tests/bpmn/ep-contains-what-start-reaches.test.ts` | The gateway's flow to the evicted steps survives untouched — the containment was wrong, not the flow, so it must not be re-pointed at the subprocess. |
| T2936 | `tests/bpmn/ep-contains-what-start-reaches.test.ts` | A data association leaving a subprocess is NOT a boundary crossing: R8.02 deliberately places data objects outside the EP they belong to, so treating these as crossings would drag every in-subprocess task's data link onto the subprocess. |
| T2937 | `tests/bpmn/ep-contains-what-start-reaches.test.ts` | A subprocess with no single internal Start Event is left alone — nothing to reach from, so the rule has no basis for an opinion. |
| T2938 | `tests/valueChain/prompt-templates.test.ts` | The BPMN master template forbids a Data Store and points at the black-box IT system pool instead — a thing that persists beyond the process IS the system that holds it, and a Data Store beside that pool says the same thing twice in two notations. The old instruction must be gone, not merely contradicted further down. |
| T2939 | `tests/valueChain/prompt-templates.test.ts` | No prompt in the Process Repository asks for a Data Store. The 26 chains were written under the old template and carried 321 of them; without this, the next generation puts them all back. |
| T2940 | `tests/ai/generate-diagnostics-wired.test.ts` | The two routes the EDITOR generates through collect layout diagnostics and return them. The .md batch runner had surfaced these since the V06 work; a single generation in the editor did not, so the same bad plan came back looking like a clean success. |
| T2941 | `tests/ai/generate-diagnostics-wired.test.ts` | EVERY route that lays out a BPMN diagram passes `onDiagnostic` — the real guard, since a route added later must not silently drop them. It found five that did: model compare, mining discover and calibrate, and the two PCF decompose routes. |
| T2942 | `tests/ai/generate-diagnostics-wired.test.ts` | Both editor panels read the diagnostics off the response, render them, and CLEAR them on a new run — a run that fails early returns before the response is read, and a stale list would look like it belonged to this attempt. |
| T2943 | `tests/bpmn/activity-text-fit.test.ts` | A task INSIDE an expanded subprocess is sized to its label. Top-level elements went through `autoElementSize`; EP children were pushed at the catalogue 102x65, so a generated name like "Assess Sales Channel Fit and Distributor Viability" (128x81 fitted) spilled outside its box. Nine of ten real V06 names overflowed. |
| T2944 | `tests/bpmn/activity-text-fit.test.ts` | A top-level task still fits its label — the path that already worked. |
| T2945 | `tests/bpmn/activity-text-fit.test.ts` | Sized children still do not overlap and stay inside the box. The old spread divided the usable width by INDEX assuming every child was 102 wide, so a fitted child sat 12px from its neighbour and a four-line name would have overlapped; the spread is now by actual width with a 38px floor — the gap the old 140px pitch implied. |
| T2946 | `tests/bpmn/activity-text-fit.test.ts` | A short label is NOT inflated: autosize is a floor, not a stretch, or every diagram would grow for no reason. |
| T2947 | `tests/bpmn/activity-text-fit.test.ts` | The GRID branch (an EP holding an event subprocess) sizes its children too — a separate push site with the same defect. |
| T2948 | `tests/partner/auth.test.ts` | A partner key resolves to ITS org even when the service user's OLDEST org membership is a different one. `getCurrentOrgId` falls back to the oldest membership, so without the cookie stub a service user who ever joins a second org silently starts writing into the wrong tenant. The key is deliberately bound to the YOUNGER membership, and the assertion runs through the real resolver — removing the stub fails this test. |
| T2949 | `tests/partner/auth.test.ts` | The synthesised cookie store reveals no impersonation cookie, so a machine caller cannot act as somebody else by construction as well as by permission. |
| T2950 | `tests/partner/auth.test.ts` | A revoked key and an expired key are both refused. |
| T2951 | `tests/partner/auth.test.ts` | A missing scope is 403 `scope_denied`, distinct from a bad key's 401 — "your key is wrong" and "your key cannot do this" are different problems. |
| T2952 | `tests/partner/auth.test.ts` | A service user who is a SuperAdmin is refused outright. Fail-closed: such a key would hand a third party impersonation, arbitrary model choice and every admin surface. |
| T2953 | `tests/partner/auth.test.ts` | No key at all is a 401, not a crash. |
| T2954 | `tests/partner/auth.test.ts` | `Authorization: Bearer` works as well as `X-Api-Key`. |
| T2955 | `tests/partner/auth.test.ts` | Body capture is on only during an UNEXPIRED testing window: an expired window degrades to live behaviour, so forgetting to move a key fails safe rather than retaining forever. |
| T2956 | `tests/partner/auth.test.ts` | The usage stamp advances, and the raw key appears in NO column of the key row. |
| T2957 | `tests/partner/logging.test.ts` | Every call writes one `PartnerRequest` row, and the `ref` on it matches the `X-Diagramatix-Request-Id` header the caller can quote. |
| T2958 | `tests/partner/logging.test.ts` | A call that never reaches a handler is STILL logged — the whole reason the log is a wrapper at the edge. A 401 storm is the commonest integration symptom and creates no job to hang a log off. |
| T2959 | `tests/partner/logging.test.ts` | A `live` key stores sizes, status and timing but NO bodies. |
| T2960 | `tests/partner/logging.test.ts` | A `testing` key stores bodies, truncated to the envelope limit, with the key redacted — asserted as the key string appearing in no column at all. |
| T2961 | `tests/partner/logging.test.ts` | A handler that throws still produces a row and a clean 500 that tells the caller nothing about our internals. |
| T2962 | `tests/partner/logging.test.ts` | Source-text tripwire: no route under `app/api/public/**` may skip `authenticatePartner` or `withPartnerLogging`. A route added later cannot be reachable without a key, or leave no trace of a call. |
| T2963 | `tests/partner/logging.test.ts` | The ONE open route — the self-describing contract at `/api/public/v1` — cannot become a data leak: it reads no database and no request body. Requiring a key to read documentation produces support emails instead of integrations, so the exception exists; it is NAMED rather than pattern-matched, and widening it means editing two tests on purpose. |
| T2963 | `tests/partner/attachment.test.ts` | A PDF becomes a `pdf` attachment and reaches the model whole. |
| T2964 | `tests/partner/attachment.test.ts` | A DOCX becomes TEXT containing its words, and NOT its ZIP bytes. `.docx` has been in the editor's accept list while falling through to `file.text()`, so a Word SOP arrived at the model as stringified ZIP and produced a diagram built from noise — silently. |
| T2965 | `tests/partner/attachment.test.ts` | The BYTES win over a wrong declared type: a PDF announced as `text/plain` is still read as a PDF. A machine caller mislabels things, and the old path stringified them. |
| T2966 | `tests/partner/attachment.test.ts` | What we cannot read is REFUSED by name — a .zip, a legacy .doc, arbitrary binary. Turning a spreadsheet into gibberish and drawing it is worse than declining it. |
| T2967 | `tests/partner/attachment.test.ts` | Plain text and markdown come through as text. |
| T2968 | `tests/partner/attachment.test.ts` | An over-long document is cut AND says it was cut — silently truncating would let a caller believe the whole thing was modelled. |
| T2969 | `tests/partner/attachment.test.ts` | An empty file is refused rather than sent as an empty prompt. |
| T2970 | `tests/partner/attachment.test.ts` | `sniff` recognises PDF, PNG, JPEG, GIF and ZIP containers, and returns null for prose. |
| T2971 | `tests/partner/shape-and-run.test.ts` | Pools and lanes come back nested, in canvas order, with a black-box system pool marked external. |
| T2972 | `tests/partner/shape-and-run.test.ts` | Activities are numbered from 1 and carry their pool, lane, task type and element id. |
| T2973 | `tests/partner/shape-and-run.test.ts` | A gateway with two ways out surfaces as a decision with its branches. (A one-way gateway is not a decision — my first fixture had one, and the test was right.) |
| T2974 | `tests/partner/shape-and-run.test.ts` | A two-lane process does not warn about a single lane; a one-lane one does, because a role analysis over it returns nothing and the caller should be told why. |
| T2975 | `tests/partner/shape-and-run.test.ts` | The payload's keys match an explicit allow-list. `SopSkeleton` is internal and will grow fields for SOP reasons; this is what stops one appearing in a published contract by accident. |
| T2976 | `tests/partner/shape-and-run.test.ts` | Shaping is deterministic — the caller SCORES this payload, so a reordering between calls would make any comparison meaningless. |
| T2977 | `tests/partner/shape-and-run.test.ts` | A description alone produces a diagram and a payload, against a stubbed model — no server, no database, no AI spend. |
| T2978 | `tests/partner/shape-and-run.test.ts` | The document is FORWARDED to the model, and the prompt tells it the document is authoritative. `generateDiagramData` accepted no attachment before this slice, so a document could not reach `planBpmn` through the normal path at all. |
| T2979 | `tests/partner/shape-and-run.test.ts` | Neither a description nor a document is refused BEFORE any model call — an empty request must not cost a token. |
| T2980 | `tests/partner/shape-and-run.test.ts` | A model that cannot produce a plan becomes an actionable error that tells the caller what to do, not what our parser said. |
| T2981 | `tests/partner/shape-and-run.test.ts` | Stages are reported in order and the raw plan is offered for storage — what makes a bad generation replayable offline. |
| T2982 | `tests/partner/jobs.test.ts` | A job runs queued → running → succeeded, carrying its result and its attempt count. |
| T2983 | `tests/partner/jobs.test.ts` | The stored request is a FINGERPRINT, never the content: character count and SHA-256 only. The description lives on the diagram where the customer can delete it. |
| T2984 | `tests/partner/jobs.test.ts` | The uploaded document is stored only while the key is in an open testing window. |
| T2985 | `tests/partner/jobs.test.ts` | The reaper turns an abandoned `running` job into an honest `worker_lost` failure that tells the caller to retry — there is no queue, so a container swap mid-job would otherwise leave someone polling forever. A merely slow job is left alone. |
| T2986 | `tests/partner/jobs.test.ts` | A stored error is curated, never a raw exception string — the value is handed to the partner on their next poll, so a Prisma or LibreOffice message there is both a leak and useless. |
| T2987 | `tests/partner/jobs.test.ts` | A testing window that simply EXPIRES purges the document it was keeping. Going live purges immediately; this is the case nobody is watching, and a promise with no enforcement is not a promise. |
| T2988 | `tests/partner/jobs.test.ts` | The daily job count is per key and per day — the durable half of the quota, since the in-memory rate limiter resets on deploy. |
| T2989 | `tests/partner/jobs.test.ts` | The same `Idempotency-Key` cannot make two jobs, so a retry after a dropped connection does not start a second generation. |
| T2990 | `tests/partner/harness.test.ts` | A harness case keeps its document verbatim so a run can be reproduced from it. |
| T2991 | `tests/partner/harness.test.ts` | A case names itself from its description when nothing better is given — the library has to be browsable without anyone inventing titles. |
| T2992 | `tests/partner/harness.test.ts` | A `HarnessCase` is NEVER touched by the retention purge that clears `PartnerJob.inputDocument`. The corpus is OUR material and must survive; a customer's document must not. They hold similar bytes with opposite requirements, and this is the assertion that keeps them from being confused for each other. |
| T2993 | `tests/partner/harness.test.ts` | A job records the case that produced it, so a case accumulates a run history. |
| T2994 | `tests/partner/harness.test.ts` | The harness page never carries a key: no `X-Api-Key`, no `dgxk_`, and it talks only to the SuperAdmin proxy that attaches one server-side. A live key in page JavaScript is a burned key. |
| T2995 | `tests/partner/harness.test.ts` | The proxy refuses to drive anything but an internal-phase key — using one rotates its secret, which would break a partner's integration without telling them. |
| T2996 | `tests/partner/render.test.ts` | The rendered SVG carries an intrinsic width and height matching the content. The thumbnail renderer emits a viewBox only; without a size LibreOffice picks a default page and the PDF opens looking wrong — worse than a failure, because nobody investigates it. |
| T2997 | `tests/partner/render.test.ts` | It has an opaque white background and a font stack the Docker image actually carries — a transparent PDF prints as whatever the viewer decides. |
| T2998 | `tests/partner/render.test.ts` | The content is really in the SVG (pool, lane and task names), not just a frame. |
| T2999 | `tests/partner/render.test.ts` | An empty diagram throws rather than handing LibreOffice an empty file, which fails confusingly much further downstream. |
| T3000 | `tests/partner/volumetrics.test.ts` | Minutes per run are split across the activities as a DOCUMENTED value (`cycleTime` + `timeUnit`) — what the Properties panel shows. |
| T3001 | `tests/partner/volumetrics.test.ts` | …and as a SIMULATION value, so a partner-created diagram opens runnable with no second step between "the API made this" and "press play". |
| T3002 | `tests/partner/volumetrics.test.ts` | Every derived value is marked `autofilled` and the fiction is stated in words. Splitting one aggregate equally across tasks is the only honest move with a single number, but it IS a fiction — a derived number that cannot be told from a measured one is worse than no number. |
| T3003 | `tests/partner/volumetrics.test.ts` | Runs per month become an exponential arrival rate on a STATED basis; business and calendar give different, documented answers rather than a silent assumption. |
| T3004 | `tests/partner/volumetrics.test.ts` | The headline numbers an automation score wants — hours per month and year, FTE equivalent — with the FTE divisor returned alongside so it can be argued with. |
| T3005 | `tests/partner/volumetrics.test.ts` | Nothing to attach to is reported in the notes, not thrown. |
| T3006 | `tests/partner/volumetrics.test.ts` | The original diagram is not mutated. |
| T3007 | `tests/partner/round-trip.test.ts` | An identical diagram scores 100 with nothing lost or invented. |
| T3008 | `tests/partner/round-trip.test.ts` | A dropped step is reported as MISSING and the score falls. |
| T3009 | `tests/partner/round-trip.test.ts` | An INVENTED step is counted as invented, not silently credited — a scorer that measured only recall would rate a hallucinating model perfect, which is exactly the failure the number exists to catch. |
| T3010 | `tests/partner/round-trip.test.ts` | A step that comes back in the wrong lane is flagged, with the lane it left and the one it arrived in. |
| T3011 | `tests/partner/round-trip.test.ts` | Reordering the surviving steps is detected. |
| T3012 | `tests/partner/round-trip.test.ts` | Matching folds away case, punctuation and the generator's hard line breaks, so a wrapped name is the same activity. |
| T3013 | `tests/partner/round-trip.test.ts` | A RENAMED step scores as one lost and one invented — the conservative direction, under-reporting success rather than flattering it, and the caveat travels with the score so a caller can read it correctly. |
| T3014 | `tests/partner/bundle.test.ts` | A case round-trips through the export bundle with its document byte-for-byte intact — otherwise the corpus is not portable. |
| T3015 | `tests/partner/bundle.test.ts` | Ground truth travels as a LABEL, not an id, and re-resolves in the importing environment. |
| T3016 | `tests/partner/bundle.test.ts` | A name that does not exist here resolves to NOTHING rather than to something else. The failure this prevents is a bundle imported elsewhere silently scoring a round trip against a stranger's diagram — a number that looks fine and means nothing. |
| T3017 | `tests/partner/bundle.test.ts` | A run records the case it replayed, so a case accumulates a history to compare across. |
| T3018 | `tests/partner/public-url.test.ts` | The forwarded host beats the bind address. In a standalone build `new URL(req.url)` is rebuilt from the listener, so its host is 0.0.0.0 and its scheme is whatever a proxy declared — which produced both an SSL failure calling ourselves and a deep link reading `https://0.0.0.0:3000/diagram/…`. |
| T3019 | `tests/partner/public-url.test.ts` | A forwarded chain uses the CLIENT's protocol — the first entry, not the last. |
| T3020 | `tests/partner/public-url.test.ts` | `APP_BASE_URL` overrides everything, trailing slash normalised — the same variable the cron routes already use for this exact problem. |
| T3021 | `tests/partner/public-url.test.ts` | In dev it is simply the host header. |
| T3022 | `tests/partner/public-url.test.ts` | With no headers at all it falls back to the request's own origin. |
| T3023 | `tests/partner/auth.test.ts` | A VALID key can authenticate far more often than the failure allowance. The brute-force guard originally charged a token on every attempt, so it caught its own harness first — polling from one loopback address burns twenty a minute without a single bad key. A control that fires on correct behaviour is not a control, it is an outage. |
| T3024 | `tests/partner/auth.test.ts` | Repeated BAD keys are still stopped — removing the false positive must not remove the control with it. |


### V25.05 generated-layout defects and the B48–B52 red rules (T3025-T3079)

> Added 2026-08-31 after Paul's review of a generated diagram. Four of the five
> faults were the same mistake: the layout measured a SHAPE where the renderer
> draws a shape PLUS a label, so clearance was decided against a number that
> never reaches the screen. `externalLabelBox` / `connectorLabelWidth` are now
> the shared measurement, and these tests pin both the layout behaviour and the
> five rules that catch a regression.

| Ref | File | What it asserts |
|---|---|---|
| T3025 | `tests/bpmn/v2505-layout-defects.test.ts` | An edge-mounted event's exit target is placed to the RIGHT of the event and clear of the mounted edge, not dropped straight below it. |
| T3026 | `tests/bpmn/v2505-layout-defects.test.ts` | That exit connector is an L — it turns exactly once. A bare vertical spike has no bend. |
| T3027 | `tests/bpmn/v2505-layout-defects.test.ts` | The exit target sits FULLY inside the event's lane. `fitLanesToChildren` cannot rescue it (events are NON_LANE_BOUND by design), so containment is enforced at the placement. |
| T3028 | `tests/bpmn/v2505-layout-defects.test.ts` | The exit target's label sits to the RIGHT of it — never above, which is where the subprocess it just escaped from is. |
| T3029 | `tests/bpmn/v2505-layout-defects.test.ts` | A re-route reproduces the exit path exactly. Paul reported re-routing undoing his manual L; it did, because a target directly below made a straight drop the CORRECT route. Fixing the placement makes the L the router's own answer. |
| T3030 | `tests/bpmn/v2505-layout-defects.test.ts` | A TOP-mounted edge event puts its target above the rim instead — the mirror of the bottom case. |
| T3031 | `tests/bpmn/v2505-layout-defects.test.ts` | A data object's wrapped label clears every body below it. |
| T3032 | `tests/bpmn/v2505-layout-defects.test.ts` | An event's label inside an Expanded Subprocess stays within the box — the EP is sized around children's LABELS, not just their shapes. |
| T3033 | `tests/bpmn/v2505-layout-defects.test.ts` | `externalLabelBox` counts WRAPPED lines, not hard newlines. The bug it replaces measured a four-line generated name as one line, so the clearance pass could not see the overlap. |
| T3034 | `tests/bpmn/v2505-layout-defects.test.ts` | A task has NO external label — its name is inside its box. Guards the opposite error: treating it as external would inflate every container holding one. |
| T3035 | `tests/bpmn/v2505-layout-defects.test.ts` | `connectorLabelWidth` reports the RENDERED width, not the stored 80px column. |
| T3036 | `tests/bpmn/v2505-layout-defects.test.ts` | A decision gateway's two branches leave from DIFFERENT vertices — top and bottom. |
| T3037 | `tests/bpmn/v2505-layout-defects.test.ts` | A branch's Expanded Subprocess is placed on the side its branch leaves from, rather than level with the gateway. |
| T3038 | `tests/bpmn/v2505-layout-defects.test.ts` | No horizontal connector run passes closer than ¾ of an event height to a lane edge. |
| T3039 | `tests/bpmn/v2505-layout-defects.test.ts` | Two message labels on one black-box pool do not overlap, measured with the renderer's own auto-sized width. |
| T3056 | `tests/bpmn/v2505-layout-defects.test.ts` | A decision branch label does not sit ON its own horizontal segment - it must read clearly above or below the line. |
| T3060 | `tests/bpmn/v2505-layout-defects.test.ts` | No event label is drawn over another element body, measured on the finished diagram rather than mid-layout geometry. |
| T3061 | `tests/bpmn/v2505-layout-defects.test.ts` | No event label is drawn across a sequence or message connector - the half R8.16 could never check, because connectors do not exist when it runs. |
| T3062 | `tests/bpmn/v2505-layout-defects.test.ts` | The edge-mounted exit target keeps its label on the RIGHT while the right is clear; R8.29 tries the current offset first. |
| T3063 | `tests/bpmn/v2505-layout-defects.test.ts` | No data-artifact label is drawn across a sequence or message connector - the half R8.02 clearance could not check, running before routing. |
| T3064 | `tests/bpmn/v2505-layout-defects.test.ts` | A lifted artifact keeps its OWN association attached to it. The lift happens after routing, so the association must be re-routed or the line points at where the object used to be. |
| T3065 | `tests/bpmn/v2505-rules.test.ts` | B48 fires when a data-artifact name lands on a sequence connector. |
| T3066 | `tests/bpmn/v2505-rules.test.ts` | B48 is silent when the flow runs clear below the name. |
| T3067 | `tests/bpmn/v2505-rules.test.ts` | B48 never reports the artifact own association, which passes the label by construction. |
| T3068 | `tests/bpmn/v2505-rules.test.ts` | B55 fires on a data association crossing most of the diagram, and the message says to REPEAT the object beside its far consumer. |
| T3069 | `tests/bpmn/v2505-rules.test.ts` | B55 is silent on a short hop. |
| T3070 | `tests/bpmn/v2505-rules.test.ts` | A long hop that is a small part of a WIDE diagram is left alone - why both thresholds must pass, not either. |
| T3071 | `tests/bpmn/v2505-rules.test.ts` | A big fraction that is only a short distance is left alone too. |
| T3072 | `tests/bpmn/v2505-rules.test.ts` | Matched by ENDPOINT, so a plan-typed "sequence" data link still counts - the AI plan cannot emit an association type. |
| T3073 | `tests/bpmn/v2505-layout-defects.test.ts` | A remote consumer gets its own COPY of the data artifact instead of a line across the diagram (R8.31). |
| T3074 | `tests/bpmn/v2505-layout-defects.test.ts` | After repetition every data association is short - the 3,000px link is gone. |
| T3075 | `tests/bpmn/v2505-layout-defects.test.ts` | The copy inherits the container of the element it serves; parentage stays as it was. |
| T3076 | `tests/bpmn/v2505-layout-defects.test.ts` | Roles are re-derived after the split, so no copy keeps an input/output marker that is no longer true. |
| T3077 | `tests/bpmn/v2505-layout-defects.test.ts` | The CALLER plan is not mutated. The generate route reads plan.elements.length after layout, so adding copies to the input would corrupt the stored plan and make every replay add another copy. |
| T3078 | `tests/bpmn/v2505-layout-defects.test.ts` | No connector endpoint is left behind by a later element move - the invariant that would have caught the V23.04 regression, where growing a lane after routing detached 18 of 38 connectors. |
| T3079 | `tests/bpmn/v2505-layout-defects.test.ts` | An artifact is never lifted out of its lane, and never grows one: the lift is capped by the room already in the band. |
| T3080 | `tests/bpmn/v2301-branch-rows.test.ts` | Every step of a decision branch sits on the row the branch was fanned onto (R55.1); the chain no longer drifts back to the lane centre. |
| T3081 | `tests/bpmn/v2301-branch-rows.test.ts` | The branches stay on different rows in a stable order, which is what stops paths crossing on the way into the merge. |
| T3082 | `tests/bpmn/v2301-branch-rows.test.ts` | A data association is not mistaken for a second inbound FLOW - an AI plan types data links as sequence, and reading one as flow stopped the row one step short. |
| T3083 | `tests/bpmn/v2301-branch-rows.test.ts` | An edge-mounted event travels with the task R55 moved. Setting y directly left them behind, looking detached and springing back to the rim on a drag. |
| T3084 | `tests/bpmn/v2301-branch-rows.test.ts` | Two message flows from tasks in the same column are separated horizontally instead of drawn down one line (R05.10). |
| T3085 | `tests/partner/v2-review.test.ts` | The caller instructions are appended to the prompt (v2/7). |
| T3086 | `tests/partner/v2-review.test.ts` | They come LAST, so "keep this at a high level" qualifies our guidance rather than being qualified by it. |
| T3087 | `tests/partner/v2-review.test.ts` | No instructions leaves the prompt byte-identical - a blank field adds nothing. |
| T3088 | `tests/partner/v2-review.test.ts` | A delivered callback reports success and carries the job id in a header (v2/5). |
| T3089 | `tests/partner/v2-review.test.ts` | A refused callback NEVER throws: the run succeeded, and delivery is not generation. |
| T3090 | `tests/partner/v2-review.test.ts` | A 4xx is not retried - the receiver has said not this, and not again. |
| T3091 | `tests/partner/v2-review.test.ts` | A 5xx IS retried, which is the case worth trying twice. |
| T3092 | `tests/partner/callback-inbox.test.ts` | A callback delivery for a REAL job is recorded, so the harness can show it arrived. |
| T3093 | `tests/partner/callback-inbox.test.ts` | A delivery for an UNKNOWN job is accepted and DROPPED - the receiver is unauthenticated by design, so nobody who finds it can use it as free memory. |
| T3094 | `tests/partner/callback-inbox.test.ts` | The stored headers never carry a key. |
| T3095 | `tests/partner/callback-inbox.test.ts` | The inbox is bounded, oldest evicted first, so a stuck loop cannot eat the process. |
| T3096 | `tests/partner/advertised-routes.test.ts` | Every path the contract endpoint advertises resolves to a route file. The artifact handler lived at .../artifact/route.ts while the contract advertised .../artifact/diagram.pdf, so EVERY artifact URL 404d from the day it shipped - a handler can be perfect and still be unreachable. |
| T3097 | `tests/partner/advertised-routes.test.ts` | The four artifact paths in particular, which is the case that shipped broken. |
| T3098 | `tests/partner/advertised-routes.test.ts` | Negative control: the matcher says NO to a path that does not exist, so the two tests above cannot pass vacuously. |
| T3099 | `tests/bpmn/path-analysis.test.ts` | Branches are numbered 1, 2, 3 and a nested branch carries its parent number (2.1); the ROOT trunk is unnumbered. |
| T3100 | `tests/bpmn/path-analysis.test.ts` | Every flow element belongs to exactly one path. |
| T3101 | `tests/bpmn/path-analysis.test.ts` | A path that ENDS before its merge is recorded as such and still owns a row - Paul: some sub-paths may end before their Merge. |
| T3102 | `tests/bpmn/path-analysis.test.ts` | A path continues THROUGH a nested decision to its merge, so the trunk does not stop at the fork. |
| T3103 | `tests/bpmn/path-analysis.test.ts` | Rows run 1, 2.1, 2.2, 2.3, 3 from top to bottom - the in-order walk of the path tree, which is the order Paul drew. |
| T3104 | `tests/bpmn/path-analysis.test.ts` | The middle branch keeps the trunk, and the trunk stays where the flow already is. |
| T3105 | `tests/bpmn/path-analysis.test.ts` | A nested path sits BETWEEN the trunk and its uncle, never on it. This is the defect it replaces: 2.1 landed on path 1 and 2.3 on path 3. |
| T3106 | `tests/bpmn/path-analysis.test.ts` | No two sibling paths share a row, except a path and the child that continues it. |
| T3107 | `tests/bpmn/path-analysis.test.ts` | Elements resolve to their path row. |
| T3108 | `tests/bpmn/v2301-branch-rows.test.ts` | R8.32 — a decision sits halfway between the TOP boundary of its highest branch and the BOTTOM boundary of its lowest, read from FINAL positions. |
| T3109 | `tests/bpmn/v2301-branch-rows.test.ts` | R8.32 — the paired merge shares its decision line, so neither is left on the stale pre-path row R8.01 computed. |
| T3110 | `tests/bpmn/gateway-vertex-endpoints.test.ts` | R6.30 — any offset a mouse can produce on a gateway resolves to an exact diamond vertex, checked against the rendered point. |
| T3111 | `tests/bpmn/gateway-vertex-endpoints.test.ts` | R6.30 — it picks the NEAREST vertex, not simply the side own: a drop high on the right side goes to the top vertex. |
| T3112 | `tests/bpmn/gateway-vertex-endpoints.test.ts` | Negative control — a mid-edge offset really is off-vertex, so the snap assertions cannot pass vacuously. |
| T3113 | `tests/bpmn/gateway-vertex-endpoints.test.ts` | Every arrow key that moves an endpoint off a gateway vertex moves it in the direction the key points. |
| T3114 | `tests/bpmn/gateway-vertex-endpoints.test.ts` | The same holds part-way along an edge on all four sides, where offset runs backwards on two of them. |
| T3115 | `tests/bpmn/gateway-vertex-endpoints.test.ts` | A nudged endpoint can LEAVE a vertex and walk round to the next one — both halves of the old snap trap. |
| T3116 | `tests/ai/technical-description-branches.test.ts` | Every `On **branch**` a Technical Description opens has a matching `End of **branch**`. |
| T3117 | `tests/ai/technical-description-branches.test.ts` | A branch that rejoins NAMES the gateway it rejoins at, so it reads differently from one that stops. |
| T3118 | `tests/ai/technical-description-branches.test.ts` | A branch that truly ends says so and claims no rejoin. |
| T3119 | `tests/ai/technical-description-branches.test.ts` | The shared tail after a merge is stated ONCE at the outer level, not nested inside whichever branch reached the merge first. |
| T3120 | `tests/ai/technical-description-branches.test.ts` | The tail is announced as following the merge, and a merge feeding another merge leaves no dangling header. |
| T3121 | `tests/bpmn/emie-subpath-rows.test.ts` | R55.3 — a bottom-mounted edge event's sub-path runs on its own row BELOW the path it branches off. |
| T3122 | `tests/bpmn/emie-subpath-rows.test.ts` | R55.3 — a top-mounted event's sub-path runs above instead: it leaves the event the way the event faces. |
| T3123 | `tests/bpmn/emie-subpath-rows.test.ts` | R55.3 — the sub-path fully clears its host box, not merely offset from it. |
| T3124 | `tests/bpmn/emie-subpath-rows.test.ts` | R55.3 — an exception that REJOINS does not drag the shared tail onto its row; the rejoin target keeps the main line. |
| T3125 | `tests/bpmn/emie-subpath-rows.test.ts` | R55.3/R55.4 — the lane grows to hold the extra row and every step stays inside it. |
| T3126 | `tests/valueChain/prompt-branches.test.ts` | A merge line after a branch group resolves every branch under it — the catalogue's house style is not a defect. |
| T3127 | `tests/valueChain/prompt-branches.test.ts` | A branch may instead state its own fate, in any of the wordings the catalogue actually uses. |
| T3128 | `tests/valueChain/prompt-branches.test.ts` | Negative control — a destination naming no element ("continue to next task") IS reported. |
| T3129 | `tests/valueChain/prompt-branches.test.ts` | Each offending group is reported once, not once per branch. |
| T3130 | `tests/valueChain/prompt-branches.test.ts` | A nested branch's ending does not vouch for a parent that CARRIES ON after the nested group. |
| T3131 | `tests/bpmn/gateway-final-placement.test.ts` | R8.32 — a cross-lane fork is centred on where its branches FINALLY sit, not on rows the lane passes later changed. |
| T3132 | `tests/bpmn/gateway-final-placement.test.ts` | R8.32 — the same for a nested fork whose branches stay in one lane. |
| T3133 | `tests/bpmn/gateway-final-placement.test.ts` | findPairedMerge — a branch that ENDS does not stop the merge being paired and levelled with its decision. |
| T3134 | `tests/bpmn/gateway-final-placement.test.ts` | The top-level merge is level with its decision too. |
| T3135 | `tests/bpmn/gateway-final-placement.test.ts` | R6.31 — a branch arriving LEVEL enters the merge on the left vertex; one from above still takes the top. |
| T3136 | `tests/bpmn/gateway-final-placement.test.ts` | R6.31 — three or more arrivals keep the top/left/bottom round-robin Paul chose in R6.28. |
| T3137 | `tests/ai/technical-description-branches.test.ts` | An edge-mounted event is described with its host, type and whether it interrupts. |
| T3138 | `tests/ai/technical-description-branches.test.ts` | Its exception path's steps are listed and the path is explicitly closed. |
| T3139 | `tests/ai/technical-description-branches.test.ts` | The exception is nested under its host, not spliced into the main flow. |
| T3140 | `tests/ai/technical-description-branches.test.ts` | A COLLAPSED subprocess does not promise inner steps it has none of. |
| T3141 | `tests/bpmn/gateway-final-placement.test.ts` | R8.33 — the flow after a merge returns to the merge's FINAL line, so a post-merge step keeps the trunk. |
| T3142 | `tests/bpmn/emie-subpath-rows.test.ts` | An exception path takes a row of its own, clear of every other PATH (gateways centre between paths and are excluded). |
| T3143 | `tests/bpmn/emie-subpath-rows.test.ts` | No element of the exception path OVERLAPS another — the fault as actually seen, Task 16 drawn over Task 6. |
| T3144 | `tests/bpmn/emie-subpath-rows.test.ts` | It sits between its host's path and the next path down, so the stack order stays readable. |
| T3145 | `tests/valueChain/prompt-branches.test.ts` | A branch whose every nested path ENDS, with nothing after, is itself closed — it has no continuation to state. |
| T3146 | `tests/valueChain/prompt-branches.test.ts` | A lone surviving branch continues the main line and owes no merge — unless it claims a destination and names a lane. |
| T2941 | `tests/valueChain/prompt-templates.test.ts` | Control for T2939 narrowing — a Data Store DECLARATION is still caught, while the words inside a task label are allowed. |
| T3040 | `tests/bpmn/v2505-rules.test.ts` | B48 fires when a data artifact's wrapped name lands on the task underneath. |
| T3041 | `tests/bpmn/v2505-rules.test.ts` | B48 is silent once the artifact is lifted clear. |
| T3042 | `tests/bpmn/v2505-rules.test.ts` | B48 does not fire for a SHORT name — measuring the 80px column instead of the text would move artifacts that are visibly fine. |
| T3043 | `tests/bpmn/v2505-rules.test.ts` | B49 fires when both branches of a decision gateway use the same vertex. |
| T3044 | `tests/bpmn/v2505-rules.test.ts` | B49 is silent on top + bottom. |
| T3045 | `tests/bpmn/v2505-rules.test.ts` | B49 allows four or more branches to double up — with only three vertices it is unavoidable. |
| T3046 | `tests/bpmn/v2505-rules.test.ts` | B50 fires when a horizontal run passes 4px from a lane boundary. |
| T3047 | `tests/bpmn/v2505-rules.test.ts` | B50 is silent at a comfortable margin. |
| T3048 | `tests/bpmn/v2505-rules.test.ts` | B50 ignores a short stub — a stub is not a run along the boundary. |
| T3049 | `tests/bpmn/v2505-rules.test.ts` | B51 fires when a wrapped name hangs through a subprocess floor. |
| T3050 | `tests/bpmn/v2505-rules.test.ts` | B51 is silent when the box is sized around the label. |
| T3051 | `tests/bpmn/v2505-rules.test.ts` | B51 does not fire for an edge-mounted event, whose label sits outside the host deliberately (R7.05) — the false positive found by running the rule against Paul's own manual correction. |
| T3052 | `tests/bpmn/v2505-rules.test.ts` | B52 fires when two message labels land at the same height. |
| T3053 | `tests/bpmn/v2505-rules.test.ts` | B52 is silent once they are staggered by a full line. |
| T3054 | `tests/bpmn/v2505-rules.test.ts` | B53 fires on the pool that has been nudged sideways — the exact geometry Paul exported, two pools at x=50 and one at -1.43. |
| T3055 | `tests/bpmn/v2505-rules.test.ts` | B53 is silent when every pool starts at the same x. |
| T3057 | `tests/bpmn/v2505-rules.test.ts` | B54 fires when a gateway outgoing leaves by a vertex an incoming arrives on - the merge stapled to bottom by the loop-back rule. |
| T3058 | `tests/bpmn/v2505-rules.test.ts` | B54 is silent when the outgoing takes the free right vertex. |
| T3059 | `tests/bpmn/v2505-rules.test.ts` | B54 is not reported once a gateway carries more than four flows, where a diamond cannot go round. |

### Backfill - entries that existed in the tree but were never listed here (T2218-T2283, T2824-T2826)

> Recorded 2026-08-24. These tests were written across earlier sessions and have
> been green throughout; only their rows here were missing.
> `UPDATE_EVERYTHING.md` deliberately excludes this file from the release
> procedure, so no step ever checked it - which is how sixty-eight entries went
> absent unnoticed. A guard now fails if any `Tnnnn` in the tree has no row here
> (`tests/config/tests-summary-coverage.test.ts`).

| ID | File | What it pins |
|---|---|---|
| T2218 | `tests/bpmn/compensation-scan.test.ts` | A non-ad-hoc Expanded Sub-Process allows exactly one orphan entry and one exit. |
| T2219 | `tests/bpmn/compensation-connector.test.ts` | Drawing a compensation association marks `isForCompensation` on the target activity. |
| T2220 | `tests/simulation/compensation.test.ts` | A handler fires only when its host actually executed AND a throw is reached. |
| T2221 | `tests/bpmn/compensation-connector.test.ts` | Deleting the association un-marks the target; a compensation activity takes no sequence flow; the intermediate event defaults to Throwing. |
| T2222 | `tests/bpmn/compensation-connector.test.ts` | One compensation association per edge-mounted event (A4); inline intermediate-event sequence endpoints are cardinal (A3). |
| T2224 | `tests/diagram/merge-diagram.test.ts` | Non-overlapping concurrent edits merge silently; a same-id overlap is reported rather than clobbered. |
| T2225 | `tests/diagram/next-steps.test.ts` | A ranked next-step menu per source type, every candidate canConnect-legal. |
| T2226 | `tests/mining/analytics.test.ts` | Per-activity metrics rank the bottleneck first and split edges faithfully. |
| T2227 | `tests/mining/analytics.test.ts` | The per-case index carries cycle time + variant index; overall cycle stats are exact. |
| T2228 | `tests/mining/analytics.test.ts` | An empty or degenerate log yields safe zeros rather than throwing. |
| T2229 | `tests/mining/variantView.test.ts` | `variantPareto` shares sum to 1 with a rising cumulative. |
| T2230 | `tests/mining/variantView.test.ts` | `variantDiff` separates activities unique to each variant from the shared ones. |
| T2231 | `tests/mining/variantView.test.ts` | `variantPathIds` isolates one variant's elements, connectors and start/end. |
| T2232 | `tests/mining/replayRunners.test.ts` | `buildRunners` walks start to activities to end centres. |
| T2233 | `tests/mining/replayRunners.test.ts` | `pointAt` interpolates linearly along the polyline. |
| T2234 | `tests/mining/outcomes.test.ts` | Cases classify on-time vs late against the SLA. |
| T2235 | `tests/mining/outcomes.test.ts` | The slow variant and its unique activity drive lateness (lift > 1). |
| T2236 | `tests/mining/outcomes.test.ts` | No SLA gives null: nothing to classify, rather than a fabricated verdict. |
| T2237 | `tests/mining/edgeBadges.test.ts` | Numeric edge labels become `transitionCount` badges; other labels are untouched. |
| T2238 | `tests/bpmn/split-connector-event.test.ts` | A click (zero-move) on an element sitting on a flow line does NOT auto-fuse it. |
| T2239 | `tests/bpmn/split-connector-event.test.ts` | A real drag onto the line still splices - the guard blocks clicks only. |
| T2240 | `tests/mining/calibrate.test.ts` | Gateway branch probabilities still calibrate after edge counts are badged. |
| T2241 | `tests/mining/aiFrequencies.test.ts` | Gateway out-edges take the mined directly-follows counts as branch probabilities. |
| T2242 | `tests/mining/aiFrequencies.test.ts` | An early-exit branch to the end carries the mined end count. |
| T2243 | `tests/mining/enrich.test.ts` | `activityLaneMap` / `activityStateMap` read the model. |
| T2244 | `tests/mining/enrich.test.ts` | Resources fill from lanes, by exact and fuzzy match. |
| T2245 | `tests/mining/enrich.test.ts` | States fill from the State Machine's transitions. |
| T2246 | `tests/mining/enrich.test.ts` | `buildEventLog` falls back to `activityResource` when the log has no resource column. |
| T2247 | `tests/mining/stateMachineCoverage.test.ts` | Reconciliation adds back every state, transition, entry and terminal a curated plan dropped. |
| T2248 | `tests/mining/stateMachineCoverage.test.ts` | After reconciliation the log conforms 100% to its own generated reference. |
| T2249 | `tests/mining/stateMachineCoverage.test.ts` | It is a no-op on an already-complete deterministic discovery. |
| T2250 | `tests/mining/transitionConformance.test.ts` | Matching is whitespace-insensitive: a reference label wrapped across lines still conforms. |
| T2251 | `tests/video/ffmpegArgs.test.ts` | VFR timestamps are preserved and audio async-resampled, so A/V stays in sync. |
| T2252 | `tests/microsoft/tokenCrypto.test.ts` | A token round-trips unchanged, with a fresh IV each time. |
| T2253 | `tests/microsoft/tokenCrypto.test.ts` | Tampered ciphertext fails to decrypt (GCM auth tag). |
| T2254 | `tests/microsoft/oauth.test.ts` | `pkcePair` produces a verifier whose S256 challenge matches. |
| T2255 | `tests/microsoft/oauth.test.ts` | The authorize URL targets the multi-tenant authority with PKCE + `select_account`. |
| T2256 | `tests/microsoft/oauth.test.ts` | `decodeIdToken` pulls tid, UPN and name from the payload. |
| T2257 | `tests/microsoft/oauth.test.ts` | `sanitizeReturnTo` keeps same-origin targets and rejects cross-origin ones. |
| T2258 | `tests/schema/version-split.test.ts` | The two version constants have their expected shapes. |
| T2259 | `tests/schema/version-split.test.ts` | `structuralSchemaVersion` reads both the new integer and legacy `1.NN` forms. |
| T2260 | `tests/schema/version-split.test.ts` | Compatibility accepts equal/older, blocks newer, and tolerates legacy tags. |
| T2261 | `tests/diagram/review-collapse.test.ts` | Collapse shrinks to the 38x32 icon and stashes the expanded geometry; idempotent. |
| T2262 | `tests/diagram/review-collapse.test.ts` | `collapseAllReviewComments` touches review-comment elements only. |
| T2263 | `tests/diagram/review-collapse.test.ts` | `buildReviewComment` makes a review-comment plus a link tether to its target. |
| T2264 | `tests/features/feature-availability.test.ts` | Registry keys are unique and every feature has a label and category. |
| T2265 | `tests/features/feature-availability.test.ts` | The seed covers every registry key x 5 levels (incl. enterprise) with valid states. |
| T2266 | `tests/features/feature-availability.test.ts` | The xlsx 1/80 mapping landed: sharepoint Expert+, soc2 Enterprise-only, typed-prompt all. |
| T2267 | `tests/mining/task-mining-spike.test.ts` | The task-log schema projects onto the miner's {headers, rows, mapping}. |
| T2268 | `tests/mining/task-mining-spike.test.ts` | `buildEventLog` compresses the task log into cases + variants. |
| T2269 | `tests/mining/task-mining-spike.test.ts` | `discoverProcess` renders a routine map with a branch and a rework back-edge. |
| T2270 | `tests/mining/task-mining-spike.test.ts` | `computePerformance` mines step durations, calibration-ready. |
| T2271 | `tests/mining/task-mining-spike.test.ts` | Task-specific insights: ping-pong, rework, automation signal. |
| T2272 | `tests/mining/task-mining-spike.test.ts` | `automationOpportunities` ranks the dominant routine first, from variants alone. |
| T2273 | `tests/mining/task-mining-spike.test.ts` | `buildAutomationSpec` emits a Markdown RPA recipe of the steps. |
| T2274 | `tests/mining/task-mining-spike.test.ts` | The flagship task example package is valid and adoptable (sample log + variants). |
| T2275 | `tests/mining/task-mining-spike.test.ts` | `isTaskRun` detects a task log by its UI-step vocabulary, and rejects a process log. |
| T2276 | `tests/mining/task-mining-spike.test.ts` | `pingPongFromVariants` matches the interaction-based ping-pong count. |
| T2277 | `tests/mining/task-mining-spike.test.ts` | `automationRoi` estimates savings from the automatable routines. |
| T2278 | `tests/mining/task-mining-spike.test.ts` | `buildTaskProcedure` emits an as-actually-done SOP with steps, apps and rework. |
| T2279 | `tests/mining/task-mining-spike.test.ts` | The deterministic Explain is task-framed when `isTask` (automation callout). |
| T2280 | `tests/mining/task-mining-spike.test.ts` | `collapseNavForDiscovery` drops app-switch steps, keeping a clean rework loop. |
| T2281 | `tests/mining/live-demo.test.ts` | Six poll batches, each with events, keyed to the mapping fields. |
| T2282 | `tests/mining/live-demo.test.ts` | The run grows cumulatively as batches are ingested (few activities to many). |
| T2283 | `tests/mining/live-demo.test.ts` | The example package is valid and adopts as a LIVE demo - batches, not a pre-built run. |
| T2824 | `tests/ai/aiClient.test.ts` | A DeepSeek model uses `DEEPSEEK_API_KEY` + the Anthropic-compatible endpoint by default. |
| T2825 | `tests/ai/aiClient.test.ts` | `DEEPSEEK_BASE_URL` overrides the endpoint. |
| T2826 | `tests/ai/aiClient.test.ts` | Without `DEEPSEEK_API_KEY` the id isn't registered, so it doesn't route to DeepSeek. |


### Backfill 2 - older ids outside the T2xxx range (T0618-T1077)

> Recorded 2026-08-24, immediately after the first backfill. The first pass
> searched only `T2xxx` and so missed these thirty-nine entirely; the coverage
> guard found them on its first run. That is the argument for the guard rather
> than a careful one-off audit: the audit was mine, and it was wrong.

| ID | File | What it pins |
|---|---|---|
| T0618 | `tests/mining/validate-log.test.ts` | Excel serial dates are recognised and usable, not silently dropped. |
| T0651 | `tests/diagram/animate-order.test.ts` | Reveal order is pools then lanes then flow; a connector appears only once both endpoints exist; complete and unique. |
| T0652 | `tests/diagram/animate-order.test.ts` | BFS reveals both branches before descending; DFS descends one branch first. |
| T0901 | `tests/documents/collection-scope.test.ts` | Importing a Technical Design Notes backup under the User Guide is rejected. |
| T0902 | `tests/help/guide-backup-roundtrip.test.ts` | The Technical Design Notes collection round-trips independently of the guide. |
| T0903 | `tests/help/image-usage.test.ts` | `computeImageUsages` maps ids across both collections (image field and inline). |
| T0904 | `tests/help/image-usage.test.ts` | `repointReferences` re-points target to source in the selected collections only, keeping the target. |
| T0905 | `tests/entity-lists/entity-structures.test.ts` | A Document node round-trips its SharePoint link across set / patch / clear. |
| T0906 | `tests/entity-lists/entity-structures.test.ts` | A structure bundles the five lists and cascades on delete. |
| T0907 | `tests/entity-lists/adopt-sync.test.ts` | Adopt clones all five lists with provenance, SharePoint links and tree intact. |
| T0908 | `tests/entity-lists/adopt-sync.test.ts` | Sync applies master adds/renames/removes yet keeps the project's own additions. |
| T0909 | `tests/entity-lists/entity-drift.test.ts` | Drift flags only names absent from the mapped list. |
| T0910 | `tests/schema/diagram-schema.test.ts` | A valid diagram is accepted, and unknown / forward-compatible keys are ignored. |
| T0911 | `tests/schema/diagram-schema.test.ts` | Wrong field types and missing required fields are rejected. |
| T0912 | `tests/schema/diagram-schema.test.ts` | Referential problems are caught: dangling ref, duplicate ids, parent cycle, orphan. |
| T0913 | `tests/schema/diagram-schema.test.ts` | The envelope validates and embeds the body schema. |
| T0914 | `tests/editor/edits.test.ts` | Two adjacent sub-lanes (nested divisions) can be swapped. |
| T0915 | `tests/editor/edits.test.ts` | A gateway's top/bottom branches flip when the lanes they point into are swapped. |
| T0916 | `tests/entity-lists/collapse.test.ts` | `idsWithChildren` flags exactly the parents. |
| T0917 | `tests/entity-lists/collapse.test.ts` | `visibleSuggestions` hides descendants of a collapsed node. |
| T0918 | `tests/theme/feature-colors.test.ts` | `shade` darkens a hex by a percentage, clamped. |
| T0919 | `tests/theme/feature-colors.test.ts` | `resolveFeatureScheme` fills defaults, merges valid overrides and ignores junk. |
| T0920 | `tests/theme/feature-colors.test.ts` | `tonesFor` + `featureVars` expose bg / text / highlight. |
| T0921 | `tests/enterprise/org-policy.test.ts` | A fresh org allows every capability by default. |
| T0922 | `tests/enterprise/org-policy.test.ts` | Disabling a flag is reflected; an unknown org defaults to all-allowed. |
| T0923 | `tests/enterprise/audit-log.test.ts` | A privileged action is recorded with actor, target and stringified meta. |
| T0924 | `tests/enterprise/audit-log.test.ts` | Meta defaults to {} and the call never throws - audit must not break the action. |
| T0925 | `tests/enterprise/erase-user.test.ts` | Erasing a sole-member user removes their now-empty org. |
| T0926 | `tests/enterprise/erase-user.test.ts` | An org that still has another member is kept. |
| T0927 | `tests/enterprise/erase-user.test.ts` | The user's project cascades, then the emptied org is removed. |
| T0928 | `tests/enterprise/sso-registration.test.ts` | `requireSso` blocks password login even with the correct password. |
| T0929 | `tests/enterprise/sso-registration.test.ts` | A normal org still allows password login. |
| T0930 | `tests/enterprise/sso-registration.test.ts` | `REGISTRATION_ALLOWED_DOMAINS` gates self-registration. |
| T0931 | `tests/ai/custom-models.test.ts` | `AI_CUSTOM_MODELS` parses `id|Label` and bare id, trims, and ignores blanks. |
| T0932 | `tests/ai/custom-models.test.ts` | Unset means no custom models and plain Claude behaviour. |
| T0933 | `tests/ai/custom-models.test.ts` | A configured local model becomes known, labelled and resolvable. |
| T0961 | `tests/ai/aiClient.test.ts` | A Moonshot client authenticates with Bearer (authToken), not `x-api-key`. |
| T1061 | `tests/routing/boundary-event-side.test.ts` | A corner event whose target is BELOW exits the bottom, not the right. |
| T1077 | `tests/archimate/catalogue-v32.test.ts` | Every dual-form type maps to a `-box` key whose `-icon` sibling exists, so image ingestion can pick either form. |

> **Keep this section in sync.** Whenever an e2e spec is added, removed, or changes what it asserts, update this section. It is hand-maintained, not generated.

---

*Generated 2026-06-28, updated 2026-08-04. Regenerate this document whenever test files (Vitest OR the Playwright e2e specs) are added or their behaviour changes — it is a hand-maintained companion to the suite, not auto-generated.*
