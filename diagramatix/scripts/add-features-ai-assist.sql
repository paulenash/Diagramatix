-- AI Assist + Abracadabra feature-catalog rows (draft). Idempotent.
-- Run in the SuperAdmin Database Manager, then /dashboard/admin/features → Publish All.
BEGIN;

-- AI Assist — Suggest as You Draw
INSERT INTO "Feature" (id, name, summary, details, hidden, "sortOrder", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, $FN$AI Assist — Suggest as You Draw$FN$, $FS$Switch on Assist and the editor suggests the next step, the right template, even the data a task needs — every suggestion validated by the rules engine, so it's always legal and tidily placed.$FS$, $FD$- **Ghost next-steps** — select an element and translucent chips suggest what comes next (Task / Decision / End). Press **Tab** or click to accept; it's placed and connected for you, never on top of anything.
- **Boundary events & template fragments** suggested in context — attach a boundary event, or drop in a saved template inline.
- **Content-aware** — name a task "Approve invoice" and it suggests the matching **approval template**; imply a document and it offers an **Output** data object; imply a policy and it offers an **Instructions** input.
- **Always correct** — every suggestion is checked by the same rules engine that governs AI generation, so nothing illegal or badly laid out ever appears.
- **Tunable** — admins edit a keyword → action catalog (Assist / NL Rules); the geometry rules are shown read-only.
- BPMN, opt-in per diagram, and **instant + free** for the common cases (no AI call).$FD$, false, 220, now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE name = $FN$AI Assist — Suggest as You Draw$FN$);

-- Abracadabra Mode — Voice-Driven Diagramming
INSERT INTO "Feature" (id, name, summary, details, hidden, "sortOrder", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, $FN$Abracadabra Mode — Voice-Driven Diagramming$FN$, $FS$Just talk. Say "add a task called Approve after Review", "put a pool around everything", "delete Prepare and compact" — and watch the diagram build itself, live and undoable.$FS$, $FD$- **Speak or type** editing commands; each is applied to the **current** diagram, live.
- Add / connect / rename / **move** / delete elements; add **boundary events**; create **named lanes & sublanes**; **wrap everything in a pool**; clear; **export to JSON**.
- Refer to elements by **name**, by **type** ("the gateway"), by **position** ("the middle pool"), or with **"it / the last one / the previous one"**.
- **Hybrid + cheap** — common phrasings are interpreted instantly and free; only unusual wording falls back to a metered AI, and the log colour-codes which is which.
- **Always reversible** — every change is undoable; say **"undo that"**, and **"stop"** to finish. Voice minutes appear in **AI Usage**.
- The only BPM tool that lets you model a process **by conversation** — hands-free, with the correctness guarantees of a governed rules engine behind every change.$FD$, false, 230, now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE name = $FN$Abracadabra Mode — Voice-Driven Diagramming$FN$);

COMMIT;
