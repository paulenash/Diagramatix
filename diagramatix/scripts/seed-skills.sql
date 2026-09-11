-- Seed the master Skills list — the SQL equivalent of scripts/seed-skills.ts.
--
-- You do NOT need this. The tsx script takes a DATABASE_URL like every other
-- script in here and is the safer route:
--
--   DATABASE_URL="<prod url>" npx tsx scripts/seed-skills.ts --dry-run
--   DATABASE_URL="<prod url>" npx tsx scripts/seed-skills.ts
--
-- This exists for when a psql session is what you have.
--
-- ⚠ TWO COLUMNS PRISMA FILLS THAT POSTGRES WILL NOT.
--   "id"        — @default(cuid()) is applied by the CLIENT; the column has no
--                 database default at all.
--   "updatedAt" — @updatedAt is likewise application-level, and the column is
--                 NOT NULL with no default.
-- Omit either and every insert fails. Supplied explicitly below. The ids are
-- UUIDs rather than cuids, which is harmless — the column is text and nothing
-- parses the format — but it is why rows seeded this way look different from
-- rows added through the screen.
--
-- INSERT-ONLY, and per-org skipped once ANY skill exists, matching the script.
-- A seed that rewrites a live catalog is the rules-seed incident again:
-- somebody's curated vocabulary replaced by ours, silently, on a deploy.

BEGIN;

-- ── The seed list ──────────────────────────────────────────────────────────
CREATE TEMP TABLE _seed_skills (ord int, name text, category text, description text) ON COMMIT DROP;
INSERT INTO _seed_skills (ord, name, category, description) VALUES
  ( 0, 'Approval Authority',        'Authority',    'Mandated to approve within a defined limit.'),
  ( 1, 'Compliance Accreditation',  'Authority',    'Accredited to sign off a regulated check.'),
  ( 2, 'Payment Authorisation',     'Authority',    'Permitted to release funds.'),
  ( 3, 'Contract Signing',          'Authority',    'Authorised to execute a contract.'),
  ( 4, 'Customer Contact',          'Operational',  'Trained to deal directly with customers.'),
  ( 5, 'Complaint Handling',        'Operational',  NULL),
  ( 6, 'Case Assessment',           'Operational',  NULL),
  ( 7, 'Quality Review',            'Operational',  NULL),
  ( 8, 'Onboarding Administration', 'Operational',  NULL),
  ( 9, 'Payroll Administration',    'Operational',  NULL),
  (10, 'Negotiation',               'Operational',  NULL),
  (11, 'Device Provisioning',       'Technical',    NULL),
  (12, 'System Configuration',      'Technical',    NULL),
  (13, 'Data Analysis',             'Technical',    NULL),
  (14, 'Technical Support',         'Technical',    NULL),
  (15, 'Clinical Assessment',       'Professional', 'Registered clinician.'),
  (16, 'Legal Review',              'Professional', NULL),
  (17, 'Financial Analysis',        'Professional', NULL),
  (18, 'Underwriting',              'Professional', NULL);

-- ── DRY RUN: what would happen, per org ────────────────────────────────────
-- Read this BEFORE the insert below. "would seed" means the org has no skills
-- at all; "skip" means it already has a vocabulary that will not be touched.
SELECT o.name AS org,
       COUNT(s.id) AS existing_skills,
       CASE WHEN COUNT(s.id) = 0
            THEN 'would seed ' || (SELECT COUNT(*) FROM _seed_skills)::text
            ELSE 'skip — already has a list' END AS action
FROM "Org" o
LEFT JOIN "Skill" s ON s."orgId" = o.id
GROUP BY o.id, o.name
ORDER BY o.name;

-- ── THE INSERT ─────────────────────────────────────────────────────────────
-- To dry-run only, ROLLBACK instead of COMMIT at the end and read the SELECT
-- above; nothing below will have been kept.
INSERT INTO "Skill" (id, "orgId", name, category, description, active, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o.id, sk.name, sk.category, sk.description, true, sk.ord, NOW(), NOW()
FROM "Org" o
CROSS JOIN _seed_skills sk
WHERE NOT EXISTS (SELECT 1 FROM "Skill" x WHERE x."orgId" = o.id)
ON CONFLICT ("orgId", name) DO NOTHING;

-- ── What the org lists hold now ────────────────────────────────────────────
SELECT o.name AS org, COUNT(s.id) AS skills
FROM "Org" o
LEFT JOIN "Skill" s ON s."orgId" = o.id
GROUP BY o.id, o.name
ORDER BY o.name;

COMMIT;
