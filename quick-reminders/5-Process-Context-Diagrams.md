# Diagramatix — Quick Reminder Sheet 5

## Process Context Diagrams

A Process Context diagram frames a single process and everything around it *before* you model the detailed flow. It answers the scoping questions — who takes part, which systems are involved, and where the boundary of the process sits — so that everyone agrees what is in and out of scope. Use it at the start of a piece of work, as the cover page for a BPMN model, or to show a process's touchpoints without committing to a step-by-step sequence.

### Elements

**Process** — An oval representing the process being scoped — the thing sitting at the centre of the context. Name it for the end-to-end outcome it delivers.

**Participant** — A single-person figure for a human role or actor who takes part in the process (e.g. Customer, Approver, Clerk). Use one per distinct role.

**Team** — A three-person figure for a group that acts together — a department, committee, or working group — where naming individuals would add no value.

**System** — An application, service, or platform the process relies on or exchanges data with. Use it to surface the IT footprint of the process.

**Auto Scheduler** — An hourglass marker for an automated or time-triggered step that runs without a person — a scheduler, batch job, or timer that advances the process on its own.

**Process Group Header (boundary)** — A container that draws the scope line around the process, separating what belongs to it from the external participants and systems it touches. Anything inside the boundary is in scope; anything outside is context.

### How to use it

- Put the **process boundary** down first, then place participants and systems outside it, connecting each to the process to show the interaction.
- Keep it conceptual — no gateways or sequence flow. If you find yourself modelling order-of-steps, move to BPMN.
- Use it as the agreed scope statement that a detailed BPMN or flowchart then elaborates.

---
*Tip: A Process Context diagram pairs naturally with a Value Chain above it and a BPMN model below it — context, chain, and detail across three linked pages.*
