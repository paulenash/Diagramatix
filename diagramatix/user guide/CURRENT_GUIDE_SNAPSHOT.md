# Current User Guide — content snapshot (local DB, mirrors prod)

_43 chapters. Generated for USER_GUIDE_AUDIT.md._


## [0] Getting Started  `(getting-started)`

### (no heading)
Diagramatix is a web-based diagramming tool for creating professional process diagrams, BPMN workflows, state machines, context diagrams, process context diagrams, value chains, domain models and more.

This guide covers version **1.27**.

After signing in, you land on the **Dashboard** — your home base for managing projects and diagrams.

### Signing in
Sign in with your email and password, or use your Microsoft account. After first sign-in a default organisation is created for you automatically.

### Quick start
1.  Click **\+ New Project** to create a project.
2.  Inside the project, click **\+ New Diagram** and choose a diagram type.
3.  Drag elements from the **Palette** on the left onto the canvas.
4.  Click an element, then click another to draw a **connector** between them.
5.  Double-click any element or connector label to **edit text**.
6.  Your work is **auto-saved** every few seconds.

## [1] Projects & Folders  `(projects-folders)`

### (no heading)
Projects are the top-level containers for your diagrams. Every diagram belongs to a project (or sits in the “Sandpit” section on the dashboard).

### Creating a project
Click **\+ New Project** on the dashboard. Give it a name and press Enter or click Create.

### Folders inside a project
Inside a project you can create **folders** to organise related diagrams. Use the **\+ New Folder**button at the top of the project page.

Drag diagrams between folders, or drag them to the root level. Folder structure is preserved through backup, restore, and project export/import.

### Deleting a project
Click the **trash** icon next to a project name. Deleted projects and their diagrams are moved to an internal archive and can be recovered by an administrator.

### Scan Diagrams for Issues
Open a project and click **Project ▾ → Scan Diagrams for Issues**. Diagramatix scans every BPMN diagram in the project and reports anything that looks broken or suspicious. Issues are grouped into **Errors** (red — likely broken) and **Warnings** (amber — probably the user's intent, but worth a second look).

Currently detected:

-   **Sequence/Association on Pool or Lane** — these connectors should attach to flow elements inside the container, not its boundary.
-   **Duplicate Pool/Lane names** — case- and whitespace-insensitive within a single diagram.
-   **Single-lane pools** — typically an import remnant where the pool wrapper carried the title and the lane is empty.
-   **Hanging or misconnected messages** — a message connector with no horizontal overlap between its source and target, OR a message attached to a white-box pool that has no contents, OR a message attached to the top boundary whose other end is below the containing pool (or vice versa). All four collapse under the same filter category so you can park them collectively.

**BPMN-structure rules** (per-diagram scan + the same registry that powers the project-wide scan):

-   **Element outside its container** — escapes its pool / subprocess = error; outside its lane but still inside the pool = warning (gateways and events are exempt from the lane check because they aren't lane-bound in BPMN). Dangling parent / connector references = error.
-   **Activity must have incoming AND outgoing sequence** — a Task, Sub-Process or Expanded Sub-Process with neither in nor out is unreachable / dead-ended. Event sub-processes and process-scope expanded subs (those containing their own Start event) are exempt. Inside a non-ad-hoc EP one orphan activity is allowed (the entry / exit activity), but a second one is an error. Inside an *ad-hoc* EP the rule is bypassed entirely — see the next bullet.
-   **Ad-Hoc Expanded Sub-Process** — an EP marked Ad-Hoc cannot contain or boundary-mount Start or End events (error), and cannot have any sequence flow between its child activities (error). The children run in any order triggered by the user / process.
-   **Data Object / Data Store without an association** — a data artefact that isn’t connected to any activity is doing no work; flagged as a warning so it can be wired up or removed.
-   **Connector takes too many bends** — sequence connectors with 4+ direction changes are highlighted *orange* on the canvas during Review Mode, the way flagged elements get a coloured outline.
-   **Task type vs message flows** — sending a message to a non-IT pool ⇒ Send; receiving from a non-IT pool ⇒ Receive; communicating with an IT-system pool ⇒ User.
-   **BPMN-specific structural rules** — fabricated wrapper, boundary event on a Pool/Lane, connector touching an Event Sub-Process, merge gateway left of its inputs.
-   **B14 — Task type vs message-flow matrix** (v1.17 rewrite). Every Task with a message flow is checked against a matrix of message direction × pool kind (Person / Organisation / IT System). Sending a message to a non-IT pool ⇒ Send Task; receiving from a non-IT pool ⇒ Receive Task; communicating with an IT System pool ⇒ User Task. Manual Tasks cannot carry any message flow to an IT System (B31).
-   **B23 – B27** (v1.17) — boundary Start placement, intermediate-event routing direction and throw/catch typing for boundary-mounted intermediates.
-   **B29 / B30 — Sequence flow clips a node body** (v1.17). A sequence flow whose path is drawn through its own endpoint body (B29) or grazes a foreign node body (B30) is highlighted on the canvas. Circular events and diamond gateways are exempted because of their natural bounding-box overhang.

Tick the “Ignore issue types” checkboxes at the top of the panel to park categories you've already triaged; remaining issues stay highlighted across re-scans. SuperAdmins can browse the full active rule registry — codes B01..B31, severity, description and current trigger wording — at **SuperAdmin → BPMN Scanner Rules**. (The per-diagram shortcut was removed in v1.18 — the SuperAdmin nav is now the single entry point.)

### Scan Diagrams for Links
Open a project and click **Project ▾ → Scan Diagrams for Links**. Diagramatix looks at every Subprocess shape across the project and suggests which child diagram it should link to.

The results are grouped:

-   **Existing Links** — already-wired Subprocess → child relationships. Tick to break.
-   **Definite Candidates** — Subprocess label exactly matches a diagram name. Ticked by default.
-   **Probable Candidates** — Subprocess label is similar to a diagram name. A few rules contribute:
    -   **Same leading process code** — both names start with the same identifier of the form `AAAnnn.nn.nn…` (1–3 letters, then dot-separated 1–3 digit groups). Catches `P03.1.1` style codes.
    -   **Same descriptive tail** — after stripping the code (and a leading `:` separator), the remaining text matches in both.
    -   **Fuzzy match** — contains or short Levenshtein distance. Only applies when the names don't both carry differing codes.

Checkboxes are independent — tick whichever links you want before clicking Apply. If you tick two candidates targeting the same subprocess, the second one applied wins (one subprocess can only link to one diagram).

## [2] Diagram Types  `(diagram-types)`

### (no heading)
Diagramatix supports several diagram types — Context, Process Context, State Machine, BPMN, Domain, Value Chain and ArchiMate. Each type has its own symbol palette and connector rules.

### Colour identity
Every diagram type has a **2-character code** and a contrasting pastel colour — e.g. **BP** for BPMN, **CO** for Context, **SM** for State Machine. You'll see the code as a small badge in the project navigation tree, and the colour highlights the type name on dashboard/project tiles and in the editor's top bar (which is also tinted to match).

**SuperAdmins** can change any code or colour at **SuperAdmin → Diagram Types**; the change flows everywhere the type is shown.

### BPMN
Full Business Process Model and Notation diagrams. Includes tasks (user, service, script, send, receive, manual, business-rule), gateways (exclusive, inclusive, parallel, event-based), start/intermediate/end events with triggers (message, timer, error, signal, terminate, conditional, escalation, cancel, compensation, link), pools, lanes, subprocesses (collapsed and expanded), data objects, data stores, groups and text annotations.

BPMN diagrams support **auto-connect**, **smart alignment**, and **right-click quick-add** — see dedicated chapters below.

### Context Diagram
Shows a central system and external entities that interact with it. Uses ellipses for the system and rectangles for external entities, connected by bi-directional flows.

Per-Context font controls let you size **Entity Names**, **Process Names** and **Flow Labels** independently. The properties header reads *Name* for entities and processes and *Label* for flow connectors. The process-name size round-trips via the new `processFontSize` attribute (schema 1.17).

AI generation enforces a maximum process radius, spreads connector attachment points across an entity's facing side, and guarantees ≥ 20 px between attachment points on the central process circle. Connector endpoint nudging wraps around the entity corners and travels the full circumference of the process circle, so labelled flows never collide.

### Process Context Diagram
Shows processes within a Process Group boundary, with external actors, teams, systems, and auto-schedulers connected by associations. Five element types: **Use Case** (process), **Actor** (person/role), **Team** (department/group), **System** (IT system), **Hourglass** (auto-scheduler/timer). AI generation uses a zigzag layout for processes and places actors / teams / systems beside the processes they connect to.

### State Machine
Model the states and transitions of a system. Includes states, initial state (filled circle), final state (bull's eye), composite states, sub-machine states (with linked diagrams), decision/merge gateways, fork/join bars, and curvilinear transitions with guard labels.

State machine diagrams support **auto-connect**, **right-click quick-add**, **drop-on-connector insertion**, **self-transitions**, and **insert space**.

### Flowchart
Simple boxes and arrows for general-purpose flowcharts.

### Domain Model
UML-style class diagrams with classes, enumerations, and relationships (association, aggregation, composition, generalisation).

### Value Chain
Process-based value chain diagrams. Three element types: **Process** (process step), **Collapsed Process** (with linked diagram drill-through), and **Value Chain** (container rectangle).

Features **process colour themes** (right-click on 2+ selected processes), **description boxes** below each process, automatic **horizontal snap** with 10px overlap, and **value chain nesting** with automatic shade lightening. No connectors in this diagram type.

## [3] Canvas Basics  `(canvas-basics)`

### (no heading)
The canvas is the main working area where you build your diagram. It is an SVG-based surface with pan, zoom and selection.

### Panning
Click and drag on an empty area of the canvas to **pan**. The canvas extends infinitely in all directions.

### Zooming
Use the **mouse wheel** to zoom in and out. The zoom level is shown in the toolbar. You can also use the zoom controls in the toolbar.

### Initial zoom when opening a diagram
Diagrams open at **70% zoom** by default — chosen to keep element text legible on most screens. Small diagrams that fit the viewport at that zoom are **centred**; larger diagrams are **anchored to the top-left** so you start reading at the process’s natural entry point.

To change the default, go to **Dashboard → File → Initial Zoom…** and enter a percentage (e.g. 50, 75, 100). The value is stored per-browser and becomes the slider’s “100%” reference. Leave the field blank to revert to the 70% default.

### Selecting
**Click** an element to select it (blue dashed border). **Shift+click** additional elements to add them to the selection.

**Drag** on empty canvas **pans** the view. **Shift+drag** on empty canvas draws a **lasso rectangle**; elements fully inside are selected on release. Hold Shift through release to *add* the lassoed elements to the existing selection instead of replacing it.

Press **Escape** or click empty canvas to deselect.

See **Select & Connect Protocol** for the full cursor and gesture reference.

### Moving elements
**Drag** an element to move it. All connected connectors automatically re-route.

Use the **arrow keys** to nudge selected element(s) by **5 px**, or **Shift + Arrow** to nudge by **1 px** for precise positioning.

### Resizing elements
Drag any of the **corner or edge handles** on a selected element to resize it. Connectors re-route automatically.

### Deleting
Select an element or connector and press the **Delete** key.

## [4] Palette & Elements  `(palette)`

### (no heading)
The **Palette** appears on the left side of the diagram editor. It shows all available symbol types for the current diagram type.

### Adding elements
**Drag** a symbol from the palette and drop it onto the canvas. The element appears at the drop position.

In BPMN and State Machine diagrams, dropping an element near existing elements may trigger **auto-connect** (see the Auto-Connect chapter).

### Right-click quick-add
In **BPMN** and **State Machine** diagrams, **right-click** on empty canvas to open a quick-add popup showing common shapes in a grid. BPMN shows 10 shapes:

1.  Start Event
    
2.  Task,
    
3.  Subprocess
    

1.  Expanded Sub-Process
    
2.  Intermediate Event
    
3.  End Event
    
4.  Data Object
    
5.  Data Store
    
6.  Annotation (Text)
    
7.  Group
    

State Machine shows 7 shapes: State, SubMachine, Initial, Final, Composite, Gateway, Fork/Join.

Click a shape to place it at the right-click position. Auto-connect rules apply automatically.

### Right-click type-picker on an existing element
Right-clicking on an existing **task**, **gateway**, **sub-process**, **data object** or **event** opens a small picker that lets you change its type or role without going through the Properties panel. The popup is keyboard- navigable:

-   **↑ / ↓** — move between options (section headers are skipped automatically).
-   **Enter / Space** — apply the focused option.
-   **Esc** — close without changing anything.
-   Mouse hover also moves the keyboard focus, so the two work together.

**Gateways** are the only multi-section picker:

-   **Gateway Type** — None, Exclusive ×, Inclusive ○, Parallel +, Event-based ⬠.
-   **Role** — Decision or Merge. Decision is the default. The role is also editable from the Properties panel.

**Intermediate events** can use Message, Timer, Error, Signal, Conditional, Escalation, Cancel, Compensation or Link as their trigger. **Terminate** is deliberately not offered for intermediate events — BPMN reserves it for end events only. Intermediate events also get a second section, **Flow Type**, with the choices None / Catching / Throwing (start events are always catching and end events are always throwing, so they don’t show this section).

**Sub-Processes** (collapsed or expanded) get two sections — *Sub-Process Usage* (Normal / Call / Event / Transaction) and *Repeat* (None / Loop / MI Sequential / MI Parallel). The Repeat marker controls the small icon Diagramatix draws beneath the sub-process body.

### Dropping into expanded subprocesses
When you drop an element inside an **expanded subprocess**, it is automatically added as a child of that subprocess and shrunk to 75% size to fit the subprocess context.

## [5] Connectors & Routing  `(connectors)`

### (no heading)
1.  Connectors represent the relationships and flows between elements. Diagramatix uses smart orthogonal routing with obstacle avoidance to produce clean, professional diagrams.

### Drawing a connector
1.  Click the **source** element to select it (blue dashed border appears).
2.  Click the *same* element again (no drag) — an orange dashed ring appears: **Connection-Creation mode**.
3.  Drag towards the target. A blue dashed preview line follows the pointer; valid targets are outlined in green (sequence), blue (message), or purple (association). Red outline means the target is incompatible.
4.  Release on a highlighted target to create the connector, or press **Esc** to cancel.

Connector type is chosen automatically based on diagram type and source/target pool membership (e.g. sequence within a pool, message across pools). For a complete reference of cursors, states, and modifiers see **Select & Connect Protocol**.

**Shift + Ctrl + click** on a source element, then click on a target, forces a sequence connector that bypasses normal validation (BPMN only).

### Connector types
-   **Sequence** — standard BPMN flow (solid line, filled arrow)
    
-   **Message** — BPMN message flow (dashed line, open arrow)
    
-   **Association** — BPMN association (dotted line)
    
-   **Transition** — state machine transition
    
-   **Flow** — context diagram flow
    
-   **UML Association / Aggregation / Composition / Generalisation** — domain model relationships
    
-   **Flowline** — Standard Flowchart connector

### Routing styles
Three routing styles are available in the properties panel:

-   **Rectilinear** — right-angle bends (default for most connectors)
-   **Direct** — straight line from source to target
-   **Curvilinear** — smooth curved path

### Editing connector labels
**Double-click** a connector to edit its label. Labels are automatically positioned at the midpoint of the connector. For sequence connectors from gateways, the label represents the condition/guard.

### Smart routing
Connectors automatically route around other elements to avoid overlaps. When you move an element, all connected connectors re-route in real time.

## [6] Select & Connect Protocol  `(select-connect-protocol)`

### (no heading)
The canvas uses a three-state interaction model for every element: **Idle** (nothing selected), **Selected** (blue dashed border, resize handles visible), and **Connection‑Creation** (orange dashed ring on the source, live preview line following the cursor). This section is the canonical reference for every cursor and every mouse gesture on the canvas.

### Cursors by context
| Pointer is over… | Cursor |
| --- | --- |
| Selectable element (task, event, gateway, subprocess, annotation…) | move ⇔ |
| The same element when it is already multi-selected | grab |
| Empty canvas or a non-selectable element | default |
| Pool edge (all four sides, 10 px hit-zone) | ew-resize / ns-resize |
| Lane boundary between adjacent lanes | ns-resize |
| Element resize handle (any of the 8 handles on a selected element) | directional resize |
| Connector endpoint handle (after the connector is selected) | pointer (amber during drag) |
| During element drag (move) | grabbing |
| During a connector-creation drag | crosshair |

### Mouse actions on an element
-   **Click + release (no drag)** — selects the element. Blue dashed border appears. Previous selection is replaced unless a modifier is held.
-   **Click + hold + drag** (> 4 px) — moves the element; all connected connectors re-route live.
-   **Click an already-selected element again (no drag)** — enters **Connection-Creation** mode. An orange dashed ring highlights the source.
-   **Shift + click** — toggles the element in or out of the current selection (multi-select).
-   **Shift + Ctrl + click** — starts **force-connect** (BPMN only). The next click on any other element forces a sequence connector, bypassing normal validation.
-   **Double-click** — edits the element’s label.

### Mouse actions on empty canvas
-   **Click + release** — deselects everything; cancels any pending connection-creation or force-connect.
-   **Click + hold + drag** — pans the canvas.
-   **Shift + drag** — draws a **lasso rectangle**. Elements fully inside the rectangle are selected on release. Hold Shift through release to *add* the lassoed elements to the existing selection instead of replacing it.
-   **Ctrl + click** — places (or re-places) the **space-insertion marker** (BPMN only). Shift-drag the marker to insert horizontal or vertical space.
-   **Right-click** — opens the **quick-add popup** (BPMN only) to drop a new element at that location.

### Pool, lane, and subprocess boundaries
-   Every pool has a 10 px invisible hit-zone straddling each of its four edges. Hover shows the directional resize cursor; drag resizes the pool on that edge. The vertical delta is absorbed by the single lane sharing the dragged edge — other sibling lanes keep their height. Inside that absorbing lane every descendant sublane (and sub-sublane, recursively) proportionally rescales so each level continues to tile its parent.
-   Lane boundaries between adjacent lanes within the same pool are draggable vertically to redistribute lane heights. Sublanes inside the resized lanes proportionally rescale all the way down.
-   Expanded subprocesses behave like pools — all four edges are draggable, lanes/sub-lanes and contained elements follow the resize.

### Lane &amp; sublane deletion
When you delete a Lane or Sublane the canvas applies one of two strategies depending on whether the deleted container has its own sublane children:

-   **No sublane children — “adjacent absorbs”:** the immediately-below sibling (or above, if there is no below) grows to swallow the deleted lane’s vertical slot. Every flow element keeps its (x, y) and is reparented to the absorbing sibling. The pool’s overall height is unchanged, so existing connectors don’t move.
-   **Has sublane children — “promotion”:** the deleted container’s direct sublane children are*promoted* to be children of the deleted container’s parent. They proportionally fill the deleted slot and their headers re-align flush against the new parent’s header strip (pool header for promoted-to-pool, lane header for promoted-to-lane). Deeper grandchildren proportionally rescale to continue tiling each promoted parent. Sibling lanes at the deleted container’s level are untouched.

**Singleton dissolve:** if a delete (or any cascade) leaves the pool with only one Lane, that lone Lane is automatically dissolved too. If it has its own direct sublanes those promote to the pool with their headers re-aligned (per the promotion rule); otherwise the pool reverts to a flat (no-lane) pool. The dissolve loops until the pool has either 0 or 2+ direct lanes.

### Swap adjacent lanes
Select a top-level lane (a direct child of a pool) and you see two new things on the lane:

-   A bright-blue ring tracing all four edges of the lane, in addition to the standard selection highlight, so the lane being acted on is unambiguous.
-   Two large ↑ / ↓ arrow buttons inside the lane’s header strip — one at the top, one at the bottom. The arrows turn grey when no neighbour exists in that direction (top-most lane greys ↑; bottom-most lane greys ↓).

**Click ↑** to swap the selected lane with the sibling lane immediately above it; **↓** swaps with the sibling below.

The whole lane travels as a unit — every element inside the lane, every sub-lane (and its contents, recursively), and every connector both of whose endpoints sit inside the swapping lane all translate by the same vertical offset. The two lanes’ *individual heights are preserved*; only their Y positions swap so the lane stack remains contiguous. The pool’s overall height doesn’t change.

Connectors that have *one* endpoint inside a swapping lane and the other outside (or one in each of the two swapping lanes) are re-routed against the new layout. If the connector was previously attached to the shortest side-pair between its two elements, after the swap it’s re-attached to the new shortest side-pair automatically — so a connector running bottom-to-top between vertically-stacked elements flips to top-to-bottom when those elements swap order. If you previously overrode the attachment to a deliberately non-shortest side, your choice is preserved unless the new geometry would force the connector through another element, in which case the route is replanned from scratch to avoid the obstacle.

The whole swap (lane positions, element shifts, connector re-routes) is a single undo step — **Ctrl + Z** reverts the entire operation.

Sub-lane swap (swapping two adjacent sub-lanes within a parent lane) is on the roadmap for a future release. In the current version only top-level lanes get the arrows.

### Connector endpoints (reattach)
-   Click a connector’s body to select it. Endpoint handles (small amber circles) become draggable.
-   Click + hold + drag an endpoint to reattach it to a different element. An amber dashed preview line shows the prospective path; release on the new target to commit.
-   Press **Esc** during an endpoint drag to cancel and snap back.

### Connection-Creation mode
1.  Click an element to **select** it (blue dashed border).
2.  Click the *same* element again without dragging — **Connection-Creation** starts. An orange dashed ring appears around the source.
3.  Drag towards the intended target. A blue dashed preview line follows the cursor.
4.  Potential targets are highlighted by outline colour while the pointer is near them:
    -   Green — valid sequence-connector target
    -   Blue — valid message-connector target (cross-pool)
    -   Purple — valid association target (e.g. text annotation)
    -   Red — target is incompatible with the connector type being drawn
5.  Release on a highlighted target to create the connector. Release on empty canvas or press **Esc** to cancel.

### Keyboard while selected
-   **Arrow keys** — nudge selected element(s) or connector endpoint by **5 px**.
-   **Shift + Arrow keys** — nudge by **1 px** for precise alignment.
-   **Delete** — delete the selected element(s) or connector.
-   **Esc** — cancels whichever in-progress operation takes priority: connection-creation → endpoint drag → label edit → deselect.

## [7] Auto-Connect  `(auto-connect)`

### (no heading)
When you add a new element to a **BPMN**, **State Machine** or **Flowchart** diagram (by dragging from the palette or using right-click quick-add), Diagramatix automatically connects it to nearby existing elements. This dramatically speeds up modelling.

### Three-state toggle
The pill in the bottom-right corner of the canvas cycles through three modes on each click:

-   **ON** — both sides are auto-connected. The nearest left / above neighbour is wired INTO the new element, and any candidate to the right is wired FROM the new element.
-   **TO ONLY** — only an incoming connector is created (existing → new). No outgoing connector from the new element. Useful when you want to extend a flow without picking a downstream target.
-   **OFF** — no auto- connectors at all. Dropped shapes are placed as-is. Gateway-merge (group connect via double-click) still runs.

The selected mode is saved in your browser and survives page reloads.

### How it works
The auto-connect algorithm checks three cases in priority order:

1.  **Case A — Element to the left:** If there is an element strictly to the left (no vertical overlap), the nearest one by proposed connector length is connected from its right side to the new element's left side.
2.  **Case B — Element above or below:** If there is an element directly above or below (with horizontal overlap), a vertical connector is created.
3.  **Case C — Element to the left with vertical overlap:** For elements that are to the left and vertically overlapping, a horizontal connector is created.

### Decision gateway special behaviour
If a **decision gateway** is nearby, it takes priority as the auto-connect source. This reflects the common pattern where new paths branch from a decision point. Double-click a gateway to connect a group of elements to it.

### State Machine rules
-   **Initial State** with no outgoing transition takes priority as the auto-connect source when a new element is added.
-   Never auto-connects **TO** an Initial State or Final State.
-   Never auto-connects **FROM** a Final State.
-   Initial → Initial and Final → Final connections are blocked.
-   Prefers elements inside the same **Composite State**.

### Self-transitions (State Machine)
States, Composite States, and SubMachines support **self-transitions**. Drag a connection from an element and release on the **same element** — a looping transition is created on the nearest side, extending 60px outward with source and target points 40px apart.

### BPMN sequence connector rules
-   Never auto-connect **TO** a Start Event.
-   Never auto-connect **FROM** an End Event.
-   Never auto-connect **to or from any edge-mounted (boundary) event**. Boundary events are always wired manually by the user.
-   Never auto-connect **across pool boundaries** — regardless of pool subtype. Anything outside the new element’s pool (including elements that sit in NO pool) is rejected. Cross-pool links must be message connectors, dragged manually.
-   No sequence connectors **to or from** an Event Expanded Subprocess.
-   No sequence connectors **into or out of** an Event Expanded Subprocess — internal connections only.
-   Edge-mounted End/Intermediate Events cannot connect **inside** their host subprocess.
-   Target highlighting (green) is synced with these rules — only valid targets are highlighted.

### Boundary-event attachment side
When a sequence connector touches a boundary event mounted on an Expanded Subprocess edge, Diagramatix picks the event’s OUTSIDE face if the other endpoint sits outside the host EP, and the INSIDE face if the other endpoint sits inside. The two perpendicular sides of the event (which lie ON the EP boundary) are never used. This keeps internal vs external flows visually unambiguous and survives any later EP resize.

### Self-avoidance
Newly created and rerouted sequence connectors are validated against the source and target body — if the initial side pick would route the path through the element interior (most visible on Gateways and EPs), the sides are recomputed off the source-to-target delta vector so the path exits and approaches cleanly.

### BPMN message connector behaviour
-   Connecting a task to a **non-System** black-box pool sets the task type to **Send** (source) or **Receive** (target).
-   Connecting a task to a **System** black-box pool sets the task type to **User** regardless of direction.
-   **Body drag** (v1.17) — select a message flow and grab anywhere on its highlighted line to slide the horizontal middle segment up or down. The old blue midpoint handle has been retired. AI-generated message flows are body-draggable out of the box because the layout engine now writes the four canonical waypoints (centre, source-edge, target-edge, centre) with invisible-leader flags on both ends.

### Force-connect override (BPMN)
To create a sequence connector that bypasses all validation rules:

1.  Click to select the **source** element.
2.  **Shift+Ctrl+Click** the source — an orange “Force Connect” banner appears.
3.  Click the **target** element — a forced sequence connector is created.

Press **Escape** or click the background to cancel force-connect mode.

### Cancelling auto-connect
Press **Escape** immediately after dropping an element to cancel the auto-connect and keep the element unconnected.

## [8] Properties Panel  `(properties)`

### (no heading)
The **Properties Panel** appears on the right side of the diagram editor when an element or connector is selected. It lets you configure all aspects of the selected item.

### Element properties
-   **Name** (Task, Sub-Process, Expanded Sub-Process) — the display text inside the element. Tasks and collapsed Sub-Processes auto-grow (aspect-locked to their default size) to fit the name as you type, and shrink back to the default when text is removed. Shift+Enter forces an explicit line break.
-   **Label** (Gateways, Events, Connectors, others) — the display text shown beside the element
-   **Task type** (BPMN) — user, service, script, send, receive, manual, business-rule
-   **Convert Task ↔ Subprocess** (BPMN) — change a task to a subprocess or vice versa
-   **Gateway type** (BPMN) — exclusive, inclusive, parallel, event-based
-   **Gateway role** — decision or merge
-   **Event type** (BPMN) — message, timer, error, signal, terminate, etc.
-   **Repeat marker** — none, loop, multi-instance sequential, multi-instance parallel
-   **Ad-hoc** (subprocesses) — marks the subprocess as ad-hoc
-   **Boundary events** — intermediate events attached to task edges
-   **Linked Diagram** (subprocess, SubMachine) — select a sibling diagram to drill into
-   **Fork/Join orientation** — flip between vertical and horizontal

### Connector properties
-   **Label** — connector label text
-   **Routing** — rectilinear, direct, or curvilinear
-   **Direction** — directed, non-directed, open-directed, both
-   **Connector type** — depends on diagram type

### Diagram properties panel
When nothing is selected, the Properties Panel shows the **Diagram Properties** section, grouped into nested sub-sections you can open or close independently:

-   **Title** — Show toggle, Status (Draft / Final / Production), Name (read-only), Version, Authors, Created & Modified dates. The on-canvas title block renders when Show is on.
-   **Database** (Domain diagrams only) — target database family for DDL generation: None, PostgreSQL, MySQL, SQL Server.
-   **Process Owner** — optional Name + Email of the person accountable for the process. Round-trips via XML export.

### Bubble Help
Single-clicking an element, pool header, lane header, or empty canvas pops a short comic-style help cloud near the cursor explaining the next action available there (e.g. “Click and Drag to create a connector”). The cloud auto-dismisses after a few seconds or on the next mousedown.

The master toggle **Bubble help: ON/OFF** sits next to the zoom slider at the bottom-right of the canvas. With it ON, the cloud fires on the 1st, 3rd, 5th, … click for each topic — backing off so it doesn't repeat on every interaction. Toggling OFF→ON resets the per-topic counters.

SuperAdmins edit the cloud text and duration per diagram type at **SuperAdmin → Bubble Help** (moved out of the Diagram Properties panel in v1.18). Pick a diagram type from the dropdown, expand a row to edit, then Save / Cancel at the bottom. Save persists changes and collapses the editor; Cancel discards. Both buttons stay disabled until you actually change something.

### Diagram settings
Click on empty canvas (deselect everything) to see **Diagram Settings** in the properties panel. Here you can configure the diagram colour scheme, display mode, and other diagram-wide options.

## [9] Subprocesses & Linked Diagrams  `(subprocesses)`

### (no heading)
BPMN subprocesses come in two forms: **collapsed** (shown as a small box with a “+” marker) and **expanded** (a large container that holds child elements).

### Collapsed subprocess
A collapsed subprocess can be **linked to another diagram**. Double-click the subprocess to navigate to the linked diagram. Set the linked diagram in the Properties Panel.

### Expanded subprocess
An expanded subprocess (EP) acts as a container. Drag elements from the palette directly into the expanded subprocess to add child elements.

Elements dropped inside an expanded subprocess are automatically **scaled to 75%** of their normal size to fit the subprocess context.

### EP isolation from lanes / pools
EPs are visually inside a lane or pool but they do NOT interact with the lane or pool boundary:

-   **Free crossing.** An EP can be dragged across any lane / sublane divider without affecting the divider, the lane, the pool, or any neighbouring pool. Just like every other element on the canvas.
-   **Resize is scoped.** When you drag an EP edge handle (or move a child inside the EP that forces it to grow), the EP grows / shrinks but its parent lane and pool stay at their current size. Tasks and events INSIDE the same lane (or sublane, or pool with no lanes) are pushed aside to make room; siblings outside that scope are untouched.
-   **Boundary events follow the EP.** Edge- mounted events on the EP’s top / bottom / left / right sides re-anchor to the moving edge as you resize. Events on a perpendicular side keep their absolute position on the unchanged opposite edge until the moving edge catches up to them, at which point they snap to the new corner.

### Boundary events
Drag an **intermediate event** onto the edge of a task or subprocess to create a boundary event. Boundary events snap to the nearest edge and move with their host element. Auto-connect never picks a boundary event as either source or target — wire them manually.

### EPs in lane-pools render above lane backgrounds
Pool, lane, and sublane backgrounds paint first; flow elements (including EPs) paint on top. An EP placed in a lane is fully visible and selectable — clicking the EP body always selects the EP, never the lane behind it.

### SubMachine (State Machine)
A **SubMachine** is the state machine equivalent of a collapsed subprocess. It can be linked to another state machine diagram in the same project.

-   The marker (two small rounded states connected by a line) in the bottom-right corner turns **blue** when linked, grey when unlinked.
-   **Double-click** the marker to drill into the linked diagram.
-   The linked diagram's initial state shows a **back arrow** — double-click it to return.

### Fork/Join (State Machine)
A **Fork/Join** bar represents concurrent state transitions. It appears as a thick black bar, initially vertical (5 x 100px). Use the **Flip** button in the Properties Panel to switch between vertical and horizontal orientation. Resize by dragging the handles on the long ends.

## [10] Smart Alignment  `(alignment)`

### (no heading)
Select two or more elements to reveal the **Alignment** dropdown in the toolbar. It offers standard alignment options plus a powerful smart-align feature.

### Standard alignment
-   **Align Left / Right / Top / Bottom** — aligns to the edge of the selection
-   **Align Centres Horizontally** — aligns to the average horizontal centre
-   **Align Centres Vertically** — aligns to the average vertical centre

### Smart Align
Smart Align detects logical **rows** (elements whose vertical extents overlap) and **columns** (elements whose horizontal extents overlap) using a union-find clustering algorithm with a 12-pixel tolerance.

-   Each row of 2+ elements snaps to its median Y-centre.
-   Each column of 2+ elements snaps to its median X-centre.
-   Elements in both a row and column are aligned on both axes.

This turns a messy arrangement into a clean grid in a single click.

## [11] Keyboard Shortcuts  `(keyboard-shortcuts)`

### (no heading)
| Shortcut | Action |
| --- | --- |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Ctrl+S | Save now |
| Delete | Delete selected element or connector |
| Arrow keys | Nudge selected element(s) or connector endpoint by 5 pixels |
| Shift+Arrow keys | Nudge by 1 pixel (precise) |
| Escape | Cancel connection creation / endpoint drag / label edit / deselect |
| Enter | Commit label edit |
| Shift+Enter | Line break in label |
| Double-click | Edit element or connector label |
| Shift+click | Add element to selection / toggle selection |
| Shift+lasso | Add lassoed elements to existing selection |
| Ctrl+click canvas | Place space-insertion marker (BPMN only) |
| Shift+drag marker | Insert horizontal or vertical space |
| Shift+Ctrl+click | Force-connect sequence connector (BPMN) |
| Right-click | Quick-add popup (BPMN only) |
| Mouse wheel | Zoom in / out |

On macOS, use Cmd instead of Ctrl.

## [12] Import & Export  `(export-import)`

### (no heading)
Diagramatix supports multiple export and import formats. Access them from the **File** menu in both the diagram editor and the project page.

### Export PDF
Exports the current diagram as a PDF file. You can choose a **scale** (100%, 75%, 50%, or 25%) before exporting. The scale popup appears when you click Export PDF.

### Export Visio
Exports BPMN diagrams as Microsoft Visio `.vsdx` files. The exported file uses the **BPMN Diagramatix Shapes v1.6** stencil — a modified version of Microsoft's BPMN\_M stencil with corrected markers (Terminate, Inclusive, Conditional, etc). v1.6 supersedes v1.5 with fresh master GUIDs that no longer collide with v1.4 in Visio's stencil resolver. Recipients editing in Visio need this stencil installed: the **File ▾ → Export ▸ Visio Stencil** menu item on a project page downloads it.

Two export paths:

-   **Single diagram** — from the diagram editor, **Export ▾ → Visio (for stencil v1.6)** exports just the current diagram. (A second **Visio (for stencil BPMN\_M)** option is admin-only — it still needs polishing before general release.)
-   **Whole project** — from the project page, **File ▾ → Export ▸ Visio (.vsdx) — all BPMN** exports every BPMN diagram in the project as one multi-page .vsdx (one Visio Page per diagram, ordered alphabetically by name). Non-BPMN diagrams in the project are skipped silently.

The recipient opens the file in Visio, edits, sends it back, and you can re-import via **File ▾ → Import ▸ Visio (.vsdx)** on any project page (see Visio import below).

### Export SVG
Exports the diagram as a scalable vector graphic. Ideal for embedding in documents or web pages at any resolution.

### Export JSON
Exports the diagram in Diagramatix's native JSON format. This format preserves all diagram data including properties, colours, and display settings. Use this for archival or transferring between Diagramatix instances.

### Export XML
Exports the diagram in a structured XML format. An **XSD schema file** is automatically downloaded alongside the XML so external tools can validate the file.

The XSD file is versioned (e.g. `diagramatix-export-v1.17.xsd`) to match the export format version.

### Import JSON / Import XML
Import a previously exported JSON or XML file.

-   **From the diagram editor:** replaces the current diagram's contents with the imported data.
-   **From the dashboard or project page:** creates a new project with the imported diagrams alongside your existing content.

### Import Visio (.vsdx)
From a project page, **File ▾ → Import ▸ Visio (.vsdx)** reads a single-page or multi-page Visio file and creates one Diagramatix diagram per selected page. A dialog shows every page in the file with a tick next to each so you can select a subset; choose a target (current project or new), a folder name for the imported batch, and click Import.

On import, Diagramatix runs four cleanup passes on each page so the round-trip from Visio doesn't produce spurious Pool elements: same-bbox clusters collapse, empty-label CFF Container / Swimlane List wrappers demote, placeholder labels (“Title”, “Pool”) drop in favour of real-labelled pools, and same-labelled pools that overlap collapse to the larger one. Net effect: Visio files with stacked-wrapper pools (a common pattern in older CFF-style files) come in clean.

For details on how Visio export then import together form a round-trip workflow with a recipient editing in Visio, see the **Export Visio** section above.

### Import BPMN (.bpmn)
From a project page, **File ▾ → Import ▸ BPMN** reads a standard OMG BPMN 2.0 XML file (produced by Signavio, Camunda, bpmn.io, etc.) and creates a new BPMN diagram.

### Project export/import
From the project page, **Export JSON** or **Export XML** exports the entire project including all diagrams and folder structure. Importing creates a new project with the full folder hierarchy preserved.

### Import DDL
From the Dashboard, **File ▾ → Import DDL** imports a SQL DDL file and creates a new project with a Domain Diagram. Supports PostgreSQL, MySQL, and SQL Server. See the **Import DDL** chapter for details.

### Connecting Microsoft (SharePoint / OneDrive)
Diagramatix can save and open files directly in **SharePoint** and **OneDrive**, and link Data Objects to documents stored there. To use these, sign in with your Microsoft account: on the **Sign in** page choose **Sign in with Microsoft**, or — if you signed in with email and password — the SharePoint picker will prompt you to **Connect Microsoft** the first time you open it.

Your administrator must enable the Microsoft connection for your organisation before these options will work.

### Save to SharePoint
In the diagram editor, **File ▾ → Export ▸ SharePoint…** opens a picker to browse your SharePoint sites, document libraries and OneDrive. Choose a folder and click **Save here**.

Diagramatix uploads the diagram's data files into that folder: the **XML**, its matching **XSD** schema, and the native **JSON** — plus a Visio `.vsdx` for BPMN diagrams.

### Open from SharePoint
**File ▾ → Import ▸ SharePoint…** lets you pick a `.json`, `.xml`, `.vsdx` or `.bpmn` file from SharePoint or OneDrive and load it into Diagramatix — the same import behaviour as the matching local file formats.

### Link a Data Object to a SharePoint file
Select a **Data Object** or **Data Store**, and in the Properties panel's **SharePoint file** section click **Link SharePoint file…** to pick a document. A small link badge appears on the shape to show it's linked.

Click **Preview** to view the document embedded inside Diagramatix, **Change…** to point at a different file, or **Unlink** to remove the link. The link travels with the diagram and survives XML / JSON export and import.

## [13] Backup & Restore  `(backup-restore)`

### (no heading)
The backup feature creates a complete snapshot of all your projects and diagrams in a single `.diag` file.

### Creating a backup
1.  Go to the **Dashboard**.
2.  Click **File ▾** in the header.
3.  Click **Backup...**
4.  A `.diag` file downloads containing all your projects, diagrams, folder structures, and settings.

### Preview, live progress & report
Before anything is written, a dialog shows a **pre-flight preview** — a table of exactly what will be backed up (projects, diagrams, templates, prompts) with live counts. Click **Proceed with Backup** to start, or **Cancel**.

While it runs, each section ticks off in real time. When it finishes you get a **statistical report** (rows per section, total rows, and file size) and the file downloads automatically.

### Choosing what to back up (OrgAdmin / SuperAdmin) [admin]
-   **OrgAdmin** — the preview lists every member of your Org (all ticked by default); untick anyone you want to exclude before proceeding.
-   **SuperAdmin** — pick *All Orgs* for a full system backup, or scope to a single Org and choose which of its users to include. A scoped backup also carries the system config (tiers, features, bubble-help, diagram-type styles) so it can be restored into a fresh system on its own.
-   **Staff Narrative Briefing** (in **Dashboard → AI Rules**) is split into a read-only Built-in Rules block (the core briefing, managed in code and always applied) and an editable Additional Rules box for your own house style — those additions are appended to the briefing whenever a Staff Narrative is generated.

### Restoring a backup
1.  Click **File ▾ → Restore...** on the dashboard.
2.  Select a `.diag` file.
3.  The restored projects appear alongside your existing projects with **“(restored)”** in their names.

Restore is **additive** — it never overwrites or deletes your existing content. Every restored project and diagram gets a new ID. It is also **all-or-nothing**: the whole restore runs in a single database transaction, so if anything fails partway it rolls back completely rather than leaving a half-restored set.

### What is preserved
-   All projects and their diagrams
-   Folder structure within each project
-   Subprocess linked-diagram references
-   Colour configurations and display settings

### SuperAdmin tools — Built-In Templates transfer [admin]
**SuperAdmin-only.** Opens at **SuperAdmin → Database**. Two buttons:

-   **Built-In Templates ↓** downloads a `.diag_tems` JSON file containing every template where `templateType` = `builtin` — the system-wide templates available to every user.
-   **Built-In Templates ↑** uploads a previously-downloaded `.diag_tems` file. **Additive by (name, diagramType)**: if a built-in template with the same name + type exists on the target, it's skipped (not updated); otherwise it's inserted. The status banner lists any skipped names so you can investigate.

Same migration purpose as *Rules & Prompts*: keep local-dev built-in templates in sync with prod. Note: this exposes the SAME endpoints as the diagram editor's **File ▸ Export / Import → Templates** menu — if a non-admin uses that menu, it scopes to user templates only.

### SuperAdmin tools — Rules & Prompts transfer [admin]
**SuperAdmin-only.** Opens at **SuperAdmin → Database** in the header. Two buttons:

-   **Rules & Prompts ↓** downloads a `.diag-rules` JSON file containing every row in the `DiagramRules` and `Prompt` tables (AI rules per diagram category + saved AI prompts).
-   **Rules & Prompts ↑** uploads a previously-downloaded `.diag-rules` file. Rows with a matching id on the target are **updated**; new rows are **inserted**; rows that exist on the target but NOT in the file are **left alone** (never deletes).

Designed for migrating AI configuration between databases (local-dev → prod web, say). Rows whose user or org foreign key doesn't exist on the target are **skipped** with the reason shown in the status banner — typical workflow: do the FULL Restore of users/orgs first, then re-run the rules/prompts import.

### SuperAdmin tools — FULL Backup &amp; Selective Restore [admin]
**SuperAdmin-only.** Also at **SuperAdmin → Database**.

-   **FULL Backup** — downloads a `.diag-full` snapshot covering every row in every table (including password hashes and OAuth tokens). Treat the file as a credential.
-   **Full & Selective Restore** — opens a tree where you choose which Orgs / Users / Projects / Diagrams / Templates to restore. Three modes available: *WIPE* (TRUNCATE every table then re-insert from the file — requires typing “WIPE” to confirm); *Additive* (insert rows that don't already exist, key Users by email); and *Per-table* (tick whole tables — e.g. just Templates or AI Rules — and each ticked table's rows are upserted by primary key: existing rows updated, missing rows re-inserted, nothing deleted. Requires typing “RESTORE” to confirm).

Per-table restore is a recovery power-tool — it's SuperAdmin-only and never offered on the OrgAdmin backup.

## [14] Templates (BPMN)  `(templates)`

### (no heading)
Templates let you save reusable groups of BPMN elements and connectors and stamp them onto any BPMN diagram. They are available only in BPMN diagrams.

### Applying a template
1.  Click **Templates ▾** in the toolbar.
2.  The dropdown lists **Built-In** templates (shared across all users) and **User** templates (yours only).
3.  Click a template name to stamp it onto the canvas at the current viewport centre. The new elements are automatically selected so you can immediately drag them into position.

### Creating a user template
1.  Click **Templates ▾ → + Create User Template**.
2.  The toolbar enters **capture mode** — a blue prompt reads “Select elements for user template”.
3.  Select the elements (and their connectors) you want to save. Use click, Shift+click, or lasso selection.
4.  Click **Save as Template**. Enter a name in the modal and confirm.

### Editing a template
In the Templates dropdown, click the **pencil icon** next to a template. The current diagram is temporarily replaced with the template's elements so you can modify them.

An amber banner shows **“Editing template: <name>”**. Select the elements you want to keep, then click **Update Template**. Your original diagram is restored automatically when you finish or cancel.

### Deleting a template
Click the **trash icon** next to a template in the dropdown. A confirmation dialog appears showing the template’s name; click **Delete** to remove it permanently or **Cancel** to keep it.

### Bulk export / import
From the diagram editor, **File ▾ → Export ▶ → All Templates** downloads every BPMN template (User and Built-In) as a single `.diag_tems` file. This is the safest way to share a template library between users or keep an offline backup.

**File ▾ → Import ▶ → Templates** restores from a `.diag_tems` file. You choose whether to merge into your **User** list or (admin only) the**Built-In** list. Duplicates are detected by*(name, diagram type)* and skipped — a Diagramatix dialog reports how many were imported and lists any skipped names. The Templates dropdown refreshes immediately; no page reload needed.

### Built-in templates (SuperAdmin only) [admin]
SuperAdmins can create **built-in templates** that are shared with all users. Click **\+ Create Built-In Template** (visible only to SuperAdmins) and enter the SuperAdmin password when prompted. Built-in templates appear under the “Built-In” heading in every user's Templates dropdown.

## [15] Inserting & Removing Space  `(inserting-space)`

### (no heading)
When a diagram gets crowded you can push elements apart by inserting horizontal or vertical space. When it has too much empty area you can collapse a region by removing space. Both modes use the same Ctrl+click marker workflow on **BPMN** and **State Machine** diagrams.

### Insert mode (one marker, green)
1.  **Ctrl+click** on an empty area of the canvas. A green space-insertion marker (crosshair line) appears at that position.
2.  **Shift+drag** the marker **horizontally** to push everything past the marker rightward, or **vertically** to push everything past it downward. Drag in the opposite direction to push the other way.
3.  Release the mouse button. The space is inserted and all connectors re-route automatically.

### Remove mode (two markers, red)
1.  With one marker already placed, **Ctrl+click** a second time. Both markers and their guide lines turn red, and the cross-shaped strip between them is shaded light red — that is the deletion zone.
2.  Click and drag either marker to refine the zone. The shaded strip updates live.
3.  Press **Enter**. A confirmation dialog lists every element the operation would touch, grouped into three categories with checkboxes:
    -   *Fully inside* — could be deleted (default UNCHECKED — preserved unless you tick).
    -   *Partially inside, ignored* — default CHECKED (left alone). Untick to delete.
    -   *Partially inside, will be affected* — pools, lanes, sublanes, EPs that straddle the zone. Default CHECKED (will shrink / shift). Untick to leave intact.
4.  Click **Remove**. The zone collapses, ticked elements are deleted, and surviving elements shift inward. **Cancel** closes the dialog and keeps the markers.

When the two markers share an axis the zone collapses to a single horizontal or vertical strip — the perpendicular strip is zero-extent and contributes nothing.

### Direction-aware shift
On removal, Diagramatix counts elements outside the zone on each axis and shifts whichever side has *fewer* elements — leaving the heavier side undisturbed. So if there are 8 tasks above and 2 below, the 2 below shift up to close the gap rather than the 8 above shifting down. Pool / lane containers that straddle the zone shrink instead of shifting.

### Escape ladder
Press Escape progressively to cancel:

-   **From the dialog**: closes the dialog, markers stay.
-   **From REMOVE mode**: drops the second marker, returns to INSERT mode.
-   **From INSERT mode**: drops the first marker, returns to idle.

### What gets moved on insert
-   Normal elements whose centre is beyond the marker line are shifted by the drag distance.
-   **Pools, lanes, and expanded subprocesses** that the marker line cuts through are *stretched* rather than shifted, so they grow to accommodate the new space.
-   Boundary events on an EP that the insertion line cuts through stay at their original absolute position — they do NOT slide with the new EP edge.

### Tips
Drag a marker (without Shift) to reposition it before inserting or confirming a removal. Press **Escape** at any point to step back.

## [16] Drop onto Connector & Delete Healing  `(drop-on-connector)`

### (no heading)
In **BPMN** and **State Machine** diagrams you can insert a new element into the middle of an existing flow by dropping it directly onto a connector. When you later delete that element, the flow heals itself automatically.

### Inserting an element onto a connector
1.  Drag a **Task**, **Gateway**, **Subprocess**, or **Intermediate Event** from the palette.
2.  Hover over a **sequence connector** — the connector highlights to show it will accept the drop.
3.  Release the mouse button. The original connector is replaced by **two new connectors**: one from the original source to the new element, and one from the new element to the original target.

Only sequence connectors can be split. Message flows and associations are not affected.

### Delete and heal
When you delete an element that has **exactly one incoming** and **one outgoing** sequence connector, the two connectors are automatically **bridged** into a single connector from the upstream element to the downstream element.

This makes it easy to remove a step from a process without having to manually reconnect the flow.

Applies to tasks, gateways, subprocesses, and intermediate events. If the element has multiple incoming or outgoing connectors, all connectors are simply deleted.

## [17] Edge-Mounted (Boundary) Events  `(boundary-events)`

### (no heading)
In BPMN, events can be mounted on the **boundary** (edge) of a task or subprocess to model interruptions, errors, timers and other triggers that occur during the activity's execution.

### Creating a boundary event
1.  Drag a **Start Event**, **Intermediate Event**, or **End Event** from the palette.
2.  Drop it **precisely on the edge** of a task, subprocess, or expanded subprocess. If the drop point is within 25 pixels of the host's boundary, the event **snaps** to the edge and becomes a boundary event.
3.  The event is automatically resized to the standard boundary event size and visually attached to the host.

### Behaviour
-   Boundary events **move with their host** — when you drag the task, the boundary event stays on the same edge.
-   When the host is **resized**, boundary events on the growing/shrinking edge shift to stay attached.
-   **Deleting** the host also deletes all its boundary events.

### Detaching from the boundary
The Properties panel shows an **Edge-mounted** checkbox for any BPMN event. It is automatically checked when an event is placed on the edge of a Task, Subprocess, or Expanded Subprocess.

-   **Uncheck** the box to detach the event from its host. The event is automatically nudged **30 px outward** from the side it was mounted on — far enough to clear the 25 px auto-snap threshold so the next drag won’t re-mount it. `boundaryHostId` is cleared; the event no longer follows the host edge.
-   **Re-check** the box to re-mount the event on the nearest host. Re-check only succeeds when the event’s centre is within **15 px** of a valid host’s boundary; otherwise the box bounces back unchecked. Drag the event onto an edge instead to mount from any distance.

Note: the 25 px snap that mounts events automatically when you *drop* them from the palette or drag a free event near a host is unchanged. The 15 px is just the tighter rule for the Properties checkbox.

### Connection rules
Boundary events have special connection restrictions:

-   **Catching intermediate events** (e.g. timer, message) — can connect to elements inside the parent subprocess, modelling an interruption handler.
-   **Throwing intermediate events** — connect to elements outside the parent subprocess.
-   **Boundary start events** — can only connect to children of their parent subprocess.

### Common patterns
-   **Timer boundary event** — models a timeout (e.g. “if not completed within 3 days, escalate”).
-   **Error boundary event** — catches errors thrown by the activity and routes to an error handling path.
-   **Message boundary event** — waits for an external message while the activity is running.

## [18] Value Analysis  `(value-analysis)`

### (no heading)
Value analysis lets you classify each task and subprocess in a BPMN diagram as **value-adding**, **necessary but non-value-adding**, or **non-value-adding**. You can also record cycle time and wait time for process performance analysis.

### Setting the value classification
Select a **task**, **subprocess**, or **expanded subprocess**. In the Properties Panel you will see a **Value** section with four buttons:

-   **None** — no classification (default)
-   **VA** — Value Adding (shown in green)
-   **NNVA** — Necessary Non-Value Adding (shown in orange)
-   **NVA** — Non-Value Adding (shown in red)

### Cycle time and wait time
Below the Value buttons you can enter:

-   **Cycle Time** — how long the activity takes to complete
-   **Wait Time** — how long work waits before this activity begins
-   **Time Units** — sec, min, hrs, days, or a custom unit

### Showing values on the canvas
To see value badges on the diagram:

1.  Click **Diagram Settings** in the toolbar.
2.  Check the **Value Display** checkbox.

When enabled, a coloured badge appears at the bottom-right of each classified element showing the classification code (VA/NNVA/NVA) and any recorded times (e.g. `CT=5, WT=2:min`).

## [19] Bottleneck Highlighting  `(bottleneck)`

### (no heading)
Bottleneck highlighting lets you visually flag sequence connectors that represent capacity constraints or resource bottlenecks in a process.

### Marking a connector as a bottleneck
1.  Select a **sequence connector** in a BPMN diagram.
2.  In the Properties Panel, check the **Bottleneck** checkbox.

### Enabling bottleneck display
Bottleneck connectors are only visually distinguished when the display is enabled:

1.  Click **Diagram Settings** in the toolbar.
2.  Check the **Bottleneck Display** checkbox.

When enabled, connectors marked as bottlenecks are rendered in **purple** instead of the default colour, making them stand out in the process flow.

### When to use bottleneck highlighting
-   Identifying the **constraint** in a process (Theory of Constraints)
-   Marking flows with **capacity issues** during process review workshops
-   Combining with **Value Analysis** to build a complete process performance picture

## [20] Value Chain Diagrams  `(value-chain)`

### (no heading)
Value chain diagrams model process flows using process shapes. They have no connectors — the flow is implied by the left-to-right arrangement of processes.

### Process
The primary element. A pentagon-like shape with a notched left side and pointed right side. Supports multi-line labels (Shift+Enter for new line) and an optional **description box** displayed below.

### Collapsed Process
Like a regular process but with a **+** marker at the bottom centre (same as a BPMN subprocess). Can be linked to another **Value Chain** or **BPMN** diagram in the same project.

Double-click the + marker to drill into the linked diagram. The marker turns green when linked, grey when unlinked.

### Value Chain
A rectangular container that groups related processes. Value chains always render **behind** their children.

-   Processes dropped or moved inside a value chain become its children and move with it.
-   **Shift+drag** a child to move it outside the parent boundary.
-   Nested value chains automatically **lighten in shade** — each level is 25% lighter than its parent.
-   Deleting a value chain keeps all children on the diagram.

### Description boxes
Each process has an optional description box displayed below it. The description auto-wraps to the process's width.

-   Toggle visibility with the **Show description** checkbox in the Properties Panel (on by default).
-   Edit inline by **double-clicking** the description box on the canvas.
-   Use **Shift+Enter** for explicit line breaks.

### Horizontal snap
When dragging a process near another process with ≥75% vertical overlap, it snaps to align horizontally with a **10px overlap** — creating the classic interlocking process chain appearance.

## [21] Process Colour Themes  `(chevron-themes)`

### (no heading)
Apply coordinated pastel colour schemes to groups of processes for visual distinction between process areas.

### Applying a theme
1.  Select **2 or more processes** (click + Shift+click, or lasso selection).
2.  **Right-click** — a theme picker popup appears (instead of the quick-add popup).
3.  Click a theme row — colours are applied left-to-right by process position.

### Available themes
-   **Sunrise** — warm yellows through pinks to blues
-   **Ocean** — cyans through blues to purples
-   **Garden** — greens through teals to sky blues
-   **Berry** — pinks through purples to blues
-   **Earth** — yellows through peaches to greys

### Clearing colours
Select the themed processes, right-click, and choose **Clear Colours** at the bottom of the popup. All processes revert to the default diagram colour.

## [22] Process Context Diagrams  `(process-context)`

### (no heading)
Process Context diagrams show processes within a **Process Group** boundary, connected to external actors, teams, systems, and auto-schedulers. Unlike standard Use Case diagrams, these focus on process context with numbered process identifiers.

### Element types
-   **Use Case** (ellipse) — represents a process. AI-generated processes use whatever names appear in your prompt; add a numbering scheme yourself if you want one.
-   **Actor** (stick figure) — an individual person or role.
-   **Team** (group icon) — a department or organisational unit.
-   **System** (monitor icon) — an IT system, application, or platform.
-   **Hourglass** (hourglass icon) — an auto-scheduler, timer, or time-triggered mechanism.
-   **System Boundary** (rectangle) — the Process Group container. Its label must include “Process Group”.

### AI generation layout
When generated by AI, the layout engine applies these rules:

-   Processes are arranged **one per row**, zigzagging left and right to maximise connection space.
-   **Actors and Teams** are placed on the same side as their connected processes — left actors for left-side processes, right for right-side.
-   **Systems and Hourglasses** default to the right side of the boundary.
-   Actors are vertically positioned **between** their connected processes to minimise crossing lines.
-   **P2.08** — actors / teams / systems on the same side are spaced so labels never collide.
-   **P2.09** — use-case → use-case associations are stripped. Processes connect only to actors, teams, systems and hourglasses.
-   **P2.10** — an actor group is centred vertically on the midpoint of the boundary it sits next to.
-   **P2.11** — use-case ellipses auto-grow to fit their wrapped label, preserving the original ellipse aspect ratio.

The hardcoded “P-XX-NN” process-numbering instruction has been removed from the prompt. Use whatever numbering scheme you describe in your own prompt text.

### Hourglass connectors
When an hourglass (auto-scheduler) is connected to a process, the association is automatically set to **open-directed** (open arrowhead) pointing from the hourglass toward the process it triggers. All other actor/team/system associations are non-directed (no arrows).

## [23] Resize Menu  `(resize)`

### (no heading)
When **2 or more elements** are selected, a **Resize ▾** dropdown appears in the toolbar next to the Alignment dropdown.

### Options
-   **Resize to Tallest** — all selected elements get the height of the tallest
-   **Resize to Shortest** — all get the height of the shortest
-   **Resize to Widest** — all get the width of the widest
-   **Resize to Thinnest** — all get the width of the thinnest

## [24] Element Conversion  `(convert)`

### Task ↔ Subprocess (BPMN)
In BPMN diagrams, you can convert between a Task and a collapsed Subprocess without losing common attributes.

-   Select a **Task** — the Properties Panel shows a **→ Subprocess** button.
-   Select a **Subprocess** — the Properties Panel shows a **→ Task** button.

The element changes type in place. Label, position, size, and connectors are preserved. Task→Subprocess clears the task type; Subprocess→Task sets task type to None and clears the linked diagram.

### Event Type conversion (BPMN)
All BPMN events show an **Event Type** dropdown in the Properties Panel with options: Start, Intermediate, End. Selecting a different type converts the event in place.

Label, position, and connectors are preserved. Invalid triggers are cleared on conversion (e.g. Timer cleared when converting to End Event, Terminate cleared when converting away from End). The former “Event Type” dropdown is now called **Trigger** (Message, Timer, Error, etc.).

### Process ↔ Collapsed Process (Value Chain)
In Value Chain diagrams, you can convert between a Process and a Collapsed Process in the same way.

-   Select a **Process** — the Properties Panel shows a **→ Collapsed Process** button.
-   Select a **Collapsed Process** — the Properties Panel shows a **→ Process** button.

Label, position, size, fill colour, and description are preserved. Converting to Process clears the linked diagram.

## [25] Database Domain Diagrams  `(database-diagrams)`

### (no heading)
Domain diagrams can be configured as **database schema diagrams** by setting a Database type in the **Diagram Properties → Database** sub-section. This changes stereotype labels, attribute types, and enables database-specific features.

### Setting the database type
1.  Click on empty canvas to open the Properties Panel.
2.  In **Diagram Properties → Database**, set the dropdown to PostgreSQL, MySQL, or SQL Server.

### What changes
-   Entity stereotype changes from `«entity»` to `«table»`
-   Attribute **Type** dropdown shows database-specific types (e.g. TEXT, TIMESTAMPTZ for PostgreSQL; NVARCHAR, DATETIME2 for SQL Server; VARCHAR, ENUM for MySQL)
-   New attribute flags: **NOT NULL** (shows \[1\] multiplicity), **PK** (shows {PK}), **FK** (shows {FK → table.column})
-   Red connector obstacle warnings are disabled
-   Database name shown in diagram title block

## [26] Import DDL  `(import-ddl)`

### (no heading)
Import a SQL Data Definition Language file to automatically create a Domain Diagram with tables, enumerations, foreign key relationships, and multiplicities.

### How to import
1.  On the Dashboard, click **File ▾ → Import DDL**.
2.  Choose a **Database Type** (PostgreSQL, MySQL, or SQL Server).
3.  Enter a **Project Name** (a new project will be created).
4.  Optionally enter a **Diagram Name**.
5.  Select a **.sql** or **.ddl** file.
6.  Click **Import**.

### What gets created
-   A new project with a Domain Diagram set to the chosen database type
-   **Tables** as UML classes with `«table»` stereotype, all columns as attributes with PK/FK/NOT NULL markers
-   **Lookup tables** (single-column with INSERTs) as UML enumerations
-   **Association connectors** for every foreign key, with multiplicities (\* → 1)

### Supported SQL dialects
-   **PostgreSQL** — TEXT, SERIAL, TIMESTAMPTZ, JSONB, UUID, etc.
-   **MySQL** — backtick identifiers, AUTO\_INCREMENT, ENUM, DATETIME, BLOB variants
-   **SQL Server** — \[bracket\] identifiers, IDENTITY, NVARCHAR, BIT, DATETIME2, GO terminators

## [27] Logical DDL Generation  `(generate-ddl)` **[admin-only]**

### (no heading)
SuperAdmins can generate the Diagramatix **logical data model** — the curated logical schema of the diagram domain (organisations, users, projects, diagrams, elements, connectors, templates and entity lists, plus their reference/lookup tables) — as a SQL DDL file for any supported database type. It is a *logical* model: a normalised, dialect-portable schema, not a dump of every physical runtime table.

### How to generate
1.  Click **SuperAdmin** on the Dashboard (leftmost menu item, red chip).
2.  Open **Logical DDL Generation** and click **Generate Logical DDL**.
3.  Choose a **Database Type** (PostgreSQL, MySQL, or SQL Server).
4.  Click **Download** — the DDL is saved with dialect-appropriate syntax. The header comment carries the current schema version.

### What the DDL contains
-   31 reference/lookup tables with seed INSERT data
-   24 entity tables with full column definitions
-   All foreign keys, indexes, and unique constraints
-   No JSON columns — the fully normalised **logical** data model
-   Schema version number in the header comment

## [28] OrgAdmin  `(org-admin)`

### (no heading)
An **OrgAdmin** is the admin for a single Organisation (Org Owner or Org Admin role). OrgAdmin chips, buttons and menu items across Diagramatix are coloured **orange** so you can spot them at a glance.

OrgAdmins manage users, shared projects and Org settings for their own Org. They cannot reach across Orgs — that is reserved for SuperAdmin.

### OrgAdmin menu
The orange **OrgAdmin** chip on the Dashboard opens the OrgAdmin menu at `/dashboard/org-admin` with three options:

-   **Registered Users** — every user in your Org with View / Edit actions for support purposes.
-   **Org Settings** — cross-Org sharing toggle and the list of OrgAdmins for your Org. Add or demote OrgAdmins via the candidate search.
-   **Project Sharing** — every shared project in your Org with the editors and viewers on each row.

Each sub-page back link reads "← OrgAdmin" so a single click returns you to the menu.

### Registered Users table
The OrgAdmin's Registered Users page lists every user in their Org. Header reads "Registered Users — Your Org". Standard table affordances:

-   Sortable columns: **Name**, **Email Address**, **Status**, **Subscription**, **Registered**. Click the header to sort, click again to flip direction.
-   Filter row below the headers — substring match per column, case-insensitive. Filters compose.
-   Subscription pill shows a purple *Nd* suffix when the user is inside a trial window (Free seeded with 30 days).
-   Org Role column is display-only here. Change a user's Org Role from **Org Settings → OrgAdmins**.

### Project tile right-click menu
Right-click any project tile on the Dashboard to open the destructive-action menu. The visible options depend on your role:

-   **Open** / **Clone project** — always available.
-   **x — Delete project (diagrams → Sandpit)** — visible to the project Owner or an OrgAdmin. Diagrams survive as orphans you can re-organise later.
-   **x+ — Delete project (diagrams → Archive)** — OrgAdmin only. Diagrams move to the system Archive where they remain recoverable.

The left-click of any tile still opens the project; the clone (⧉) icon stays inline. Everything else moved to this menu in v1.18.

## [29] SuperAdmin  `(admin-roles)` **[admin-only]**

### (no heading)
A **SuperAdmin** is a platform-level admin. SuperAdmin chips, buttons and menu items across Diagramatix are coloured **red** so the privilege reads at a glance.

SuperAdmins see and manage every Org, every user, every project. Normal users and OrgAdmins never see SuperAdmin controls; gates are enforced both client-side (controls hidden) and server-side (API rejects).

### SuperAdmin entry point
The red **SuperAdmin** chip on the Dashboard header opens the Registered Users page (every user across every Org). A row of red links across the header reaches every SuperAdmin sub-page: AI Rules & Preferences, Database Access, Generate DDL, System Archive, Subscription Prices and Limits, Features Catalog, Groups, AI Plan Formats, Org Settings, Project Sharing, BPMN Scanner Rules, and Bubble Help.

### Hard-delete tier on project tiles
The project-tile right-click menu shows an extra third tier for SuperAdmins on projects they OWN:

**x++ — Hard delete: project + all diagrams** — SuperAdmin only AND the SuperAdmin must own the project. Permanently removes the project row and every diagram inside it from the database. Cannot be undone.

### Org-wide management
SuperAdmin's Registered Users page covers every Org; the Org Settings page exposes an Org picker (top of page), a "+ New Org" button, and the Danger Zone with Delete Org. SuperAdmin can delete any non-last Org regardless of subscription tier; the cascade removes every member, project and diagram.

### Technical Design Notes & the Document Editor [admin]
**Technical Design Notes** is a SuperAdmin-only document that captures the low-level design of the product's deep subsystems — **Simulator**, **DiagramatixMINER** and the **Risk & Control Matrix** — including the import/export **standards** each supports (XES, OCEL, BPSim, OOXML). It's edited in the same WYSIWYG editor as the User Guide, and any document can be exported to a Word **`.docx`** file.

### Where it lives

The User Guide editor is now the **Document Editor** (SuperAdmin → **Document Editor**). A dropdown at the top switches between the two documents:

- **User Guide** — the in-app help all users read at `/help`.
- **Technical Design Notes** — the SuperAdmin-only notes, read at `/tech-notes`.

The two are fully isolated: saving one never affects the other. There is **no publish cycle** — content is live the moment you save.

### Editing

1. Open **SuperAdmin → Document Editor** (or the **Technical Design Notes** tile, which opens the editor with that document pre-selected).
2. Pick **Technical Design Notes** in the document dropdown.
3. Add / reorder chapters and sections and edit with the WYSIWYG toolbar (headings, bold/italic, lists, tables, links, images, symbols) — exactly like the User Guide.
4. **Save notes**. Switching documents with unsaved changes prompts first.

### Exporting to Word (.docx)

Use the **Export ▾** menu (edit mode):

- **Whole document (.docx)** — the entire document as one Word file.
- **This chapter — <name> (.docx)** — just the chapter you're viewing.

Headings, tables, lists, code blocks and images all carry across. (Symbol shortcodes render as their label text; embedded images come from the Help image library.)

### Reading

Open **Read Technical Design Notes** (or `/tech-notes`) for a clean, print-friendly read view with a left-hand chapter nav — no editor chrome. The whole route is SuperAdmin-only.

> The three seeded chapters (Simulator / Miner / RCM Design) are a living reference — edit them as the design evolves, and add new chapters for other subsystems.

## [30] Account Settings  `(account)`

### (no heading)
Click your **name and email** in the dashboard header to open Account Settings.

### Profile
-   **Name** — your display name shown across the application.
-   **Email** — your sign-in email address. Changing this updates your credentials immediately.

### Organisation
Edit your **Organisation Name**. This is the name shown in the dashboard header and used to identify your workspace.

### Change Password
1.  Enter your **current password**.
2.  Enter a **new password** (minimum 6 characters).
3.  Confirm the new password.
4.  Click **Save**.

### Sign Out
The **Sign Out** button is in the Account Settings dialog footer.

## [31] AI Diagram Generation  `(ai-generate)`

### (no heading)
Generate diagrams from natural language descriptions using AI. Available for all diagram types via the **AI Generate** button in the diagram editor toolbar.

**BPMN** uses a two-phase workflow (Plan then Apply Layout) that lets you review and edit the AI’s structural plan before any layout work runs. Other diagram types use a one-shot workflow that returns a finished diagram directly.

### Two-phase flow (BPMN only)
BPMN diagram generation has two steps:

1.  **Plan** — your prompt (and any attachment) is sent to Sonnet along with the BPMN rules. Sonnet returns a structured JSON plan describing pools, lanes, elements, and connectors. No diagram is rendered yet.
2.  **Apply Layout** — the (possibly edited) plan is handed to the BPMN layout engine which positions every element and applies the layout rules (R5.01–R6.13). This second step is local and fast; no AI call.

Layout rules referenced below (R3.07–R3.09) are enforced by the engine in the Apply Layout step, regardless of what the AI emitted.

The plan is shown in four synchronised tabs. Edit on any tab; changes propagate to the others.

-   **Pools / Lanes** — pools with nested lanes. Rename inline, delete with **×**. Black-box vs white-box is shown via the BB/WB badge. Drag the **⋮⋮** handle on a row to reorder: pools can move anywhere in the pool list; lanes can move within their parent pool (cross-pool drops are refused).
-   **Elements** — flow elements grouped by their container (pool → lane → subprocess), with a type badge (task / gw / start / end / …) on each row. Boundary events appear in their own section. Deleting an element also removes its connectors. Drag the **⋮⋮** handle to reorder within the same lane or subprocess group; boundary events move with their host and are not draggable.
-   **Connectors** — grouped into Sequence, Message, and Other sections. Shows source → target with editable label.
-   **Raw JSON** — full editable textarea. Typing doesn’t clobber structured state mid-edit — changes are committed back to the model on blur or by clicking **Apply JSON to structured tabs**.

**Re-send to Sonnet** runs the Plan step again with the current prompt (asks for confirmation if you have unsynced edits). **Apply Layout** runs the second phase and replaces the canvas with the result.

### Prompt input
-   Type a description of the process, system, or model you want to create in the prompt textarea.
-   **Dictate** — click the microphone button to speak your prompt (Chrome/Edge/Safari). Speech is appended to existing text.
-   **Attach a document or image** — click **Attach** to upload a file that describes the diagram. Supported formats: PDF (native document understanding), TXT, MD, CSV, RTF, DOC, DOCX, and (BPMN only) PNG, JPEG, WebP, GIF screenshots. Max 10MB. The content is sent to the AI alongside your prompt.
-   **BPMN image attachments** — upload a screenshot of an existing BPMN diagram and Sonnet reverse-engineers the structural plan from the image: pools, lanes, tasks, gateways, events and connectors are inferred and dropped into the plan tabs ready for you to edit before Apply Layout. You can also attach a flowchart image and Sonnet translates it into BPMN shape (rectangle → task, diamond → exclusive gateway, oval → start/end event, document shape → data object, cylinder → data store).

### Replace vs Add
**Replace** clears the current diagram and replaces it with the AI-generated result. **Add to diagram** appends the generated elements alongside existing content. Both are undoable with Ctrl+Z.

### Saved prompts
-   Click **Save** to save the current prompt for reuse. Prompts are filtered by diagram type — each type shows only its own saved prompts.
-   Click a saved prompt to load it. The panel enters **edit mode** — modify the text and click **Update** to save changes, or **New** to save as a fresh prompt.
-   **BPMN two-phase:** saving also stores the current plan JSON (with any structural edits) alongside the prompt text. Reloading the prompt later restores both the prompt AND the plan, so you can keep iterating on the same structural draft without re-calling Sonnet.
-   Delete prompts with the **×** button (requires confirmation).
-   Manage all prompts from **System → AI Prompt Maintenance** on the Dashboard.

### AI Rules & Preferences
Admins can configure rules that guide AI generation for each diagram type. Open the **SuperAdmin** button (leftmost red menu item on the Dashboard, Project and Diagram screens) and choose **AI Rules & Preferences**. From any diagram you can also jump straight to the rules tab for the current diagram type via the **AI Rules & Preferences — <Type>** link in the Diagram menu, which deep-links into the editor with the matching category pre-selected.

Rules are grouped and colour-coded: green rules are sent as part of the AI briefing, red rules (under Layout groups) are implemented in the layout engine code. Only green rules reach the model.

### Create Prompt from Diagram (admin only)
Admins see a red **Create Prompt from Diagram** block at the bottom of every AI panel — the BPMN PlanPanel and the one-shot AiPanel used by all other diagram types. The block offers two outputs:

-   **Technical Description** — a deterministic walker reverse-engineers the canvas into a structured 6-section recap. For BPMN that’s pools / lanes / sublanes, pool properties (BB/WB, System flag, multiplicity), pair-wise pool layout, lane contents in left-to-right flow order, edge-mounted (boundary) events and their hosts, and connectors grouped by type with *Source → Target* and labels. For other diagram types the recap covers elements, geometry, and connectors in a form that round-trips through the one-shot generator.
-   **Staff Narrative** — Sonnet rewrites the technical description as first-person prose in the voice of someone who actually runs the process. Active voice, named roles and teams, IT systems referred to by their product name, no diagram jargon. The rewrite runs under an editable briefing stored as the *staff-narrative* category in the AI Rules editor — tune the voice without code changes.

Both outputs drop into the prompt textarea so you can edit, save (via the regular Save button), or send straight to the generator.

### BPMN layout rules (decision gateways)
The Apply Layout step enforces these rules for decision gateways regardless of the AI plan’s output.

-   **R7.02 — Edge-mounted intermediate event exit point.** A connector from a boundary-mounted intermediate event exits from the event’s connection point *furthest from the host edge the event is mounted upon*. For example, an event mounted on the host’s top edge exits from the event’s top connection point.
-   **R3.07 — Decision-gateway outgoing label placement.** Labels on outgoing sequence connectors from a decision gateway are anchored to the gateway’s source attachment point, not the connector midpoint:
    -   **Top exit** — left edge of the label text is 6px right of the connector; bottom of the text box is 10px above the gateway top connection point.
    -   **Bottom exit** — left edge 6px right of the connector; top of the text box 10px below the gateway bottom connection point.
    -   **Middle-right exit** — left edge 3px right of the gateway right connection point; top of the text box 2px below the connector line.
-   **R3.08 — Start Event in topmost lane.** Every process-level Start Event is placed in the topmost lane of its pool. If the AI plan assigned the Start Event to a different lane, the layout engine moves it. Boundary start events and event-subprocess internal starts are unaffected.
-   **R3.09 — Nested gateway Y alignment.** A decision gateway (and its paired merge gateway) is positioned at the same Y as its immediate sequence-flow predecessor. This keeps a nested diamond on the branch row it entered on, so the flow doesn’t zig-zag back to the lane centre. Pairing is inferred from topology — the merge reached by all of the decision’s branches with a matching in-degree.
-   **R8.02 — Internal Start/End horizontal inset.** Start and End events placed inside an Expanded Subprocess (including Event Subprocesses and the top-row placement used by R8.01) have their centres sit **1.5 × event width** from their respective vertical boundaries — Start from the left edge, End from the right edge. Keeps them clear of the subprocess border.
-   **R8.01 — Boundary Start/End events on an outer sub with embedded event subs.** Boundary Start events are placed on the LEFT edge; boundary End events on the RIGHT edge. Their Y is aligned with the centre of the task or subprocess they are connected to (explicit connector or R6.08/R6.09 auto- connect target), not the middle of the host edge. Internal (non-boundary) Start/End direct children of the outer subprocess are placed in the top row of the grid.

## [32] Collaboration & Review  `(collaboration-review)`

### (no heading)
Diagramatix lets you circulate a diagram to colleagues for feedback before it's considered done. You build a **Collaboration Group**, **send** a diagram to that group for review, reviewers leave **Review Comments** on the diagram, and you watch their statuses come back — all inside the app.

### Collaboration Groups
Open **Dashboard → Collaboration Groups**. Click **\+ New Group** to create one (you become its *Owner*), then invite people by typing their name or email. Invitees get an in-app notification (the **🔔 bell** in the header) and can accept or decline.

-   Owners can invite, remove members, and transfer ownership (the new owner must accept).
-   Members can leave at any time; rejoining needs a fresh invite.
-   Each Organisation also has an automatic **Org group** containing all its members.
-   The **Delete group** button appears only when you're the Owner and the sole remaining member.

### Sending a diagram for review
1.  Open the diagram and click **Send for Review** in the toolbar (next to AI Generate).
2.  Pick one or more Collaboration Groups you belong to; tick which members should review (all are selected by default).
3.  Write an **Objective** (what to check) and set a **Due date** (defaults to 7 days out).
4.  Click **Send for Review**. Each reviewer is notified and the diagram appears under their **Diagrams Received for Review**.

### Tracking reviews on the dashboard
Two collections appear at the top of your dashboard when relevant:

-   **Diagrams Received for Review** — diagrams others have asked you to review.
-   **Diagrams Sent for Review** — diagrams you've sent out; expand a tile to see each reviewer's status.

Each tile's left border is colour-coded by due date — green when there's time, orange within two days, red once overdue.

### Reviewing a diagram (Review Mode)
Open a diagram from your **Received for Review** tile (or the review notification). It opens in **Review Mode**: a pink banner shows the requester, objective and due date, and a **Review Comment** symbol appears at the bottom of the palette.

1.  Drag a **Review Comment** onto the element you want to comment on — a pink note auto-links to it, pre-filled with your name and email.
2.  Type your comment in the note.
3.  In the banner, choose **Approve** (sign off), **Submit comments** (notes for the owner to address), or **Decline**.

You can also Approve / Submit / Decline straight from the Received tile without opening the diagram.

### Finishing a review (owner)
On each **Sent for Review** tile you can:

-   Filter comments by reviewer inside the editor — the toolbar shows a **Comments: All / None / <reviewer>** selector once a diagram carries review comments.
-   **Re-submit for final approval** — resets every reviewer to pending and re-notifies them for a fresh round (previous comments stay).
-   **Finish review** — closes it; the tile drops off both dashboards (the record is kept for history).

## [33] Tips & Troubleshooting  `(tips)`

### Auto-save
Diagrams are auto-saved every few seconds. The save status is shown in the toolbar. If you see “Unsaved changes”, press **Ctrl+S** to force an immediate save.

### Connection mode
After selecting an element, clicking on another element creates a connector. If you didn't intend to start a connection, press **Escape** or click on empty canvas to cancel.

### Elements not lining up?
Select all the elements you want to align, then use the **Alignment** dropdown and choose **Smart Align** for automatic grid detection.

### Connectors overlapping elements?
Try moving the elements slightly — the smart routing algorithm will recalculate paths to avoid obstacles. For stubborn cases, you can switch a connector to **Direct** routing in the properties panel.

### Boundary events not attaching?
Make sure you drop the intermediate event precisely on the **edge** of the target task or subprocess. If it drops inside the element, it becomes a child rather than a boundary event.

## [34] Entity Lists & Pool/Lane Naming  `(entity-lists)`

### (no heading)
**Entity Lists** are governed name sources for BPMN pools and lanes, so the same names are used consistently across every diagram. There are three kinds:

-   **External Participants** — the names of non-IT black-box pools.
-   **IT Systems** — the names of System (IT) black-box pools.
-   **Organisation Structure** — a hierarchy of Organisation → Org Unit → Team → Role, used to name the white-box pool and its lanes/sublanes.

### Org master vs. project copy
Each Organisation keeps a **master library** of these lists, maintained at `/dashboard/admin/entity-lists` by OrgAdmins and SuperAdmins. A **Project** then **adopts** one org structure as its own editable **copy** — so a project can tailor its names without changing the master.

Open the **Project Structure** panel (a collapsible row at the top of the diagram-tree column on the project page) to adopt an org structure, or build one directly with **“+ create empty”**. Pool/lane naming only draws from the project's *own* copy — the org master alone is not enough.

### Naming a pool or lane
Once a project has a structure, double-click a **white-box Pool** name to edit it. The default **Organisation** name is pre-filled and the whole indented structure is shown:

-   Press **Enter** to accept the default.
-   Start **typing** to filter the list across all levels; use ↑/↓ and Enter, or click, to pick a name.
-   Type a **brand-new name** and you'll be asked where it belongs in the hierarchy — it's then saved to the project structure and used as the name.

**Lanes** use the same hierarchy. **Black-box pools** draw from the External Participants or IT Systems list depending on the System flag.

## [35] Simulating Processes  `(simulation)`

### (no heading)
The **Simulator** runs your BPMN process as an **event-based (discrete-event) simulation**: work items (tokens) flow through the process over a simulated clock, tasks compete for limited **team capacity**, queues form, and **wait times emerge** from the contention. It answers “can this team cope with this workload, and where are the bottlenecks?”

Open it from the editor toolbar with the **◈ Simulator** button (available on BPMN diagrams). A short Matrix-style intro leads into the Simulator console.

### Setup checklist — what every simulation needs
A valid simulation needs values in three areas:

1 · Process (per element)

-   **Start events** — an **inter-arrival time** distribution (how often work enters), and optionally a max-arrivals cap.
-   **Tasks / sub-processes** — a **cycle (processing) time** distribution; the **team** it uses and **units required**; optionally setup/wait time.
-   **Decision gateways** — for each outgoing branch, a **probability** (the percentages must total 100) *or* a **condition**; mark one branch as the default.
-   **Delays / timer events** — a **delay** distribution.
-   **End events** — nothing required.

2 · Entities (teams / resources)

-   A **team name** and a **capacity** (how many people can work in parallel) — capacity is what makes queues form. Optionally cost and a working calendar.

3 · Environment (run settings)

-   A **time unit** (minutes / hours / days) that all durations are read in, a **run length (horizon)**, the number of **replications**, and a **random seed**. Optionally a warm-up period.

### Step by step
1.  Open or draw a **BPMN diagram** (start event → tasks → gateways → end event).
2.  Select an element. In the right-hand **Properties** panel, open the **◈ Simulation** section.
3.  For each **start event**, set the **inter-arrival time**.
4.  For each **task**, set the **cycle time**, the **team** id (e.g. *analysts*) and **units required**.
5.  For each **decision**, set the outgoing branch **percentages** so they total 100 (or use conditions).
6.  In the Simulator console’s **Teams** panel, add each team and set its **capacity** (how many can work in parallel) — capacity is what makes queues form.
7.  Click **◈ Simulator**, then **Run / Replay → Launch replay**.
8.  Watch the **green tokens** flow; tokens stacking at a task reveal a **bottleneck**. The clock is bottom-right.

### Watching the run & intervening (the Operator)
In the replay, use **Play / Pause**, the **speed** slider (the slowed-down clock) and the **scrub bar** to move through time.

As the **Operator** you can **reach in and change the world**: at the current instant, add **capacity** to a team or **inject a surge** of work, and the run **“forks the timeline”** — it re-runs from that moment with your change, so you can watch a backlog clear (or build). Forks are deterministic: the same change and seed always produce the same outcome.

### Quickly testing a partial model — auto-fill
To try a process before you’ve entered every number, open the Simulator and use **⚙ Fill missing simulation data**. It populates only the values that are **missing** — source arrivals, task cycle times, a team per swim-lane, and decision branch percentages — and **never overwrites** anything you entered. It reports how many attributes it filled.

### The Team library
Teams are **shared resource pools**. In the Simulator console’s **Teams** panel, create each team and set its **capacity**. A task uses a team by the **name** you type in its **◈ Simulation** section (or it inherits its swim-lane’s team). Because the pool is shared, two tasks — even on different diagrams — that name the same team **compete** for it.

### Working hours & calendars
Real teams don't work around the clock, and demand isn't flat. A **working calendar** captures the hours a team is actually staffed (and, optionally, when an arrival source is active) so throughput, utilisation and queues reflect reality instead of a 24/7 ideal.

**Create a calendar.** In the Simulator's **Calendars** panel, add a named calendar (e.g. *Business hours*, *Night shift*). Each calendar is a weekly pattern of **open windows** — pick a preset (**Mon–Fri 9–5**, **9–5 with lunch**, **24/7**) or add windows per day with start/end times. A gap between windows (e.g. 12:00–13:00) is a break; the team simply isn't available then. Calendars are reusable across the whole project, like the Team library.

**Assign it.** In the **Teams** panel, choose a calendar in each team's *Calendar* column (leave it **24/7** for teams — or automation — that never stop). A team on a calendar is staffed at its full capacity during open windows and **0 when closed**. Work already in progress at the end of a shift **finishes** — only new tasks wait for the next open window, and anything queued overnight starts the moment the shift opens.

**Operating hours for arrivals.** In **Simulation Data → Arrivals**, a start/intermediate event can also take a calendar: it only generates arrivals while open. Give a window a **× multiplier** (e.g. ×2 on a busy morning) to model **time-varying demand** — arrivals come faster in that window.

**Demand and staffing are different calendars — don't cross them.** Work arriving isn't the same as staff being available. Online loan applications keep landing at 2am and on Sundays; they just *queue* until the team clocks on. So put the 9–5 calendar on the **team** (they queue overnight) and leave the **source** at **24/7**. If demand itself rises and falls but never stops, give the source a calendar that stays open 24/7 with per-window **× rate bands** (the **Demand: peak/off-peak** preset) — arrivals slow down at night and on weekends instead of stopping. Only give a source *closed* windows when demand genuinely can't occur then (a phone line or a walk-in branch that's shut).

**Reading the results.** Utilisation is measured against *staffed* time, so a team busy all through its shift shows ~100% even though it idles nights and weekends. In the **Replay**, tokens visibly bank up at a closed team's tasks and surge through when the shift opens. The week is anchored so simulation time t=0 is **Monday 00:00**.

The starter examples ship with a *Business hours (9–5 with lunch)* calendar on their human teams so you can see the effect immediately after adopting one.

### Studies, scenarios & what-ifs
A **Study** is a portfolio: pick one or more **root diagrams** and the engine assembles them into a single run that shares the team pools. Inside a study, create **Scenarios** — each carries its own **run configuration** (time unit, horizon, warm-up, replications, seed) and a sparse set of **overrides** (e.g. bump a team’s capacity). Mark one scenario the **baseline**; duplicate it to explore a variation.

Scenarios can also schedule **planned interventions** — timed changes applied during the run: add capacity / cause an outage at time *t*, scale an arrival rate, force a branch probability, or inject a surge of work. These are the deterministic, repeatable cousin of the live Operator.

### Running it & reading the results
On a scenario, press **▶ Run**. The engine runs the Monte-Carlo replications and shows a compact summary — **throughput**, **flow-time** p50/p95, and the **top bottleneck** team with its utilisation.

Open **▸ full results** for the report: per-team utilisation & queue (ranked by bottleneck), flow-time ranges, and the busiest tasks by wait. With two or more scenarios, use **⇄ compare scenarios** to see them side by side with **deltas vs the baseline** — the quickest way to show “hiring two more clears the backlog”.

### The heatmap
In the console, **▦ Heatmap** runs a quick simulation of the current diagram and tints each task by its team’s **utilisation** — the brighter the glow, the closer to saturated. A small **⧗ wait** badge sits on each task and the worst-wait task is ringed. It’s the at-a-glance “where’s the heat?” view.

### Ready-made examples
New to simulation? From the Dashboard’s **System** menu open **Simulator Examples** and pick one (single bottleneck, a shared team across two processes, a surge intervention). **Load & open** copies it into a new project of your own and drops you on its diagram — open the **◈ Simulator** and Run, Replay or compare scenarios straight away. They’re a safe place to explore, and a fast way to **demo**.

### Multiple processes & BPSim
When you simulate a **set of related processes**, give the same **team name** to tasks across diagrams that draw on the same people, then add them all as roots of one **Study** — they share one capacity pool, so the simulation shows whether that team is overloaded *across all* the work. Keep one consistent time unit across the set.

The simulation parameters follow the industry **BPSim** standard, so models can be exchanged with other BPSim-compatible tools, and decision-branch routing is included in the diagram’s XML export.

## [36] DiagramatixMINER — Process Mining  `(process-mining)`

### What DiagramatixMINER does
Diagramatix models the process you *design*. **DiagramatixMINER** reveals the process you *actually run*. Point it at a standard **event log** — the rows any real system emits as work happens (a case id, an activity, a timestamp, and the entity's resulting state) — and it reconstructs the real process for you: the **BPMN implied by the log**, the **lifecycle** of the underlying entity (Invoice, Employee, Registrant…), and where reality **deviates** from the model that's meant to be the single source of truth.

It closes a full loop: **mine → discover → conform → calibrate → simulate → improve**. The same log that shows you the as-is process also carries the numbers a simulation needs — so one click turns the discovered process into a *credible* digital twin you can run in the **Simulator**, with arrival rates, durations, branch odds, teams and working hours all taken from reality instead of guessed.

Open it from a project's action menu — **⛏ DiagramatixMINER**. The console is styled like the Simulator (DiagramMATRIX), in mining browns.

### Importing an event log
In the **Import** panel, upload a **CSV** export from one or more source systems. DiagramatixMINER parses it in the browser for a quick preview, then processes the full file on the server so large logs aren't capped by an upload limit.

**Map the columns.** Tell the miner which column is which — it auto-guesses from the header names and you adjust:

- **Case / entity id** *(required)* — the thing that flows through the process (invoice number, application id). All rows with the same id are one *case*.
- **Activity / event** *(required)* — what happened ("Submit", "Approve").
- **Timestamp** *(required)* — when it happened (ISO dates or epoch seconds/ms). Rows are ordered by this within each case.
- **State** *(required)* — the entity's resulting state after the event ("Draft", "Pending", "Approved"). This is what conformance checks against your reference lifecycle.
- **Resource** *(optional)* — who or what did the work; feeds mined teams and their capacity.
- **Entity type** *(optional)* — a label for the kind of entity, when a log mixes several.

The miner groups rows into cases, compresses identical case journeys into **variants** (a distinct sequence + how many cases followed it — the standard, compact form of a log), and saves a **run** you can revisit. The stats show how many cases, events, activities, states and variants it found, and the log's date range. A run persists, so you can re-discover or re-check conformance against a *different* reference later without re-uploading.

### Discovering the process (BPMN)
In **Discover process**, the miner builds a **directly-follows graph** — which activity tends to follow which — then turns it into a real, editable **BPMN** diagram: activities become tasks in a pool, a point where work fans out becomes an **exclusive gateway**, points where paths rejoin become merges, and loops fall out naturally. Start and end events are added for you.

Real logs are noisy, so a **detail slider** filters out the rarest paths: slide toward *simpler* to see the dominant flow (the "happy path"), toward *fuller* to include uncommon routes. Connector labels show how often each step was taken.

The result is an ordinary Diagram — **open it in the editor**, tidy it, rename things, or use it as the starting point for a to-be redesign. Re-discover at any detail level; it refreshes the same diagram.

### Why a state machine? The entity's lifecycle
DiagramatixMINER produces two very different diagrams from the same log, and they answer two different questions. The **BPMN** answers *“what do people do, and in what order?”* — the activity flow. The **state machine** answers *“what states does the thing being processed pass through, and which moves between them are legal?”* — the **entity lifecycle**.

That second view is the point. These processes are really the lifecycle of a business entity — an **Invoice**, an **Employee**, a **Registrant**. An invoice isn't fundamentally a list of tasks; it's a thing that is *Received*, then *In Progress*, then *Approved*, then *Paid*. The activities are just what move it from one state to the next. So the state machine is the more durable, governable picture: who does the work and how the steps are arranged will change over time, but *“an invoice may only be paid after it is approved”* is a rule that should always hold.

**A state machine has two roles in DiagramatixMINER.**

**1. The reference — your single source of truth.** A state-machine diagram is made of **state** nodes (plus an **initial** and a **final** marker) joined by **transition** connectors, each labelled with the event that triggers it. Together they encode a rulebook: which states exist, where a case is allowed to **start**, where it may legitimately **end**, and which state-to-state moves are **permitted**. This is the model conformance scores reality against — the single source of truth for the entity's states and transitions.

**2. The discovered candidate — what actually happened.** DiagramatixMINER also *mines* a state machine from the log's state column (**Discover the state machine**): the observed states become nodes and the observed moves become transitions, each labelled with its triggering activity. This is a proposal of the lifecycle reality reveals — handy for spotting states or transitions you didn't know existed, and you can edit it and promote it to become your reference when you don't already have one.

**No reference yet? Create a draft.** If your project has no reference state machine, the **Conformance** panel offers **＋ Create draft reference** — it scaffolds one from the mined lifecycle in a single click and selects it, so you're never stuck at a dead end. Because that draft mirrors what the log actually did, it will conform almost perfectly at first — that's expected. The real work is to **edit it into your rulebook** (use the **edit reference →** link): prune the transitions and exits that *shouldn't* be allowed. The moment you remove a move and re-check, the cases that took it light up as **undocumented** — and you have a governed source of truth, authored from reality and tightened to your policy.

**How the reference is used.** Conformance replays every case's real sequence of states against the reference, matching by **label** (the log's status values line up with the diagram's state labels). Where reality departs from the rulebook, it reports a deviation — an **undocumented transition** (a move the reference forbids), an **unknown state**, an **unexpected entry or exit** (a case that started or ended somewhere the reference doesn't sanction), or a **dead transition** (a rule that's allowed but never actually used). The headline **fitness %** is simply the share of cases whose whole lifecycle was legal.

In short: the **BPMN** shows you the flow, but only the **state machine** can tell you whether the entity's lifecycle obeyed the rules — and, by swapping a permissive reference for a stricter one, *exactly which rule was broken and how often*.

### The lifecycle & conformance check
Because these processes are really the **lifecycle of an entity**, DiagramatixMINER also reads the **state** column and proposes a candidate **State Machine** — the states the entity actually passed through and the transitions between them, each labelled with the activity that triggered it. Like the BPMN, it's an editable diagram you can promote into a reference.

**Conformance** is the governance payoff. Pick a **reference State Machine** — the drawn diagram that is your single source of truth for the states an entity may occupy and the transitions that are *allowed*. DiagramatixMINER replays every case's real state changes against it and reports a **fitness %** (the share of cases whose whole journey is legal) plus a **deviation table**:

- **Undocumented transition** — a state change that happened in reality but isn't allowed by the reference.
- **Unknown state** — an observed state your reference doesn't define (often a naming mismatch — the labels must line up).
- **Unexpected entry / exit** — cases that started or ended somewhere the reference doesn't sanction.
- **Dead transition** — a transition your reference allows that **never actually occurs** (a coverage gap, or a rule nobody uses).

Each deviation is weighted by how many cases it affects, so you see the *material* gaps first — the difference between the process you published and the one people run.

### The digital twin — calibrate & simulate
This is where mining meets the Simulator. Press **▶ Calibrate & simulate** and DiagramatixMINER writes the numbers it mined from the log straight onto the discovered BPMN and hands you a ready-to-run study:

- **Task durations** — a distribution fitted from each activity's real timings (a fixed value when it barely varies, a triangular *min/typical/max* when it does).
- **Arrivals** — how often new cases actually start, fitted from the gaps between case start times.
- **Gateway odds** — each branch's probability taken from how often that path was really taken.
- **Teams & capacity** — a mined team per resource, sized by the most cases that resource handled at once.
- **Working hours** — a calendar derived from *when* the work actually happened, so the twin runs on realistic shifts, not 24/7.

The console then jumps straight into the **Simulator** on the calibrated model. Because the parameters came from reality, the baseline is a *credible* as-is twin — a sound footing for designing **to-be** variants and comparing them with everything the Simulator offers (scenarios, calendars, as-is/to-be comparison, run history). Improve the process there, then re-mine a fresh log later to confirm the change landed. That's the whole loop: **mine → simulate → improve → conform**.

### Walkthrough — the Accounts Payable sample
The fastest way to see the whole loop is the built-in **Accounts Payable — Invoice Lifecycle** sample. It needs no data, no setup, and no modelling — three clicks take you from an empty account to a discovered process, a quantified conformance gap, and an animated, reality-calibrated simulation.

**Load it.** Open the **File** menu → **Process Mining Examples**. The gallery lists ready-made studies; the Accounts Payable card shows *200 cases · 10 variants · 2 references*. Click **▶ Load & open**. Diagramatix copies the example into a brand-new project of your own — its two reference state machines plus the sample event log — and drops you into the **⛏ DiagramatixMINER** console (after a brief intro) with the log **already loaded in the Import panel**. You don't need a CSV of your own to try everything. Nothing you already have is touched.

**1. Confirm the analysis, then import.** The **Import an event log** panel is pre-filled with the sample: the columns are mapped (Invoice ID → case, Activity, Timestamp, Invoice Status → state, Resource) and a verification summary shows *200 usable · 0 dropped*, the detected timestamp format and date range, and sample values so you can see the mapping is right. Review it, then click **Import log**. The run *Accounts Payable — January 2026* appears in **Mining runs** — click it for the summary: ~200 **cases**, ~990 **events**, 8 **activities**, 7 **states**, 10 **variants**, about a month's span.

**2. Discover the process.** Under **Discover the process**, leave the **detail** slider on *all paths* (or drag it right to hide the rarest routes) and click **⚙ Discover process**. Diagramatix builds the BPMN the log implies — tasks for each activity, exclusive gateways at every branch, the rework loop, and the cancel branch — as a real, editable diagram. Click **Open discovered diagram →** to see it on the canvas; connector labels show how often each path was taken.

**3. Discover the lifecycle.** Click **⚙ Discover state machine** to infer the entity's lifecycle — the states an invoice passed through and the events that moved it between them — as a candidate diagram you could edit and adopt as a reference.

**4. Check conformance.** Under **Conformance vs the reference**, pick **AP Invoice Lifecycle (Reference)** from the list and click **✓ Check conformance**. Diagramatix replays every invoice's real state changes against that reference and reports a **fitness** score — here about **90%** (roughly 181 of 200 cases replay cleanly). The only deviations are *unexpected-exit*: invoices still in flight (not yet Paid or Cancelled) when the log was cut. Reality matches this permissive lifecycle.

**5. See a policy gap.** Now switch the picker to **AP Invoice Lifecycle (Strict — no rework)** and check again. This stricter reference forbids resuming a held invoice, so fitness drops to about **72%** and a new top deviation appears: **✕ undocumented transition — On Hold → In Progress — ~39 cases**. That is the classic process-mining finding: your published policy says this can't happen, but the log proves it happened dozens of times. Toggling the two references shows the exact cost of the rework loop.

**6. Calibrate & simulate.** Under **Simulate a digital twin**, click **▶ Calibrate & simulate**. Diagramatix writes the numbers it mined from the log onto the discovered process — task durations, arrival rate, gateway odds, a team per resource, and a working-hours calendar — builds a study with an *As-mined baseline* scenario, and hands you straight into the **Simulator** on that calibrated model.

**7. Run & replay.** In the Simulator, run the baseline, then open **Replay**: invoices animate as tokens flowing through the discovered process over a slowed clock, banking up wherever the mined durations and staffing create a queue. Because every parameter came from the real log, this is a *credible* as-is twin — a sound footing for designing and comparing **to-be** improvements.

That's the full loop — **mine → discover → conform → simulate → improve** — on real data, with no preparation. When you're ready, do the same with your own CSV: **⛏ DiagramatixMINER → Import an event log**.

## [37] Risk & Controls (GRC)  `(risk-controls)`

### What Risk & Controls does
**Risk & Controls** puts **governance, risk and compliance (GRC) on the model**. Instead of keeping a Risk-Control Matrix in a separate spreadsheet that drifts from reality, you attach **Risks** and the **Controls** that mitigate them directly to the real steps of your process — then export the auditor's matrix straight from the diagram.

A catalog holds seven kinds of GRC object: **Risk, Control, Policy, Regulation, Audit Finding, KRI** (key risk indicator) and **KPI** (key performance indicator). They're joined by a **traceability graph** — a control mitigates a risk, a policy is enforced by a control, a regulation is satisfied by a policy, and so on — so you can trace any obligation from the rule that demands it down to the step that carries it.

Open it from a project's action menu — **Risk & Controls** — to manage the catalog, or work with individual risks and controls right on a diagram in the Properties Panel.

### KRIs vs. KPIs — what's the difference?
Both are indicators, but they answer different questions. A **KPI (key performance indicator)** measures **performance** — is a process meeting its target? It's usually **lagging**: it reports what has already happened. A **KRI (key risk indicator)** measures **exposure to a risk** — how likely something is to go wrong — and is ideally **leading**: an early warning *before* the harm lands.

- **KPI** — *“Are we hitting our targets?”* e.g. invoices processed per day, average approval time, on-time delivery %.
- **KRI** — *“Is a risk building toward trouble?”* e.g. % of overdue controls, staff turnover in a critical team, transaction error rate, transactions over a threshold.

The **same underlying metric can be both**, depending on how you frame it — *loan processing time* is a KPI when you ask “are we fast enough for the SLA?”, and a KRI when you ask “is it creeping toward a breach?”. A good KRI carries a **threshold and tolerance** (green / amber / red) so crossing it triggers action — that's what makes it an early warning rather than just a number.

In the catalog this shows up in how they link: a **KRI *monitors*** a Risk or Control, while a **KPI *measures*** a Control or Risk. Attach them to the relevant steps so the exported matrix and the Analytics tab can report against them.

### The catalog — org master vs. project copy
Like Entity Lists, the catalog follows an **org-master → project-copy** pattern:

- The **organisation** maintains a **master library** — the canonical set of risks, controls and policies everyone starts from.
- Each **project adopts a copy** it can edit independently. Adopting clones the master's items and the links between them into the project, so a project's tweaks never disturb the master or another project.

Because a project holds its **own** copy, teams can add project-specific risks or refine a control's wording without asking, while the org master stays the single reference.

### Org-wide numbering & the Org Owner
Every item carries a short **code** — `R-001` for the first risk, `C-001` for the first control, then `P-` policies, `REG-` regulations, `AF-` audit findings, `KRI-` and `KPI-`.

Codes are **organisation-wide**: there is a single running sequence per kind across **all** of the org's projects, so the same control reads the *same code everywhere* it appears. Create a new risk in one project and it continues the org's risk sequence — it won't clash with a risk of the same number in another project.

**Org Owner.** Numbering is driven by the project's **Org Owner** — the organisation the project belongs to — shown as a small chip in the project header. Everyone can see it; **only a SuperAdmin can change it** (via the picker in the header). Reassigning a project to a different Org Owner moves it onto that org's numbering sequence.

> If you're a SuperAdmin bringing older projects onto org-wide numbering, run `scripts/renumber-org-rcm-codes.ts` once — it renumbers an org's whole catalog consistently (shared controls keep one code) and updates the codes shown on every diagram. It's safe to re-run.

### Attaching risks & controls to a step
Select an element on a diagram and open the **Risk & Controls** section in the Properties Panel (it sits below Simulation and is collapsed by default). From there, attach any risk or control from the project's library to that step.

A step remembers what's attached by **id**, with the code and label cached for display — so the step keeps showing the right risks and controls, and the exported matrix can resolve them, even if a label is later reworded.

**See the risks and controls at a glance.** While the Risk & Controls section is open, the canvas highlights every step that carries a **Risk with a red ring** and every step that carries a **Control with a green ring** (a step with both gets both rings). Collapse the section and the rings disappear — a quick way to read the risk-and-control landscape of the whole process without clicking through each step.

### The console — Catalog & Analytics
The **Risk & Controls console** has two tabs:

- **Catalog** — the editor: add, edit and link risks, controls, policies and the rest; adopt the org master; export the matrix.
- **Analytics** — an at-a-glance dashboard of the project's GRC posture: how many of each kind you hold, **control coverage** (which risks have a mitigating control and which are gaps), **inherent vs. residual** risk posture by band (high / medium / low), the mix of **control types** (preventive / detective / corrective) and **automation** (manual / automated), how much of the catalog is actually **attached to the model**, and **operating-effectiveness** across your controls.

The analytics update live from what's in the catalog and on the model — no separate report to run.

### Coverage & segregation-of-duties checks
Two governance checks run alongside the normal diagram issue scanner and flag the offending steps:

- **Control coverage** — a step that carries a **Risk with no mitigating Control** is flagged as a coverage hole.
- **Segregation of duties** — a lane that performs both a *create/raise* activity **and** an *approve* activity is flagged, because one team shouldn't do both.

Fixing these before an audit is far cheaper than explaining them during one.

### Proving controls actually operate (from mining)
A control on paper isn't the same as a control that *works*. Risk & Controls ties each control to **real execution data** from **DiagramatixMINER**:

- If a mining run reports **governance evidence** for the control's code, effectiveness is `applied ÷ expected` cases.
- Otherwise, a control can name the **conformance deviation** it guards; when a run shows that deviation in N of M cases, the control was **bypassed** N times.

Either way you get a plain **“bypassed in N of M cases”** figure against the control — evidence, from the process you actually ran, that the control is (or isn't) operating.

### Exporting the Risk-Control Matrix
**Export** produces the multi-sheet Excel workbook auditors expect: a flat **Audit Grid** (one row per Activity × Risk × Control with the assurance columns), the **RCM**, a **Control Register** (with operating-effectiveness where a mining run is available), a **GRC Register**, a **Traceability** sheet, and a **Coverage Summary**.

Framework references such as **SOX** or **ISO 27001** travel with each control as metadata, so the export shows which external obligation every control satisfies.

### Ready-made examples
Not sure where to start? Adopt the **Order-to-Cash** GRC example — a complete process with risks and controls already attached to the real steps, plus a bundled mining run so control operating-effectiveness lights up the moment you adopt it. Explore it, then adapt it to your own process.

## [38] Process Classification (APQC PCF)  `(pcf)`

### What the APQC PCF gives you
The **APQC Process Classification Framework® (PCF)** is a recognised industry taxonomy of business processes — a five-level hierarchy from broad **Categories** down through **Process Groups**, **Processes**, **Activities** and **Tasks**. Diagramatix ships the **Cross-Industry** framework plus industry variants (Banking, Healthcare, Retail, Telecommunications, Utilities and more).

Classifying your models against the PCF lets them **speak the recognised language** of your industry, seeds real structure for you, grounds AI generation on the standard, shows **coverage** (what you've modelled vs. gaps), and — uniquely — lets you build your **own governed, upgradeable framework** on top of the standard.

Browse it any time from **SuperAdmin/OrgAdmin → Process Classification (APQC PCF)**.

### Classifying a diagram
Open a diagram, click empty canvas so nothing is selected, and in the **Diagram Properties** panel use **Classify against APQC PCF** — pick a framework and search for the standard process this diagram represents (by code, by name, or both, e.g. `1.1.1 Assess the external environment`).

The classification is remembered by APQC's **stable process id**, so it survives framework version updates. The chosen code, name and framework are shown on the panel; **Change** or **Clear** at any time.

### Create APQC Project
On the Dashboard, **◎ Create APQC Project** (next to *New Project*) spins up a project whose **folder structure mirrors a chosen PCF branch**. Pick a framework, optionally a **root process**, and a **depth** — with a root, depth is relative to it (e.g. *2 levels below*); without one, it's absolute from Categories. The APQC settings are saved on the project and become the defaults when you generate diagrams inside it.

### Create APQC Process — one-click generation
On the project screen, **◎ Create APQC Process** turns a standard process into a real BPMN model in one click:

- Choose a framework (defaults to the project's) and search for the process; the search is pre-filled from the folder you're in.
- A **higher-level** process **decomposes** — each child activity becomes a **Collapsed Sub-process**, laid out Start → … → End.
- A **Task-level** process is **AI-generated** into a detailed model, grounded on the APQC branch.
- Tick **APQC numbering** to prefix every task / sub-process label with its APQC code; the code is also stored on the element and shown in its Properties.

The new diagram is tagged with the APQC reference and dropped into the current folder.

### Coverage — what's modelled vs. gaps
From a project's **Properties** panel (top folder selected), **View APQC coverage** shows, for the project's framework or branch, which PCF processes are **modelled** (have a classified diagram) and which are **gaps** — a headline percentage, per-category bars, and a drill-down tree with ✓ modelled / ◐ partial / ○ gap markers and links to the modelling diagram. A **gaps-only** filter hides everything you've already covered.

### Compliance by APQC category
In the org-wide **Compliance Monitoring** console, the **By APQC category** view rolls **control operating-effectiveness** and **conformance fitness** up by the APQC category each project is aligned to (via its linked framework root) — worst-first, with below-threshold flags. It ties the standard directly to your live process models and mined execution data.

### Building your own tailored framework
Beyond classifying against the standard, an org can **compose its own framework**. In **Process Classification (APQC PCF)**, use **New tailored framework**, then:

- **Compose** branches from any reference variant(s) — every copied node keeps its **provenance** back to APQC (so attribution holds and it can be upgraded).
- **Extend** with your own **custom** processes.
- **Curate** — rename to your terminology (keeps the link to the standard), hide what's irrelevant, set your own codes, and remove.
- Scope a framework to a business unit with a **division**.

### Staying current — the upgrade wizard
When APQC releases a new version, a SuperAdmin imports the newer workbook (it supersedes the previous version, which is kept for history). On the reference framework, **⭫ Version upgrade** shows a **diff** — added / renamed / removed processes — and **your usage impact** (how many classified diagrams and tailored nodes are affected, and how many point at removed processes). **Apply** re-points your classifications and tailored-framework provenance to the new version by the stable process id; anything removed is **flagged**, not silently broken.

### Attribution & licence
Diagramatix uses APQC's PCF® under APQC's **royalty-free licence**, which permits copying, modifying and redistributing the framework provided **APQC's notice travels with every copy and derivative**. The notice is preserved on every framework (including your tailored ones) and is **automatically included in any export that carries PCF content** (project and single-diagram JSON/XML, and the public process view). *Process Classification Framework* and *PCF* are registered trademarks of APQC.

## [39] Project Numbering  `(project-numbering)`

### What Project Numbering does
**Project Numbering** gives a whole project a consistent set of hierarchical codes — on its **folders**, **diagrams** and **activities** — so every process step has a stable reference. You choose between keeping your **APQC** structure or renumbering the project **from the root**, and you always **preview every change** before anything is written.

Open it from the **Project Properties** panel (select the top of the project in the navigation tree) → **Process Numbering** → **Configure / Renumber…**.

### Two modes
**APQC-preserving** *(APQC projects only)* — keeps the APQC folder structure and diagram names exactly as generated, and renumbers each diagram's **activities** contiguously. Steps you've added outside the framework are numbered after the APQC ones, and gaps left by deleted APQC steps close up automatically. APQC numbers stay **bare** (e.g. `…10`, `…11`) and always sort correctly.

**Full renumber** — renumbers the whole project from the root: folders, diagrams and activities. Codes follow the pattern **`PREFIX` + top-level number, then dotted levels** — for example `ABC2.3.1.4`. The **prefix** is 0–3 uppercase letters you set once for the project. Each level uses a **single digit up to 9**, then **two digits (zero-padded)** once there are 10 or more items at that level.

### Preview and confirm
Click **Preview renumber…** to see every affected folder, diagram and activity as **old → new**. On the first run the old value is *(none)*; on an APQC renumber it shows the existing APQC number. Activities are marked APQC vs non-APQC.

Nothing is changed until you click **Confirm renumber**. **Cancel** or **Back** discard the preview with no effect. Re-running later is safe — if nothing has changed, the preview is empty (codes never stack up).

### Where the codes appear
- **Activities** show their code on the **first line** of the step, above the activity name.
- **Diagram** names are prefixed with the diagram's code.
- **Folder** names are prefixed with their code (full renumber only).

### Show non-APQC
For an APQC project, the **Show non-APQC (highlight)** toggle (on the same Process Numbering panel) reveals everything that was added **outside** the APQC framework, highlighted in the **APQC colour**:

- non-APQC **folders and diagrams** are highlighted in the **navigation tree** and on their **tiles**;
- non-APQC **activities** get a highlight ring on the **diagram canvas**.

It's a quick way to see what's been extended beyond the standard.

## [40] Process Portal  `(process-portal)`

### What the Process Portal is
The **Process Portal** (open it from **📚 Portal** in the dashboard header) is the place everyone in your organisation goes to **find a process** — without needing to know which project it lives in or having edit access to it.

It is **search-first**: type what you're looking for and the matching published processes appear, or narrow down with the browse facets on the left. Opening one lands you in the clean, read-only viewer with the current published version.

**Access-scoped, always.** The Portal only ever shows processes you already have permission to open — the published diagrams in projects you own or are shared, plus any published to you in a bundle. It makes those easy to *discover*; it never exposes anything new.

### Searching & browsing
**Search** matches a process by its name, its owner, its APQC classification, and the systems and teams it involves — so typing *“SAP”* or *“Marketing”* finds the processes that touch them.

**Facets** down the side let you narrow by:

- **Type** — BPMN, State Machine, ArchiMate, and so on
- **Owner** — the Diagram Owner accountable for the process
- **APQC category** — where the process sits in the classification framework
- **Review status** — Current, Due soon, or Overdue for its scheduled re-review

Every facet shows a live count, and they **combine** — pick a type, then an owner, then a category to zero in. A card shows the process name, type, owner, version, review badge and a link to its procedure; click it to read the process.

### Find processes by system or team (where-used)
The Portal also answers the two questions people ask most:

- **“Which processes use IT System X?”** — filter by the **IT System** facet (or just search the system's name).
- **“What is my team involved in?”** — filter by the **Team / Role** facet.

Diagramatix reads the **pools, lanes and system shapes** on each published process and matches those names to your **Org Entity Lists** (the governed catalogue of teams, roles and IT systems). Matching is exact, and it **rolls up**: pick a team like *Marketing* and you also get the processes that only name a role beneath it (e.g. *SEO Specialist*).

Names that aren't in your Entity Lists still appear — flagged as **“uncatalogued”** — so a process is never hidden, and you can see at a glance which labels are worth adding to the catalogue.

### “Involving me” & Team Membership
Turn on **👤 Involving me** and the Portal shows just the processes that reference a **team or role you belong to** (or any role beneath it) — your personal process view.

**Who sets this up.** Team membership is **admin-managed**, not self-service. An **OrgAdmin** assigns members to teams/roles for their own organisation (a **SuperAdmin** can do it for any organisation) from the **Team Membership** page — reached from the **Org Admin** menu (or the SuperAdmin dashboard). Pick a member, tick the teams/roles they belong to from your **Org-Structure Entity List**, and you're done.

> No Org-Structure list yet? Create one under **Entity Lists** (Teams and Roles), then assign members. Until then, the entity facets simply list the raw names used on your diagrams.

### The primary procedure document
A process model is clearer alongside its written **procedure (SOP)**. On any diagram, open **Diagram Properties → Procedure Document** and paste a link — a SharePoint/OneDrive file, an intranet page, or any URL — with an optional display name.

Once published, that link shows as a prominent **📄 Procedure** on the process card in the Portal and in the read-only viewer, so a reader always has the diagram and the words together. The link travels with the diagram — it's part of the versioned publish snapshot and the diagram export.

### Review-due reminders
Process maps go stale silently unless someone is nudged to check them. When you publish a diagram (or a bundle), you can set a **next-review date** or a **review cadence**.

Diagramatix runs a **daily check** and, when a published process passes its review date, sends a **“review due”** notification to the **Diagram Owner** (for a bundle, the publisher) — once per review cycle, so it reminds without nagging. The same status shows as the **Review** badge in the Portal, so overdue processes are easy to spot and clear.

## [41] Organisation Hierarchy  `(org-hierarchy)`

### What the Organisation Hierarchy is
Every project has an **Organisation Hierarchy** — the governed list of **Organisation → Org Unit → Team → Role** that supplies the names for your BPMN **pools and lanes**. Open it from **Project Structure** in the left panel of the project page.

You can fill it three ways: **Adopt** a ready-made structure from your organisation, build it by hand, or — new — **Populate from BPMN**: derive it automatically from the diagrams you've already drawn.

### Populate from BPMN
Click **Populate from BPMN** (next to Adopt) and give the structure a name. Diagramatix reads **every BPMN diagram in the project** and builds the hierarchy from the way you've drawn your pools and lanes:

- a **white-box Pool** → an **Organisation**
- a **Lane** inside it → an **Org Unit**
- a **Sub-lane** inside that → a **Team**

Names are **deduped** across the whole project — if five diagrams all have a *Finance* lane, you get **one** Finance Org Unit. Black-box pools (external participants and systems) are left out of the hierarchy.

It is **non-destructive**: the result is **merged** into whatever structure the project already has. Existing entries are kept untouched, and anything the tool adds is treated as your own addition — so a later **Sync updates** never removes it.

> No pools or lanes in your diagrams yet? The action simply reports that nothing new was found and leaves your structure unchanged.

### Refine by moving entries between levels
The extracted hierarchy is a starting point — tidy it up right in the editor. Hover any entry and use the small controls:

- **◀ Promote** — move an entry **out** one level (e.g. a Team becomes an Org Unit). It moves up under its grandparent.
- **▶ Demote** — move an entry **in** one level, nesting it under the entry above it.
- **▲ / ▼** — reorder an entry among its siblings.

When you promote or demote, **the whole branch comes with it** and re-levels automatically, so the hierarchy always stays consistent (Organisation → Org Unit → Team → Role). You can also add a child, rename, or delete an entry as before.

These same controls are available wherever the hierarchy editor appears — including the organisation-wide **master** structures under **Admin → Entity Lists** — so you can refine there too.

## [42] Importing another vendor's BPMN diagram  `(import-competitor-bpmn)`

### Why this exists
Diagramatix lays BPMN out its own tidy way: **pools are stacked as full-width horizontal bands**, and **message flows run vertically** between elements that line up. Diagrams drawn in other tools often don't follow those conventions — pools can be any size or sit **side by side**, and messages are drawn **rectilinearly** between elements that aren't lined up at all.

If you just pasted such a diagram in, Diagramatix would flag it with layout warnings and quietly re-stack the pools and straighten the messages. **Free-form / imported layout** turns that off, so a competitor's diagram can be shown — and kept — exactly as it was drawn.

### The “Free-form / imported layout” switch
On any BPMN diagram, open **Diagram Properties** and tick **Free-form / imported layout**. While it's on:

- **Pools** can be any size and sit anywhere — including side by side — and they no longer snap to a full-width stack when you move or resize one.
- **Message flows** can be **rectilinear** (drawn with right-angle bends, like a sequence flow) and can connect two elements that are **not** vertically aligned.
- The **layout warnings** that enforce Diagramatix's own conventions (pool stacking, lane tiling, overlaps, message alignment) are **suppressed** for this diagram, so an imported model isn't buried in red flags.

It's a per-diagram setting — turn it off again and the normal rules (and warnings) come straight back. Everything else about the diagram stays fully editable.

### Reproducing a diagram from an image
The fastest way to bring in another tool's diagram is a **picture of it**:

1. Open **AI Generate**, and **attach an image** of the diagram (PNG, JPEG, etc.).
2. Leave **Reproduce original layout** ticked (it appears under the attached image).
3. Generate the plan, review it, and **Apply**.

Diagramatix reads the picture and rebuilds the model **at the positions it was drawn** — pools, lanes, tasks, gateways, events and the connectors between them — turning on Free-form / imported layout automatically. A clean-up pass lines up columns, fits lanes to their pool and keeps each element in the right pool, so the result is tidy rather than a jittery trace.

> **Tip:** the AI's placement is only as good as what it can see. Review the applied diagram and nudge anything that landed slightly off — because it's a normal diagram, you can move pools and elements freely without the editor fighting you. If the picture is too rough to place precisely, the import still succeeds using Diagramatix's clean auto-layout instead.
