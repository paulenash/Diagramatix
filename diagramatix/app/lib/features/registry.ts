/**
 * Canonical registry of gateable features — the source of the "Feature Availability
 * by Subscription Level" matrix (from menus_and_features/Feature by Subscription
 * Level v1.4.xlsx). Each feature has a stable `key` (never rename — it's used in the
 * DB matrix + per-user overrides), a display `label`, and a `category` for grouping
 * the admin grid. Adding a feature = add an entry here + a row per level (seed).
 *
 * The four legacy entitlement keys (simulator / processMining / riskControl / apqc)
 * keep their exact names so the old Entitlements booleans derive 1:1 from the matrix.
 */

export type FeatureCategory =
  | "AI Generation"
  | "Authoring"
  | "Collaboration"
  | "Analytics & Mining"
  | "Governance"
  | "Import & Export"
  | "Integration"
  | "Documents"
  | "Platform"
  | "AI Models"
  | "Enterprise";

export interface FeatureDef {
  key: string;
  label: string;
  category: FeatureCategory;
}

export const FEATURES: FeatureDef[] = [
  // AI Generation
  { key: "ai-generate-typed",    label: "AI Generate: Typed Prompt",     category: "AI Generation" },
  { key: "ai-generate-image",    label: "AI Generate: Image to Diagram", category: "AI Generation" },
  { key: "ai-generate-dictated", label: "AI Generate: Dictated Prompt",  category: "AI Generation" },
  { key: "ai-generate-audio",    label: "AI Generate: Audio/VTT",        category: "AI Generation" },
  { key: "ai-generate-refine",   label: "AI Generate: Refine Prompt",    category: "AI Generation" },
  { key: "ai-generate-record",   label: "AI Generate: Record to Prompt", category: "AI Generation" },
  // Authoring
  { key: "bpmn-templates",       label: "BPMN Templates",                category: "Authoring" },
  { key: "nl-assist",            label: "NL Assist",                     category: "Authoring" },
  { key: "abracadabra",          label: "Abracadabra (voice editing)",   category: "Authoring" },
  // Collaboration
  { key: "collaboration-groups", label: "Collaboration Groups",          category: "Collaboration" },
  { key: "sharing",              label: "Project & Diagram Sharing",     category: "Collaboration" },
  { key: "co-authoring",         label: "Co-authoring",                  category: "Collaboration" },
  { key: "process-review",       label: "Process Review",                category: "Collaboration" },
  // Analytics & Mining
  { key: "diff-processes",         label: "Diff Processes",              category: "Analytics & Mining" },
  { key: "simulator",              label: "Simulator",                   category: "Analytics & Mining" },
  { key: "simulator-examples",     label: "Simulator Examples",          category: "Analytics & Mining" },
  { key: "processMining",          label: "Process Mining (XES)",        category: "Analytics & Mining" },
  { key: "process-mining-examples",label: "Process Mining Examples",     category: "Analytics & Mining" },
  { key: "process-mining-ocel",    label: "Process Mining OCEL Support", category: "Analytics & Mining" },
  { key: "task-mining",            label: "Task Mining",                 category: "Analytics & Mining" },
  { key: "apqc",                   label: "APQC Process Framework",      category: "Analytics & Mining" },
  // Governance
  { key: "riskControl",            label: "Risk & Control",              category: "Governance" },
  { key: "risk-control-examples",  label: "Risk & Control Examples",     category: "Governance" },
  // Import & Export
  { key: "visio-import-individual", label: "Individual Visio Import",    category: "Import & Export" },
  { key: "visio-export-individual", label: "Individual Visio Export",    category: "Import & Export" },
  { key: "visio-import-bulk",       label: "Bulk Visio Import",          category: "Import & Export" },
  { key: "visio-export-bulk",       label: "Bulk Visio Export",          category: "Import & Export" },
  // Integration
  { key: "sharepoint",             label: "SharePoint Integration",      category: "Integration" },
  // Documents
  { key: "sop-generation",         label: "SOP Generation",              category: "Documents" },
  // Platform
  { key: "process-portal",         label: "Process Portal",              category: "Platform" },
  { key: "mobile",                 label: "Mobile Diagramatix",          category: "Platform" },
  // AI Models
  { key: "choice-of-llms",         label: "Choice of LLMs",              category: "AI Models" },
  { key: "local-llm",              label: "Local LLM Support",           category: "AI Models" },
  // Enterprise
  { key: "soc2",                   label: "SOC 2 Type II Audit",         category: "Enterprise" },
];

export const FEATURE_KEYS: string[] = FEATURES.map((f) => f.key);
export const FEATURE_DEF: Record<string, FeatureDef> = Object.fromEntries(FEATURES.map((f) => [f.key, f]));

/** The four legacy Entitlements booleans map to these registry keys. */
export const LEGACY_FEATURE_KEYS = {
  simulator: "simulator",
  processMining: "processMining",
  riskControl: "riskControl",
  apqc: "apqc",
} as const;
