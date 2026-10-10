-- Create a New Value Chain — User Guide, Features catalog and Technical Notes.
--
-- Paul, 2026-10-10: "Create a plan for a new user feature called 'Create a New Value Chain' to be available to Expert and above." This adds the
-- documentation for it:
--
--   1  User Guide — one chapter, "Create a New Value Chain", in six sections
--   2  Features catalog — one entry, added as a DRAFT (publishing to /features stays your call — use Publish All in the Features editor)
--   3  Technical Notes — one chapter, "Create a New Value Chain — design", in five sections
--
-- It does NOT touch the version line in the Getting Started chapter: that belongs to the release step ("update everything"), which also writes the
-- release notes.
--
-- NON-DESTRUCTIVE. A chapter, section or feature is added only where one with that slug / heading / name does not already exist, so anything you
-- have edited in the app since is never overwritten and a second run changes nothing. Nothing else is touched.
--
-- THE LAST RESULT says what happened:
--   ALREADY APPLIED       — all 14 pieces were already in place before this ran; nothing changed.
--   APPLIED NOW           — N piece(s) were added by this run, and all 14 are now in place.
--   NOT FULLY APPLIED     — the run finished but fewer than 14 are in place (the result says how many).
--
-- Run it in the SuperAdmin ▸ Database tile. IDEMPOTENT.

-- What "in place" means, counted the same way before and after (14 = 1 chapter + 6 sections + 1 feature + 1 tech chapter + 5 tech sections).
DROP VIEW IF EXISTS _cnvc_have;
CREATE TEMP VIEW _cnvc_have AS
SELECT
    (SELECT count(*) FROM "HelpChapter" WHERE collection = 'user-guide' AND slug = 'create-new-value-chain')
  + (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId" WHERE c.collection = 'user-guide' AND c.slug = 'create-new-value-chain')
  + (SELECT count(*) FROM "Feature" WHERE name = 'Create a New Value Chain')
  + (SELECT count(*) FROM "HelpChapter" WHERE collection = 'tech-design' AND slug = 'create-new-value-chain-design')
  + (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId" WHERE c.collection = 'tech-design' AND c.slug = 'create-new-value-chain-design')
  AS n;
DROP TABLE IF EXISTS _cnvc_before;
CREATE TEMP TABLE _cnvc_before AS SELECT n FROM _cnvc_have;

BEGIN;

-- ═══ 1. User Guide ═════════════════════════════════════════════════════════════════════════════
INSERT INTO "HelpChapter" (id, slug, collection, title, category, "sortOrder", "adminOnly", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'create-new-value-chain', 'user-guide', 'Create a New Value Chain', 'Creating & Editing',
       (SELECT coalesce(max("sortOrder"), 0) + 1 FROM "HelpChapter" WHERE collection = 'user-guide'), false, NOW(), NOW()
 WHERE NOT EXISTS (SELECT 1 FROM "HelpChapter" WHERE collection = 'user-guide' AND slug = 'create-new-value-chain');

INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, c.collection, s.heading, s.body, false, s.ord, NOW(), NOW()
  FROM (VALUES

  (0, 'What it does', $B$**Create a New Value Chain** turns your own description of a value chain — and of the processes inside it — into a full set of diagram prompts, written by the same Master Prompt templates that write the Process Repository's. The result joins **your organisation's list of value chains**, coded **C01, C02 …**, next to the ready-made ones.

From there it works exactly like a Process Repository chain: use **Create Project from Process Repository** to turn any of its prompts into diagrams.

It is available on **Expert** and above. Find it in the **Project ▾** menu on a project, and as the **Create a New Value Chain** button on your dashboard.$B$),

  (1, 'The six steps', $B$1. **The value chain.** Name it and describe it in your own words: what it is for, what starts it, who takes part, which systems are used, which rules matter, and what a good result looks like.
2. **The processes.** List **5 to 12** processes in the order the work happens and say what you know about each — what happens, who does it, which systems, the decisions and what can go wrong. **Suggest processes** proposes a list from your description for you to edit.
3. **What to create.** The **Value Chain** and **Context** prompts and one **BPMN** prompt per process are always written. Tick **Process Context** and **ArchiMate** if you want those too. The step tells you how many prompts that is and how many AI attempts it will use.
4. **Check the narrative.** Diagramatix builds the structured narrative that every prompt is written from. Read it, correct anything wrong, and look at anything marked **(assumed)** — that is where you were silent and it chose something ordinary. Process headings must stay exactly as they are.
5. **A few questions.** The same short questions as *Create Project from Process Repository* — how detailed the tasks should be, how much exception handling, and so on. Skip any you like.
6. **Create.** The prompts are written one by one and you can watch them appear. When every prompt has been written the value chain is shared with your organisation.

Nothing is saved to your organisation's list until step 6.$B$),

  (2, 'What gets created', $B$For a chain coded **C03**, for example:

| Prompt | Written |
| --- | --- |
| Value Chain | always |
| Context | always |
| BPMN — **C03.01** to **C03.nn** (one per process, 5 to 12) | always |
| Process Context | if you ticked it |
| ArchiMate | if you ticked it |

That is **7 to 16 prompts**. Codes count up within your organisation (C01, C02 …); another organisation has its own C01. The Master Prompt template version each prompt was written to is **remembered** with it, so Diagramatix can tell you later when a template has moved on and a prompt is out of date.

You can export any of them as a **.md** file and import it elsewhere, exactly like a Process Repository chain.$B$),

  (3, 'Cost and limits', $B$Each prompt written is **one AI attempt**, and so is building the narrative (and **Suggest processes**, if you use it). A full chain is therefore roughly **9 to 19 attempts**. Before anything is created, the last step checks you have enough — if you do not, nothing is created.

If a run stops part-way — you reach your limit, or the AI service is unavailable — the value chain is kept as a **draft** with what has been written, and **Carry on** (or **My Value Chains**) writes only what is missing. You are never charged twice for a prompt.

Your organisation can create a limited number of value chains this way (10 unless your administrator has changed it).$B$),

  (4, 'My Value Chains', $B$**My Value Chains** (dashboard, or **Project ▾**) lists the value chains you created. Select one to:

- read and edit its **narrative**, and rename, add, remove or reorder its **processes**;
- **regenerate** some or all of its prompts — for example when a template has moved on and a prompt is marked out of date;
- **publish** it to your organisation, or **withdraw** it;
- **delete** it, if you created it.

Editing a narrative does not change the prompts already written: regenerate them to pick the change up.$B$),

  (5, 'Who can manage a value chain', $B$A value chain you create is managed by **you**, by your organisation's **OrgAdmin**, and by a **SuperAdmin**.

- **You** can do everything above, including deleting it.
- Your **OrgAdmin** sees every value chain created in the organisation (in *My Value Chains*, and in *Master Template Value Chain Generation*, which shows who created each). They can edit, regenerate, publish and withdraw them, and **hand a chain to someone else** — for example when its owner has left. They cannot delete one: ask a SuperAdmin.
- A **SuperAdmin** can manage any organisation's chains from the Process Repository screen, using the **Repository** picker.

Other people in your organisation can use a published value chain to create projects, within what their own plan allows.$B$)

  ) AS s(ord, heading, body)
  JOIN "HelpChapter" c ON c.collection = 'user-guide' AND c.slug = 'create-new-value-chain'
 WHERE NOT EXISTS (SELECT 1 FROM "HelpSection" x WHERE x."chapterId" = c.id AND x.heading = s.heading);

-- ═══ 2. Features catalog — added as a DRAFT ═══════════════════════════════════════════════════
INSERT INTO "Feature" (id, name, summary, details, hidden, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.name, v.summary, v.details, false, v.ord, NOW(), NOW()
  FROM (VALUES
    ('Create a New Value Chain', 'Describe a value chain and its processes in your own words and have its diagram prompts written for you.', $F$- Describe the value chain, list 5–12 processes, and check the structured narrative before anything is written
- Value Chain and Context prompts, a BPMN prompt per process, and optional Process Context and ArchiMate prompts
- Each prompt remembers the Master Prompt template version it was written to
- Joins your organisation's list of value chains as C01, C02 … ready to turn into a project
- Managed by its owner, your OrgAdmin and a SuperAdmin; Expert and above$F$, 914)
  ) AS v(name, summary, details, ord)
 WHERE NOT EXISTS (SELECT 1 FROM "Feature" f WHERE f.name = v.name);

-- ═══ 3. Technical Notes ═════════════════════════════════════════════════════════════════════
INSERT INTO "HelpChapter" (id, slug, collection, title, category, "sortOrder", "adminOnly", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'create-new-value-chain-design', 'tech-design', 'Create a New Value Chain — design', NULL,
       (SELECT coalesce(max("sortOrder"), 0) + 1 FROM "HelpChapter" WHERE collection = 'tech-design'), false, NOW(), NOW()
 WHERE NOT EXISTS (SELECT 1 FROM "HelpChapter" WHERE collection = 'tech-design' AND slug = 'create-new-value-chain-design');

INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, 'tech-design', s.heading, s.body, false, s.ord, NOW(), NOW()
  FROM (VALUES

  (0, 'Data model', $T$`ValueChainLibrary` gains `createdByUserId` (the owner; null for the master's and adopted chains) and `createdByName` (a snapshot, so the history survives the user leaving). `ValueChainProcess` gains `details` (the author's specific details). A new `ValueChainBrief` (one per user chain) keeps the author's own general description, the optional prompts chosen (`options` JSON), the question answers (`answers` JSON), and the narrative template version and model that built the approved narrative. JSON is written with raw SQL (Prisma 7 omits JSON from its inputs). All additive and nullable/defaulted. Codes are `C` + two digits, next free **per Org** (`chainCodes.ts`); `unique(orgId, code)` settles a race and creation retries.$T$),

  (1, 'Template versions are remembered', $T$`ValueChainPrompt` gains `templateVersion` (the built-in template version in force for the prompt's type when it was written — **stored, no longer inferred from `generatedAt`**), `additionsHash` (the house-rule additions merged into the briefing) and `templateHash` (the whole briefing sent; the column existed but nothing wrote it). `promptStamp.stampFor()` builds the three; `writeChainPrompt()` is the **one** place a generated prompt is saved, and `generateAndStorePrompt()` (storePrompt.ts) is the one step both the maintenance screens and Create a New Value Chain use. Staleness (`promptIsStaleStamped`) judges from the stored version and falls back to the date only for prompts written before the column existed. The stamps ride in each prompt's provenance line in the `.md` export (`template=9; additions=…; briefing=…`) and import back; a file from before them imports with the stamps unknown, never invented. Adopted prompts keep the master prompt's stamps; the project runner stamps diagrams from the stored version.$T$),

  (2, 'The sixth master template', $T$**Value Chain Narrative** (`chainNarrative.ts`, category `md-prompt-chain-narrative`) turns an author's description and process details into the nine-part structured narrative the five prompt generators read. It is a read-only built-in plus editable additions (SuperAdmin's, and the Org's own) with an append-only version history (`CHAIN_NARRATIVE_HISTORY`), registered in the Rules editor — but deliberately **not** one of `MD_PROMPT_TYPES`, which is the five diagram-prompt kinds and drives staleness. The built narrative is held to a contract (heading, nine labelled parts, exactly one `### code — name` subsection per process in order, the association matrix); a failed check gets one correction round naming what was wrong. Unknown details are marked `(assumed)` and nothing is invented. `chainNarrative.ts`, `newChainPlan.ts` and `chainCodes.ts` are pure so the wizard and the server validate with the same code.$T$),

  (3, 'The create pipeline', $T$Routes under `/api/repository/new-chain`: `access` (GET), `suggest-processes`, `build-narrative`, `questions`, `create` and `resume` (NDJSON). `create` checks the Org's chain limit (AppSetting `valueChain.userChains.maxPerOrg`, default 10) and the author's remaining AI attempts against the planned count (7–16) **before creating anything**, then allocates the code, creates the chain as a draft with its processes and brief, and streams the prompts through `streamChainRun` — chain-level prompts first, then one BPMN prompt per process. One attempt is charged per prompt written, the allowance is re-checked before each prompt, a limit or spend cap halts the run cleanly, and a failed prompt is not charged. The chain is published to the Org only when every planned prompt exists; `resume` writes only what is missing. The wizard shows the same counts using the pure plan.$T$),

  (4, 'Permissions and gating', $T$Feature `create-value-chain` (registry, seed matrix, gate map, `patch-create-value-chain-feature.sql`): Expert and Enterprise available. A feature with no grid cells fails open, so `requireNewChainAccess` also enforces a code floor of Expert until the seed has run. `chainPermissions.ts` is the one place for who may do what to a user chain: **manage** = the owner, an OrgAdmin of the chain's Org, a SuperAdmin; **delete** = the owner and a SuperAdmin (OrgAdmins delete nothing — they withdraw). A chain in another Org, an adopted chain or the master's is always "not found". `/api/repository/my-chains` lists only what the caller may manage, checks `canManageChain` against the named chain before handing the request to the shared handlers, and offers only the actions that suit a user chain; `/api/admin/org-value-chain-library/[orgId]` is the SuperAdmin's per-Org view. The Org backup carries the brief. Chains with a C code are outside the Restricted Process Repository mode (Order to Cash only).$T$)

  ) AS s(ord, heading, body)
  JOIN "HelpChapter" c ON c.collection = 'tech-design' AND c.slug = 'create-new-value-chain-design'
 WHERE NOT EXISTS (SELECT 1 FROM "HelpSection" x WHERE x."chapterId" = c.id AND x.heading = s.heading);

COMMIT;

-- ═══ What happened ═══════════════════════════════════════════════════════════════════════
SELECT CASE
         WHEN (SELECT n FROM _cnvc_before) = 14 THEN 'ALREADY APPLIED — all 14 Create a New Value Chain documentation pieces were already in place; nothing changed'
         WHEN (SELECT n FROM _cnvc_have) = 14   THEN 'APPLIED NOW — ' || (14 - (SELECT n FROM _cnvc_before)) || ' piece(s) added; all 14 are now in place'
         ELSE 'NOT FULLY APPLIED — ' || (SELECT n FROM _cnvc_have) || ' of 14 pieces are in place (before this run: ' || (SELECT n FROM _cnvc_before) || ')'
       END AS result;
