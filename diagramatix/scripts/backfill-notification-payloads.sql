-- ============================================================================
-- Backfill notification payloads with display fields
-- ----------------------------------------------------------------------------
-- The Notifications page resolves missing sender name/email and diagram name
-- at read time by joining the User / Diagram tables, so it already renders
-- fully without this script. But older notification rows have sparse payloads
-- (e.g. bundle-published from the invite-promotion path stored only fromUserId,
-- not the name/email). This script enriches the stored JSON so the data is
-- self-contained.
--
-- Safe to re-run: each statement only fills fields that are missing/empty.
-- The Notification.payload column is jsonb (Prisma `Json` on PostgreSQL).
--
-- Paste into the Azure Postgres SQL editor (database: diagramatix), run all.
-- ============================================================================

-- 1. Sender name + email, from User, where fromUserId is present but the
--    name/email weren't stored on the payload.
UPDATE "Notification" n
SET payload = jsonb_set(
                jsonb_set(n.payload, '{fromUserName}',  to_jsonb(u.name),  true),
                '{fromUserEmail}', to_jsonb(u.email), true
              )
FROM "User" u
WHERE n.payload ->> 'fromUserId' = u.id
  AND (
        NOT (n.payload ? 'fromUserEmail')
        OR n.payload ->> 'fromUserEmail' IS NULL
        OR n.payload ->> 'fromUserEmail' = ''
        OR n.payload ->> 'fromUserEmail' = '(deleted user)'
      );

-- 2. Diagram name, from Diagram, where diagramId is present but diagramName
--    wasn't stored.
UPDATE "Notification" n
SET payload = jsonb_set(n.payload, '{diagramName}', to_jsonb(d.name), true)
FROM "Diagram" d
WHERE n.payload ->> 'diagramId' = d.id
  AND (
        NOT (n.payload ? 'diagramName')
        OR n.payload ->> 'diagramName' IS NULL
        OR n.payload ->> 'diagramName' = ''
      );

-- 3. bundle-published rows: derive diagramName from the single root diagram
--    (rootDiagramId), so the row shows a diagram link.
UPDATE "Notification" n
SET payload = jsonb_set(n.payload, '{diagramName}', to_jsonb(d.name), true)
FROM "Diagram" d
WHERE n.type = 'bundle-published'
  AND n.payload ->> 'rootDiagramId' = d.id
  AND (
        NOT (n.payload ? 'diagramName')
        OR n.payload ->> 'diagramName' IS NULL
        OR n.payload ->> 'diagramName' = ''
      );

-- 4. Bundle name, from PublicationBundle, where bundleId is present but
--    bundleName wasn't stored.
UPDATE "Notification" n
SET payload = jsonb_set(n.payload, '{bundleName}', to_jsonb(b.name), true)
FROM "PublicationBundle" b
WHERE n.payload ->> 'bundleId' = b.id
  AND (
        NOT (n.payload ? 'bundleName')
        OR n.payload ->> 'bundleName' IS NULL
        OR n.payload ->> 'bundleName' = ''
      );

-- ----------------------------------------------------------------------------
-- Verification — counts of rows still missing each enrichable field.
-- All should trend to 0 (a non-zero remainder means the referenced user /
-- diagram / bundle was deleted, which is expected and handled by the UI).
-- ----------------------------------------------------------------------------
SELECT
  COUNT(*) FILTER (
    WHERE payload ? 'fromUserId'
      AND (NOT (payload ? 'fromUserEmail') OR payload ->> 'fromUserEmail' IN ('', '(deleted user)'))
  ) AS missing_sender_email,
  COUNT(*) FILTER (
    WHERE payload ? 'diagramId'
      AND (NOT (payload ? 'diagramName') OR payload ->> 'diagramName' = '')
  ) AS missing_diagram_name,
  COUNT(*) FILTER (
    WHERE payload ? 'bundleId'
      AND (NOT (payload ? 'bundleName') OR payload ->> 'bundleName' = '')
  ) AS missing_bundle_name
FROM "Notification";
