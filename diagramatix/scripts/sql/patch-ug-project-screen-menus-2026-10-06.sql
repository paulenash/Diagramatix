-- User Guide › Projects & Folders: the Project screen's right-click menus, the Move-to-project dialog and the Properties panels.
--
-- Paul, 6 October 2026: on the Project screen the browser's own right-click menu is off and replaced by menus on a diagram, a folder and the
-- project; "Move to project" is one wide, scrolling dialog with a Close button (the Dashboard's Sandpit tiles use it too); and a left-click
-- shows the Project, Folder or Diagram Properties panel — the Diagram panel with the attributes the Diagram screen shows. The code is
-- shipped (T5262); this adds the DB-held User Guide text.
--
-- Idempotent and safe on the live database: each INSERT runs only when its heading is not already in the chapter, and the one wording
-- addition is a guarded REPLACE that does nothing once it is there (or if the section was edited in the app). Nothing is deleted.
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report at the end, AFTER the commit.

BEGIN;

-- ── 1. Right-click menus ──────────────────────────────────────────────────────────────────────────────
INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'user-guide', 'Right-click menus on the project screen',
$UG$On the project screen the browser's own right-click menu is switched off. Right-click a **diagram**, a **folder** or the **project** to get Diagramatix's own menu. (Inside a text box the usual Cut / Copy / Paste menu still works.)

**A diagram** — a row in the navigation tree, or a tile:

- **Open** — opens the diagram in the editor.
- **Rename** — a small box asks for the new name.
- **Clone** — makes a copy in the same project.
- **Move to project…** — opens the Move-to-project window (see below).
- **Delete** — moves the diagram to the archive, after you confirm.

**A folder** — a row in the navigation tree:

- **Rename**, **New Subfolder**.
- **Expand** and **Collapse** — this folder only.
- **Move up** and **Move down** — change its place among the folders beside it (greyed out at the top or bottom).
- **Delete** — greyed out while the folder holds anything; empty it first.

**The project** — the project's name at the top of the navigation tree:

- **Rename**, **New Folder**.
- **Refresh** — reloads the project's tree.
- **Expand all** and **Collapse all** — every folder at once.

On a view-only share the items that change things are greyed out; **Open**, **Expand**, **Collapse**, **Refresh** and the rest still work.$UG$,
false,
COALESCE((SELECT max("sortOrder") FROM "HelpSection" WHERE "chapterId" = ch.id), -1) + 1, NOW(), NOW()
FROM "HelpChapter" ch
WHERE ch.collection = 'user-guide' AND ch.slug = 'projects-folders'
  AND NOT EXISTS (SELECT 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id AND s.heading = 'Right-click menus on the project screen');

-- ── 2. Move to project ────────────────────────────────────────────────────────────────────────────────
INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'user-guide', 'Moving a diagram to another project',
$UG$Choose **Move to project…** on a diagram's right-click menu, or click the **↗** on its tile, and a **Move to project** window opens. It is wide enough to read long project names, and the list **scrolls**; when you have many projects a **filter** box appears at the top. Click the project you want and the diagram moves there. Close the window without moving anything with the **✕** at the top, the **Close** button at the bottom, or **Esc**.

The same window is used for a diagram tile in the **Sandpit** on the Dashboard. A diagram moved out of a project can be put in the Sandpit again by choosing **Sandpit (no project)** at the foot of the list.$UG$,
false,
COALESCE((SELECT max("sortOrder") FROM "HelpSection" WHERE "chapterId" = ch.id), -1) + 1, NOW(), NOW()
FROM "HelpChapter" ch
WHERE ch.collection = 'user-guide' AND ch.slug = 'projects-folders'
  AND NOT EXISTS (SELECT 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id AND s.heading = 'Moving a diagram to another project');

-- ── 3. Properties panels ──────────────────────────────────────────────────────────────────────────────
INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'user-guide', 'Properties panels on the project screen',
$UG$**Left-click** an entry in the navigation tree, or a diagram tile, and the matching **Properties** panel opens on the right. (Double-click a diagram to open it in the editor.) The panel starts folded to a slim tab; clicking an entry opens it, and the **▶** in its corner folds it away again.

- **The project** — its name, description, owner, APQC classification and numbering.
- **A diagram** — every diagram-level attribute the Diagram screen's Properties panel shows: **Title** (Show, Status, Name, Version, Authors, Created and Modified), the diagram it was **generated from** if an AI made it, its **Parent** diagrams, **Purpose** and **Description**, **Database** (Domain diagrams), **Free-form / imported layout** (BPMN), the **Diagram Owner**, **Process Owner**, **Procedure Document** and **Process Classification**, and the lists of **Pain Points**, **Issues** and **Review Comments** it carries. You can change most of these here; the Pain Points, Issues and Review Comments are edited on the canvas.
- **A folder** — a summary of what it holds: where it sits, how many diagrams and subfolders are directly inside it and at all levels below, a count **by diagram type**, when something in it last changed, and its most recently changed diagrams (click one to select it). It is a summary only: rename, add, move and delete a folder from its right-click menu.$UG$,
false,
COALESCE((SELECT max("sortOrder") FROM "HelpSection" WHERE "chapterId" = ch.id), -1) + 1, NOW(), NOW()
FROM "HelpChapter" ch
WHERE ch.collection = 'user-guide' AND ch.slug = 'projects-folders'
  AND NOT EXISTS (SELECT 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id AND s.heading = 'Properties panels on the project screen');

-- ── 4. A pointer from "Folders inside a project" ──────────────────────────────────────────────────────
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(s."bodyMarkdown",
      $A$Drag diagrams between folders, or drag them to the root level.$A$,
      $B$Drag diagrams between folders, or drag them to the root level. Right-click a folder for **New Subfolder**, **Rename**, **Move up / down** and **Delete** (see *Right-click menus on the project screen*).$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'user-guide' AND c.slug = 'projects-folders'
  AND s.heading = 'Folders inside a project'
  AND s."bodyMarkdown" LIKE '%Drag diagrams between folders, or drag them to the root level.%'
  AND s."bodyMarkdown" NOT LIKE '%Right-click menus on the project screen%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit.
-- ════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Right-click menus on the project screen') AS menus_rows,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Moving a diagram to another project') AS move_rows,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Properties panels on the project screen') AS panels_rows,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Folders inside a project' AND "bodyMarkdown" LIKE '%Right-click menus on the project screen%') AS pointer_rows,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Right-click menus on the project screen') = 1
     AND (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Moving a diagram to another project') = 1
     AND (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Properties panels on the project screen') = 1
    THEN 'OK — the three new sections are each there once (pointer_rows should be 1; 0 means the "Folders inside a project" text was edited in the app, so add the pointer by hand if you want it)'
    ELSE 'CHECK — a section is missing its chapter (projects-folders), or was edited in the app'
  END AS verdict;
