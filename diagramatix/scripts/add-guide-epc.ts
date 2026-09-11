/**
 * Add an "EPC Diagrams & Converting to BPMN" chapter to the in-app User Guide.
 * Placed right after "Importing another vendor's BPMN diagram" — the two are the
 * same story: bringing process models in from somewhere else. Idempotent:
 * re-running upserts the chapter + each section body in place by heading.
 *
 * DB-backed guide → NOT bundled in the build; auto-seeded on deploy and runnable
 * against prod to publish:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-epc.ts                                # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-epc.ts      # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "epc";
const TITLE = "EPC Diagrams & Converting to BPMN";
const AFTER_SLUG = "import-competitor-bpmn";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "What an EPC is",
    body: [
      "An **Event-driven Process Chain** is the notation ARIS is best known for. If your organisation has modelled processes in ARIS, this is almost certainly what they look like.",
      "",
      "An EPC alternates between two things, and that alternation *is* the notation:",
      "",
      "- an **Event** is a state that has come about — *\"Invoice received\"*, *\"Credit approved\"*. It is passive. Nothing happens *in* an event; it records that something is now true.",
      "- a **Function** is work being done — *\"Verify invoice\"*. It is active, and it is the only element that carries assignments.",
      "",
      "They take turns: event → function → event → function. Everything else in the notation — who does the work, what it reads, what system it happens in — hangs off a **function**.",
      "",
      "Create one the way you create any diagram: **New Diagram → EPC**. The palette gives you the ten symbols the notation is built from.",
    ].join("\n"),
  },
  {
    heading: "The symbols",
    body: [
      "**The chain itself**",
      "",
      "- **Event** — an elongated pink hexagon. A state that has come about.",
      "- **Function** — a rounded green rectangle. Work being done.",
      "- **XOR** — a circle containing **×**. Exactly one branch is taken.",
      "- **AND** — a circle containing **∧**. Every branch is taken.",
      "- **OR** — a circle containing **∨**. One or more branches are taken.",
      "- **Process Interface** — a chevron. The chain continues in another EPC.",
      "",
      "**What hangs off a function**",
      "",
      "- **Organisational Unit** — a yellow box with a rounded left edge. Who is responsible (*\"Accounts Payable\"*). This is what becomes a **lane** when you convert to BPMN.",
      "- **Position** — the same shape with a person glyph. A role rather than a department (*\"Credit Officer\"*). Also becomes a lane.",
      "- **Information Object** — a box with a bar down its left edge. Data the function reads or writes.",
      "- **Application System** — a box with bars at both sides. The system the work happens in (*\"SAP\"*).",
      "",
      "A **Descriptive Objects** section at the bottom of the palette holds ten more — KPI, Risk, Product/Service, Knowledge Category, Business Rule, Screen, Objective, Machine/Resource, Location and Requirement. It starts **closed**, because a typical EPC uses two or three of them and showing all ten beside the core symbols would bury the ones that carry the process. Click the heading to open it.",
    ].join("\n"),
  },
  {
    heading: "The three kinds of line",
    body: [
      "Only one of them means *\"and then\"*. This is the part that matters most, because it is what makes a conversion to BPMN trustworthy.",
      "",
      "- **Control flow** — a right-angled line with an open arrowhead, running **down** the page. The sequence of the process. It joins events, functions, connectors and process interfaces to each other, and nothing else.",
      "- **Information flow** — a straight line with an open arrowhead, running **sideways**. Between an Information Object (or an Application System, or a Descriptive Object) and a function. The **direction is the meaning**: data → function means the function *reads* it; function → data means it *writes* it.",
      "- **Organisation assignment** — a straight line with **no arrowhead**. Between an Organisational Unit or Position and a function. Responsibility is not a direction, so it carries no arrow.",
      "",
      "You do not choose which kind to draw — Diagramatix works it out from the two shapes you connect, and the arrowhead is fixed by the notation rather than being a setting. That is deliberate: an EPC where one arrow has been changed by hand is no longer an EPC, and the fault would be invisible because it still looks like a diagram.",
    ].join("\n"),
  },
  {
    heading: "The rules, and why the editor enforces them",
    body: [
      "An EPC is defined by what may follow what. Diagramatix will simply refuse some connections while you draw, and report others when a diagram is generated or imported.",
      "",
      "- **Events and functions alternate.** You cannot join two functions directly, or two events. If one step leads to another, there is an event between them naming the state the first one brought about.",
      "- **A chain begins and ends with an event** — the trigger, and the state it brought about. A Process Interface may stand in for one at either end.",
      "- **An event cannot decide.** An **XOR** or **OR** split must be preceded by a **function**. This is the rule most people are surprised by, and it is the most useful one: an event is passive, so a chain that puts a decision straight after one contains *nothing that says what is being decided*. Put the deciding in a function (*\"Check credit rating\"*) and name the outcomes on the events after the split (*\"Credit approved\"* / *\"Credit refused\"*). An **AND** split after an event is fine — taking every branch is not a choice.",
      "- **A connector either splits or joins**, never both at once.",
      "- **A split should be closed by a join of the same type.** Real models break this constantly, so it is reported rather than blocked.",
      "- **Assignments never sit on the chain.** An organisational unit, a document, a system or a Descriptive Object attaches to a **function** and to nothing else.",
      "- **One responsible organisational unit per function.** Others are participants. This matters because it is what decides which lane the function becomes.",
      "",
      "Layout is handled for you: the chain runs **top to bottom**, and every branch gets its own three-column band — documents and systems on the left of each function, the organisational unit and any Descriptive Objects on the right — so one branch's attachments never collide with the next branch's.",
    ].join("\n"),
  },
  {
    heading: "Generating an EPC with AI",
    body: [
      "EPCs generate the same two-phase way BPMN and flowcharts do. Click **AI ✨**, describe the process, and **Plan**. You get an editable plan first; **Apply** lays it out. The layout step makes no AI call, so applying is instant and free.",
      "",
      "Mention who does each step and what it touches and the plan will carry them: *\"Accounts Payable verifies the invoice in SAP against the purchase order\"* becomes a function with an organisational unit, an application system and an information object already attached.",
      "",
      "Anything the layout could not take at face value is listed under the plan — an event followed by a decision, two functions in a row, a split that never closes. **Nothing is quietly repaired.** Inserting a missing event to tidy up the alternation would produce a chain containing a state nobody described, which is worse than being told which two steps need attention.",
      "",
      "House rules for EPC generation are editable like any others, under **Rules → EPC**.",
    ].join("\n"),
  },
  {
    heading: "Importing from ARIS",
    body: [
      "Open any EPC diagram and choose **File ▾ → Import → ARIS (AML)**. AML is the export format ARIS produces.",
      "",
      "**Every EPC in the file becomes its own diagram.** The editor opens the first and lists the rest. Models that are not EPCs — organisational charts, data models — are named and skipped rather than forced into the shape of a process.",
      "",
      "**Nothing is discarded in silence.** A real repository holds objects outside the EPC notation, and the import report names every one it left behind, along with any connection type it did not recognise and anything it could not place. A migration that quietly dropped half of what you modelled would be worse than one that tells you what it could not bring.",
      "",
      "A sample file is available at **/ARIS Order to Cash eEPC.aml** if you would like to see the shape of an import before running your own.",
    ].join("\n"),
  },
  {
    heading: "Converting to BPMN",
    body: [
      "This is the point of the notation being here. Open an EPC and choose **File ▾ → Convert to BPMN…**.",
      "",
      "A preview shows exactly what you will get before anything is created. The EPC is left untouched; the conversion produces a **new** BPMN diagram named *\"<your diagram> (BPMN)\"*. It is **one-way** — BPMN does not convert back to EPC.",
      "",
      "Two things happen that are worth understanding, because they are what make the result readable rather than merely faithful.",
      "",
      "**Most events disappear, and that is deliberate.** An EPC alternates event and function, so copying it shape-for-shape would put a round symbol between every two tasks. Those middle events are *states*, not things that happen to the process. The first becomes a start event, the last an end event, and the rest are dropped — each one named in the report, so you can see what went.",
      "",
      "**Events after a decision become the branch labels.** *\"Credit approved\"* and *\"Credit refused\"* move onto the gateway's outgoing flows, which is where BPMN expects them. Tick **Refine with AI** and the gateway is given the question those answers belong to — *\"Credit approved?\"* — with the flows reading *Yes* and *No*. The same pass turns EPC's noun-style function names (*\"Invoice verification\"*) into BPMN's verb-style task names (*\"Verify invoice\"*). It only ever changes wording; the structure of the diagram is fixed before the AI sees it.",
      "",
      "**Lanes come from your model, not from guesswork.** Because an EPC records who does the work as an explicit relationship, every organisational unit becomes a lane and its functions land in it — no inferring from which band a box happened to sit in. A department drawn beside four functions is **one** lane, not four. Application systems become black-box system pools, reached by message flows.",
    ].join("\n"),
  },
  {
    heading: "What the conversion will not guess",
    body: [
      "Before you commit, the dialog shows a **Needs a person** section. These are questions only you can answer, and the conversion leaves them alone rather than choosing for you. You have to tick to acknowledge them before it will create the diagram.",
      "",
      "- **A split that never closes.** Deciding where the branches come back together is a decision about your process, not about the drawing.",
      "- **A connector that both splits and joins.** Which happens first is not recorded anywhere in the model, so there is no correct pair of gateways to produce.",
      "- **An event followed by a decision.** There is nothing in the model that says what the gateway tests — the condition is genuinely absent, so one would have to be invented.",
      "- **A function owned by two departments.** Only one can be the lane. The conversion uses the first and tells you which, so you can check it.",
      "",
      "This is the whole reason the output is worth trusting. A migration tool that silently tidied an unbalanced branch would hand you a model that looks finished and is wrong somewhere you will not think to look.",
      "",
      "Objects with no BPMN equivalent — a KPI, a Risk, an Objective — become **text annotations** attached to their task, prefixed with what they were (*\"KPI: Order cycle time\"*). Turning one into a task would put something in the process that is not a step in it.",
    ].join("\n"),
  },
  {
    heading: "Linking chains together",
    body: [
      "A **Process Interface** says the chain continues somewhere else. Select one and pick the EPC it leads to under **Linked Diagram** in the Properties panel; a small marker appears at the bottom of the shape, and **double-clicking drills into it** — the same way a collapsed subprocess works in BPMN.",
      "",
      "When you have drilled into a diagram, a **«** marker sits at the top-left of the first element of the chain. Double-click it to come back.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let chapter = await prisma.helpChapter.findFirst({ where: { slug: SLUG, collection: "user-guide" }, include: { sections: true } });
    if (!chapter) {
      const after = await prisma.helpChapter.findFirst({ where: { slug: AFTER_SLUG, collection: "user-guide" } });
      const at = (after?.sortOrder ?? 43) + 1;
      await prisma.helpChapter.updateMany({ where: { collection: "user-guide", sortOrder: { gte: at } }, data: { sortOrder: { increment: 1 } } });
      const created = await prisma.helpChapter.create({ data: { slug: SLUG, collection: "user-guide", title: TITLE, sortOrder: at } });
      chapter = { ...created, sections: [] };
      console.log(`Created chapter "${TITLE}" at sortOrder ${at}.`);
    } else {
      await prisma.helpChapter.update({ where: { id: chapter.id }, data: { title: TITLE } });
      console.log(`Chapter "${TITLE}" already exists — updating sections in place.`);
    }

    let i = 0;
    for (const s of SECTIONS) {
      // Sections are matched by HEADING, so renaming one here would insert a
      // second copy alongside the old row rather than editing it.
      const existing = chapter.sections.find((x) => x.heading === s.heading);
      if (existing) {
        await prisma.helpSection.update({ where: { id: existing.id }, data: { heading: s.heading, bodyMarkdown: s.body, sortOrder: i } });
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
