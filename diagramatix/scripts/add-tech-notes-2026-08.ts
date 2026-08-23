/**
 * Technical Design Notes for the 2026-08 release (schema 46) —
 * UPDATE_EVERYTHING.md Step 12.
 *
 * Adds sections to the existing `simulator-design` and `interoperability`
 * chapters of the `tech-design` collection. Idempotent: sections are upserted by
 * heading and appended after the chapter's current last section.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-tech-notes-2026-08.ts                           # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-tech-notes-2026-08.ts # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";

const ADDITIONS: Array<{ chapter: string; sections: Array<{ heading: string; body: string }> }> = [
  {
    chapter: "simulator-design",
    sections: [
      {
        heading: "Resource integrity — no pool exists that the user cannot see",
        body: [
          "Resources are matched by **name**: `sim.teamId` is a lane label, not a foreign key to `SimulationTeam`. That is deliberate — a lane rename should surface as a discrepancy, not silently re-point work — but it means the assembler can be handed a name no library row declares.",
          "",
          "It used to invent a pool for such a name at capacity 1. The work then ran, the numbers looked plausible, and one invisible person was doing it while everything configured on the real team applied to none of it. Four separate paths could produce one: a lane deleted after its tasks were assigned, a typo on a task, a namespaced fragment in a portfolio run, and the seeding race below.",
          "",
          "**The model now:**",
          "- `assemble.ts` takes `strictTeams`. Only a **library-declared** resource creates a pool; the canonical spelling comes from the library (`hit.key`), never from the task, so a misspelling cannot silently become the pool's name.",
          "- Anything undeclared is collected in **`unknownTeams`** and carried all the way to the results panel, which states plainly that the work ran unresourced and its waits are understated. `namespaceFragment` propagates it, so a portfolio run does not drop the evidence.",
          "- **Harvest scope is the process tree** — `reachableDiagramIds(root, byId)`, root plus its transitive linked children — not every BPMN diagram in the project.",
          "",
          "> **The rule this encodes:** a guard that silently changes behaviour is worse than no guard. `strictTeams` originally shipped correct but unexplained, which reads to a user as the app doing the wrong thing. Guard and explanation ship together.",
        ].join("\n"),
      },
      {
        heading: "Seeding: a signature, not a once-flag",
        body: [
          "Seeding the default setup once on mount looked right and was a race. On first render the diagram list is empty, so the guard `list.length > 0 && byId.size === 0` evaluated **false** — it did not wait — and seeding ran against **zero** diagrams, then set its once-flag. Whether any team was ever harvested came down to which fetch resolved first.",
          "",
          "It is now keyed on the **set of resource names the diagrams reference** (`usedTeamNames`), gated on having diagrams at all. Re-running when that set changes is not just a race fix: a lane added three levels down is picked up, which a once-flag could never do.",
        ].join("\n"),
      },
      {
        heading: "Repeats: the plan rides the token, and the accounting must balance",
        body: [
          "A repeat / multi-instance marker becomes a `RepeatPlan` on the queued `Pending`, so a token that waits for capacity carries its own plan rather than depending on state the queue cannot see. Parallel MI seizes `units × concurrency` and runs in waves; sequential holds the resource for the whole block.",
          "",
          "**The capacity leak.** Parallel MI seized `units × concurrency` and released `node.units ?? 1`. Every repeat leaked capacity until the pool was empty, at which point everything queued for ever: the run showed \"Running\" with no display, and it reached production. The release now uses `held?.units` — what was actually taken.",
          "",
          "T2862 pins the invariant directly (*what a repeat seizes is exactly what it releases*) rather than asserting on a symptom. Verified by reintroducing the bug: two tests fail, and they fail on the accounting rather than on a downstream number.",
          "",
          "An implausible repeat count is reported **before** the run (`implausibleRepeatCount`), not clamped during it. A silent clamp turns a typo — 3 minutes entered where 3 passes were meant — into a quietly wrong answer.",
        ].join("\n"),
      },
      {
        heading: "Terminating an unstable model",
        body: [
          "In an unstable model — arrivals exceeding what the resources can complete — live tokens grow linearly with the horizon, and memory with them. The authoritative run executes **server-side**, so unbounded growth takes the whole application down rather than one browser tab. It did: measured live tokens went 36 → 395 → 3,980 → 18,975 as repeats tripled service time past capacity.",
          "",
          "`Engine.runUntil` checks `tokens.size` every 1,000 events and stops past `MAX_LIVE_TOKENS` (50,000), recording `overload = { at, liveTokens }`. `runMonteCarlo` breaks after the first overloaded replication — an overloaded model is overloaded in every one, so repeating it burns the same time for the same answer.",
          "",
          "The value carries through `MonteCarloResult.overload` → the persisted run metrics → a banner **above every figure** in `ResultsReport`. Stopping without that banner would present a part-run as a finished answer, which is the more dangerous failure of the two.",
          "",
          "> The 50,000 ceiling is a judgement, not a measurement: far past any real process, so nothing legitimate should reach it. If a genuinely large model ever trips it, raise the ceiling — do not assume the model is wrong.",
        ].join("\n"),
      },
      {
        heading: "Fill is a tree walk, and a pass-through says so",
        body: [
          "`autofillProject(rootId, byId)` walks the root and every diagram reachable through `linkedDiagramId`, cycle-safe, returning only what changed so the caller writes the minimum. A run splices linked sub-processes in, so filling only the open diagram left the levels beneath it empty and the assembler substituted its own defaults — the deeper the process, the more of the answer came from values the user could not see.",
          "",
          "Each level resolves resources from **its own** lanes, and nothing overwrites a value already set.",
          "",
          "**Ordering matters.** A child's start events must be zeroed *before* the generic fill runs: read on its own, a child's start looks like a process start, so the generic pass would give it an arrival rate — and since nothing overwrites an existing value, the pass-through meaning would be lost for good.",
          "",
          "A start event that is *entered* rather than *triggered* gets `{ kind: \"fixed\", value: 0 }` — a linked child's top-level start, and any start inside an expanded sub-process at **any** level including the root (`assemble.ts` already turns both into a zero delay; this states it where the user can see it). Event-sub-process starts are excluded: those are triggers with their own semantics.",
        ].join("\n"),
      },
    ],
  },
  {
    chapter: "interoperability",
    sections: [
      {
        heading: "Schema drift: declaring what we already export",
        body: [
          "The export XSD's typed enumerations are **closed**, and `@type` is `use=\"required\"`. So a `SymbolType` the exporter emits but the schema does not declare does not degrade validation — it **fails** it.",
          "",
          "Schema 46 found 24 such values. The Standard Flowchart family (21 shapes, 2 connector types, 1 diagram type) had been undeclared since 2026-06-19, and the two State Machine history states since 2026-08-18. Every export of those diagram types was invalid against the schema shipped alongside it, for two months, silently.",
          "",
          "**Why the existing tests missed it.** `tests/xml/roundtrip.test.ts` validates \"every exported scenario\" against the XSD — but the scenario list contained neither a flowchart nor a history state. The checking was sound; the **coverage** was the hole. Adding one more sample diagram would only have moved the blind spot to the next undrawn type.",
          "",
          "**The guard is therefore structural, not sample-based.** `tests/xml/xsd-enum-drift.test.ts` (T2869) parses the TypeScript unions and the XSD `simpleType` blocks and asserts every union member is declared. It is one-directional: the XSD may declare **more** than the app emits, because retired values are kept so older files still validate.",
          "",
          "It also pins the assumption it rests on — that `@type` is still `SymbolTypeEnum` and still required — so if that ever relaxed to `xs:string`, the guard fails loudly instead of passing vacuously.",
          "",
          "> Migration for schema 46 is **none**: the affected files were always this shape. Only the declaration was missing.",
        ].join("\n"),
      },
    ],
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    for (const a of ADDITIONS) {
      const chapter = await prisma.helpChapter.findFirst({
        where: { slug: a.chapter, collection: COLLECTION },
        include: { sections: true },
      });
      if (!chapter) { console.log(`\n?? no "${a.chapter}" chapter in ${COLLECTION} — skipped`); continue; }
      console.log(`\nCHAPTER "${chapter.title}"`);

      // Repair any section already filed under the wrong collection (see the
      // note on create below). Re-running this script is how an environment
      // that got the first, broken version is put right.
      const misfiled = chapter.sections.filter((s) => s.collection !== COLLECTION);
      for (const s of misfiled) {
        await prisma.helpSection.update({ where: { id: s.id }, data: { collection: COLLECTION } });
        console.log(`  REPAIR  collection ${s.collection} -> ${COLLECTION}  "${s.heading}"`);
      }
      let next = Math.max(0, ...chapter.sections.map((s) => s.sortOrder)) + 1;
      for (const s of a.sections) {
        const existing = chapter.sections.find((x) => x.heading === s.heading);
        if (existing) {
          // Content only — leave position alone, so re-running does not shuffle
          // the chapter around.
          await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: s.body } });
          console.log(`  update  "${s.heading}"`);
        } else {
          // `collection` is DENORMALISED onto the section (the chapter has one
          // too) and defaults to "user-guide". Omitting it here filed every
          // tech-design note under the user guide: the section rows existed with
          // their content, but the viewer's collection-scoped query skipped
          // them, so the chapter rendered with nothing under it. The scoped
          // delete on save keys off the same column, so this is not merely
          // cosmetic.
          await prisma.helpSection.create({
            data: { chapterId: chapter.id, collection: COLLECTION, heading: s.heading, bodyMarkdown: s.body, sortOrder: next++ },
          });
          console.log(`  insert  "${s.heading}"`);
        }
      }
    }
    console.log("\nDone.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
