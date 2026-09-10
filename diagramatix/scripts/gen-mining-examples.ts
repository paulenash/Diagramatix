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
import { computeAnalytics } from "../app/lib/mining/analytics";
import type { EventLog } from "../app/lib/mining/types";

/** A demo SLA between the median and p90 cycle time, so a meaningful slice of
 *  cases breach it (the Outcomes tab shows a real on-time/late split). */
const demoKpi = (log: EventLog) => {
  const a = computeAnalytics(log);
  return { analytics: a, kpiConfig: { slaMs: Math.round((a.cycle.medianMs + a.cycle.p90Ms) / 2) } };
};
import { layoutGenericDiagram } from "../app/lib/diagram/genericLayout";
import type { DiagramData } from "../app/lib/diagram/types";
import type { LogMapping } from "../app/lib/mining/types";
import type { MiningExamplePackage, MiningExampleDiagram } from "../app/lib/mining/examplePackage";
import { buildTaskMiningExample } from "../app/lib/mining/taskMining/example";
import { buildLiveOrderProcessingExample } from "../app/lib/mining/liveDemoExample";

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
    ...demoKpi(log),
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
    "**Discover** the implied BPMN and the entity lifecycle, run **Conformance** against the bundled **reference** state machine (the current month scores ~90% — only in-flight invoices deviate; older months score far lower), then switch to the **strict** reference (no rework) to flag undocumented *On Hold → In Progress* cases. Finally hit **Calibrate & simulate** to turn the discovered process into a digital twin and watch invoices animate through it in the Simulator. Every mining run is saved — re-select it to replay its discovered process, lifecycle and conformance.",
    "",
    "**This is the comparison example.** Import two of the three periods as separate runs, then open **Insights → Compare** and pick the other one. Conformance goes **44% → 66% → 90%** across the three; eight deviations that were live in January 2025 are gone by January 2026, and the cycle time falls by a quarter. Compare them the other way round — current first, then the old period — and the panel shows what the alert rules would raise: *conformance fell from 91% to 44%* and *8 deviations appeared that were not there before*. Those are the real thresholds, not demo ones.",
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
const O2C_HEADERS = ["Order ID", "Customer", "Region", "Channel", "Amount", "Activity", "Timestamp", "Order Status", "Resource"];
// Retention is OPT-IN at import — an unmapped column defaults to "drop", because
// a spare column is as likely to hold a customer name as a region. So the two
// slicing dimensions have to be asked for by name here; without this the example
// imports, looks perfectly healthy, and has an empty filter bar.
//
// Deliberately NOT kept: "Customer" (a name, and the example should not teach
// that identifying columns are retained by default) and "Amount" (the filter
// matches values exactly, and slicing to orders of $4,812.37 is not a slice).
const O2C_MAP: LogMapping = {
  caseId: "Order ID", activity: "Activity", timestamp: "Timestamp", state: "Order Status", resource: "Resource",
  attributeMode: { Region: "keep", Channel: "keep" },
};
const O2C_END = Date.UTC(2026, 1, 28, 23, 59, 59);
const salesReps = ["Nadia Rahman", "Tom Becker", "Priya Nair", "Luis Ortega"];
const O2C_ROLE: Record<string, string> = { sales: "", credit: "Credit Desk", approver: "Order Desk", warehouse: "Fulfilment Centre", billing: "Billing System" };
const o2cCustomers = ["Acme Retail", "Globex Stores", "Initech Ltd", "Umbrella Group", "Wayne Enterprises", "Soylent Foods", "Hooli Inc", "Stark Traders", "Vandelay Co", "Wonka Brands"];

// ── The two slicing dimensions (Phase 11) ───────────────────────────────────
// Spare columns are only worth keeping if slicing by them CHANGES the answer. A
// Region column with the same distribution in every slice teaches the mechanic
// and nothing else — the reader learns which control to click and comes away
// believing the answer was already on the screen.
//
// So both are causal, and each explains a different kind of finding:
//
//   Region  — EMEA fulfilment carries a backlog, so the Fulfil/Ship step takes
//             about two and a half times as long there. The whole-run figure
//             shows a fulfilment bottleneck; slicing shows it is one region's,
//             and the other two are fine. That is the difference between "we
//             have a fulfilment problem" and "EMEA has a fulfilment problem",
//             and they have different budgets.
//
//   Channel — the control failures concentrate in Partner orders: most credit
//             bypasses, unapproved fulfilments and shipments on hold come in
//             through partners. The conformance tab reports a deviation rate;
//             slicing reports WHO is deviating, which is the thing anyone can
//             act on.
const o2cRegions = ["APAC", "EMEA", "Americas"];
const o2cChannels = ["Direct", "Partner", "Web"];
/** EMEA's fulfilment backlog, as a multiplier on the fulfil/ship wait. */
const EMEA_FULFIL_SLOW = 2.5;
/** Share of each control-failure case that arrived through a partner. */
const PARTNER_SHARE_OF_BYPASS = 0.8;
const O2C_BYPASS_TYPES = new Set(["creditBypass", "fulfilNoApproval", "shipOnHold"]);
const O2C_SLOW_STEPS = new Set(["Fulfil Order", "Ship Goods"]);

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
  const cases = O2C_MIX.map((type) => ({ type, arrival: arrival() })) as { type: string; arrival: number; id: string; customer: string; rep: string; region: string; channel: string }[];
  cases.sort((a, b) => a.arrival - b.arrival);
  cases.forEach((c, i) => {
    c.id = `SO-2026-${String(i + 1).padStart(4, "0")}`;
    c.customer = pick(o2cCustomers);
    c.rep = pick(salesReps);
    c.region = pick(o2cRegions);
    // Partner orders carry most of the control failures — but NOT all of them,
    // and partners also place plenty of clean orders. A dimension that split
    // the log perfectly would make the slice a tautology rather than a finding.
    c.channel = O2C_BYPASS_TYPES.has(c.type) && rnd() < PARTNER_SHARE_OF_BYPASS ? "Partner" : pick(o2cChannels);
  });
  const rows: { id: string; customer: string; region: string; channel: string; amount: string; activity: string; state: string; resource: string; t: number }[] = [];
  for (const c of cases) {
    let t = c.arrival;
    for (const [activity, state, role, gap] of O2C_PATHS[c.type]) {
      // The backlog is on the fulfilment step in one region, not on the whole
      // region — an order that is slow from end to end teaches nothing about
      // WHERE the time goes, which is the question the Between-steps tab asks.
      const slow = c.region === "EMEA" && O2C_SLOW_STEPS.has(activity) ? EMEA_FULFIL_SLOW : 1;
      if (gap) t += Math.round(rint(gap[0], gap[1]) * slow) * HOUR + rint(0, 59) * MIN;
      if (t > O2C_END) break;
      const resource = role === "sales" ? c.rep : (O2C_ROLE[role] || role);
      rows.push({ id: c.id, customer: c.customer, region: c.region, channel: c.channel, amount: (rint(200, 48000) + rint(0, 99) / 100).toFixed(2), activity, state, resource, t });
    }
  }
  rows.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return {
    fileName: "order-to-cash-february-2026.csv", runName: "Order-to-Cash — February 2026",
    headers: O2C_HEADERS, mapping: O2C_MAP,
    rows: rows.map((r) => [r.id, r.customer, r.region, r.channel, r.amount, r.activity, iso(r.t), r.state, r.resource]),
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
    "",
    "**This is also the slicing example.** Two spare columns are kept at import — **Region** and **Channel** — and both change the answer rather than decorating it. The whole-run view shows fulfilment as the biggest delay; slice to **EMEA** and it is far worse, slice to **APAC** or **Americas** and it is unremarkable — the backlog belongs to one region, not to the process. Slice to **Partner** and most of the credit bypasses, unapproved fulfilments and shipments-on-hold are there. That is the move the whole workbench exists for: a finding becomes a cause the moment you can say *whose*.",
    "",
    "Note what is **not** kept: *Customer* is a name and *Amount* is a number no two cases share. Column retention is opt-in at import for exactly that reason — you choose what becomes a dimension, and everything else is discarded rather than quietly stored.",
  ].join("\n"),
  difficulty: "core",
  package: {
    version: 1 as const,
    diagrams: [{ key: "o2c-reference", name: "Order Lifecycle (Reference)", type: "state-machine", data: buildRef(O2C_REF_ELEMENTS, O2C_CONNS) }],
    run: { name: o2cSampleLog.runName, mapping: O2C_MAP, stats: o2cLog.stats, variants: o2cLog.variants, performance: o2cPerformance, ...demoKpi(o2cLog), referenceSmKey: "o2c-reference" },
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
    run: { name: sdCurrent.runName, mapping: SD_MAP, stats: sdLog.stats, variants: sdLog.variants, performance: sdPerformance, ...demoKpi(sdLog), referenceSmKey: "sd-reference" },
    sampleLog: { ...sdCurrent },
    sampleLogs: sdSampleLogs.map((s) => ({ ...s })),
  } as MiningExamplePackage,
};

// ── Purchase Requisition — three teams, and one pair that argues ─────────────
// Phase 11. The Teams tab was built in Phase 7 and no catalog example exercises
// it: Accounts Payable resources are individual clerks, Order-to-Cash mixes
// people with function names, and the Service Desk is one team of agents. So
// the hand-off map, the workload split and the ping-pong pair all ship
// untaught.
//
// Two things this log is shaped to make visible, and both are shaped rather
// than sprinkled — a random resource column produces a hand-off map with no
// structure, which reads exactly like a process with no problem.
//
// 1. THE HAND-OFF THAT COSTS THE TIME. Legal has a queue: work waits days to be
//    picked up, and minutes to be done. So Finance → Legal dominates the
//    hand-off table by total elapsed while being unremarkable by count, which
//    is the distinction the Between-steps and Teams tabs exist to draw.
//
// 2. A GENUINE PING-PONG PAIR. The happy path visits Procurement → Finance →
//    Legal → Procurement and never returns to a team it has left, so the
//    baseline is ZERO bounces — deliberately. In a process that naturally
//    alternates between two teams, every case registers as ping-pong and the
//    signal means nothing. Here only the disputed-terms path bounces Finance
//    and Legal back and forth three times, so the figure names something real.
const PR_HEADERS = ["Requisition", "Activity", "Timestamp", "Status", "Team"];
const PR_MAP: LogMapping = {
  caseId: "Requisition", activity: "Activity", timestamp: "Timestamp", state: "Status", resource: "Team",
};
const PR_PROC = "Procurement", PR_FIN = "Finance", PR_LEGAL = "Legal";

type PRStep = [activity: string, state: string, team: string, gap: [number, number] | null];
const PR_RAISE: PRStep = ["Raise Requisition", "Raised", PR_PROC, null];
const PR_BUDGET: PRStep = ["Check Budget", "Budget Checked", PR_FIN, [2, 12]];
// The queue. Long wait, then the work itself is quick — the shape of every
// specialist team in every organisation, and invisible in a model that only
// shows which steps exist.
const PR_TERMS: PRStep = ["Review Terms", "Terms Reviewed", PR_LEGAL, [24, 120]];
const PR_QUERY: PRStep = ["Query Terms", "Terms Queried", PR_FIN, [4, 24]];
const PR_REVISE: PRStep = ["Revise Terms", "Terms Revised", PR_LEGAL, [24, 96]];
const PR_ACCEPT: PRStep = ["Accept Terms", "Terms Agreed", PR_FIN, [2, 16]];
const PR_PO: PRStep = ["Raise Purchase Order", "Ordered", PR_PROC, [1, 8]];
const PR_GOODS: PRStep = ["Receive Goods", "Received", PR_PROC, [48, 240]];
const PR_CLOSE: PRStep = ["Close Requisition", "Closed", PR_PROC, [1, 12]];
const PR_REJECT: PRStep = ["Reject Requisition", "Rejected", PR_FIN, [2, 24]];

const PR_PATHS: Record<string, PRStep[]> = {
  // P → F → L → P, and never back. Zero bounces, on purpose.
  happy: [PR_RAISE, PR_BUDGET, PR_TERMS, PR_PO, PR_GOODS, PR_CLOSE],
  // Finance and Legal pass it back and forth: F → L → F → L → F.
  disputedTerms: [PR_RAISE, PR_BUDGET, PR_TERMS, PR_QUERY, PR_REVISE, PR_ACCEPT, PR_PO, PR_GOODS, PR_CLOSE],
  // One round of query, not three — so the ping-pong figure is a rate rather
  // than a property every disputed case shares.
  oneQuery: [PR_RAISE, PR_BUDGET, PR_TERMS, PR_QUERY, PR_ACCEPT, PR_PO, PR_GOODS, PR_CLOSE],
  budgetReject: [PR_RAISE, PR_BUDGET, PR_REJECT],
  legalReject: [PR_RAISE, PR_BUDGET, PR_TERMS, PR_REJECT],
};
const PR_MIX: Record<string, number> = { happy: 92, disputedTerms: 34, oneQuery: 22, budgetReject: 14, legalReject: 10 };

function buildPRLog() {
  const rnd = mulberry32(20260331);
  const rint = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const END = Date.UTC(2026, 2, 31, 23, 59, 59);
  const arrival = () => { let ms; do { ms = Date.UTC(2026, 2, rint(1, 31), rint(8, 16), rint(0, 59), rint(0, 59)); } while (isWeekend(ms)); return ms; };
  const mix: string[] = [];
  for (const [type, n] of Object.entries(PR_MIX)) for (let i = 0; i < n; i++) mix.push(type);
  const cases = mix.map((type) => ({ type, arrival: arrival() })) as { type: string; arrival: number; id: string }[];
  cases.sort((a, b) => a.arrival - b.arrival);
  cases.forEach((c, i) => { c.id = `REQ-2026-${String(i + 1).padStart(4, "0")}`; });
  const rows: { id: string; activity: string; state: string; team: string; t: number }[] = [];
  for (const c of cases) {
    let t = c.arrival;
    for (const [activity, state, team, gap] of PR_PATHS[c.type]) {
      if (gap) t += rint(gap[0], gap[1]) * HOUR + rint(0, 59) * MIN;
      if (t > END) break;
      rows.push({ id: c.id, activity, state, team, t });
    }
  }
  rows.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return {
    fileName: "purchase-requisition-march-2026.csv", runName: "Purchase Requisition — March 2026",
    headers: PR_HEADERS, mapping: PR_MAP,
    rows: rows.map((r) => [r.id, r.activity, iso(r.t), r.state, r.team]),
  };
}

const PR_REF_ELEMENTS = [
  { id: INIT, type: "initial-state", label: "" },
  { id: FINAL, type: "final-state", label: "" },
  { id: "raised", type: "state", label: "Raised" },
  { id: "budget-checked", type: "state", label: "Budget Checked" },
  { id: "terms-reviewed", type: "state", label: "Terms Reviewed" },
  { id: "ordered", type: "state", label: "Ordered" },
  { id: "received", type: "state", label: "Received" },
  { id: "closed", type: "state", label: "Closed" },
  { id: "rejected", type: "state", label: "Rejected" },
];
// The reference is the process as WRITTEN DOWN: raise, check, review, order.
// It has no query/revise loop at all, so the disputed-terms cases are exactly
// the deviation — and the Teams tab then explains who is doing the deviating.
const PR_CONNS = [
  T(INIT, "raised", "Raise Requisition"),
  T("raised", "budget-checked", "Check Budget"),
  T("budget-checked", "terms-reviewed", "Review Terms"),
  T("terms-reviewed", "ordered", "Raise Purchase Order"),
  T("ordered", "received", "Receive Goods"),
  T("received", "closed", "Close Requisition"),
  T("budget-checked", "rejected", "Reject Requisition"),
  T("terms-reviewed", "rejected", "Reject Requisition"),
  T("closed", FINAL, ""),
  T("rejected", FINAL, ""),
];

const prSampleLog = buildPRLog();
const prLog = buildEventLog(prSampleLog.headers, prSampleLog.rows, prSampleLog.mapping);
const prPerformance = computePerformance(prLog.traces);
const handoverExample = {
  slug: "three-team-handover",
  title: "Purchase Requisition — Three Teams",
  concept: "See who hands work to whom, which hand-off costs the time, and which two teams pass a case back and forth.",
  description: [
    "A month of purchase requisitions crossing **three teams** — **Procurement** raises and receives, **Finance** checks the budget, **Legal** reviews the terms.",
    "",
    "**The hand-off is the process.** Every step here is quick; almost all of the elapsed time is spent waiting between them, and one hand-off accounts for most of it. Open **Between steps** and then **Teams**: *Finance → Legal* is unremarkable by count and dominant by total elapsed, because Legal has a queue. Work waits days to be picked up and minutes to be done — the shape of every specialist team in every organisation, and completely invisible in a model that only shows which steps exist.",
    "",
    "**And one pair argues.** The written-down process goes Procurement → Finance → Legal → Procurement and never returns to a team it has left, so most cases bounce **zero** times. A third of them do not: *Review Terms → Query Terms → Revise Terms → Accept Terms* passes the requisition between Legal and Finance three times before it moves on. The Teams tab names that pair and counts it.",
    "",
    "Run **Conformance** against the bundled reference — which has no query loop at all, because nobody wrote one down — and the disputed cases are the deviation. Then use **Deviations → show me the cases** to read the actual requisitions, and **What to do next** for the ranked version of all of it.",
  ].join("\n"),
  difficulty: "core",
  package: {
    version: 1 as const,
    diagrams: [{ key: "pr-reference", name: "Requisition Lifecycle (Reference)", type: "state-machine", data: buildRef(PR_REF_ELEMENTS, PR_CONNS) }],
    run: { name: prSampleLog.runName, mapping: PR_MAP, stats: prLog.stats, variants: prLog.variants, performance: prPerformance, ...demoKpi(prLog), referenceSmKey: "pr-reference" },
    sampleLog: { ...prSampleLog },
  } as MiningExamplePackage,
};

// ── Credit Application — the credit check that runs three times ──────────────
// Phase 11, and this one exists to PROVE a correction rather than to show a
// feature. The Capability Review claimed extension 6 was a matter of widening a
// trigger. Half of that was right: the rework detector really is
// label-agnostic. The other half was wrong — the ping-pong detector inherited
// from task mining parses app names out of "Switch to X" / "Open X" / "X:"
// labels, and on an ordinary business log it returns 0. A confident zero, which
// is worse than an absent figure.
//
// Nothing in this log looks remotely like a UI step. "Credit Check" is not an
// application anybody switches to; it is a thing a credit team does, three
// times, because the applicant keeps being asked for another document. So the
// rework figure has to come from repeats within a case, and it does.
const CA_HEADERS = ["Application", "Activity", "Timestamp", "Stage", "Team"];
const CA_MAP: LogMapping = {
  caseId: "Application", activity: "Activity", timestamp: "Timestamp", state: "Stage", resource: "Team",
};
const CA_INTAKE = "Intake", CA_CREDIT = "Credit Team", CA_UW = "Underwriting", CA_PAY = "Payments";

type CAStep = [activity: string, state: string, team: string, gap: [number, number] | null];
const CA_RECEIVE: CAStep = ["Receive Application", "Received", CA_INTAKE, null];
const CA_VERIFY: CAStep = ["Verify Identity", "Identity Verified", CA_INTAKE, [1, 8]];
const CA_CHECK: CAStep = ["Credit Check", "Credit Checked", CA_CREDIT, [2, 24]];
const CA_DOCS: CAStep = ["Request Documents", "Awaiting Documents", CA_CREDIT, [1, 6]];
const CA_RECEIVED_DOCS: CAStep = ["Receive Documents", "Documents Received", CA_INTAKE, [24, 168]];
const CA_UNDERWRITE: CAStep = ["Underwrite", "Underwritten", CA_UW, [4, 48]];
const CA_APPROVE: CAStep = ["Approve Application", "Approved", CA_UW, [1, 12]];
const CA_DISBURSE: CAStep = ["Disburse Funds", "Disbursed", CA_PAY, [4, 72]];
const CA_DECLINE: CAStep = ["Decline Application", "Declined", CA_UW, [1, 24]];
const CA_WITHDRAW: CAStep = ["Withdraw Application", "Withdrawn", CA_INTAKE, [24, 240]];

const CA_PATHS: Record<string, CAStep[]> = {
  // Checked once and through — the process as anyone would describe it.
  clean: [CA_RECEIVE, CA_VERIFY, CA_CHECK, CA_UNDERWRITE, CA_APPROVE, CA_DISBURSE],
  // One more document, one more check.
  oneRecheck: [CA_RECEIVE, CA_VERIFY, CA_CHECK, CA_DOCS, CA_RECEIVED_DOCS, CA_CHECK, CA_UNDERWRITE, CA_APPROVE, CA_DISBURSE],
  // The case the example is named after: Credit Check three times, and a week
  // of the applicant's life between each one.
  twoRechecks: [CA_RECEIVE, CA_VERIFY, CA_CHECK, CA_DOCS, CA_RECEIVED_DOCS, CA_CHECK, CA_DOCS, CA_RECEIVED_DOCS, CA_CHECK, CA_UNDERWRITE, CA_APPROVE, CA_DISBURSE],
  declined: [CA_RECEIVE, CA_VERIFY, CA_CHECK, CA_UNDERWRITE, CA_DECLINE],
  declinedAfterDocs: [CA_RECEIVE, CA_VERIFY, CA_CHECK, CA_DOCS, CA_RECEIVED_DOCS, CA_CHECK, CA_UNDERWRITE, CA_DECLINE],
  // Asked three times, gave up. The most expensive outcome in the log and the
  // one nobody measures.
  withdrew: [CA_RECEIVE, CA_VERIFY, CA_CHECK, CA_DOCS, CA_RECEIVED_DOCS, CA_CHECK, CA_DOCS, CA_WITHDRAW],
};
const CA_MIX: Record<string, number> = { clean: 34, oneRecheck: 42, twoRechecks: 76, declined: 10, declinedAfterDocs: 10, withdrew: 8 };

function buildCALog() {
  const rnd = mulberry32(20260430);
  const rint = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const END = Date.UTC(2026, 3, 30, 23, 59, 59);
  // Arrivals land in the first three weeks rather than across the whole month.
  // A rework example truncated at month end is a rework example that UNDER-
  // reports rework: the cases cut off in flight are the ones being checked for
  // the third time, so the very figure the example exists to show is the one
  // the truncation eats.
  const arrival = () => { let ms; do { ms = Date.UTC(2026, 3, rint(1, 21), rint(8, 17), rint(0, 59), rint(0, 59)); } while (isWeekend(ms)); return ms; };
  const mix: string[] = [];
  for (const [type, n] of Object.entries(CA_MIX)) for (let i = 0; i < n; i++) mix.push(type);
  const cases = mix.map((type) => ({ type, arrival: arrival() })) as { type: string; arrival: number; id: string }[];
  cases.sort((a, b) => a.arrival - b.arrival);
  cases.forEach((c, i) => { c.id = `APP-2026-${String(i + 1).padStart(4, "0")}`; });
  const rows: { id: string; activity: string; state: string; team: string; t: number }[] = [];
  for (const c of cases) {
    let t = c.arrival;
    for (const [activity, state, team, gap] of CA_PATHS[c.type]) {
      if (gap) t += rint(gap[0], gap[1]) * HOUR + rint(0, 59) * MIN;
      if (t > END) break;
      rows.push({ id: c.id, activity, state, team, t });
    }
  }
  rows.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return {
    fileName: "credit-application-april-2026.csv", runName: "Credit Application — April 2026",
    headers: CA_HEADERS, mapping: CA_MAP,
    rows: rows.map((r) => [r.id, r.activity, iso(r.t), r.state, r.team]),
  };
}

const CA_REF_ELEMENTS = [
  { id: INIT, type: "initial-state", label: "" },
  { id: FINAL, type: "final-state", label: "" },
  { id: "received", type: "state", label: "Received" },
  { id: "identity-verified", type: "state", label: "Identity Verified" },
  { id: "credit-checked", type: "state", label: "Credit Checked" },
  { id: "underwritten", type: "state", label: "Underwritten" },
  { id: "approved", type: "state", label: "Approved" },
  { id: "disbursed", type: "state", label: "Disbursed" },
  { id: "declined", type: "state", label: "Declined" },
];
// One credit check. That is what the procedure says, and it is why the log is
// interesting: the deviation is not a wrong path, it is the SAME path walked
// three times.
const CA_CONNS = [
  T(INIT, "received", "Receive Application"),
  T("received", "identity-verified", "Verify Identity"),
  T("identity-verified", "credit-checked", "Credit Check"),
  T("credit-checked", "underwritten", "Underwrite"),
  T("underwritten", "approved", "Approve Application"),
  T("approved", "disbursed", "Disburse Funds"),
  T("underwritten", "declined", "Decline Application"),
  T("disbursed", FINAL, ""),
  T("declined", FINAL, ""),
];

const caSampleLog = buildCALog();
const caLog = buildEventLog(caSampleLog.headers, caSampleLog.rows, caSampleLog.mapping);
const caPerformance = computePerformance(caLog.traces);
const reworkExample = {
  slug: "credit-check-rework",
  title: "Credit Application — The Check That Runs Three Times",
  concept: "Rework on an ordinary business log: the same step, repeated, and what it costs the applicant.",
  description: [
    "A month of credit applications. The written procedure runs **Received → Identity Verified → Credit Checked → Underwritten → Approved → Disbursed**, with one credit check.",
    "",
    "**Most applications are not checked once.** The credit team runs the check, asks for a document, waits up to a week for the applicant to send it, and runs the check again — and for a good share of cases, does that twice. Open **Teams** and the rework figure names the step and the rate: *Credit Check runs about 2.1× per application, in 136 of 180 cases*. Nothing about that number came from a path being wrong; the path is right, and it is walked three times.",
    "",
    "**Why this example exists.** The rework detector reads repeats within a case, so it works on any log. Its sibling — the *ping-pong* detector inherited from task mining — does not: it reads application names out of labels like *Switch to Excel* and *Open SAP*, and on a business log it returns a confident **zero**. Nothing here looks like a UI step, so the two detectors disagree, and that disagreement is the point. A number that is wrong in the same direction every time is worse than no number.",
    "",
    "Look at **Between steps** for where the time actually goes — *Request Documents → Receive Documents* is days of somebody else's life, not yours — and at the **withdrawn** cases, which were asked three times and gave up. That is the most expensive outcome in the log and the one nobody measures.",
  ].join("\n"),
  difficulty: "core",
  package: {
    version: 1 as const,
    diagrams: [{ key: "ca-reference", name: "Application Lifecycle (Reference)", type: "state-machine", data: buildRef(CA_REF_ELEMENTS, CA_CONNS) }],
    run: { name: caSampleLog.runName, mapping: CA_MAP, stats: caLog.stats, variants: caLog.variants, performance: caPerformance, ...demoKpi(caLog), referenceSmKey: "ca-reference" },
    sampleLog: { ...caSampleLog },
  } as MiningExamplePackage,
};

// Task-Mining flagship example ("Enter Invoice") — built from the task sample log.
const taskExample = buildTaskMiningExample();
// Live-source flagship example ("Order Processing" real-time polling).
const liveExample = buildLiveOrderProcessingExample();

const outFile = join(__dirname, "..", "app", "lib", "mining", "miningExampleData.json");
writeFileSync(outFile, JSON.stringify({ examples: [example, o2cExample, serviceDeskExample, handoverExample, reworkExample, taskExample, liveExample] }, null, 2) + "\n", "utf8");
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
writeFileSync(join(miningDir, prSampleLog.fileName), toCsv(prSampleLog.headers, prSampleLog.rows), "utf8");
console.log(`  Purchase Requisition (3 teams) → mining/${prSampleLog.fileName}`);
writeFileSync(join(miningDir, caSampleLog.fileName), toCsv(caSampleLog.headers, caSampleLog.rows), "utf8");
console.log(`  Credit Application (rework) → mining/${caSampleLog.fileName}`);
writeFileSync(join(miningDir, o2cSampleLog.fileName), toCsv(o2cSampleLog.headers, o2cSampleLog.rows), "utf8");
console.log(`  O2C log → mining/${o2cSampleLog.fileName}`);

// The cold-start sample, served as a static file. The Miner's import screen
// offers this to anyone who has NOT adopted a catalog example — which is every
// first-time user on their own project, who until Phase 11 was shown a bare
// file picker. It is the same Order-to-Cash log, written a second time under a
// stable name so the button's URL never has to track a date in a file name.
// SAMPLE_LOG.path in app/components/mining/console/shared.ts must agree, and a
// test resolves it on disk and mines it rather than trusting that it does.
const publicSample = join(__dirname, "..", "public", "mining", "sample-order-to-cash.csv");
writeFileSync(publicSample, toCsv(o2cSampleLog.headers, o2cSampleLog.rows), "utf8");
console.log(`  cold-start sample → public/mining/sample-order-to-cash.csv`);
for (const s of sdSampleLogs) {
  const diskName = s.fileName.replace(/-current\.csv$/, ".csv");
  writeFileSync(join(miningDir, diskName), toCsv(s.headers, s.rows), "utf8");
  console.log(`  Service Desk "${s.scenario}" (no state col): ${s.rows.length} rows → mining/${diskName}`);
}
console.log(`  Service Desk current run: ${sdLog.stats.cases} cases, ${sdLog.stats.events} events, ${sdLog.stats.variants} variants`);
console.log(`  current run: ${log.stats.cases} cases, ${log.stats.events} events, ${log.stats.variants} variants; clockUnit=${performance.clockUnit}`);
console.log(`  references: ${diagrams.map((d) => `${d.key} (${d.data.elements.length} el, ${d.data.connectors.length} conn)`).join(", ")}`);
