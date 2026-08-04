/**
 * Add an "AI Assist & Abracadabra Mode" chapter to the in-app User Guide.
 * Idempotent: upserts the chapter + each section by heading; appended after the
 * current last user-guide chapter.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-ai-assist.ts                          # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-ai-assist.ts # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "user-guide";
const SLUG = "ai-assist";
const TITLE = "AI Assist & Abracadabra Mode";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "What Assist does",
    body: [
      "**Assist** helps you build a BPMN diagram faster by suggesting the next thing as you draw, and by letting you **speak or type** what you want. It's optional and off until you turn it on, and most of it is instant and free — the AI is only called for the trickier requests.",
      "",
      "There are two switches in the toolbar (BPMN diagrams only): **👻 Assist** (ghost suggestions) and **🪄 Abracadabra** (voice/typed commands). Each remembers its own on/off state per diagram.",
    ].join("\n"),
  },
  {
    heading: "👻 Assist — ghost next-step suggestions",
    body: [
      "Turn on **👻 Assist**, then select a single element. Faint **ghost chips** appear to its right suggesting what usually comes next. **Press Tab** (or click a chip) to accept the top one — the element is placed and connected for you, tidily and never on top of anything.",
      "",
      "Depending on what's selected you may see:",
      "- **Task / Decision / End** — the usual next steps.",
      "- **Boundary** — attach a boundary event to a task or subprocess (it clips onto the edge; no connector).",
      "- **🧩 Template** — insert a saved template fragment inline (pick a category, then a template).",
      "- **✨ (an intent)** — when the element's *name* implies something, e.g. naming a task \"Approve invoice\" suggests an approval template.",
      "- **📄 Data Object** — when the name implies using instructions/a policy (adds an **Input** data object, default \"Instructions\") or producing a document (adds an **Output** data object, default \"Output Doc\"). You can rename it afterwards.",
    ].join("\n"),
  },
  {
    heading: "🪄 Abracadabra Mode — say it or type it",
    body: [
      "Turn on **🪄 Abracadabra** and a command bar appears. Click the **🎙 mic** and just talk, or type a command and press **Run**. Each sentence is applied to the diagram **live**, and a log shows what it heard and did — every change is undoable (say **\"undo that\"** or press Ctrl+Z).",
      "",
      "Say **\"stop\"** (or \"that's enough\") to end listening. Commands are interpreted instantly by built-in rules; anything unusual falls back to the AI — the log tags each entry **rule** (instant, free) or **✨ AI** (metered) so you can see which is which.",
    ].join("\n"),
  },
  {
    heading: "Things you can say or type",
    body: [
      "**Add & connect**",
      "- \"add a task called Approve after Review\"",
      "- \"add a decision\" · \"insert a parallel gateway\"",
      "- \"connect Send Invoice to Receive Payment\" · \"connect them\"",
      "- \"add a boundary event called Cancel to the Repeat-Until subprocess\"",
      "",
      "**Pools & lanes**",
      "- \"put a pool around everything\"",
      "- \"add 2 lanes to the middle pool called Sales Team and Marketing Team\"",
      "- \"add 3 sublanes to the Marketing Team lane called Manager, Assistant and Staff\"",
      "",
      "**Edit & tidy**",
      "- \"rename the gateway to Approved?\"",
      "- \"move the gateway two elements to the right\"",
      "- \"remove the sub-lane Marketing Assistant\" (the neighbouring lane grows to fill the space)",
      "- \"delete Prepare and compact\"",
      "- \"clear the diagram\" · \"export the diagram to JSON\" · \"undo that\"",
      "",
      "You can refer to elements by **name** (\"Review\"), by **type** (\"the gateway\"), by **position** (\"the middle pool\"), or with **it / the last one / the previous one**.",
    ].join("\n"),
  },
  {
    heading: "Voice usage & privacy",
    body: [
      "Voice uses a live speech service (Deepgram) that your workspace administrator enables. Audio streams directly from your browser for transcription; the app records only a small **usage row per session** (who, how long, which engine) so voice minutes appear in **AI Usage** — the audio itself isn't stored.",
      "",
      "If voice isn't configured, the mic falls back to your browser's built-in speech recognition. Typing always works.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let chapter = await prisma.helpChapter.findFirst({ where: { slug: SLUG, collection: COLLECTION }, include: { sections: true } });
    if (!chapter) {
      const last = await prisma.helpChapter.findFirst({ where: { collection: COLLECTION }, orderBy: { sortOrder: "desc" } });
      const at = (last?.sortOrder ?? 0) + 1;
      const created = await prisma.helpChapter.create({ data: { slug: SLUG, collection: COLLECTION, title: TITLE, sortOrder: at } });
      chapter = { ...created, sections: [] };
      console.log(`Created ${COLLECTION} chapter "${TITLE}" at sortOrder ${at}.`);
    } else {
      await prisma.helpChapter.update({ where: { id: chapter.id }, data: { title: TITLE } });
      console.log(`Chapter "${TITLE}" already exists — updating sections in place.`);
    }
    let i = 0;
    for (const s of SECTIONS) {
      const existing = chapter.sections.find((x) => x.heading === s.heading);
      if (existing) {
        await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  update "${s.heading}"`);
      } else {
        await prisma.helpSection.create({ data: { chapterId: chapter.id, heading: s.heading, bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  insert "${s.heading}"`);
      }
      i++;
    }
    console.log("Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
