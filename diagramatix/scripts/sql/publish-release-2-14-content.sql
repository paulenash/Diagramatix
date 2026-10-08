-- Release 2.14 content — User Guide, Features catalog and Technical Notes (Steps 10-12 of "update everything").
--
-- Paul, 2026-10-09: "Update everything!!!" This covers everything since 2.13 (2.13.2819, 2026-09-30) that a person can see or an administrator
-- needs to know:
--
--   10a  the version line in the User Guide's Getting Started chapter  → 2.14.<build>
--   10b  User Guide — five chapters: Create Project from Process Repository · Your Org's Process Repository (OrgAdmin) · AI Generate: Plan summary,
--        prompt check and repairs · Diagram badges and the project filter · Upgrade, change or cancel your subscription
--   11   Features catalog: four entries, added as DRAFTS (publishing to /features stays your call — use Publish All in the Features editor)
--   12   Technical Notes: "Process Repository — master and Org scope (2.14)"
--
-- ⚠ BEFORE RUNNING: check the BUILD NUMBER below (2938) against the live header badge (v2.14.<build>) or /api/schema, and edit it if the deploy came
--   out different. It is the only number to change. Everything else is safe as written.
--
-- NON-DESTRUCTIVE. Chapters and sections are added only where one with that slug / heading does not already exist, so anything you have edited in
-- the app since is never overwritten and a second run changes nothing. (To replace a section's wording later, edit it in the app.) The version line
-- is a targeted replacement of "This guide covers version **X.Y.Z**". Nothing else is touched.
--
-- THE LAST RESULT says what happened:
--   ALREADY APPLIED       — all 39 pieces of content were already in place before this ran; nothing changed.
--   APPLIED NOW           — N piece(s) were added or changed by this run, and all 39 are now in place.
--   NOT FULLY APPLIED     — the run finished but fewer than 39 are in place (the result says how many) — read the numbers and tell me.
--
-- Run it in the SuperAdmin ▸ Database tile. IDEMPOTENT. Proven on diagramatix_test before prod.

-- What "in place" means, counted the same way before and after (39 = 1 version line + 5 chapters + 22 sections + 4 features + 1 tech chapter + 6 tech sections).
DROP VIEW IF EXISTS _r214_have;
CREATE TEMP VIEW _r214_have AS
SELECT
    LEAST(1, (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%This guide covers version **2.14.2938**%'))
  + (SELECT count(*) FROM "HelpChapter" WHERE collection = 'user-guide'
       AND slug IN ('process-repository-projects', 'org-process-repository', 'ai-generate-checks', 'diagram-badges', 'manage-subscription'))
  + (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId" WHERE c.collection = 'user-guide'
       AND c.slug IN ('process-repository-projects', 'org-process-repository', 'ai-generate-checks', 'diagram-badges', 'manage-subscription'))
  + (SELECT count(*) FROM "Feature" WHERE name IN ('Create Project from the Process Repository', 'Your Organisation''s Process Repository',
       'AI Generate: Plan Summary & Prompt Check', 'Manage Your Subscription'))
  + (SELECT count(*) FROM "HelpChapter" WHERE collection = 'tech-design' AND slug = 'process-repository-org-scope')
  + (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId" WHERE c.collection = 'tech-design' AND c.slug = 'process-repository-org-scope')
  AS n;
DROP TABLE IF EXISTS _r214_before;
CREATE TEMP TABLE _r214_before AS SELECT n FROM _r214_have;

BEGIN;

-- ═══ 10a. The version number in the User Guide ═════════════════════════════════════════════════
--   >>> the build number to stamp <<<
UPDATE "HelpSection"
   SET "bodyMarkdown" = regexp_replace("bodyMarkdown", 'This guide covers version \*\*[0-9]+\.[0-9]+\.[0-9]+\*\*', 'This guide covers version **2.14.2938**'),
       "updatedAt" = NOW()
 WHERE collection = 'user-guide'
   AND "bodyMarkdown" ~ 'This guide covers version \*\*[0-9]+\.[0-9]+\.[0-9]+\*\*'
   AND "bodyMarkdown" NOT LIKE '%This guide covers version **2.14.2938**%';

-- ═══ 10b. User Guide chapters (created only if missing) ════════════════════════════════════════
INSERT INTO "HelpChapter" (id, slug, collection, title, category, "sortOrder", "adminOnly", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.slug, 'user-guide', v.title, v.category,
       (SELECT coalesce(max("sortOrder"), 0) + v.n FROM "HelpChapter" WHERE collection = 'user-guide'), v.admin, NOW(), NOW()
  FROM (VALUES
    ('process-repository-projects', 'Create Project from Process Repository',                         'Creating & Editing',   1, false),
    ('ai-generate-checks',          'AI Generate: Plan summary, prompt check & what it repairs',      'Creating & Editing',   2, false),
    ('diagram-badges',              'Diagram badges and the project filter',                          'Getting Started',      3, false),
    ('manage-subscription',         'Upgrade, change or cancel your subscription',                    'Getting Started',      4, false),
    ('org-process-repository',      'Your Org''s Process Repository (Master Template Value Chain Generation)', 'Sharing & Governance', 5, true)
  ) AS v(slug, title, category, n, admin)
 WHERE NOT EXISTS (SELECT 1 FROM "HelpChapter" c WHERE c.collection = 'user-guide' AND c.slug = v.slug);

INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, c.collection, s.heading, s.body, c."adminOnly", s.ord, NOW(), NOW()
  FROM (VALUES

  -- ── Create Project from Process Repository ──
  ('process-repository-projects', 0, 'What it does', $B$The **Process Repository** is Diagramatix's library of ready-made value chains: for each one, a value chain diagram, its context and process-context diagrams, and a BPMN diagram for every process in it. **Create Project from Process Repository** builds a project from it for you.

Find it in two places: the **Project ▾** menu on a project, and the **Create Project from Process Repository** button beside *Create APQC Project* on your dashboard.

You pick a value chain, tick the diagrams you want, answer a few questions, and Diagramatix creates the project and generates each diagram into it. Subprocess links between the diagrams are set up for you, and a new project is sorted by diagram type.$B$),

  ('process-repository-projects', 1, 'Choosing a chain and its diagrams', $B$The window scrolls. At the top, choose the **value chain**. Below it is the **project name** (it starts as the chain's name — change it if you like) and the list of **diagrams** in the chain, each with its type.

- Everything your subscription includes starts **ticked**; untick what you do not want. **Select all available** and **None** do the obvious.
- A diagram your subscription does not include is **greyed**, with the reason beside it ("Available on Introductory and above").
- If you opened it from inside a project, you can choose **A new project** or **This project**. Diagrams that would clash with names already in the project are saved as "… (2)" rather than overwriting anything.

While it runs, each diagram shows a tick as it finishes. When it is done, **Open the project** takes you there.$B$),

  ('process-repository-projects', 2, 'Questions before it starts', $B$Before any diagram is drawn you are asked **up to ten short questions** about how the processes should look — how closely the names should follow your organisation's own (your Entity Lists), how detailed the tasks should be, how much exception handling to show, which parties are pools rather than lanes, how decisions, IT systems, waits and deadlines are shown, and how the process ends. A few are specific to the chain you picked.

Answer what matters and skip the rest; skipping everything uses the Repository's prompts as they are. **Cancel** stops without creating anything. You can still use **Refine Prompt** in AI Generate on any diagram afterwards.$B$),

  ('process-repository-projects', 3, 'What it uses: AI attempts and projects', $B$Every diagram generated counts as **one AI attempt**, the same as AI Generate, against your plan's allowance. Making a whole chain is therefore a dozen or more attempts. If you reach your limit part-way, the run stops cleanly, keeps what it has made, and tells you how many were not attempted. A **new** project also counts against your plan's projects limit.

Choosing the questions does not use an attempt.$B$),

  ('process-repository-projects', 4, 'Which chains your subscription includes', $B$- **Free** — the *Order to Cash* chain (V01): its Value Chain diagram and processes V01.01 and V01.02.
- **Introductory** — all of the *Order to Cash* chain (V01).
- **Professional, Expert and Enterprise** — every value chain.

If your organisation has its own version of a chain (see *Your Org's Process Repository*), you get that in place of the standard one.$B$),

  -- ── AI Generate: Plan summary, prompt check & what it repairs ──
  ('ai-generate-checks', 0, 'The whole diagram is shown', $B$When AI Generate finishes drawing, the diagram opens **zoomed out so the whole of it is in view**, with the new elements marked. Zoom in on the part you want to look at.$B$),

  ('ai-generate-checks', 1, 'The Plan-ready summary', $B$When the **Plan** step finishes, a window summarises what was found: how many elements and connections, what kinds, the pools and lanes with how many steps each, and a list of **things to look at** — for example steps with no connection to the rest of the flow, or a plan that looks cut off partway.

Choose what to do next: **Re-plan**, **Refine Prompt** (answer a few questions about the gaps, then plan again), **View AI Response** (opens the editor with everything the AI returned, fully expanded, so you can read or correct it), **Layout Diagram** (draw it), or **Cancel**. Nothing is drawn until you choose Layout Diagram.$B$),

  ('ai-generate-checks', 2, 'Check before you Plan', $B$If your prompt is written in the standard Diagramatix BPMN prompt format (it starts with "BPMN:"), the prompt box checks it as you type and lists anything that cannot be drawn or will draw badly — a boundary event on something that is not a task, a message between two lanes of one pool, a gateway branch that never says where it goes, an exception that goes straight to an End event, a prompt that looks cut off. Each line names the line of the prompt; **click it to jump there**. A clean prompt shows a tick.

Free-text prompts such as "A customer places an order…" are not checked this way.$B$),

  ('ai-generate-checks', 3, 'What generation repairs for you', $B$Some things are put right automatically when a diagram is laid out, whatever the prompt said:

- **An exception never ends silently.** If an edge-mounted event (a timer, say) leads straight to an End event, a **User task** ("Handle: …") is put between them so someone can act, and the End event that finishes an exception path becomes a **Terminate** End event.
- A timer on a step **inside** a subprocess whose path would leave the subprocess is moved onto the subprocess itself.
- A step on an exception path that a main-flow line would run through is moved clear of it, and an annotation that lands on another element is moved to the nearest clear spot.
- A two-way decision leaves by its top and bottom corners; the middle corners are used only when three flows leave (or enter a merge).

The diagram scan (BPMN Scanner) reports the first two when they appear on a diagram drawn by hand.$B$),

  -- ── Diagram badges and the project filter ──
  ('diagram-badges', 0, 'The badges', $B$Beside a diagram's name in the project tree, small coloured circles say what else is on it:

- **AI** — generated by AI from a saved prompt
- **SI** — has simulation data
- **MN** — tied to a process-mining run
- **AP** — classified against the APQC framework
- **RC** — carries risks and controls
- **RV** — has review comments (the pink notes); hover to see how many

Each takes its feature's colour; a SuperAdmin can change them under *Feature Colours*.$B$),

  ('diagram-badges', 1, 'Filtering the tree by badge', $B$On the filter line above the tree, the same badges act as filters, in the same colours. Click one to show only diagrams that have it (faded = off, ringed = on); click two to narrow further. **Clear** shows everything again.$B$),

  ('diagram-badges', 2, 'Cloning keeps the badges', $B$When you **Clone** a diagram the copy keeps its badges straight away (the one exception is **MN**, which depends on a mining run the copy is not part of).$B$),

  -- ── Upgrade, change or cancel your subscription ──
  ('manage-subscription', 0, 'Your subscription chip', $B$Your subscription level shows as a chip at the top of the dashboard. On **Free** an **Upgrade** chip sits beside it. On a paid level the chip is display-only and the options are in the **System** menu.$B$),

  ('manage-subscription', 1, 'Upgrading', $B$**Upgrade** (top of the dashboard, and in the System menu) shows the plans. An upgrade takes effect **immediately**; you are billed for the new level from the start of your next billing month.$B$),

  ('manage-subscription', 2, 'Changing or cancelling', $B$From the **System** menu: **Change Subscription**, **Cancel Subscription** and, after cancelling, **Resume Subscription**.

- A **downgrade** takes effect at the **end of your current billing month**; until then you keep what you have. There are no part-month refunds.
- **Cancelling** ends the subscription at the end of the period you have paid for; you can resume before then.$B$),

  ('manage-subscription', 3, 'What happens to your data if you cancel', $B$Your projects and diagrams are **kept** under your account. If you come back, contact support and your earlier work can be reconnected to you. If you would rather have everything deleted, ask and an administrator will remove your account and all of its data completely.$B$),

  -- ── Your Org's Process Repository (OrgAdmin) ──
  ('org-process-repository', 0, 'What this is', $B$**Master Template Value Chain Generation** (OrgAdmin dashboard) is your organisation's **own Process Repository**. Diagramatix keeps a *master* repository of value chains; here you can take your own copies of the ones you want, change them to suit your organisation, regenerate their prompts, and publish them. Your people then create projects from **your** versions.

It is the same screen as the master repository, working only on your organisation's rows. Nothing you do here changes the master or any other organisation.$B$),

  ('org-process-repository', 1, 'Adopting a chain', $B$In **Adopt from the master repository**, **Adopt** copies a master chain — its narrative, processes and published prompts — into your repository as a **draft**. Your people keep seeing the master's version until you publish yours. You can adopt as many as you like; **Remove** (delete) on a chain hands it back to the master.$B$),

  ('org-process-repository', 2, 'Changing it and regenerating its prompts', $B$Select a chain to edit its **narrative** and its **processes** (add, rename, remove, reorder). **Regenerate** writes new prompts from the narrative using the **master template** plus your organisation's own template additions. Before it writes process prompts it asks up to ten short questions (entity alignment, task detail, exception handling and so on), the same as the master tool.

Regeneration uses your organisation's AI model and counts as **one AI attempt per prompt written**; if you reach your limit it stops cleanly and says where it got to.$B$),

  ('org-process-repository', 3, 'Publishing — what your people see', $B$**Publish** makes your version of a chain live: from then on your organisation's users see it in *Create Project from Process Repository* **in place of** the master's chain with the same code. A chain you have not published (or have **Withdrawn**) is the master's. To hide a master chain from your people, adopt it, mark it hidden and publish.

Chains show **live**, **draft** (unpublished edits) or **never published**.$B$),

  ('org-process-repository', 4, 'When the master changes', $B$Two things are flagged for you:

- **A new master template version.** When Diagramatix issues a new version of the master template (for example v10), a banner says so and counts the prompts in your repository written to an older version; those chains are marked in red. **Regenerate** them, review, then **Publish** — until you do, your people keep the prompts you last published.
- **Master updated.** If the master has republished a chain since you adopted or last updated yours, it is marked **master updated**. **Update from master** replaces your copy with the master's current version (your edits to it are lost — it asks first).$B$),

  ('org-process-repository', 5, 'Backup and restore', $B$**Backup & Restore** (OrgAdmin) now includes your organisation's own repository — every chain you adopted or wrote, with its processes and prompts, drafts and published text. A restore **only ever adds**: a chain that is not in the target organisation is recreated; one that is already there is left exactly as it is.$B$)

  ) AS s(chapter_slug, ord, heading, body)
  JOIN "HelpChapter" c ON c.collection = 'user-guide' AND c.slug = s.chapter_slug
 WHERE NOT EXISTS (SELECT 1 FROM "HelpSection" x WHERE x."chapterId" = c.id AND x.heading = s.heading);

-- ═══ 11. Features catalog — four entries, added as DRAFTS (publish them from the Features editor when you are happy) ═══
INSERT INTO "Feature" (id, name, summary, details, hidden, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.name, v.summary, v.details, false, v.ord, NOW(), NOW()
  FROM (VALUES
    ('Create Project from the Process Repository', 'Start from a ready-made value chain: pick the processes you want and the diagrams are built for you.', $F$- A library of value chains, each with its value chain, context and process diagrams
- Pick a chain and the diagrams you want, answer a few questions about how they should look, and a project is created and generated
- Subprocess links and diagram order set up for you
- Order to Cash on the entry plans; every value chain on Professional and above$F$, 910),
    ('Your Organisation''s Process Repository', 'Take your own copies of the value chains, change them to suit your organisation, and publish them to your people.', $F$- Adopt chains from the master repository and edit their narratives and processes
- Regenerate prompts from the master template plus your organisation's own additions
- Publish: your people see your version in place of the standard one
- Told when a new master template or master chain is available
- Included in your organisation's backup$F$, 911),
    ('AI Generate: Plan Summary & Prompt Check', 'See what the AI found before anything is drawn, and have your prompt checked as you type.', $F$- A summary after the Plan step: what was found, what to look at, and what to do next
- View the AI's full response, expanded, before laying out
- Your BPMN prompt is checked as you type, with a click to the line
- Exceptions never end silently: a task is added and the End becomes Terminate
- The whole diagram is in view when generation finishes$F$, 912),
    ('Manage Your Subscription', 'Upgrade, change or cancel from inside Diagramatix.', $F$- Upgrade takes effect immediately
- Downgrades take effect at the end of the billing month
- Cancel and resume from the System menu
- Your work is kept if you cancel$F$, 913)
  ) AS v(name, summary, details, ord)
 WHERE NOT EXISTS (SELECT 1 FROM "Feature" f WHERE f.name = v.name);

-- ═══ 12. Technical Notes ═════════════════════════════════════════════════════════════════════
INSERT INTO "HelpChapter" (id, slug, collection, title, category, "sortOrder", "adminOnly", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'process-repository-org-scope', 'tech-design', 'Process Repository — master and Org scope (2.14)', NULL,
       (SELECT coalesce(max("sortOrder"), 0) + 1 FROM "HelpChapter" WHERE collection = 'tech-design'), false, NOW(), NOW()
 WHERE NOT EXISTS (SELECT 1 FROM "HelpChapter" WHERE collection = 'tech-design' AND slug = 'process-repository-org-scope');

INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, 'tech-design', s.heading, s.body, false, s.ord, NOW(), NOW()
  FROM (VALUES

  (0, 'Data model', $T$`ValueChainLibrary` gains `orgId` (`''` = the MASTER repository, otherwise the owning Org's id — empty rather than null so the unique index behaves) and `masterPublishedAt` (Org chains: the master chain's `publishedAt` when adopted or last synced). The unique key is `(orgId, code)`; processes and prompts hang off `chainId` as before, so they are scoped by their chain. A schema ratchet (`tests/valueChain/org-repository.test.ts`) fails if any read of the chains table in `app/` or `scripts/` is not bounded by `orgId` (or a unique id), so the master screen can never list an Org's chains.$T$),

  (1, 'Which chain a user sees', $T$`valueChain/repositoryChains.ts`: `publishedChainFor(code, orgId)` and `publishedChainsFor(orgId)`. An Org chain that is **published** replaces the master chain with the same code for that Org's users; an unpublished (draft) Org chain changes nothing; a hidden chain is never offered (an Org hides a master chain by adopting, hiding and publishing it); Org-only chains follow the master ones. Used by `GET /api/repository/chains`, `POST /api/repository/questions` and the runner. A generated diagram stamps `aiGeneration.source.scope` (`org` | `master`) so the freshness check reads the right repository's prompt.$T$),

  (2, 'The maintenance handlers', $T$`valueChain/libraryAdmin.ts` holds `libraryGet(req, scopeOrg)` / `libraryPost(req, session, scopeOrg)`, shared by `app/api/admin/value-chain-library` (SuperAdmin, scope `''`) and `app/api/org-admin/value-chain-library` (OrgAdmin via `guardOrgRoute`, scope = the active Org). Every query is bounded by `scopeOrg`; every id-addressed action (`save-chain`, `save-processes`, `delete-chain`) first checks `ownsChain(id)`. An Org cannot `import` a file. Org-only actions: `adopt` (copies the master's PUBLISHED chain, processes and prompts as a draft, stamping `masterPublishedAt`) and `sync` (replaces an adopted chain with the master's current published version). `GET ?master=1` lists adoptable master chains with `adopted` / `masterMoved`. Org regeneration uses `resolveOrgModel()`, the master template briefing plus the Org's own `DiagramRules` additions (`orgId`, `userId` null), and meters one `aiAttempts` per prompt written.$T$),

  (3, 'The user flow and its gate', $T$Two features in the Feature Availability grid — `process-repository-restricted` and `process-repository-complete` (registry, seed matrix, gate map, `patch-process-repository-features.sql`). `valueChain/repositoryAccess.ts`: `modeFromStates` (Complete wins), `itemAllowed` (Restricted = chain V01 only; Free = the V01 `value-chain` diagram plus `V01.01` and `V01.02`; Introductory = all of V01), `disabledReason`. `valueChain/runLibraryProject.ts` is the single runner behind both the SuperAdmin tool (`mode "superadmin"`) and `POST /api/repository/create-project` (`mode "user"`): the user mode refuses a non-library source, trims the selection to what the feature opens **on the server**, gates `allowAi` / `projects` / `aiAttempts`, uses the Org's model, checks the AI limit before each diagram and records one attempt on success.$T$),

  (4, 'The question step', $T$`valueChain/promptQuestions.ts`: eight core questions (entity alignment, task detail, exception handling, pools/lanes, decisions, systems, waits/deadlines, endings) trimmed and extended by ONE small AI call (`choosePromptQuestions`, falling back to the core list), capped at ten. The answers (`answersBlock`) and, for entity alignment, the Org's Entity List names (`entityNames.ts`) are added to the generator's user message for BPMN process prompts only. Wired into the Process Repository screen, the `.md` upload tool, Create Project (which rewrites each selected process prompt from the answers, falling back to the stored prompt) and the user dialog.$T$),

  (5, 'Backup and the silent-failure rules', $T$The full backup is catalog-driven and carries every chain with the new columns. The Org backup (`org-backup.ts`) now carries the Org's own chains, processes and prompts and `restoreOrgBackupAdditive` recreates missing ones by code (fresh ids, `orgId` = the target) and leaves existing ones untouched; the master is never in an Org backup (`tests/backup/org-repository-backup.test.ts`). Separately, generation enforces the silent-failure rules (`silentFailure.ts`: R8.47 a User task between an edge event and an End, R8.48 Terminate End on exception paths) and the scanner reports them (B56, B57); layout rules R8.49 (middle gateway vertices only with three flows), R8.50 (edge-event spacing), R8.51 (exception steps clear of main-flow lines) and R8.52 (annotations clear of elements) are Red Rules, each with an idempotent SQL patch that reports ALREADY APPLIED / APPLIED NOW.$T$)

  ) AS s(ord, heading, body)
  JOIN "HelpChapter" c ON c.collection = 'tech-design' AND c.slug = 'process-repository-org-scope'
 WHERE NOT EXISTS (SELECT 1 FROM "HelpSection" x WHERE x."chapterId" = c.id AND x.heading = s.heading);

COMMIT;

-- ═══ What happened ═══════════════════════════════════════════════════════════════════════════
SELECT CASE
         WHEN (SELECT n FROM _r214_before) = 39 THEN 'ALREADY APPLIED — all 39 pieces of release 2.14 content were already in place; nothing changed'
         WHEN (SELECT n FROM _r214_have) = 39   THEN 'APPLIED NOW — ' || (39 - (SELECT n FROM _r214_before)) || ' piece(s) added or changed; all 39 are now in place'
         ELSE 'NOT FULLY APPLIED — ' || (SELECT n FROM _r214_have) || ' of 39 pieces are in place (before this run: ' || (SELECT n FROM _r214_before) || '). Is the Getting Started chapter present, and the build number right?'
       END AS result;
