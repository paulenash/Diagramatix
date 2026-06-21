/**
 * Seed the Feature catalog with the 17 starting features.
 *
 * Idempotent: if a Feature with the same `name` already exists,
 * the script leaves it alone (doesn't overwrite admin edits). New
 * features are inserted with their draft fields populated and the
 * published* fields LEFT NULL — admin must hit "Publish All" in
 * the admin editor to make them live.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/seed-features.ts
 *
 * Or against prod:
 *   DATABASE_URL="<prod url>" npx tsx scripts/seed-features.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export const FEATURES: Array<{ name: string; summary: string; details: string }> = [
  {
    name: "Process Simulator",
    summary: "Run your BPMN as a discrete-event simulation — see where work queues, who the bottleneck is, and prove the cost case for a redesign before you change anything.",
    details: [
      "- Event-based engine — work items (tokens) flow over a simulated clock; tasks seize limited team capacity, so realistic queues and wait times emerge from contention",
      "- Annotate on the model — per-element arrival, cycle and wait times as statistical distributions (fixed, uniform, triangular, normal, exponential), edited in the Properties panel or a single Simulation Data table",
      "- Full BPMN behaviour — decision-branch probabilities and conditions, loops and multi-instance, expanded and event subprocesses (interrupting + non-interrupting)",
      "- Subprocess roll-up — a subprocess linked to its own diagram drills down and rolls its child's tasks, teams and times up into the parent (nested links and parallel instances included)",
      "- Shared team pools — teams are reusable resource pools shared across processes; one Study assembles a portfolio of diagrams to reveal cross-process overload",
      "- As-is vs To-be comparison — pin scenarios to different process variants and compare side by side with a plain-language verdict (e.g. \"28% faster, +12% throughput, $4.2k less per case, frees ~1.4 FTE\")",
      "- Cost & capacity planning — team cost-per-hour drives cost-per-case, total cost and savings, so a redesign has a business case, not just a speed number",
      "- Scenarios, what-ifs & planned interventions — duplicate a baseline, override a capacity or rate, or schedule a timed capacity surge / outage / demand spike / work injection",
      "- Monte-Carlo ranges — replications give mean / p50 / p95 ranges and a bottleneck ranking, not a single misleading number",
      "- Live Matrix replay + Operator — watch green tokens flow and stack at bottlenecks, then 'fork the timeline': intervene mid-run and re-run deterministically; plus a utilisation heatmap",
      "- Ready-made examples — load a worked example (loan origination, car-repair rework loop) into your own project and demo in two clicks",
      "- BPSim-aligned — parameters follow the OMG/WfMC BPSim standard, with import/export for interchange with other tools",
    ].join("\n"),
  },
  {
    name: "Multi-Notation Diagramming",
    summary: "One workspace for every diagram type your team needs — from BPMN to ArchiMate to UML.",
    details: [
      "- BPMN 2.0 — pools, lanes, sub-processes, gateways, events, message flows, boundary events",
      "- Process Context — system + actor diagrams with edge connection points",
      "- State Machine — initial / final / composite states, transitions with guards",
      "- Domain models — UML class + enumeration; relational (PK/FK/NOT NULL) variants",
      "- Value Chain (Porter-style)",
      "- ArchiMate — structural, dependency, and dynamic relations",
      "- Use Case — actors, system boundaries, use case ovals",
    ].join("\n"),
  },
  {
    name: "AI-Assisted BPMN Generation",
    summary: "Describe the process in plain English; Diagramatix builds a structured BPMN diagram you can refine.",
    details: [
      "- Natural-language prompt → end-to-end BPMN diagram in seconds",
      "- Generates pools, lanes, tasks, gateways, and events automatically",
      "- Editable AI rules so you control conventions (sub-process splitting, gateway types, naming)",
      "- Generation history per diagram — try multiple prompts, pick the best",
      "- Powered by Anthropic Claude",
    ].join("\n"),
  },
  {
    name: "Text-to-Diagram for Every Notation",
    summary: "AI generation isn't BPMN-only — describe it in plain English and generate Value Chain, Process Context, State Machine, Domain, Context and ArchiMate diagrams too.",
    details: [
      "- One AI generator across every notation Diagramatix supports — not just BPMN, but Value Chain, Process Context, State Machine, Domain (UML / relational), Context and ArchiMate",
      "- Particularly strong for Value Chain, Process Context and BPMN",
      "- Per-diagram-type, admin-editable AI rules so each notation follows your house conventions",
      "- Process Context generation auto-classifies actors, external systems and timer/hourglass participants",
      "- Attach a PDF or text file to feed extra context into the prompt",
      "- Generation history per diagram — try several prompts and keep the best",
    ].join("\n"),
  },
  {
    name: "Image to Diagram",
    summary: "Snap a whiteboard sketch, a screenshot, or someone else's flowchart and Diagramatix reverse-engineers it into an editable BPMN or flowchart.",
    details: [
      "- Attach a PNG / JPEG / WebP / GIF; AI vision + OCR read the shapes and labels off the picture",
      "- BPMN images: pools, lanes, tasks, gateways and events are mapped to their proper BPMN types, with labels read from the image",
      "- Turn a plain flowchart image INTO BPMN — rectangles become tasks, decision diamonds become exclusive gateways, ovals become start/end events, cylinders become data stores, and loose flow is wrapped in a white-box pool",
      "- The image is the source of truth; add a text prompt to layer on extra detail (rules, roles, message flows)",
      "- Comes in as a fully editable diagram — for BPMN, as a plan you can review before it's laid out",
      "- Available for Flowchart and BPMN diagrams",
    ].join("\n"),
  },
  {
    name: "Smart Connector Routing",
    summary: "Connectors that route cleanly around obstacles — no manual zig-zagging.",
    details: [
      "- Orthogonal (rectilinear), curvilinear (Bézier), and direct modes per connector",
      "- Automatic hump-over crossings where sequence flows pass each other",
      "- Smart endpoint slots on every side with edge-aware routing",
      "- Waypoint editing for fine-grained control without losing the auto-routing fallback",
    ].join("\n"),
  },
  {
    name: "Microsoft Visio Round-Trip",
    summary: "Author in Diagramatix, share with Visio users, get edits back — no loss in translation.",
    details: [
      "- Export any BPMN diagram as a native `.vsdx` file",
      "- Dedicated \"Diagramatix Shapes\" v1.6 stencil with proper BPMN markers",
      "- Re-import Visio-edited `.vsdx` back into Diagramatix with style preserved",
      "- Free downloadable stencil for recipients editing in Visio",
    ].join("\n"),
  },
  {
    name: "BPMN 2.0 XML Import",
    summary: "Bring diagrams in from any BPMN-compliant tool.",
    details: [
      "- Standard BPMN 2.0 XML parser (pools, lanes, tasks, gateways, events, message flows, sub-processes)",
      "- Layout heuristics auto-position elements when the XML lacks coordinates",
      "- Validation report flags unsupported BPMN features",
    ].join("\n"),
  },
  {
    name: "Cross-Functional Flowcharts (Pools / Lanes / Sub-Lanes)",
    summary: "Model your organisation as it really works — multi-pool, multi-lane, multi-sub-lane.",
    details: [
      "- Drag-drop pools onto the canvas; lanes auto-fit",
      "- Sub-lanes (lanes within lanes) for matrix orgs",
      "- Lane-and-pool grow-only on content add (no surprise shrinking)",
      "- Independent lane font sizes, header widths, and label rotation",
    ].join("\n"),
  },
  {
    name: "Drag-Drop Palette + Smart Editing UX",
    summary: "Built for fast iteration — drag, drop, type, done.",
    details: [
      "- Per-diagram-type palette (only relevant symbols)",
      "- Snap-to-element alignment guides while dragging",
      "- Insert Space — push everything to the right (or down) to make room",
      "- Focus-edit zoom — double-click any label and the canvas snaps to centre it for easy typing",
      "- Drop on a connector to insert an element mid-flow",
      "- Quick-add menu for one-click element creation at cursor",
    ].join("\n"),
  },
  {
    name: "Reusable Templates with Groups",
    summary: "Save your common patterns once; reuse them across every project.",
    details: [
      "- User-defined templates per diagram type",
      "- Group templates under named, collapsible headers",
      "- Built-in template library shipped with Diagramatix",
      "- Per-user collapse state remembered between sessions",
    ].join("\n"),
  },
  {
    name: "Drill-Down Navigation",
    summary: "Link diagrams together for true hierarchical process documentation.",
    details: [
      "- Sub-processes link to nested BPMN diagrams",
      "- Chevron-collapsed symbols link to any diagram type",
      "- One-click drill-back arrow returns to the parent diagram",
      "- \"Linked from\" list on every diagram shows its parents (auto-scanned)",
    ].join("\n"),
  },
  {
    name: "Project & Folder Organisation",
    summary: "Group diagrams by project, organise within folders, sort however you like.",
    details: [
      "- Multiple projects per user",
      "- Nested folder hierarchy within each project",
      "- Drag-and-drop reordering, or sort by name / modified date",
      "- Per-project sort preference remembered",
    ].join("\n"),
  },
  {
    name: "Properties Panel with Per-Element Configuration",
    summary: "Click any element and edit every property without leaving the canvas.",
    details: [
      "- Name, type, dimensions, colour",
      "- Type-specific properties: BPMN task type, gateway role, event trigger",
      "- UML attribute / operation editor for class diagrams",
      "- Connector waypoint, label offset, and arrow direction editing",
    ].join("\n"),
  },
  {
    name: "Custom Display Modes (Normal + Hand-Drawn)",
    summary: "Switch any diagram between polished and sketchy with one click.",
    details: [
      "- Normal mode: clean, presentation-ready output",
      "- Hand-drawn mode: sketch-style strokes, monochrome",
      "- Per-diagram setting (some can be polished, others draft)",
      "- Export reflects the display mode",
    ].join("\n"),
  },
  {
    name: "Configurable Colour Themes per Project & per Diagram",
    summary: "Match your brand or process taxonomy with custom colours.",
    details: [
      "- Per-symbol-type colour overrides",
      "- Project-wide theme that all diagrams inherit by default",
      "- Per-diagram override when a specific diagram needs different colours",
      "- Black & white \"hand-drawn\" override",
    ].join("\n"),
  },
  {
    name: "Bulk Visio Export",
    summary: "Export every BPMN diagram in a project as one multi-page `.vsdx` file.",
    details: [
      "- One Visio page per diagram, ordered alphabetically",
      "- Single download for an entire project's worth of process documentation",
      "- Non-BPMN diagrams skipped silently",
      "- Round-trips on bulk import too",
    ].join("\n"),
  },
  {
    name: "Backup & Restore",
    summary: "One-click full-account snapshot to a portable `.diag` file.",
    details: [
      "- Every project, diagram, template, user preference in one file",
      "- Restore brings everything back as it was",
      "- Use for moving between accounts, archival, or \"try this on a copy\"",
    ].join("\n"),
  },
  {
    name: "Diagram Title Block with Version / Authors / Status",
    summary: "Professional title block stamp for every diagram.",
    details: [
      "- Free-text version string + authors list",
      "- Status: Draft / Final / Production with visual badge",
      "- Per-diagram toggle to show or hide",
      "- Renders in export files too",
    ].join("\n"),
  },
  {
    name: "Tiered Subscriptions with Self-Serve Upgrade",
    summary: "Start free, upgrade when you need more — at any time.",
    details: [
      "- 30-day free trial covers every feature",
      "- Three paid tiers (Introductory / Professional / Expert) with progressively higher limits",
      "- Self-serve checkout (Stripe), self-serve cancellation, no support call required",
      "- AUD billing; international cards accepted",
    ].join("\n"),
  },
  {
    name: "Collaboration & Diagram Review",
    summary: "Circulate a diagram to colleagues, gather comments, and track sign-off — all inside Diagramatix.",
    details: [
      "- Collaboration Groups: invite teammates by name or email, with in-app notifications, accept/decline, leave, remove, and ownership transfer",
      "- Send any diagram to one or more groups with an objective and a due date",
      "- Reviewers comment directly on the diagram — drag a pink Review Comment onto any element; it auto-links and is tagged with the reviewer",
      "- Dashboard collections for diagrams Received and Sent for review, colour-coded by due date",
      "- Live reviewer statuses (pending / in-progress / submitted / approved / declined) with Approve, Submit, and Decline actions",
      "- Owner controls: filter comments by reviewer, re-submit for a fresh approval round, and finish the review when done",
    ].join("\n"),
  },
  {
    name: "Publishing & Review Lifecycle",
    summary: "Publish a versioned diagram — or a whole bundle of related diagrams — to a business-user audience, with scheduled re-review reminders so process maps never silently go stale.",
    details: [
      "- Draft → Published lifecycle: publishing snapshots an immutable Published Version; readers always see the latest non-superseded version, and the history is kept",
      "- Publication Bundles: publish a set of related diagrams together (root diagrams plus the sub-processes they link to) as one release, with release notes",
      "- Business-user audiences: share a bundle with named colleagues, or invite by email — an invitee is promoted into the audience automatically when they sign up",
      "- Read-only viewer: audience members open a clean, navigable view and drill across linked diagrams, with no edit access",
      "- Scheduled re-review: set a next-review date or a review cadence; Diagramatix fires an automatic 'review due' reminder when it's time",
      "- Supersede & revoke: a new version supersedes the previous one; archiving a bundle revokes its audience grants",
    ].join("\n"),
  },
  {
    name: "Diagram-Type Colour Identity",
    summary: "Every diagram type gets a 2-character code and a distinct pastel colour, so you can tell process types apart at a glance.",
    details: [
      "- 2-character badges (BP, CO, PC, SM, DM, VC, AM) in the project navigation tree",
      "- Colour-coded diagram tiles on the dashboard and project screens — for every user, including business viewers",
      "- The editor's top bar is tinted to the diagram type, with the type name highlighted in its colour",
      "- Consistent type chips everywhere a diagram type is shown",
      "- SuperAdmin-editable: change any code or colour and it flows across the whole app",
    ].join("\n"),
  },
  {
    name: "Guided Backups with Live Progress",
    summary: "See exactly what will be backed up, choose who to include, and watch it happen — with a report at the end.",
    details: [
      "- Pre-flight preview: a stats table of everything that will be captured before you commit",
      "- OrgAdmins pick which members to back up; SuperAdmins scope to All Orgs or a single Org's selected users",
      "- Live per-section progress streamed as the backup is built, then a statistical report (rows per section, total, file size)",
      "- The same guided experience across user, Org, full-system, AI Rules & Prompts, and built-in template exports",
      "- Restores are additive and fully transactional — all-or-nothing, never a half-restored set",
    ].join("\n"),
  },
  {
    name: "SharePoint & OneDrive Integration",
    summary: "Sign in with Microsoft, save and open diagrams in SharePoint or OneDrive, and link Data Objects to live documents.",
    details: [
      "- Sign in with your Microsoft (Entra) account alongside email / password",
      "- Save a diagram's data files — XML + matching XSD + JSON (and Visio .vsdx for BPMN) — straight into a SharePoint or OneDrive folder",
      "- Open those files back from SharePoint / OneDrive into Diagramatix",
      "- Browse your SharePoint sites, document libraries and OneDrive with a built-in file picker",
      "- Link a Data Object or Data Store to a SharePoint / OneDrive file",
      "- Preview the linked file embedded in the editor, with a link badge on the shape",
    ].join("\n"),
  },
  {
    name: "Project Sharing with Roles",
    summary: "Share a project with the people who need it — View or Edit, per project, anytime.",
    details: [
      "- Owner picks any registered user by name or email and grants View or Edit access",
      "- View users see the project read-only; Edit users mutate diagrams but cannot delete the project or any of its diagrams",
      "- Shared projects show up on the recipient's dashboard with an amber tile and the owner's name + email",
      "- New per-diagram \"Diagram Owner\" field assigns accountability to a specific person without changing access",
      "- Recipients see who else is in the share — transparency about who's in the room",
      "- Cross-organisation sharing is allowed or blocked per-organisation by the Org admin",
    ].join("\n"),
  },
  {
    name: "Organisation Admin & Settings",
    summary: "Designate organisation administrators with project-share oversight, configurable per-organisation sharing policies, and silent admin membership.",
    details: [
      "- New OrgAdmin role for designated organisation administrators",
      "- Project Sharing oversight page lists every shared project in the organisation with owner, recipients, and inline share-list editing",
      "- Silent membership: OrgAdmins (and platform SuperAdmins) act as project owners for share management without ever appearing in any share list",
      "- Open any shared project as a full silent editor — full access without an audit footprint in the share UI",
      "- Org Settings page toggles whether cross-organisation sharing is allowed",
      "- SuperAdmin can assign or revoke the OrgAdmin role per user",
    ].join("\n"),
  },
  {
    name: "Entity Lists — Governed Pool & Lane Naming",
    summary: "Name BPMN pools and lanes from a maintained Organisation hierarchy, external-participant list and IT-systems list — consistent across every diagram.",
    details: [
      "- Maintain three reusable lists per Organisation: External Participants, IT Systems, and an Organisation → Org Unit → Team → Role hierarchy",
      "- Each Project adopts an org structure as its own editable copy, so projects tailor names without touching the master",
      "- Renaming a white-box Pool pre-fills the default Organisation name and shows the whole indented structure; type to filter, press Enter to accept, or pick any level",
      "- Lanes draw from the same hierarchy; black-box pools draw from the External Participants or IT Systems list",
      "- A brand-new name prompts where it belongs in the hierarchy and is saved to the project structure on the spot",
      "- Maintained by Project Owners, OrgAdmins and SuperAdmins, with role-appropriate options",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  try {
    let inserted = 0;
    let skipped = 0;
    for (let i = 0; i < FEATURES.length; i++) {
      const f = FEATURES[i];
      const existing = await prisma.feature.findFirst({ where: { name: f.name } });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.feature.create({
        data: {
          name: f.name,
          summary: f.summary,
          details: f.details,
          sortOrder: (i + 1) * 10,
        },
      });
      inserted++;
    }
    console.log(`Done. Inserted ${inserted}, skipped ${skipped} existing.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when invoked directly (not when imported, e.g. by sync-features.ts
// which reuses the FEATURES list).
if (process.argv[1]?.endsWith("seed-features.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
