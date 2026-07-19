-- Categorise the in-app User Guide (HelpChapter, collection 'user-guide') so the
-- /help viewer's category filter groups the whole guide. SQL mirror of
-- scripts/categorise-user-guide.ts — use whichever fits your prod access
-- (psql, or the SuperAdmin Database Access tool). Idempotent; safe to re-run.
--
-- Matching is by EXACT chapter title. Titles present in prod but not below stay
-- uncategorised (shown under "General") until set via the editor's Category field.
--
-- NOTE: the qr-* delete is a no-op on prod (those duplicate summary chapters only
-- ever existed on a local DB), but it's kept for parity / safety.

BEGIN;

-- Remove the one-page qr-* summary chapters if any exist (none on prod).
DELETE FROM "HelpChapter" WHERE "collection" = 'user-guide' AND "slug" LIKE 'qr-%';

UPDATE "HelpChapter" SET "category" = 'Getting Started'
WHERE "collection" = 'user-guide' AND "title" IN
  ('Getting Started','Projects & Folders','Diagram Types','Account Settings','Keyboard Shortcuts','Tips & Troubleshooting');

UPDATE "HelpChapter" SET "category" = 'Creating & Editing'
WHERE "collection" = 'user-guide' AND "title" IN
  ('Canvas Basics','Palette & Elements','Connectors & Routing','Select & Connect Protocol','Auto-Connect','Properties Panel',
   'Smart Alignment','Inserting & Removing Space','Drop onto Connector & Delete Healing','Resize Menu','Element Conversion',
   'Edge-Mounted (Boundary) Events','Subprocesses & Linked Diagrams','Templates (BPMN)','Process Colour Themes','AI Diagram Generation');

UPDATE "HelpChapter" SET "category" = 'Diagram Types & Modelling'
WHERE "collection" = 'user-guide' AND "title" IN
  ('Value Chain Diagrams','Process Context Diagrams','Database Domain Diagrams','Import DDL','Logical DDL Generation');

UPDATE "HelpChapter" SET "category" = 'Analysis & Insights'
WHERE "collection" = 'user-guide' AND "title" IN
  ('Value Analysis','Bottleneck Highlighting','Simulating Processes','DiagramatixMINER — Process Mining','Risk & Controls (GRC)','Process Classification (APQC PCF)');

UPDATE "HelpChapter" SET "category" = 'Sharing & Governance'
WHERE "collection" = 'user-guide' AND "title" IN
  ('Collaboration & Review','Process Portal','Entity Lists & Pool/Lane Naming','OrgAdmin','SuperAdmin');

UPDATE "HelpChapter" SET "category" = 'Import, Export & Data'
WHERE "collection" = 'user-guide' AND "title" IN
  ('Import & Export','Backup & Restore','Importing another vendor''s BPMN diagram');

COMMIT;

-- ── Verify ────────────────────────────────────────────────────────────────
-- Distribution:
--   SELECT COALESCE("category", '(none)') AS category, count(*)
--   FROM "HelpChapter" WHERE "collection" = 'user-guide' GROUP BY 1 ORDER BY 1;
-- Anything still uncategorised (prod titles that differ from the list above):
--   SELECT "title" FROM "HelpChapter" WHERE "collection" = 'user-guide' AND "category" IS NULL ORDER BY 1;
