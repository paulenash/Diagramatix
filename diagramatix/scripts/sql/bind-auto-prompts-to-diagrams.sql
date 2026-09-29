-- Bind each existing auto-created "<diagram> — AI prompt" to the diagram it was
-- made for (Prompt.forDiagramId), so an EDITOR's re-generate of the owner's
-- diagram keeps the owner's prompt current — as new prompts already are
-- (2026-09-29; promptLinkDb.ts). Until a prompt is bound, only its owner's
-- re-generates write it, exactly as before.
--
-- ⚠ RUN ONLY AFTER THE DEPLOY THAT ADDS THE "forDiagramId" COLUMN (the deploy
-- applies the schema itself). Run earlier, it stops at once with
-- "NOT YET — …" and changes nothing.
--
-- CONSERVATIVE: a prompt is bound only when ALL of these hold —
--   • it is not bound yet;
--   • exactly ONE diagram links to it (aiGeneration.promptId) — a prompt
--     shared by several diagrams (copies, clones, bundles) is left alone;
--   • that diagram marks it auto-named (aiGeneration.autoNamed = true);
--   • it belongs to the person who created that diagram — the prompt editors
--     may keep current lives only in the diagram owner's own library (a copy
--     or clone in someone else's project never binds another user's prompt);
--   • its name still reads "… — AI prompt" (a renamed one is the user's now).
-- A user's own saved prompt never matches (it is never auto-named).
--
-- IDEMPOTENT: bound prompts are skipped, so re-running it binds nothing more.
-- UTF-8 file (the name pattern has an em-dash).
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'Prompt' AND column_name = 'forDiagramId'
  ) THEN
    RAISE EXCEPTION 'NOT YET — the "forDiagramId" column is not on "Prompt". Run this after the deploy that adds it. Nothing was changed.';
  END IF;

  EXECUTE $sql$
    WITH links AS (
      SELECT d.data->'aiGeneration'->>'promptId' AS pid,
             min(d.id) AS did,
             count(*) AS n,
             bool_and(d.data->'aiGeneration'->>'autoNamed' = 'true') AS auto
        FROM "Diagram" d
       WHERE d.data->'aiGeneration'->>'promptId' IS NOT NULL
       GROUP BY 1
    )
    UPDATE "Prompt" p
       SET "forDiagramId" = l.did
      FROM links l
      JOIN "Diagram" d ON d.id = l.did
     WHERE l.pid = p.id
       AND l.n = 1
       AND l.auto
       AND d."userId" = p."userId"
       AND p."forDiagramId" IS NULL
       AND p.name LIKE '% — AI prompt'
  $sql$;
END
$$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. `still_bindable` should read 0.
-- ════════════════════════════════════════════════════════════════════════════
WITH links AS (
  SELECT d.data->'aiGeneration'->>'promptId' AS pid, min(d.id) AS did, count(*) AS n,
         bool_and(d.data->'aiGeneration'->>'autoNamed' = 'true') AS auto
    FROM "Diagram" d
   WHERE d.data->'aiGeneration'->>'promptId' IS NOT NULL
   GROUP BY 1
)
SELECT
  (SELECT count(*) FROM "Prompt" WHERE "forDiagramId" IS NOT NULL) AS bound_prompts,
  (SELECT count(*) FROM "Prompt" p JOIN links l ON l.pid = p.id JOIN "Diagram" d ON d.id = l.did
    WHERE l.n = 1 AND l.auto AND d."userId" = p."userId" AND p."forDiagramId" IS NULL AND p.name LIKE '% — AI prompt') AS still_bindable,
  (SELECT count(*) FROM "Prompt" p JOIN links l ON l.pid = p.id WHERE l.n > 1) AS shared_left_alone,
  (SELECT count(*) FROM "Prompt" p JOIN links l ON l.pid = p.id JOIN "Diagram" d ON d.id = l.did
    WHERE l.n = 1 AND l.auto AND d."userId" <> p."userId" AND p.name LIKE '% — AI prompt') AS not_the_owners_left_alone,
  CASE
    WHEN (SELECT count(*) FROM "Prompt" p JOIN links l ON l.pid = p.id JOIN "Diagram" d ON d.id = l.did
           WHERE l.n = 1 AND l.auto AND d."userId" = p."userId" AND p."forDiagramId" IS NULL AND p.name LIKE '% — AI prompt') = 0
    THEN 'OK — every auto-named prompt of a diagram''s owner, with one diagram, is bound to it'
    ELSE 'CHECK — some auto-named prompts are still unbound'
  END AS verdict;
