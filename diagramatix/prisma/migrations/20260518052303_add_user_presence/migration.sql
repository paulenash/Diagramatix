-- Admin Registered Users presence indicator: track each user's last
-- activity timestamp and the diagram they are currently viewing.
-- All columns nullable so the migration is safe against existing rows.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentDiagramId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentDiagramName" TEXT;
