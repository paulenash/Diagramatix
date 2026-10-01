-- BPMN Green rule — Pool, Lane and Sub-lane names are written with EVERY word capitalised.
--
-- Paul, 1 October 2026: "AI generated names should be fully capitalised, and they normally are at the moment.
-- Perhaps check AI generated Pool and lane names. There may already be a Green rule for that."
--
-- There was not: R4.03 says only that names should MATCH the process description. The model capitalised by habit.
-- Code now enforces it as well (bpmnLayout.ts, containerNamed — whatever the model returns, and names read off an
-- image, are Title Case), so this rule is the model's half: it is told what the code will make of its answer.
--
-- It goes in "Group 4: Naming & Labels", which is NOT a code-backed group, so the editor shows it GREEN and it IS sent
-- to the AI (splitRules.ts: CODE_REQUIRED_GROUPS). One change to one row, DiagramRules id 'default-bpmn':
--   • the new line takes the NEXT free R4.nn number in that row (so it cannot clash with a rule added in the app),
--   • it lands at the end of Group 4, using the same line-break style the text already has (CRLF or LF),
--   • and it does nothing when a rule about "every word capitali…" is already there, or Group 5 cannot be found
--     (the report at the end says which).
--
-- NEVER A RESEED — see patch-rule-r8-39-start-in-next-lane.sql. Run from the in-app Database tile (SuperAdmin →
-- Database). Read-only report at the end, AFTER the commit.

BEGIN;

UPDATE "DiagramRules" r
SET rules = regexp_replace(
      r.rules,
      E'(\r?\n)(\r?\n)## Group 5:',
      E'\\1R4.'
        || lpad((SELECT COALESCE(MAX((m)[1]::int), 0) + 1 FROM regexp_matches(r.rules, E'R4\\.(\\d+):', 'g') AS m)::text, 2, '0')
        || $NEW$: Pool, Lane and Sub-lane names are written with EVERY word capitalised (for example "Claims Processing", "Finance Team", "Customer Service"). Activities, events and gateways keep their own style: only the first word capitalised.$NEW$
        || E'\\1\\2## Group 5:'
    ),
    "updatedAt" = NOW()
WHERE r.id = 'default-bpmn' AND r.category = 'bpmn'
  AND r.rules !~* 'every word capitali'
  AND r.rules ~ E'\r?\n\r?\n## Group 5:';

COMMIT;

-- Report.
SELECT CASE
         WHEN rules ~* 'every word capitali' THEN 'The container-name rule is in the BPMN rules'
         ELSE 'NOT ADDED — Group 5 could not be found as the group after Naming & Labels (or the row is missing); add the rule by hand in the Diagram Rules editor'
       END AS result
FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn';
