/**
 * A ready-made Order-to-Cash GRC library — a realistic sample an Org can adopt
 * to explore Risk & Control end to end: Risks + Controls + Policies +
 * Regulations + Audit Findings + KRIs + KPIs, joined by the traceability graph.
 *
 * Some Controls carry a `monitorSignature` matching an Order-lifecycle
 * conformance deviation, so that once an Order-to-Cash event log is mined the
 * matrix shows operating effectiveness ("bypassed in N of M cases"). The order
 * lifecycle the signatures assume:
 *   Received → Credit Check → Approved (or On Credit Hold → Approved) →
 *   Fulfilled → Invoiced → Paid  (+ Cancelled / Disputed exceptions)
 *
 * Pure data — seeded as an org master by scripts/seed-risk-controls-o2c.ts.
 */
import type { RiskControlKind, ControlType, ControlAutomation } from "./types";

export interface SampleItem {
  code: string;
  kind: RiskControlKind;
  name: string;
  description?: string;
  // Risk
  likelihood?: number; impact?: number; riskCategory?: string;
  residualLikelihood?: number; residualImpact?: number;
  // Control
  controlType?: ControlType; automation?: ControlAutomation;
  frequency?: string; evidence?: string; testMethod?: string; testFrequency?: string;
  monitorSignature?: string;
  // Control + governance objects
  owner?: string; frameworkRef?: string;
}
export interface SampleLink { source: string; target: string; }   // by code

const items: SampleItem[] = [
  // ── Risks ──
  { code: "R-01", kind: "Risk", name: "Incorrect order entered", likelihood: 3, impact: 3, riskCategory: "Operational", residualLikelihood: 1, residualImpact: 2 },
  { code: "R-02", kind: "Risk", name: "Unauthorised discount / pricing error", likelihood: 3, impact: 4, riskCategory: "Financial", residualLikelihood: 1, residualImpact: 3 },
  { code: "R-03", kind: "Risk", name: "Customer exceeds credit limit (bad-debt exposure)", likelihood: 3, impact: 5, riskCategory: "Credit", residualLikelihood: 1, residualImpact: 4 },
  { code: "R-04", kind: "Risk", name: "Duplicate order", likelihood: 2, impact: 3, riskCategory: "Operational" },
  { code: "R-05", kind: "Risk", name: "Goods shipped but not invoiced (revenue leakage)", likelihood: 2, impact: 5, riskCategory: "Financial", residualLikelihood: 1, residualImpact: 3 },
  { code: "R-06", kind: "Risk", name: "Order fulfilled without approval", likelihood: 2, impact: 4, riskCategory: "Compliance" },
  { code: "R-07", kind: "Risk", name: "Revenue recognised incorrectly or prematurely", likelihood: 2, impact: 5, riskCategory: "Financial" },
  { code: "R-08", kind: "Risk", name: "Cash misapplied / unallocated receipts", likelihood: 3, impact: 3, riskCategory: "Financial" },
  { code: "R-09", kind: "Risk", name: "Segregation of duties: order entry = approval", likelihood: 2, impact: 4, riskCategory: "Compliance" },
  { code: "R-10", kind: "Risk", name: "Customer dispute mishandled (off-book status)", likelihood: 2, impact: 3, riskCategory: "Operational" },

  // ── Controls ── (monitorSignature ties bypass to a mined Order-lifecycle deviation)
  { code: "C-01", kind: "Control", name: "Mandatory field validation on order entry", controlType: "Preventive", automation: "Automated", owner: "ERP System", frequency: "Every order", evidence: "Order validation logs", testMethod: "Sample 25 orders", testFrequency: "Quarterly" },
  { code: "C-02", kind: "Control", name: "Manager approval for discounts over 10%", controlType: "Preventive", automation: "ITDependent", owner: "Sales Manager", frameworkRef: "DOA-01", frequency: "Per exception", evidence: "Approval recorded in ERP", testMethod: "Sample 25 discounted orders", testFrequency: "Quarterly" },
  { code: "C-03", kind: "Control", name: "Automatic credit check / credit-limit block", controlType: "Preventive", automation: "Automated", owner: "Finance System", frequency: "Every order", evidence: "Credit-check system log", testMethod: "Re-perform on a sample", testFrequency: "Quarterly", monitorSignature: "undocumented-transition|Received|Approved" },
  { code: "C-04", kind: "Control", name: "Duplicate-order detection", controlType: "Detective", automation: "Automated", owner: "ERP System", frequency: "Every order", evidence: "Duplicate-match report" },
  { code: "C-05", kind: "Control", name: "Ship-to-invoice reconciliation", controlType: "Detective", automation: "Automated", owner: "Billing Team", frequency: "Daily", evidence: "Unbilled-shipments report", testMethod: "Review exceptions", testFrequency: "Monthly" },
  { code: "C-06", kind: "Control", name: "Order approval before fulfilment", controlType: "Preventive", automation: "Manual", owner: "Sales Operations", frequency: "Per order", evidence: "Approval in ERP", testMethod: "Sample 25 orders", testFrequency: "Quarterly", monitorSignature: "undocumented-transition|Received|Fulfilled" },
  { code: "C-07", kind: "Control", name: "Credit-hold release before shipment", controlType: "Preventive", automation: "ITDependent", owner: "Credit Manager", frequency: "Per held order", evidence: "Credit-hold release log", testMethod: "Sample held orders", testFrequency: "Quarterly", monitorSignature: "undocumented-transition|On Credit Hold|Fulfilled" },
  { code: "C-08", kind: "Control", name: "Period-end revenue-recognition review", controlType: "Detective", automation: "Manual", owner: "Financial Controller", frameworkRef: "SOX 404", frequency: "Monthly", evidence: "Signed rev-rec checklist", testMethod: "Reperformance", testFrequency: "Annually" },
  { code: "C-09", kind: "Control", name: "Cash application / remittance matching", controlType: "Detective", automation: "Automated", owner: "AR Team", frequency: "Daily", evidence: "Unapplied-cash report" },
  { code: "C-10", kind: "Control", name: "Segregation of duties — order entry ≠ approval", controlType: "Preventive", automation: "ITDependent", owner: "Access Management", frameworkRef: "ISO 27001 A.9", frequency: "Continuous", evidence: "User access / role report", testMethod: "Access review", testFrequency: "Half-yearly" },
  { code: "C-11", kind: "Control", name: "Dispute management per policy", controlType: "Corrective", automation: "Manual", owner: "AR Manager", frequency: "Per dispute", evidence: "Dispute case log", monitorSignature: "unknown-state|Disputed" },

  // ── Policies ──
  { code: "P-01", kind: "Policy", name: "Sales & Order Management Policy", owner: "Chief Revenue Officer", frameworkRef: "SALES-01" },
  { code: "P-02", kind: "Policy", name: "Credit Policy", owner: "CFO", frameworkRef: "CREDIT-01" },
  { code: "P-03", kind: "Policy", name: "Delegation of Authority", owner: "CFO", frameworkRef: "DOA-01" },
  { code: "P-04", kind: "Policy", name: "Revenue Recognition Policy", owner: "Financial Controller", frameworkRef: "REV-01" },
  { code: "P-05", kind: "Policy", name: "Segregation of Duties Policy", owner: "Head of Risk", frameworkRef: "SOD-01" },

  // ── Regulations ──
  { code: "REG-01", kind: "Regulation", name: "Sarbanes-Oxley (SOX)", frameworkRef: "SOX 404", owner: "Compliance" },
  { code: "REG-02", kind: "Regulation", name: "IFRS 15 — Revenue from Contracts", frameworkRef: "IFRS 15", owner: "Financial Controller" },
  { code: "REG-03", kind: "Regulation", name: "ISO/IEC 27001 — Access Control", frameworkRef: "A.9", owner: "CISO" },

  // ── Audit findings ──
  { code: "AF-01", kind: "AuditFinding", name: "Credit checks bypassed on high-value orders", owner: "Internal Audit", frameworkRef: "IA-2025-07" },
  { code: "AF-02", kind: "AuditFinding", name: "Goods shipped while order on credit hold", owner: "Internal Audit", frameworkRef: "IA-2025-08" },

  // ── KRIs ──
  { code: "KRI-01", kind: "KRI", name: "% orders approved without a credit check", owner: "Credit Manager" },
  { code: "KRI-02", kind: "KRI", name: "Overdue AR / bad-debt ratio", owner: "CFO" },
  { code: "KRI-03", kind: "KRI", name: "Revenue leakage — shipped not invoiced", owner: "Billing Team" },

  // ── KPIs ──
  { code: "KPI-01", kind: "KPI", name: "Order-to-cash cycle time", owner: "COO" },
  { code: "KPI-02", kind: "KPI", name: "Order accuracy / first-time-right rate", owner: "Sales Operations" },
  { code: "KPI-03", kind: "KPI", name: "Days Sales Outstanding (DSO)", owner: "AR Team" },
];

const links: SampleLink[] = [
  // Controls mitigate Risks
  { source: "C-01", target: "R-01" }, { source: "C-02", target: "R-02" }, { source: "C-03", target: "R-03" },
  { source: "C-04", target: "R-04" }, { source: "C-05", target: "R-05" }, { source: "C-06", target: "R-06" },
  { source: "C-07", target: "R-03" }, { source: "C-08", target: "R-07" }, { source: "C-09", target: "R-08" },
  { source: "C-10", target: "R-09" }, { source: "C-11", target: "R-10" },
  // Policies govern Controls
  { source: "P-01", target: "C-01" }, { source: "P-01", target: "C-06" }, { source: "P-02", target: "C-03" },
  { source: "P-02", target: "C-07" }, { source: "P-03", target: "C-02" }, { source: "P-04", target: "C-08" },
  { source: "P-05", target: "C-10" },
  // Regulations require Policies
  { source: "REG-01", target: "P-04" }, { source: "REG-01", target: "P-02" }, { source: "REG-02", target: "P-04" },
  { source: "REG-03", target: "P-05" },
  // Audit findings raised against Controls
  { source: "AF-01", target: "C-03" }, { source: "AF-02", target: "C-07" },
  // KRIs monitor Risks
  { source: "KRI-01", target: "R-03" }, { source: "KRI-02", target: "R-03" }, { source: "KRI-03", target: "R-05" },
  // KPIs measure Controls
  { source: "KPI-01", target: "C-05" }, { source: "KPI-02", target: "C-01" }, { source: "KPI-03", target: "C-09" },
];

export const O2C_SAMPLE = {
  name: "Order-to-Cash — Sample GRC Library",
  items,
  links,
};

/** Real Order-to-Cash step label → the Risk / Control codes it carries. Used to
 *  attach the library onto the genuine process diagrams when the example is
 *  adopted. */
export const O2C_ATTACH: Record<string, { risks?: string[]; controls?: string[] }> = {
  "Capture order details": { risks: ["R-01"], controls: ["C-01"] },
  "Log Order Details": { risks: ["R-01"], controls: ["C-01"] },
  "Record order in OMS": { risks: ["R-01"], controls: ["C-01"] },
  "Record Order Formally": { risks: ["R-01"], controls: ["C-01"] },
  "Check order against duplicates / existing customer": { risks: ["R-04"], controls: ["C-04"] },
  "Check Duplicate and Customer Match": { risks: ["R-04"], controls: ["C-04"] },
  "Set Up Customer Record": { risks: ["R-09"], controls: ["C-10"] },
  "Apply contract / discount pricing": { risks: ["R-02"], controls: ["C-02"] },
  "Confirm final price and credit terms": { controls: ["C-02"] },
  "Check credit limit and exposure": { risks: ["R-03"], controls: ["C-03"] },
  "Credit Officer review": { controls: ["C-07"] },
  "Request prepayment / hold order": { risks: ["R-03"], controls: ["C-07"] },
  "Escalate to Credit Manager": { controls: ["C-07"] },
  "Pick items": { risks: ["R-06"], controls: ["C-06"] },
  "Pack and label": { controls: ["C-06"] },
  "Stage for dispatch and update WMS": { risks: ["R-05"], controls: ["C-05"] },
  "Quality check": { controls: ["C-05"] },
  "Match payments to invoices": { risks: ["R-08"], controls: ["C-09"] },
  "Record payment against invoice": { risks: ["R-08"], controls: ["C-09"] },
  "Investigate and allocate": { controls: ["C-09"] },
  "Investigate Dispute / Deduction": { risks: ["R-10"], controls: ["C-11"] },
  "Log Case": { controls: ["C-11"] },
};
