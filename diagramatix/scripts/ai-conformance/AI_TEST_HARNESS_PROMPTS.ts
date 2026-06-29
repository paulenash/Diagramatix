/**
 * Narrative BPMN prompts for the AI conformance harness
 * (scripts/ai-conformance-report.ts). A broad corpus (~40 prompts) chosen so that, between them,
 * the AI is asked to produce as much of the BPMN palette as possible — events,
 * gateways, task types, subprocesses, loops/multi-instance, data, pools/lanes
 * and advanced constructs — plus a few known router stressors (back-edges,
 * length, fan-in/out).
 *
 * IMPORTANT: the prompt text is deliberately NARRATIVE, not technical. A real
 * user describes a business process in plain prose ("if they haven't decided
 * within two days it's escalated"), not in BPMN jargon ("a timer boundary
 * event"). The harness tests whether the AI correctly INFERS the right notation
 * from natural language — so do not name BPMN constructs in the prompts. The
 * `name` field is just an internal label (used to name the saved diagram).
 *
 * Keep this set STABLE so conformance trends are comparable across runs; add new
 * prompts rather than rewording existing ones. This doubles as the golden corpus
 * for any future router rewrite (run old vs new over the same corpus and compare).
 */
export interface BpmnPrompt {
  name: string;
  prompt: string;
}

export const BPMN_PROMPTS: BpmnPrompt[] = [
  // --- Core flow ---
  { name: "linear-order", prompt: "A customer places an order, the system validates it, the warehouse ships the goods, and the order is complete." },
  { name: "approval-decision", prompt: "An employee submits a leave request. The manager reviews it and either approves or rejects it. Either way the employee is told the outcome, and the request is closed." },
  { name: "parallel-onboarding", prompt: "When a new hire accepts an offer, the company sets up their IT accounts, prepares their desk, and enrols them in payroll — all at the same time. Once those are all done, they attend a welcome meeting." },
  { name: "service-request", prompt: "A user logs an IT support ticket. The service desk works out what's wrong, fixes it, and closes the ticket once the user confirms it's sorted." },

  // --- Start / end variety ---
  { name: "scheduled-billing", prompt: "At the end of every month the company automatically prepares each customer's invoice and emails it to them." },
  { name: "incoming-order", prompt: "Whenever a purchase order arrives from a customer, the company registers it, fulfils it, and completes the order." },
  { name: "product-recall", prompt: "When a product recall is declared, every regional team is alerted at once. Each region confirms it has acted, and then the recall is closed." },
  { name: "payment-failure", prompt: "The system charges the customer's card. If it goes through, the order is confirmed. If the card is declined, the order can't go ahead and the finance team is alerted to follow up." },
  { name: "emergency-stop", prompt: "If a serious fault is detected while the line is running, the operator is alerted and everything stops immediately — nothing else continues." },

  // --- Waiting / time / external replies ---
  { name: "free-trial", prompt: "A customer starts a free trial. Two weeks later the company checks whether they've upgraded: if they have, the account becomes a paid one; if not, the trial expires." },
  { name: "await-credit-report", prompt: "After someone submits an application, the company has to wait for the credit bureau to send back its report before it can make a decision." },
  { name: "notify-shipment", prompt: "The warehouse picks the goods, lets the customer know their shipment is on its way, and the carrier then collects it." },
  { name: "reorder-on-low-stock", prompt: "The system keeps an eye on inventory. Whenever stock drops below the reorder level it raises a replenishment order, and then carries on watching." },

  // --- Things that can interrupt / time out ---
  { name: "review-deadline", prompt: "A manager reviews a request. If they haven't decided within two days it's automatically escalated to the director; otherwise their decision stands and the request continues." },
  { name: "import-retry-on-error", prompt: "The system imports a data file. If the file turns out to be invalid, someone corrects it and the import is tried again; once it's clean, the records are loaded." },
  { name: "cancel-while-assessing", prompt: "An assessor works through a case. If a cancellation comes in from the customer while they're still working on it, the case is dropped and a refund is issued instead." },
  { name: "progress-updates", prompt: "While a long job is being processed, a status update goes out every hour to keep everyone informed, and the job keeps running until it's finished." },

  // --- Branching / decisions ---
  { name: "risk-routing", prompt: "A loan application is assessed for risk. High-risk applications go to manual underwriting, medium-risk ones get a standard review, and low-risk ones are approved automatically. Whichever path it takes, the decision is then issued." },
  { name: "concurrent-checks", prompt: "After a passport application is submitted, a background check, document verification, and a photo capture all happen together. Only once all three are finished is the passport printed." },
  { name: "optional-assessments", prompt: "Depending on the insurance claim, it may need any combination of a medical review, a vehicle inspection, and a police-report check. Whichever ones apply are carried out, and once they're all back the claim is settled." },
  { name: "payment-or-timeout", prompt: "After the invoice is sent, the company waits to see which happens first: if the payment arrives, a receipt is issued; if thirty days pass with no payment, a reminder is sent out." },
  { name: "two-of-three-vote", prompt: "Three reviewers consider a proposal at the same time. As soon as any two of them have approved it, the proposal is ratified." },

  // --- Who does what (task variety) ---
  { name: "expense-claim", prompt: "An employee fills in an expense claim. The system automatically checks the receipts, a manager approves it, and the system then schedules the reimbursement." },
  { name: "goods-receipt", prompt: "A dock worker unloads the delivery truck by hand, then scans the items into the system, and the stock levels update automatically." },
  { name: "apply-discount", prompt: "An order is captured, the right discount is worked out from the pricing policy, and the final price is applied and confirmed." },
  { name: "supplier-exchange", prompt: "The company issues a purchase order to the supplier, waits for the supplier's confirmation to come back, and then schedules the goods to be received." },

  // --- Grouped / reusable / nested work ---
  { name: "fulfilment-detail", prompt: "An order comes in. Fulfilling it means picking, packing, and shipping the goods. After fulfilment is done, the customer is invoiced." },
  { name: "interview-round", prompt: "Candidates are screened, then a round of interviews is conducted, and finally an offer is made to the chosen candidate." },
  { name: "cancel-anytime", prompt: "An order is paid for and then shipped. At any time before it ships, if the customer cancels, the order is stopped and their money is refunded." },
  { name: "reuse-credit-check", prompt: "A loan application comes in. The company runs its usual credit check on the applicant, and based on the result the loan is approved or declined." },
  { name: "book-trip-allornothing", prompt: "A trip is booked by reserving a flight and a hotel together. If either reservation can't be made, the other is cancelled and the whole booking is undone so nothing is left half-booked." },

  // --- Information being used ---
  { name: "contract-lifecycle", prompt: "A contract is drafted, the legal team reviews the draft, and once everyone's happy it's signed and filed away." },
  { name: "customer-lookup", prompt: "A verification request comes in. The customer's details are looked up in the customer records, the record is brought up to date, and the request is confirmed." },
  { name: "monthly-report", prompt: "Starting from the month's raw figures, the team puts together a monthly report and sends it out to stakeholders." },

  // --- Multiple parties / hand-offs ---
  { name: "three-team-claim", prompt: "A claim passes through three teams: customer service logs it, an assessor evaluates it, and finance pays it out. Show how it's handed from one team to the next." },
  { name: "customer-supplier", prompt: "A customer and a supplier deal with each other: the customer sends a purchase order, the supplier confirms it, ships the goods, and sends an invoice; the customer receives the goods and pays. Show the back-and-forth between the two organisations." },
  { name: "external-payment", prompt: "A booking company takes payment through an outside payment provider: it sends the charge to the provider and gets a result back. The provider's own internal steps aren't shown — only the exchange with it." },

  // --- Loops / repetition / scale ---
  { name: "rework-loop", prompt: "An author drafts a document, then a reviewer reviews it. If changes are requested, the author revises it and it goes back for another review, and this repeats until the reviewer is happy. Once approved, the document is published." },
  { name: "inspect-batch", prompt: "An inspector checks each item in a batch, one after another, repeating until every item in the batch has been inspected, after which the batch is released." },
  { name: "collect-approvals", prompt: "A purchase requisition needs sign-off from several approvers. Each approver reviews it, and once they have all responded the requisition is finalised." },
  { name: "long-claim-flow", prompt: "An insurance claim works through a long sequence of steps: it's received, registered, the policy is validated, coverage is checked, an assessor is assigned, an inspection is scheduled and then carried out, the damage is estimated, the estimate is reviewed, the outcome is decided, the payout is calculated, approval is obtained, payment is issued, the customer is notified, and finally the claim is closed." },
  { name: "five-way-approval", prompt: "After a purchase requisition is submitted it goes to five approvers at once — finance, procurement, legal, security, and the department head. Only once all five have approved is the purchase order raised." },
];
