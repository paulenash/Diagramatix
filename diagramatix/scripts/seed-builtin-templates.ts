/**
 * Seed / refresh the built-in BPMN template library.
 *
 * - MERGES with the existing library: upsert by (name, diagramType) — updates
 *   group/description/thumbnail (and data for new fragments) if present, inserts
 *   if missing. The 12 pre-existing built-ins are carried from the exported
 *   `.diag_tems` file (data untouched) and given a description + a fresh thumbnail.
 * - Adds a broad set of new fragments across every BPMN category, laid out on a
 *   simple grid and routed by the real connector engine (recomputeAllConnectors).
 * - Every row gets a vector thumbnail (renderTemplateThumbnailSvg).
 *
 * BPMN only for now. Idempotent — safe to re-run.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/seed-builtin-templates.ts                          # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/seed-builtin-templates.ts # prod
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { recomputeAllConnectors } from "../app/lib/diagram/routing";
import { renderTemplateThumbnailSvg } from "../app/lib/diagram/templateThumbnail";
import type { DiagramElement, Connector, TemplateData, SymbolType, ConnectorType, Side, Point } from "../app/lib/diagram/types";

// ── Fragment spec → laid-out TemplateData ──────────────────────────────────
type Step = {
  k: string; type: SymbolType; label?: string; col: number; row?: number;
  gatewayType?: string; eventType?: string; repeatType?: string; subprocessType?: string;
  boundaryOf?: string; props?: Record<string, unknown>;
};
type Conn = { from: string; to: string; type?: ConnectorType; label?: string };
type Fragment = { name: string; group: string; description: string; steps: Step[]; conns: Conn[] };

const COL = 190, ROW = 120, TOP = 30;
function sizeFor(type: string): { w: number; h: number } {
  if (type === "task") return { w: 130, h: 66 };
  if (type === "subprocess") return { w: 150, h: 74 };
  if (type === "subprocess-expanded") return { w: 260, h: 150 };
  if (type === "gateway" || type === "fork-join") return { w: 46, h: 46 };
  if (type.endsWith("event")) return { w: 40, h: 40 };
  if (type === "data-object") return { w: 40, h: 52 };
  if (type === "data-store") return { w: 54, h: 50 };
  return { w: 120, h: 60 };
}

function buildFragment(f: Fragment): TemplateData {
  const byKey = new Map<string, DiagramElement>();
  const elements: DiagramElement[] = f.steps.map((s) => {
    const { w, h } = sizeFor(s.type);
    const cellCx = s.col * COL + 80;
    const cellCy = (s.row ?? 0) * ROW + TOP + 60;
    const el: DiagramElement = {
      id: s.k, type: s.type as DiagramElement["type"], label: s.label ?? "",
      x: cellCx - w / 2, y: cellCy - h / 2, width: w, height: h,
      properties: { ...(s.subprocessType ? { subprocessType: s.subprocessType } : {}), ...(s.props ?? {}) },
      ...(s.gatewayType ? { gatewayType: s.gatewayType as DiagramElement["gatewayType"] } : {}),
      ...(s.eventType ? { eventType: s.eventType as DiagramElement["eventType"] } : {}),
      ...(s.repeatType ? { repeatType: s.repeatType as DiagramElement["repeatType"] } : {}),
    } as DiagramElement;
    byKey.set(s.k, el);
    return el;
  });
  // boundary events: snap to the host's bottom edge
  for (const s of f.steps) {
    if (!s.boundaryOf) continue;
    const host = byKey.get(s.boundaryOf); const ev = byKey.get(s.k);
    if (host && ev) { ev.boundaryHostId = host.id; ev.x = host.x + host.width * 0.7; ev.y = host.y + host.height - ev.height / 2; }
  }
  const rawConnectors: Connector[] = f.conns.map((c, i) => ({
    id: `c${i}`, sourceId: c.from, targetId: c.to,
    type: (c.type ?? "sequence") as Connector["type"],
    directionType: "directed", routingType: "rectilinear",
    sourceSide: "right" as Side, targetSide: "left" as Side,
    sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
    sourceInvisibleLeader: false, targetInvisibleLeader: false,
    waypoints: [] as Point[], ...(c.label ? { label: c.label } : {}),
  }));
  const connectors = recomputeAllConnectors(rawConnectors, elements);
  return { elements, connectors };
}

// ── New fragments (BPMN) ───────────────────────────────────────────────────
const T = (k: string, label: string, col: number, row = 0): Step => ({ k, type: "task", label, col, row });
const X = (k: string, col: number, row = 0, label = ""): Step => ({ k, type: "gateway", gatewayType: "exclusive", label, col, row });
const START = (k: string, col: number, row = 0): Step => ({ k, type: "start-event", col, row });
const END = (k: string, col: number, row = 0, label = ""): Step => ({ k, type: "end-event", label, col, row });

const FRAGMENTS: Fragment[] = [
  // ── Starters ──
  { name: "Linear Process (3 steps)", group: "Starters", description: "A start event, three sequential tasks and an end — the default process spine to fill in.",
    steps: [START("s", 0), T("t1", "Step 1", 1), T("t2", "Step 2", 2), T("t3", "Step 3", 3), END("e", 4)],
    conns: [{ from: "s", to: "t1" }, { from: "t1", to: "t2" }, { from: "t2", to: "t3" }, { from: "t3", to: "e" }] },
  { name: "Happy Path + Exception", group: "Starters", description: "Main flow with an error boundary on the middle task diverting to a handler and a separate end.",
    steps: [START("s", 0), T("t1", "Do work", 1), T("t2", "Process", 2), END("e", 3), { k: "err", type: "intermediate-event", eventType: "error", col: 2, boundaryOf: "t2" }, T("h", "Handle error", 2, 1), END("e2", 3, 1, "Failed")],
    conns: [{ from: "s", to: "t1" }, { from: "t1", to: "t2" }, { from: "t2", to: "e" }, { from: "err", to: "h", type: "sequence" }, { from: "h", to: "e2" }] },

  // ── Gateways ──
  { name: "Exclusive (XOR) Decision", group: "Gateways", description: "A yes/no exclusive gateway splitting into two branches that re-merge.",
    steps: [T("t", "Assess", 0), X("g", 1, 0, "OK?"), T("y", "Proceed", 2, 0), T("n", "Reject", 2, 1), X("j", 3, 0), T("t2", "Continue", 4)],
    conns: [{ from: "t", to: "g" }, { from: "g", to: "y", label: "Yes" }, { from: "g", to: "n", label: "No" }, { from: "y", to: "j" }, { from: "n", to: "j" }, { from: "j", to: "t2" }] },
  { name: "Parallel Split & Join", group: "Gateways", description: "A parallel (AND) gateway running two tasks concurrently, joined before continuing.",
    steps: [T("t", "Prepare", 0), { k: "f", type: "gateway", gatewayType: "parallel", col: 1 }, T("a", "Task A", 2, 0), T("b", "Task B", 2, 1), { k: "j", type: "gateway", gatewayType: "parallel", col: 3 }, T("t2", "Combine", 4)],
    conns: [{ from: "t", to: "f" }, { from: "f", to: "a" }, { from: "f", to: "b" }, { from: "a", to: "j" }, { from: "b", to: "j" }, { from: "j", to: "t2" }] },
  { name: "Event-based Gateway", group: "Gateways", description: "Wait for whichever event arrives first — a message or a timer — then take that branch.",
    steps: [T("t", "Await response", 0), { k: "g", type: "gateway", gatewayType: "event-based", col: 1 }, { k: "m", type: "intermediate-event", eventType: "message", col: 2, row: 0 }, { k: "tm", type: "intermediate-event", eventType: "timer", col: 2, row: 1 }, T("a", "Handle reply", 3, 0), T("b", "Handle timeout", 3, 1)],
    conns: [{ from: "t", to: "g" }, { from: "g", to: "m" }, { from: "g", to: "tm" }, { from: "m", to: "a" }, { from: "tm", to: "b" }] },
  { name: "Complex Gateway (N-of-M)", group: "Gateways", description: "A complex gateway (✳) for conditions the standard gateways can't express, with three branches.",
    steps: [{ k: "g", type: "gateway", gatewayType: "complex", col: 0 }, T("a", "Path A", 1, 0), T("b", "Path B", 1, 1), T("c", "Path C", 1, 2)],
    conns: [{ from: "g", to: "a" }, { from: "g", to: "b" }, { from: "g", to: "c" }] },

  // ── Approvals ──
  { name: "Single Approval", group: "Approvals", description: "Submit → approve? → approved / rejected ends. The everyday sign-off pattern.",
    steps: [START("s", 0), T("sub", "Submit", 1), X("g", 2, 0, "Approved?"), END("ok", 3, 0, "Approved"), END("no", 3, 1, "Rejected")],
    conns: [{ from: "s", to: "sub" }, { from: "sub", to: "g" }, { from: "g", to: "ok", label: "Yes" }, { from: "g", to: "no", label: "No" }] },
  { name: "Two-eyes (Dual) Approval", group: "Approvals", description: "Two sequential approvers, each able to reject — the four-eyes control.",
    steps: [T("s", "Submit", 0), T("a1", "Reviewer 1", 1), T("a2", "Reviewer 2", 2), X("g", 3, 0, "Both OK?"), END("ok", 4, 0, "Approved"), END("no", 4, 1, "Rejected")],
    conns: [{ from: "s", to: "a1" }, { from: "a1", to: "a2" }, { from: "a2", to: "g" }, { from: "g", to: "ok", label: "Yes" }, { from: "g", to: "no", label: "No" }] },
  { name: "Approval with Rework Loop", group: "Approvals", description: "Rejected work routes back to the author for revision — a review cycle.",
    steps: [T("draft", "Draft", 0), T("review", "Review", 1), X("g", 2, 0, "Approved?"), END("ok", 3, 0, "Approved")],
    conns: [{ from: "draft", to: "review" }, { from: "review", to: "g" }, { from: "g", to: "ok", label: "Yes" }, { from: "g", to: "draft", label: "No — revise" }] },
  { name: "Approval with Escalation", group: "Approvals", description: "A timer boundary on the approval task escalates to a manager if it's not actioned in time.",
    steps: [T("a", "Approve request", 0), END("ok", 1, 0, "Done"), { k: "tm", type: "intermediate-event", eventType: "timer", col: 0, boundaryOf: "a", props: { interruptionType: "non-interrupting" } }, T("esc", "Escalate to manager", 0, 1)],
    conns: [{ from: "a", to: "ok" }, { from: "tm", to: "esc", type: "sequence" }] },

  // ── Exceptions ──
  { name: "Error Boundary + Handler", group: "Exceptions", description: "An interrupting error boundary event on a task diverts to an error-handling task.",
    steps: [T("t", "Risky task", 0), END("ok", 1, 0, "Done"), { k: "err", type: "intermediate-event", eventType: "error", col: 0, boundaryOf: "t" }, T("h", "Handle error", 0, 1), END("f", 1, 1, "Failed")],
    conns: [{ from: "t", to: "ok" }, { from: "err", to: "h", type: "sequence" }, { from: "h", to: "f" }] },
  { name: "Compensation Pair", group: "Exceptions", description: "A task with an edge-mounted compensation event linked to its compensating activity, plus an inline throwing compensation event that fires it. Runs in the simulator.",
    steps: [T("book", "Book hotel", 0), T("pay", "Charge card", 1), { k: "thr", type: "intermediate-event", eventType: "compensation", col: 2, props: { flowType: "throwing" } }, END("e", 3), { k: "comp", type: "intermediate-event", eventType: "compensation", col: 0, boundaryOf: "book", props: { flowType: "catching" } }, { k: "cancel", type: "task", label: "Cancel hotel", col: 0, row: 1, props: { isForCompensation: true } }],
    conns: [{ from: "book", to: "pay" }, { from: "pay", to: "thr" }, { from: "thr", to: "e" }, { from: "comp", to: "cancel", type: "associationBPMN" }] },
  { name: "Timeout / SLA Breach", group: "Exceptions", description: "A timer boundary catches an SLA breach on a task and routes to a timeout handler.",
    steps: [T("t", "Await action", 0), END("ok", 1, 0, "Done"), { k: "tm", type: "intermediate-event", eventType: "timer", col: 0, boundaryOf: "t" }, T("h", "Handle timeout", 0, 1)],
    conns: [{ from: "t", to: "ok" }, { from: "tm", to: "h", type: "sequence" }] },

  // ── Loops ──
  { name: "Rework Loop", group: "Loops", description: "A task loops back on a 'no' until a check passes.",
    steps: [T("t", "Do work", 0), X("g", 1, 0, "OK?"), T("next", "Continue", 2)],
    conns: [{ from: "t", to: "g" }, { from: "g", to: "next", label: "Yes" }, { from: "g", to: "t", label: "No" }] },
  { name: "Multi-instance (Parallel)", group: "Loops", description: "A task that runs once per item in parallel (multi-instance marker).",
    steps: [START("s", 0), { k: "t", type: "task", label: "For each line item", col: 1, repeatType: "mi-parallel" }, END("e", 2)],
    conns: [{ from: "s", to: "t" }, { from: "t", to: "e" }] },
  { name: "Multi-instance (Sequential)", group: "Loops", description: "A task that repeats once per item, one at a time (sequential multi-instance).",
    steps: [START("s", 0), { k: "t", type: "task", label: "Process each", col: 1, repeatType: "mi-sequential" }, END("e", 2)],
    conns: [{ from: "s", to: "t" }, { from: "t", to: "e" }] },

  // ── Sub-processes ──
  { name: "Collapsed Sub-process", group: "Sub-processes", description: "A collapsed sub-process between two tasks — a drill-through placeholder.",
    steps: [T("a", "Before", 0), { k: "sp", type: "subprocess", label: "Sub-process", col: 1 }, T("b", "After", 2)],
    conns: [{ from: "a", to: "sp" }, { from: "sp", to: "b" }] },
  { name: "Call Activity (reusable)", group: "Sub-processes", description: "A call activity (thick border) invoking a shared, globally-defined process.",
    steps: [T("a", "Prepare", 0), { k: "ca", type: "subprocess", label: "Run shared process", col: 1, subprocessType: "call" }, T("b", "Continue", 2)],
    conns: [{ from: "a", to: "ca" }, { from: "ca", to: "b" }] },

  // ── Events ──
  { name: "Scheduled Start", group: "Events", description: "A timer start event kicking off a process on a schedule.",
    steps: [{ k: "s", type: "start-event", eventType: "timer", col: 0 }, T("t", "Run job", 1), END("e", 2)],
    conns: [{ from: "s", to: "t" }, { from: "t", to: "e" }] },
  { name: "Message Start → End", group: "Events", description: "A message start event and a message end event bracketing a short flow.",
    steps: [{ k: "s", type: "start-event", eventType: "message", col: 0 }, T("t", "Handle message", 1), { k: "e", type: "end-event", eventType: "message", col: 2 }],
    conns: [{ from: "s", to: "t" }, { from: "t", to: "e" }] },
  { name: "Link (off-page) Pair", group: "Events", description: "A throwing link and a catching link to split a long diagram across the page.",
    steps: [T("a", "…earlier", 0), { k: "lt", type: "intermediate-event", eventType: "link", col: 1, props: { flowType: "throwing" } }, { k: "lc", type: "intermediate-event", eventType: "link", col: 0, row: 1, props: { flowType: "catching" } }, T("b", "…continues", 1, 1)],
    conns: [{ from: "a", to: "lt" }, { from: "lc", to: "b" }] },

  // ── Data ──
  { name: "Data Input / Output", group: "Data", description: "A task reading a data-object input and producing a data-object output.",
    steps: [{ k: "in", type: "data-object", label: "Input", col: 0, props: { role: "input" } }, T("t", "Transform", 1), { k: "out", type: "data-object", label: "Output", col: 2, props: { role: "output" } }],
    conns: [{ from: "in", to: "t", type: "associationBPMN" }, { from: "t", to: "out", type: "associationBPMN" }] },
  { name: "Data Store Read/Write", group: "Data", description: "A task reading from and writing to a data store (a persisted record).",
    steps: [{ k: "ds", type: "data-store", label: "Records", col: 1, row: 1 }, T("t", "Update record", 1, 0)],
    conns: [{ from: "ds", to: "t", type: "associationBPMN" }, { from: "t", to: "ds", type: "associationBPMN" }] },
];

// ── Existing 12 (carry from the exported .diag_tems, add descriptions) ──────
const EXISTING_DESCRIPTIONS: Record<string, string> = {
  "Perform Regular Task": "An event sub-process that performs an automatic regular task while its parent scope runs.",
  "Non-Interruptible Process Pattern": "A non-interrupting event sub-process that handles a mid-flow event without stopping the main process.",
  "Initial Multi-Lane Process (2 Lanes)": "A ready-to-fill two-lane pool with a hand-off between the lanes — a fast start for a collaboration.",
  "Automated Process": "A straight-through automated (system) process skeleton.",
  "Non-Interrupting Subprocess": "A non-interrupting sub-process fragment to drop into a larger flow.",
  "Expanded Subprocess Template": "An expanded sub-process with its own start, task and end inside.",
  "If then else Gateway": "A classic exclusive gateway with a then/else pair of branches.",
  "Event Gateway Template": "An event-based gateway waiting on competing events.",
  "Nested If / Decision Template": "Nested exclusive decisions for a multi-way branch.",
  "Simple Document Request Loop": "Request a document, check it, and loop back until it's received.",
  "More Complex Document Request Loop": "A richer document-request loop with additional checks and branches.",
  "Expanded Subprocess Loop": "An expanded sub-process wrapped in a loop.",
};

async function upsert(prisma: PrismaClient, row: { name: string; diagramType: string; group: string; description: string; data: TemplateData }) {
  const thumb = (() => { try { return renderTemplateThumbnailSvg(row.data) || null; } catch { return null; } })();
  const existing = await prisma.diagramTemplate.findFirst({ where: { name: row.name, diagramType: row.diagramType, templateType: "builtin" }, select: { id: true } });
  if (existing) {
    // Never overwrite an admin's curated fragment data; refresh metadata + thumbnail.
    await prisma.diagramTemplate.update({ where: { id: existing.id }, data: { group: row.group, description: row.description, thumbnailSvg: thumb } });
    return "updated" as const;
  }
  await prisma.diagramTemplate.create({
    data: {
      name: row.name, diagramType: row.diagramType, templateType: "builtin", group: row.group,
      description: row.description, thumbnailSvg: thumb,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: row.data as any, userId: (await firstSuperuserId(prisma)),
    },
  });
  return "created" as const;
}

let _suId: string | null = null;
async function firstSuperuserId(prisma: PrismaClient): Promise<string> {
  if (_suId) return _suId;
  const u = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!u) throw new Error("No users exist — cannot own built-in templates");
  _suId = u.id; return _suId;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let created = 0, updated = 0;
  try {
    // 1) New fragments
    for (const f of FRAGMENTS) {
      const data = buildFragment(f);
      const r = await upsert(prisma, { name: f.name, diagramType: "bpmn", group: f.group, description: f.description, data });
      r === "created" ? created++ : updated++;
      console.log(`  ${r === "created" ? "add   " : "update"} "${f.name}"  (${f.group})`);
    }
    // 2) Existing 12 — carry data from the export file, add description + thumbnail.
    const file = path.join(process.cwd(), "..", "new templates", "diagramatix-templates-builtin-2026-08-03.diag_tems");
    if (fs.existsSync(file)) {
      const exp = JSON.parse(fs.readFileSync(file, "utf8")) as { templates: Array<{ name: string; diagramType: string; group: string | null; data: TemplateData }> };
      for (const t of exp.templates) {
        const desc = EXISTING_DESCRIPTIONS[t.name] ?? "";
        const r = await upsert(prisma, { name: t.name, diagramType: t.diagramType, group: t.group ?? "Process Fragments", description: desc, data: t.data });
        r === "created" ? created++ : updated++;
        console.log(`  ${r === "created" ? "add   " : "update"} "${t.name}"  (existing)`);
      }
    } else {
      console.log(`  (existing .diag_tems not found at ${file} — skipping the carry-over of the original 12)`);
    }
    console.log(`\nDone. Created ${created}, updated ${updated}. Built-in BPMN templates now carry descriptions + SVG thumbnails.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
