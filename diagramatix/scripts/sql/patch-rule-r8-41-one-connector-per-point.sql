-- BPMN rule R8.41 — no two sequence or message connectors on one attachment point.
--
-- Paul, 3 October 2026: "Whenever any connector is created on a diagram, manually, using any Assist feature, or AI
-- generated in any of the generation contexts, or when re-routing … never allow 2 connectors (sequence or message) to
-- attach to the same source or target endpoint, but avoid connectors crossing each other." Built in five slices
-- (new features/connector-endpoints-plan-2026-10-03.md): the allocator (endpointSpread.ts), generation, the editor, NL
-- Assist, and heal-on-load.
--
-- The code enforces it, so the rule belongs in "Group 8: Auto-Layout Placement" — a code-backed group, which the rules
-- editor shows RED and which is NOT sent to the AI (splitRules.ts: CODE_REQUIRED_GROUPS). It replaces three separate
-- code rules that only covered generation (R5.06 messages, R8.11 sequence ends, R8.12 clearance), which carried no
-- seeded text.
--
-- One change to one row, DiagramRules id 'default-bpmn' (category 'bpmn'): the line is appended to the end of the
-- text, but ONLY when Group 8 is the LAST group (so the line lands inside it and not under a group added after it).
--
-- NEVER A RESEED. `seed-diagram-rules.cjs --force` overwrote live rules once (the rules-seed incident); admin edits are
-- saved into this same row. This does nothing when:
--   • R8.41 already exists (re-running is a no-op), or
--   • Group 8 is not the last group — the rule was moved in the app — in which case the report at the end says so and
--     the line can be added by hand in the admin Diagram Rules editor.
-- (seed-diagram-rules.cjs carries the same text, so a database seeded from scratch and one patched by this file say the
-- same thing.)
--
-- This file ALSO adds one section to the User Guide ("Connectors & Routing") and one to the Technical Notes ("Diagram
-- Model & Canvas"), each only when its heading is not already there.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report at the end, AFTER the commit.

BEGIN;

UPDATE "DiagramRules"
SET rules = rtrim(rules, E' \r\n') || E'\n' || $NEW$R8.41: No two sequence or message connectors attach at the same point of an Activity (task, subprocess, expanded subprocess) or an Event, whether both leave, both arrive, or one of each. Connectors that would share a point are spread along that side, about 8 px apart on an Activity, 3 px on an Event, and 24 px apart for message flows on an Activity, in the order of the elements they reach, flipped only where that avoids a crossing; a connector alone on its side stays in the middle. A Gateway is exempt: its connectors use its four vertices (R6.29, R6.33). The rule applies however a connector is made or moved: drawing it, dragging an end, NL Assist, a template, AI generation, and moving or resizing an element; only the connectors a change touches move, and a point placed by hand or a route shaped by hand is never moved. When a saved diagram is opened, connectors that share a point are separated, flashed green, and one Undo restores the saved drawing. A diagram generated from an image, or imported, stays exactly as drawn.$NEW$,
    "updatedAt" = NOW()
WHERE id = 'default-bpmn' AND category = 'bpmn'
  AND rules NOT LIKE '%R8.41:%'
  AND (regexp_split_to_array(rules, E'\n## '))[cardinality(regexp_split_to_array(rules, E'\n## '))]
      LIKE 'Group 8: Auto-Layout Placement%';

-- ── User Guide: Connectors & Routing ───────────────────────────────────────────────────────────────
INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'user-guide', 'One connector per attachment point',
$UG$Two sequence or message connectors never attach at the same point of a task, a subprocess or an event. Where two would, Diagramatix spreads them along that side — about **8 px** apart on a task or subprocess, **3 px** on an event, and **24 px** apart for message flows on a task — in the order of the elements they reach, so they do not cross. A connector alone on its side stays in the middle. A gateway keeps its four points.

It applies however a connector is made or moved: drawing it, dragging an end, NL Assist, a template, AI generation, moving or resizing an element. **Only the connectors your change touched move** — the others stay where they are. A point you placed yourself, and a route you shaped by hand, are never moved.

**Opening an older diagram.** If an older BPMN diagram has connectors on one point, they are separated when it is opened: the changed connectors **flash green** and a note says how many. **Undo** (Ctrl+Z) puts the diagram back exactly as it was saved. Diagrams generated from an image, or imported from BPMN XML or Visio, are left exactly as drawn.$UG$,
false,
COALESCE((SELECT max("sortOrder") FROM "HelpSection" WHERE "chapterId" = ch.id), -1) + 1, NOW(), NOW()
FROM "HelpChapter" ch
WHERE ch.collection = 'user-guide' AND ch.slug = 'connectors'
  AND NOT EXISTS (SELECT 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id AND s.heading = 'One connector per attachment point');

-- ── Technical Notes: Diagram Model & Canvas ────────────────────────────────────────────────────────
INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'tech-design', 'Connector attachment points — one allocator',
$TD$**One rule, one place.** `app/lib/diagram/endpointSpread.ts` — `spreadEndpoints(elements, connectors, { relaxed, frozen })` — decides where sequence and message connector ends sit on Activities and Events. It is pure, returns new `sourceOffsetAlong` / `targetOffsetAlong` plus the ids it changed (the caller re-routes them), and is idempotent. Everything else calls it.

- **Spacing** (`SPREAD`): Activity gap 5 / step 8 / margin 6 px; Event gap 2 / step 3 / margin 4; a message on an Activity 24, on an Event 3; a pool face 24 px from Tasks, 3 px from Events. Collision tolerance 0.25 px, because later passes recompute an offset from a world x (a 24 px gap arrives as 23.9).
- **Order and crossings.** Ends on one face are ordered by the other end's position along the face; up to four ends, every order is tried and the one with fewest crossings (computed on the real routes) wins, ties keeping the order by target position.
- **Messages.** A message's spine is one world x shared by both ends, so it is moved at its Activity / Event end and the pool end follows. A pool face where several messages must fit is solved as a bounded 1-D separation. The router (`routing.ts` `eventSpineX`, and `messageBpmnWaypoints`) honours an offset on an Event only within ±4 px of the centre; a larger stored offset is an old diagram's arbitrary value and still means "the centre".
- **Out of scope:** gateway ends (R6.29/R6.33), associations, and — in the editor — a route shaped by hand (nine or more waypoints: re-fitting one stub leaves a slanted segment).
- **Generation** (`bpmnLayout.ts`) calls it twice — where the old R5.06 / R8.11 / R8.12 loops were, and just before routes are drawn, because the R8.14–R8.18 passes move elements. Image import (`layoutBpmnPreserved`) does not.
- **The editor** (`spreadPass.ts`, last in `reducerWithPasses`): only the connectors an action TOUCHED may move — new, attached differently, or on an element that moved or was resized; a label edit touches nothing. Every other connector is **frozen**: it counts as occupied and the touched ones are placed round it. Not run on `SET_DATA` (undo, redo, load restore exactly) or `APPLY_TEMPLATE` (a template's flows keep their saved routes). A moved connector's label goes with it.
- **Heal on load** (`healEndpoints`, action `HEAL_ENDPOINTS`, hook `healEndpointsNow`): once per opened BPMN diagram, in the editor only, never read-only; the history snapshot is taken first, so one Undo restores the saved drawing; the changed connectors flash green (`HealFlashOverlay`). Skipped for `relaxedLayout` (image-generated) and `exactAsDrawn` (BPMN XML / Visio imports).
- **Tests:** T5234 (allocator), T5235 (34 corpus diagrams), T5236 (generation), T5237 (editor), T5238 (NL Assist), T5239–T5240 (heal, through the real hook). Rule text: R8.41.$TD$,
false,
COALESCE((SELECT max("sortOrder") FROM "HelpSection" WHERE "chapterId" = ch.id), -1) + 1, NOW(), NOW()
FROM "HelpChapter" ch
WHERE ch.collection = 'tech-design' AND ch.slug = 'diagram-canvas'
  AND NOT EXISTS (SELECT 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id AND s.heading = 'Connector attachment points — one allocator');

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit.
-- ════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn' AND rules LIKE '%R8.41:%') AS rule_rows,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'One connector per attachment point') AS user_guide_rows,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'tech-design' AND heading = 'Connector attachment points — one allocator') AS tech_notes_rows,
  CASE
    WHEN (SELECT count(*) FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn' AND rules LIKE '%R8.41:%') = 1
     AND (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'One connector per attachment point') = 1
     AND (SELECT count(*) FROM "HelpSection" WHERE collection = 'tech-design' AND heading = 'Connector attachment points — one allocator') = 1
    THEN 'OK — R8.41, the User Guide section and the Technical Notes section are each there exactly once'
    WHEN (SELECT count(*) FROM "DiagramRules" WHERE id = 'default-bpmn' AND category = 'bpmn' AND rules LIKE '%R8.41:%') = 0
    THEN 'R8.41 NOT ADDED — Group 8 is not the last group (or the row is missing); add R8.41 by hand in the Diagram Rules editor (the sections above are unaffected)'
    ELSE 'CHECK — see the counts above (a section may be missing its chapter, or have been edited in the app)'
  END AS verdict;
