# Diagramatix — Tests Summary

**As at:** 2026-06-29  ·  **Document version:** 1.1  ·  **Suite:** 66 test files · 436 tests (all green)  ·  **Runner:** Vitest  ·  **CI:** enforced on every PR + push to `main`

---

## 1. Executive summary

### What this is
Diagramatix has an automated **regression safety net** — a suite of 436 tests across 66 files that runs the app's real code and fails loudly (“goes red”) the moment a change breaks documented behaviour. It is the early-warning system that lets the product change quickly without silently breaking sharing rules, data integrity, diagram layout, exports, the simulator, or AI generation.

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

**Maintaining the `Tnnnn` numbers — append-only from the highest.** When ANY test is added — including one slotted into an existing file's table — give it the **next number after the current highest ref**, and **never renumber or reuse** an existing one. So the next test added anywhere becomes **T0377**, the one after **T0378**, and so on. A consequence: after the first pass the numbers are **no longer in strict document order** (a new row in an early section may carry a high number) — that is deliberate, because a given `Tnnnn` must always point at the same check forever.

> **Highest ref allocated: `T0376`.** Update this line whenever you add tests (e.g. to `T0379` after adding three), so the next continuation point is always obvious.

A few rows cover a *parameterised family* of tests (e.g. "one per scenario"), so the highest `Tnnnn` is lower than the headline test count (436).

A test going red is not a problem with the test; it's the net catching a change. If the change was intentional, the test is updated to match; if not, the net just prevented a regression from shipping.

### The layers at a glance

| Layer | What it guards | Files |
|---|---|---|
| 1. Access control & sharing | Who can see/edit which projects and diagrams | 1 |
| 2. App-flow data integrity | Delete/publish/bundle/billing/backup data effects | 10 |
| 3. Export & interchange | JSON / XML / DDL / Visio / translation round-trips | 11 |
| 4. Diagram structure & layout | BPMN/flowchart layout rules, type coverage, ArchiMate notation | 10 |
| 5. Connector routing & editor | Orthogonal routing, manual-edit re-routing, archi re-attach | 6 |
| 6. AI generation pipeline | Rule-filtering, plan validation, normalisation | 5 |
| 7. Process Simulator | Engine correctness, determinism, hierarchy, BPSim interop | 17 |
| 8. Help content & dictation | Guide rendering/images, transcript parsing | 5 |
| 9. Test infrastructure | The harness itself | 1 |

### Known open item
One area is deliberately **ratcheted, not closed**: the editor's obstacle-avoidance re-routing (`tests/editor/obstacle-sweep.test.ts`) holds a baseline of 10 known connector-through-obstacle crossings. These are diagnosed (6 are gateways, deliberately not treated as obstacles; 4 are a vertical-channel case needing a deeper router detour). The test guarantees this number can only fall.

---

## Layer 1 — Access control & sharing

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

### `tests/staffNarrativeBriefing.test.ts` — Staff-narrative briefing assembly (no doubling)

| Ref | Test | Protects you against | How it would break (go red) |
|------|------|----------------------|------------------------------|
| T0248 | uses the built-in default when there are no additional rules | Empty/blank/whitespace additions leaving the AI with no briefing | If empty, null, or whitespace input didn't return the built-in default |
| T0249 | appends additional rules to the built-in default | User house-style rules not being added on top of the default | If additions weren't appended after the default under an "Additional Rules" heading |
| T0250 | treats a legacy full-briefing row as the whole briefing (no doubling) | A legacy briefing being concatenated with a second copy of the default | If a legacy full-briefing row were appended rather than used as-is |
| T0251 | extractAdditionalRules hides legacy full briefings but keeps real additions | Legacy briefings shown as editable additions, or real additions hidden | If extraction stopped distinguishing legacy briefings from real additions |

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

*Generated 2026-06-28, updated 2026-06-29. Regenerate this document whenever test files are added or their behaviour changes — it is a hand-maintained companion to the suite, not auto-generated.*
