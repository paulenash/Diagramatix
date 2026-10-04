# One connector per attachment point — BPMN (plan for review)

Written for: Paul, to review before anything is built. **Nothing has been changed in the code.** This follows a read-only survey of the code base on 2026-10-03. Section references like `useDiagram.ts:7103` are to the code as it stands today.

> **Decisions taken by Paul on 2026-10-03 override this text where they differ — see §12 (gateways out of scope for now, messages stay at 24 px, imports untouched, heal on load).**

## 1. The rule, as I understand it

BPMN diagrams only. Whenever a connector is created, re-attached, re-routed or has its connection points moved — by hand, by any NL Assist / voice feature, by AI generation in any context, or by a re-route — then:

1. **No two connectors (sequence or message) may attach at the same point of an element.** "Same point" means the same side and the same position along it, whether both leave, both arrive, or one leaves and one arrives.
2. **Spreading must not create crossings.** The order of the points along a side follows the order of the elements the connectors go to. Where that order would still cross, the order is flipped (Paul's example: moving a point slightly left causes a crossing, slightly right avoids it).
3. **The spread is small and depends on the element**: Activities (large) about 5–10 px; Gateways and Events (small) about 2–3 px.

Everything else (a lone connector stays exactly where it is, e.g. the centre of its side) is unchanged.

## 2. Short answers to your questions

| Question | Answer |
|---|---|
| Is there already code for this? | **Partly, in pieces, and not in the editor.** Generation spreads sequence ends and message ends; domain/UML diagrams have their own spread; the editor only spreads voice "add message". There is **no rule anywhere that stops a second connector landing on an occupied point**, and no general crossing avoidance for sequence flows. Details in §4. |
| Is there a checker I can reuse? | **Yes.** `findLayoutViolations` check 2 (`app/lib/diagram/checks/layoutViolations.ts:237-285`) already reports "shared attachment point" for sequence and message connectors. It is the natural ratchet for this change. |
| Is there anything that will fight the change? | **Yes, four things force offset 0.5** and would undo a spread: A3 (inline intermediate events), R7.02 (boundary events), R6.30 (gateways snap to a vertex), and `validateConnectorsAgainstObstacles` (resets a re-sided end to 0.5, `useDiagram.ts:3486`). Each needs a carve-out (§6). |
| Does the >3 gateway rule matter? | **Yes — it is the one place where today the code deliberately allows a shared point.** A diamond has only three outgoing vertices, so a 4th branch doubles up on a vertex. Under your rule it would instead fan out 2–3 px from the vertex (§7.2). |

## 3. Every context that creates or moves connector attachments

All of these must end up with the rule applied. The plan (§5) does this in **one place**, run after each of them, rather than in each.

### 3.1 Manual (Canvas.tsx and the reducer)

- Drag from a connection point and drop (`handleConnectionPointDragStart`): sequence takes source side/offset from the click and target from the release; messages pick top/bottom by Y and an x from click/release.
- Drag an endpoint to re-attach (`handleEndpointDragStart` → `UPDATE_CONNECTOR_ENDPOINT`). Same element within 30 px keeps the click offset; a different element resets to 0.5.
- Palette auto-connect after a drop (`startAutoConnect`), dual auto-connect between two elements, connect mode, force-connect (Shift+Ctrl+Click), the connector-choice popup.
- Group connect: `tryDiamondConnect` (decision/merge groups) and `tryGroupConnectToGateway` — **these deliberately send every level branch into the same merge vertex today.**
- Keyboard: `NUDGE_CONNECTOR_ENDPOINT`, `NUDGE_CONNECTOR`.
- Reducer actions that create or change attachments: `ADD_CONNECTOR` (the funnel, `useDiagram.ts:7033`), `UPDATE_CONNECTOR_ENDPOINT`, `REVERSE_CONNECTOR`, `UPDATE_CONNECTOR_WAYPOINTS` (a message body drag), `SPLIT_CONNECTOR` (palette symbol dropped on a connector), auto-fuse in `ELEMENTS_MOVE_END`, `DELETE_ELEMENT` bridging (copies the neighbours' sides and offsets), `SET_EVENT_BOUNDARY` / mount, `SWAP_LANES_VERTICAL`, `ALIGN_ELEMENTS`.

### 3.2 Re-routing and moves

`recomputeAllConnectors` (`routing.ts:1883`) and everything that calls it: `MOVE_ELEMENT(S)`, `ELEMENTS_MOVE_END`, `RESIZE_ELEMENT` / `RESIZE_END`, `INSERT_SPACE` / `REMOVE_SPACE`, `REROUTE_ALL`, `CORRECT_ALL_CONNECTORS` (rectify only, no side change), `reducerWithPasses` (message-end pinning to pool width, label holds, lane reconcile). Plus `validateConnectorsAgainstObstacles` (re-sides and resets offsets).

### 3.3 NL Assist / voice (`app/lib/assist/applyAssistOps.ts` and helpers)

- Add after X (bare `addConnector`; gateway anchors via `placeGatewayBranch`; boundary-event follow-ons via `planBoundaryFollowOn`).
- Add inside an EP and the Event-EP construction (`epAdd.ts`, joins right→left).
- `insertBetween`, `connect`, `addMessage` (**already spreads messages 20 px**), message by number.
- `moveGatewayPoint` / `swapGatewayPoints` and the event point moves (the only existing occupancy checks).
- Wrap / unwrap subprocess (`subprocessWrap.ts`) and wrap in container.
- Template attach (`templateAttach.ts`, `APPLY_TEMPLATE`): saved template connectors are copied verbatim, then the join is drawn with `keepOtherRoutes: true`.
- Ghost next-steps accept (`acceptNextStep` in `DiagramEditor.tsx`, and the voice `acceptGhost` op which calls it).

### 3.4 AI generation — every context ends in `layoutBpmnDiagram` (`bpmnLayout.ts:611`)

Desktop consoles (`/api/ai/bpmn/apply-layout`: `PlanPanel`, `AiGenerateScreen`), legacy `/api/ai/generate-bpmn` and `/compare`, the mobile generate job (`generateJob.ts`), `generateDiagramData.ts`, Process Mining (`discover`, `recompute`, `calibrate`, `aiProcess`, `refreshRun`), PCF decompose, EPC / Translate-to-BPMN dialogs, Process Diff / merge, `layoutBpmnPreserved` (image import with usable geometry), `layoutFlat`, and the SuperAdmin `mode: "test"` connector builder.

### 3.5 Imports and templates

BPMN XML import (sides hard-coded right/left, BPMNDI waypoints stored as-is, no recompute), Visio V3 import (infers sides and offsets from the drawing, then recomputes), built-in and captured templates (connectors copied verbatim). I found **no connector-building code in the Repository-prompts / md-to-project path**.

## 4. What already exists

| # | Code | What it does | Applies to | Gap for this change |
|---|---|---|---|---|
| A | **R8.11 / R8.12** (`bpmnLayout.ts:4437-4499`) | Generation only. Sequence ends on the same non-gateway element and side are spread: ordered by the other end's position along the face (so no crossing), `MIN_PX = 10`, step `max(minFrac, 1/(n+1))`, clamped to [0.1, 0.9]; pushed ≥ `minFrac` from message points. A lone end stays at 0.5. | Every non-gateway element incl. events and boundary events | Not run in the editor. 10 px is too big for events (36 px). Clamp [0.1, 0.9] gives ±1.4 px on a 36 px event — effectively nothing. |
| B | **R5.06** (`bpmnLayout.ts:4400-4435`) and **R05.10** (6179-6241) | Generation only. Messages on the same non-pool element/side: `MIN_SEP = 24`; message spines sharing an x are separated by 26 px. | Messages | Ignores events: a message end on an event uses the event's centre x (the target offset is ignored), so **two messages on one event always coincide**. One known residual defect: V22.01 (`pClaimant|bottom|0.500`). |
| C | **Voice `addMessage`** (`applyAssistOps.ts:1559-1608`) | Editor. Moves a new message's x in 20 px steps (up to 12) until clear of existing message x's on that activity. | Messages on activities | Messages only; no ordering to avoid crossings. |
| D | **R6.26 – R6.29, R6.31 – R6.34** (`bpmnLayout.ts` 4076-4175, 5517-5713) | Generation. Decision gateway: 2 branches → top/bottom; 3+ → `top, right, bottom` by target Y; the 4th+ reuses a vertex. Merge mirrors it. Gateway ends are never spread off the vertex (offset always 0.5). | Gateways | Doubling up past three is **intentional** here. Comment at 5558: "A DIAMOND HAS THREE OUTBOUND VERTICES AND NO MORE". |
| E | **B49 / B54** (`checkGatewayBranchVertices`, `checkGatewayInOutVertexClash`) and the `unavoidable` exemption in `layoutViolations.ts:274-280` | Checks. B49 skips ≥ 4 outgoing; B54 is silent beyond 4 in+out; the shared-point check excuses a gateway with > 3 on an axis. | Gateways | These three exemptions are what the new rule changes. |
| F | **R7.02** (`routing.ts:474-547`; **not** the seeded R7.02, which is the lane-resize rule — see §10) | A boundary event's flow leaves from its outer point, offset 0.5. | Boundary events | Several flows on one boundary event share the single point. |
| G | **D4.04 / D4.05** (`spreadUmlEndpoints`, `deconflictUmlSegments`, `routing.ts:81-202`) | Domain / UML: shared endpoints spread to `(i+1)/(N+1)` ordered by the opposite endpoint; interior trunks deconflicted. **Generation only — the reducer never calls it**, though the seeded text says "whenever a connector is added…". | UML | Different diagram type; **out of scope**. Its ordering idea is the model for §7.1. |
| H | Moves with occupancy checks | `moveGatewayPoint` refuses an occupied vertex; `swapGatewayPoints`; event side moves refuse an occupied side. | Gateways, events | Refuse rather than spread. Needs rethinking (§7.4). |
| I | Crossings | Only drawn: `isHumpType` / `pathWithHumps` hop sequence flows over earlier ones. The one crossing counter that affects layout is R8.37 (data associations only). **No sequence-vs-sequence crossing detector or avoider exists.** | — | New (§7.1, step 3). |
| J | State machine S3.04, flowchart merge spread | Own spreads, own diagram types. | — | Out of scope. |

**"More than three outgoing on a Decision Gateway":** there is *no* such rule in the seeded rule text. The relevant seeded rules are R6.16 ("outgoing connectors attach in AI order to top, then bottom, then right (for up to three outgoing branches)"), R6.17 (the merge mirror) and R6.18 (event-based). The behaviour past three lives only in code (R6.27, R6.33) and in the exemptions in row E.

## 5. How the change works — one allocator, one place

**New pure module `app/lib/diagram/endpointSpread.ts`** exporting `spreadEndpoints(elements, connectors, opts)`. It returns connectors with adjusted `sourceOffsetAlong` / `targetOffsetAlong` (and, for a gateway fan, see §7.2) and recomputed waypoints for only the connectors it changed. It is called from exactly these places:

1. **The reducer post-pass** (`reducerWithPasses`, `useDiagram.ts:3742`) after any action that can change a connector's side, offset, or an element's position — so every manual, voice, ghost, template, wrap, move, resize, insert-space and re-route context in §3.1-3.3 is covered without touching each one. BPMN diagrams only (guarded by diagram type).
2. **`layoutBpmnDiagram` / `layoutBpmnPreserved`** (after the sides are chosen, before waypoints are computed), **replacing** R8.11/R8.12 and R5.06 with a call to the same module — *one rule, one place*, so generation and editor cannot drift. R05.10 (message spines) becomes part of it.
3. **Import paths** (BPMN XML, Visio V3): a one-off pass after import. *Open question 6.*

### 5.1 The algorithm

For each BPMN diagram, build **groups**: all `sequence` and `messageBPMN` connector ends that share `(elementId, side)`. A leaving end and an arriving end on the same side are in the same group (they must not share a point either). Association connectors are not in any group (they are not "sequence or message").

For each group with at least two ends **or** with an end whose point lies within the minimum gap of another end:

1. **Minimum gap and step by element class**

| Element class | Face length | Minimum gap | Spread step (n ends) |
|---|---|---|---|
| Activity (task, subprocess, EP, call activity) | 102 / 108 / 180 px | **5 px** | **8 px** (between 5 and 10; `min(10, max(5, (face − 2·margin)/(n+1)))`) |
| Event (start, end, intermediate, boundary) | 36 px | **2 px** | **3 px** |
| Gateway | 40 px diamond | **2 px** | **3 px** (see §7.2) |
| Pool / lane (message ends only) | whole edge | 24 px (as R5.06 today) | 26 px (as R05.10 today) |

   Margin from a corner: 6 px on an Activity, 4 px on an Event, so a spread never reaches a corner.

2. **Order** the ends along the face by the *other* end's coordinate along that face (x for top/bottom, y for left/right). This is R8.11's rule and is what avoids crossings for the usual case.
3. **Check crossings.** Compute the orthogonal route each end would take and count crossings between the group's own connectors, and against other connectors within that neighbourhood. If the count is above zero and a different order gives fewer, use that order. (Groups are tiny: n ≤ 4 gives ≤ 24 permutations; larger groups use the sorted order and a single adjacent-swap pass.) This is exactly your "moving left causes a crossing, moving right avoids it" case — the same set of points is used, only assigned in the order that does not cross.
4. **Place** the ends symmetrically about the face centre: `offset = 0.5 + (i − (n−1)/2) · step / faceLength`. A **lone** connector is never moved. A **user-placed** end (offset ≠ 0.5, no collision) is never moved either; only ends that collide move, and the others in the group move to make room.
5. **Respect the orders already decided**: a leaving end on a side that an earlier rule chose (gateway vertex, R7.02 outer point, loop-back bottom) keeps its *side*; only its offset changes.
6. **Idempotent**: running it twice changes nothing. That is the main invariant the tests pin.

### 5.2 Per element type

**Activities (Task, Subprocess, Expanded Subprocess, Call Activity).**
Offsets are a true fraction of a straight side, so the spread is simple: n ends at step 5–10 px about the centre. A 102 px task fits 5 ends at 10 px (±20 px), a 36 px-wide event cannot. For a **Task entered by several flows** (typical after a merge-less join) the three arrivals on the left side become 0.5 ± 8 px. Message ends on activities already use a 24 px step (R5.06) — they stay at 24 px, because a message line is a long vertical and 8 px reads as one thick line; the 5–10 px figure applies to sequence flows. *Open question 2.*

**Events (Start, End, Intermediate, Boundary).**
36 px square bounding box, circle inside it. Offsets are on the bounding box, not the circle (that is how `sidePoint` works today). A 3 px step puts a point at most 3 px from centre; at radius 18 the point is 0.25 px off the circle, invisible. Specifics:
- **Inline intermediate events:** A3 forces offset 0.5 at `ADD_CONNECTOR`, `UPDATE_CONNECTOR_ENDPOINT` and nudges. It becomes "0.5, or the spread offset the allocator assigned".
- **Boundary events:** R7.02 fixes the side (outer point) and offset 0.5. Normally one flow leaves. A second flow (rare, and questionable BPMN) fans at 3 px about the point; the side is unchanged.
- **Start event:** one out-flow normally; a second fans 3 px. A Start's flow still never leaves on the left, an End's flow never arrives from the right (`eventSides.ts`, unchanged).
- **Message ends on an event:** today the message x is the event centre and `targetOffsetAlong` is ignored (`useDiagram.ts:163`, `routing.ts:1981`), so two messages on one event coincide. The change: when two or more messages meet the same event, the first stays at the centre and the others take ±3 px; the "ignore the offset" shortcut applies only to a lone message.

**Gateways (diamond, 40 × 40).**
Gateway ends are today **snapped to the four vertices** with offset 0.5 (R6.30; `gatewayVertex`, `routing.ts:1219`), and `pointToBoundaryOffset` and the nudges all enforce it. The allocator therefore treats a gateway face as **a vertex plus a short run along each of the two diamond edges that meet at it**: offset `0.5 ± 3 px / edgeLength` puts the point 3 px along an edge away from the vertex. Consequences:
- R6.30 changes from "always exactly the vertex" to "the vertex, or within 3 px of it when the vertex is shared". The snap threshold (`< 0.25` → start vertex) stays; the allocator's offsets are inside the vertex's own band so nothing snaps them away, but the snap must stop *resetting* a fanned end to 0.5 (`ADD_CONNECTOR` 7137-7146, `UPDATE_CONNECTOR_ENDPOINT` 7670, `nudgeGatewayEndpoint` `TOL = 0.05`).
- The **order** of a fanned pair follows the same other-end-coordinate rule, so they do not cross.

## 6. Existing code that must change (the "fight" list)

| Where | Today | Change |
|---|---|---|
| `validateConnectorsAgainstObstacles`, `useDiagram.ts:3486` | A re-sided non-gateway end resets its offset to 0.5 | Reset to 0.5 **then** the allocator runs after it (post-pass order matters) |
| `ADD_CONNECTOR` A3 (7078), R7.02 (7128), R6.30 (7137) | Force 0.5 | Force 0.5 only as the *starting* value; the post-pass spreads on top |
| `recomputeAllConnectors` (2349) | Offset kept only if side unchanged | Unchanged; the post-pass re-spreads after every recompute |
| `tryDiamondConnect`, `tryGroupConnectToGateway` | All level branches into the one left vertex | They keep choosing sides; the post-pass fans them |
| `moveGatewayPoint` / event moves | Refuse when the point is occupied | See §7.4 |
| R8.11/R8.12, R5.06, R05.10 in `bpmnLayout.ts` | Own implementations | Replaced by calls to the module |
| `layoutViolations.ts:274-280` exemption, B49 (≥ 4), B54 (> 4) | Allow doubling up | Tighten (§7.2) |
| Voice `addMessage` 20 px spread | Own | Calls the module instead; keeps the 20 px *minimum* spacing behaviour for the dictated x |

## 7. Detailed behaviours

### 7.1 Crossings

Rule: **choose the assignment that gives the fewest crossings; when equal, the order by other-end position.** The crossing count is the number of pairwise intersections between the orthogonal routes of the group's connectors (and, within a bounding window around the group, other connectors). It is computed on the real routes (`computeWaypoints`), not on straight lines. Where crossings are unavoidable, `pathWithHumps` already draws a hop for sequence flows, so the result is readable.

### 7.2 Gateways and the ">3 outgoing" rules

- **1 incoming, 2 outgoing:** unchanged (top / bottom, R6.26). Each point is a vertex; no spread needed.
- **3 outgoing:** unchanged (top, right, bottom by target Y, R6.27 / R6.33).
- **4 or more outgoing (and 4+ incoming on a merge):** today the extras double up on the vertex their target points at. New: they **stay on that vertex's side** and fan 3 px each (a 4th branch on the top vertex: top points at −3 px and +3 px, or 0 / +3 depending on the group). R6.33 still decides *which* vertex takes the extras (the innermost). So the **shape of the fork is unchanged**, only the shared point is split.
- **In/out clash (B54):** an arriving end and a leaving end on the same vertex now also fan.
- The B49, B54 and `unavoidable` exemptions become "allowed only if the connectors are fanned", i.e. the shared-point check starts reporting any exact shared point on a gateway too.

### 7.3 Messages

Messages are always vertical in a standard BPMN diagram. Both ends share one x. So the spread applies **to the x**, not to each end separately: both ends move together, and the spread is limited by the narrower of the two faces (activity/event/pool). The pool end uses the same x (R5.06 already re-aligns it). The step is the larger of the element's spread step and 24 px for pool ends, as today. The order is by the *other* end's x (so message lines do not cross), with the permutation search of §5.1.3.

### 7.4 Moves that used to be refused

"Move to the top point" on a gateway or an event with that side occupied is currently refused ("the X already has one"). Under the new rule it can be **allowed** (the allocator fans them) — I recommend keeping the refusal for **events and gateways in NL Assist** (a deliberate command, the refusal is informative) and only guaranteeing the rule for everything else. *Open question 3.*

### 7.5 What is never touched

Associations (data, annotation, compensation), UML / domain / ArchiMate / state-machine / flowchart / EPC diagrams, a lone connector, a user-placed non-colliding end.

## 8. Tests (to be written first, then the allocator)

All pure, node-only, no browser. New files under `tests/bpmn/` and `tests/diagram/`, refs from T5224.

**A. The allocator in isolation (`endpoint-spread.test.ts`)**
1. Lone connector: unchanged (offset stays whatever it is, incl. 0.5 and a user value).
2. Two ends on one Task left face: distinct offsets, ≥ 5 px apart, within 5–10 px step, symmetric about 0.5, inside the margins. Same for 3, 4, 5 ends (5 fits a 102 px task).
3. Two ends on one Event face: ≥ 2 px apart, step 3 px, never leaving the face.
4. Gateway: two ends on one vertex: distinct points 3 px apart, both on the two diamond edges meeting at that vertex, order by other-end position.
5. A leaving end and an arriving end on one side: distinct (the B54 case).
6. **Crossing case (Paul's example):** a bottom face with two connectors to targets lower-left and lower-right; assert order = left→left; and a constructed case where the sorted order crosses and the reversed order does not — the allocator picks the reversed one; assert 0 crossings.
7. Idempotent: `spread(spread(x)) deep-equals spread(x)` over every fixture below.
8. User-placed, non-colliding end is not moved; a colliding group moves symmetrically about its centre.
9. Messages: two messages into one task share-x-free; two into one event take 0 / ±3 px; the pool end follows the same x; the step on a pool end is ≥ 24 px.
10. Association connectors, and non-BPMN diagram types, are returned unchanged.

**B. Invariant over every context (`endpoint-unique-contexts.test.ts`)** — after the action, `findLayoutViolations` check 2 reports **no** shared attachment point *and* the crossing count is no worse than before. One test each for:
`ADD_CONNECTOR` (a second flow into / out of a task, event, gateway); `UPDATE_CONNECTOR_ENDPOINT` re-attach onto an occupied point; endpoint drag onto the same element; palette auto-connect; dual auto-connect; group connect to a gateway; SPLIT_CONNECTOR; auto-fuse; DELETE_ELEMENT bridging; `NUDGE_CONNECTOR(_ENDPOINT)`; MOVE_ELEMENT / MOVE_ELEMENTS / ELEMENTS_MOVE_END; RESIZE; INSERT_SPACE / REMOVE_SPACE; REROUTE_ALL; boundary mount / SET_EVENT_BOUNDARY; ALIGN; SWAP_LANES_VERTICAL.

**C. NL Assist (`voice-endpoint-unique.test.ts`)** — through `applyAssistOps` on `headlessDiagram`: add after X (activity with two successors, via a gateway, 4th branch), add inside an EP, insertBetween, connect, add message (two to one task, two to one event), template attach, wrap / unwrap, boundary follow-on, ghost accept, and the existing gateway-point move/swap commands. Each asserts no shared point and no new crossings.

**D. Generation (`layout-corpus.test.ts` ratchet + new)** — the 30-diagram corpus must report **zero** "shared attachment point" and the `KNOWN` map entries for shared points (EP01, VTT01, V22.01) must drop. A new generated case per element class: a Task with 4 incoming, an Event with 2 messages, a decision with 5 outgoing, a merge with 5 incoming. And a check that `layoutBpmnPreserved` (image import) and the test-mode builder (`mode: "test"`, which deliberately keeps 0.5 — it is exempted, SuperAdmin-only) behave.

**E. Guard the wiring (not just the module)** — the lesson from earlier work: a source-scan test that the reducer post-pass and `bpmnLayout` both import `spreadEndpoints`, and that R8.11 / R5.06 no longer exist as separate loops (one rule, one place).

**F. Rule registry** — the updated `layoutViolations` check 2 (no gateway exemption); B49 / B54 updated; the seeded rule text and the "Rules" tile entry (new rule number, see §10); documentation.

**G. Stability** — the obstacle ratchet (`obstacle-sweep` baseline 10) must not rise; the layout-corpus counts must not rise anywhere.

## 9. Slices

| # | Slice | Contents | Size |
|---|---|---|---|
| 1 | The allocator (pure) + tests A | `endpointSpread.ts`, element classes, order, crossing search, idempotence | M |
| 2 | Generation | Replace R8.11/R8.12, R5.06, R05.10 with the module; gateway fan for 4+ ; ratchet D | M |
| 3 | Editor post-pass | `reducerWithPasses`, carve-outs in §6, tests B | L |
| 4 | NL Assist | Voice ops, ghost accept, `addMessage`, point moves; tests C | M |
| 5 | Imports | BPMN XML / Visio (if agreed) | S |
| 6 | Rules text + checks | Seed text, Rules tile, check tightening, User Guide / Technical Notes SQL | S |

Each slice ships on its own with the full suite green; nothing starts until you have reviewed this.

## 10. Risks and things to be aware of

- **Layout churn.** A post-pass that runs after every action will nudge connectors that today overlap — that is the point, but every existing layout snapshot, corpus ratchet and Visio export test may move by a few pixels. I would update those deliberately, each with a comment.
- **Gateway vertex rule.** R6.30 ("always exactly a vertex") is widely depended on (B-checks, mouse snapping, nudges, Visio export). Fanning 3 px off the vertex is the biggest change in the plan and the main reason to do gateways in a later slice if you prefer.
- **Rule numbering.** The seeded text has **no** R6.24–R6.34, R8.05–R8.38 (except R8.39), R5.xx or code-R7.xx connector rules — they exist only in code comments and the check registry. And "R7.02" means two different things (code: boundary-event exit point; seed: lane/pool resize). I would give the new rule a fresh number (proposed **R8.41**) and fix the seed in slice 6, using the idempotent-SQL route for the live DB.
- **Messages vs. sequence step size.** A single 5–10 px figure would make message lines look like one thick line; I propose keeping 24 px for messages.
- **Crossing counts are approximate** (computed on predicted routes, before obstacle detours), so a rare residual crossing is possible; the hump rendering still draws it clearly.
- **Test-mode connector builder** (SuperAdmin, `mode: "test"`) keeps everything at 0.5 on purpose; I would leave it exempt.

## 11. Questions for you

1. **Gateways in this change or the next?** Fanning 3 px off a vertex is the largest rule change (R6.30). Alternative: leave gateways at the vertex and only fan Activities and Events now.
2. **Message step size:** keep 24 px (my recommendation) or use the same 5–10 px as sequence flows?
3. **NL Assist refusals:** keep "the gateway already has one" for deliberate point moves (my recommendation) or let them fan?
4. **User-placed offsets:** a point you dragged to a specific place and which does not collide — never touched (my recommendation). Agree?
5. **Order vs. crossings:** where the order by target position and the fewest-crossings order differ, fewest crossings wins. Agree?
6. **Imports:** apply the rule to imported BPMN XML / Visio drawings, or leave an imported drawing exactly as drawn?
7. **Existing diagrams:** should opening an old diagram *repair* shared points (a heal-on-load, as pool headers and message labels already do), or only apply the rule to what is changed from now on?
8. **Associations:** data and annotation associations are left alone (not "sequence or message"). Agree?

## 12. Decisions (Paul, 2026-10-03) and what they change

| # | Decision | Effect on the plan |
|---|---|---|
| 1 | Leave gateways for now | Gateways are **out of scope**: R6.30 (vertex snap), B49 / B54 and the `unavoidable` exemption are untouched, §7.2 is deferred, and the allocator skips any end on a gateway (it neither moves it nor counts it as a clash for the other end's group). Scope is Activities and Events. |
| 2 | Messages keep 24 px | R5.06 / R05.10 spacing stays; messages are spread by the allocator with a 24 px step (pool ends) and the event ±3 px rule for two messages on one event. |
| 3 | Keep the gateway refusal | `moveGatewayPoint` / `swapGatewayPoints` and the event-side refusals are unchanged. |
| 4 | User-placed non-colliding offsets are never touched | As §5.1 step 4. |
| 5 | Fewest crossings wins over target order | As §5.1 step 3. |
| 6 | Imported drawings and generations from images stay exactly as drawn | No post-import pass (slice 5 is dropped); `layoutBpmnPreserved` is exempt. |
| 7 | Heal on load | A heal-on-load pass applies the allocator to saved BPMN diagrams (as pool headers and message labels are healed today). |
| 8 | Associations left alone | As §7.5. |

**One interaction to settle before slice 3:** decisions 6 and 7 pull against each other. An imported or image-generated diagram is saved, and the next load would heal it. Proposal: mark such a diagram when it is created by import / image generation (a `properties` flag on the diagram, e.g. `exactAsDrawn: true`), and heal-on-load skips marked diagrams. Diagrams already imported before the flag exists cannot be told apart and would be healed. Alternatively heal only when something is edited. Needs Paul's ruling.

**Revised slices:** 1 allocator (Activities and Events, sequence and messages; gateway ends skipped) · 2 generation (replace R8.11/R8.12, R5.06, R05.10 with the module, excluding image-preserved layout) · 3 editor post-pass and carve-outs for A3 / R7.02 / obstacle reset (gateway carve-out not needed) · 4 NL Assist · 5 heal-on-load (with the flag) · 6 rule text, checks (the shared-point check keeps its gateway exemption) and User Guide.

## 13. Heal on load — how it behaves (Paul, 2026-10-03)

**Ruling:** heal-on-load flashes the affected connectors **green**, and **Undo returns the diagram to exactly what was saved.**

What the code gives us today:
- `healOnLoad` (`app/lib/diagram/healOnLoad.ts`, pure) is the `useReducer` initialiser in `useDiagram.ts:10354` and is also used by the phone viewer (`MobileDiagramScreen.tsx:146`). It runs silently and leaves no history entry, so today an undo cannot reach the pre-heal state.
- Flash overlays already exist: `GoldFlashOverlay` (gold outline of what a voice command touched, `Canvas.tsx` `goldFlash`) and the Group-Connect green/red line flash (`groupFlash`).

Design:
1. **Split the heal in two.** The existing silent heals stay in `healOnLoad`. The endpoint heal is a *separate* pass, `healEndpoints(data)`, that returns `{ data, changedConnectorIds }`. The phone viewer and read-only views never call it (they draw as saved, with no flash).
2. **Editor only, after load:** the editor keeps the saved diagram, runs `healEndpoints`, and if `changedConnectorIds` is non-empty dispatches one new reducer action, `HEAL_ENDPOINTS`, that applies the healed connectors **as a normal undoable step** (so the history stack holds the saved diagram underneath). One Undo restores the diagram as saved; Redo re-applies the heal.
3. **Green flash** of exactly those connectors (new `healFlash` prop, a green sibling of `goldFlash`, 3 flashes then off), plus a one-line notice: "n connectors were separated where they shared an attachment point — Undo to restore the saved drawing."
4. **Not saved until the user saves or edits**: the heal makes the diagram dirty like any edit, so nothing is written behind the user's back; if they leave without saving, the stored diagram is untouched. Undo back to the saved state makes it clean again.
5. **Never repeats once healed and saved;** a diagram with nothing to heal opens exactly as today (no flash, no history entry, not dirty). Idempotence of the allocator (test A7) guarantees this.
6. **Exempt:** diagrams marked "exact as drawn" (imports and image generations, per decision 6), non-BPMN diagrams, read-only / impersonated / shared-view-only sessions (they could not Undo-and-save anyway), and gateway ends (decision 1).

New tests: a saved diagram with a shared point opens healed with `HEAL_ENDPOINTS` on the stack and a single Undo deep-equals the saved data; a clean diagram opens with no history entry; the changed-id list is exactly the connectors that moved; the phone viewer's load path leaves the diagram as saved; a flagged diagram is never healed; heal then save then reopen produces no second heal.

**Still needs your ruling:** with Undo as the safety net, do you still want the "exact as drawn" flag for imports and image generations (my recommendation: yes — otherwise the first open of an imported drawing would flash and change it), or should every BPMN diagram be healed with Undo as the only protection?

## 14. Ruling on the "exact as drawn" flag (Paul, 2026-10-03)

**Keep "exact as drawn" on image-generated diagrams.** This closes the open question at the end of §13.

- Diagrams created by **generation from an image** are marked when created (a diagram-level flag, e.g. `exactAsDrawn: true`). Heal-on-load, the editor post-pass's heal and the generation spread all skip a marked diagram; it opens with no flash and no history entry.
- Decision 6 (imported BPMN XML / Visio drawings stay as drawn) is unchanged, so the same flag is set for those imports. If you meant the flag for image-generated diagrams *only* and want imports healed like any saved diagram, say so and I will drop it for imports.
- The flag only protects what the heal does on **load**. Once someone edits a marked diagram, the normal editor rule (§5) applies to the connectors that edit touches, as for any diagram. (Open point, no ruling needed unless you disagree: editing a marked diagram does not clear the flag.)
- Diagrams imported or image-generated **before** the flag exists cannot be recognised and will be healed on first load, with the green flash and a one-step Undo as the safety net (§13).
- Implementation note for slice 5: the flag is set where each of those diagrams is first saved (the image-generation paths that use `layoutBpmnPreserved`, the BPMN XML importer, the Visio V3 importers). It needs no schema change if it lives in the diagram's existing JSON `data`/properties; to be confirmed when slice 5 is built.
- Added tests: a marked diagram with shared points opens unchanged (no flash, no history entry); the flag survives save and reload; a diagram generated from an image carries the flag.

**Status:** the plan is complete pending your review. No code has been written for it.

## 15. Progress (2026-10-04)

**Slice 1 — the allocator — built.** `app/lib/diagram/endpointSpread.ts`, `spreadEndpoints(elements, connectors, { relaxed })`: pure, idempotent, returns new offsets plus the ids it changed (the caller re-routes them); Activities 8 px, Events 3 px, messages 24 px on an Activity and 3 px on an Event, 24 px on a pool face; gateway ends and associations untouched; a lone or user-placed non-colliding end never moves; order follows the targets, flipped only to cross less (every order tried up to four ends). Tests T5234 (19 cases) and T5235 (the 34 corpus diagrams: no throw, idempotent, no shared point left on an Activity or Event; 10 of 34 diagrams change).

**Not wired anywhere yet** — nothing in generation, the editor or heal-on-load calls it. Slices 2–6 are unbuilt.

**Two things slice 3 must handle, found while building slice 1:**
1. The router ignores a message's offset when an Event is one of its ends (it uses the Event's centre), so two messages on one Event always coincide whatever the allocator says. Honouring the offset for Events is part of slice 3.
2. A message's spine is one world x shared by both ends, so the allocator moves it at the Activity / Event end and sets both ends' offsets; the pool end follows. A pool face where two messages from different Tasks fall within 24 px is resolved by moving a spine at its Task end.

**Slice 2 — generation — built (2026-10-04).** `layoutBpmnDiagram` no longer has its own R5.06 (messages), R8.11 (sequence ends) and R8.12 (sequence-vs-message clearance) loops: it calls `spreadEndpoints` (endpointSpread.ts), twice — once where the old passes were, so the passes that read the offsets see spread ends, and once just before the routes are drawn, because the R8.14–R8.18 passes move elements. Gateway ends are still exactly the vertex (R6.29). `layoutBpmnPreserved` (image import) is untouched — imported drawings stay as drawn. R05.10 (message spines sharing a vertical line) is kept.

Measured on the 34 corpus diagrams: V22.01 1 → 0 (the two messages sharing pClaimant's face) and EP01 3 → 2 (the two subprocess connectors sharing pLR) — both ratchet entries lowered; the worklist regenerated. The only shared point left in the corpus is on a GATEWAY (VTT01, gw_split|top), out of scope by decision. A second run of the allocator over every generated diagram changes nothing (T5236).

Two changes to the allocator came out of running it on real output: a bounded separation for a pool face where several messages from narrow Tasks must fit (the greedy version could not, though a solution existed), and a collision tolerance of 0.25 px (later generation passes recompute an offset from a world x, so a 24 px gap arrives as 23.9).

**Slice 3 — the editor — built (2026-10-04).** `reducerWithPasses` now ends every action (except `SET_DATA` — undo, redo and load restore exactly — and `APPLY_TEMPLATE`, whose flows keep the routes they were saved with) with `spreadAfter` (`spreadPass.ts` → the one allocator).

Shape of it, decided while building:
- **Only what an action touched may move.** A connector is "touched" if it is new, or its attachment changed (ends, sides, offsets, routing), or an element it is attached to moved or was resized. A label edit, a rename, a recolour or a move of an unrelated element touches nothing. Every other connector is **frozen**: it keeps the offsets it was saved with and counts as occupied, and the touched ones are placed round it. So an old diagram's legacy collision is not silently rearranged by an unrelated edit — that repair is slice 5, with its flash and its Undo. The allocator gained a `frozen` option for this.
- **A hand-shaped route is as good as a hand-placed point**: nine or more waypoints — routing.ts keeps its interior and only re-fits the end stubs — is frozen too. Re-fitting one end of such a route leaves a slanted segment.
- **Last in the action**, so the places that force offset 0.5 (A3 inline events, R7.02 boundary events, the obstacle-validation reset) are spread afterwards rather than undone. They needed no carve-out.
- **A moved connector's label goes with it** (a sequence label keeps its world position; a message label follows its anchor end).
- **The router honours a message's offset on an Event, within a fan of ±4 px** (`eventSpineX`, both message routers); a stored offset further out is an old diagram's arbitrary value and still means "the centre". Without that, two messages on one Event always drew on top of each other.
- **On a pool's face, messages from Events need only 3 px, not 24** — an Event 36 px wide cannot give 24, and asking for it pushed one message to the Event's edge where the router (rightly) showed it at the centre.

Findings: the editor sweeps (`edit-sequence`, `obstacle-sweep`) flagged "diagonal segments" that were the invisible centre-leader of a connector whose attachment is not the middle of its face. The leader is never drawn (`isAxisAligned` already says so), so the sweep helper now checks visible segments only. Obstacle crossings stayed at the baseline of 10.

Still for later slices: NL Assist's own spread in `addMessage` (20 px, now overtaken by the post-pass's 24) and the gateway-point moves (slice 4); heal-on-load with flash and Undo, and the "exact as drawn" flag (slice 5); rule text, checks and User Guide (slice 6).

**Slice 4 — NL Assist — built (2026-10-04).** Every voice command that draws or re-attaches a connector already ran through the reducer, so the slice-3 post-pass covers them; slice 4 removes the one place that had its own rule and proves the rest:
- `addMessage` no longer spreads messages itself (the 20 px, up-to-12-steps loop is gone): it adds the message at the middle of the Activity and the one rule places it round what is there — 24 px on an Activity, 3 px on an Event; the first message keeps the middle. (Two rules for one thing go stale in one of them; the old 20 px was also tighter than the 24 px rule.)
- Tested through the real commands: three messages from one Task, messages from an Event, "connect A to B" with a flow already leaving that face, "add a task … after A" three times, a boundary event's two follow-on flows, and wrapping a flow in a subprocess then adding after it — none ends with two connectors on one point.
- Unchanged by decision: the gateway-point refusals ("the X already has one") and gateways themselves.

A real bug found by the new tests (it showed as a flaky test, because connector ids are random and a tie-break sorted by id): placing a new connector round frozen neighbours only looked at the frozen ends in its own cluster, so it could land on one just outside it. It now considers every other end on the face. Pinned deterministically for all six id orders.

**Slice 5 — heal on load — built (2026-10-04).**
- `healEndpoints(data)` (spreadPass.ts): the same allocator over a whole saved diagram, nothing frozen except hand-shaped routes; returns the healed diagram and the ids it changed, or the SAME object when there is nothing to do.
- New action `HEAL_ENDPOINTS` and a hook callback `healEndpointsNow()`: it takes the history snapshot FIRST, then applies the heal — so one Undo gives back the diagram exactly as saved (tested through the real hook, T5240).
- The editor runs it once per opened diagram — BPMN only, not read-only, not while editing a template or previewing history. The phone viewer and read-only views never call it, so they draw the diagram as saved.
- The connectors it moved flash green three times (`HealFlashOverlay`, their VISIBLE lines only, honouring reduced-motion), and a one-line notice says how many were separated and that Undo restores the saved drawing.
- A diagram with nothing to heal opens exactly as before: no flash, no history entry, not dirtied.
- **Exact as drawn.** A diagram generated from an IMAGE already carries `relaxedLayout` (set by `layoutBpmnPreserved` and by the free-form regeneration) — "exactly as drawn" already existed, so no new flag was needed for those. BPMN XML and Visio imports now carry the new `exactAsDrawn` (type, schema, both importers). Heal skips either. Diagrams imported before this change cannot be told apart and are healed on first open — Undo is the safety net.
- **One thing to know:** the heal is an edit like any other, so the editor's autosave (1.5 s) will save it unless the person undoes it first; Undo is then saved in turn. Nothing is written on a read-only or phone view.

**Slice 6 — rules and documentation — built (2026-10-04). The plan is complete.**
- **R8.41** is in the seeded BPMN rules (Group 8, after R8.39) and in `scripts/sql/patch-rule-r8-41-one-connector-per-point.sql` — the same text in both, pinned by a test. Group 8 is code-backed, so the rule is RED and is not sent to the AI. (The code's R8.40 — a gateway is a child of the lane it is drawn in — carries no seeded text; R8.41 follows R8.39 in the text.)
- The same SQL file adds one User Guide section ("One connector per attachment point", chapter Connectors & Routing) and one Technical Notes section ("Connector attachment points — one allocator", chapter Diagram Model & Canvas). It is idempotent (`NOT LIKE` / `NOT EXISTS`), appends the rule only when Group 8 is the last group, deletes nothing, and reports its own result after the commit. **Proven locally in a rolled-back transaction, run twice: first run UPDATE 1 + INSERT 1 + INSERT 1, second run all zero, verdict OK, nothing left behind.**
- The code that enforces the rule names it (`bpmnLayout.ts`, the shared-point check in `layoutViolations.ts`). The check keeps its exemption for a gateway with more than three connectors on one axis, by decision.

**For Paul to run on prod:** `patch-rule-r8-41-one-connector-per-point.sql` from the in-app Database tile (SuperAdmin → Database). Nothing else in the plan needs a data change.

**What was built, in one place:** `endpointSpread.ts` (the allocator) · `spreadPass.ts` (the editor's post-pass and heal-on-load) · `HealFlashOverlay.tsx` · `routing.ts` `eventSpineX` · generation calling the allocator twice · `HEAL_ENDPOINTS` / `healEndpointsNow` · `exactAsDrawn` on BPMN XML and Visio imports · tests T5234–T5241. Left alone by decision: gateways, associations, hand-shaped routes, image-generated and imported diagrams.
