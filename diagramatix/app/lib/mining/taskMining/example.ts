/**
 * The flagship Task-Mining starter example — "Enter Invoice". Built from the
 * sample UI-interaction log so the catalog ships a real, adoptable task routine.
 * On adopt the learner lands on the MINER Import panel pre-loaded with the task
 * log; importing discovers the routine map through the EXISTING pipeline.
 *
 * Consumed by scripts/gen-mining-examples.ts (baked into miningExampleData.json).
 */
import { buildEventLog } from "../parseEventLog";
import { computePerformance } from "../performance";
import { computeAnalytics } from "../analytics";
import type { MiningExamplePackage } from "../examplePackage";
import type { StarterMiningExample } from "../exampleSeeds";
import { toEventLog } from "./schema";
import { INVOICE_PROCESSING_TASK_LOG } from "./sampleInvoiceProcessing";

const DESCRIPTION = [
  "**Task Mining** looks *inside* a single process task at the UI steps a person actually performs.",
  "This example is **Enter Invoice** — the clerk copies the Vendor and Amount from an Excel sheet",
  "into an Accounts-Payable web form, validates, and submits.",
  "",
  "Import the log and you'll see the **task routine map**: the happy path, plus a **rework loop**",
  "where a failed validation sends the clerk back to Excel to re-copy the Amount (classic",
  "**ping-pong** between two apps). The heavy copy/paste + app-switching makes this a strong",
  "**RPA automation candidate** — exactly what Task Mining is for.",
].join(" ");

/** Build the "Enter Invoice" task-mining example package + metadata. */
export function buildTaskMiningExample(): StarterMiningExample {
  const { headers, rows, mapping } = toEventLog(INVOICE_PROCESSING_TASK_LOG);
  const log = buildEventLog(headers, rows, mapping);
  const performance = computePerformance(log.traces);
  const analytics = computeAnalytics(log);

  const pkg: MiningExamplePackage = {
    version: 1,
    diagrams: [],
    run: {
      name: "Enter Invoice — task routine",
      mapping,
      stats: log.stats,
      variants: log.variants,
      performance,
      analytics,
    },
    sampleLog: {
      fileName: "enter-invoice-task-log.csv",
      runName: "Enter Invoice — task routine",
      headers,
      rows,
      mapping,
      scenario: "Enter Invoice",
      note: "UI-interaction (task) log: copy Vendor + Amount from Excel into the AP web form; 3 of 10 cases rework the Amount after a failed validation.",
    },
  };

  return {
    slug: "task-mining-enter-invoice",
    title: "Task Mining — Enter Invoice",
    concept: "Mine the UI steps inside one task to expose rework, app ping-pong and automation potential.",
    description: DESCRIPTION,
    difficulty: "advanced",
    package: pkg,
  };
}
