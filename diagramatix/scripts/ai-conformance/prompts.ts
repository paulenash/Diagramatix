/**
 * Canonical BPMN prompts for the AI conformance harness
 * (scripts/ai-conformance-report.ts). Keep this set STABLE so conformance
 * trends are comparable across runs; add new prompts to probe specific shapes
 * (gateways, pools/messages, parallelism) without removing the existing ones.
 */
export interface BpmnPrompt {
  name: string;
  prompt: string;
}

export const BPMN_PROMPTS: BpmnPrompt[] = [
  {
    name: "linear-order",
    prompt:
      "A simple order-handling process: a customer places an order, the system validates it, the warehouse ships the goods, and the process ends.",
  },
  {
    name: "approval-gateway",
    prompt:
      "A leave-request approval: an employee submits a request, the manager reviews it, and based on the decision the request is either approved or rejected; in both cases the employee is notified, then the process ends.",
  },
  {
    name: "two-pool-message",
    prompt:
      "An order-to-cash collaboration between a Customer pool and a Supplier pool: the customer sends a purchase order, the supplier confirms it, ships the goods and sends an invoice; the customer receives the goods and pays.",
  },
  {
    name: "parallel-onboarding",
    prompt:
      "Employee onboarding: after a new hire accepts the offer, run three tasks in parallel — set up IT accounts, prepare the desk, and enrol in payroll — then hold a welcome meeting and finish.",
  },
  // --- Tougher prompts: stress the router (back-edges, length, fan-in/out) ---
  {
    name: "rework-loop",
    prompt:
      "A document review with rework: an author drafts the document, a reviewer reviews it; if changes are requested the author revises it and it goes back to review (a loop), and this repeats until the reviewer approves; once approved the document is published. Make the rework path loop back to the revise step.",
  },
  {
    name: "long-claim-flow",
    prompt:
      "An insurance claim process with at least 15 steps in sequence: receive claim, register it, validate the policy, check coverage, assign an assessor, schedule an inspection, perform the inspection, estimate the damage, review the estimate, decide the outcome, calculate the payout, get approval, issue payment, notify the customer, close the claim, and end.",
  },
  {
    name: "fan-in-out",
    prompt:
      "A purchase requisition that fans out then fans back in: after submission, a single gateway splits into five parallel approvals — finance, procurement, legal, security, and the department head — and all five must complete and merge back at one gateway before the purchase order is raised and the process ends.",
  },
];
