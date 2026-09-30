-- Release 2.13 content — User Guide, Features catalog and Technical Notes (Steps 10-12 of "update everything").
--
-- Paul, 2026-09-30: "Continue with 10a, 10b, 11, and 12". The wording is the draft in
-- `new features/release-2.13-documentation-wording.md`; this file publishes it.
--
--   10a  the version line in the User Guide's Getting Started chapter  → 2.13.<build>
--   10b  User Guide: "Mobile Access", "Your Plan, Limits & Notices", a Voice Assist section for the
--        new connector commands, and a SuperAdmin chapter on plans / Feature Availability / customising a user
--   11   Features catalog: three entries, published to /features
--   12   Technical Notes: "Feature availability, limits and per-user overrides (2.13)"
--
-- ⚠ BEFORE RUNNING: check the BUILD NUMBER in the first CTE below against the live header badge
--   (v2.13.<build>) or /api/schema, and edit it if the deploy came out different. It is the only number
--   to change. Everything else is safe as written.
--
-- NON-DESTRUCTIVE. Sections are added only where a section with that heading does not already exist in
-- that chapter, so anything you have edited in the app since is never overwritten and a second run
-- changes nothing. (To replace a section's wording later, edit it in the app.) The version line is a
-- targeted replacement of "This guide covers version **X.Y.Z**". Nothing else is touched.
--
-- Run it in the SuperAdmin ▸ Database tile. IDEMPOTENT. Proven on diagramatix_test before prod.

BEGIN;

-- ═══ 10a. The version number in the User Guide ═══════════════════════════════════════════════════
--   >>> the build number to stamp <<<
UPDATE "HelpSection"
   SET "bodyMarkdown" = regexp_replace("bodyMarkdown", 'This guide covers version \*\*[0-9]+\.[0-9]+\.[0-9]+\*\*', 'This guide covers version **2.13.2821**'),
       "updatedAt" = NOW()
 WHERE collection = 'user-guide'
   AND "bodyMarkdown" ~ 'This guide covers version \*\*[0-9]+\.[0-9]+\.[0-9]+\*\*'
   AND "bodyMarkdown" NOT LIKE '%This guide covers version **2.13.2821**%';

-- ═══ 10b. User Guide chapters (created only if missing) ══════════════════════════════════════════
INSERT INTO "HelpChapter" (id, slug, collection, title, category, "sortOrder", "adminOnly", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.slug, 'user-guide', v.title, v.category,
       (SELECT coalesce(max("sortOrder"), 0) + v.n FROM "HelpChapter" WHERE collection = 'user-guide'), v.admin, NOW(), NOW()
  FROM (VALUES
    ('mobile-access',            'Mobile Access — Diagramatix on your phone',                 'Creating & Editing',  1, false),
    ('plans-limits-notices',     'Your Plan, Limits & Notices',                               'Getting Started',     2, false),
    ('plans-features-customise', 'Plans, Feature Availability & Customising a User',          'Sharing & Governance', 3, true)
  ) AS v(slug, title, category, n, admin)
 WHERE NOT EXISTS (SELECT 1 FROM "HelpChapter" c WHERE c.collection = 'user-guide' AND c.slug = v.slug);

INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, c.collection, s.heading, s.body, c."adminOnly", s.ord, NOW(), NOW()
  FROM (VALUES

  -- ── Mobile Access ──
  ('mobile-access', 0, 'What Mobile Access is', $B$Diagramatix has a phone app at the same address — open it on your phone and it takes you there automatically. **Mobile Access is included on every paid plan** (Introductory and above).

It needs two other features to be on for your plan: **Process Review** and **Voice Assist**. If your plan does not include them you will see a page saying why, with a link to the plans and a button to use the desktop version instead.

On the phone you can:

- **View and review** any BPMN diagram, and leave review comments.
- **Create a diagram by speaking**, or by photographing a whiteboard or sketch.
- **Edit by voice** — add, rename, connect and delete by saying it (or typing it).$B$),

  ('mobile-access', 1, 'Creating a diagram by voice or photo', $B$Say what the process is, or take the photo; Diagramatix draws it. You can correct it in words and generate again.

A **Free Form** option keeps the layout of your photo instead of laying the diagram out afresh. If you generated from a photo, the photo is kept so you can view it and generate from it again.$B$),

  ('mobile-access', 2, 'Editing by voice on the phone', $B$Open a diagram and tap the **🎤** button. Say commands such as:

- "add a task called Check invoice after Receive order"
- "rename Check invoice to Verify invoice"
- "delete Pay supplier"
- "connect Receive order to Check invoice"
- "undo that"

You can type a command in the box instead. The sheet at the bottom shows what it heard and what it did, and asks you a question when it needs to. The full list of commands is the same as the desktop's Voice Assist (see *AI Assist & Voice Assist*).$B$),

  ('mobile-access', 3, 'Selecting things', $B$- **Tap an element** to select it. Tapping anywhere inside a task, event or gateway selects it; a boundary event always wins over the task it sits on.
- **Tap a connector's line**, between its two ends, to select it — it is highlighted in blue. Then say "delete this" or "reverse this".
- Tap a pool or lane's empty space to select the pool or lane.
- Turn on **Select several** and tap two elements in order: the first you tapped is **1**, the second is **2**. Then say **"connect these"** and the first flows into the second.

Tap empty space to clear the selection.$B$),

  ('mobile-access', 4, 'Numbers, Yes/No and Auto-connect', $B$When Diagramatix asks you to choose ("which task?", "rename tasks", "delete connectors") it puts **green numbers** on the diagram and shows the same numbers as **buttons** under it. Tap a number, or say it. For a delete you can give several at once — "three, seven, eight and nine" — or say "all" (which asks you to confirm).

A question that needs a yes or no shows **Yes** and **No** buttons.

**Auto-connect** (a checkbox under the diagram): when it is on, "add a task" joins the new task to the one you added last, or to the one you have selected. Your choice is remembered on the phone.$B$),

  ('mobile-access', 5, 'Staying connected', $B$The screen stays awake while the microphone is listening. If your connection drops, listening **reconnects by itself** and nothing you said in the gap is lost. If another app takes the microphone (a phone call), listening stops and tells you why — tap the mic to start again.

Your changes save automatically; the top of the screen says **Saved**.$B$),

  -- ── Your plan, limits and notices ──
  ('plans-limits-notices', 0, 'Your plan and its limits', $B$Click **Subscription** at the top of the dashboard to see your plan, how much you have used, and when a monthly allowance resets.

Every plan has limits — projects, diagram size, AI generations, exports and imports. The **Pricing** page lists each plan's limits and, in the table below them, every feature and which plans include it; it is always what you would actually get.$B$),

  ('plans-limits-notices', 1, 'When you reach a limit', $B$Diagramatix tells you what happened and what to do — it does not quietly do nothing.

- A message shows **how much you have used on your plan** and, for a monthly allowance, **the date it resets**.
- A *lifetime* allowance says it does not reset.
- A diagram that is over your plan's size limit says how many elements are allowed and how many it has.
- There is always a **See plans** button.$B$),

  ('plans-limits-notices', 2, 'A feature that is not in your plan', $B$The message says which plan includes the feature. If a feature needs another feature you do not have — for example Mobile Access needs Voice Assist — it names the one that is missing.$B$),

  ('plans-limits-notices', 3, 'Warnings before something stops', $B$A strip at the top of the dashboard warns you about:

- a **payment that did not go through** (with an **Update payment** button);
- a **subscription that is about to end**, and what happens then;
- a **trial that is ending** or has ended;
- a **complimentary upgrade** that is about to finish;
- any allowance you have used **80%** of, or all of.

**Dismiss** hides a warning for the day.$B$),

  ('plans-limits-notices', 4, 'Allowances set for you', $B$If support has changed some of your allowances, the usage panel says so: *"Some allowances on your account were set by support and differ from the standard plan."*$B$),

  ('plans-limits-notices', 5, 'Your trial', $B$The trial length is part of your plan. While it runs everything works. When it ends, creating, generating, exporting and importing pause until you upgrade — you can still open and edit what you have.$B$),

  -- ── SuperAdmin: plans, Feature Availability, customising a user ──
  ('plans-features-customise', 0, 'Feature Availability', $B$**SuperAdmin ▸ Feature Availability.** One row per feature, one column per plan. Each cell is **Available**, **Disabled** (shown, not usable) or **Not Available** (hidden, and refused by the server). A plan with no row for a feature counts as Available, so a new feature is never locked out by accident.

- **Enforcement badge.** Each row says whether anything reads it: *enforced*, *partly*, *not enforced yet* or *info only*. The **ⓘ** button lists the screens and routes that enforce it, what else limits it (for example the AI attempts limit), and what it needs. Every feature is now enforced or informational; a new one cannot be added without a gate.
- **Needs.** A feature that needs others (Mobile Access needs Process Review and Voice Assist; the Simulator and Process Mining sub-features need their module) is only as available as the weakest of them. A cell that says Available but is held back shows **in effect: Not Available**.
- **Not fully enforced only** filters the list.

The public **Pricing** and **Features** pages read these cells and each plan's limits live; nothing on them needs editing by hand.$B$),

  ('plans-features-customise', 1, 'What a person gets — and Preview a plan', $B$**Order of precedence:** a SuperAdmin gets everything (unless acting as a level) → an active comp grant → the higher of the person's own plan and their organisation's plan → that plan's cell → the person's own override → then what the feature needs.

**Preview a plan** (on the Feature Availability page) lists exactly what a plan gets, including unsaved edits, with prerequisites applied.$B$),

  ('plans-features-customise', 2, 'Act as a level', $B$**Double-click the Diagramatix logo** to cycle the view: SuperAdmin → OrgAdmin → Enterprise → Expert → Professional → Introductory → Free.

In a plan view the **server** treats you as a customer on that plan: features are hidden or refused, limits bite, usage is really counted, and an amber **"Acting as …"** pill shows. The SuperAdmin bypass is off while you are acting, and your own overrides are ignored, so Free looks like Free.$B$),

  ('plans-features-customise', 3, 'Test tools', $B$**Registered Users ▸ a user's usage panel** (when they are not bypassing limits) has a **Test tools** section:

- **Set counter** — set a counter (AI attempts, exports, imports, bulk) to an exact number;
- **Reset all counters**;
- **Trial days left** — moves the trial's start date, which is also the anchor of the monthly allowance periods.

Together with *Act as a level* these let you reach any limit in seconds and see exactly what the customer sees.$B$),

  ('plans-features-customise', 4, 'Customising one person', $B$**Registered Users ▸ Customise.** Change one person's **limits**, **settings** (the "reset monthly" switches, trial days) and **feature availability** *without changing their plan* — nobody else on that plan is affected.

- Every row shows the **plan's** value, **this person's** override and what is **in effect**, with a **Revert** for the row. **Revert all to the plan** clears everything (limits, features, note, expiry — including any Text to Speech grant).
- A **note** is required: it is the record of why. An optional **expiry** date reverts the overrides by itself.
- An override that **raises** access stays until the person's plan gives at least that much (an upgrade covers it) — then it shows *(the plan now covers this)* and the plan's value is used. An override that **lowers** access always stays.
- A person with any override shows a **custom** badge in the list; every change is recorded in the audit log.$B$),

  ('plans-features-customise', 5, 'Customising is not the same as Grant comp', $B$**Grant comp / Revoke comp** (the free upgrade) is unchanged and separate: a comp puts someone on another *whole plan* for a while; a customisation changes *individual values* on whatever plan applies. They combine — overrides are kept on top of a comp — and **Revoke comp** and **Revert to the plan** each do only their own job.$B$)

  ) AS s(chapter_slug, ord, heading, body)
  JOIN "HelpChapter" c ON c.collection = 'user-guide' AND c.slug = s.chapter_slug
 WHERE NOT EXISTS (SELECT 1 FROM "HelpSection" x WHERE x."chapterId" = c.id AND x.heading = s.heading);

-- ═══ 10b. Voice Assist: the new connector commands (appended to the existing chapter, once) ═════════
INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, c.collection, 'Connectors, messages and deleting by number', $B$**Connectors and messages**

- **"delete this"** — with a connector selected (click it, or tap it on the phone), removes that connector. It works for any kind: a sequence flow, a message, an association. "Delete the selected message" works even if something else is selected too.
- **"reverse this"** — flips the direction of the selected connector. If the rules do not allow the reversed direction (for example a flow into a start event) it says so and changes nothing.
- **"connect these"** — with exactly **two** elements selected, joins the **first** one you selected to the **second**. Select them in the order you want them joined. If that order is not allowed it says so.
- **"delete connectors"** / **"delete messages"** — with a connector selected: that one. With elements selected: the connectors (or messages) attached to them. With nothing selected: numbers every one on the diagram and asks which — say the numbers, or "all" (which asks you to confirm).

**Deleting several things by number.** With nothing selected, "delete tasks", "delete events", "delete gateways", "delete lanes" or "delete pools" number them all and ask which. Answer with numbers — "three, seven, eight and nine", "one through four", "twenty two" — a name, or "all". One undo takes the whole batch back.$B$,
       false, 900, NOW(), NOW()
  FROM "HelpChapter" c
 WHERE c.collection = 'user-guide' AND c.slug = 'ai-assist'
   AND NOT EXISTS (SELECT 1 FROM "HelpSection" x WHERE x."chapterId" = c.id AND x.heading = 'Connectors, messages and deleting by number');

-- ═══ 11. Features catalog — three entries, published to /features ════════════════════════════════
WITH feat(name, summary, details, ord) AS (VALUES
  ('Mobile Access', 'Your diagrams on your phone: view, review, and edit by voice.', $F$- Open any BPMN diagram on your phone and review it, leaving comments
- Create a diagram by speaking, or by photographing a whiteboard
- Edit by voice: add, rename, connect and delete by saying it
- Tap to select; numbered choices you can tap or say
- Screen stays awake while listening; reconnects if the signal drops
- Included on every paid plan$F$, 900),
  ('Plans That Show Their Working', 'Every limit and every feature is spelled out for each plan, and stays true.', $F$- Each plan's limits — projects, diagram size, AI generations, exports and imports — read straight from the plan
- An "every feature, by plan" comparison built from what each plan actually includes
- Clear messages when you reach a limit: how much, when it resets, and how to raise it
- Warnings before a trial, subscription or allowance runs out$F$, 901),
  ('Voice Assist — Connectors', 'Delete, reverse and join connectors by voice.', $F$- "Delete this", "reverse this" and "connect these" on the selection
- Delete several connectors, messages or elements by number in one go
- One undo takes the whole batch back$F$, 902)
), inserted AS (
  INSERT INTO "Feature" (id, name, summary, details, hidden, "sortOrder", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, v.name, v.summary, v.details, false, v.ord, NOW(), NOW()
    FROM feat v
   WHERE NOT EXISTS (SELECT 1 FROM "Feature" f WHERE f.name = v.name)
  RETURNING name
)
SELECT count(*) AS features_added FROM inserted;

-- Publish exactly as "Publish All" does — only rows that have never been published, so a later edit is not overwritten.
UPDATE "Feature"
   SET "publishedName"      = name,
       "publishedSummary"   = summary,
       "publishedDetails"   = details,
       "publishedHidden"    = hidden,
       "publishedSortOrder" = "sortOrder",
       "publishedAt"        = NOW(),
       "updatedAt"          = NOW()
 WHERE name IN ('Mobile Access', 'Plans That Show Their Working', 'Voice Assist — Connectors')
   AND "publishedAt" IS NULL;

-- ═══ 12. Technical Notes ═════════════════════════════════════════════════════════════════════════
INSERT INTO "HelpChapter" (id, slug, collection, title, category, "sortOrder", "adminOnly", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'feature-availability-limits', 'tech-design', 'Feature availability, limits and per-user overrides (2.13)', NULL,
       (SELECT coalesce(max("sortOrder"), 0) + 1 FROM "HelpChapter" WHERE collection = 'tech-design'), false, NOW(), NOW()
 WHERE NOT EXISTS (SELECT 1 FROM "HelpChapter" WHERE collection = 'tech-design' AND slug = 'feature-availability-limits');

INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, 'tech-design', s.heading, s.body, false, s.ord, NOW(), NOW()
  FROM (VALUES

  (0, 'One source of truth for "what does this person get"', $T$- `features/effectiveLevel.ts` resolves a user's effective plan once: an active comp grant, else the higher (by `sortOrder`) of the user's own plan — after the cancelled-subscription grace downgrade to Free — and any plan assigned to an organisation they belong to. It is a **leaf module** (imports only the database), used by the feature matrix, the numeric limits (`checkLimit`, `getUsageSnapshot`), the editor's element cap and the speech gate.
- `features/availability.ts` `getFeatureStates(userId)` = the plan's matrix row per feature (a missing row **fails open** to Available; an unreadable state is Not Available) → the person's own overrides (`userOverrides.ts`) → **dependencies** (`dependencies.ts`, `FeatureDef.requires`): a feature is only as available as the weakest prerequisite (available > disabled > hidden). A SuperAdmin gets everything unless acting as a level.
- **Gate map.** `features/gateMap.ts` lists, per feature, the screens and routes that enforce it. `tests/features/gate-map.test.ts` checks it against the source: every feature has an entry, every listed gate still exists, a feature marked not-enforced is read by no gate, and **no gate names a key that is not in the registry** (a typo would lock a feature out for everyone but a SuperAdmin). The not-enforced list is empty and is a ratchet.$T$),

  (1, 'Act as a level', $T$The `dgx_sa_mode` cookie (set by the logo double-click) names a plan. `features/actAs.ts` `currentActAsLevel()` reads it inside a request and is only honoured for a user whose email is in `SUPERUSER_EMAILS` — the cookie is client-writable, so it can never affect anyone else. While acting, `getFeatureStates`, `loadUserWithTier` / `checkLimit` / `recordUsage` / `getUsageSnapshot`, `elementCountLimitFor` and `speechGranted` evaluate as that plan with the SuperAdmin bypass **off**, and the person's own overrides are ignored. Usage is really counted, so a limit can be reached and tested. `POST /api/admin/users/[id]/usage` sets a counter, resets counters or moves the trial clock.$T$),

  (2, 'Per-user overrides', $T$`features/userOverrides.ts`; columns `User.limitOverrides` / `featureOverrides` / `overrideNote` / `overridesExpireAt`.

- **Storage.** `limitOverrides { <SubscriptionLevel field>: { v, base } }` (`v` the override, `null` = unlimited; `base` = what the plan gave when it was set); `featureOverrides { key: { s, base } | "available"|"disabled"|"hidden" }` (the bare string is the older form and always applies). `limitOverrides` is `Json` with a `{}` default and is written through raw `pgPool` SQL (Prisma 7 omits JSON from update inputs).
- **The rule.** A **grant** (`v > base`) applies only while the current plan gives less — once the plan gives at least as much it is *covered* and the plan's value is used. A **restriction** (`v ≤ base`) always applies. Switches (`…ResetMonthly`) always apply. Everything stops at `overridesExpireAt` (lazy revert, like a comp). Unlimited compares as the largest value.
- **Where it applies.** Where the effective plan row is built (`loadUserWithTier`), so every limit consumer sees it with no other change; overrides sit on top of whichever plan applies (own, organisation or comp). Feature overrides are applied in `getFeatureStates` before prerequisites.
- **API.** `GET/PUT/DELETE /api/admin/users/[id]/overrides` — SuperAdmin only, `blockReadOnlyImpersonation`, audited (`user.overrides.update` / `.revert`). A note is required when anything is customised; `inherit` reverts one key; `DELETE` reverts everything. The Text to Speech tile and `speechGranted` understand both forms of a feature entry.$T$),

  (3, 'Notices and warnings', $T$`subscription/messages.ts` builds every limit / feature / trial / policy message (how much, which plan, when a monthly allowance resets, the plan that has the feature, the prerequisite missing). `gateFeature` / `gateLimit` keep the old 403 fields (`error`, `metric`, `current`, `limit`, `feature`) and add `message` and a structured `notice`. Browser side: `showGateNotice(res)` and `downloadWithNotice(url, name)` (`subscription/gateNotice.ts`) raise a `GateNoticeHost` dialog instead of a silent return or a page of JSON. `subscription/warnings.ts` (pure) decides the dashboard strip's warnings from the usage snapshot's metrics, trial, comp and billing state.$T$),

  (4, 'Public pages', $T$`features/publicMatrix.ts` builds "every feature, by plan" from the matrix (prerequisites applied; features off on every plan and informational entries omitted — an audit certificate must not read as a plan tick). `subscription/publicCopy.ts` generates each plan's limit lines from its `SubscriptionLevel` row (`null` = unlimited). The trial length comes from the Free plan's `trialDays`; `GET /api/plans` serves names, prices and the trial to the sign-up form. It is not under `app/api/public/**`, which is reserved for the partner API and guarded by a test.$T$),

  (5, 'Enforcement changes worth knowing', $T$- Wiring the 22 previously-unread features did **not** take access away: the seed and `patch-wire-features-keep-todays-access.sql` set them Available at every level; the spreadsheet's intent is preserved in `menus_and_features/feature-availability.xlsx-intent.json` and applied only by `apply-xlsx-restrictions.sql`.
- **Simulator and Process Mining:** the module keys stay; ten sub-features each `require` their module. Every simulation route that changes or computes something is gated (`tests/simulation/route-gating.test.ts`, the counterpart of the mining test); the three simulation AI narrations count against the AI attempts limit and fall back to the deterministic summary at it.
- **Limits:** `isOverLimit` — element counts are over only when they *exceed* the limit (the editor always allowed exactly N; the server used to reject it); every other metric blocks *at* the limit. Every project-creating path counts against the project cap. `POST /api/me/subscription` no longer restamps the trial clock.
- **Not counted, by decision:** Voice Assist AI is not counted against the AI attempts limit.
- **Mobile Access** is the `mobile` feature, `requires: ["process-review", "voice-assist"]`; the `/m` layout resolves it server-side and shows `MobileUnavailable` when it is not in the plan.$T$)

  ) AS s(ord, heading, body)
  JOIN "HelpChapter" c ON c.collection = 'tech-design' AND c.slug = 'feature-availability-limits'
 WHERE NOT EXISTS (SELECT 1 FROM "HelpSection" x WHERE x."chapterId" = c.id AND x.heading = s.heading);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpChapter" WHERE collection = 'user-guide' AND slug IN ('mobile-access', 'plans-limits-notices', 'plans-features-customise')) AS guide_chapters_3,
  (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId" WHERE c.collection = 'user-guide' AND c.slug IN ('mobile-access', 'plans-limits-notices', 'plans-features-customise')) AS guide_sections_18,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Connectors, messages and deleting by number') AS voice_section_1_if_chapter_exists,
  (SELECT count(*) FROM "Feature" WHERE name IN ('Mobile Access', 'Plans That Show Their Working', 'Voice Assist — Connectors') AND "publishedAt" IS NOT NULL) AS features_published_3,
  (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId" WHERE c.collection = 'tech-design' AND c.slug = 'feature-availability-limits') AS tech_sections_6,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%This guide covers version **2.13.%') AS version_line_1_if_present;
