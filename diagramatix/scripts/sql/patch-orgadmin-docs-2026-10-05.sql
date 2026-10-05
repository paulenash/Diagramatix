-- Documentation for the ONE Org administration role (OrgAdmin) and "OrgAdmins delete nothing" — User Guide + Technical Notes.
--
-- Paul, 5 October 2026: Owner and Admin are merged into one role, OrgAdmin; only SuperAdmins delete or restore destructively
-- (an OrgAdmin may restore additively from an Org backup); a user's own delete goes to the archive. The code is shipped
-- (T5252 role merge, T5253 delete lockdown); this brings the DB-held help text into line.
--
-- Idempotent and safe on the live database: each INSERT runs only when its heading is not already in its chapter, and each
-- text correction is a guarded REPLACE that does nothing once the old wording is gone (or if the text was edited in the app).
-- Nothing is deleted. Run from the in-app Database tile (SuperAdmin → Database). Read-only report at the end, AFTER the commit.

BEGIN;

-- ── User Guide › OrgAdmin: corrections to existing wording ─────────────────────────────────────────
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(s."bodyMarkdown", $A$(Org Owner or Org Admin role)$A$, $B$(the one Org administration role)$B$), "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'user-guide' AND c.slug = 'org-admin'
  AND s."bodyMarkdown" LIKE '%(Org Owner or Org Admin role)%';

UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(replace(s."bodyMarkdown",
      $A$visible to the project Owner or an OrgAdmin. Diagrams survive$A$,
      $B$visible to the project Owner (and to a SuperAdmin). Diagrams survive$B$),
      $A$— OrgAdmin only. Diagrams move to the system Archive$A$,
      $B$— a SuperAdmin, or the project Owner who is an OrgAdmin. Diagrams move to the system Archive$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'user-guide' AND c.slug = 'org-admin'
  AND s.heading = 'Project tile right-click menu'
  AND s."bodyMarkdown" LIKE '%visible to the project Owner or an OrgAdmin%';

-- ── User Guide › OrgAdmin: what an OrgAdmin can and cannot do ──────────────────────────────────────
INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'user-guide', 'What an OrgAdmin can and cannot do',
$UG$There is **one** Org administration role: **OrgAdmin**. Where older screens or notes said "Org Owner" and "Org Admin", they meant the same thing.

**An OrgAdmin can** run their Org: see its users and shared projects, change Org settings, create, edit and rename everything on the OrgAdmin screen (entity lists, risk-control libraries, simulation teams, SOP templates, skills, the process classification), assign members to teams, promote or demote other OrgAdmins (the last OrgAdmin cannot be removed), and download an Org backup and **add back** selected projects and diagrams from it. A restore only ever **adds** — it never overwrites or deletes anything.

**An OrgAdmin cannot delete.** Deleting an Org library item, a team, a skill, an entity list or structure, a classification framework, a saved comparison or another person's project, purging the archive, and a destructive restore are all for a **SuperAdmin**. If something needs to go, ask your SuperAdmin; the screen tells you so ("Only a SuperAdmin can delete this").

**Your own work is different.** Anyone, an OrgAdmin included, can still delete their own diagrams and projects. A deleted diagram goes to the **archive**, and its owner can restore it from *Deleted diagrams*; only a SuperAdmin empties the archive.$UG$,
false,
COALESCE((SELECT max("sortOrder") FROM "HelpSection" WHERE "chapterId" = ch.id), -1) + 1, NOW(), NOW()
FROM "HelpChapter" ch
WHERE ch.collection = 'user-guide' AND ch.slug = 'org-admin'
  AND NOT EXISTS (SELECT 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id AND s.heading = 'What an OrgAdmin can and cannot do');

-- ── Technical Notes › Identity, Multi-tenancy & Access: corrections to existing wording ─────────────
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(s."bodyMarkdown", $A$(Owner/Admin within an org, orange accent)$A$, $B$(the one Org administration role, stored as `Admin`, orange accent; an implicit owner of everything in the Org except for deleting it)$B$), "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'tech-design' AND c.slug = 'identity-access'
  AND s.heading = 'Roles & elevation'
  AND s."bodyMarkdown" LIKE '%(Owner/Admin within an org, orange accent)%';

-- ── Technical Notes › Data Protection & Operations: the three delete tiers ──────────────────────────
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(s."bodyMarkdown",
      $A$`x` (diagrams → Unorganised, owner/OrgAdmin/SuperAdmin), `x+` (`?cascade=archive` → system Archive, OrgAdmin), `x++`$A$,
      $B$`x` (diagrams → Unorganised, owner or SuperAdmin), `x+` (`?cascade=archive` → system Archive, SuperAdmin or the owner who is an OrgAdmin), `x++`$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'tech-design' AND c.slug = 'data-ops'
  AND s.heading = 'Archive & three-tier delete'
  AND s."bodyMarkdown" LIKE '%owner/OrgAdmin/SuperAdmin%';

-- ── Technical Notes › Identity, Multi-tenancy & Access: the new section ─────────────────────────────
INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'tech-design', 'One Org administration role, and who may delete',
$TD$**One role.** `app/lib/auth/orgAdminRole.ts` — `ORG_ADMIN_ROLE` (`Admin`), `ORG_ADMIN_ROLES`, `isOrgAdminRole()` — is the only place that asks "is this an Org administrator?". The Postgres enum keeps its `Owner` value (dropping an enum value is risky for no gain) but nothing writes it; until `scripts/sql/patch-orgrole-owner-to-admin.sql` has converted existing rows a stray `Owner` still counts. It is displayed as "OrgAdmin" (`orgRoleLabels.ts`). New Orgs, domain auto-join and the SuperAdmin Org set-up create `Admin`. A test (T5252) fails when any file under `app/` compares a role with `"Owner"`.

**OrgAdmins delete nothing; only SuperAdmins delete or restore destructively.** `app/lib/auth/deleteRules.ts`:

- `superAdminOnlyDelete()` — first line of every Org-level DELETE (PCF frameworks and nodes, entity lists, structures, risk-control libraries / items / links, simulation teams, SOP templates at Org level, skills).
- `orgAdminCannotDelete({ projectId | diagramId })` — first line of every project / diagram DELETE. `getProjectAccess` / `getDiagramAccess` report `viaOrgAdmin` when the caller is an implicit owner ONLY because they are an OrgAdmin of the Org (`adminElevationFor` separates `superadmin` from `orgadmin`); the real owner and a SuperAdmin pass. The refusal is a 403 carrying a structured `notice` (`kind: "policy"`), which pages show through `showGateNotice`.
- Reviewed exemptions (managing who is where, not deleting data): demoting an OrgAdmin (`orgs/[id]/admins/[userId]`, last-admin guard kept) and assigning / unassigning a team member (`orgs/[id]/member-teams`).
- **Ratchet:** a test (T5253) fails when a DELETE handler under `orgs/**` or `projects/**` neither calls a guard, nor is SuperAdmin-only itself, nor is on the exempt list.
- **Archive:** a user's own delete of a diagram moves it to the system archive (`app/lib/archive.ts`); the owner lists and restores their own (`/api/diagrams/deleted`); purging the archive and restoring other people's is SuperAdmin-only (`/api/admin/archive`). The OrgAdmin Org-backup restore is **additive only** (`restoreOrgBackupAdditive`, no wipe mode); the full wipe restore is SuperAdmin-only.
- **Project delete tiers** (`authorizeProjectDelete`): `x` owner or SuperAdmin; `x+` SuperAdmin or the owner who is an OrgAdmin; `x++` SuperAdmin who owns it.

Tests: T5252 (role), T5253 (delete lockdown, ratchet, OrgAdmin screen text).$TD$,
false,
COALESCE((SELECT max("sortOrder") FROM "HelpSection" WHERE "chapterId" = ch.id), -1) + 1, NOW(), NOW()
FROM "HelpChapter" ch
WHERE ch.collection = 'tech-design' AND ch.slug = 'identity-access'
  AND NOT EXISTS (SELECT 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id AND s.heading = 'One Org administration role, and who may delete');

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit.
-- ════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'What an OrgAdmin can and cannot do') AS user_guide_rows,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'tech-design' AND heading = 'One Org administration role, and who may delete') AS tech_notes_rows,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%(Org Owner or Org Admin role)%') AS old_intro_left,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'tech-design' AND "bodyMarkdown" LIKE '%owner/OrgAdmin/SuperAdmin%') AS old_tiers_left,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'What an OrgAdmin can and cannot do') = 1
     AND (SELECT count(*) FROM "HelpSection" WHERE collection = 'tech-design' AND heading = 'One Org administration role, and who may delete') = 1
    THEN 'OK — both new sections are there once; any old-wording counts above should be 0 (a non-zero count means that text was edited in the app and needs a hand edit)'
    ELSE 'CHECK — a section is missing its chapter (org-admin / identity-access), or was edited in the app'
  END AS verdict;
