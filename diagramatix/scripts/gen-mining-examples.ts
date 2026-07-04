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

const outFile = join(__dirname, "..", "app", "lib", "mining", "miningExampleData.json");
writeFileSync(outFile, JSON.stringify({ examples: [example] }, null, 2) + "\n", "utf8");
console.log(`Wrote ${outFile}`);
for (const s of sampleLogs) console.log(`  scenario "${s.scenario}": ${s.rows.length} rows → ${s.fileName}`);
console.log(`  current run: ${log.stats.cases} cases, ${log.stats.events} events, ${log.stats.variants} variants; clockUnit=${performance.clockUnit}`);
console.log(`  references: ${diagrams.map((d) => `${d.key} (${d.data.elements.length} el, ${d.data.connectors.length} conn)`).join(", ")}`);
