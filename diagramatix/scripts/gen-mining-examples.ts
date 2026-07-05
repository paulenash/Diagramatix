/**
 * Generate the baked DiagramatixMINER example catalog (app/lib/mining/
 * miningExampleData.json) — self-contained + deterministic (seeded PRNG), so the
 * seed + tests stay free of file I/O. Regenerate with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix && npx tsx scripts/gen-mining-examples.ts
 *
 * The one starter example is the Accounts Payable invoice lifecycle: THREE
 * choosable ~200-case event logs (Jan 2025, Jul 2025, Jan 2026 — the same process
 * with compliance declining the further back in time you go) plus TWO reference
 * state machines — a permissive one (rework allowed, ~89% fitness on the current
 * month) and a strict one (no On Hold → In Progress). The current month backs the
 * run's stats; the others are offered as alternative scenarios on entry.
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

const HOUR = 3600000, MIN = 60000;
const clerks = ["Alice Chen", "Ben Okoro", "Carla Reyes", "David Singh"];
const approvers = ["Emma Watts", "Frank Muller"];
const PAYMENT = "Payment Run";
const vendors = ["Acme Office Supplies", "Northwind Traders", "Globex Logistics", "Initech Software", "Umbrella Facilities", "Stark Industrial", "Wayne Utilities", "Soylent Catering", "Hooli Cloud", "Cyberdyne Systems", "Vandelay Imports", "Wonka Ingredients"];
const isWeekend = (ms: number) => { const g = new Date(ms).getUTCDay(); return g === 0 || g === 6; };
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

type Step = [activity: string, state: string, role: "clerk" | "approver" | "payment", gap: [number, number] | null];
const RECEIVE: Step = ["Receive Invoice", "Received", "clerk", null];
const BEGIN: Step = ["Begin Review", "In Progress", "clerk", [1, 30]];
const HOLD: Step = ["Place On Hold", "On Hold", "clerk", [1, 24]];
const RESUME: Step = ["Resume Review", "In Progress", "clerk", [12, 72]];
const APPROVE: Step = ["Approve Invoice", "Approved", "approver", [2, 40]];
const SCHEDULE: Step = ["Schedule Payment", "Ready to Pay", "clerk", [1, 12]];
const PAY: Step = ["Pay Invoice", "Paid", "payment", [12, 96]];
const CANCEL: Step = ["Cancel Invoice", "Cancelled", "clerk", [2, 48]];
// Deviant steps — these drive conformance DOWN against the reference lifecycle.
const DISPUTE: Step = ["Raise Dispute", "Disputed", "clerk", [2, 24]];       // "Disputed" is an unknown state
const RESOLVE: Step = ["Resolve Dispute", "In Progress", "clerk", [12, 72]];
const REOPEN: Step = ["Reopen Invoice", "In Progress", "clerk", [24, 120]];  // Paid → In Progress (Paid not terminal)
const PATHS: Record<string, Step[]> = {
  happy: [RECEIVE, BEGIN, APPROVE, SCHEDULE, PAY],
  onHoldPaid: [RECEIVE, BEGIN, HOLD, RESUME, APPROVE, SCHEDULE, PAY],
  cancelInProg: [RECEIVE, BEGIN, CANCEL],
  cancelAfterHold: [RECEIVE, BEGIN, HOLD, CANCEL],
  // ── deviations (undocumented vs the reference; more of these further back in time) ──
  skipApprove: [RECEIVE, BEGIN, SCHEDULE, PAY],                 // In Progress → Ready to Pay (skips Approve)
  payNoSchedule: [RECEIVE, BEGIN, APPROVE, PAY],                // Approved → Paid (skips scheduling)
  disputed: [RECEIVE, BEGIN, DISPUTE, RESOLVE, APPROVE, SCHEDULE, PAY],  // via unknown "Disputed" state
  reopened: [RECEIVE, BEGIN, APPROVE, SCHEDULE, PAY, REOPEN],   // reopened after payment
};

const HEADERS = ["Invoice ID", "Vendor", "Amount", "Activity", "Timestamp", "Invoice Status", "Resource"];
const MAP: LogMapping = { caseId: "Invoice ID", activity: "Activity", timestamp: "Timestamp", state: "Invoice Status", resource: "Resource" };

interface PeriodCfg {
  seed: number; year: number; monthIndex: number; monthLabel: string;
  slow: number;                    // gap multiplier — older periods run slower
  mix: Record<string, number>;     // path type → count (≈200 total)
  note: string;                    // one-line chooser description (label = monthLabel)
}

interface SampleLog {
  fileName: string; runName: string; headers: string[]; rows: string[][];
  mapping: LogMapping; scenario: string; note: string;
}

function buildPeriod(cfg: PeriodCfg): SampleLog {
  const rnd = mulberry32(cfg.seed);
  const rint = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const monthDays = DAYS_IN_MONTH[cfg.monthIndex];
  const monthEnd = Date.UTC(cfg.year, cfg.monthIndex, monthDays, 23, 59, 59);
  const randomArrival = () => { let ms; do { ms = Date.UTC(cfg.year, cfg.monthIndex, rint(1, monthDays), rint(8, 16), rint(0, 59), rint(0, 59)); } while (isWeekend(ms)); return ms; };

  const mix: string[] = [];
  for (const [type, n] of Object.entries(cfg.mix)) for (let i = 0; i < n; i++) mix.push(type);

  const cases = mix.map((type) => ({ type, arrival: randomArrival() })) as { type: string; arrival: number; id: string; vendor: string; clerk: string; approver: string }[];
  cases.sort((a, b) => a.arrival - b.arrival);
  cases.forEach((c, i) => { c.id = `INV-${cfg.year}-${String(i + 1).padStart(4, "0")}`; c.vendor = pick(vendors); c.clerk = pick(clerks); c.approver = pick(approvers); });
  const rows: { id: string; vendor: string; amount: string; activity: string; state: string; resource: string; t: number }[] = [];
  for (const c of cases) {
    let t = c.arrival;
    for (const [activity, state, role, gap] of PATHS[c.type]) {
      if (gap) t += Math.round(rint(gap[0], gap[1]) * cfg.slow) * HOUR + rint(0, 59) * MIN;
      if (t > monthEnd) break;
      const resource = role === "clerk" ? c.clerk : role === "approver" ? c.approver : PAYMENT;
      rows.push({ id: c.id, vendor: c.vendor, amount: (rint(50, 4800) + rint(0, 99) / 100).toFixed(2), activity, state, resource, t });
    }
  }
  rows.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return {
    fileName: `accounts-payable-${cfg.monthLabel.toLowerCase().replace(/[()]/g, "").trim().replace(/ +/g, "-")}.csv`,
    runName: `Accounts Payable — ${cfg.monthLabel}`,
    headers: HEADERS,
    rows: rows.map((r) => [r.id, r.vendor, r.amount, r.activity, iso(r.t), r.state, r.resource]),
    mapping: MAP,
    scenario: cfg.monthLabel,
    note: cfg.note,
  };
}

// Compliance DECLINES the further back in time you go. Each ≈200 invoices.
const PERIODS: PeriodCfg[] = [
  {
    seed: 20250131, year: 2025, monthIndex: 0, monthLabel: "January 2025", slow: 1.6,
    note: "Oldest — lowest compliance. Approvals routinely skipped, payments made without scheduling, a non-standard \"Disputed\" state in play, and invoices even reopened after payment. Slowest cycle times.",
    mix: { happy: 62, onHoldPaid: 26, cancelInProg: 16, cancelAfterHold: 10, skipApprove: 34, payNoSchedule: 24, disputed: 18, reopened: 10 },
  },
  {
    seed: 20250731, year: 2025, monthIndex: 6, monthLabel: "July 2025", slow: 1.3,
    note: "Mid-period — improving but still off-book. Some approvals skipped and a handful paid without scheduling; a few disputed cases. Moderate delays.",
    mix: { happy: 96, onHoldPaid: 34, cancelInProg: 18, cancelAfterHold: 12, skipApprove: 20, payNoSchedule: 12, disputed: 8 },
  },
  {
    seed: 20260131, year: 2026, monthIndex: 0, monthLabel: "January 2026 (current)", slow: 1.0,
    note: "Current — highest compliance. Nearly every invoice follows the reference lifecycle; only in-flight month-end cases deviate. Fastest cycle times.",
    mix: { happy: 122, onHoldPaid: 42, cancelInProg: 20, cancelAfterHold: 16 },
  },
];

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
// Three past periods of the SAME process, compliance declining the further back
// you go. The learner chooses one on entry; the "current" (Jan 2026) is the
// recommended default and backs the run's stats.
const sampleLogs = PERIODS.map(buildPeriod);                 // [jan2025, jul2025, jan2026]
const current = sampleLogs[sampleLogs.length - 1];           // Jan 2026 (best compliance)
const log = buildEventLog(current.headers, current.rows, current.mapping);
const performance = computePerformance(log.traces);

const diagrams: MiningExampleDiagram[] = [
  { key: "ap-reference", name: "AP Invoice Lifecycle (Reference)", type: "state-machine", data: buildRef(REF_ELEMENTS, PERMISSIVE_CONNS) },
  { key: "ap-strict", name: "AP Invoice Lifecycle (Strict — no rework)", type: "state-machine", data: buildRef(REF_ELEMENTS, STRICT_CONNS) },
];

const pkg: MiningExamplePackage = {
  version: 1,
  diagrams,
  run: {
    name: current.runName,
    mapping: MAP,
    stats: log.stats,
    variants: log.variants,
    performance,
    referenceSmKey: "ap-reference",
  },
  // The recommended/default log (the console pre-loads this one, back-compat).
  sampleLog: { ...current },
  // The full set of choosable scenarios (chronological, worst → current).
  sampleLogs: sampleLogs.map((s) => ({ ...s })),
};

const example = {
  slug: "accounts-payable-invoice-lifecycle",
  title: "Accounts Payable — Invoice Lifecycle",
  concept: "Mine a real invoice process from an event log, then check it against the reference lifecycle.",
  description: [
    "A month of Accounts Payable activity — ~200 invoices flowing through **Received → In Progress → Approved → Ready to Pay → Paid**, with an On Hold rework loop and a Cancelled branch.",
    "",
    "Choose one of **three past periods** on entry — **January 2025**, **July 2025** or the **current January 2026** — the same process but with **compliance declining the further back in time you go**: older months skip approvals, pay without scheduling, run a non-standard *Disputed* state and even reopen paid invoices, and they run slower.",
    "",
    "**Discover** the implied BPMN and the entity lifecycle, run **Conformance** against the bundled **reference** state machine (the current month scores ~89% — only in-flight invoices deviate; older months score far lower), then switch to the **strict** reference (no rework) to flag undocumented *On Hold → In Progress* cases. Finally hit **Calibrate & simulate** to turn the discovered process into a digital twin and watch invoices animate through it in the Simulator. Every mining run is saved — re-select it to replay its discovered process, lifecycle and conformance.",
  ].join("\n"),
  difficulty: "core",
  package: pkg,
};

// ── Order-to-Cash example ────────────────────────────────────────────────────
// A second mining example whose deviations line up EXACTLY with the monitor
// signatures on the Order-to-Cash sample GRC library (app/lib/riskControls/
// o2cSample.ts), so once this log is mined the Risk-Control Matrix shows control
// operating-effectiveness. Order lifecycle:
//   Received → Credit Check → Approved (or On Credit Hold → Approved) →
//   Fulfilled → Invoiced → Paid   (+ Cancelled / off-book Disputed exceptions)
const O2C_HEADERS = ["Order ID", "Customer", "Amount", "Activity", "Timestamp", "Order Status", "Resource"];
const O2C_MAP: LogMapping = { caseId: "Order ID", activity: "Activity", timestamp: "Timestamp", state: "Order Status", resource: "Resource" };
const O2C_END = Date.UTC(2026, 1, 28, 23, 59, 59);
const salesReps = ["Nadia Rahman", "Tom Becker", "Priya Nair", "Luis Ortega"];
const O2C_ROLE: Record<string, string> = { sales: "", credit: "Credit Desk", approver: "Order Desk", warehouse: "Fulfilment Centre", billing: "Billing System" };
const o2cCustomers = ["Acme Retail", "Globex Stores", "Initech Ltd", "Umbrella Group", "Wayne Enterprises", "Soylent Foods", "Hooli Inc", "Stark Traders", "Vandelay Co", "Wonka Brands"];

type O2Step = [activity: string, state: string, role: string, gap: [number, number] | null];
const OS_RECEIVE: O2Step = ["Receive Order", "Received", "sales", null];
const OS_CREDIT: O2Step = ["Run Credit Check", "Credit Check", "credit", [1, 8]];
const OS_HOLD: O2Step = ["Place On Credit Hold", "On Credit Hold", "credit", [1, 12]];
const OS_RELEASE: O2Step = ["Release Credit Hold", "Approved", "credit", [4, 48]];
const OS_APPROVE: O2Step = ["Approve Order", "Approved", "approver", [1, 12]];
const OS_FULFIL: O2Step = ["Fulfil Order", "Fulfilled", "warehouse", [4, 48]];
const OS_SHIP: O2Step = ["Ship Goods", "Fulfilled", "warehouse", [4, 48]];       // used on deviant skip paths
const OS_INVOICE: O2Step = ["Invoice Customer", "Invoiced", "billing", [1, 24]];
const OS_PAY: O2Step = ["Receive Payment", "Paid", "billing", [24, 240]];
const OS_CANCEL: O2Step = ["Cancel Order", "Cancelled", "sales", [1, 24]];
const OS_DISPUTE: O2Step = ["Raise Dispute", "Disputed", "sales", [2, 48]];       // Disputed = off-book (unknown) state
const OS_RESOLVE: O2Step = ["Resolve Dispute", "Invoiced", "billing", [12, 120]];
const O2C_PATHS: Record<string, O2Step[]> = {
  happy: [OS_RECEIVE, OS_CREDIT, OS_APPROVE, OS_FULFIL, OS_INVOICE, OS_PAY],
  onHold: [OS_RECEIVE, OS_CREDIT, OS_HOLD, OS_RELEASE, OS_FULFIL, OS_INVOICE, OS_PAY],
  cancelEarly: [OS_RECEIVE, OS_CREDIT, OS_CANCEL],
  cancelHold: [OS_RECEIVE, OS_CREDIT, OS_HOLD, OS_CANCEL],
  // ── deviations matching the O2C control monitor signatures ──
  creditBypass: [OS_RECEIVE, OS_APPROVE, OS_FULFIL, OS_INVOICE, OS_PAY],           // Received → Approved (skip credit check)
  fulfilNoApproval: [OS_RECEIVE, OS_SHIP, OS_INVOICE, OS_PAY],                     // Received → Fulfilled (skip approval)
  shipOnHold: [OS_RECEIVE, OS_CREDIT, OS_HOLD, OS_SHIP, OS_INVOICE, OS_PAY],       // On Credit Hold → Fulfilled
  disputed: [OS_RECEIVE, OS_CREDIT, OS_APPROVE, OS_FULFIL, OS_INVOICE, OS_DISPUTE, OS_RESOLVE, OS_PAY],  // off-book Disputed
};
const O2C_MIX: string[] = [
  ...Array(110).fill("happy"), ...Array(30).fill("onHold"), ...Array(15).fill("cancelEarly"), ...Array(10).fill("cancelHold"),
  ...Array(15).fill("creditBypass"), ...Array(8).fill("fulfilNoApproval"), ...Array(7).fill("shipOnHold"), ...Array(5).fill("disputed"),
];

function buildO2CLog() {
  const rnd = mulberry32(20260228);
  const rint = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const arrival = () => { let ms; do { ms = Date.UTC(2026, 1, rint(1, 28), rint(8, 16), rint(0, 59), rint(0, 59)); } while (isWeekend(ms)); return ms; };
  const cases = O2C_MIX.map((type) => ({ type, arrival: arrival() })) as { type: string; arrival: number; id: string; customer: string; rep: string }[];
  cases.sort((a, b) => a.arrival - b.arrival);
  cases.forEach((c, i) => { c.id = `SO-2026-${String(i + 1).padStart(4, "0")}`; c.customer = pick(o2cCustomers); c.rep = pick(salesReps); });
  const rows: { id: string; customer: string; amount: string; activity: string; state: string; resource: string; t: number }[] = [];
  for (const c of cases) {
    let t = c.arrival;
    for (const [activity, state, role, gap] of O2C_PATHS[c.type]) {
      if (gap) t += rint(gap[0], gap[1]) * HOUR + rint(0, 59) * MIN;
      if (t > O2C_END) break;
      const resource = role === "sales" ? c.rep : (O2C_ROLE[role] || role);
      rows.push({ id: c.id, customer: c.customer, amount: (rint(200, 48000) + rint(0, 99) / 100).toFixed(2), activity, state, resource, t });
    }
  }
  rows.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return {
    fileName: "order-to-cash-february-2026.csv", runName: "Order-to-Cash — February 2026",
    headers: O2C_HEADERS, mapping: O2C_MAP,
    rows: rows.map((r) => [r.id, r.customer, r.amount, r.activity, iso(r.t), r.state, r.resource]),
  };
}

const O2C_REF_ELEMENTS = [
  { id: INIT, type: "initial-state", label: "" },
  { id: FINAL, type: "final-state", label: "" },
  { id: "received", type: "state", label: "Received" },
  { id: "credit-check", type: "state", label: "Credit Check" },
  { id: "on-hold", type: "state", label: "On Credit Hold" },
  { id: "approved", type: "state", label: "Approved" },
  { id: "fulfilled", type: "state", label: "Fulfilled" },
  { id: "invoiced", type: "state", label: "Invoiced" },
  { id: "paid", type: "state", label: "Paid" },
  { id: "cancelled", type: "state", label: "Cancelled" },
];
const O2C_CONNS = [
  T(INIT, "received", "Receive Order"),
  T("received", "credit-check", "Run Credit Check"),
  T("credit-check", "approved", "Approve Order"),
  T("credit-check", "on-hold", "Place On Credit Hold"),
  T("on-hold", "approved", "Release Credit Hold"),
  T("approved", "fulfilled", "Fulfil Order"),
  T("fulfilled", "invoiced", "Invoice Customer"),
  T("invoiced", "paid", "Receive Payment"),
  T("credit-check", "cancelled", "Cancel Order"),
  T("on-hold", "cancelled", "Cancel Order"),
  T("paid", FINAL, ""),
  T("cancelled", FINAL, ""),
];

const o2cSampleLog = buildO2CLog();
const o2cLog = buildEventLog(o2cSampleLog.headers, o2cSampleLog.rows, o2cSampleLog.mapping);
const o2cPerformance = computePerformance(o2cLog.traces);
const o2cExample = {
  slug: "order-to-cash-lifecycle",
  title: "Order-to-Cash — Order Lifecycle",
  concept: "Mine a real sales-order process, check it against the reference lifecycle, and prove control effectiveness.",
  description: [
    "A month of Order-to-Cash activity — ~200 sales orders flowing through **Received → Credit Check → Approved → Fulfilled → Invoiced → Paid**, with an On Credit Hold branch and a Cancelled branch.",
    "",
    "The log deliberately contains the control-failure patterns an auditor cares about: orders **approved without a credit check**, orders **fulfilled without approval**, goods **shipped while on credit hold**, and an off-book **Disputed** status. Discover the lifecycle, run **Conformance** against the bundled reference state machine (~66% fitness — the off-book cases + in-flight orders deviate), then — after adopting the **Order-to-Cash Sample GRC Library** into the same project — map each control to the deviation it guards to see its **operating effectiveness** (“bypassed in N of 200 cases”) right in the Risk-Control Matrix.",
  ].join("\n"),
  difficulty: "core",
  package: {
    version: 1 as const,
    diagrams: [{ key: "o2c-reference", name: "Order Lifecycle (Reference)", type: "state-machine", data: buildRef(O2C_REF_ELEMENTS, O2C_CONNS) }],
    run: { name: o2cSampleLog.runName, mapping: O2C_MAP, stats: o2cLog.stats, variants: o2cLog.variants, performance: o2cPerformance, referenceSmKey: "o2c-reference" },
    sampleLog: { ...o2cSampleLog },
  } as MiningExamplePackage,
};

// ── Service Desk example — NO STATE COLUMN (Change A) ────────────────────────
// A classic activity-only event log (Case, Activity, Timestamp, Agent) — the
// smallest useful log, exactly what most tools export. There is NO state column;
// the Activity→State table supplies the lifecycle the miner + the State Machine
// need. The bundled mapping ships that table so the console pre-fills it.
const SD_HEADERS = ["Ticket ID", "Channel", "Priority", "Activity", "Timestamp", "Agent"];   // ← no state column
const SD_ACTIVITY_STATE: Record<string, string> = {
  "Log Ticket": "Logged", "Triage": "Triaged", "Assign": "Assigned", "Investigate": "Investigating",
  "Escalate": "Escalated", "Resolve": "Resolved", "Close": "Closed", "Reopen": "Investigating",
};
const SD_MAP: LogMapping = { caseId: "Ticket ID", activity: "Activity", timestamp: "Timestamp", resource: "Agent", activityState: SD_ACTIVITY_STATE };
const sdAgents = ["Ravi Patel", "Grace Lee", "Mo Farah", "Ingrid Nilsen", "Sam Cole"];
const sdChannels = ["Email", "Phone", "Portal", "Chat"];
const sdPriorities = ["Low", "Medium", "High", "Critical"];

type SDStep = [activity: string, gap: [number, number] | null];
const SD_PATHS: Record<string, SDStep[]> = {
  happy: [["Log Ticket", null], ["Triage", [0, 2]], ["Assign", [0, 4]], ["Investigate", [1, 8]], ["Resolve", [1, 24]], ["Close", [0, 8]]],
  escalated: [["Log Ticket", null], ["Triage", [0, 2]], ["Assign", [0, 4]], ["Investigate", [1, 8]], ["Escalate", [1, 12]], ["Resolve", [4, 48]], ["Close", [0, 8]]],
  reopened: [["Log Ticket", null], ["Triage", [0, 2]], ["Assign", [0, 4]], ["Investigate", [1, 8]], ["Resolve", [1, 24]], ["Close", [0, 8]], ["Reopen", [12, 96]], ["Investigate", [1, 8]], ["Resolve", [1, 24]], ["Close", [0, 8]]],
  // ── deviations (undocumented vs the reference; more of these further back in time) ──
  quickClose: [["Log Ticket", null], ["Triage", [0, 2]], ["Resolve", [1, 12]], ["Close", [0, 8]]],   // Triaged → Resolved (skips assign + investigate)
  skipTriage: [["Log Ticket", null], ["Assign", [0, 4]], ["Investigate", [1, 8]], ["Resolve", [1, 24]], ["Close", [0, 8]]],   // Logged → Assigned (skips triage)
};

interface SDPeriodCfg {
  seed: number; year: number; monthIndex: number; monthLabel: string;
  slow: number; mix: Record<string, number>; note: string;
}
// Three past periods of the SAME service desk — adherence declines the further
// back you go (mirrors the Accounts Payable example), so the console shows the
// scenario chooser. Every scenario is activity-only (no state column).
const SD_PERIODS: SDPeriodCfg[] = [
  {
    seed: 20250831, year: 2025, monthIndex: 7, monthLabel: "August 2025", slow: 1.4,
    note: "Oldest — lowest adherence. Frequent quick-closes (triage straight to resolve) and tickets assigned without triage; slowest handling.",
    mix: { happy: 62, escalated: 26, reopened: 24, quickClose: 44, skipTriage: 22 },
  },
  {
    seed: 20251130, year: 2025, monthIndex: 10, monthLabel: "November 2025", slow: 1.2,
    note: "Mid — improving. Some quick-closes and a few skipped triages remain; moderate handling times.",
    mix: { happy: 80, escalated: 30, reopened: 22, quickClose: 34, skipTriage: 12 },
  },
  {
    seed: 20260228, year: 2026, monthIndex: 1, monthLabel: "February 2026 (current)", slow: 1.0,
    note: "Current — best adherence. Nearly every ticket follows Logged → Triaged → Assigned → Investigating → Resolved → Closed; fastest handling.",
    mix: { happy: 96, escalated: 34, reopened: 20, quickClose: 18 },
  },
];

function buildSDPeriod(cfg: SDPeriodCfg) {
  const rnd = mulberry32(cfg.seed);
  const rint = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const monthDays = DAYS_IN_MONTH[cfg.monthIndex];
  const monthEnd = Date.UTC(cfg.year, cfg.monthIndex, monthDays, 23, 59, 59);
  const arrival = () => { let ms; do { ms = Date.UTC(cfg.year, cfg.monthIndex, rint(1, monthDays), rint(7, 18), rint(0, 59), rint(0, 59)); } while (isWeekend(ms)); return ms; };
  const mix: string[] = [];
  for (const [type, n] of Object.entries(cfg.mix)) for (let i = 0; i < n; i++) mix.push(type);
  const cases = mix.map((type) => ({ type, arrival: arrival() })) as { type: string; arrival: number; id: string; channel: string; priority: string; agent: string }[];
  cases.sort((a, b) => a.arrival - b.arrival);
  cases.forEach((c, i) => { c.id = `TKT-${cfg.year}-${String(i + 1).padStart(4, "0")}`; c.channel = pick(sdChannels); c.priority = pick(sdPriorities); c.agent = pick(sdAgents); });
  const rows: { id: string; channel: string; priority: string; activity: string; agent: string; t: number }[] = [];
  for (const c of cases) {
    let t = c.arrival;
    for (const [activity, gap] of SD_PATHS[c.type]) {
      if (gap) t += Math.round(rint(gap[0], gap[1]) * cfg.slow) * HOUR + rint(0, 59) * MIN;
      if (t > monthEnd) break;
      rows.push({ id: c.id, channel: c.channel, priority: c.priority, activity, agent: c.agent, t });
    }
  }
  rows.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return {
    fileName: `service-desk-${cfg.monthLabel.toLowerCase().replace(/[()]/g, "").trim().replace(/ +/g, "-")}.csv`,
    runName: `IT Service Desk — ${cfg.monthLabel}`,
    headers: SD_HEADERS, mapping: SD_MAP,
    rows: rows.map((r) => [r.id, r.channel, r.priority, r.activity, iso(r.t), r.agent]),
    scenario: cfg.monthLabel, note: cfg.note,
  };
}

// Reference lifecycle — built from the SAME Activity→State table, so a log with no
// state column still conforms against a proper State Machine.
const SD_REF_ELEMENTS = [
  { id: INIT, type: "initial-state", label: "" },
  { id: FINAL, type: "final-state", label: "" },
  { id: "logged", type: "state", label: "Logged" },
  { id: "triaged", type: "state", label: "Triaged" },
  { id: "assigned", type: "state", label: "Assigned" },
  { id: "investigating", type: "state", label: "Investigating" },
  { id: "escalated", type: "state", label: "Escalated" },
  { id: "resolved", type: "state", label: "Resolved" },
  { id: "closed", type: "state", label: "Closed" },
];
const SD_CONNS = [
  T(INIT, "logged", "Log Ticket"),
  T("logged", "triaged", "Triage"),
  T("triaged", "assigned", "Assign"),
  T("assigned", "investigating", "Investigate"),
  T("investigating", "escalated", "Escalate"),
  T("escalated", "resolved", "Resolve"),
  T("investigating", "resolved", "Resolve"),
  T("resolved", "closed", "Close"),
  T("closed", "investigating", "Reopen"),
  T("closed", FINAL, ""),
];

const sdSampleLogs = SD_PERIODS.map(buildSDPeriod);            // [aug2025, nov2025, feb2026]
const sdCurrent = sdSampleLogs[sdSampleLogs.length - 1];       // current = best adherence, backs the run
const sdLog = buildEventLog(sdCurrent.headers, sdCurrent.rows, sdCurrent.mapping);
const sdPerformance = computePerformance(sdLog.traces);
const serviceDeskExample = {
  slug: "service-desk-ticket-lifecycle",
  title: "IT Service Desk — Activity-Only Log",
  concept: "Mine a classic activity-only event log (no state column) — the Activity→State table completes the lifecycle.",
  description: [
    "The smallest useful event log — just **Ticket ID, Activity, Timestamp and Agent**, with **no state column**, exactly what most systems export.",
    "",
    "On import, DiagramatixMINER shows an **Activity → State** table (pre-filled here: *Log Ticket → Logged*, *Investigate → Investigating*, *Resolve → Resolved*…) so you define the lifecycle the discovery, conformance and generated **State Machine** all rely on — merge activities into shared states, or leave each as its own.",
    "",
    "Choose one of **three past periods** on entry — **August 2025**, **November 2025** or the **current February 2026** — the same service desk with **adherence declining the further back you go**: older months quick-close (triage straight to resolve) and assign without triage, and run slower. ~170 tickets flow **Logged → Triaged → Assigned → Investigating → Resolved → Closed**, with an Escalated branch and a Reopen loop. Discover the lifecycle, run **Conformance** against the bundled reference (older months score lower), then **Calibrate & simulate**.",
  ].join("\n"),
  difficulty: "core",
  package: {
    version: 1 as const,
    diagrams: [{ key: "sd-reference", name: "Ticket Lifecycle (Reference)", type: "state-machine", data: buildRef(SD_REF_ELEMENTS, SD_CONNS) }],
    run: { name: sdCurrent.runName, mapping: SD_MAP, stats: sdLog.stats, variants: sdLog.variants, performance: sdPerformance, referenceSmKey: "sd-reference" },
    sampleLog: { ...sdCurrent },
    sampleLogs: sdSampleLogs.map((s) => ({ ...s })),
  } as MiningExamplePackage,
};

const outFile = join(__dirname, "..", "app", "lib", "mining", "miningExampleData.json");
writeFileSync(outFile, JSON.stringify({ examples: [example, o2cExample, serviceDeskExample] }, null, 2) + "\n", "utf8");
console.log(`Wrote ${outFile}`);
console.log(`  O2C: ${o2cLog.stats.cases} cases, ${o2cLog.stats.events} events, ${o2cLog.stats.variants} variants`);

// Also emit each scenario as a real .csv under the repo-root /mining folder, so
// the raw files exist on disk (inspect / download / manual-upload) and stay in
// sync with the baked example. Disk names drop the "(current)" suffix.
const csvField = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (headers: string[], rows: string[][]) => [headers, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
const miningDir = join(__dirname, "..", "..", "mining");
for (const s of sampleLogs) {
  const diskName = s.fileName.replace(/-current\.csv$/, ".csv");
  writeFileSync(join(miningDir, diskName), toCsv(s.headers, s.rows), "utf8");
  console.log(`  scenario "${s.scenario}": ${s.rows.length} rows → mining/${diskName}`);
}
writeFileSync(join(miningDir, o2cSampleLog.fileName), toCsv(o2cSampleLog.headers, o2cSampleLog.rows), "utf8");
console.log(`  O2C log → mining/${o2cSampleLog.fileName}`);
for (const s of sdSampleLogs) {
  const diskName = s.fileName.replace(/-current\.csv$/, ".csv");
  writeFileSync(join(miningDir, diskName), toCsv(s.headers, s.rows), "utf8");
  console.log(`  Service Desk "${s.scenario}" (no state col): ${s.rows.length} rows → mining/${diskName}`);
}
console.log(`  Service Desk current run: ${sdLog.stats.cases} cases, ${sdLog.stats.events} events, ${sdLog.stats.variants} variants`);
console.log(`  current run: ${log.stats.cases} cases, ${log.stats.events} events, ${log.stats.variants} variants; clockUnit=${performance.clockUnit}`);
console.log(`  references: ${diagrams.map((d) => `${d.key} (${d.data.elements.length} el, ${d.data.connectors.length} conn)`).join(", ")}`);
