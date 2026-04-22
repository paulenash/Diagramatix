# Diagramatix Product Test Cases

**Version:** Schema 1.8, app 1.8.x (as of 2026-04-23)
**Scope:** Whole product — all diagram types (BPMN Process / Communication / Hybrid, State Machine, Value Chain, Domain / Database, Context, Process Context, Basic flowchart), AI generation across types, admin features, projects / folders / sharing, and cross-cutting editor functionality.

Each test case follows the pattern **ID · Description · Preconditions · Steps · Expected Result**. Pass/Fail columns can be added when executing.

Rules referenced below (e.g. R42, R50) map to the BPMN layout rules documented in **Dashboard → System → AI Rules & Preferences** (BPMN category, Groups 7–12).

---

## 1. BPMN Process Diagrams

Core single-pool process flows with tasks, events, gateways, and sequence connectors.

### 1.1 Elements

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-E-001 | Create Start Event | New BPMN diagram | Drag **Start** from palette to canvas | Circle with thin border; label below; full 36×36 size |
| P-E-002 | Create Intermediate Event | New BPMN diagram | Drag **Intermediate** from palette | Double-circle; label below |
| P-E-003 | Create End Event | New BPMN diagram | Drag **End** from palette | Circle with thick border; label below |
| P-E-004 | Create Task | New BPMN diagram | Drag **Task** from palette | Rounded rectangle; label centred inside |
| P-E-005 | Create Subprocess | New BPMN diagram | Drag **Subprocess** from palette | Rounded rectangle with **+** marker |
| P-E-006 | Create Expanded Subprocess | New BPMN diagram | Drag **Expanded Sub** from palette | Large rounded rectangle with label at top |
| P-E-007 | Create Gateway | New BPMN diagram | Drag **Gateway** from palette | Diamond shape; default label `Test?` (R41) |
| P-E-008 | Create Data Object / Store / Annotation / Group | New BPMN diagram | Drag each | Correct shape; label placement |
| P-E-009 | Palette order | New BPMN diagram | Open palette | Order matches palette definition |

### 1.2 Event Type Conversion

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-ET-001 | Start ↔ Intermediate ↔ End conversion | Event on canvas | Properties → Element dropdown | Converts in place; label & connectors preserved |
| P-ET-002 | Incompatible trigger cleared | End event with Terminate trigger | Convert to Start | Terminate cleared |
| P-ET-003 | Non-interrupting label detection (R46) | AI-generated event with label containing "non-interrupting" | Observe | `interruptionType = non-interrupting` set automatically; dashed circle rendered |

### 1.3 Connectors — Sequence

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-C-001 | Click-to-connect via 3-state protocol | Two tasks on canvas | Click source task → click same task again (no drag) → drag to target | Orange dashed ring on source during drag; sequence connector created on release |
| P-C-002 | No sequence TO Start Event (S1) | Task + Start Event | Drag connector from task to start event | Rejected or auto-converts to Intermediate |
| P-C-003 | No sequence FROM End Event (S3) | End Event + Task | Drag connector from end event to task | Rejected or auto-converts to Intermediate |
| P-C-004 | No connector to/from Event Expanded Subprocess (R48) | Event subprocess + task | Drag from task to event subprocess (or vice versa) | Rejected (broadens prior sequence-only rule to cover all types) |
| P-C-005 | Target highlighting | Dragging a sequence connector | Move cursor over various elements | Green outline on valid, red on invalid |
| P-C-006 | Event connector uses nearest side (R53) | Start event to task on its LEFT | Create connector | Start event exits LEFT toward task (not right+wrap-around) |
| P-C-007 | Boundary intermediate event outer exit (R47) | Intermediate event mounted on host top edge | Create outgoing connector | Connector exits from event's TOP point (furthest from host edge) |

### 1.4 Force-Connect Override

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-FC-001 | Enter force-connect mode | BPMN diagram, two tasks | Shift+Ctrl+Click task A | Orange banner "Force Connect: click target element" |
| P-FC-002 | Complete force-connect | Force mode active | Click task B | Sequence connector A→B created |
| P-FC-003 | Force-connect bypasses rules | Start event A, end event B | Shift+Ctrl+Click start → click end | Connector created despite S1/S3 |
| P-FC-004 | Escape cancels | Force mode active | Press Escape | Banner disappears; no connector |
| P-FC-005 | Disabled outside BPMN | State Machine / Value Chain / etc. | Shift+Ctrl+Click element | No banner |

### 1.5 Auto-Connect

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-AC-001 | Auto-connect left neighbour | Task A on canvas | Drop Task B right of A | Sequence A→B auto-created |
| P-AC-002 | Auto-connect vertical | Task A on canvas | Drop Task B directly below | Vertical connector A→B |
| P-AC-003 | Decision gateway precedence | Decision gateway + tasks | Drop new task | Gateway wins as source |
| P-AC-004 | Never TO Start / FROM End | Respective sources | Drop new element | No auto-connect |
| P-AC-005 | Never to/from Event Expanded Subprocess (A3 / R48) | Event subprocess on canvas | Drop new task near it | No auto-connect |
| P-AC-006 | R27/R28 excludes event sub candidates | Outer sub with boundary start + task + embedded event sub | Observe auto-connect from boundary start | Connects to task, NOT to event sub |

### 1.6 Gateways

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-G-001 | Gateway type switch | Gateway on canvas | Properties → Element → Parallel / Inclusive / Event-based | Correct marker inside diamond |
| P-G-002 | Decision/Merge auto-classification (R33/R34) | Gateway with 2+ outgoing | Observe | gatewayRole = "decision"; merge role set for 2+ incoming |
| P-G-003 | Decision label placement (R42) | Exclusive gateway with 2 outgoing | Connect Yes/No | Label left-edge +6 px right of connector; top exit bottom-of-label 10 px above gateway top point; right-middle exit left-edge +3 px right of gateway right connection point |
| P-G-004 | 4+ branch side assignment (R45) | Decision gateway with 5 branches | Observe | Side sequence: top, right, bottom, bottom, bottom; merge mirrors top, left, bottom, bottom, bottom |
| P-G-005 | Asymmetric branch Y stacking (R45) | Decision with n=5 branches sharing column | Observe positions | 1st above, 2nd level, 3rd/4th/5th stacking downward |
| P-G-006 | Nested gateway Y alignment (R44) | gOuter → tA (top) → gInner → ... | Observe gInner Y | gInner Y equals tA centre-Y; gInner's paired merge same |
| P-G-007 | Nested branch re-stacking (R55) | gInner's branches in same column | Observe | Branches centred around gInner's (moved) Y, not pool centre |
| P-G-008 | Merge incoming sides (R35/R36/R37) | Merge with sources at different Y | Observe | Topmost → top, middle(s) → left, bottommost → bottom |

### 1.7 Subprocesses

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-SP-001 | Task ↔ Subprocess convert | Task on canvas | Properties → Convert → Subprocess | Type changes; size preserved |
| P-SP-002 | Subprocess type (Element dropdown) | Expanded sub | Properties → Element → Normal / Event / Call / Transaction | Type changes; Event enables event-sub behaviour |
| P-SP-003 | Nested expanded shade lightening | 3-level nested subs | Observe colours | Each nested level 25% lighter |
| P-SP-004 | Drop element into expanded sub | Drag task over expanded sub | Hover | Orange border flashes |
| P-SP-005 | Drill into collapsed subprocess | Collapsed sub with linked diagram | Double-click + marker | Opens linked diagram |
| P-SP-006 | Internal Start/End inset (R51) | Expanded sub with internal start/end events | Observe centres | 1.5 × event width from left (Start) and right (End) edges |

### 1.8 Event Expanded Subprocesses

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-EV-001 | Auto-detect from label | AI plan with "event subprocess" in label | Apply Layout | subprocessType = "event" |
| P-EV-002 | Fallback detection via non-interrupting child | Sub-expanded with non-interrupting start event child, no explicit type | Apply Layout | Classified as event sub (R46 heuristic) |
| P-EV-003 | Wrapped in normal outer (R29) | Event sub at pool level | Apply Layout | Layout injects wrapping normal sub |
| P-EV-004 | Auto-inject internal start/end (R30) | Event sub missing either | Apply Layout | Non-interrupting start + end injected |
| P-EV-005 | Stacked at bottom of outer (R49) | Outer normal sub with 2 event sub children + normal tasks | Apply Layout | Event subs stacked at bottom with 20 px gaps; normal tasks in grid above |
| P-EV-006 | No connectors to/from event sub (R48) | Plan contains connector touching event sub | Apply Layout | Connector stripped; applies to sequence AND message |
| P-EV-007 | Outer with event subs — boundary Start/End placement (R50) | Outer sub has embedded event sub + boundary Start + boundary End | Apply Layout | Boundary Start on LEFT edge, End on RIGHT edge, both Y-aligned with their connected task |
| P-EV-008 | Outer with event subs — internal Start/End in top row (R50) | Outer sub has event sub + internal Start + internal End | Apply Layout | Internal Start near left of top row, End near right of top row, grid children shift down one row |

### 1.9 Boundary Events

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-BE-001 | Mount on subprocess edge | Expanded sub on canvas | Drag event to edge | Snaps; boundaryHostId set; boundarySide stored |
| P-BE-002 | Size matches standard event | New boundary event from palette | Inspect | 36×36 (no 75% shrink) |
| P-BE-003 | Outer-facing exit (R47) | Intermediate event on host top | Create outgoing connector | srcSide = "top" (away from host) |
| P-BE-004 | Move with host | Boundary event on task | Move task | Event follows |
| P-BE-005 | No auto-connect from boundary end into event-sub (R27/R28 exclusion) | Boundary end on outer sub containing event sub + normal task | Observe | Auto-connect picks normal task, NOT event sub |

### 1.10 Data / Annotation Associations

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-DA-001 | Task → Data Object association | Task + data object | Drag connector | Dotted `associationBPMN` with arrowhead on data object |
| P-DA-002 | Data object ignores obstacles | Association between data object and task, elements moved across | Move elements across | Waypoints unchanged; renders on top |
| P-DA-003 | AI Generated annotation on Start Event (R56) | AI-generated BPMN with promptLabel set | Apply Layout | Text annotation labelled "AI Generated\n<prompt name or first 100 chars>" attached via association to pool-level Start Event |
| P-DA-004 | Annotations allowed outside pool | Annotation positioned above pool | Observe | R57 does not resize pool for annotations/groups; they float freely |

---

## 2. BPMN Communication / Collaboration Diagrams

### 2.1 Pools & Lanes

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| C-PL-001 | Create Pool | New BPMN diagram | Drag Pool to canvas | Pool created at drop position; default size |
| C-PL-002 | Toggle White-box / Black-box | Newly created pool | Properties → Element | Switch; white-box shows **+ Add Lane**, black-box shows **System** checkbox |
| C-PL-003 | Add / delete lane | White-box pool | + Add Lane → Delete lane | Lanes resize proportionally |
| C-PL-004 | Add sublane | Lane with no sublanes | Properties → + Add Sublane | Lane split into 2 sublanes |
| C-PL-005 | Pool 4-directional resize | Pool on canvas | Hover any edge → 10 px hit-zone → ew-resize or ns-resize cursor | Drag resizes; only the dragged edge moves while opposite edge anchors |
| C-PL-006 | Lane header shares width | Pool with lanes | Inspect | Lane headers 36 px wide; label vertical centred |
| C-PL-007 | Multi-line Pool / Lane label | Pool / lane selected | Properties → Label textarea → Shift+Enter | New line inserted |

### 2.2 Pool Sizing Rules (R52 / R57)

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| C-PS-001 | Pools never overlap (R52) | AI-gen 6 black-box + 1 white-box with complex subprocess | Apply Layout | 90 px gap between all pool boundaries; no overlap |
| C-PS-002 | Pool grows to enclose pushed-up element (R57) | AI-gen with 2-level nested decision (e.g., "if c==d then D1, if e==f then E1 else E2 endif, else D2") | Apply Layout | Company pool's top expands so Task E1 stays inside bounds |
| C-PS-003 | Pool grows DOWN if needed (R57) | AI-gen with branch pushed below | Apply Layout | Pool bottom extends; last lane absorbs growth |
| C-PS-004 | Pool grows LEFT/RIGHT if needed (R57) | Element overflows horizontally | Apply Layout | Pool widens; lane widths match |

### 2.3 Message Flows

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| C-M-001 | Message flow between pools | Two pools with tasks | Drag connector across pools | Dashed message connector |
| C-M-002 | Task type auto-set Send/Receive | Task ↔ non-System Black-box | Create message | `taskType = send` (source) or `receive` (target) |
| C-M-003 | System pool sets User type | Task → System Black-box | Create message | `taskType = user`, not send/receive |
| C-M-004 | Label positioned in inter-pool gap (R39) | Message connector with label | Observe | Label centred in gap between source and target pools |
| C-M-005 | Message connector initial render | AI-generated with message flows | Open diagram | Renders correctly from first render |
| C-M-006 | Message connector ignores obstacles | Message flow between pools, unrelated element moved across | Move elements | Waypoints unchanged |

### 2.4 Process-Level Start Event Placement (R43)

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| C-SE-001 | Start Event forced to topmost lane | AI plan with Start Event in lane 2 | Apply Layout | Start Event moved to topmost lane; blue dashed border reflects |
| C-SE-002 | No lane = no override | Pool with no lanes | Apply Layout | Start Event placed at pool centre |
| C-SE-003 | Boundary/Event-sub internal starts unaffected (R43) | Various configurations | Apply Layout | Only process-level starts moved |

---

## 3. BPMN Hybrid Diagrams

Diagrams combining internal process flows with cross-pool communication.

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| H-001 | Mixed sequence & message | 2 pools with tasks | Connect within pool (sequence) and across (message) | Both coexist |
| H-002 | Decision with branch to external pool | Decision gateway, one branch internal, one to external pool | Model both | Internal = sequence, external = message |
| H-003 | Boundary event receives message | Task with intermediate boundary event | Send message from external pool to boundary event | Message flow valid |
| H-004 | AI hybrid generation (user's Sales scenario) | Prompt: "Sales Team receives email, classifies, sends to Order Processing or Sales Dept" | Apply Layout | 3 pools (Customer, Company with Sales lane, Order Processing / Sales Dept); decision gateway within Company; message flows out |

---

## 4. State Machine Diagrams

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| SM-001 | Create State | New State Machine diagram | Drag State from palette | Rounded rectangle; label centred |
| SM-002 | Initial State | Palette → Initial State | Drag | Filled black circle |
| SM-003 | Final State | Palette → Final State | Drag | Concentric circles (outer thick) |
| SM-004 | Composite State | Palette → Composite | Drag | Large rounded rectangle; can contain children |
| SM-005 | Submachine | Palette → Submachine | Drag | Rectangle with sub-marker; drill-through on double-click if linked |
| SM-006 | Fork-Join | Palette → Fork/Join | Drag | Thick bar (vertical or horizontal) |
| SM-007 | Transition connector | Two states on canvas | Click source → click source again → drag to target | Curvilinear transition with label placeholder |
| SM-008 | Guard label | Transition selected | Double-click | Label editor; enter guard expression |
| SM-009 | Curvilinear default | New transition | Observe routing | Bezier curve, not rectilinear |
| SM-010 | Transition from Initial State | Initial state + state | Connect | Transition created; label empty by default |
| SM-011 | Nested composite state | Composite with state inside | Drag | Child parented to composite; drag with parent |
| SM-012 | Fork axis flip | Horizontal fork | Properties → Flip | Swaps to vertical bar |

---

## 5. Value Chain Diagrams

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| VC-001 | Create Process chevron | New Value Chain diagram | Drag Process from palette | Pentagon (notched left, pointed right) |
| VC-002 | Create Collapsed Process | Palette → Collapsed | Drag | Chevron with **+** marker (grey = unlinked, green = linked) |
| VC-003 | Create Value Chain container | Palette → Value Chain | Drag | Rectangular container, renders behind children |
| VC-004 | Horizontal snap on drag | Process A on canvas | Drag Process B near with ≥75% vertical overlap | Snap to horizontal alignment, 10 px overlap for interlock |
| VC-005 | Nested Value Chain auto-shading | Nested chains | Observe | Each nested level 25% lighter |
| VC-006 | Drag process in/out of Value Chain | Process and container | Drag in (becomes child), Shift+drag to move outside | parentId updates correctly |
| VC-007 | Chevron theme apply (5 themes) | 2+ processes selected | Right-click → theme (Sunrise / Ocean / Garden / Berry / Earth) | Colours applied left-to-right |
| VC-008 | Description popover toggle | Process selected | Properties → Show description | Description box appears below chevron |
| VC-009 | Description inline edit | Process with description | Double-click description | Editor opens; Shift+Enter for line break |
| VC-010 | Value Analysis badge | Process selected | Properties → Value Type → VA / NNVA / NVA | Coloured badge on chevron |
| VC-011 | Cycle / wait time display | Process with times set | Properties → Value Display | Time badge shown |
| VC-012 | Bottleneck highlight on connector | Sequence connector selected | Properties → Bottleneck checkbox | Renders purple when Bottleneck Display toggle is on |
| VC-013 | Linked process drill-through | Collapsed Process with link | Double-click + marker | Opens linked diagram (typically BPMN) |
| VC-014 | No sequence connectors | Value Chain diagram | Try to connect two chevrons | Rejected or alternative — flow implied by spatial arrangement |

---

## 6. Domain / Database Diagrams

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| DM-001 | Create UML Class | New Domain diagram | Drag UML Class from palette | Rectangle with compartments (name / attributes / operations) |
| DM-002 | Create UML Enumeration | Palette → Enumeration | Drag | Rectangle with «enumeration» stereotype and value list |
| DM-003 | Add attribute | Class selected | Properties → + Attribute → name, type | New row in attributes compartment |
| DM-004 | Add operation | Class selected | Properties → + Operation | New row in operations compartment |
| DM-005 | Association connector | Two classes | Connect | Plain line |
| DM-006 | Aggregation | Two classes | Connect with aggregation type | Line with open diamond on owner |
| DM-007 | Composition | Two classes | Connect with composition type | Line with filled diamond |
| DM-008 | Generalisation | Child → Parent | Connect with generalisation | Line with open triangle at parent |
| DM-009 | Multiplicity labels | Association selected | Properties → Source/Target multiplicity | Labels render near endpoints |
| DM-010 | Role labels | Association selected | Properties → Source/Target role | Labels render near endpoints |
| DM-011 | Optimal side reattachment | Association between classes | Move a class across the connector | Sides flip to nearest; connector stays sane |
| DM-012 | Database type selection | Diagram Settings → Database | Choose PostgreSQL / MySQL / SQL Server | Applies to DDL generation |
| DM-013 | Import DDL → Domain diagram | DDL file (.sql) | Import/Export → Import DDL | Tables become classes; FKs become aggregations |
| DM-014 | Generate DDL | Domain diagram with classes and relationships | Import/Export → Generate DDL | SQL text output matches database dialect |
| DM-015 | Round-trip (generate → import) | Domain diagram → DDL → new Domain | Export DDL, import into new diagram | Structure preserved |

---

## 7. Context Diagrams

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| CTX-001 | Create Use Case | New Context diagram | Drag from palette | Ellipse shape |
| CTX-002 | Create Actor | Palette → Actor | Drag | Stick figure |
| CTX-003 | Create Team | Palette → Team | Drag | Group icon |
| CTX-004 | Create System | Palette → System | Drag | Monitor icon |
| CTX-005 | Create Hourglass | Palette → Hourglass | Drag | Hourglass icon |
| CTX-006 | Flow connector (curvilinear default) | Two Use Cases | Connect | Bezier curve |
| CTX-007 | Use Case boundary connection | Flow to use case | Connect to ellipse boundary | Connector attaches at nearest boundary point (not centre) |
| CTX-008 | Hourglass directed arrow | Hourglass + Use Case | Connect | Connector defaults to open-directed, arrow points TO use case (hourglass is always source) |
| CTX-009 | Actor / Team association non-directed | Actor + Use Case | Connect | Association with no arrowheads |

---

## 8. Process Context Diagrams

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| PCX-001 | Create Process Group boundary | New Process Context diagram | Drag System Boundary → label includes "Process Group" | Container shown |
| PCX-002 | Add Use Case with P-XX-NN label | Inside group | AI generate or manual | Labels numbered e.g. P-HR-01, P-FI-02 |
| PCX-003 | AI layout — processes one-per-row zigzag | AI-generated | Apply Layout | Processes alternate left and right per row |
| PCX-004 | Actors/Teams on connected side | AI-generated with actor links | Observe | Left-side actors for left processes, right for right |
| PCX-005 | Systems/Hourglasses default right | AI-generated | Observe | Systems / hourglasses to right of boundary |
| PCX-006 | Actor Y-centred between processes | AI-generated actor linked to two processes | Observe | Actor Y is midpoint of linked processes |

---

## 9. Basic Flowchart Diagrams

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| BF-001 | Create flowchart shapes | New Basic diagram | Drag Process / Decision / Terminator / etc. | Correct shapes |
| BF-002 | Flow connector curvilinear | Two shapes | Connect | Curvilinear or rectilinear per selection |
| BF-003 | Decision → two branches | Decision shape | Connect two outgoing flows | Yes / No labels editable |

---

## 10. AI Generation (all diagram types)

### 10.1 Prompt Input

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| AI-P-001 | Type prompt | Any diagram type | Open AI panel → type → Generate | Plan (BPMN) or diagram (others) generated |
| AI-P-002 | Dictate prompt | Chrome/Edge | Click Dictate → speak | Speech transcribed |
| AI-P-003 | Attach PDF | BPMN diagram | Click Attach → select PDF | Filename shown; PDF sent with prompt |
| AI-P-004 | Attach text / CSV / MD / RTF | Any diagram | Attach supported types | Content sent as text block |
| AI-P-005 | Attach >10 MB | Any diagram | Attach big file | Error message |
| AI-P-006 | Save prompt (generic) | Prompt typed | Save → name | Appears in list |
| AI-P-007 | Save prompt with plan (BPMN 2-phase) | Plan generated | Save | Prompt + plan JSON stored |
| AI-P-008 | Reload saved prompt restores plan | Saved prompt with plan | Click prompt | Textarea + Plan tabs restored |
| AI-P-009 | Delete prompt with confirmation | Existing prompt | × → Yes | Removed |
| AI-P-010 | Prompt filtered to diagram type | BPMN diagram open | See saved prompts | Only BPMN prompts shown |

### 10.2 BPMN 2-Phase Generation

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| AI-B-001 | Plan phase | BPMN diagram | Type prompt → Plan button | JSON plan returned; Plan tabs populated |
| AI-B-002 | Apply Layout phase | Plan present | Click Apply Layout | Diagram rendered with R33–R57 rules |
| AI-B-003 | Edit plan between phases | Plan present | Edit Raw JSON tab → blur to commit | Structured tabs refresh to reflect edits |
| AI-B-004 | Re-plan with edits warning | Plan has unsynced edits | Click Plan again | Warning dialog before discarding edits |
| AI-B-005 | Applied status with pool count | After Apply Layout | Observe status | "Applied: N pools, X elements, Y connections" |
| AI-B-006 | AI Generated annotation attached (R56) | BPMN AI generation with promptLabel | Apply Layout | Text annotation "AI Generated\n<prompt name>" attached to Start Event |
| AI-B-007 | Annotation falls back to first 100 chars | No saved prompt name | Apply Layout | Line 2 of annotation = first 100 chars of prompt |

### 10.3 Non-BPMN AI Generation

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| AI-O-001 | Value Chain AI generation | New Value Chain diagram | AI Generate → prompt → Generate | Chevrons + value chain container; no plan phase |
| AI-O-002 | State Machine AI generation | New State Machine | Generate | States + transitions |
| AI-O-003 | Domain AI generation | New Domain | Generate | Classes + relationships |
| AI-O-004 | Process Context AI generation | New Process Context | Generate | Zigzag rows of processes; actors/teams/systems on sides |
| AI-O-005 | Context AI generation | New Context diagram | Generate | Use cases / actors / systems |

### 10.4 Replace vs Add

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| AI-R-001 | Replace action | Existing diagram content | Generate with Replace | Existing content cleared; generated content inserted |
| AI-R-002 | Add action | Existing content | Generate with Add | Generated content appended; existing preserved |
| AI-R-003 | Both undoable | After Replace or Add | Ctrl+Z | Previous state restored |

---

## 11. Admin Features

### 11.1 AI Rules & Preferences

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| A-R-001 | Access restricted to admins | Non-admin user | File menu / direct URL | No Admin link; /dashboard/rules blocked |
| A-R-002 | 7 categories listed | Admin user | /dashboard/rules | General, BPMN, State Machine, Value Chain, Domain, Context, Process Context |
| A-R-003 | BPMN rules load — all 12 groups | Admin user | Click BPMN | Groups 1–12 displayed (R01–R57) |
| A-R-004 | Edit and save rule | BPMN rules open | Modify → Save | DB updated |
| A-R-005 | Colour coding | Mixed rules | Observe preview | Green = AI-enforced, Red = layout (groups 5, 6, 7, 8, 9, 10, 11, 12) |
| A-R-006 | Preview toggle | Click Preview checkbox | Panel hides/shows | Preview disappears / reappears |

### 11.2 AI Prompt Maintenance

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| A-P-001 | Access via System menu | Any user | System → AI Prompt Maintenance | Page loads |
| A-P-002 | Prompts grouped by diagram type | Any user | Open page | Each type listed with count |
| A-P-003 | CRUD prompts | Admin user | Create / Edit / Delete | Persisted correctly |

### 11.3 Backup / Restore

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| A-B-001 | Backup download | Admin user | System → Backup | .diag file downloads with versioned name |
| A-B-002 | Restore | Backup file | System → Restore → upload | Projects / diagrams / templates restored |
| A-B-003 | Full content preservation | BPMN + State Machine + Value Chain + Domain diagrams | Backup → delete → Restore | All diagram types preserved with properties |

### 11.4 Superuser Impersonation

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| A-IMP-001 | Superuser view-as | Login as paul@nashcc.com.au | Select user to impersonate | Banner shows "Viewing as …"; content is that user's |
| A-IMP-002 | Exit impersonation | Banner → Exit | Click | Back to superuser's own view |

---

## 12. Projects, Folders & Sharing

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| PRJ-001 | Create project | Dashboard | + New Project → name → Create | Project appears |
| PRJ-002 | Rename project | Existing project | Settings → rename → Save | Name updated |
| PRJ-003 | Delete project | Project without shared diagrams | Settings → Delete → confirm | Removed |
| PRJ-004 | Create folder | Inside project | + New Folder → name | Folder created |
| PRJ-005 | Drag diagram into folder | Diagram + target folder | Drag-drop | parentFolderId updated |
| PRJ-006 | Drag diagram between folders | Two folders, 1 diagram | Drag-drop across | Moved correctly |
| PRJ-007 | Expand/collapse folders | Multi-level | Click ▶/▼ | Opens / closes |
| PRJ-008 | Expand-all via icon | Folder with children | Hover → click expand-all ▼ | All descendants open |
| PRJ-009 | Project JSON export | Project with content | Settings → Export → JSON | .json download includes folder structure |
| PRJ-010 | Project JSON import | Export file | + New Project → Import | Projects with folders/diagrams restored |
| PRJ-011 | Share diagram (read-only) | Diagram | Share → user email → Viewer | Recipient sees read-only view |
| PRJ-012 | Unshare | Shared diagram | Share → Remove | Access revoked |

---

## 13. General Canvas & Editor (cross-cutting)

### 13.1 Canvas

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| CAN-001 | Pan | Any diagram | Drag empty canvas | Viewport pans |
| CAN-002 | Zoom via wheel | Any diagram | Mouse wheel | Zoom in/out |
| CAN-003 | Zoom slider | Any diagram | Drag zoom slider | Zoom updates |
| CAN-004 | Initial zoom 70% default | Fresh load | Open diagram | Renders at 70% |
| CAN-005 | Set custom initial zoom | Dashboard | File → Initial Zoom → 100 → Save | Persists across reloads |
| CAN-006 | Ctrl+click places space marker | BPMN | Ctrl+click empty canvas | Crosshair marker |
| CAN-007 | Insert space — 4-directional (R52/R57-related) | Marker placed | Shift+drag left / right / up / down | Containers grow in drag direction; elements shift |
| CAN-008 | Small diagram centred on load | Content fits viewport | Open | Centred |
| CAN-009 | Large diagram top-left anchored | Content exceeds viewport | Open | Top-left aligned ~40 px from viewport TL |

### 13.2 Select & Connect Protocol (see Help chapter "Select & Connect Protocol")

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| SCP-001 | Cursor: selectable element idle | Any diagram with tasks | Hover a task | `move` (double-cross arrows) cursor |
| SCP-002 | Cursor: empty canvas / unselectable | Any diagram | Hover empty | `default` cursor |
| SCP-003 | Cursor: pool edge hit-zone | Pool on canvas | Hover within 10 px of edge | `ew-resize` or `ns-resize` |
| SCP-004 | Cursor: connector endpoint | Selected connector | Hover endpoint handle | `pointer` (amber during drag) |
| SCP-005 | Cursor: during connector creation | In Connection-Creation mode | Dragging | `crosshair` |
| SCP-006 | Selected → same-element click enters Connection-Creation | Selected task | Click same task again (no drag) | Orange dashed ring appears |
| SCP-007 | ESC cancels Connection-Creation | Orange ring active | Press Esc | Ring cleared; selection cleared |
| SCP-008 | Force-connect Shift+Ctrl+click | BPMN | Shift+Ctrl+click | Banner shown |

### 13.3 Labels & Editing

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| L-001 | Double-click task label | Task on canvas | Double-click | Inline editor opens |
| L-002 | Events/Data → Properties focus | Start/End/Intermediate/Data | Double-click | Properties label textarea focused (no inline editor) |
| L-003 | Shift+Enter line break | Label editor | Shift+Enter | New line |
| L-004 | Enter commits | Label editor | Enter | Commits |
| L-005 | Esc restores | Editing | Esc | Original restored |

### 13.4 Selection & Multi-select

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| SEL-001 | Click to select | Diagram with elements | Click task | Selected; others deselected |
| SEL-002 | Shift+click multi-select | 2 tasks | Click A, Shift+click B | Both selected |
| SEL-003 | Lasso rectangle (Shift+drag) | Elements on canvas | Shift+drag on empty | Enclosed fully → selected on release |
| SEL-004 | Shift+lasso adds | Existing selection | Shift+drag lasso | Added to selection |
| SEL-005 | Esc / bg click deselects | Selection | Esc or empty-canvas click | Cleared |
| SEL-006 | Arrow nudge 5 px | Selection | Arrow key | Moves 5 px |
| SEL-007 | Shift+Arrow 1 px | Selection | Shift+Arrow | Moves 1 px |

### 13.5 Clear Diagram

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| CLR-001 | Clear Diagram dropdown | Any diagram | Click "Clear Diagram ▾" | Dropdown menu with 2 options |
| CLR-002 | Clear Diagram (all) | Diagram with content | Dropdown → Clear Diagram → Confirm | Everything removed; viewport/title preserved |
| CLR-003 | Ctrl+Z restores after Clear | After clear | Ctrl+Z | Content restored |
| CLR-004 | Clear All but Selected — option disabled without selection | No selection | Open dropdown | "Clear All but Selected" disabled |
| CLR-005 | Clear All but Selected — preserves selection + mutual connectors | Selection of 3 tasks, 2 connectors between them + 5 unrelated | Clear All but Selected | 3 tasks + 2 connectors remain; ancestors (pool/lane) preserved |
| CLR-006 | Confirm dialog counts | With selection | Open confirm | Message shows exact "keep N, remove M" counts |

### 13.6 Resize, Align, Convert

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| RA-001 | Resize handles | Selected task | Drag a corner / edge | Resizes |
| RA-002 | Pool 4-directional edge resize | Pool on canvas | Drag any edge | Resizes in that direction |
| RA-003 | Align Left / Right / Top / Bottom | 2+ selected | Align dropdown | Aligns correctly |
| RA-004 | Smart Align | Multiple elements | Smart Align | Clusters + grid snapping |
| RA-005 | Resize to match | 2+ selected | Resize dropdown → Tallest / Widest / etc. | Matches |
| RA-006 | Convert Task ↔ Subprocess (BPMN) | Task | Properties → Convert | Type switches |

### 13.7 Save, Undo/Redo, Navigation

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| SAV-001 | Auto-save | Unsaved changes | Wait ~5s | Orange indicator clears |
| SAV-002 | Ctrl+S manual save | Unsaved | Ctrl+S | Saved |
| SAV-003 | Unsaved → tab close prompt | Unsaved | Close tab | Browser prompts |
| SAV-004 | Undo / Redo | After change | Ctrl+Z / Ctrl+Y | Restored / re-applied |
| SAV-005 | Navigation tree expand/collapse | Project sidebar | ▶/▼ on folders | Opens / closes |

### 13.8 Export & Import

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| EX-001 | Export PDF | Any diagram | Import/Export → Export PDF → scale | .pdf downloads at chosen scale |
| EX-002 | Export Visio (BPMN only) | BPMN diagram | Export → Visio V2 | .vsdx downloads; colours from diagram settings |
| EX-003 | Export JSON | Any diagram | Export → JSON | .json downloads; reopenable |
| EX-004 | Export XML with XSD version | Any diagram | Export → XML | .xml plus schema version tag |
| EX-005 | Import JSON | JSON file | Import → JSON | Diagram replaces or new-project |
| EX-006 | Import XML | XML file | Import → XML | Structure preserved |
| EX-007 | Import DDL (Domain only) | DDL file | Import DDL | Classes + associations created |

### 13.9 Display Modes

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| DM-001 | Normal display mode | Any diagram | Default | Standard SVG rendering |
| DM-002 | Hand-drawn mode | Any diagram | File → Display Mode → Hand-drawn | Italic Caveat font, wobbly filter, fonts 1.3× larger |
| DM-003 | Hand-drawn persists on save | Mode set | Save, reload | Still hand-drawn |

### 13.10 Properties Panel

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| PP-001 | Panel visible on selection | Element selected | See right side | Panel populated |
| PP-002 | Collapses with AI panel | AI panel opened | Observe | Properties minimised |
| PP-003 | Font size control | Diagram setting | Change font size | Element labels update |
| PP-004 | Colour picker | Element | Properties → Colour | Custom fill applied |
| PP-005 | Reset colour | Custom fill set | Reset | Cleared to default |

### 13.11 User Guide Link

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| UG-001 | Help `?` link everywhere | Dashboard / Editor / Project / Rules / Prompts | Top-right | Link visible, opens /help |
| UG-002 | New Select & Connect Protocol chapter | /help | Scroll | Chapter 7 visible with full detail |
| UG-003 | Recent BPMN layout rule doc | /help | AI Diagram Generation chapter | Section "BPMN layout rules (decision gateways)" present with R42–R57 |

---

## 14. Recent Layout Rules (R42–R57) — behavioural verification

These consolidate tests that exercise specific AI layout rules. Each can be combined with AI-generated plans or hand-crafted plans via the apply-layout API.

| ID | Rule | Scenario | Expected |
|----|------|----------|----------|
| LR-R42 | Decision-gateway outgoing label | gateway with top + bottom + right-middle exits | Labels at specified pixel offsets per direction |
| LR-R43 | Start Event in topmost lane | Plan assigns Start Event to lane 2 | Layout moves to topmost lane |
| LR-R44 | Nested gateway Y align | gInner with predecessor D1 on upper branch | gInner + gInnerMerge Y = D1 Y |
| LR-R45 | 4+ branch assignment + stacking | Decision with 5 branches | top, right, bottom×3 sides; asymmetric Y stacking |
| LR-R46 | Non-interrupting label | Event with "non-interrupting" in label | interruptionType set |
| LR-R47 | Boundary intermediate event outer exit | Event on host top | Connector exits event top |
| LR-R48 | No connectors to/from event sub | Plan has sp → event-sub | Stripped; applies to sequence + message |
| LR-R49 | Event subs at bottom | Normal sub with 2 event-sub children | Stacked at bottom with 20 px gaps |
| LR-R50 | Boundary Start/End with event subs | Outer sub with event subs | Boundary Start on left, End on right, Y-aligned to connected task |
| LR-R51 | Internal Start/End inset | Expanded sub with internal start/end | 1.5 × event width from L/R boundaries |
| LR-R52 | Pools never overlap | 6 black-box + 1 white-box with complex sub | 90 px gaps; no overlap |
| LR-R53 | Event side nearest other end | Task left of start event | Start event exits LEFT |
| LR-R54 | Label world-position preserved | Drag waypoint that shifts anchor | Label stays at same world coord |
| LR-R55 | Nested branch re-stacking | Inner decision with 2 branches | Branches centred around inner decision's Y |
| LR-R56 | AI Generated annotation | Apply Layout with promptLabel | Annotation attached to Start Event |
| LR-R57 | Pool encloses descendants | Plan where R55 pushes E1 above pool | Pool grows UP; first lane extends; non-annotation/group-only |

---

## 15. Test Execution Checklist

**Before each run:**

- [ ] Server running via `npm run go`
- [ ] PostgreSQL service active (port 5432)
- [ ] Fresh diagram(s) of relevant type created as baseline
- [ ] Browser console open (F12)
- [ ] Test user has correct role (admin for admin tests; superuser for impersonation)

**After each run:**

- [ ] No console errors beyond known warnings
- [ ] No terminal errors
- [ ] Save state verified (orange Unsaved indicator clears after save)
- [ ] Undo/redo not corrupted
- [ ] Reload the diagram to confirm persistence

---

## 16. Known Coverage Gaps

- **Multi-user real-time collaboration** — not implemented (see [competitors/diagramatix-vs-sap-signavio.md](../competitors/diagramatix-vs-sap-signavio.md) for why)
- **Process simulation / mining** — not implemented
- **CMMN / DMN** — not supported
- **Mobile / tablet gestures** — not explicitly tested
- **Approval workflows** — not implemented
- **Stripe / subscription billing** — stage 5 feature, not yet built

---

*Last updated: 2026-04-23, corresponding to app version 1.8.x with BPMN rules R01–R57 (Groups 1–12).*
