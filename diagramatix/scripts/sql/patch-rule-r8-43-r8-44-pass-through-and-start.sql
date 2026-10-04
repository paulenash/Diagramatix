-- BPMN rules R8.43 and R8.44 — a sequence flow never passes through another element; a Start Event's flow leaves by its right.
--
-- Paul, 5 October 2026, on "AI Generate test": the flow from the Start Event to the first merge gateway left from the Start's
-- bottom (the gateway's left point was free and the two sat on one row), and a loop-back ran through a task. "A sequence
-- connector should never pass through another element except of course if it is inside an EP, in which case it should not
-- pass through another sibling element."
--
-- The code enforces both (bpmnLayout.ts, on final geometry), so they belong in "Group 8: Auto-Layout Placement": a code-backed
-- group, which the rules editor shows RED and which is NOT sent to the AI (splitRules.ts: CODE_REQUIRED_GROUPS).
--
-- One change to one row, DiagramRules id 'default-bpmn' (category 'bpmn'): the lines are appended to the end of the text, but
-- ONLY when Group 8 is the LAST group. NEVER A RESEED (see patch-rule-r8-39-start-in-next-lane.sql). Does nothing when R8.43
-- is already there, or Group 8 is not the last group (the report at the end says so). seed-diagram-rules.cjs carries the same
-- text. Run from the in-app Database tile (SuperAdmin → Database). Read-only report at the end, AFTER the commit.

BEGIN;

UPDATE "DiagramRules"
SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.43: A sequence flow NEVER passes through another element. Its route is drawn round every task, subprocess, event and gateway it is not attached to; inside an Expanded Subprocess it keeps clear of the sibling elements too (the subprocess's own edge is not an obstacle to its own contents). When the first route cuts through an element, the other side pairs are tried and the shortest clear one is used. A Boundary Event's exit side is never changed, and a gateway keeps one flow per vertex.$NEW$ || E'\n' || $NEW$R8.44: In a generated diagram a Start Event's flow leaves by the Start's RIGHT-hand connection point whenever its target lies to its right. A target level with the Start is entered at its LEFT point (for a gateway, when that vertex is free), so the flow is a straight line.$NEW$,
    "updatedAt" = NOW()
WHERE id = 'default-bpmn' AND category = 'bpmn'
  AND rules NOT LIKE '%R8.43:%'
  AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
      LIKE 'Group 8: Auto-Layout Placement%';

COMMIT;

SELECT CASE
         WHEN rules LIKE '%R8.43:%' AND rules LIKE '%R8.44:%' THEN 'R8.43 and R8.44 are in the BPMN rules'
         ELSE 'NOT ADDED — Group 8 is not the last group (or the row is missing); add R8.43 and R8.44 by hand in the Diagram Rules editor'
       END AS result
FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn';
