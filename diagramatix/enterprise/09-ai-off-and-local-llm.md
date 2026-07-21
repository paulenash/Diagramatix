# 09 — AI Off, Contained, or On-Prem (Local LLM)

*What happens when an enterprise disables AI Generation, the workarounds, and how to run Diagramatix's AI against a local / self-hosted model. Three postures, all achievable today.*

## Three AI postures

| Posture | For | How | State |
|---|---|---|---|
| **1. AI off** | Tenants that forbid third-party AI | `Org.allowAi = false` (Org Settings → Data & AI Governance, or Enterprise Mode) | ✅ shipped (A1c) |
| **2. AI on, contained** | Tenants OK with AI under their control | `ANTHROPIC_BASE_URL` (their proxy/region), BYO key, Anthropic ZDR/no-train, or pre-egress redaction | ✅ proxy/key shipped · redaction deferred (ENT-06) |
| **3. AI on-prem (local LLM)** | Air-gapped / no-external-AI shops | `ANTHROPIC_BASE_URL` → local gateway + `AI_CUSTOM_MODELS` | ✅ plumbing shipped |

## Posture 1 — AI off: impacts

Turning AI off removes the **generative accelerators and AI narratives**, not the platform. `allowAi=false` gates these 15 endpoints (enforced server-side, 403 for everyone in the org):

- **AI Generate** for every diagram type — BPMN, flowchart, ArchiMate, domain, state-machine, value-chain, process-context (text / PDF / image → diagram): `generate-bpmn`, `generate-diagram`, `bpmn/plan`, `flowchart/plan`.
- **Refine** (`bpmn/refine-questions`), **Flowchart→BPMN tidy** (`flowchart-to-bpmn/refine`).
- **Staff narrative** (`staff-narrative`), **model comparison** (`generate-bpmn/compare`).
- **Mining AI-curate** (`discover`, `discover-sm` AI branch) + **Explain results** (`explain`).
- **Simulation assessment** (`.../assess`).
- **Create APQC Process** (routes through `generate-bpmn`).
- **Audio → clean process description** (`audio/refine-transcript`).

Voice is a **separate** flag (`allowVoiceAi`) gating `audio/transcribe` + `dictation/token` (Deepgram) — so you can keep AI text but block voice, or vice-versa. With voice off, dictation falls back to the browser's built-in speech engine.

### Deterministic equivalents (graceful degradation, not a dead end)
Three of the AI *narration* features are layered on top of numbers the platform **already computes deterministically** — so with AI off they fall back to a **templated summary of the same figures** instead of a 403. The output is plainer prose, but the facts are identical (and provably un-invented). Shipped:

- **Mining "Results summary"** (`.../explain`) — `summariseMiningResults()` templates the discovered paths, conformance fitness + top deviations, and slowest step / busiest resource. The mining console card stays visible and relabels *Explain results → Results summary*.
- **Simulation "Comparison summary"** (`.../assess`) — `summariseComparison()` templates the flow-time/throughput/cost/bottleneck deltas + a verdict. The compare panel button relabels *Explain these results → Comparison summary*.
- **"Process description"** (Diagram ▾ menu, always available) — `buildPromptFromDiagram()` renders a structured plain-language walk of the current diagram. This is the deterministic counterpart of the AI *staff narrative*, surfaced through a standalone menu entry so it's reachable even when the AI panel is hidden.

The route picks the branch server-side (`orgPolicyAllows("allowAi") && ANTHROPIC_API_KEY`); when AI is on it narrates, when off it returns the deterministic summary with `deterministic: true`. **True AI-only** features (diagram generation, Refine, AI-curate, model compare) have no deterministic equivalent and remain fully gated/hidden.

### What still works with AI off
Nearly everything — Diagramatix is not an AI-first tool:
- All **manual diagramming** + editing, pools/lanes/sublanes, smart connector routing, the **deterministic auto-layout** engines, templates, typography.
- **DiagramatixMINER** — the core is **100% deterministic**: ingest event logs, **discover** processes/state-machines, run conformance, and — from an OCEL object-centric log — build the **UML class diagram** (object model: types → classes, relationships → associations, shared-event interactions → weighted/dashed links; `buildDomainFromOcel`, no AI). Only AI-*curate* is gated; **Explain** falls back to a deterministic Results summary.
- **Simulator** — full engine + runs + comparisons; the AI verdict falls back to a deterministic Comparison summary.
- **Risk & Controls**, **APQC** browse/classify/folder-seed, **Publishing / Process Portal**, **Import/Export** (Visio, XES/OCEL, competitor-BPMN import), **Entity Structures**, sharing, backups.

**Pitch:** *"With AI off you still have a complete manual + deterministic process-modelling, mining and GRC platform."*

### UI hiding (done)
When AI is off, the true AI-only entry points hide live — the Diagram toolbar **AI Generate** button, the mining **AI-curate** (process + state-machine), and the APQC **Create Process** button. Driven by the shared `useAiAllowed()` hook (`app/lib/auth/useAiAllowed.ts` = org policy + the SuperAdmin view-mode bypass), so a full-view SuperAdmin still sees them. The server routes enforce it regardless — this is UX polish so strict tenants never see a dead button. The three features with deterministic equivalents (Explain results, Simulation assessment, staff narrative) **don't** hide — they relabel and return the templated summary (see above).

## Posture 2 — AI on, contained (the usual enterprise answer)

Most enterprises want control over *where the data goes*, not "no AI ever":
- **Own gateway** — set `ANTHROPIC_BASE_URL` to the customer's proxy / private endpoint (their region, their logging/DLP). No traffic to the public Anthropic endpoint. (Shipped — one env, all client sites honour it.)
- **Bring-your-own key** — the customer's Anthropic account/billing/agreement.
- **Anthropic ZDR + no-training** contractual terms (arrange at account level; document in the DPA).
- **Pre-egress redaction** (`aiRedaction`, ENT-06 — deferred) — pseudonymise names/systems before the prompt leaves; restore in the output.

## Posture 3 — On-prem / local LLM

**Feasible today** — the `ANTHROPIC_BASE_URL` seam + `AI_CUSTOM_MODELS` are the whole plumbing.

### How it works
Every AI call goes through `makeAnthropic()` (`app/lib/ai/anthropicClient.ts`) using the Anthropic **Messages API**. Point `ANTHROPIC_BASE_URL` at a local **Anthropic-compatible gateway** and register the local model id(s) so the picker will use them.

### Setup
1. **Serve a model locally** behind an Anthropic-compatible API — e.g. **LiteLLM** (translates the Anthropic API to many backends) in front of **vLLM** or **Ollama** serving Llama / Qwen / Mistral.
2. **Env:**
   ```
   ANTHROPIC_BASE_URL="http://litellm.internal:4000"
   AI_CUSTOM_MODELS="llama-3.3-70b|Llama 3.3 70B (local),qwen2.5-vl-72b|Qwen2.5-VL 72B (local)"
   ANTHROPIC_API_KEY="<key the gateway expects>"   # your gateway's auth, not Anthropic's
   ```
3. **Pick it:** SuperAdmin → **AI Generate Model** — the local models appear in the dropdown; select one as the default. (They now pass `isKnownAiModel`; without this they'd silently fall back to Haiku.)

### Caveats
- **Vision** — image/PDF-to-diagram needs a **multimodal** local model (Llama 3.2 Vision, Qwen2-VL). Text-only models still handle prompt-based generation.
- **Quality** — BPMN/flowchart use a 2-phase **Plan → deterministic layout**, so the model mostly emits **structured JSON** (capable local ~8–70B models do this acceptably), but expect more JSON-parse retries and less polish than Claude; tune prompts per model.
- **Infra** — the customer provides GPU(s); a good multimodal model is non-trivial hardware.
- **Compare tool** stays on the Claude `AI_MODELS` set — not meaningful on a local-only deployment (SuperAdmin-only, ignore).

### Where it fits
Best as the **"on-prem AI" option of the dedicated single-tenant instance tier** (Workstream B). For everyone else, Posture 2 (contained) is easier and higher quality.

## Summary
Diagramatix can meet an enterprise anywhere on the spectrum: **off** (deterministic platform, no AI egress), **contained** (proxy / BYO-key / ZDR / redaction), or **on-prem** (local model, no external AI). Postures 1 and the proxy/local-model parts of 2 & 3 are shipped; redaction (ENT-06) and the dedicated-instance packaging remain.
