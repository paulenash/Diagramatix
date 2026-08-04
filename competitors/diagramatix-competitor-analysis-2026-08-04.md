# Diagramatix Competitor Analysis — AI Assist & Voice Editing
## Diagramatix vs SAP Signavio (Joule), ARIS (AI Companion), PRIME BPM (PrimeGPT)

**Prepared:** 4 August 2026
**Focus:** How the new **AI Assist + Abracadabra Mode** suite changes Diagramatix's position on the one AI row where it previously trailed.
**Basis:** Public product documentation for the comparators (not a hands-on test), plus the shipped Diagramatix capability. *Strong* = clear public evidence; *Partial* = an adjacent capability; *Gap* = no public evidence.

---

## The headline

Until now, Diagramatix's AI was **batch generation** — describe a process, get a whole diagram. The competitive matrix showed **one clear AI gap**: *assist-while-you-draw* (suggest the next step) and an *NL command/search bar*, where Signavio **Joule**, ARIS **AI Companion** and PRIME **PrimeGPT** all had a story and Diagramatix had none.

That row is now closed — and overshot. Diagramatix ships:

1. **Assist-while-you-draw** — inline "ghost" next-step suggestions (Tab to accept), grounded in its own rules engine.
2. **A natural-language command bar** — type an editing instruction and it's applied.
3. **Abracadabra Mode** — the differentiator: **live, hands-free voice editing**. Speak "add a task called Approve after Review", "put a pool around everything", "add 3 sublanes called…", "delete Prepare and compact" — and the diagram edits itself, live, with every change undoable.

The competitors' assist is largely **repository/mining chat** (ask questions of a process estate). None publicly offers **canvas-native, voice-driven, live structural editing** grounded in an editable rules engine.

---

## The AI-assist row, re-scored

| Capability | Diagramatix | SAP Signavio (Joule) | ARIS (AI Companion) | PRIME (PrimeGPT) |
|---|---|---|---|---|
| Batch NL → diagram generation | **Strong** | Partial | Partial | **Strong** |
| Assist-while-you-draw (suggest next step on canvas) | **Strong** (rules-grounded ghosts) | Gap | Gap | Gap |
| NL command bar (edit by instruction) | **Strong** | Partial (NL over repo/mining) | Partial (repo chat) | Partial |
| **Voice-driven live editing** | **Strong (unique)** | Gap | Gap | Gap |
| Grounding for suggestions | **Own rules engine + governed naming + APQC + editable NL rules** | Enterprise repo + mining | Enterprise repo + mining | AI mapping |
| Metering transparency of AI/voice usage | **Strong** (per-point + voice minutes) | n/a public | n/a public | n/a public |

---

## Why the grounding is the moat

Competitors ground their assist in an **enterprise repository or mining estate** — powerful, but it requires that estate to exist and is largely *conversational*. Diagramatix grounds its assist **canvas-side**, in artefacts it already owns and that customers can tune:

- **A codified rules engine** — the same B01–B41 scanner + green/red rule split that validates AI generation now also gates *every* suggestion, so a ghost or a voice command can never place something illegal or badly laid out. This geometric correctness (inline spacing, gateway fan-out, boundary placement, no-overlap, boundary-follow) is **enforced in code**, not hoped for in a prompt.
- **Governed naming + APQC PCF** — suggested names align to the org's Entity Lists and the APQC taxonomy.
- **An editable "Assist / NL Rules" catalog** — admins map name-keywords to actions (suggest a template; add an *Instructions* input; add an *Output Doc*). The soft, content-driven rules are **data the customer owns**, and they also ground the AI fallback. No competitor packages a customer-editable canvas-assist ruleset.

The design philosophy is *rules propose, rules dispose*: instant free deterministic rules do the common 80%, and the LLM is a **metered fallback** for free phrasing only — cheap enough to leave on all day.

---

## Honest caveats

- This is a **public-document comparison**; the comparators may have unshipped or private assist features.
- Diagramatix's voice interpreter uses **blocking** LLM calls for the fallback (no token streaming yet); the instant rules path covers most commands, so latency is felt only on unusual phrasings.
- The voice layer depends on a speech service the workspace enables; it falls back to browser speech, and typing always works.

---

## Bottom line

The assist row flips from a **weakness to a differentiator**. Diagramatix is now the only tool in this set offering **canvas-native, rules-grounded, voice-driven live diagram editing** — modelling by conversation, with the correctness guarantees of a governed rules engine behind every change.
