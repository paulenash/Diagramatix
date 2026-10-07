-- BPMN rule R8.46 — where a gateway's outgoing branch labels sit.
--
-- Paul, 7 October 2026: "The labels on outgoing Gateway connector labels need to be more regulated and closer to the actual gateway
-- itself. The best position is as follows: take the point 50px from the gateway vertex along the connector. If it is a top or bottom
-- vertex connector then place the label's text box left edge 30px to the right. If it is a middle vertex connector then place the
-- label's text box bottom edge 30px up. If any of the labels' text then overlap, nudge the top connector label up, the bottom
-- connector label down, until they don't overlap."
--
-- The code enforces it (gatewayBranchLabels.ts, run as the last label pass of layoutBpmnDiagram), so the rule belongs in "Group 8:
-- Auto-Layout Placement": a code-backed group, which the rules editor shows RED and which is NOT sent to the AI (splitRules.ts:
-- CODE_REQUIRED_GROUPS).
--
-- One change to one row, DiagramRules id 'default-bpmn' (category 'bpmn'): the line is appended to the end of the text, but ONLY
-- when Group 8 is the LAST group (R8.45 is appended the same way, so run patch-rule-r8-45-emie-stays-in-its-ep.sql first). NEVER A
-- RESEED (see patch-rule-r8-39-start-in-next-lane.sql). Does nothing when R8.46 is already there, or Group 8 is not the last group
-- (the report at the end says so). seed-diagram-rules.cjs carries the same text.
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report at the end, AFTER the commit.

BEGIN;

UPDATE "DiagramRules"
SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.46: The labels on a gateway's OUTGOING sequence connectors sit close to the gateway, by one rule. Take the point 50 px along the connector from the gateway vertex it leaves by. For a connector leaving the TOP or BOTTOM vertex, the label's text box has its left edge 30 px to the right of that point (beside the line, centred on the point; if the line has already turned horizontal there, just above it for the top branch and just below it for the bottom branch). For a connector leaving a MIDDLE vertex (the side one), the label's text box has its bottom edge 30 px above that point. If the labels of one gateway then overlap, the TOP connector's label is nudged up and the BOTTOM connector's label down until they do not. A label takes this position only where it adds no readability defect (over a task, over another label, along its own horizontal run); otherwise it keeps the position the earlier label passes gave it. Constants: GATEWAY_LABEL_ALONG_OFFSET 50, GATEWAY_LABEL_CLEAR_OFFSET 30, GATEWAY_LABEL_UP_OFFSET 30 (gatewayBranchLabels.ts).$NEW$,
    "updatedAt" = NOW()
WHERE id = 'default-bpmn' AND category = 'bpmn'
  AND rules NOT LIKE '%R8.46:%'
  AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
      LIKE 'Group 8: Auto-Layout Placement%';

COMMIT;

SELECT CASE
         WHEN rules LIKE '%R8.46:%' THEN 'R8.46 is in the BPMN rules'
         ELSE 'NOT ADDED — Group 8 is not the last group (or the row is missing); add R8.46 by hand in the Diagram Rules editor'
       END AS result
FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn';
