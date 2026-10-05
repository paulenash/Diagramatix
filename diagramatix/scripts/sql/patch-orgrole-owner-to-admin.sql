-- One Org administration role: convert every existing Owner to Admin (shown as "OrgAdmin").
--
-- Paul, 5 October 2026: "I don't believe we need both an Owner and an Admin for Orgs. Lets just call the new single role
-- OrgAdmin." The code already treated Owner and Admin identically (no billing or other power was ever tied to Owner); this makes
-- the data match. The Postgres enum keeps its `Owner` value (dropping an enum value is risky and gains nothing); nothing writes
-- it any more, and the app still accepts a stray one as an Org administrator, so running this late locks nobody out.
--
-- Safe to run twice (the second run changes nothing). A member who already has an Admin row in the same Org as their Owner row
-- cannot exist (one row per org+user), so there are no clashes. Nothing is deleted. Run from the in-app Database tile
-- (SuperAdmin -> Database). Read-only report at the end, AFTER the commit.

BEGIN;

UPDATE "OrgMember" SET role = 'Admin' WHERE role = 'Owner';

COMMIT;

SELECT CASE
         WHEN (SELECT count(*) FROM "OrgMember" WHERE role = 'Owner') = 0
           THEN 'No Owner rows remain; ' || (SELECT count(*) FROM "OrgMember" WHERE role = 'Admin') || ' OrgAdmin rows'
         ELSE 'Owner rows still present: ' || (SELECT count(*) FROM "OrgMember" WHERE role = 'Owner')
       END AS result;
