-- BPMN rule R8.51 — an exception-path step is moved clear of a main-flow connector, instead of the connector being re-routed.
--
-- Paul, 8 October 2026, on the Application Process capture: the flow leaving the merge "Application complete" dropped through the tasks
-- "Handle: Time limit for applicant response exceeded" and "Send reminder to Applicant". "Investigate moving the source element … or the
-- tasks instead of trying to re-route the actual connector. In this case moving the tasks left would also fix the problem." and "you may
-- need to move an element vertically for a horizontal connector issue."
--
-- The code enforces it (bpmnLayout.ts, R8.51), so the rule belongs in "Group 8: Auto-Layout Placement": a code-backed group, which the
-- rules editor shows RED and which is NOT sent to the AI (splitRules.ts: CODE_REQUIRED_GROUPS).
--
-- ONE statement, so the result row can say what happened:
--   ALREADY APPLIED  — R8.51 was in the BPMN rules before this ran; nothing changed.
--   APPLIED NOW      — R8.51 was added by this run.
--   NOT APPLIED      — Group 8 is not the last group (or the row is missing); add it by hand in the Diagram Rules editor.
-- Safe to run any number of times. Appends to DiagramRules id 'default-bpmn' only, and ONLY when Group 8 is the LAST group.
-- NEVER A RESEED (see patch-rule-r8-39-start-in-next-lane.sql). Run patch-rules-r8-47-to-r8-50 first. seed-diagram-rules.cjs carries the
-- same text. Run from the in-app Database tile (SuperAdmin → Database).

WITH before AS (
  SELECT id, (rules LIKE '%R8.51:%') AS had
  FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn'
), upd AS (
  UPDATE "DiagramRules"
  SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.51: A step on an exception path (what hangs off an edge-mounted event) that a main-flow connector runs through is moved clear of it, rather than the connector being re-routed. It moves sideways for a connector that runs vertically through it (left first) and up or down for one that runs horizontally through it, by the smallest move that clears the connector by 14 px, keeps 10 px from every other element and stays inside its lane.$NEW$,
      "updatedAt" = NOW()
  WHERE id = 'default-bpmn' AND category = 'bpmn'
    AND rules NOT LIKE '%R8.51:%'
    AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
        LIKE 'Group 8: Auto-Layout Placement%'
  RETURNING id
)
SELECT CASE
         WHEN NOT EXISTS (SELECT 1 FROM before) THEN 'NOT APPLIED — the BPMN rules row (default-bpmn) was not found'
         WHEN (SELECT had FROM before)          THEN 'ALREADY APPLIED — R8.51 was already in the BPMN rules; nothing changed'
         WHEN EXISTS (SELECT 1 FROM upd)        THEN 'APPLIED NOW — R8.51 was added to the BPMN rules'
         ELSE 'NOT APPLIED — Group 8 is not the last group; add R8.51 by hand in the Diagram Rules editor'
       END AS result;
