/**
 * Bootstrap the APQC PCF **reference** frameworks from the workbooks in the
 * repo-root `APQC/` folder into global (orgId = null) reference frameworks.
 * Idempotent per (familyKey, version). Local/dev bootstrap: the `APQC/` xlsx
 * files live at the repo root (outside the app's Docker context), so this is NOT
 * wired into deploy — on prod a SuperAdmin imports the workbooks via the admin
 * UI (POST /api/admin/pcf/import). Only .xlsx is supported (convert .xls first).
 *
 * Run: cd diagramatix && DATABASE_URL="…" npx tsx scripts/seed-pcf-frameworks.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parsePcfWorkbook } from "../app/lib/pcf/importPcfXlsx";
import { persistPcfFramework } from "../app/lib/pcf/persistFramework";

// Metadata for the bundled workbooks, keyed by K-number (robust to filename noise).
const META: Record<string, { familyKey: string; variant: string; version: string }> = {
  K016808: { familyKey: "cross-industry", variant: "Cross-Industry", version: "8.0" },
  K06637:  { familyKey: "aerospace-defense", variant: "Aerospace & Defense", version: "7.2.2" },
  K06638:  { familyKey: "airline", variant: "Airline", version: "7.2.2" },
  K06639:  { familyKey: "automotive", variant: "Automotive", version: "7.2.2" },
  K06640:  { familyKey: "banking", variant: "Banking", version: "7.2.1" },
  K06641:  { familyKey: "broadcasting", variant: "Broadcasting", version: "7.2.2" },
  K06710:  { familyKey: "education", variant: "Education", version: "7.2.1" },
  K07121:  { familyKey: "city-government", variant: "City Government", version: "7.2.1" },
  K07123:  { familyKey: "consumer-electronics", variant: "Consumer Electronics", version: "7.2.1" },
  K07128:  { familyKey: "healthcare-provider", variant: "Healthcare Provider", version: "7.2.1" },
  K07129:  { familyKey: "property-casualty-insurance", variant: "Property and Casualty Insurance", version: "7.2.1" },
  K07130:  { familyKey: "health-insurance-payor", variant: "Health Insurance Payor", version: "7.2.1" },
  K07220:  { familyKey: "utilities", variant: "Utilities", version: "7.2.1" },
  K09276:  { familyKey: "retail", variant: "Retail", version: "7.2.1" },
  K09277:  { familyKey: "consumer-products", variant: "Consumer Products", version: "7.2.2" },
};

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const dir = join(process.cwd(), "..", "APQC");
  try {
    const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xlsx"));
    for (const file of files) {
      const kn = /^(K\d+)/i.exec(file)?.[1]?.toUpperCase();
      const meta = kn ? META[kn] : undefined;
      if (!meta) { console.log(`skip (no metadata): ${file}`); continue; }
      const parsed = await parsePcfWorkbook(readFileSync(join(dir, file)));
      const r = await persistPcfFramework(prisma, parsed, {
        orgId: null, kind: "reference", familyKey: meta.familyKey,
        name: `APQC PCF — ${meta.variant}`, variant: meta.variant, version: meta.version, sourceKNumber: kn,
      });
      console.log(`${r.skipped ? "exists " : "seeded "} ${meta.variant} v${meta.version}: ${r.skipped ? "(already present)" : r.nodeCount + " nodes"}`);
    }
    console.log("Done.");
  } finally { await prisma.$disconnect(); }
}

main().catch((e) => { console.error(e); process.exit(1); });
