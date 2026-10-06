-- Documentation correction: the person who CREATED a project may delete it — to the Sandpit or the Archive — and that includes an OrgAdmin and
-- includes example projects, renamed or not.
--
-- Paul, 6 October 2026: "Normal and OrgAdmin users need to be able to delete projects (with the diagrams going to the sandpit or archive) they
-- create, and any example projects or renamed example projects." The code is shipped; this brings the DB-held help text into line. It
-- follows patch-orgadmin-project-delete-docs-2026-10-06.sql, so RUN THAT ONE FIRST — this patch changes the wording that one writes (and
-- does nothing where that wording is not there; the report at the end says so).
--
-- Idempotent and safe on the live database: four guarded REPLACEs, each skipped once its new wording is there (or if the section was edited
-- in the app so the old wording is gone). Nothing is inserted or deleted. Run from the in-app Database tile (SuperAdmin -> Database).
-- Read-only report at the end, AFTER the commit.

BEGIN;

-- 1. User Guide > OrgAdmin > "Project tile right-click menu": who sees x and x+.
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(replace(s."bodyMarkdown",
      $A$visible to a SuperAdmin only. Diagrams survive$A$,
      $B$visible to a SuperAdmin or to the person who created the project. Diagrams survive$B$),
      $A$— an OrgAdmin (any project in their Org) or a SuperAdmin. Diagrams move to the system Archive$A$,
      $B$— the person who created the project, an OrgAdmin (any project in their Org) or a SuperAdmin. Diagrams move to the system Archive$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'user-guide' AND c.slug = 'org-admin'
  AND s.heading = 'Project tile right-click menu'
  AND (s."bodyMarkdown" LIKE '%visible to a SuperAdmin only. Diagrams survive%'
    OR s."bodyMarkdown" LIKE '%— an OrgAdmin (any project in their Org) or a SuperAdmin. Diagrams move%');

-- 2. User Guide > OrgAdmin > "What an OrgAdmin can and cannot do".
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(replace(s."bodyMarkdown",
      $A$Anyone, an OrgAdmin included, can still delete their own diagrams.$A$,
      $B$Anyone, an OrgAdmin included, can still delete their own diagrams, and the projects they created — to the Archive or the Sandpit (right-click the project). That includes an example project, renamed or not. Someone else's project is different: an OrgAdmin can delete it only to the Archive.$B$),
      $A$an OrgAdmin can delete a project of their Org **to the Archive**$A$,
      $B$an OrgAdmin can delete **any** project of their Org **to the Archive**$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'user-guide' AND c.slug = 'org-admin'
  AND s.heading = 'What an OrgAdmin can and cannot do'
  AND s."bodyMarkdown" LIKE '%Anyone, an OrgAdmin included, can still delete their own diagrams.%';

-- 3. Technical Notes > Data Protection & Operations > "Archive & three-tier delete".
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(replace(s."bodyMarkdown",
      $A$`x` (diagrams → Unorganised, SuperAdmin only)$A$,
      $B$`x` (diagrams → Unorganised / the Sandpit, SuperAdmin or the project's creator)$B$),
      $A$SuperAdmin or an OrgAdmin of the project's Org), `x++`$A$,
      $B$SuperAdmin, the project's creator, or an OrgAdmin of the project's Org), `x++`$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'tech-design' AND c.slug = 'data-ops'
  AND s.heading = 'Archive & three-tier delete'
  AND s."bodyMarkdown" LIKE '%`x` (diagrams → Unorganised, SuperAdmin only)%';

-- 4. Technical Notes > Identity, Multi-tenancy & Access > "One Org administration role, and who may delete".
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(replace(s."bodyMarkdown",
      $A$`x` SuperAdmin only; `x+` SuperAdmin or an OrgAdmin of the project's Org (the diagrams go to the Archive, under their Org and owner)$A$,
      $B$`x` SuperAdmin or the project's creator (the diagrams go to the Sandpit); `x+` SuperAdmin, the project's creator, or an OrgAdmin of the project's Org (the diagrams go to the Archive, under their Org and owner)$B$),
      $A$A member who is not an OrgAdmin has no project delete at all, and the dashboard's right-click menu offers them none.$A$,
      $B$"The creator" is `Project.userId` — an adopted example is its adopter's own, renamed or not — and is NOT the implicit ownership an OrgAdmin has over every project in the Org (`authorizeProjectDelete` takes `isOwnProject` separately). Someone who did not create the project and is not an OrgAdmin has no project delete at all, and the dashboard's right-click menu offers them none.$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'tech-design' AND c.slug = 'identity-access'
  AND s.heading = 'One Org administration role, and who may delete'
  AND s."bodyMarkdown" LIKE '%`x` SuperAdmin only; `x+` SuperAdmin or an OrgAdmin of the project''s Org%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit.
-- ════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Project tile right-click menu' AND "bodyMarkdown" LIKE '%the person who created the project, an OrgAdmin%') AS menu_fixed,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'What an OrgAdmin can and cannot do' AND "bodyMarkdown" LIKE '%and the projects they created%') AS creator_added,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'tech-design' AND heading = 'Archive & three-tier delete' AND "bodyMarkdown" LIKE '%SuperAdmin or the project''s creator%') AS tiers_fixed,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'tech-design' AND heading = 'One Org administration role, and who may delete' AND "bodyMarkdown" LIKE '%`x` SuperAdmin or the project''s creator%') AS tech_fixed,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection" WHERE "bodyMarkdown" LIKE '%`x` SuperAdmin only; `x+`%' OR "bodyMarkdown" LIKE '%diagrams → Unorganised, SuperAdmin only)%') = 0
    THEN 'OK — no help text still says the Sandpit delete is for a SuperAdmin only'
    ELSE 'CHECK — some text still has the old wording: run patch-orgadmin-project-delete-docs-2026-10-06.sql first, then this one (or the section was edited in the app, so edit it by hand)'
  END AS verdict;
