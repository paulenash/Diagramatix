# Diagramatix — Quick Reminder Sheet 2

## BPMN Diagram Summary

BPMN describes a business process as **flow objects** connected by **flows**, arranged in **swimlanes** that show responsibility, with **artifacts** adding data and commentary. The elements below are the ones on the Diagramatix BPMN palette.

### Flow objects

**Start Event** — A thin-ringed circle marking where the process begins. A trigger type (message, timer, signal, conditional…) says *what* kicks it off. Use one per entry point into the process.

**Intermediate Event** — A double-ringed circle for something that happens *during* the flow — catching a wait (timer, message) or throwing a signal. Use it to model delays, milestones, and mid-process messaging.

**End Event** — A thick-ringed circle marking a conclusion of the flow; a terminate end stops the whole process. Use one per distinct outcome.

**Task** — A rounded rectangle for a single unit of work performed by a person or system. Markers show loops or multi-instance (sequential/parallel) repetition. The workhorse of every BPMN model.

**Subprocess** — A task that hides a lower-level flow: collapsed (with a ⊞ marker) for a linked detail diagram, or expanded to show the inner steps in place. Use it to keep a diagram readable and to reuse process fragments.

**Gateway** — A diamond that controls branching and merging. **Exclusive** takes one path, **Parallel** takes all paths at once, **Inclusive** takes any that apply, and **Event-based** waits for whichever event fires first. Use it wherever the flow forks or rejoins.

### Connecting objects

**Sequence Flow** — A solid arrow showing the order of steps *within* a pool. **Message Flow** — A dashed arrow with an open circle/arrowhead for messages passing *between* pools. **Association** — A dotted line linking an artifact (data or annotation) to the element it concerns.

### Swimlanes

**Pool** — A container representing a participant or organisation in the process. **Lane** — A subdivision within a pool for a role, department, or system. **Sublane** — A finer split within a lane. Use lanes to answer "who does this step?".

### Artifacts

**Data Object** — A dog-eared page showing information a task produces or consumes. **Data Store** — A cylinder for data that persists beyond the process. **Group** — A dashed rounded box that visually clusters related elements without affecting flow. **Text Annotation** — A free-text comment bracketed onto an element for explanation.

---
*Tip: Diagramatix can generate a first-draft BPMN model from a prompt (Plan → Refine), then apply automatic layout and geometry rules.*
