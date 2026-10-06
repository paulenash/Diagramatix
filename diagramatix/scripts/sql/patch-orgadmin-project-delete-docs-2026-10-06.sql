-- Documentation correction: an OrgAdmin MAY delete a project — to the Archive. A member who is not an OrgAdmin may not delete one at all.
--
-- Paul, 6 October 2026: "as long as the diagrams go to the Archive under the Org and User [OrgAdmins] should have this capability. Of
-- course SuperAdmin has all options"; "OrgAdmin should NOT have access to Hard delete"; "Normal users … should not be able to see them OR
-- use them". The code is shipped (T5254); this brings the DB-held help text — which patch-orgadmin-docs-2026-10-05.sql wrote the other way
-- round — into line.
--
-- Idempotent and safe on the live database: five guarded REPLACEs, each skipped once its new wording is there (or if the section was edited
-- in the app so the old wording is gone). Nothing is inserted or deleted. Run from the in-app Database tile (SuperAdmin → Database).
-- Read-only report at the end, AFTER the commit.

BEGIN;

-- 1. User Guide › OrgAdmin › "Project tile right-click menu": who sees x and x+.
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(replace(s."bodyMarkdown",
      $A$visible to the project Owner (and to a SuperAdmin). Diagrams survive$A$,
      $B$visible to a SuperAdmin only. Diagrams survive$B$),
      $A$— a SuperAdmin, or the project Owner who is an OrgAdmin. Diagrams move to the system Archive$A$,
      $B$— an OrgAdmin (any project in their Org) or a SuperAdmin. Diagrams move to the system Archive, under their Org and owner, where they stay recoverable$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'user-guide' AND c.slug = 'org-admin'
  AND s.heading = 'Project tile right-click menu'
  AND (s."bodyMarkdown" LIKE '%visible to the project Owner (and to a SuperAdmin)%'
    OR s."bodyMarkdown" LIKE '%a SuperAdmin, or the project Owner who is an OrgAdmin. Diagrams move%');

-- 2. User Guide › OrgAdmin › "What an OrgAdmin can and cannot do": the one exception.
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(replace(replace(s."bodyMarkdown",
      $A$a saved comparison or another person's project, purging the archive,$A$,
      $B$a saved comparison, purging the archive,$B$),
      $A$are all for a **SuperAdmin**. If something needs to go,$A$,
      $B$are all for a **SuperAdmin**. The one exception is a **project**: an OrgAdmin can delete a project of their Org **to the Archive** (right-click the project, *Delete project (diagrams → Archive)*), and its diagrams stay recoverable under their Org and owner. A hard delete is for a SuperAdmin alone. If something else needs to go,$B$),
      $A$Anyone, an OrgAdmin included, can still delete their own diagrams and projects.$A$,
      $B$Anyone, an OrgAdmin included, can still delete their own diagrams.$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'user-guide' AND c.slug = 'org-admin'
  AND s.heading = 'What an OrgAdmin can and cannot do'
  AND s."bodyMarkdown" NOT LIKE '%The one exception is a **project**%'
  AND s."bodyMarkdown" LIKE '%are all for a **SuperAdmin**. If something needs to go,%';

-- 3. Technical Notes › Data Protection & Operations › "Archive & three-tier delete".
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(s."bodyMarkdown",
      $A$`x` (diagrams → Unorganised, owner or SuperAdmin), `x+` (`?cascade=archive` → system Archive, SuperAdmin or the owner who is an OrgAdmin), `x++`$A$,
      $B$`x` (diagrams → Unorganised, SuperAdmin only), `x+` (`?cascade=archive` → system Archive, under the diagrams' Org and owner: SuperAdmin or an OrgAdmin of the project's Org), `x++`$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'tech-design' AND c.slug = 'data-ops'
  AND s.heading = 'Archive & three-tier delete'
  AND s."bodyMarkdown" LIKE '%SuperAdmin or the owner who is an OrgAdmin%';

-- 4. Technical Notes › Identity, Multi-tenancy & Access › "One Org administration role, and who may delete".
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(s."bodyMarkdown",
      $A$`x` owner or SuperAdmin; `x+` SuperAdmin or the owner who is an OrgAdmin; `x++` SuperAdmin who owns it.$A$,
      $B$`x` SuperAdmin only; `x+` SuperAdmin or an OrgAdmin of the project's Org (the diagrams go to the Archive, under their Org and owner); `x++` SuperAdmin who owns it. A member who is not an OrgAdmin has no project delete at all, and the dashboard's right-click menu offers them none. `orgAdminCannotDelete({ projectId, allowArchive })` lets an OrgAdmin through its first-line guard for the archive tier only.$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'tech-design' AND c.slug = 'identity-access'
  AND s.heading = 'One Org administration role, and who may delete'
  AND s."bodyMarkdown" LIKE '%`x` owner or SuperAdmin; `x+` SuperAdmin or the owner who is an OrgAdmin%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit.
-- ════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Project tile right-click menu' AND "bodyMarkdown" LIKE '%an OrgAdmin (any project in their Org) or a SuperAdmin%') AS menu_fixed,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'What an OrgAdmin can and cannot do' AND "bodyMarkdown" LIKE '%The one exception is a **project**%') AS exception_added,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'tech-design' AND heading = 'Archive & three-tier delete' AND "bodyMarkdown" LIKE '%SuperAdmin or an OrgAdmin of the project''s Org%') AS tiers_fixed,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'tech-design' AND heading = 'One Org administration role, and who may delete' AND "bodyMarkdown" LIKE '%`x` SuperAdmin only; `x+` SuperAdmin or an OrgAdmin%') AS tech_fixed,
  (SELECT count(*) FROM "HelpSection" WHERE "bodyMarkdown" LIKE '%owner who is an OrgAdmin%') AS old_wording_left,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection" WHERE "bodyMarkdown" LIKE '%owner who is an OrgAdmin%') = 0
    THEN 'OK — no help text still says an owner who is an OrgAdmin may archive; every correction above shows 1'
    ELSE 'CHECK — some text still has the old wording (it was edited in the app, so the guarded replace found nothing): old_wording_left is how many; edit those by hand'
  END AS verdict;
