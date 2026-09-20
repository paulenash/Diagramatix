-- Voice Assist — what content does this database actually hold?
--
-- D1 asks for the User Guide chapter, the Technical Notes chapter and the
-- Features rows to be published on production. Three seed scripts exist for
-- that (`add-guide-ai-assist.ts`, `add-tech-notes-ai-assist.ts`,
-- `add-features-ai-assist.ts`) but whether any of them was ever run against
-- prod is not recorded anywhere, and the rename SQL of 19 September only
-- renamed what it found — so a database that never had the chapters still has
-- none, silently.
--
-- READ-ONLY. Run this in the SuperAdmin ▸ Database tile FIRST, read the
-- `verdict` column, then run `seed-voice-assist-content.sql`.
--
-- Every row below reads "what should be true" against "what is", so the
-- verdict column is the whole answer; the detail columns are there to explain
-- an unexpected one.

SELECT * FROM (

  -- ── 1. The User Guide chapter ─────────────────────────────────────────────
  SELECT 1 AS n, 'User Guide chapter' AS item,
         CASE WHEN count(*) = 0 THEN 'MISSING — seed it'
              ELSE 'present: ' || count(*) || ' chapter(s)' END AS verdict,
         coalesce(string_agg(title || ' [' || slug || ']', ', '), '—') AS detail
    FROM "HelpChapter"
   WHERE collection = 'user-guide' AND slug = 'ai-assist'

  UNION ALL
  SELECT 2, 'User Guide sections',
         CASE WHEN count(*) = 0 THEN 'MISSING — seed it'
              WHEN count(*) < 5 THEN 'PARTIAL — ' || count(*) || ' of 5+'
              ELSE 'present: ' || count(*) || ' section(s)' END,
         coalesce(string_agg(coalesce(s.heading, '(no heading)'), ' | ' ORDER BY s."sortOrder"), '—')
    FROM "HelpSection" s
    JOIN "HelpChapter" c ON c.id = s."chapterId"
   WHERE c.collection = 'user-guide' AND c.slug = 'ai-assist'

  -- ── 2. The Technical Notes chapter ────────────────────────────────────────
  UNION ALL
  SELECT 3, 'Tech Notes chapter',
         CASE WHEN count(*) = 0 THEN 'MISSING — seed it'
              ELSE 'present: ' || count(*) || ' chapter(s)' END,
         coalesce(string_agg(title || ' [' || slug || ']', ', '), '—')
    FROM "HelpChapter"
   WHERE collection = 'tech-design' AND slug = 'ai-assist'

  UNION ALL
  SELECT 4, 'Tech Notes sections',
         CASE WHEN count(*) = 0 THEN 'MISSING — seed it'
              WHEN count(*) < 5 THEN 'PARTIAL — ' || count(*) || ' of 5+'
              ELSE 'present: ' || count(*) || ' section(s)' END,
         coalesce(string_agg(coalesce(s.heading, '(no heading)'), ' | ' ORDER BY s."sortOrder"), '—')
    FROM "HelpSection" s
    JOIN "HelpChapter" c ON c.id = s."chapterId"
   WHERE c.collection = 'tech-design' AND c.slug = 'ai-assist'

  -- ── 3. The denormalised `collection` on sections ──────────────────────────
  -- `HelpSection.collection` is a copy of its chapter's, kept so the bulk-save
  -- PUT can delete a collection's sections without a join. Every
  -- `add-tech-notes-*.ts` seed omits it, so those sections default to
  -- 'user-guide' while hanging off a 'tech-design' chapter. That is not
  -- cosmetic: saving the User Guide runs
  -- `deleteMany({ collection: 'user-guide' })` and would take the Technical
  -- Notes sections with it.
  UNION ALL
  SELECT 5, 'Mislabelled sections',
         CASE WHEN count(*) = 0 THEN 'none — good'
              ELSE 'REPAIR NEEDED — ' || count(*) || ' section(s) would be deleted by a User Guide save' END,
         coalesce(string_agg(DISTINCT c.collection || '/' || c.slug, ', '), '—')
    FROM "HelpSection" s
    JOIN "HelpChapter" c ON c.id = s."chapterId"
   WHERE s.collection <> c.collection

  -- ── 4. The Features catalogue ─────────────────────────────────────────────
  UNION ALL
  SELECT 6, 'Feature rows (draft)',
         CASE WHEN count(*) = 0 THEN 'MISSING — seed them'
              WHEN count(*) = 1 THEN 'PARTIAL — 1 of 2'
              ELSE 'present: ' || count(*) END,
         coalesce(string_agg(name, ' | ' ORDER BY "sortOrder"), '—')
    FROM "Feature"
   WHERE name ILIKE '%Voice Assist%' OR name ILIKE '%AI Assist%' OR name ILIKE '%Abracadabra%'

  UNION ALL
  SELECT 7, 'Feature rows (published)',
         CASE WHEN count(*) = 0 THEN 'NOT PUBLISHED — /features shows nothing'
              ELSE 'published: ' || count(*) END,
         coalesce(string_agg("publishedName" || ' @ ' || to_char("publishedAt", 'YYYY-MM-DD'), ' | '), '—')
    FROM "Feature"
   WHERE "publishedAt" IS NOT NULL
     AND ("publishedName" ILIKE '%Voice Assist%' OR "publishedName" ILIKE '%AI Assist%' OR "publishedName" ILIKE '%Abracadabra%')

  -- ── 5. Anything the rename missed ─────────────────────────────────────────
  UNION ALL
  SELECT 8, 'Old name still present',
         CASE WHEN count(*) = 0 THEN 'none — rename complete'
              ELSE 'FOUND — run rename-abracadabra-to-voice-assist.sql' END,
         coalesce(string_agg(src, ', '), '—')
    FROM (
      SELECT 'Feature' AS src FROM "Feature"
       WHERE name ILIKE '%abracadabra%' OR summary ILIKE '%abracadabra%' OR details ILIKE '%abracadabra%'
          OR "publishedName" ILIKE '%abracadabra%' OR "publishedSummary" ILIKE '%abracadabra%' OR "publishedDetails" ILIKE '%abracadabra%'
      UNION ALL SELECT 'HelpChapter' FROM "HelpChapter" WHERE title ILIKE '%abracadabra%'
      UNION ALL SELECT 'HelpSection' FROM "HelpSection" WHERE heading ILIKE '%abracadabra%' OR "bodyMarkdown" ILIKE '%abracadabra%'
      UNION ALL SELECT 'FeatureAvailability' FROM "FeatureAvailability" WHERE "featureKey" = 'abracadabra'
    ) old

  -- ── 6. Who can actually see the feature ───────────────────────────────────
  -- `isFeatureAvailable` fails CLOSED, so a level with no row is a level that
  -- cannot use Voice Assist however the toolbar looks.
  UNION ALL
  SELECT 9, 'voice-assist availability',
         CASE WHEN count(*) = 0 THEN 'NO ROWS — nobody has it'
              ELSE count(*) FILTER (WHERE a.state = 'available') || ' of ' || (SELECT count(*) FROM "SubscriptionLevel") || ' levels available' END,
         coalesce(string_agg(l.name || '=' || a.state, ', ' ORDER BY l.name), '—')
    FROM "FeatureAvailability" a
    JOIN "SubscriptionLevel" l ON l.id = a."levelId"
   WHERE a."featureKey" = 'voice-assist'

  UNION ALL
  SELECT 10, 'nl-assist availability',
         CASE WHEN count(*) = 0 THEN 'NO ROWS — nobody has it'
              WHEN count(*) FILTER (WHERE a.state = 'available') = (SELECT count(*) FROM "SubscriptionLevel")
                THEN 'all levels available — as Paul asked on 19 Sep'
              ELSE 'PARTIAL — ' || count(*) FILTER (WHERE a.state = 'available') || ' of ' || (SELECT count(*) FROM "SubscriptionLevel") END,
         coalesce(string_agg(l.name || '=' || a.state, ', ' ORDER BY l.name), '—')
    FROM "FeatureAvailability" a
    JOIN "SubscriptionLevel" l ON l.id = a."levelId"
   WHERE a."featureKey" = 'nl-assist'

) report ORDER BY n;
