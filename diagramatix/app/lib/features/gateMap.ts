/**
 * THE GATE MAP — for every feature in the registry, what actually enforces it.
 *
 * Feature Availability is only worth what is behind it: a cell in the grid does
 * nothing unless code somewhere reads that feature's state. This file says, for
 * each feature, where that is (or that nowhere is yet), and the SuperAdmin grid
 * shows it next to the cell so nobody has to guess (the plan of 2026-09-30 found
 * 23 of the 35 features had no gate at all).
 *
 * It is CHECKED, not just written: tests/features/gate-map.test.ts fails if
 *   • a feature has no entry here;
 *   • a `wired`/`partial` entry's file is missing or no longer contains its needle
 *     (the gate was moved or removed and this list went stale);
 *   • an entry marked `unwired` is in fact referenced by a gate somewhere (it was
 *     wired and this list was not updated); or
 *   • any gate in the app names a feature key that is not in the registry
 *     (a typo would lock the feature for everyone but a SuperAdmin).
 * The `unwired` list is a ratchet: it can only shrink.
 *
 * Status:
 *   wired         — the feature's own state is enforced on the server (and the UI reads it).
 *   partial       — enforced at some entry points only, or only through something else.
 *   unwired       — nothing reads this feature's state; its cell changes nothing yet.
 *   informational — a statement about the product, not a switch (e.g. an audit certificate).
 */

export type GateStatus = "wired" | "partial" | "unwired" | "informational";

/** A place in the source that enforces the feature: a file and a substring that must be in it. */
export interface GateRef {
  file: string;
  needle: string;
  /** What this place is, for the grid ("Diagram editor toolbar", "POST create study"). */
  what: string;
}

export interface FeatureGateInfo {
  /** One line: what the feature is, in the words a SuperAdmin needs to decide a level. */
  description: string;
  status: GateStatus;
  ui: GateRef[];
  server: GateRef[];
  /** Other systems that limit or police the same thing, not driven by this cell. */
  alsoLimitedBy?: string[];
  /** Why it is partial / unwired, when that is not obvious. */
  note?: string;
}

const AI_ALSO = ["AI attempts limit (per level)", "Organisation policy: allowAi"];

export const FEATURE_GATES: Record<string, FeatureGateInfo> = {
  // ── AI Generation ──────────────────────────────────────────────────────────
  "ai-generate-typed":    { description: "Generate a diagram from a typed prompt.", status: "unwired", ui: [], server: [], alsoLimitedBy: AI_ALSO },
  "ai-generate-image":    { description: "Generate a diagram from a picture of one.", status: "unwired", ui: [], server: [], alsoLimitedBy: AI_ALSO },
  "ai-generate-dictated": { description: "Dictate the prompt by voice.", status: "unwired", ui: [], server: [], alsoLimitedBy: [...AI_ALSO, "Organisation policy: allowVoiceAi"] },
  "ai-generate-audio":    { description: "Turn an audio recording or transcript into a prompt.", status: "unwired", ui: [], server: [], alsoLimitedBy: [...AI_ALSO, "Organisation policy: allowVoiceAi"] },
  "ai-generate-refine":   { description: "Refine a prompt with the AI's questions before generating.", status: "unwired", ui: [], server: [], alsoLimitedBy: AI_ALSO },
  "ai-generate-record":   { description: "Record a conversation and turn it into a prompt.", status: "unwired", ui: [], server: [], alsoLimitedBy: [...AI_ALSO, "Organisation policy: allowVoiceAi"] },

  // ── Authoring ──────────────────────────────────────────────────────────────
  "bpmn-templates": { description: "The BPMN template window (insert a ready-made flow).", status: "unwired", ui: [], server: [] },
  "nl-assist":      { description: "Typed natural-language editing commands.", status: "unwired", ui: [], server: [], note: "Voice Assist (the voice-assist key) is what /api/ai/command actually enforces; this key is read by nothing." },
  "voice-assist": {
    description: "Edit a diagram by voice (desktop and phone).",
    status: "wired",
    ui: [
      { file: "app/(dashboard)/diagram/[id]/DiagramEditor.tsx", needle: 'useFeatureState("voice-assist")', what: "Diagram editor: Voice Assist bar and wand" },
      { file: "app/m/diagram/[id]/MobileDiagramScreen.tsx", needle: 'useFeatureState("voice-assist")', what: "Phone: the 🎤 button" },
    ],
    server: [{ file: "app/api/ai/command/route.ts", needle: '"voice-assist"', what: "POST /api/ai/command" }],
    alsoLimitedBy: ["Organisation policy: allowVoiceAi (speech), allowAi (AI fallback)"],
    note: "Voice commands are not yet counted against the AI attempts limit.",
  },
  "voice-feedback": {
    description: "Spoken replies (text-to-speech) from Voice Assist and the narrated walkthrough.",
    status: "wired",
    ui: [{ file: "app/hooks/useSpeechAvailable.ts", needle: "/api/ai/speak", what: "Asks the server whether speech is allowed" }],
    server: [{ file: "app/api/ai/speak/route.ts", needle: "speechGranted", what: "GET/POST /api/ai/speak (own fail-closed gate)" }],
    note: "Fails CLOSED, unlike every other feature: it needs an explicit override or an explicit Available row.",
  },

  // ── Collaboration ──────────────────────────────────────────────────────────
  "collaboration-groups": { description: "Groups of collaborators that projects and diagrams are shared with.", status: "unwired", ui: [], server: [] },
  "sharing":              { description: "Share projects and diagrams with other people.", status: "unwired", ui: [], server: [], alsoLimitedBy: ["Organisation policy: allowCrossOrgSharing"] },
  "co-authoring":         { description: "Edit a diagram together with others, live.", status: "unwired", ui: [], server: [], note: "SubscriptionLevel.hasCollaboration and Org.allowCollaboration exist but nothing reads them." },
  "process-review": {
    description: "Reviewers comment on a diagram (desktop and phone).",
    status: "partial",
    ui: [],
    server: [{ file: "app/lib/features/registry.ts", needle: 'requires: ["process-review", "voice-assist"]', what: "Required by Mobile Access" }],
    note: "Enforced only through Mobile Access (a dependency). The review comment routes themselves are not gated by it yet.",
  },

  // ── Analytics & Mining ─────────────────────────────────────────────────────
  "diff-processes": { description: "Compare two versions of a process.", status: "unwired", ui: [], server: [], alsoLimitedBy: AI_ALSO },
  "simulator": {
    description: "Simulation: studies, scenarios and results.",
    status: "partial",
    ui: [
      { file: "app/(dashboard)/dashboard/DashboardClient.tsx", needle: "ent.simulator", what: "Dashboard: examples menu" },
      { file: "app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx", needle: "ent.simulator", what: "Project page: Simulator button" },
      { file: "app/(dashboard)/diagram/[id]/DiagramEditor.tsx", needle: 'featureStates["simulator"]', what: "Diagram editor: Simulator button and panel" },
    ],
    server: [
      { file: "app/api/projects/[id]/simulation/studies/route.ts", needle: '"simulator"', what: "POST create a study" },
      { file: "app/api/simulation-examples/[id]/adopt/route.ts", needle: '"simulator"', what: "POST adopt an example" },
      { file: "app/api/projects/[id]/mining/runs/[runId]/calibrate/route.ts", needle: '"simulator"', what: "POST calibrate (needs Mining too)" },
    ],
    note: "Entry points only: an existing study can still be run, swept and AI-assessed without the feature.",
  },
  "simulator-examples": { description: "The ready-made simulation examples.", status: "unwired", ui: [], server: [], note: "Adopting an example is gated by `simulator`, not by this key." },
  "processMining": {
    description: "Process mining: import logs, discover, conformance, sources.",
    status: "wired",
    ui: [
      { file: "app/(dashboard)/dashboard/DashboardClient.tsx", needle: "ent.processMining", what: "Dashboard: examples menu and project menu" },
      { file: "app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx", needle: "ent.processMining", what: "Project page: Mining button" },
    ],
    server: [
      { file: "app/api/projects/[id]/mining/runs/route.ts", needle: '"processMining"', what: "Mining runs" },
      { file: "app/api/projects/[id]/mining/import/route.ts", needle: '"processMining"', what: "Import a log" },
    ],
    note: "Every project mining route is gated (guarded by tests/mining/route-gating.test.ts); ingest and poll are machine callers.",
  },
  "process-mining-examples": {
    description: "The ready-made process mining examples.",
    status: "partial",
    ui: [],
    server: [{ file: "app/api/mining-examples/route.ts", needle: '"process-mining-examples"', what: "GET the examples" }],
    note: "Adopting an example is gated by `processMining`.",
  },
  "process-mining-ocel": {
    description: "Object-centric event logs (OCEL) for process mining.",
    status: "partial",
    ui: [],
    server: [{ file: "app/api/projects/[id]/mining/import-ocel/route.ts", needle: '"process-mining-ocel"', what: "POST import an OCEL log" }],
  },
  "task-mining": {
    description: "Task mining: SOPs from recorded task steps.",
    status: "partial",
    ui: [],
    server: [{ file: "app/api/projects/[id]/mining/runs/[runId]/task-sop/route.ts", needle: '"task-mining"', what: "POST generate a task SOP" }],
  },
  "apqc": {
    description: "The APQC Process Classification Framework.",
    status: "partial",
    ui: [
      { file: "app/(dashboard)/dashboard/DashboardClient.tsx", needle: "ent.apqc", what: "Dashboard: create APQC project" },
      { file: "app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx", needle: "ent.apqc", what: "Project page" },
    ],
    server: [
      { file: "app/api/projects/[id]/pcf/seed-folders/route.ts", needle: '"apqc"', what: "POST seed folders" },
      { file: "app/api/projects/[id]/pcf/decompose/route.ts", needle: '"apqc"', what: "POST decompose" },
    ],
    note: "Entry points only; the framework, search, coverage and organisation routes are not gated.",
  },

  // ── Governance ─────────────────────────────────────────────────────────────
  "riskControl": {
    description: "Risk & Control matrix and compliance monitoring.",
    status: "partial",
    ui: [
      { file: "app/(dashboard)/dashboard/DashboardClient.tsx", needle: "ent.riskControl", what: "Dashboard: examples menu" },
      { file: "app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx", needle: "ent.riskControl", what: "Project page: Risk & Control" },
      { file: "app/(dashboard)/diagram/[id]/DiagramEditor.tsx", needle: 'featureStates["riskControl"]', what: "Diagram editor: Risk & Control panel" },
    ],
    server: [{ file: "app/lib/riskControls/routeAuth.ts", needle: 'feature: "riskControl"', what: "Every mutating risk-control route" }],
    note: "Mutations only, by design: reads stay open so a downgraded user can still see what they built.",
  },
  "risk-control-examples": { description: "The ready-made Risk & Control examples.", status: "unwired", ui: [], server: [], note: "Adopting an example is gated by `riskControl`, not by this key." },

  // ── Import & Export ────────────────────────────────────────────────────────
  "visio-import-individual": { description: "Import one Visio file.", status: "unwired", ui: [], server: [], alsoLimitedBy: ["Individual imports limit (per level)"] },
  "visio-export-individual": { description: "Export one diagram to Visio.", status: "unwired", ui: [], server: [], alsoLimitedBy: ["Individual exports limit (per level)"] },
  "visio-import-bulk":       { description: "Import many Visio files at once.", status: "unwired", ui: [], server: [], alsoLimitedBy: ["Bulk imports limit (per level)"] },
  "visio-export-bulk":       { description: "Export a whole project to Visio.", status: "unwired", ui: [], server: [], alsoLimitedBy: ["Bulk exports limit (per level)"] },

  // ── Integration / Documents ────────────────────────────────────────────────
  "sharepoint":     { description: "Export to and import from SharePoint.", status: "unwired", ui: [], server: [], alsoLimitedBy: ["Organisation policy: allowSharePoint", "Needs the person's Microsoft connection"] },
  "sop-generation": { description: "Generate a Standard Operating Procedure from a diagram.", status: "unwired", ui: [], server: [], alsoLimitedBy: AI_ALSO },

  // ── Platform ───────────────────────────────────────────────────────────────
  "process-portal": { description: "The published process portal.", status: "unwired", ui: [], server: [] },
  "mobile": {
    description: "Mobile Access: the phone app (view, review, edit by voice). Needs Process Review and Voice Assist.",
    status: "wired",
    ui: [{ file: "app/m/MobileUnavailable.tsx", needle: "Mobile access isn’t in your plan", what: "Phone: the upgrade page shown instead of the app" }],
    server: [{ file: "app/m/layout.tsx", needle: "mobileAccess(await getFeatureStates(session.user.id))", what: "Every /m page (layout)" }],
    note: "The phone reads the shared diagram and comment APIs, which are not gated by this key because the desktop uses them too.",
  },

  // ── AI Models ──────────────────────────────────────────────────────────────
  "choice-of-llms": { description: "Choose which AI model generates.", status: "unwired", ui: [], server: [], note: "The model picker is limited by cost, not by this key." },
  "local-llm":      { description: "Use a local model (on-premise).", status: "unwired", ui: [], server: [] },

  // ── Enterprise ─────────────────────────────────────────────────────────────
  "soc2": { description: "SOC 2 Type II audit report available.", status: "informational", ui: [], server: [], note: "A statement about the product, not a switch." },
};
