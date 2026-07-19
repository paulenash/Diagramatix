/**
 * Categorise the in-app User Guide (HelpChapter, collection "user-guide") so the
 * /help viewer's category filter organises the whole guide, and remove the
 * one-page "qr-*" summary chapters that duplicated existing content.
 *
 * Idempotent. Run:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/categorise-user-guide.ts
 *   DATABASE_URL="<prod url>" npx tsx scripts/categorise-user-guide.ts   # prod, one-time
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "user-guide";

// title → category. Titles copied verbatim from the guide.
const CATEGORY: Record<string, string> = {
  // Getting Started
  "Getting Started": "Getting Started",
  "Projects & Folders": "Getting Started",
  "Diagram Types": "Getting Started",
  "Account Settings": "Getting Started",
  "Keyboard Shortcuts": "Getting Started",
  "Tips & Troubleshooting": "Getting Started",
  // Creating & Editing
  "Canvas Basics": "Creating & Editing",
  "Palette & Elements": "Creating & Editing",
  "Connectors & Routing": "Creating & Editing",
  "Select & Connect Protocol": "Creating & Editing",
  "Auto-Connect": "Creating & Editing",
  "Properties Panel": "Creating & Editing",
  "Smart Alignment": "Creating & Editing",
  "Inserting & Removing Space": "Creating & Editing",
  "Drop onto Connector & Delete Healing": "Creating & Editing",
  "Resize Menu": "Creating & Editing",
  "Element Conversion": "Creating & Editing",
  "Edge-Mounted (Boundary) Events": "Creating & Editing",
  "Subprocesses & Linked Diagrams": "Creating & Editing",
  "Templates (BPMN)": "Creating & Editing",
  "Process Colour Themes": "Creating & Editing",
  "AI Diagram Generation": "Creating & Editing",
  // Diagram Types & Modelling
  "Value Chain Diagrams": "Diagram Types & Modelling",
  "Process Context Diagrams": "Diagram Types & Modelling",
  "Database Domain Diagrams": "Diagram Types & Modelling",
  "Import DDL": "Diagram Types & Modelling",
  "Logical DDL Generation": "Diagram Types & Modelling",
  // Analysis & Insights
  "Value Analysis": "Analysis & Insights",
  "Bottleneck Highlighting": "Analysis & Insights",
  "Simulating Processes": "Analysis & Insights",
  "DiagramatixMINER — Process Mining": "Analysis & Insights",
  "Risk & Controls (GRC)": "Analysis & Insights",
  "Process Classification (APQC PCF)": "Analysis & Insights",
  // Sharing & Governance
  "Collaboration & Review": "Sharing & Governance",
  "Process Portal": "Sharing & Governance",
  "Entity Lists & Pool/Lane Naming": "Sharing & Governance",
  "OrgAdmin": "Sharing & Governance",
  "SuperAdmin": "Sharing & Governance",
  // Import, Export & Data
  "Import & Export": "Import, Export & Data",
  "Backup & Restore": "Import, Export & Data",
  "Importing another vendor's BPMN diagram": "Import, Export & Data",
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    // 1. Remove the qr-* summary chapters (sections cascade on delete).
    const removed = await prisma.helpChapter.deleteMany({
      where: { collection: COLLECTION, slug: { startsWith: "qr-" } },
    });

    // 2. Apply categories to the remaining chapters.
    const chapters = await prisma.helpChapter.findMany({
      where: { collection: COLLECTION }, select: { id: true, title: true },
    });
    let set = 0;
    const unmatched: string[] = [];
    for (const ch of chapters) {
      const cat = CATEGORY[ch.title];
      if (!cat) { unmatched.push(ch.title); continue; }
      await prisma.helpChapter.update({ where: { id: ch.id }, data: { category: cat } });
      set++;
    }
    console.log(`Removed ${removed.count} qr-* chapters. Categorised ${set}/${chapters.length}.`);
    if (unmatched.length) console.log("UNMATCHED (left as-is):\n  - " + unmatched.join("\n  - "));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
