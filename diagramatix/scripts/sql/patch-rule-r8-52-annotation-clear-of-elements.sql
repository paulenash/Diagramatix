-- BPMN rule R8.52 — a text annotation never sits over another element.
--
-- Paul, 8 October 2026, on "General Email Processing": "AI Generation can sometimes create annotations but they can appear over the top of
-- other elements. Correct this." The annotation "Update within the specified time" was drawn over the data store "Approvals Spreadsheet".
--
-- The code enforces it (bpmnLayout.ts, R8.52, a late pass on final geometry), so the rule belongs in "Group 8: Auto-Layout Placement": a
-- code-backed group, which the rules editor shows RED and which is NOT sent to the AI (splitRules.ts: CODE_REQUIRED_GROUPS).
--
-- ONE statement, so the result row can say what happened:
--   ALREADY APPLIED  — R8.52 was in the BPMN rules before this ran; nothing changed.
--   APPLIED NOW      — R8.52 was added by this run.
--   NOT APPLIED      — Group 8 is not the last group (or the row is missing); add it by hand in the Diagram Rules editor.
-- Safe to run any number of times. Appends to DiagramRules id 'default-bpmn' only, and ONLY when Group 8 is the LAST group.
-- NEVER A RESEED (see patch-rule-r8-39-start-in-next-lane.sql). Run patch-rule-r8-51 first. seed-diagram-rules.cjs carries the same text.
-- Run from the in-app Database tile (SuperAdmin → Database).

WITH before AS (
  SELECT id, (rules LIKE '%R8.52:%') AS had
  FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn'
), upd AS (
  UPDATE "DiagramRules"
  SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.52: A text annotation never sits over another element. The annotation is placed once, early, next to the element it describes; if that spot ends up on another element once the diagram has settled, the annotation moves to the nearest clear spot around its target (above, below, right, left, then along the edge and further out), stays inside its container, and its association line is re-pointed at the side it now faces. An annotation that is already clear is left exactly where it is.$NEW$,
      "updatedAt" = NOW()
  WHERE id = 'default-bpmn' AND category = 'bpmn'
    AND rules NOT LIKE '%R8.52:%'
    AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
        LIKE 'Group 8: Auto-Layout Placement%'
  RETURNING id
)
SELECT CASE
         WHEN NOT EXISTS (SELECT 1 FROM before) THEN 'NOT APPLIED — the BPMN rules row (default-bpmn) was not found'
         WHEN (SELECT had FROM before)          THEN 'ALREADY APPLIED — R8.52 was already in the BPMN rules; nothing changed'
         WHEN EXISTS (SELECT 1 FROM upd)        THEN 'APPLIED NOW — R8.52 was added to the BPMN rules'
         ELSE 'NOT APPLIED — Group 8 is not the last group; add R8.52 by hand in the Diagram Rules editor'
       END AS result;
