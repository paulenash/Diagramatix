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

### 1. Global "clean layout" invariants — the emergent-conflict catcher ✅ BUILT

Built as `findLayoutViolations()` in `tests/bpmn/_helpers/cleanLayout.ts`, run
over a spread of diagrams in `tests/bpmn/clean-layout.test.ts`. Checks: every
connector has waypoints; no two ruled connectors share an attachment point
(generalises R5.06 / R8.11 / R8.12); no gateway label overlaps a flow node or
connector (generalises R5.09), with a small penetration tolerance so boundary
touches don't count.

It immediately earned its keep: a dense diagram (3-way decision + merge +
boundary event + loop-back) surfaced a real R5.09 limitation — the gateway label
fell back onto a task because the sweep used a fixed radius. Fixed by adding
radius-growth to R5.09 (push the label further out when the whole left arc is
blocked). **Still TODO:** extend the invariants (element-vs-element overlap
within a lane; connector-vs-element body crossings) and run them over the real
golden test JSONs.

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

## Remaining untested BPMN red rules

Most geometric + generative red rules are now pinned (`tests/bpmn/layout-rules.test.ts`
and `tests/bpmn/structural-rules.test.ts`). Still uncovered — mostly because they're
fiddly to assert robustly with a synthetic layout (label placement / sizing):

- **Label placement (geometric):** R3.07 (decision outgoing label per-side), R6.20
  (decision label anchor), R6.21 (message label sits in the inter-pool gap), R5.07
  (message labels stagger vertically when they'd collide). Need a robust way to read
  a label's effective box and assert non-overlap rather than exact offsets.
- **Alignment (geometric):** R3.09 (nested-decision Y alignment).
- **Generative / sizing:** R6.01 (black-box pool height scales with its rotated name),
  R6.11 (an expanded subprocess gets an internal start/end event), R7.04 (embedded
  event sub-processes stack at the bottom of the outer EP).

## Known gaps found by the clean-layout invariant

Real overlaps surfaced by `findLayoutViolations` that aren't fixed yet:

- **R3.07 × R8.04 — backward-edge decision branch labels.** A decision branch
  whose connector is a backward (loop-back) edge can have its source-anchored
  label overlap its OWN gateway: the stored `srcSide` (e.g. "bottom") can
  disagree with the routed exit (it actually leaves the side face at centre
  height), so R3.07 anchors a wide label at the wrong edge and it extends back
  over the diamond. Reproduce by re-adding a label to the `d → a` loop-back in
  `clean-layout.test.ts`'s dense scenario. Fix R3.07 to key off the real exit
  geometry / clear the gateway box, then restore the label + assertion.
- **Loop-back INTO a decision gateway de-classifies it.** A gateway with a
  branch AND an incoming loop-back has 2 incomings, so `isDecisionGateway`
  (requires ≤1 incoming) returns false → its branch labels fall back to the
  sequence default (midpoint) instead of being source-anchored. Edge case;
  normal rework loops return to a task.

## Editor (manual-edit) characterisation net — IN PROGRESS

Foundation built (`tests/editor/`): the reducer is exported, `findRoutingViolations`
(`_helpers/routing.ts`) checks orthogonality / endpoint attachment / **no connector
crosses a flow node**, and `routing.test.ts` pins clean re-route cases.

- **Known gap, isolated + ratcheted:** `obstacle-sweep.test.ts` found **10 genuine
  obstacle-avoidance gaps** — a *valid* element move (not onto another element) can
  leave a connector crossing a flow node, because the editor re-route doesn't
  re-validate the path against all obstacles. The sweep ratchets crossings at ≤10;
  **drive `KNOWN_CROSSING_BASELINE` down to 0** by improving the re-route's obstacle
  avoidance (`validateConnectorsAgainstObstacles` / the MOVE_ELEMENT path).
- **TODO:** lift the routing helper into a full `assertCleanDiagram`; add per-area
  registries — Pool/Lane (`ADD_LANE`/`RESIZE`/`SWAP_LANES_VERTICAL`/membership),
  Insert Space (`INSERT_SPACE`), Alignment (`ALIGN_ELEMENTS`); then a property-based
  random-edit-sequence net asserting `assertCleanDiagram` after each step (catches
  undo/redo + state-corruption bugs).

## Other ideas

_(add here)_
