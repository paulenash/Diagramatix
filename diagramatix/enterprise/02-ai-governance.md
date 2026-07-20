# 02 — AI Governance

*Whether AI can be used, exactly what it sees, how it's currently controlled, and the controls an enterprise will require before allowing it. Enterprises increasingly forbid sending process/PII data to third-party models, or allow it only through their own gateway with zero-retention and no-training guarantees. This document is written to answer their AI questionnaire directly.*

## The short answers

- **Which models?** One LLM provider — **Anthropic (Claude)** via `@anthropic-ai/sdk` 0.88.0. Plus one voice vendor — **Deepgram** (speech-to-text). No OpenAI/Google/Mistral/Cohere/Ollama/Azure-OpenAI anywhere.
- **Is customer content sent?** **Yes** — most features send process content verbatim (see table). Two features send the richest identifiable data.
- **Can an enterprise turn AI off?** **Not per-tenant today.** Only globally (unset `ANTHROPIC_API_KEY`) or economically (set a tier's AI quota to zero). This is the #1 AI gap — remediation in [05](05-gating-and-remediation-plan.md).
- **Can AI be routed through our own proxy / kept in-region / zero-retention?** **Not via code today** — no base-URL/gateway seam, no region option. Anthropic's account-level Zero-Data-Retention / no-training terms would need to be arranged contractually and are not enforced in code.
- **Is AI content logged/retained?** Generated diagrams persist (by design). The SuperAdmin model-comparison feature **persists the prompt + generated content** to the DB. Parse-failures log up to 1 KB of raw model output to server logs.

## What each AI feature sends to Anthropic

Every call is a blocking `client.messages.create` (no streaming). Model defaults to `getAiGenerateModel()` (Haiku 4.5) unless noted.

| Feature | Route | Model | Customer data in the payload |
|---|---|---|---|
| BPMN generate / plan | `/api/ai/generate-bpmn`, `/api/ai/bpmn/plan` | Haiku (configurable) | Prompt text + **uploaded PDF/text/image, base64 verbatim** + green rules (`planBpmn.ts:340-389`) |
| Flowchart plan | `/api/ai/flowchart/plan` | Haiku | Same shape (`planFlowchart.ts:68-110`) |
| Generic (ArchiMate, state-machine, value-chain, domain, context) | `/api/ai/generate-diagram` | Haiku | Prompt + PDF/text/image; image path instructs the model to OCR every shape/label (`generate-diagram/route.ts:49-71`) |
| Refine questions | `/api/ai/bpmn/refine-questions` | Haiku | The **full BPMN prompt text** (`refineQuestions.ts:125-130`) |
| Flowchart→BPMN tidy | `/api/ai/flowchart-to-bpmn/refine` | Haiku | **The entire element+connection graph, every label** (`refineFlowchartBpmn.ts:35`) |
| **Staff narrative** | `/api/ai/staff-narrative` | `claude-sonnet-4-6` | **Full technical walk: roles, teams, external participants, named IT systems/products** (`staffNarrative.ts:99-104`) |
| Simulation assessment | `.../simulation/studies/[id]/assess` | `claude-opus-4-8` | Metrics JSON + run/version names + **bottleneck team name** (`assessFacts.ts:106`) |
| Mining AI discover / SM | `.../mining/runs/[runId]/discover(-sm)` | Haiku | **Real activity/state names, path frequencies, transition counts** (`aiProcess.ts:22-50`, `aiStateMachine.ts:23-79`) |
| Mining explain | `.../mining/runs/[runId]/explain` | Haiku | Activity-sequence variants, conformance **deviation messages**, **resource names** (`explainResults.ts:30-73`) |
| Model comparison (SuperAdmin) | `/api/ai/generate-bpmn/compare` | *all* models | Same prompt/attachment run through every model; **persists prompt + outputs** |
| Transcript clean-up | `/api/ai/audio/refine-transcript` | `claude-sonnet-4-6` | **Full raw transcript**; system prompt anonymises *people's* names in the output but **keeps org/team/system/product names**, and the raw transcript still egresses |

Two features stand out for an enterprise reviewer:

- **Staff narrative** and **transcript clean-up** send the most identifiable content — named people (transcript), teams, external parties, and specific products/systems. Anonymisation, where it exists, happens **inside the model output**, i.e. *after* the raw content has already left the tenant, not before egress.
- **Mining AI** sends real operational data — activity names and path statistics derived from production event logs.

## Current controls (and their limits)

1. **Model choice** — `AppSetting["ai.generate.model"]`, edited at `/dashboard/admin/ai-model`. Chooses *which* Claude model; **cannot turn AI off**. (Note: `staff-narrative`, `refine-transcript`, and `assess` hard-code their model and ignore this setting.)
2. **Entitlements** — `FeatureKey` covers `simulator | processMining | riskControl | apqc`. **"AI" is not an entitlement.** There is no `hasAi` column, no per-org and no per-project AI switch.
3. **Usage quota** — AI is metered by `aiAttempts` (`tier.maxAiAttempts`, lifetime or monthly). Setting it to 0 disables metered AI for that tier — a blunt, economic lever, and **SuperAdmins bypass all limits**.
4. **API-key presence** — every AI route 503s if `ANTHROPIC_API_KEY` is unset. This is the only true global kill switch.
5. **"Green rules only" filter** (`splitRulesByEnforcement`) — withholds *layout/positioning rules* and `[PROPOSED]`/`[MODIFIED]` rules from the model. This filters **rule text**, not customer content, so it does not reduce data egress.

## Where AI content can linger

- **`Diagram.aiComparison`** (JSON column) — the SuperAdmin compare route writes the **effective prompt**, attachment metadata, per-model stats and the chosen model; each model's output is also saved as a new `Diagram` row (`compare/route.ts:117-164`).
- **Generated diagrams** persist as normal diagram data + history (intended).
- **Server logs** — on a malformed model response, `planBpmn.ts:412-413` / `planFlowchart.ts:131` `console.error` the **first 1 KB of raw output**, which can contain generated process content.

## What an enterprise will ask for — and where it maps

| Enterprise requirement | Today | Fix (see [05](05-gating-and-remediation-plan.md)) |
|---|---|---|
| Disable AI for our tenant entirely | ✗ global-only | Org policy flag `allowAi` |
| Disable voice/Deepgram | ✗ global-only | Org policy flag `allowVoiceAi` |
| Route AI via our proxy / private endpoint / Bedrock | ✗ no seam | `ANTHROPIC_BASE_URL` support (one line on the client) |
| Zero-retention / no-training guarantee | Contractual, not enforced in code | Anthropic ZDR account terms + DPA; document it |
| Don't send named people/systems | ✗ verbatim | Pre-egress redaction option, esp. narrative/transcript |
| Prove what AI was sent/received | Partial (compare only) | AI egress entry in the audit log |
| Keep model choice locked | ✓ (admin) but 3 features hard-code | Route all AI through the admin-selected model |

**Bottom line for the AI questionnaire:** Diagramatix uses Claude + Deepgram, sends process content, and today offers only a global on/off. The remediation plan makes AI a first-class, per-tenant-governable capability — off by default in Enterprise Mode, proxy-able, and logged.
