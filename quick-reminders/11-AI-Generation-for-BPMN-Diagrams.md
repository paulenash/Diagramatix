# Diagramatix — Quick Reminder Sheet 11

## AI Generation for BPMN Diagrams

Diagramatix can draft a BPMN model from a plain-language description of a process, then hand you an editable diagram. There are two ways in: a one-shot **AI Generate** panel for speed, and a two-phase **AI Plan** panel for control. Both support saved prompts, dictation, audio-to-process, and attaching files or images for context.

### One-shot: AI Generate

Type a description of the process and press **Generate**. Diagramatix plans the elements and connections and runs the layout engine server-side, returning a finished, positioned BPMN diagram in a single step. Choose whether to **Replace** the canvas or **Add to** the existing diagram.

### Two-phase: AI Plan (Refine → Plan → Apply Layout)

For more control, work in three stages:

**Refine** — The model reads your prompt and asks a short set of high-impact, multiple-choice **clarifying questions**. Your answers are folded back into the prompt. Refine deliberately **stops there** — it never auto-generates — so you sharpen the brief first.

**Plan** — Generates an editable **plan** (elements and connections as structured data) — but no layout yet. Review and edit it across tabs: **Pools/Lanes, Elements, Connectors,** and **Raw JSON**.

**Apply Layout** — Validates the (possibly edited) plan and runs the deterministic layout engine to position everything. This step is pure geometry — **no AI call** — so results are repeatable.

### Rules that steer generation

Editable **Diagram Rules** shape the output. **Green** rules are AI-enforced and sent to the model as guidance; **red** rules are geometric and enforced by the layout engine in code (never sent to the model). Rules can also be grounded in the APQC PCF.

### Models

The default generation model is **Haiku 4.5** (a SuperAdmin setting can change it). SuperAdmins also get **Compare all models** — it generates with Fable 5, Opus 4.8, Sonnet 5, and Haiku 4.5, then fills the diagram from whichever result has the fewest connector-conformance issues.

---
*Tip: Use Refine first on vague briefs — a few answered questions produce a far better first draft than a long prompt.*
