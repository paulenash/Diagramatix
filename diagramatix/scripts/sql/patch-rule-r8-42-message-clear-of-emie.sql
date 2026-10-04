-- BPMN rule R8.42 — a message flow never attaches inside an edge-mounted intermediate event (EMIE).
--
-- Paul, 5 October 2026, on an AI-generated diagram ("new diagram from phone image 1"): the message from "Request customer
-- onboarding" to the Customer pool started at the middle of the task's top edge — exactly where the "No response in 2
-- business days" timer is mounted — so the line began under the event. "I need a new Red Rule to prevent a message endpoint
-- anywhere inside an EMIE on the same boundary."
--
-- The code enforces it (endpointSpread.ts keep-out zones — generation, editing and the repair on open — and the
-- layoutViolations check), so the rule belongs in "Group 8: Auto-Layout Placement": a code-backed group, which the rules
-- editor shows RED and which is NOT sent to the AI (splitRules.ts: CODE_REQUIRED_GROUPS).
--
-- One change to one row, DiagramRules id 'default-bpmn' (category 'bpmn'): the line is appended to the end of the text, but
-- ONLY when Group 8 is the LAST group. NEVER A RESEED (see patch-rule-r8-39-start-in-next-lane.sql). Does nothing when R8.42
-- is already there, or Group 8 is not the last group (the report at the end says so). seed-diagram-rules.cjs carries the same
-- text. Run from the in-app Database tile (SuperAdmin → Database). Read-only report at the end, AFTER the commit.

BEGIN;

UPDATE "DiagramRules"
SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.42: A message flow NEVER attaches inside an edge-mounted intermediate event (EMIE). Where a message leaves or arrives on the boundary of an Activity on which an EMIE is mounted, its attachment point is moved along that boundary until it is clear of the event (at least 3 px beyond its edge), so the line never starts under the event. This applies to generation, to editing and to repairing a saved diagram when it is opened.$NEW$,
    "updatedAt" = NOW()
WHERE id = 'default-bpmn' AND category = 'bpmn'
  AND rules NOT LIKE '%R8.42:%'
  AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
      LIKE 'Group 8: Auto-Layout Placement%';

COMMIT;

SELECT CASE
         WHEN rules LIKE '%R8.42:%' THEN 'R8.42 is in the BPMN rules'
         ELSE 'NOT ADDED — Group 8 is not the last group (or the row is missing); add R8.42 by hand in the Diagram Rules editor'
       END AS result
FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn';
