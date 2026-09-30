-- BPMN rule R8.39 — the Start Event sits in the lane of the next element.
--
-- Paul, 30 September 2026, on "AI Generation - Event Gateway Test - GPT 6 Luna":
-- "The Start event is shown on the pool boundary. This is quite common. It should
-- be placed in the lane of the next element in the generated process diagram and
-- never on a pool boundary (Create a Red rule to state this)."
--
-- The layout code enforces it (bpmnLayout.ts, "R8.39"), so the rule belongs in
-- "Group 8: Auto-Layout Placement" — a code-backed group, which the rules editor
-- shows RED and which is NOT sent to the AI (splitRules.ts: CODE_REQUIRED_GROUPS).
--
-- One change to one row, DiagramRules id 'default-bpmn' (category 'bpmn'): the new
-- line is appended to the end of the text, but ONLY when Group 8 is the LAST group
-- (so the line lands inside it and not under a group added after it).
--
-- NEVER A RESEED. `seed-diagram-rules.cjs --force` overwrote live rules once (the
-- rules-seed incident); admin edits are saved into this same row. This does nothing
-- when:
--   • R8.39 already exists (re-running is a no-op), or
--   • Group 8 is not the last group — the rule was moved in the app — in which case
--     the report at the end says so and the line can be added by hand in the admin
--     Diagram Rules editor (File → Admin → Diagram Rules).
-- (seed-diagram-rules.cjs carries the same text, so a database seeded from scratch
-- and one patched by this file say the same thing.)
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report at
-- the end, AFTER the commit, so what it shows is what was kept.

BEGIN;

UPDATE "DiagramRules"
SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.39: The Start Event is NEVER drawn on a pool or lane boundary: it sits wholly inside a lane. Where the layout would leave it straddling an edge or outside its lane, it is placed in the lane of the next element in the process (the element its sequence connector leads to), level with that element.$NEW$,
    "updatedAt" = NOW()
WHERE id = 'default-bpmn' AND category = 'bpmn'
  AND rules NOT LIKE '%R8.39:%'
  AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
      LIKE 'Group 8: Auto-Layout Placement%';

COMMIT;

-- Report: 'added' / 'already there' / 'NOT ADDED — Group 8 is not the last group; add R8.39 by hand'.
SELECT CASE
         WHEN rules LIKE '%R8.39:%' THEN 'R8.39 is in the BPMN rules'
         ELSE 'NOT ADDED — Group 8 is not the last group (or the row is missing); add R8.39 by hand in the Diagram Rules editor'
       END AS result
FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn';
