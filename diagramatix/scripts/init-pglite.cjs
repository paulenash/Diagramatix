// Initialize PGlite database with schema and seed data
const { PGlite } = require("@electric-sql/pglite");
const bcrypt = require("bcryptjs");

const DB_PATH = "C:/Users/paul/AppData/Local/prisma-dev-nodejs/Data/default/.pglite";

async function init() {
  console.log("Initializing PGlite at", DB_PATH);
  const db = new PGlite(DB_PATH);
  await db.waitReady;
  console.log("PGlite ready");

  // Helper: create type if not exists
  async function createEnum(name, values) {
    try {
      await db.exec(`CREATE TYPE "${name}" AS ENUM (${values.map(v => `'${v}'`).join(",")})`);
    } catch (e) {
      if (!e.message?.includes("already exists")) throw e;
    }
  }

  await createEnum("OrgEntityType", ["ADI","Insurer","LifeInsurer","HealthInsurer","RSE","Other"]);
  await createEnum("OrgRole", ["Owner","Admin","RiskOwner","ProcessOwner","ControlOwner","InternalAudit","BoardObserver","Viewer"]);
  console.log("Enums OK");

  const tables = [
    `CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password TEXT NOT NULL DEFAULT '', "resetToken" TEXT UNIQUE, "resetTokenExpiry" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS "Org" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "entityType" "OrgEntityType" NOT NULL DEFAULT 'Other', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS "OrgMember" (id TEXT PRIMARY KEY, "orgId" TEXT NOT NULL REFERENCES "Org"(id) ON DELETE CASCADE, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, role "OrgRole" NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE("orgId", "userId"))`,
    `CREATE TABLE IF NOT EXISTS "Project" (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', "ownerName" TEXT NOT NULL DEFAULT '', "colorConfig" JSONB NOT NULL DEFAULT '{}', "folderTree" JSONB NOT NULL DEFAULT '{}', "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, "orgId" TEXT NOT NULL REFERENCES "Org"(id), "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS "Diagram" (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'basic', data JSONB NOT NULL DEFAULT '{}', "colorConfig" JSONB NOT NULL DEFAULT '{}', "displayMode" TEXT NOT NULL DEFAULT 'normal', "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, "projectId" TEXT REFERENCES "Project"(id) ON DELETE SET NULL, "orgId" TEXT NOT NULL REFERENCES "Org"(id), "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS "DiagramTemplate" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "diagramType" TEXT NOT NULL DEFAULT 'bpmn', "templateType" TEXT NOT NULL DEFAULT 'user', data JSONB NOT NULL DEFAULT '{}', "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS "Prompt" (id TEXT PRIMARY KEY, name TEXT NOT NULL, text TEXT NOT NULL, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, "orgId" TEXT NOT NULL REFERENCES "Org"(id), "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  ];

  for (const sql of tables) {
    await db.exec(sql);
  }
  console.log("Tables OK");

  // Indexes
  await db.exec('CREATE INDEX IF NOT EXISTS idx_om_user ON "OrgMember"("userId")');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_proj_org ON "Project"("orgId")');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_diag_org ON "Diagram"("orgId")');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_prompt_org ON "Prompt"("orgId")');
  console.log("Indexes OK");

  // Seed
  const hash = await bcrypt.hash("!Aardwolf2026", 12);
  await db.query(`INSERT INTO "User" (id, email, name, password) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, ["usr-paul", "paul@nashcc.com.au", "Paul Nash", hash]);
  await db.query(`INSERT INTO "Org" (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`, ["org-default", "Nash CC"]);
  await db.query(`INSERT INTO "OrgMember" (id, "orgId", "userId", role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, ["om-paul", "org-default", "usr-paul", "Owner"]);

  const users = await db.query('SELECT email, name FROM "User"');
  console.log("Users:", users.rows);

  await db.close();
  console.log("Done! Database initialized.");
}

init().catch(e => { console.error(e); process.exit(1); });
