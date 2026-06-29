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
];
