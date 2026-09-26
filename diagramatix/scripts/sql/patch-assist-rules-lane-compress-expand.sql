-- Voice Assist AI rules — "compress lane" and "expand lane".
--
-- Paul, 26 September 2026: "Add commands Compress Lane <lane_name>, and,
-- Expand Lane <lane_name>". The grammar now has both (compressLane,
-- expandLane), and the AI prompt lists them, but the DB-held green rules that
-- are sent with every AI call still say "compress" means a POOL and say
-- nothing about a lane growing. Until they do, "expand lane X" reaching the AI
-- may come back as "extend the pools" — a confident wrong edit.
--
-- Three changes to the one row, DiagramRules id 'default-assist' (category
-- 'assist'):
--   1. V1.01 gains a sentence: with no kind word, a lane's name compresses the
--      lane.
--   2. V1.06 (new, after V1.05): the lane verbs, and that "expand/grow the
--      pools" is still extend.
--   3. V2.06 (new, after V2.05): the geometry Paul chose — the bottom edge
--      moves.
--
-- NEVER A RESEED. `seed-diagram-rules.cjs --force` overwrote live rules once
-- (the rules-seed incident); admin edits are saved into this same row. So each
-- change is a guarded replace() of the exact text it anchors on, and does
-- nothing when:
--   • its new text is already there (re-running is a no-op), or
--   • the anchor is missing — the rule was edited in the app — or a DIFFERENT
--     V1.06 / V2.06 already exists. The report at the end says which, so the
--     line can be added by hand in the admin Diagram Rules editor.
-- (seed-diagram-rules.cjs carries the same text, so a database seeded from
-- scratch and one patched by this file say the same thing.)
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit, so what it shows is what was kept.

BEGIN;

-- 1. V1.01 — a lane's name compresses the lane.
UPDATE "DiagramRules"
SET rules = replace(
      rules,
      $OLD$V1.01: "Compress a pool" also accepts the verbs: compress, shrink, reduce, shorten, compact, collapse (e.g. "shrink the Sales pool").$OLD$,
      $NEW$V1.01: "Compress a pool" also accepts the verbs: compress, shrink, reduce, shorten, compact, collapse (e.g. "shrink the Sales pool"). With no kind word, a LANE's name compresses that lane ("compress Sales" when Sales is a lane) — see V1.06.$NEW$
    ),
    "updatedAt" = NOW()
WHERE id = 'default-assist' AND category = 'assist'
  AND rules LIKE '%V1.01: "Compress a pool" also accepts the verbs: compress, shrink, reduce, shorten, compact, collapse (e.g. "shrink the Sales pool").%'
  AND rules NOT LIKE '%a LANE''s name compresses that lane%';

-- 2. V1.06 — the lane commands' words. Appended after V1.05's line.
UPDATE "DiagramRules"
SET rules = replace(
      rules,
      $OLD$V1.05: When normalising a mis-heard instruction, fix common speech errors: poll/pull -> pool, line -> lane, "lane two" -> Lane 2.$OLD$,
      $NEW$V1.05: When normalising a mis-heard instruction, fix common speech errors: poll/pull -> pool, line -> lane, "lane two" -> Lane 2.
V1.06: "Compress a lane" fits ONE lane or sub-lane to its content: the verbs of V1.01 WITH a lane or sub-lane word ("compress the Sales lane", "compress lane 2", "shrink sublane Manager"). "Make a lane taller": expand, grow or enlarge WITH a lane word ("expand lane Sales", "grow the Sales lane by 100"); with no number it adds one Task row (64px). Without a lane word these are not lane commands: "expand/grow the pools" still means extend (V1.02), and "expand the subprocess" is not a lane at all. A kind word the user said binds: "the Customer lane" never means the Customer pool.$NEW$
    ),
    "updatedAt" = NOW()
WHERE id = 'default-assist' AND category = 'assist'
  AND rules LIKE '%V1.05: When normalising a mis-heard instruction, fix common speech errors: poll/pull -> pool, line -> lane, "lane two" -> Lane 2.%'
  AND rules NOT LIKE '%V1.06:%';

-- 3. V2.06 — what moves (Paul, 2026-09-26: the bottom edge). Appended after V2.05's line.
UPDATE "DiagramRules"
SET rules = replace(
      rules,
      $OLD$V2.05: Extend: all pools are set to the same width and widened rightward to clear the right-most element by a margin; lanes and sub-lanes widen to their pool's new right edge.$OLD$,
      $NEW$V2.05: Extend: all pools are set to the same width and widened rightward to clear the right-most element by a margin; lanes and sub-lanes widen to their pool's new right edge.
V2.06: Compress a lane: its TOP stays; its content moves up to half a Task height below the top, and its bottom comes up to half a Task height below the lowest content — never below what its own name or the pool's name needs, and never taller than it was. The lanes below close up and the pool shrinks; the pools below stay where they are. A lane with sub-lanes is fitted one sub-lane at a time. Expand a lane: it grows at its BOTTOM by one Task row or the distance given; its last sub-lane takes the growth, the lanes below move down, and the pools below are pushed as for any growth.$NEW$
    ),
    "updatedAt" = NOW()
WHERE id = 'default-assist' AND category = 'assist'
  AND rules LIKE '%V2.05: Extend: all pools are set to the same width and widened rightward to clear the right-most element by a margin; lanes and sub-lanes widen to their pool''s new right edge.%'
  AND rules NOT LIKE '%V2.06:%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. Each *_ours column should read true.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "DiagramRules" WHERE id = 'default-assist' AND category = 'assist') AS assist_rows,
  (SELECT bool_or(rules LIKE '%a LANE''s name compresses that lane%') FROM "DiagramRules" WHERE id = 'default-assist') AS v1_01_ours,
  (SELECT bool_or(rules LIKE '%V1.06: "Compress a lane" fits ONE lane%') FROM "DiagramRules" WHERE id = 'default-assist') AS v1_06_ours,
  (SELECT bool_or(rules LIKE '%V2.06: Compress a lane: its TOP stays%') FROM "DiagramRules" WHERE id = 'default-assist') AS v2_06_ours,
  CASE
    WHEN (SELECT count(*) FROM "DiagramRules" WHERE id = 'default-assist' AND category = 'assist') = 0
    THEN 'NOTHING TO PATCH — there is no default-assist rules row in this database'
    WHEN (SELECT bool_and(
            rules LIKE '%a LANE''s name compresses that lane%'
            AND rules LIKE '%V1.06: "Compress a lane" fits ONE lane%'
            AND rules LIKE '%V2.06: Compress a lane: its TOP stays%') FROM "DiagramRules" WHERE id = 'default-assist')
    THEN 'OK — V1.01 edited, V1.06 and V2.06 present'
    WHEN (SELECT bool_or(rules LIKE '%V1.06:%' AND rules NOT LIKE '%V1.06: "Compress a lane" fits ONE lane%') FROM "DiagramRules" WHERE id = 'default-assist')
      OR (SELECT bool_or(rules LIKE '%V2.06:%' AND rules NOT LIKE '%V2.06: Compress a lane: its TOP stays%') FROM "DiagramRules" WHERE id = 'default-assist')
    THEN 'CHECK — a different V1.06 or V2.06 is already there; add the lane rules by hand in the admin Diagram Rules editor'
    ELSE 'CHECK — an anchor is missing (V1.01, V1.05 or V2.05 was edited in the app); add the lane rules by hand in the admin Diagram Rules editor'
  END AS verdict;
