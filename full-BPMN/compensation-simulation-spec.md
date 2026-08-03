# Compensation semantics in Animation & Simulation

*Captured 2026-08-03 from Paul. Verbatim rule below; decisions locked via follow-up Q&A.*

## The rule (Paul, verbatim)

> Along the animation path of a process the animator comes across one or more Activities with
> Boundary Catching Compensation Events that are connected to their associated Compensation
> Activities (Task or Subprocess). Firstly, the execution path ignores these association connectors
> and their associated Activities. Then later in the execution an Inline Throwing Compensation Event
> is encountered, then immediately any previous compensation Activities are triggered, one after the
> other and then the execution path continues past the inline Throwing compensation event. If the
> execution flow never reaches an inline Throwing Compensation Intermediate event then the
> Compensation Activities in the diagram are never triggered.

> The Compensation Activity is only triggered if the execution path included the parent Activity of
> the associated Edge-mounted Compensation Event.

## What this means, resolved

1. **Normal flow ignores compensation wiring.** A Boundary **Catching** Compensation Event, its
   outgoing **Association**, and the linked **Compensation Activity** are never traversed / executed
   as part of normal flow.
2. **Arming.** When the execution path executes (completes) an Activity that *hosts* a boundary
   compensation event (`boundaryHostId`), that Activity's Compensation Activity becomes **armed**.
   An Activity that is branched-around / never executed stays **disarmed**.
3. **Firing.** When execution reaches an **inline (intermediate) Throwing** Compensation Event, all
   currently-armed Compensation Activities fire, one after another; then flow continues past the
   throw event.
4. **No throw ⇒ no compensation.**

## Decisions (locked 2026-08-03)

| # | Question | Decision |
|---|----------|----------|
| 1 | Fire order | **Reverse of completion (LIFO)** — BPMN 2.0 default; last-completed compensates first. |
| 2 | Scope | **Global broadcast** — every armed (executed) compensable activity in the diagram, regardless of pool / sub-process. |
| 3 | Replay visual | **Flash / mark as compensated** in sequence — no token detour along the association. |
| 4 | Metrics | **Counts as real work** — each fired handler contributes its duration + cost to the run totals. |

## Feature scope

- The **"Animate!" reveal** feature (`animateOrder.ts`) has no execution path / token — it only
  *draws* the diagram progressively. It already excludes `associationBPMN` from traversal ordering.
  **No behavioural change** — the boundary event / association / handler are simply drawn like any
  other shapes.
- The **Simulation** engine (`app/lib/simulation/`) is where the rule lives (token DES + replay).

## Implementation (Simulation)

**`assemble.ts`**
- Edge builder now filters to **control-flow connector types only** (`sequence` / `transition` /
  `flow` / `flowline`) — `associationBPMN` (incl. the compensation association) and `messageBPMN`
  no longer become `SimEdge`s. This is the primary "ignore the wiring" fix.
- Build a host→handlers map: each boundary catching compensation event
  (`intermediate-event`, `eventType "compensation"`, `flowType !== "throwing"`, has `boundaryHostId`)
  → its `associationBPMN` target(s) are the handler node ids, keyed by `boundaryHostId`. The catch
  event itself is **skipped** (not a flow node).
- Host activity nodes carry `compensationHandlers: string[]`.
- An inline throwing compensation event (`intermediate-event`, `eventType "compensation"`,
  `flowType "throwing"`, no `boundaryHostId`) is tagged `compensationThrow: true` (still a
  pass-through delay node in normal flow).

**`model.ts`** — `SimNode` gains `compensationHandlers?: string[]` and `compensationThrow?: boolean`.

**`engine.ts`**
- `Token` gains `armed?: string[]` (handler ids in completion order) and
  `comp?: { queue: string[]; resume: string }` (compensation-in-progress).
- `moveNext` **arms** `node.compensationHandlers` onto the token when a host activity is left going
  forward (covers task hosts via `onServiceEnd` and subprocess hosts via `continueFromSub`).
- Entering a `compensationThrow` node fires compensation: reverse the armed list (LIFO), clear it
  (compensation consumes it), then run each handler as a real service (`startOrQueue`) in sequence —
  `onServiceEnd` routes back to the next handler while `token.comp` is set — and finally `moveNext`
  past the throw. Real service ⇒ duration, cost, resource seize and per-node stats all count; the
  emitted trace flashes/marks the handler (no edge traversal).

## v1 limitations (noted)

- Compensation is a **global broadcast** on the firing token's own executed set. Across a
  **parallel** split, only the branch/continuation token's armed set is consulted (clones copy the
  parent's armed set at split; there is no cross-branch merge on join). Fine for the common single
  main-flow case; revisit if scoped/parallel compensation is needed.
- An **Expanded**-subprocess compensation handler runs as a single lumped service (its own
  `cycleTime`, often 0) rather than recursing its inner body. Collapsed sub-process / task handlers
  run fully.
- Replay shows a **flash/mark** (per the decision), not a token detour.
