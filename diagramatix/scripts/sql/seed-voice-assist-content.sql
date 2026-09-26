-- D1 — publish the Voice Assist User Guide chapter, Technical Notes chapter
-- and Features rows.
--
-- Paul, 2026-09-20: "Voice Assist is live to Expert-and-above customers who
-- have no documentation for it." Run `check-voice-assist-content.sql` first to
-- see what this database already holds.
--
-- WHY SQL AND NOT THE THREE SEED SCRIPTS. Three `.ts` seeds exist
-- (`add-guide-ai-assist.ts`, `add-tech-notes-ai-assist.ts`,
-- `add-features-ai-assist.ts`) and are still useful locally, but:
--   • the standing rule is that a production data change is an idempotent SQL
--     file run from the in-app Database tile, not a script with a prod
--     DATABASE_URL pasted into a shell;
--   • their content was written on 4 August and describes a feature called
--     Abracadabra that was SuperAdmin-only, had no confirmations, no numbered
--     picks, no selection references and half the vocabulary it has now;
--   • the guide seed never publishes the Features rows, so even a database
--     where it ran shows nothing on /features.
-- So this file carries current content and finishes the job.
--
-- ⚠ THIS REPLACES THE SECTIONS OF THE TWO `ai-assist` CHAPTERS. Section bodies
-- are rewritten wholesale rather than upserted by heading, because the heading
-- set itself has changed and an upsert would leave August's sections stranded
-- alongside September's. Anything hand-edited in those two chapters — and only
-- those two — is overwritten. No other chapter is touched.
--
-- IDEMPOTENT: re-running produces the same rows, the same order and the same
-- text. Proven on diagramatix_test before prod.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Repair: HelpSection.collection must match its chapter's
-- ════════════════════════════════════════════════════════════════════════════
-- `HelpSection.collection` is a denormalised copy of the chapter's, kept so the
-- bulk-save PUT can scope its delete without a join:
--
--     app/api/admin/user-guide/route.ts:74
--       await tx.helpSection.deleteMany({ where: { collection: COLLECTION } });
--
-- Every `add-tech-notes-*.ts` seed creates sections without the field, so it
-- defaults to 'user-guide' on sections belonging to 'tech-design' chapters.
-- That is a latent data-loss bug, not a cosmetic one: saving the User Guide in
-- the Document Editor deletes every section whose denormalised collection is
-- 'user-guide' — including those Technical Notes. Repair before seeding, so
-- the rows this file writes are not the only correct ones.
UPDATE "HelpSection" s
   SET collection = c.collection, "updatedAt" = NOW()
  FROM "HelpChapter" c
 WHERE c.id = s."chapterId" AND s.collection <> c.collection;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. User Guide — "AI Assist & Voice Assist"
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO "HelpChapter" (id, slug, collection, title, category, "sortOrder", "adminOnly", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'ai-assist', 'user-guide', 'AI Assist & Voice Assist', 'Creating & Editing',
       (SELECT coalesce(max("sortOrder"), 0) + 1 FROM "HelpChapter" WHERE collection = 'user-guide'),
       false, NOW(), NOW()
 WHERE NOT EXISTS (SELECT 1 FROM "HelpChapter" WHERE collection = 'user-guide' AND slug = 'ai-assist');

-- Title and category are set on every run so a database seeded in August is
-- brought forward without a second file.
UPDATE "HelpChapter"
   SET title = 'AI Assist & Voice Assist', category = 'Creating & Editing', "updatedAt" = NOW()
 WHERE collection = 'user-guide' AND slug = 'ai-assist';

DELETE FROM "HelpSection"
 WHERE "chapterId" = (SELECT id FROM "HelpChapter" WHERE collection = 'user-guide' AND slug = 'ai-assist');

INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'user-guide', v.heading, v.body, false, v.ord, NOW(), NOW()
  FROM (SELECT id FROM "HelpChapter" WHERE collection = 'user-guide' AND slug = 'ai-assist') ch,
  (VALUES

  (0, 'What Assist does', $UG$**Assist** helps you build a BPMN diagram faster: it suggests the next thing as you draw, and it lets you **say or type** what you want instead of clicking for it. It is optional, off until you turn it on, and most of it is instant and free — the AI is only called for wording the built-in rules do not recognise.

Two switches in the BPMN toolbar, each remembering its own on/off state per diagram:

- **👻 Assist** — ghost suggestions for the next step. Available on **every subscription level**.
- **🪄 Voice Assist** — speak or type editing commands. Available on **Expert** and above.

Neither changes anything you have not asked for, and every change either makes is a single undo away.$UG$),

  (1, '👻 Assist — ghost next-step suggestions', $UG$Turn on **👻 Assist**, then select a single element. Faint **ghost chips** appear to its right suggesting what usually comes next. **Press Tab** (or click a chip) to accept the top one — the element is placed and connected for you, tidily, and never on top of anything.

Depending on what is selected you may see:

- **Task / Decision / End** — the usual next steps.
- **Boundary** — attach an edge-mounted event to a task or subprocess (it clips onto the edge; no connector).
- **🧩 Template** — insert a saved template fragment inline (pick a category, then a template).
- **✨ (an intent)** — when the element's *name* implies something. Naming a task "Approve invoice" suggests an approval template.
- **📄 Data Object** — when the name implies using instructions or a policy (adds an **Input** data object, default "Instructions") or producing a document (adds an **Output** data object, default "Output Doc"). Rename it afterwards like any other element.

Every suggestion is checked by the same rules engine that governs AI generation, so nothing illegal or badly placed is ever offered.$UG$),

  (2, '🪄 Voice Assist — say it or type it', $UG$Turn on **🪄 Voice Assist** and a command bar appears. Click the **🎙 mic** and talk, or type a command and press **Run**. Each sentence is applied to the diagram **live**, and the log shows what it heard and what it did.

The log tags every entry so you can see what it cost: **rule** (interpreted by the built-in grammar — instant, free, works offline) or **✨ AI** (sent to the AI because the wording was not recognised — metered).

The bar can be **dragged by its header**. The Symbols palette and the Properties panel fold away while it is open and come back as they were when it closes. Two buttons sit on it:

- **Commands** — a movable, scrollable reminder card of everything the grammar accepts, grouped by family. Every example on that card is tested, so if it is printed there it parses.
- **Cost** — what this session has cost so far: AI fallback calls at list price plus microphone minutes at a per-minute estimate. It is an estimate; the provider's invoice is the truth, and browser-engine voice is free.

**Voice Assist is available on Expert subscriptions and above.** If you do not see the 🪄 button on a BPMN diagram, that is why.$UG$),

  (3, 'Things you can say or type', $UG$**Add and connect**

- "add a task called Approve after Review" · "add a decision" · "insert a parallel gateway"
- "connect Send Invoice to Receive Payment" · "connect them"
- "add a boundary event called Cancel to the Repeat-Until subprocess"

**Pools and lanes**

- "put a pool around everything" · "add a black box pool above Customer"
- "add 2 lanes to the middle pool called Sales and Marketing"
- "add 3 sublanes to the Marketing lane called Manager, Assistant and Staff"
- "add a lane below Picking called Packing" · "swap Sales with Picking"
- "compress the Customer pool" · "extend the pools to include all elements"
- "compress the Sales lane" · "expand lane Picking by 100" — a lane fits to its content: its top stays and the lanes below close up. Expand adds one Task row at the bottom, or the number you say.
- "move the pool left boundary right" · "nudge the Warehouse pool top boundary up by 40" — moves **one edge**, not the pool. A left/right boundary only goes left or right, a top/bottom one only up or down; it stops at the first element it meets, and the lanes follow.

**Messages**

- "add a message from Receive Order to Customer labelled Order Placed"
- "rename connector Order Placed to Order Received" · "delete message Order Placed"

**Edit and tidy**

- "rename the gateway to Approved?" · "nudge Approve right" · "move these up"
- "delete Prepare and compact" · "clear the diagram" · "export the diagram to JSON"
- "undo that" · "again" (repeats the last command)

Refer to things by **name** ("Review"), by **type** ("the gateway"), by **position** ("the middle pool"), by **number** ("Lane 2" or "lane two"), or with **it / the last one / the previous one**. A leading or trailing kind word is tolerated, so "the Sales lane" finds the lane named Sales.

The full list lives on the **Commands** card in the bar.$UG$),

  (4, 'Point at it instead of naming it', $UG$The surest way to say *which* element is to select it with the mouse first. A selected element cannot be mis-heard and is never ambiguous, so the mouse says which and the voice says what. This works with **every** command that takes a reference:

| Say | Means |
|---|---|
| "this", "that" | whatever is selected (or the last element added, if nothing is) |
| "these", "those", "the selection", "the selected elements" | everything selected |
| "the selected task" / "the selected pool" / "the selected lanes" | the selected elements of that kind |

For example: "rename the selected pool to Customer" · "delete these" · "connect this to Approve" · "move the selected task right" · "add a boundary event called Timeout to this".

A command that needs **one** target will ask you to narrow the selection if several are selected; **delete** happily takes many.

**Wrapping the selection** is worth knowing about:

- "surround selected with an expanded subprocess called Check Stock" — draws a subprocess around the selected elements exactly as they are, gives them a Start and an End inside, and makes room in that lane only. "delete selected" on an expanded subprocess is the exact reverse: the shell goes, the contents stay and are spliced back into the flow, and they return to where they were.
- "wrap these in a pool called Finance" · "surround selected with a lane called Picking".

Each of these refuses rather than guessing when it cannot do the job cleanly — a sequence flow that would cross a pool boundary, or an unselected element that would be swept into the new lane, is named in the log so you can include it or disconnect it.$UG$),

  (5, 'Green numbers — picking from a list', $UG$Some commands are easier by number than by name, especially when several elements are similarly named.

- **"rename tasks"** (or lanes, pools, gateways, events) puts a green number on every element of that kind. Say **"3 Approve Order"** to rename number 3 in one breath, or say **"3"**, wait for it to highlight, then dictate the name.
- **"add a message"** with no ends numbers everything a message can start or end at — tasks, subprocesses, black-box pools and events. Say **"3 to 7 labelled Order Placed"**.
- **"label connectors"** numbers the connectors; then "3 No".
- If a name you say matches more than one element, the numbers appear by themselves and you pick — rather than the command guessing and quietly doing the wrong thing.

Where the numbers sit: below an activity, **above** an event, and in the header just before the name for a pool or lane, moving as the name changes length.

**After a pick, nothing stays selected.** A rename or a move by voice never leaves the item highlighted, so the next thing you say cannot land on it by accident. The one exception is the moment between saying a bare number and saying the name — there the highlight is the cue telling you which one you picked.

Say **"done"** (or "cancel", or press Escape) to leave a numbered pick and keep listening. Say **"stop"** to leave the pick *and* switch the microphone off.$UG$),

  (6, 'Undo, and being asked first', $UG$**One command is one undo.** However many changes a command makes — a task plus its label plus its connector plus a pool that had to grow — "undo that", or Ctrl+Z, reverts the whole command in one step. Moves and nudges undo like everything else.

**Anything that removes more than one thing asks first** and waits for your next utterance:

- "clear the diagram"
- deleting a pool or a lane, and everything inside it
- "delete these" with several selected
- "delete X and compact"

Say **"yes"** ("go ahead", "ok") to run it, **"no"** ("cancel", "never mind") to drop it. Any other command also drops it and runs instead, so you are never stuck. Deleting a single named element still happens immediately — undo is right there.$UG$),

  (7, 'When it mishears you', $UG$Speech recognition is good, not perfect, and a process diagram is full of proper nouns it has never seen. Several things work together so a mis-heard word usually still lands:

- The recogniser is told the **names on this diagram** when the microphone opens, so "Reconciliation" and "Back Order" are words it is expecting rather than words it is guessing.
- It is set to **Australian English** and biased toward the command vocabulary.
- Known confusions are corrected automatically: **poll** and **pull** become *pool*, **line** becomes *lane*, and during a numbered pick "one", "won" and "juan" all pick item 1.
- If a name still comes back wrong, it is matched by **how it sounds** — "escalade" finds Escalate, "where house" finds Warehouse — without an AI call.
- When two names sound alike, you are asked which rather than guessed at.

**If a command does not land, say it again in one breath.** Speech arrives in pieces, and the bar holds a piece that is obviously unfinished — a lone verb, a dangling "to" or "and" or "called" — for up to three short grace periods while it waits for the rest. That is a safety net, not a substitute for saying the whole thing at once.

The header says **connecting…** until the recogniser is live and then **listening…**; anything you say during the handshake is captured and sent once it opens, so the first word is not lost.$UG$),

  (8, 'Voice usage, cost and privacy', $UG$Voice uses a live speech service (Deepgram) that your workspace administrator enables. Audio streams from your browser for transcription; the app stores only a small **usage row per session** — who, how long, which engine — so voice minutes appear in **AI Usage**. The audio itself is not stored.

An open microphone is billed by the minute, so the session **closes itself after 2 minutes idle** and says so in the log. Say **"stop"** (or "that's enough") when you are finished.

If your organisation has not enabled cloud voice, the microphone tells you so rather than quietly using your browser's built-in recognition, which is less accurate and behaves differently. Typing into the bar always works and costs nothing.$UG$)

  ) AS v(ord, heading, body);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Technical Notes — "AI Assist & Voice Assist"
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO "HelpChapter" (id, slug, collection, title, category, "sortOrder", "adminOnly", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'ai-assist', 'tech-design', 'AI Assist & Voice Assist', NULL,
       (SELECT coalesce(max("sortOrder"), 0) + 1 FROM "HelpChapter" WHERE collection = 'tech-design'),
       false, NOW(), NOW()
 WHERE NOT EXISTS (SELECT 1 FROM "HelpChapter" WHERE collection = 'tech-design' AND slug = 'ai-assist');

UPDATE "HelpChapter"
   SET title = 'AI Assist & Voice Assist', "updatedAt" = NOW()
 WHERE collection = 'tech-design' AND slug = 'ai-assist';

DELETE FROM "HelpSection"
 WHERE "chapterId" = (SELECT id FROM "HelpChapter" WHERE collection = 'tech-design' AND slug = 'ai-assist');

INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'tech-design', v.heading, v.body, false, v.ord, NOW(), NOW()
  FROM (SELECT id FROM "HelpChapter" WHERE collection = 'tech-design' AND slug = 'ai-assist') ch,
  (VALUES

  (0, 'Two tiers: rules propose, rules dispose', $TD$Assist is deliberately **hybrid**: everything cheap and deterministic runs client-side with no LLM, and the AI is a fallback for free phrasing only.

- **Placement geometry** is pure and unit-tested (`app/lib/diagram/assistPlacement.ts`): inline (51px, centres aligned), gateway fan-out, boundary near-edge (18px), `findFreeSlot` (nearest slot ≥51px), and the R7 boundary-follow. The constants live in one file so tuning is a one-liner.
- **Legality** reuses the pure `canConnect(source, target, type, elements)` that mirrors the `ADD_CONNECTOR` reducer gauntlet; a parity test keeps the two in agreement, so no suggestion is ever illegal.
- These are the **red** (code-enforced) rules and are never sent to a model. The **green** rules — keyword → action — are admin-editable and injected into the AI prompt.$TD$),

  (1, 'The command interpreter', $TD$A spoken or typed utterance becomes a small **op list** (`app/lib/assist/`):

- `ops.ts` — the `AssistOp` union. References are spoken **names**, resolved at apply time rather than at parse time.
- `commandGrammar.ts` — `parseCommand`, a deterministic regex grammar; returning `null` is what triggers the AI fallback.
- `resolveRef.ts` — the resolution ladder: exact name → kind-stripped → substring → token overlap → bare type noun → pronoun (it / last / previous, by add order) → positional (left/middle/right pool or lane, axis = greatest spread) → **selection** → **phonetic**.
- `serializeDiagram.ts` — a compact id/type/label/parent dump with connections, so the model can resolve references without the geometry.

`applyAssistOps` in `DiagramEditor.tsx` maps ops onto the **granular, history-pushing** reducer helpers rather than `setData`, which would wipe undo. Failures and ambiguity are always reported in the command log; a silent no-op is treated as a bug.$TD$),

  (2, 'One command, one undo', $TD$A single utterance used to push up to five history entries — a task, its label, its connector, the pool that grew — so "undo that" undid a fragment of what the user had just asked for.

`useDiagram.ts` gained `beginHistoryGroup()` / `endHistoryGroup()`: one snapshot is taken on begin, `pushHistory` is suppressed until end, and `applyAssistOps` wraps every command in the pair. Ctrl+Z and "undo that" are then the same thing, which is what the user's mental model already assumed.

The two voice move paths (`move`, `nudgePool`) had a related defect — they called `moveElements` without `elementsMoveEnd`, so a voice move produced no history entry at all and a later mouse drag committed a stale snapshot. Both now end the move properly.$TD$),

  (3, 'The AI fallback route', $TD$`POST /api/ai/command` is the only **incremental** AI path in the product; every other AI route regenerates a whole diagram. It takes `{instruction, state}` and returns a validated `AssistOp[]` delta grounded with the green `aiRules` and the compact serialisation. The `canonical` sentence it returns is re-parsed by the grammar, so the AI never reaches the reducer through a path the grammar has not validated.

Three things keep it cheap and bounded:

- a **dedicated command model** (`ai.command.model`, default Haiku-class, admin-selectable) rather than the expensive generate model, since the job is canonicalising one sentence;
- a **20-second timeout** with an `AbortController`, so a slow provider fails visibly instead of hanging the bar;
- a **serialisation cap** (`COMMAND_SERIALISE_MAX`) that keeps selected elements first, drops connectors whose other end was cut, and states in the payload what it omitted.

The invocation point `LiveCommand` is deliberately **not** in `AI_USER_METERED_POINTS` — a raw attempt only, like `dictation.refine` — so a chatty session does not burn the `aiAttempts` quota. The log colour-codes each entry rule vs ✨ AI.$TD$),

  (4, 'Voice reliability: recogniser and parser, both', $TD$Every keyword boost is a bet against every other word in the language. Boosting the number words to win a numbered pick made "turn on gold flashing" come back as "ten on gold flashing". So reliability is addressed at **both** ends, and neither half has to be perfect.

**At the recogniser** (`app/lib/dictation/diagramKeyterms.ts`): the diagram's own labels are sent as keyterms when the socket opens, because a proper noun is exactly what the recogniser has least chance with. Deliberately timid — **no boost suffix** ever, multi-word phrases preferred, a bare common word never sent, nothing that collides with the command vocabulary, and a cap so the command words are not diluted.

**At the parser** (`app/lib/assist/phonetic.ts`): a compact phonetic key collapses the spellings English uses for one sound and drops the unreliable vowels, with one edit allowed on keys long enough that one letter is not most of the word. It runs **last**, only when every other pass has failed, which is why it can afford to be fuzzy. When several labels sound alike the answer is *ambiguous*, not a guess, and the numbered picker asks.

Measured before it was built: multi-word mis-hears already resolved on token overlap, because one word of two is usually heard correctly. The narrow cases left were a single word mis-heard ("escalade" → Escalate) and a word the recogniser split in two ("where house" → Warehouse).$TD$),

  (5, 'Reducer primitives added for containers', $TD$Voice lane and pool work needed clean single-dispatch primitives, because the pre-existing `ADD_SUBLANE` splits into two on the first call and neither call returns the new id:

- `SPLIT_POOL_EVEN` / `SPLIT_LANE_EVEN` — create **N equal, named** lanes or sublanes in one dispatch, re-parenting a lane's loose children into the first sublane. This sidesteps async id-capture entirely.
- `WRAP_IN_POOL` — wrap all **un-pooled** flow elements in a new pool and single lane sized to contain them; existing pools and their contents are untouched.
- The selection wraps (expanded subprocess, pool, lane) are modelled on `WRAP_IN_POOL` and share its refusal discipline: an unselected element that would be swept into the new container is named and refused, never adopted silently.$TD$),

  (6, 'Gating and metering', $TD$Voice Assist moved off `isActingAdmin` onto the feature registry on 17 September: `useFeatureState("voice-assist")` decides whether the 🪄 button appears, and `gateFeature` on `/api/ai/command` is the half that actually enforces it — anything client-side is only a matter of which buttons show. A SuperAdmin previewing a lower tier is held to that tier as well, or the preview would be a lie.

`isFeatureAvailable` **fails closed**: a missing `FeatureAvailability` row means not available. That is why the September rename of the feature key had to carry the existing per-level states across rather than insert fresh rows — inserting would have switched the feature off for the very customers who already had it.

**Voice metering:** `startDictation` records one `DictationSession` row per session (who, org, engine, seconds) via `sendBeacon` on session end, for both consumers. Deepgram bills the audio; AI Usage surfaces our own minutes-and-sessions-by-engine view under the same filters. The 2-minute idle auto-close exists because an open socket is billed whether or not anyone is speaking.$TD$),

  (7, 'Assist / NL Rules catalog (green)', $TD$The green rules are one editable catalog (`IntentKeywordMap`, generalised): each row is keywords → an action (`suggest-template` | `add-input-data-object` | `add-output-data-object`) plus `diagramType` and `defaultLabel`. Edited at **Admin → Assist / NL Rules**, which also shows the red geometry rules read-only. `matchAssistRules(name, diagramType, catalog, action?)` is the shared, word-boundary matcher.

The command grammar itself stays in code, not in the catalog, because every phrasing it accepts is covered by a test — `app/lib/assist/commandCatalog.ts` is the single list the Commands card, the admin reference page and those tests all read, so a phrasing cannot be advertised without parsing.$TD$)

  ) AS v(ord, heading, body);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Features catalogue — insert, refresh, and publish
-- ════════════════════════════════════════════════════════════════════════════
-- Two rows. `add-features-ai-assist.sql` inserted them under the old name and
-- left them as drafts; this replaces that file's job end to end, so it is safe
-- whether that one ran, the `.ts` ran, or neither did.
-- Insert and refresh in ONE statement, so the wording appears once: the CTE is
-- the source for both halves. The UPDATE cannot see the CTE's own inserts
-- (same snapshot) and does not need to — those rows are inserted with these
-- values already. The publish below is a separate statement and does see them.
WITH feat(ord, name, summary, details) AS (VALUES

  (220, 'AI Assist — Suggest as You Draw',
   $FS$Switch on Assist and the editor suggests the next step, the right template, even the data a task needs — every suggestion validated by the rules engine, so it is always legal and tidily placed.$FS$,
   $FD$- **Ghost next-steps** — select an element and translucent chips suggest what comes next (Task / Decision / End). Press **Tab** or click to accept; it is placed and connected for you, never on top of anything.
- **Boundary events & template fragments** suggested in context — attach an edge-mounted event, or drop in a saved template inline.
- **Content-aware** — name a task "Approve invoice" and it suggests the matching **approval template**; imply a document and it offers an **Output** data object; imply a policy and it offers an **Instructions** input.
- **Always correct** — every suggestion is checked by the same rules engine that governs AI generation, so nothing illegal or badly laid out ever appears.
- **Tunable** — admins edit a keyword → action catalog (Assist / NL Rules); the geometry rules are shown read-only.
- BPMN, opt-in per diagram, **instant and free** for the common cases (no AI call), and **included at every subscription level**.$FD$),

  (230, 'Voice Assist — Voice-Driven Diagramming',
   $FS$Just talk. Say "add a task called Approve after Review", "put a pool around everything", "surround selected with a subprocess called Check Stock" — and watch the diagram build itself, live and undoable.$FS$,
   $FD$- **Speak or type** editing commands; each is applied to the **current** diagram, live, with a log of what it heard and what it did.
- Add, connect, rename, move, nudge and delete elements; attach **boundary events**; create **named lanes and sub-lanes**; **wrap a selection** in a pool, a lane or an expanded subprocess — and unwrap it again; add **message flows**; swap a gateway's connection points; export to JSON.
- **Point at it instead of naming it** — select something and say "rename the selected pool to Customer" or "delete these". The mouse says which, the voice says what, so a name can never be mis-heard.
- **Numbered picking** — "rename tasks" puts green numbers on the diagram; say "3 Approve Order" and it is done in one breath. An ambiguous name raises the same numbers rather than guessing.
- **Built to mishear gracefully** — the recogniser is primed with this diagram's own names, known confusions are corrected automatically, and a name that still comes back wrong is matched by how it sounds, with no AI call.
- **Always reversible, and it asks first** — one command is one undo, and anything that would remove more than one thing waits for a yes.
- **Hybrid and cheap** — common phrasings are interpreted instantly and free; only unusual wording reaches a metered AI, and the log colour-codes which is which.
- The only BPM tool that lets you model a process **by conversation** — hands-free, with a governed rules engine behind every change. Expert subscriptions and above.$FD$)

),
inserted AS (
  INSERT INTO "Feature" (id, name, summary, details, hidden, "sortOrder", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, v.name, v.summary, v.details, false, v.ord, NOW(), NOW()
    FROM feat v
   WHERE NOT EXISTS (SELECT 1 FROM "Feature" f WHERE f.name = v.name)
  RETURNING name
)
-- Refresh the text on a database where an older copy of these rows already
-- exists (the August wording, or the post-rename wording).
UPDATE "Feature" f
   SET summary = v.summary, details = v.details, "sortOrder" = v.ord, hidden = false, "updatedAt" = NOW()
  FROM feat v
 WHERE f.name = v.name;

-- Publish, exactly as "Publish All" does (app/api/admin/features/publish/route.ts):
-- the published* columns are the snapshot /features renders.
UPDATE "Feature"
   SET "publishedName"      = name,
       "publishedSummary"   = summary,
       "publishedDetails"   = details,
       "publishedHidden"    = hidden,
       "publishedSortOrder" = "sortOrder",
       "publishedAt"        = NOW(),
       "updatedAt"          = NOW()
 WHERE name IN ('AI Assist — Suggest as You Draw', 'Voice Assist — Voice-Driven Diagramming');

COMMIT;

-- ── Prove it, in the same paste ─────────────────────────────────────────────
-- Deliberately AFTER the COMMIT, so it reports what was actually committed
-- rather than what the transaction was about to do.
--
-- The Database tile shows the last statement that returned rows, so this is
-- what you will see. Every row should read:
--
--   1  User Guide chapter        present: 1 chapter(s)
--   2  User Guide sections       present: 9 section(s)
--   3  Tech Notes chapter        present: 1 chapter(s)
--   4  Tech Notes sections       present: 8 section(s)
--   5  Mislabelled sections      none — good
--   6  Feature rows (draft)      present: 2
--   7  Feature rows (published)  published: 2
--   8  Old name still present    none — rename complete
--   9  voice-assist availability Expert and Enterprise available
--  10  nl-assist availability    all levels available
--
-- If a row disagrees, nothing here is destructive and the file can be re-run.

SELECT * FROM (
  SELECT 1 AS n, 'User Guide chapter' AS item,
         CASE WHEN count(*) = 0 THEN 'MISSING' ELSE 'present: ' || count(*) || ' chapter(s)' END AS verdict
    FROM "HelpChapter" WHERE collection = 'user-guide' AND slug = 'ai-assist'
  UNION ALL
  SELECT 2, 'User Guide sections',
         CASE WHEN count(*) = 0 THEN 'MISSING' ELSE 'present: ' || count(*) || ' section(s)' END
    FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
   WHERE c.collection = 'user-guide' AND c.slug = 'ai-assist'
  UNION ALL
  SELECT 3, 'Tech Notes chapter',
         CASE WHEN count(*) = 0 THEN 'MISSING' ELSE 'present: ' || count(*) || ' chapter(s)' END
    FROM "HelpChapter" WHERE collection = 'tech-design' AND slug = 'ai-assist'
  UNION ALL
  SELECT 4, 'Tech Notes sections',
         CASE WHEN count(*) = 0 THEN 'MISSING' ELSE 'present: ' || count(*) || ' section(s)' END
    FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
   WHERE c.collection = 'tech-design' AND c.slug = 'ai-assist'
  UNION ALL
  SELECT 5, 'Mislabelled sections',
         CASE WHEN count(*) = 0 THEN 'none — good'
              ELSE 'STILL ' || count(*) || ' — the repair did not take' END
    FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
   WHERE s.collection <> c.collection
  UNION ALL
  SELECT 6, 'Feature rows (draft)',
         CASE WHEN count(*) < 2 THEN 'PARTIAL — ' || count(*) || ' of 2' ELSE 'present: ' || count(*) END
    FROM "Feature"
   WHERE name IN ('AI Assist — Suggest as You Draw', 'Voice Assist — Voice-Driven Diagramming')
  UNION ALL
  SELECT 7, 'Feature rows (published)',
         CASE WHEN count(*) < 2 THEN 'NOT PUBLISHED — ' || count(*) || ' of 2' ELSE 'published: ' || count(*) END
    FROM "Feature"
   WHERE "publishedAt" IS NOT NULL
     AND "publishedName" IN ('AI Assist — Suggest as You Draw', 'Voice Assist — Voice-Driven Diagramming')
  UNION ALL
  SELECT 8, 'Old name still present',
         CASE WHEN count(*) = 0 THEN 'none — rename complete'
              ELSE 'FOUND — run rename-abracadabra-to-voice-assist.sql' END
    FROM (
      SELECT 1 FROM "Feature"
       WHERE name ILIKE '%abracadabra%' OR "publishedName" ILIKE '%abracadabra%'
          OR summary ILIKE '%abracadabra%' OR details ILIKE '%abracadabra%'
      UNION ALL SELECT 1 FROM "HelpChapter" WHERE title ILIKE '%abracadabra%'
      UNION ALL SELECT 1 FROM "HelpSection" WHERE heading ILIKE '%abracadabra%' OR "bodyMarkdown" ILIKE '%abracadabra%'
      UNION ALL SELECT 1 FROM "FeatureAvailability" WHERE "featureKey" = 'abracadabra'
    ) old
  UNION ALL
  SELECT 9, 'voice-assist availability',
         CASE WHEN count(*) = 0 THEN 'NO ROWS — nobody has it'
              ELSE coalesce(string_agg(l.name || '=' || a.state, ', ' ORDER BY l.name), '—') END
    FROM "FeatureAvailability" a JOIN "SubscriptionLevel" l ON l.id = a."levelId"
   WHERE a."featureKey" = 'voice-assist'
  UNION ALL
  SELECT 10, 'nl-assist availability',
         CASE WHEN count(*) = 0 THEN 'NO ROWS — nobody has it'
              ELSE coalesce(string_agg(l.name || '=' || a.state, ', ' ORDER BY l.name), '—') END
    FROM "FeatureAvailability" a JOIN "SubscriptionLevel" l ON l.id = a."levelId"
   WHERE a."featureKey" = 'nl-assist'
) after_seed ORDER BY n;

-- Then open /features (published copy), /dashboard/help (User Guide) and
-- /tech-notes (Technical Notes) to see them.
