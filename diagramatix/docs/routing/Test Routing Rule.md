# Test Routing Rules (BPMN, experimental)

Deterministic connector scheme for AI-generated BPMN diagrams, selectable via the
SuperAdmin **Normal / Test** toggle in the AI panel. Implemented in
[`app/lib/diagram/bpmnTestConnectors.ts`](../../app/lib/diagram/bpmnTestConnectors.ts);
pinned by tests **T0963–T0969** in
[`tests/bpmn/test-mode-connectors.test.ts`](../../tests/bpmn/test-mode-connectors.test.ts).

> **Status:** generation-time only. See [§ Relationship to Normal routing](#relationship-to-normal-routing).

## Scope

- Applies **only to SEQUENCE connectors**. Message, association, and annotation
  connectors — and **all element positions** — are left exactly as the Normal
  engine (`layoutBpmnDiagram`) produced them.
- **Obstacle avoidance is deliberately OFF.** Connectors take the direct
  orthogonal path between the chosen attachment points and may cross other shapes.
- Every attachment point is a **face midpoint** — `sourceOffsetAlong` and
  `targetOffsetAlong` are always **0.5**.

## Rule precedence

For each end of a sequence connector, the side is chosen by the **first** matching rule:

1. **C3** — edge-mounted (boundary) event → outer face.
2. **C2** — gateway → diamond vertex.
3. **C1** — activity / event → facing side (forward) or top (backward).

## Forward vs backward

A connector is **backward** (rework / loop) when the target's centre-x is more than
**4 px** to the left of the source's centre-x (`BACKWARD_EPS = 4`); otherwise
**forward**.

## C1 — Activities & Events

| | Rule |
|---|---|
| **C1.1 Forward** | Attach at the **midpoint of the facing side** of each element. The facing side is the dominant centre-to-centre axis: if `|dx| ≥ |dy|` → `right`/`left` by sign, else `bottom`/`top` by sign. |
| **C1.2 Backward** | Attach at the **midpoint of the TOP side of BOTH ends** ("staple over the top"). |

## C2 — Gateways (diamond vertex, offset 0.5)

Decision gateways are the spec; **merge gateways are the mirror**. First classify
the gateway end as **fan** or **stem**:

- **Fan** = a decision gateway used as the **source**, *or* a merge gateway used as
  the **target** (the branching side).
- **Stem** = the single in/out end (decision incoming, merge outgoing, or a
  pass-through 1-in/1-out gateway).

| | Rule |
|---|---|
| **Stem** | The **facing side vertex** — `right` if the other element's centre is to the right, else `left`. (⇒ decision-incoming = left, merge-outgoing = right.) |
| **C2.1 Fan, up** | Other element's centre is **above** the gateway (and not level) → **TOP** vertex. |
| **C2.2 Fan, down** | Other element's centre is **below** the gateway (and not level) → **BOTTOM** vertex. |
| **C2.3 Fan, level** | Other element **vertically overlaps** the gateway's band → the **facing side vertex** (`right`/`left`). |

"Level" = the two boxes' vertical extents overlap.

## C3 — Edge-mounted (boundary) events

An edge-mounted boundary event (an intermediate event with a `boundaryHostId`)
**always** attaches its sequence connector at its **OUTER face** — the side pointing
away from the host activity (`facingSide(host, event)`). This **takes precedence over
C1 and C2**, so a boundary-event flow never leaves from the inner face touching the
host. Applies to whichever end (source or target) is the boundary event.

## Waypoints (orthogonal, no obstacle avoidance)

Path is `[sourceCentre, srcEdge, …elbows…, tgtEdge, targetCentre]` (the centre
"leaders" are trimmed at render), `routingType: "rectilinear"`:

| Exit sides | Path |
|---|---|
| Both **TOP** (backward staple) | Up to **40 px** above the higher of the two tops (`STAPLE_GAP = 40`), across, down. |
| Both **horizontal** (left/right) | Straight if aligned, else a **Z** at mid-x. |
| Both **vertical** (top/bottom) | Straight if aligned, else a **Z** at mid-y. |
| **Mixed** (one horizontal, one vertical) | A single perpendicular **elbow**. |

## Tunable constants

| Constant | Value | Meaning |
|---|---|---|
| `BACKWARD_EPS` | `4` | How far left a target must be to count as a back-edge. |
| `STAPLE_GAP` | `40` | How high a backward "staple" rides above both tops. |

## Relationship to Normal routing

- **Test layers on top of the full Normal pipeline.** `layoutBpmnDiagram` runs
  entirely as Normal (placement, overlap, gateway ordering, and the Normal connector
  pass); only then, when `mode === "test"`, `buildTestConnectors` **overwrites the
  sequence-connector geometry**. All other connectors and every element position come
  straight from Normal.
- **`bpmnTestConnectors.ts` is self-contained** — it does **not** call anything in
  `routing.ts`; the orthogonal path builder is local.
- **Generation-time only.** The saved diagram is an ordinary diagram; the editor does
  not know it was produced in Test mode. The interactive re-router
  (`recomputeAllConnectors` in `routing.ts`, which fires on element move/edit) is the
  **Normal** engine, so **editing an element re-routes its connectors back toward
  Normal**. Test has no persistent/interactive counterpart yet.

### Possible follow-up (not built)

To make Test geometry survive edits, `recomputeAllConnectors` would need a Test path
plus a persisted flag (per-diagram or per-connector) telling the editor to use it.
