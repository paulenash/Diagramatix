-- AI Generate on a phone — a User Guide section for mobile voice stage 1.
--
-- Paul, 28 September 2026: "Stage 1 go!!!" — on an empty BPMN diagram on the
-- phone (/m), tap Generate; dictate, type or pick a saved prompt; optionally
-- Tidy it and answer its questions by voice; get the diagram. The run happens
-- on the server, so locking the phone does not lose it.
--
-- Adds ONE section, "Generating on your phone", at the end of the User Guide's
-- "AI Diagram Generation" chapter. Touches nothing else.
--
-- IDEMPOTENT. The INSERT acts only when no section with that heading exists in
-- the chapter, so re-running it is a no-op. Needs no other patch first.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit.

BEGIN;

INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'user-guide', 'Generating on your phone', $UG$On a phone, Diagramatix opens its mobile view. There, an **empty BPMN diagram** can be generated from a description you **speak**, type, or pick from your saved prompts — for example, standing at the whiteboard after a workshop.

1. Open the empty diagram and tap **Generate** (at the top right, or the button in the middle of the screen).
2. Tap **🎤 Speak** and describe the process the way you would to a colleague: who does what, in what order, and any decisions along the way. Tap **Stop** when you are done. You can also type, or edit what was heard. **Saved prompts** starts from one of yours.
3. *(Optional)* Tap **✨ Tidy**. The AI orders your words into clear steps and may ask a few questions about anything unclear. Answer any you can — by speaking (🎤 beside each) or typing. **Undo** puts your own words back.
4. Tap **Generate**.

A generation takes a minute or two. It runs on the server, so you can **lock your phone or leave the screen**: the diagram is saved when it is ready, and when you come back the screen shows it (or, if it is still running, how far it has got). If something goes wrong, the screen says why and your words are kept for another try.

The result is the same as generating on the desktop: your prompt is saved for the diagram (with the plan), the diagram's **version history** has the new version, and you can refine it later in the editor.

Good to know:

- **Who can:** the diagram's owner and editors. Reviewers and viewers are not offered Generate. It needs AI to be allowed by your organisation, and uses one of your AI attempts, as on the desktop.
- **Which diagrams:** BPMN, and only while the diagram is empty. It uses your organisation's default AI model.
- **Speaking:** your words are written down with capitals and full stops, and the AI is told they are one person's spoken description — so it takes the roles from what you say, not from who is speaking. If the microphone will not start, **Mic not working? Test it** in the sheet (or **Microphone test** in the account menu) shows why.$UG$, false,
       COALESCE((SELECT max(s."sortOrder") + 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id), 0), NOW(), NOW()
  FROM (SELECT id FROM "HelpChapter" WHERE collection = 'user-guide' AND slug = 'ai-generate') ch
 WHERE NOT EXISTS (
   SELECT 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id AND s.heading = 'Generating on your phone'
 );

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. `sections` should read 1.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
    WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone') AS sections,
  CASE
    WHEN (SELECT count(*) FROM "HelpChapter" WHERE collection = 'user-guide' AND slug = 'ai-generate') = 0
    THEN 'CHECK — there is no "ai-generate" User Guide chapter in this database; nothing was added'
    WHEN (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
           WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone') = 1
    THEN 'OK — "Generating on your phone" is in the AI Diagram Generation chapter'
    ELSE 'CHECK — expected exactly one "Generating on your phone" section'
  END AS verdict;
