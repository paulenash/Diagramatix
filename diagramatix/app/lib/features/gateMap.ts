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
  "ai-generate-typed": {
    description: "Generate a diagram from a typed prompt.", status: "wired", ui: [],
    server: [
      { file: "app/api/ai/bpmn/plan/route.ts", needle: '"ai-generate-typed"', what: "BPMN plan" },
      { file: "app/api/ai/generate-bpmn/route.ts", needle: '"ai-generate-typed"', what: "BPMN generate" },
      { file: "app/api/ai/generate-diagram/route.ts", needle: '"ai-generate-typed"', what: "Diagram generate" },
      { file: "app/api/ai/epc/plan/route.ts", needle: '"ai-generate-typed"', what: "EPC plan" },
      { file: "app/api/ai/flowchart/plan/route.ts", needle: '"ai-generate-typed"', what: "Flowchart plan" },
      { file: "app/api/diagrams/[id]/generate/route.ts", needle: '"ai-generate-typed"', what: "Phone generate" },
    ],
    alsoLimitedBy: AI_ALSO,
    note: "A request that carries an image attachment needs Image to Diagram instead.",
  },
  "ai-generate-image": {
    description: "Generate a diagram from a picture of one.", status: "wired", ui: [],
    server: [
      { file: "app/api/ai/bpmn/plan/route.ts", needle: '"ai-generate-image"', what: "BPMN plan" },
      { file: "app/api/ai/generate-bpmn/route.ts", needle: '"ai-generate-image"', what: "BPMN generate" },
      { file: "app/api/ai/generate-diagram/route.ts", needle: '"ai-generate-image"', what: "Diagram generate" },
      { file: "app/api/ai/epc/plan/route.ts", needle: '"ai-generate-image"', what: "EPC plan" },
      { file: "app/api/ai/flowchart/plan/route.ts", needle: '"ai-generate-image"', what: "Flowchart plan" },
      { file: "app/api/diagrams/[id]/generate/route.ts", needle: '"ai-generate-image"', what: "Phone generate" },
    ],
    alsoLimitedBy: AI_ALSO,
  },
  "ai-generate-dictated": {
    description: "Dictate the prompt by voice.", status: "partial",
    ui: [{ file: "app/lib/dictation/index.ts", needle: 'purpose: "prompt"', what: "A spoken prompt says so when it asks for a token" }],
    server: [{ file: "app/api/ai/dictation/token/route.ts", needle: '"ai-generate-dictated"', what: "POST dictation token (purpose: prompt)" }],
    alsoLimitedBy: [...AI_ALSO, "Organisation policy: allowVoiceAi"],
    note: "The token also serves Voice Assist and review comments, which this feature does not gate; only a caller that says it is dictating a prompt is checked.",
  },
  "ai-generate-audio": {
    description: "Turn an uploaded audio file into a prompt.", status: "wired", ui: [],
    server: [{ file: "app/api/ai/audio/transcribe/route.ts", needle: '"ai-generate-audio"', what: "POST transcribe (upload)" }],
    alsoLimitedBy: [...AI_ALSO, "Organisation policy: allowVoiceAi"],
    note: "A Teams .vtt transcript is read in the browser (no server call), so it is not gated by this feature.",
  },
  "ai-generate-refine": {
    description: "Refine a prompt with the AI's questions before generating.", status: "wired", ui: [],
    server: [{ file: "app/api/ai/bpmn/refine-questions/route.ts", needle: '"ai-generate-refine"', what: "POST refine questions" }],
    alsoLimitedBy: AI_ALSO,
  },
  "ai-generate-record": {
    description: "Record a conversation in the browser and turn it into a prompt.", status: "wired",
    ui: [{ file: "app/components/AudioToProcessButton.tsx", needle: 'transcribeAudioBlob(blob, "record")', what: "The record button says it is a recording" }],
    server: [{ file: "app/api/ai/audio/transcribe/route.ts", needle: '"ai-generate-record"', what: "POST transcribe (recording)" }],
    alsoLimitedBy: [...AI_ALSO, "Organisation policy: allowVoiceAi"],
  },

  // ── Authoring ──────────────────────────────────────────────────────────────
  "bpmn-templates": {
    description: "The BPMN template window (insert a ready-made flow).", status: "wired", ui: [],
    server: [{ file: "app/api/templates/route.ts", needle: '"bpmn-templates"', what: "GET / POST the template library" }],
  },
  "nl-assist": {
    description: "Typed natural-language editing commands (NL Assist).", status: "partial", ui: [],
    server: [{ file: "app/api/ai/command/route.ts", needle: '"nl-assist"', what: "POST /api/ai/command (Voice Assist OR Assist opens it)" }],
    note: "The route accepts either; the editor still draws the Assist bar only when Voice Assist is available, so Assist on its own is not reachable from the screen yet.",
  },
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
  "collaboration-groups": {
    description: "Groups of collaborators that projects and diagrams are shared with.", status: "wired", ui: [],
    server: [
      { file: "app/api/groups/route.ts", needle: '"collaboration-groups"', what: "POST create a group" },
      { file: "app/api/groups/[id]/members/route.ts", needle: '"collaboration-groups"', what: "POST add a member" },
    ],
    note: "Creating and changing groups; reading the groups you belong to stays open.",
  },
  "sharing": {
    description: "Share projects and diagrams with other people.", status: "wired", ui: [],
    server: [
      { file: "app/api/projects/[id]/shares/route.ts", needle: '"sharing"', what: "POST share a project" },
      { file: "app/api/projects/[id]/share-candidates/route.ts", needle: '"sharing"', what: "GET who can be shared with" },
    ],
    alsoLimitedBy: ["Organisation policy: allowCrossOrgSharing"],
    note: "Sharing something new; existing shares stay visible and can be removed.",
  },
  "co-authoring": {
    description: "Edit a diagram together with others, live.", status: "wired", ui: [],
    server: [
      { file: "app/api/collab/token/route.ts", needle: '"co-authoring"', what: "POST collaboration token" },
      { file: "app/api/collab/flush/route.ts", needle: '"co-authoring"', what: "POST flush the shared document" },
    ],
    note: "SubscriptionLevel.hasCollaboration and Org.allowCollaboration still exist and are read by nothing.",
  },
  "process-review": {
    description: "Reviewers comment on a diagram (desktop and phone).",
    status: "partial",
    ui: [],
    server: [{ file: "app/lib/features/registry.ts", needle: 'requires: ["process-review", "voice-assist"]', what: "Required by Mobile Access" }],
    note: "Enforced only through Mobile Access (a dependency). The review comment routes themselves are not gated by it yet.",
  },

  // ── Analytics & Mining ─────────────────────────────────────────────────────
  "diff-processes": {
    description: "Compare two versions of a process.", status: "wired", ui: [],
    server: [{ file: "app/api/diagrams/diff/route.ts", needle: '"diff-processes"', what: "POST compare" }],
    alsoLimitedBy: AI_ALSO,
  },
  "simulator": {
    description: "Simulation: studies, scenarios and results. The module — the advanced parts are separate features that need it.",
    status: "wired",
    ui: [
      { file: "app/(dashboard)/dashboard/DashboardClient.tsx", needle: "ent.simulator", what: "Dashboard: examples menu" },
      { file: "app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx", needle: "ent.simulator", what: "Project page: Simulator button" },
      { file: "app/(dashboard)/diagram/[id]/DiagramEditor.tsx", needle: 'featureStates["simulator"]', what: "Diagram editor: Simulator button and panel" },
    ],
    server: [
      { file: "app/api/projects/[id]/simulation/studies/route.ts", needle: '"simulator"', what: "POST create a study" },
      { file: "app/api/projects/[id]/simulation/adopt/route.ts", needle: '"simulator"', what: "POST adopt a package" },
      { file: "app/api/projects/[id]/simulation/studies/[studyId]/route.ts", needle: '"simulator"', what: "PUT / DELETE a study" },
      { file: "app/api/projects/[id]/simulation/studies/[studyId]/scenarios/route.ts", needle: '"simulator"', what: "POST a scenario" },
      { file: "app/api/projects/[id]/simulation/studies/[studyId]/scenarios/[scenarioId]/run/route.ts", needle: '"simulator"', what: "POST run a scenario" },
      { file: "app/api/projects/[id]/simulation/studies/[studyId]/scenarios/[scenarioId]/runs/[runId]/route.ts", needle: '"simulator"', what: "PATCH / DELETE a run" },
      { file: "app/api/projects/[id]/mining/runs/[runId]/calibrate/route.ts", needle: '"simulator"', what: "POST calibrate (needs Mining too)" },
    ],
    note: "Every route that changes or computes is gated (tests/simulation/route-gating.test.ts). Reading what you already have stays open, so a downgraded user can still see their studies.",
  },
  "simulator-examples": {
    description: "The ready-made simulation examples.",
    status: "wired",
    ui: [],
    server: [
      { file: "app/api/simulation-examples/route.ts", needle: '"simulator-examples"', what: "GET the examples" },
      { file: "app/api/simulation-examples/[id]/adopt/route.ts", needle: '"simulator-examples"', what: "POST adopt an example" },
    ],
  },
  "simulator-analysis": {
    description: "Sensitivity (tornado), parameter sweep, business case, next steps and the AI assessment.",
    status: "wired",
    ui: [],
    server: [
      { file: "app/api/projects/[id]/simulation/studies/[studyId]/scenarios/[scenarioId]/sensitivity/route.ts", needle: '"simulator-analysis"', what: "POST sensitivity" },
      { file: "app/api/projects/[id]/simulation/studies/[studyId]/scenarios/[scenarioId]/sweep/route.ts", needle: '"simulator-analysis"', what: "POST sweep" },
      { file: "app/api/projects/[id]/simulation/studies/[studyId]/business-case/route.ts", needle: '"simulator-analysis"', what: "Business case" },
      { file: "app/api/projects/[id]/simulation/studies/[studyId]/next-steps/route.ts", needle: '"simulator-analysis"', what: "POST next steps" },
      { file: "app/api/projects/[id]/simulation/studies/[studyId]/assess/route.ts", needle: '"simulator-analysis"', what: "POST AI assessment" },
    ],
    alsoLimitedBy: ["AI attempts limit (the AI narration; at the limit it falls back to the deterministic summary)", "Organisation policy: allowAi"],
  },
  "simulator-bpsim": {
    description: "BPSim (and bundle) import and export.",
    status: "wired",
    ui: [],
    server: [
      { file: "app/api/simulation/import/route.ts", needle: '"simulator-bpsim"', what: "POST import a file as a new project" },
      { file: "app/api/projects/[id]/simulation/export/route.ts", needle: '"simulator-bpsim"', what: "GET export" },
    ],
  },
  "simulator-calendars": {
    description: "Simulation calendars (working hours, holidays).",
    status: "wired",
    ui: [],
    server: [
      { file: "app/api/projects/[id]/simulation-calendars/route.ts", needle: '"simulator-calendars"', what: "POST a calendar" },
      { file: "app/api/projects/[id]/simulation-calendars/[calendarId]/route.ts", needle: '"simulator-calendars"', what: "PUT / DELETE a calendar" },
    ],
  },
  "simulator-teams": {
    description: "Simulation teams and skills, in a project and in the organisation's master library.",
    status: "wired",
    ui: [],
    server: [
      { file: "app/api/projects/[id]/simulation-teams/route.ts", needle: '"simulator-teams"', what: "POST a team" },
      { file: "app/api/projects/[id]/simulation-teams/[teamId]/route.ts", needle: '"simulator-teams"', what: "PUT / DELETE a team" },
      { file: "app/api/projects/[id]/simulation-teams/fill-skills/route.ts", needle: '"simulator-teams"', what: "POST fill skills" },
      { file: "app/api/projects/[id]/simulation-teams/match-lanes/route.ts", needle: '"simulator-teams"', what: "POST match lanes" },
      { file: "app/api/orgs/[id]/simulation-teams/route.ts", needle: '"simulator-teams"', what: "Organisation master teams" },
    ],
  },
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
  "process-mining-conformance": {
    description: "Conformance checking against a reference model.",
    status: "wired", ui: [],
    server: [{ file: "app/api/projects/[id]/mining/runs/[runId]/conformance/route.ts", needle: '"process-mining-conformance"', what: "Conformance" }],
  },
  "process-mining-sources": {
    description: "Live sources and connectors (webhook, Azure Blob, SharePoint) with refresh.",
    status: "wired", ui: [],
    server: [
      { file: "app/api/projects/[id]/mining/sources/route.ts", needle: '"process-mining-sources"', what: "Sources" },
      { file: "app/api/projects/[id]/mining/sources/[sourceId]/refresh/route.ts", needle: '"process-mining-sources"', what: "Refresh a source" },
    ],
  },
  "process-mining-alerts": {
    description: "Series over time and alerting.",
    status: "wired", ui: [],
    server: [{ file: "app/api/projects/[id]/mining/runs/[runId]/series/route.ts", needle: '"process-mining-alerts"', what: "Series" }],
  },
  "process-mining-twin": {
    description: "Validate the simulation against the mined process, and calibrate it.",
    status: "wired", ui: [],
    server: [
      { file: "app/api/projects/[id]/mining/runs/[runId]/validate/route.ts", needle: '"process-mining-twin"', what: "Validate" },
      { file: "app/api/projects/[id]/mining/runs/[runId]/calibrate/route.ts", needle: '"process-mining-twin"', what: "Calibrate (also needs the Simulator)" },
    ],
  },
  "process-mining-ai": {
    description: "AI explanation of mining results and next steps.",
    status: "wired", ui: [],
    server: [
      { file: "app/api/projects/[id]/mining/runs/[runId]/explain/route.ts", needle: '"process-mining-ai"', what: "Explain" },
      { file: "app/api/projects/[id]/mining/runs/[runId]/next-steps/route.ts", needle: '"process-mining-ai"', what: "Next steps" },
    ],
    alsoLimitedBy: AI_ALSO,
  },
  "process-mining-export": {
    description: "Export mining results and the analysis workbook.",
    status: "wired", ui: [],
    server: [
      { file: "app/api/projects/[id]/mining/runs/[runId]/export/route.ts", needle: '"process-mining-export"', what: "Export" },
      { file: "app/api/projects/[id]/mining/runs/[runId]/analysis-export/route.ts", needle: '"process-mining-export"', what: "Analysis export" },
    ],
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
  "risk-control-examples": {
    description: "The ready-made Risk & Control examples.", status: "wired", ui: [],
    server: [{ file: "app/api/risk-control-examples/route.ts", needle: '"risk-control-examples"', what: "GET the examples" }],
    note: "Adopting an example is gated by riskControl.",
  },

  // ── Import & Export ────────────────────────────────────────────────────────
  "visio-import-individual": {
    description: "Import one Visio file.", status: "wired", ui: [],
    server: [{ file: "app/api/import/visio-v3/route.ts", needle: '"visio-import-individual"', what: "POST import a Visio file" }],
    alsoLimitedBy: ["Individual imports limit (per level)"],
  },
  "visio-export-individual": {
    description: "Export one diagram to Visio.", status: "wired", ui: [],
    server: [
      { file: "app/api/export/visio-v3/route.ts", needle: '"visio-export-individual"', what: "GET export to Visio" },
      { file: "app/api/export/visio-v2/route.ts", needle: '"visio-export-individual"', what: "GET export (v2)" },
    ],
    alsoLimitedBy: ["Individual exports limit (per level)"],
  },
  "visio-import-bulk": {
    description: "Import many Visio files at once.", status: "wired", ui: [],
    server: [{ file: "app/api/import/visio-v3/bulk/route.ts", needle: '"visio-import-bulk"', what: "POST bulk import" }],
    alsoLimitedBy: ["Bulk imports limit (per level)"],
  },
  "visio-export-bulk": {
    description: "Export a whole project to Visio.", status: "wired", ui: [],
    server: [{ file: "app/api/export/visio-v3/bulk/route.ts", needle: '"visio-export-bulk"', what: "GET bulk export" }],
    alsoLimitedBy: ["Bulk exports limit (per level)"],
  },

  // ── Integration / Documents ────────────────────────────────────────────────
  "sharepoint": {
    description: "Export to and import from SharePoint.", status: "wired", ui: [],
    server: [
      { file: "app/api/sharepoint/route.ts", needle: '"sharepoint"', what: "GET browse" },
      { file: "app/api/sharepoint/upload/route.ts", needle: '"sharepoint"', what: "POST upload" },
      { file: "app/api/sharepoint/download/route.ts", needle: '"sharepoint"', what: "GET download" },
    ],
    alsoLimitedBy: ["Organisation policy: allowSharePoint", "Needs the person's Microsoft connection"],
  },
  "sop-generation": {
    description: "Generate a Standard Operating Procedure from a diagram.", status: "wired", ui: [],
    server: [
      { file: "app/api/projects/[id]/sop/route.ts", needle: '"sop-generation"', what: "POST generate a SOP" },
      { file: "app/api/sop/[id]/regenerate/route.ts", needle: '"sop-generation"', what: "POST regenerate" },
    ],
    alsoLimitedBy: AI_ALSO,
  },

  // ── Platform ───────────────────────────────────────────────────────────────
  "process-portal": {
    description: "The published process portal.", status: "wired", ui: [],
    server: [{ file: "app/api/diagrams/[id]/publish/route.ts", needle: '"process-portal"', what: "POST publish a diagram" }],
    note: "Publishing; what is already published stays readable.",
  },
  "process-repository-restricted": {
    description: "Create a project from the Process Repository — Order to Cash (V01) only. Free: the V01 Value Chain diagram and processes V01.01 and V01.02. Introductory: all of V01.",
    status: "wired", ui: [],
    server: [
      { file: "app/lib/valueChain/repositoryAccess.ts", needle: 'featureStates["process-repository-restricted"]', what: "Which mode the user is in (read by the chain list and the create-project run)" },
      { file: "app/api/repository/chains/route.ts", needle: "repositoryAccessFor(", what: "GET the chains the user may see, each diagram marked allowed or disabled" },
      { file: "app/lib/valueChain/runLibraryProject.ts", needle: "repositoryAccessFor(", what: "POST create the project — only the allowed diagrams are generated" },
    ],
    alsoLimitedBy: ["AI attempts limit (one attempt per diagram generated)", "Projects limit", "Organisation policy: allowAi"],
    note: "Complete wins when both are on. The per-level content limits (Free: V01.01 and V01.02) are in repositoryAccess.ts, like the examples-only limits.",
  },
  "process-repository-complete": {
    description: "Create a project from the Process Repository — every value chain. Professional, Expert and Enterprise.",
    status: "wired", ui: [],
    server: [
      { file: "app/lib/valueChain/repositoryAccess.ts", needle: 'featureStates["process-repository-complete"]', what: "Which mode the user is in (read by the chain list and the create-project run)" },
      { file: "app/api/repository/chains/route.ts", needle: "repositoryAccessFor(", what: "GET the chains the user may see" },
      { file: "app/lib/valueChain/runLibraryProject.ts", needle: "repositoryAccessFor(", what: "POST create the project" },
    ],
    alsoLimitedBy: ["AI attempts limit (one attempt per diagram generated)", "Projects limit", "Organisation policy: allowAi"],
  },
  "create-value-chain": {
    description: "Create a New Value Chain — describe a value chain and its 5–12 processes and the Master Prompt templates write its diagram prompts; the chain joins the Org's repository as C01, C02… Expert and above.",
    status: "wired", ui: [],
    server: [
      { file: "app/lib/valueChain/newChainAccess.ts", needle: "gateFeature(session.user.id, CREATE_VALUE_CHAIN_FEATURE)", what: "Every new-chain route (suggest, build the narrative, questions, create, resume)" },
      { file: "app/api/repository/new-chain/create/route.ts", needle: "requireNewChainAccess(", what: "POST create the chain and write its prompts" },
    ],
    alsoLimitedBy: ["AI attempts limit (one attempt per prompt written)", "Chains per Org limit (default 10)", "Organisation policy: allowAi"],
    note: "A code floor of Expert backs the grid until its cells are seeded (a feature with no cells fails open). Removed once the seed has run.",
  },
  "mobile": {
    description: "Mobile Access: the phone app (view, review, edit by voice). Needs Process Review and Voice Assist.",
    status: "wired",
    ui: [{ file: "app/m/MobileUnavailable.tsx", needle: "Mobile access isn’t in your plan", what: "Phone: the upgrade page shown instead of the app" }],
    server: [{ file: "app/m/layout.tsx", needle: "mobileAccess(await getFeatureStates(session.user.id))", what: "Every /m page (layout)" }],
    note: "The phone reads the shared diagram and comment APIs, which are not gated by this key because the desktop uses them too.",
  },

  // ── AI Models ──────────────────────────────────────────────────────────────
  "choice-of-llms": {
    description: "Choose which AI model generates.", status: "partial", ui: [],
    server: [
      { file: "app/api/ai/bpmn/plan/route.ts", needle: '"choice-of-llms"', what: "BPMN plan" },
      { file: "app/api/ai/generate-bpmn/route.ts", needle: '"choice-of-llms"', what: "BPMN generate" },
      { file: "app/api/ai/generate-diagram/route.ts", needle: '"choice-of-llms"', what: "Diagram generate" },
      { file: "app/api/ai/epc/plan/route.ts", needle: '"choice-of-llms"', what: "EPC plan" },
      { file: "app/api/ai/flowchart/plan/route.ts", needle: '"choice-of-llms"', what: "Flowchart plan" },
    ],
    note: "Enforced when a request names a model other than the default; the model picker is also limited by cost.",
  },
  "local-llm": { description: "Use a local model (on-premise).", status: "informational", ui: [], server: [], note: "A deployment edition (the on-premise product), not something a subscription level switches." },

  // ── Enterprise ─────────────────────────────────────────────────────────────
  "soc2": { description: "SOC 2 Type II audit report available.", status: "informational", ui: [], server: [], note: "A statement about the product, not a switch." },
};
