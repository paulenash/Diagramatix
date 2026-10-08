-- BPMN rules R8.47 – R8.50 — silent failure, Terminate End events on exception paths, gateway middle vertices, edge-event spacing.
--
-- Paul, 8 October 2026, on the Application Process capture:
--   R8.47 / R8.48  "Sometimes a generated diagram creates an EMIE on an EP that then has an outgoing connector straight to an End Event.
--                   This is an Issue called 'Silent Failure'. a) There should always be a Task between them … b) These End Events should
--                   always be Terminate End Events as well." (diagram scan checks B56 and B57 report the same two things)
--   R8.49          "The middle vertices of Gateway elements should only be used when 3 connectors are exiting the Gateway or entering a
--                   Gateway Merge."
--   R8.50          "the placement of EMIEs on the same horizontal boundary of an EP needs to allow enough space for this task and end event
--                   so there is enough room for the other EMIE label and outgoing connector" — and the re-mounted EMIE that overlapped the
--                   one already there "should have been placed further left with an Event element width between them".
--
-- The code enforces all four (silentFailure.ts, bpmnLayout.ts), so they belong in "Group 8: Auto-Layout Placement": a code-backed group,
-- which the rules editor shows RED and which is NOT sent to the AI (splitRules.ts: CODE_REQUIRED_GROUPS).
--
-- Four changes to one row, DiagramRules id 'default-bpmn' (category 'bpmn'): each line is appended to the end of the text, but ONLY when
-- Group 8 is the LAST group and the rule is not already there. NEVER A RESEED (see patch-rule-r8-39-start-in-next-lane.sql). Run
-- patch-rule-r8-45 and patch-rule-r8-46 first (they append the same way). seed-diagram-rules.cjs carries the same text.
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report at the end, AFTER the commit.

BEGIN;

UPDATE "DiagramRules"
SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.47: An edge-mounted intermediate event (EMIE) NEVER leads straight to an End event. That is a silent failure: the exception happens and nobody is asked to do anything. A Task always sits between them, so a person can act when the exception occurs before the End event terminates the process. Generation inserts a User task named 'Handle: <the event's name>' between the event and the End event (the diagram scan check B56 flags one drawn by hand).$NEW$,
    "updatedAt" = NOW()
WHERE id = 'default-bpmn' AND category = 'bpmn'
  AND rules NOT LIKE '%R8.47:%'
  AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
      LIKE 'Group 8: Auto-Layout Placement%';

UPDATE "DiagramRules"
SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.48: An End event that finishes an exception path, meaning the flow that hangs off an edge-mounted event and does not rejoin the main line, is a Terminate End event. The exception ends the whole process; it is not one of the process's normal outcomes. Generation sets it (the diagram scan check B57 flags one drawn by hand).$NEW$,
    "updatedAt" = NOW()
WHERE id = 'default-bpmn' AND category = 'bpmn'
  AND rules NOT LIKE '%R8.48:%'
  AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
      LIKE 'Group 8: Auto-Layout Placement%';

UPDATE "DiagramRules"
SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.49: The middle vertices of a gateway (left and right) carry its branches only when THREE connectors leave a decision or enter a merge. A two-way split leaves by its TOP and BOTTOM vertices, the higher target on top, and a two-way merge is entered by its TOP and BOTTOM vertices, the higher source on top, even when one branch runs level with the gateway. A gateway's single entry (a decision) or single exit (a merge) stays on its left or right vertex.$NEW$,
    "updatedAt" = NOW()
WHERE id = 'default-bpmn' AND category = 'bpmn'
  AND rules NOT LIKE '%R8.49:%'
  AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
      LIKE 'Group 8: Auto-Layout Placement%';

UPDATE "DiagramRules"
SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.50: Edge-mounted events on the same horizontal edge of a task or subprocess keep at least 80 px of clear space between them, so there is room for the neighbour's label and for its outgoing connector, task and End event. They never overlap: an event moved onto a subprocess boundary is placed further left, never on top of one already there.$NEW$,
    "updatedAt" = NOW()
WHERE id = 'default-bpmn' AND category = 'bpmn'
  AND rules NOT LIKE '%R8.50:%'
  AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
      LIKE 'Group 8: Auto-Layout Placement%';

COMMIT;

SELECT CASE
         WHEN rules LIKE '%R8.47:%' AND rules LIKE '%R8.48:%' AND rules LIKE '%R8.49:%' AND rules LIKE '%R8.50:%'
           THEN 'R8.47 – R8.50 are in the BPMN rules'
         ELSE 'NOT ALL ADDED — Group 8 is not the last group (or the row is missing); add the missing rules by hand in the Diagram Rules editor'
       END AS result
FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn';
