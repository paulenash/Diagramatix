# Possible Test Ideas

A living backlog of test ideas we want but haven't built yet. Add to it as ideas
come up; promote an item into real tests when we pick it up, and delete it from
here once it's covered.

> Current automated coverage lives in [TESTS.md](./TESTS.md) (regenerate with `npm run test:list`).

---

## Red-rule conflict detection (BPMN layout)

Every layout-rule check we have so far proves a rule **in isolation**
(`tests/bpmn/layout-rules.test.ts`). Conflicts only show up when rules
**interact** — so they need a different kind of test. Three approaches,
weakest-to-strongest at finding the unknown:

### 1. Global "clean layout" invariants — the emergent-conflict catcher (highest value)

A single reusable `assertCleanLayout(out)` helper asserting post-conditions that
must hold **no matter which rules fired**:

- **No two connectors share an attachment point** on any element (generalises
  R5.06 / R8.11 / R8.12 across the *whole* diagram).
- **No gateway label box overlaps** an element or connector (R5.09, globally).
- Every connector has waypoints; no endpoint lands inside another element's body;
  no two siblings overlap within a lane.

Run it on **every** registry case plus a few deliberately dense "interaction"
diagrams. If e.g. R8.04 routes a loop-back onto the same bottom-centre point
R6.19 gave a merge's outgoing flow, the shared-point invariant fails — the
conflict surfaces as an emergent failure even though neither rule knows about the
other. Most likely to actually catch something in a busy diagram.

### 2. Explicit precedence pins — for the known conflicts

Several red rules conflict by design and the code silently picks a winner (the
comments say so). Pin each: build the scenario where both apply and assert the
winner.

- *"R7.02 … Override whatever the generic rules chose"* → **R7.02 beats R3.06**
  for boundary-event exit side.
- *"R6.18 … Overrides the generic R3.06 sideFacing"* → **R6.18 beats R3.06** for
  event-based gateway branches.
- A **loop-back edge into a decision gateway**: R6.16 (incoming → left) vs R8.04
  (route via top/bottom) — currently undocumented; *which wins?* Writing this one
  will tell us whether the case is even handled.

### 3. Property-based fuzzing — the unknown-conflict finder

Generate many random small valid BPMN graphs (seeded RNG → deterministic), lay
each out, and assert the #1 invariants. Finds conflicts in combinations nobody
hand-wrote; failures reproduce from the seed. "See what happens" at scale.

**Suggested order:** #1 first (reusable, high-leverage, most likely to surface a
real conflict today), then #2 (3–4 precedence pins including the loop-back-into-
gateway case), then #3 as a fast follow-up once the #1 invariants are trusted.

---

## Other ideas

_(add here)_
