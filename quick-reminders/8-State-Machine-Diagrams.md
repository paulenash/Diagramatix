# Diagramatix — Quick Reminder Sheet 8

## State Machine Diagrams

A State Machine diagram models the *lifecycle* of a single thing — an order, a case, a device, an application — as the set of states it can occupy and the transitions that move it between them. Where BPMN answers "what steps happen", a state machine answers "what state is it in, and what changes it". Use it for status models, approval lifecycles, and any behaviour best described as modes and the events that switch them.

### Elements

**State** — A rounded rectangle naming a condition the thing can be in (e.g. "Awaiting Approval", "Dispatched"). The main building block; the thing is always in exactly one state at a time.

**Initial** — A small filled dot marking where the lifecycle begins. Exactly one per machine; its single transition points to the first real state.

**Final** — A bullseye (ringed dot) marking the end of the lifecycle. A machine may have several finals for different terminal outcomes.

**Composite State** — A larger state that contains its own nested sub-states, letting you hide detail and model behaviour-within-a-behaviour. Use it when a state has meaningful internal phases.

**SubMachine** — A state that delegates to a separate, linked state-machine diagram — the reuse mechanism for a lifecycle used in more than one place.

**Gateway (choice)** — A diamond that splits a transition by guard condition, routing to different states depending on which condition holds.

**Fork / Join** — A bar that splits flow into concurrent regions (fork) or waits for concurrent regions to complete before continuing (join).

### Transitions

A **transition** is an arrow from one state to the next, labelled `event [guard] / action` — the event that triggers it, an optional guard condition that must hold, and an optional action performed on the way. Self-transitions loop back to the same state.

### How to use it

- Start at the Initial dot, top-left, and let the flow read left-to-right / top-to-bottom toward the Final(s).
- Name states as conditions (adjectives/past-participles), not actions — actions belong on the transitions.

---
*Tip: State machines feed Process Mining — a discovered state machine can be conformance-checked against a reference model you draw here.*
