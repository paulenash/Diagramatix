/**
 * Seed the SuperAdmin **Technical Design Notes** (the `tech-design` document
 * collection): three chapters — Simulator Design, Miner Design, RCM Design — of
 * low-level design notes, each ending with a summary of the import/export
 * standards that area supports. Idempotent: chapters upserted by (collection,
 * slug), sections upserted by heading. Mirrors scripts/add-guide-*.ts.
 *
 * Run: DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" npx tsx scripts/add-tech-design-notes.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";

interface Section { heading: string; body: string }
interface Chapter { slug: string; title: string; sections: Section[] }

const CHAPTERS: Chapter[] = [
  {
    slug: "simulator-design",
    title: "Simulator Design",
    sections: [
      {
        heading: "Overview & architecture",
        body: [
          "The Simulator is a **discrete-event digital twin** of a process. A study is a *portfolio* of root diagrams (`SimulationStudy`); at assembly time the engine takes each root and computes its **forward-link closure** — following process links (call activities / linked sub-processes) to pull in every reachable diagram — and stitches them into one process **network**.",
          "",
          "Assembly is **hierarchical**: an expanded sub-process becomes a nested network; **event sub-processes** are injected as interrupt/boundary handlers. Tokens flow through the assembled network under a discrete-event clock; the engine records per-activity timing, queueing and resource occupancy for the run report and the animation.",
        ].join("\n"),
      },
      {
        heading: "Arrival & routing",
        body: [
          "**Arrivals** enter at start events. The arrival process is either a fitted distribution (exponential inter-arrival, calibrated from mining) or a **demand preset** (a named arrival-rate profile).",
          "",
          "**Routing** at gateways is probabilistic: each outgoing flow carries a `branchProbability`; exclusive gateways pick one branch by weight, parallel gateways fan out. Branch probabilities are either author-set or **mined** from the discovered edge frequencies.",
        ].join("\n"),
      },
      {
        heading: "Cycle-time distributions",
        body: [
          "Each task carries a **service-time distribution**. Fitting picks the simplest shape that fits the data:",
          "",
          "- **Fixed** — when samples are constant or too few to fit.",
          "- **Triangular(min, mode, max)** — the default for real spread; robust with modest sample sizes.",
          "",
          "Durations are held in a **clock unit** (second / minute / hour / day) chosen so typical values stay human-scaled.",
        ].join("\n"),
      },
      {
        heading: "Resources, teams & calendars",
        body: [
          "Work is performed by **teams** with finite **capacity**. A task names the team that performs it; when capacity is exhausted, tokens **queue** (recorded as waiting time).",
          "",
          "**Resource calendars** model working hours: a team is *on* only within its `WorkCalendar` open intervals. Off-shift time is shown with a dim cue in the animation and a day/time clock. Capacity + calendar together drive realistic queueing and cycle time.",
        ].join("\n"),
      },
      {
        heading: "Calibration from mining (the digital twin)",
        body: [
          "A mined run's `Performance` aggregate calibrates a simulation directly — this is the *digital-twin* path:",
          "",
          "| Mined signal | Calibrates |",
          "|---|---|",
          "| `activityDurations` (sojourn samples) | per-task cycle-time distribution (fixed / triangular) |",
          "| `interArrival` | the start event's arrival rate (exponential) |",
          "| discovered edge frequencies | gateway `branchProbability` |",
          "| `activityResource` + `resourceConcurrency` | team assignment + capacity (peak concurrency) |",
          "| `activeHours` (168-bucket hour-of-week histogram) | the working `WorkCalendar` |",
          "",
          "The run horizon is derived from the log's observed `from`/`to` span. See the **Miner Design** chapter for how these aggregates are computed.",
        ].join("\n"),
      },
      {
        heading: "Comparison studies (as-is / to-be)",
        body: [
          "An **as-is / to-be** comparison is a single study holding both process variants as roots, with variant-pinned scenarios so the same demand + calendars run against each. The report contrasts cycle time, cost and resource utilisation side by side.",
        ].join("\n"),
      },
      {
        heading: "Interchange & standards",
        body: [
          "The Simulator supports the following import/export standards:",
          "",
          "| Standard | Direction | Notes |",
          "|---|---|---|",
          "| **BPSim** (BPMN Simulation Interchange, WfMC) | Import + Export | The simulation-parameter layer — arrival rates, durations, resources, branch probabilities — expressed as the industry-standard BPSim extension so a model round-trips with other BPSim tools. |",
          "| **`.dgxsim` bundle** | Import + Export | Diagramatix's own self-contained study bundle: the root diagrams, calibrated parameters, teams, calendars and scenarios in one portable file. Full-fidelity (nothing is dropped). |",
          "",
          "BPSim is the *standard* interchange (lossy to what BPSim can express); the `.dgxsim` bundle is the *lossless* Diagramatix-native form.",
        ].join("\n"),
      },
    ],
  },
  {
    slug: "miner-design",
    title: "Miner Design (DiagramatixMINER)",
    sections: [
      {
        heading: "Overview & pipeline",
        body: [
          "DiagramatixMINER is a **state-centric** process miner. The pipeline:",
          "",
          "`ingest → normalise to traces → compress to variants → discover (BPMN + state machine) → conformance → calibrate`.",
          "",
          "The deliberate design choice is to treat the **entity state** as a first-class signal (not just the activity), which is what powers the distinctive state-machine conformance. Everything downstream runs off the compressed **variants**, not raw events.",
        ].join("\n"),
      },
      {
        heading: "Event-log ingest model",
        body: [
          "The ingest maps uploaded columns to **roles**. Recognised roles:",
          "",
          "| Role | Required? | Notes |",
          "|---|---|---|",
          "| Case / entity id | Yes | the process instance |",
          "| Activity | Yes | the business event |",
          "| Timestamp | Yes | epoch (s/ms), Excel serial, or ISO/parseable date |",
          "| State | **Optional** | the entity's resulting state; when absent, supplied by the **Activity→State table** (defaults each activity to a same-named state) |",
          "| Resource | Optional | who/what performed it → simulation team |",
          "| Control / Risk / Policy ID | Optional | GRC identifiers → the governance aggregate (see below) |",
          "| Entity type | Optional | recognised but not currently used downstream |",
          "",
          "Rows missing a case id or a parseable timestamp are **dropped** (counted in stats). Formats accepted: **CSV/TSV**, **XES**, **OCEL** (see the standards section).",
        ].join("\n"),
      },
      {
        heading: "Variant-compression architecture",
        body: [
          "**Raw events are not persisted.** After normalising to per-case traces, the log is compressed to **variants** — distinct `(state[], activity[])` sequences + a frequency count — and only the aggregates are stored on `ProcessMiningRun`:",
          "",
          "- `mapping` — the column→role mapping",
          "- `stats` — headline counts + time span",
          "- `variants` — the compressed log (the persisted event data)",
          "- `performance` — timing / resource aggregates (simulator feed)",
          "- `governance` — control/risk/policy aggregates (when the log carried them)",
          "- `conformance` — the latest replay result (fitness + violations)",
          "",
          "**Consequence:** per-event timestamps and resources are discarded at compression; anything needed later (performance, governance) must be computed *at import*. This bounds storage but forecloses per-event re-analysis — the key architectural trade-off.",
        ].join("\n"),
      },
      {
        heading: "Discovery",
        body: [
          "Two artefacts are discovered from the variants:",
          "",
          "- **BPMN process** — a directly-follows graph (DFG) over activities, AI-curated into a clean model (gateways at real branches, rework loops, tidy labels, noise dropped).",
          "- **State machine** — the entity lifecycle (states + the events that move between them), AI-curated into a governable reference.",
          "",
          "Both are editable diagrams; the state machine becomes the reference for conformance.",
        ].join("\n"),
      },
      {
        heading: "Conformance",
        body: [
          "Conformance **replays** each variant's state sequence against a reference **state-machine** diagram (the single source of truth), matched **by label**. **Fitness** = the fraction of cases whose whole state sequence replays cleanly.",
          "",
          "Violation taxonomy: `undocumented-transition`, `unknown-state`, `unexpected-entry`, `unexpected-exit`, `dead-transition`. Each is frequency-weighted (cases affected) and carries the reference element/connector ids for the overlay.",
        ].join("\n"),
      },
      {
        heading: "Governance aggregate",
        body: [
          "When the log carries **Control IDs** on events, the ingest computes per-control operating-effectiveness directly (no reference needed):",
          "",
          "- `expected` = distinct cases in which a *governed* activity occurred (an activity the control is seen on anywhere in the log),",
          "- `applied` = distinct cases in which the control id was actually recorded,",
          "- `bypassed` = `expected − applied`, and **effectiveness%** = `applied / expected`.",
          "",
          "Risk and Policy IDs get distinct-case counts (traceability). This closes the loop with the **RCM**: a Control's `code` is matched to `governance.controls[code]`, so the Risk-Control Matrix shows mined effectiveness. (A second, older path derives effectiveness from conformance deviations via a control's `monitorSignature` — see the RCM chapter.)",
        ].join("\n"),
      },
      {
        heading: "Performance & calibration",
        body: [
          "`Performance` is mined once at import from the transient traces:",
          "",
          "- **activityDurations** — sojourn time to the next event, per activity (the service-time samples),",
          "- **interArrival** — gaps between consecutive cases' first events,",
          "- **activityResource** — the dominant resource per activity,",
          "- **resourceConcurrency** — max simultaneous cases per resource (→ team capacity),",
          "- **activeHours** — a 168-bucket hour-of-week histogram (→ working calendar).",
          "",
          "These feed the Simulator calibration verbatim (see **Simulator Design → Calibration from mining**).",
        ].join("\n"),
      },
      {
        heading: "Interchange standards",
        body: [
          "DiagramatixMINER imports and exports the industry event-log standards. Summary of what each is and our fidelity:",
          "",
          "| Standard | Import | Export | Notes |",
          "|---|---|---|---|",
          "| **IEEE XES (1849)** | Yes | Yes | The ISO/IEEE event-log XML. Import maps the standard extensions (`concept:name`, `time:timestamp`, `org:resource`, `lifecycle:transition`); state is left unmapped so the Activity→State table completes it. Export is **variant-level** — traces are reconstructed from variants with synthetic monotonic timestamps (raw events aren't stored). |",
          "| **OCEL (2.0 & 1.0)** | Yes | Yes | Object-Centric Event Log (JSON). Import is a **single-object projection**: you pick one object type as the case, and events relating to it become rows. Export emits single-object OCEL 2.0. Full multi-object analytics are out of scope. |",
          "| **CSV / TSV** | Yes | — | The de-facto minimum. Delimiter auto-detected; quotes/BOM/CRLF handled. A classic 3-column (Case, Activity, Timestamp) log imports directly via the Activity→State table. |",
          "",
          "**Why export is variant-level:** the miner persists compressed variants + aggregates, not raw events — so XES/OCEL exports faithfully reproduce *what happened and how often*, but not original timestamps. Round-tripping (export → re-import) reproduces the same process structure and variant frequencies.",
        ].join("\n"),
      },
    ],
  },
  {
    slug: "rcm-design",
    title: "RCM Design (Risk & Control)",
    sections: [
      {
        heading: "Overview",
        body: [
          "The Risk & Control Matrix (RCM) puts **GRC on the model**. It follows the **org-master → project-copy** catalog pattern (mirroring Entity Lists): an Org maintains a master library; each project **adopts a copy** it can edit independently. Risks and Controls are attached to real process steps, and a Risk-Control Matrix is exported for auditors.",
        ].join("\n"),
      },
      {
        heading: "Data model",
        body: [
          "Three relational models: `RiskControlLibrary` → `RiskControlItem` → `RiskControlLink`.",
          "",
          "An **item** is one of seven kinds: **Risk, Control, Policy, Regulation, Audit Finding, KRI, KPI**. A **link** is a directed edge `{ sourceId, targetId }`, so the whole catalog is a **directed traceability graph** (Risk ↔ Control ↔ Policy ↔ Regulation ↔ Audit Finding ↔ KRI ↔ KPI).",
          "",
          "Risks carry likelihood/impact (inherent) and residual likelihood/impact (after controls) → **inherent vs residual scoring**. Controls carry type, frequency, owner, framework reference, and a `monitorSignature` (see effectiveness).",
        ].join("\n"),
      },
      {
        heading: "Attaching to process steps",
        body: [
          "Risks/Controls are attached to elements via `element.properties.risk` (mirroring the simulation-params annotation pattern). References are stored **by id** with a **cached label**, so a step shows its risks/controls on the model and the RCM export can resolve them even if a label later changes.",
        ].join("\n"),
      },
      {
        heading: "Coverage & segregation-of-duties",
        body: [
          "Two scan rules surface governance gaps automatically (alongside the BPMN structural rules):",
          "",
          "- **B38 — Control coverage:** a step carrying a Risk but **no** mitigating Control is flagged (a coverage hole).",
          "- **B39 — Segregation of duties:** a lane holding both a *create* and an *approve* activity is flagged.",
          "",
          "They appear in the diagram issue scanner and the structural-issues bucket with the offending element ids highlighted.",
        ].join("\n"),
      },
      {
        heading: "Control operating-effectiveness",
        body: [
          "Effectiveness is proven from **real execution data** via two evidence sources:",
          "",
          "1. **Mined Control IDs (preferred)** — the control's `code` is matched to the mining run's `governance.controls[code]`; effectiveness = applied / expected cases (see **Miner Design → Governance aggregate**).",
          "2. **Conformance deviations** — a control names the deviation it guards (`monitorSignature`); when the run's conformance shows that deviation in N of M cases, the control was *bypassed* N times.",
          "",
          "Both render as “bypassed in N of M cases” against the control, with the evidence source labelled.",
        ].join("\n"),
      },
      {
        heading: "Examples catalog",
        body: [
          "GRC examples are adoptable via `RiskControlExample` (package + adopt, mirroring the Simulator/Mining example catalogs). The **Order-to-Cash** sample ships a full process + risks/controls attached to the real steps + a bundled mining run, so control operating-effectiveness lights up on adopt.",
        ].join("\n"),
      },
      {
        heading: "Export & standards",
        body: [
          "The RCM exports to a multi-sheet Excel workbook — the format auditors expect:",
          "",
          "| Standard | Direction | Notes |",
          "|---|---|---|",
          "| **OOXML SpreadsheetML (`.xlsx`)** | Export | Hand-built via JSZip (no library). Sheets: **Audit Grid** (flat Activity × Risk × Control), **RCM**, **Control Register**, **GRC Register**, **Traceability**, **Coverage Summary**. |",
          "",
          "Framework references (e.g. **SOX**, **ISO 27001**) are carried as control *metadata* (attributes), not an import standard — they identify which external framework a control satisfies.",
        ].join("\n"),
      },
    ],
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    for (let ci = 0; ci < CHAPTERS.length; ci++) {
      const chDef = CHAPTERS[ci];
      let chapter = await prisma.helpChapter.findFirst({ where: { collection: COLLECTION, slug: chDef.slug }, include: { sections: true } });
      if (!chapter) {
        const created = await prisma.helpChapter.create({ data: { collection: COLLECTION, slug: chDef.slug, title: chDef.title, sortOrder: ci } });
        chapter = { ...created, sections: [] };
        console.log(`Created chapter "${chDef.title}".`);
      } else {
        await prisma.helpChapter.update({ where: { id: chapter.id }, data: { title: chDef.title, sortOrder: ci } });
        console.log(`Chapter "${chDef.title}" exists — updating sections.`);
      }
      let i = 0;
      for (const s of chDef.sections) {
        const existing = chapter.sections.find((x) => x.heading === s.heading);
        if (existing) await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: s.body, sortOrder: i } });
        else await prisma.helpSection.create({ data: { chapterId: chapter.id, collection: COLLECTION, heading: s.heading, bodyMarkdown: s.body, sortOrder: i } });
        i++;
      }
    }
    console.log("Technical Design Notes seeded.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
