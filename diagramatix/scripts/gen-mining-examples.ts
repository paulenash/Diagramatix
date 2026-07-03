/**
 * Generate the baked DiagramatixMINER example catalog (app/lib/mining/
 * miningExampleData.json) — self-contained + deterministic (seeded PRNG), so the
 * seed + tests stay free of file I/O. Regenerate with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix && npx tsx scripts/gen-mining-examples.ts
 *
 * The one starter example is the Accounts Payable invoice lifecycle: a ~200-case
 * January event log (→ a ready ProcessMiningRun with variants + performance) plus
 * TWO reference state machines — a permissive one (rework allowed, ~89% fitness)
 * and a strict one (no On Hold → In Progress, flags ~40 undocumented cases).
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { buildEventLog } from "../app/lib/mining/parseEventLog";
import { computePerformance } from "../app/lib/mining/performance";
import { layoutGenericDiagram } from "../app/lib/diagram/genericLayout";
import type { DiagramData } from "../app/lib/diagram/types";
import type { LogMapping } from "../app/lib/mining/types";
import type { MiningExamplePackage, MiningExampleDiagram } from "../app/lib/mining/examplePackage";

// ── seeded PRNG (mulberry32) ────────────────────────────────────────────────
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260131);
const rint = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

const HOUR = 3600000, MIN = 60000, DAY = 24 * HOUR;
const MONTH_END = Date.UTC(2026, 0, 31, 23, 59, 59);
const clerks = ["Alice Chen", "Ben Okoro", "Carla Reyes", "David Singh"];
const approvers = ["Emma Watts", "Frank Muller"];
const PAYMENT = "Payment Run";
const vendors = ["Acme Office Supplies", "Northwind Traders", "Globex Logistics", "Initech Software", "Umbrella Facilities", "Stark Industrial", "Wayne Utilities", "Soylent Catering", "Hooli Cloud", "Cyberdyne Systems", "Vandelay Imports", "Wonka Ingredients"];
const isWeekend = (ms: number) => { const g = new Date(ms).getUTCDay(); return g === 0 || g === 6; };
function randomArrival() { let ms; do { ms = Date.UTC(2026, 0, rint(1, 31), rint(8, 16), rint(0, 59), rint(0, 59)); } while (isWeekend(ms)); return ms; }
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

type Step = [activity: string, state: string, role: "clerk" | "approver" | "payment", gap: [number, number] | null];
const RECEIVE: Step = ["Receive Invoice", "Received", "clerk", null];
const BEGIN: Step = ["Begin Review", "In Progress", "clerk", [1, 30]];
const HOLD: Step = ["Place On Hold", "On Hold", "clerk", [1, 24]];
const RESUME: Step = ["Resume Review", "In Progress", "clerk", [12, 72]];
const APPROVE: Step = ["Approve Invoice", "Approved", "approver", [2, 40]];
const SCHEDULE: Step = ["Schedule Payment", "Ready to Pay", "clerk", [1, 12]];
const PAY: Step = ["Pay Invoice", "Paid", "payment", [12, 96]];
const CANCEL: Step = ["Cancel Invoice", "Cancelled", "clerk", [2, 48]];
const PATHS: Record<string, Step[]> = {
  happy: [RECEIVE, BEGIN, APPROVE, SCHEDULE, PAY],
  onHoldPaid: [RECEIVE, BEGIN, HOLD, RESUME, APPROVE, SCHEDULE, PAY],
  cancelInProg: [RECEIVE, BEGIN, CANCEL],
  cancelAfterHold: [RECEIVE, BEGIN, HOLD, CANCEL],
};
const MIX = [...Array(122).fill("happy"), ...Array(42).fill("onHoldPaid"), ...Array(20).fill("cancelInProg"), ...Array(16).fill("cancelAfterHold")];

const HEADERS = ["Invoice ID", "Vendor", "Amount", "Activity", "Timestamp", "Invoice Status", "Resource"];
const MAP: LogMapping = { caseId: "Invoice ID", activity: "Activity", timestamp: "Timestamp", state: "Invoice Status", resource: "Resource" };

function generateLogRows(): string[][] {
  const cases = MIX.map((type) => ({ type, arrival: randomArrival() })) as { type: string; arrival: number; id: string; vendor: string; clerk: string; approver: string }[];
  cases.sort((a, b) => a.arrival - b.arrival);
  cases.forEach((c, i) => { c.id = `INV-2026-${String(i + 1).padStart(4, "0")}`; c.vendor = pick(vendors); c.clerk = pick(clerks); c.approver = pick(approvers); });
  const rows: { id: string; vendor: string; amount: string; activity: string; state: string; resource: string; t: number }[] = [];
  for (const c of cases) {
    let t = c.arrival;
    for (const [activity, state, role, gap] of PATHS[c.type]) {
      if (gap) t += rint(gap[0], gap[1]) * HOUR + rint(0, 59) * MIN;
      if (t > MONTH_END) break;
      const resource = role === "clerk" ? c.clerk : role === "approver" ? c.approver : PAYMENT;
      rows.push({ id: c.id, vendor: c.vendor, amount: (rint(50, 4800) + rint(0, 99) / 100).toFixed(2), activity, state, resource, t });
    }
  }
  rows.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return rows.map((r) => [r.id, r.vendor, r.amount, r.activity, iso(r.t), r.state, r.resource]);
}

// ── reference state machines ────────────────────────────────────────────────
const INIT = "__init", FINAL = "__final";
const REF_ELEMENTS = [
  { id: INIT, type: "initial-state", label: "" },
  { id: FINAL, type: "final-state", label: "" },
  { id: "received", type: "state", label: "Received" },
  { id: "in-progress", type: "state", label: "In Progress" },
  { id: "on-hold", type: "state", label: "On Hold" },
  { id: "approved", type: "state", label: "Approved" },
  { id: "ready-to-pay", type: "state", label: "Ready to Pay" },
  { id: "paid", type: "state", label: "Paid" },
  { id: "cancelled", type: "state", label: "Cancelled" },
];
const T = (sourceId: string, targetId: string, label: string) => ({ sourceId, targetId, label, type: "transition" });
const CORE = [
  T(INIT, "received", "Receive Invoice"),
  T("received", "in-progress", "Begin Review"),
  T("in-progress", "on-hold", "Place On Hold"),
  T("in-progress", "approved", "Approve Invoice"),
  T("approved", "ready-to-pay", "Schedule Payment"),
  T("ready-to-pay", "paid", "Pay Invoice"),
  T("in-progress", "cancelled", "Cancel Invoice"),
  T("on-hold", "cancelled", "Cancel Invoice"),
  T("paid", FINAL, ""),
  T("cancelled", FINAL, ""),
];
const PERMISSIVE_CONNS = [CORE[0], CORE[1], CORE[2], T("on-hold", "in-progress", "Resume Review"), ...CORE.slice(3)];
const STRICT_CONNS = CORE; // no On Hold → In Progress

function buildRef(elements: typeof REF_ELEMENTS, connections: { sourceId: string; targetId: string; label: string; type: string }[]): DiagramData {
  const data = layoutGenericDiagram({ elements, connections }, "state-machine");
  for (const c of data.connectors) if (c.type === "transition" && c.label) { c.labelMode = "formal"; c.transitionEvent = c.label; }
  return data;
}

// ── assemble ────────────────────────────────────────────────────────────────
const rows = generateLogRows();
const log = buildEventLog(HEADERS, rows, MAP);
const performance = computePerformance(log.traces);

const diagrams: MiningExampleDiagram[] = [
  { key: "ap-reference", name: "AP Invoice Lifecycle (Reference)", type: "state-machine", data: buildRef(REF_ELEMENTS, PERMISSIVE_CONNS) },
  { key: "ap-strict", name: "AP Invoice Lifecycle (Strict — no rework)", type: "state-machine", data: buildRef(REF_ELEMENTS, STRICT_CONNS) },
];

const pkg: MiningExamplePackage = {
  version: 1,
  diagrams,
  run: {
    name: "Accounts Payable — January 2026",
    mapping: MAP,
    stats: log.stats,
    variants: log.variants,
    performance,
    referenceSmKey: "ap-reference",
  },
};

const example = {
  slug: "accounts-payable-invoice-lifecycle",
  title: "Accounts Payable — Invoice Lifecycle",
  concept: "Mine a real invoice process from an event log, then check it against the reference lifecycle.",
  description: [
    "A month of Accounts Payable activity — ~200 invoices flowing through **Received → In Progress → Approved → Ready to Pay → Paid**, with an On Hold rework loop and a Cancelled branch.",
    "",
    "**Discover** the implied BPMN and the entity lifecycle, run **Conformance** against the bundled **reference** state machine (~89% fitness — only in-flight invoices deviate), then switch to the **strict** reference (no rework) to watch it flag ~40 undocumented *On Hold → In Progress* cases. Finally hit **Calibrate & simulate** to turn the discovered process into a digital twin and watch invoices animate through it in the Simulator.",
  ].join("\n"),
  difficulty: "core",
  package: pkg,
};

const outFile = join(__dirname, "..", "app", "lib", "mining", "miningExampleData.json");
writeFileSync(outFile, JSON.stringify({ examples: [example] }, null, 2) + "\n", "utf8");
console.log(`Wrote ${outFile}`);
console.log(`  ${log.stats.cases} cases, ${log.stats.events} events, ${log.stats.variants} variants; clockUnit=${performance.clockUnit}`);
console.log(`  references: ${diagrams.map((d) => `${d.key} (${d.data.elements.length} el, ${d.data.connectors.length} conn)`).join(", ")}`);
