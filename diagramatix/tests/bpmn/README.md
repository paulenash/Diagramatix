# BPMN test guards — read me before adding a rule

These tests protect the **BPMN mapping experience** (the product's most important
feature). They pin the *code-enforced* ("red") BPMN rules so a rule can't quietly
break, and they catch rule **conflicts** before they ship.

## What's here

| File | Guards |
|---|---|
| `type-coverage.test.ts` | Every BPMN element/event type is wired across **palette → AI schema → symbol definition → renderer → XSD** (or in a named `EXCLUDED` set). The `EventType` union is bridged to a runtime list with a compile-time exhaustiveness check — *this is the guard that would have caught the Cancel boundary-event trigger bug.* |
| `layout-rules.test.ts` | `BPMN_LAYOUT_RULES` registry — each **geometric** red rule (sides, offsets, positions: R5.09, R8.04, R8.11, R3.06, R6.16, R3.10, R6.19, R6.25, R8.10, R5.06, R5.08, R6.18, R6.17, R8.02, R8.03) has a `check()` that drives the real `layoutBpmnDiagram` and asserts the invariant. |
| `structural-rules.test.ts` | Generative rules — where the layout **makes** the diagram well-formed (R6.13 inject start/end, R6.23 default "Decision?", R3.08 start→top lane, R6.12 drop dangling connector). |
| `clean-layout.test.ts` + `_helpers/cleanLayout.ts` | **Global invariants** over a finished layout (`findLayoutViolations`): no connector without a path, no two connectors sharing an attachment point, no gateway label overlapping a flow node or connector. Run over dense diagrams, this catches **conflicts between rules** that no single per-rule check would notice. |

## Adding a new BPMN red rule — the checklist

A `[PROPOSED]` red rule in the catalog is *intent, not yet enforced*. Making it
live means **code + a pinned test**. Do all of this:

1. **Implement** the rule's invariant in `app/lib/diagram/bpmnLayout.ts`.
2. **Pin it with a test** in the right registry:
   - geometric (a side / offset / position / ordering) → add to `BPMN_LAYOUT_RULES` in `layout-rules.test.ts`
   - generative ("ensure X exists / is dropped / is well-formed") → `BPMN_STRUCTURAL_RULES` in `structural-rules.test.ts`
   - label placement / "must not overlap" → assert with `findLayoutViolations` (`_helpers/cleanLayout.ts`) and/or add a `clean-layout.test.ts` scenario
   - Each registry entry is `{ id, title, check }`; the `check()` builds a tiny synthetic plan, runs `layoutBpmnDiagram`, and asserts the invariant. The meta-guard rejects an entry without a check.
3. **Run the whole suite** (`npm test`). Two things happen automatically:
   - if the new behaviour changes anything an existing test asserts, **that test fails** — reconcile it (the rule may supersede or conflict with another);
   - the `clean-layout` invariants fire if the rule introduces an overlap/conflict.
4. **Regenerate the inventory:** `npm run test:list` → updates `../TESTS.md`.
5. Flip the catalog rule `[PROPOSED]` → live.

## Running

```
npm test                       # whole suite
npx vitest run tests/bpmn/     # just these guards
npm run test:list              # regenerate ../TESTS.md
```

## Honest limits (don't assume more safety than there is)

- **Existing-test breakage is automatic.** A behaviour change turns an existing
  test red with no further effort.
- **A NEW rule getting a test is *convention*, not machine-enforced.** Nothing
  detects an enforced rule that was never registered. Until we add a
  coverage meta-guard (an authoritative "enforced rules" list the registries
  must fully cover), step 2 depends on whoever writes the rule.
- **There is no CI gate yet** — the suite runs locally on `npm test`, it does
  not block a push.

More test ideas (conflict precedence pins, fuzzing, the remaining label-placement
rules R6.20 / R6.21 / R5.07) are in `../possible test ideas.md`.

> Note: the `R#.##` numbers in `bpmnLayout.ts` comments are *engineering*
> numbering and do **not** map 1:1 to the catalog's red-rule numbers.
