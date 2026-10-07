-- BPMN rule R8.45 — an edge-mounted intermediate event (EMIE) on a step inside an Expanded Subprocess never leads out of it.
--
-- Paul, 7 October 2026, on a diagram written with the new prompt skill: "This generated diagram breaks an important rule for
-- EMIEs. An EMIE attached to a child element of an outer parent EP must never be connected to another element outside the
-- parent EP. To achieve the same outcome the EMIE must be placed on the boundary of the parent EP and then it can be connected
-- to an element outside the EP." — and, asked whether a rule existed: none did. The diagram check B41 flags it in the editor, and
-- R3.11 / R8.10 only say which SIDE a boundary event's connector leaves from; nothing said it must not leave the subprocess, and
-- generation produced it.
--
-- The code enforces it (bpmnLayout.ts: the pass that repairs flows crossing an Expanded Subprocess boundary now re-mounts such an
-- event onto the subprocess, after the pass that moves exception-path steps out of it), so the rule belongs in "Group 8:
-- Auto-Layout Placement": a code-backed group, which the rules editor shows RED and which is NOT sent to the AI (splitRules.ts:
-- CODE_REQUIRED_GROUPS). The master prompt template (v8) and the prompt checker say the same thing to whoever writes the prompt.
--
-- One change to one row, DiagramRules id 'default-bpmn' (category 'bpmn'): the line is appended to the end of the text, but ONLY
-- when Group 8 is the LAST group. NEVER A RESEED (see patch-rule-r8-39-start-in-next-lane.sql). Does nothing when R8.45 is already
-- there, or Group 8 is not the last group (the report at the end says so). seed-diagram-rules.cjs carries the same text.
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report at the end, AFTER the commit.

BEGIN;

UPDATE "DiagramRules"
SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.45: An edge-mounted intermediate event (EMIE) on a step INSIDE an Expanded Subprocess NEVER leads to anything outside that Expanded Subprocess. Its rim is inside the subprocess, so a flow leaving it would cross the subprocess boundary. To get the same outcome, mount the EMIE on the Expanded Subprocess itself — on its boundary — and it may then connect to an element outside it (an End event, a following step, a reminder). The steps an exception path reaches that lie outside the subprocess are placed outside it, and a path that returns comes back to the Expanded Subprocess itself, never to a step inside it. Generation re-mounts such an event onto its Expanded Subprocess (the diagram check B41 flags one drawn by hand); an event whose exception path stays inside the subprocess is left where it is.$NEW$,
    "updatedAt" = NOW()
WHERE id = 'default-bpmn' AND category = 'bpmn'
  AND rules NOT LIKE '%R8.45:%'
  AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
      LIKE 'Group 8: Auto-Layout Placement%';

COMMIT;

SELECT CASE
         WHEN rules LIKE '%R8.45:%' THEN 'R8.45 is in the BPMN rules'
         ELSE 'NOT ADDED — Group 8 is not the last group (or the row is missing); add R8.45 by hand in the Diagram Rules editor'
       END AS result
FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn';
