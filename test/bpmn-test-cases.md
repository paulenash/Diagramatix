# Diagramatix BPMN Test Cases

**Version:** Schema 1.7
**Scope:** BPMN Process, Communication, and Hybrid diagrams; admin features.
**Out of scope:** State Machine, Value Chain, Domain, Context, Process Context.

Each test case follows the pattern **ID · Description · Preconditions · Steps · Expected Result**. Pass/Fail columns can be added when executing.

---

## 1. BPMN Process Diagrams

Core single-pool process flows with tasks, events, gateways, and sequence connectors.

### 1.1 Elements

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-E-001 | Create Start Event | New BPMN diagram | Drag **Start** from palette to canvas | Circle with thin border; label below |
| P-E-002 | Create Intermediate Event | New BPMN diagram | Drag **Intermediate** from palette | Double-circle; label below |
| P-E-003 | Create End Event | New BPMN diagram | Drag **End** from palette | Circle with thick border; label below |
| P-E-004 | Create Task | New BPMN diagram | Drag **Task** from palette | Rounded rectangle; label centred inside |
| P-E-005 | Create Subprocess | New BPMN diagram | Drag **Subprocess** from palette | Rounded rectangle with **+** marker |
| P-E-006 | Create Expanded Subprocess | New BPMN diagram | Drag **Expanded Sub** from palette | Large rounded rectangle with label at top |
| P-E-007 | Create Gateway | New BPMN diagram | Drag **Gateway** from palette | Diamond shape; default label `Test?` |
| P-E-008 | Create Data Object | New BPMN diagram | Drag **Data Object** from palette | Document-fold shape; label below |
| P-E-009 | Create Data Store | New BPMN diagram | Drag **Data Store** from palette | Cylinder shape; label below |
| P-E-010 | Create Text Annotation | New BPMN diagram | Drag **Annotation** from palette | Square-bracket shape |
| P-E-011 | Create Group | New BPMN diagram | Drag **Group** from palette | Dashed rounded rectangle |
| P-E-012 | Palette order | New BPMN diagram | Open palette | Order: Start, Intermediate, End, Task, Subprocess, Expanded Sub, Gateway, Pool, Data Object, Data Store, Annotation, Group |

### 1.2 Event Type Conversion (Schema 1.7)

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-ET-001 | Start → Intermediate | Start event on canvas | Select start event → Properties Panel → **Element Type** dropdown → Intermediate | Converts in place; label & connectors preserved; trigger unchanged |
| P-ET-002 | Start → End | Start event on canvas | Same as above → End | Converts; thick-bordered circle |
| P-ET-003 | End → Intermediate | End event with Timer trigger | Convert to Intermediate | Converts; Timer trigger **cleared** |
| P-ET-004 | End → Start | End event with Terminate trigger | Convert to Start | Terminate cleared |
| P-ET-005 | Intermediate → End | Intermediate with Link trigger | Convert to End | Link cleared |
| P-ET-006 | Trigger dropdown label | Select any event | Open Properties Panel | Dropdown formerly "Event Type" now labelled **Trigger** |

### 1.3 Connectors — Sequence

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-C-001 | Click-to-connect | Two tasks on canvas | Click source task → click target task | Sequence connector created; right to left |
| P-C-002 | No sequence TO Start Event (S1) | Task + Start Event | Drag connector from task to start event | Start event auto-converts to Intermediate |
| P-C-003 | No sequence FROM End Event (S3) | End Event + Task | Drag connector from end event to task | End event auto-converts to Intermediate |
| P-C-004 | Edge-mounted Start Event accepts sequence (S2) | Expanded sub with boundary start event; task outside | Drag connector from external task to boundary start event | Connector created; start event unchanged |
| P-C-005 | No sequence TO Event Expanded Subprocess (S4) | Event subprocess + task | Drag from task to event subprocess | Connector rejected (no flash, no creation) |
| P-C-006 | No sequence FROM Event Expanded Subprocess (S4) | Event subprocess + task | Drag from event subprocess to task | Connector rejected |
| P-C-007 | No sequence INTO Event Subprocess (S5) | Event subprocess with internal task; external task | External task → internal task | Connector rejected |
| P-C-008 | No sequence OUT OF Event Subprocess (S6) | Same as above | Internal task → external task | Connector rejected |
| P-C-009 | Internal sequence within Event Subprocess (S7) | Event subprocess with 2 internal tasks | Connect task 1 → task 2 inside | Connector allowed |
| P-C-010 | Boundary end event cannot connect inside (S8) | Expanded sub with boundary end event; task inside | Boundary end event → internal task | Connector rejected |
| P-C-011 | Target highlighting matches rules | Dragging a sequence connector | Move cursor over various elements | Green highlight only on valid targets per S1-S8 |

### 1.4 Connectors — Force-Connect Override (Schema 1.7)

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-FC-001 | Enter force-connect mode | Two tasks, BPMN diagram | Shift+Ctrl+Click task A | Orange banner "Force Connect: click target element" appears |
| P-FC-002 | Complete force-connect | Force mode active with source task A | Click task B | Sequence connector created A→B |
| P-FC-003 | Force-connect bypasses rules | Start event A, end event B | Shift+Ctrl+Click start → click end | Connector created despite S1/S3 |
| P-FC-004 | Force-connect into Event Subprocess | Normal task + event subprocess | Force-connect task → event subprocess | Connector created despite S4 |
| P-FC-005 | Escape cancels force mode | Force mode active | Press Escape | Banner disappears; no connector |
| P-FC-006 | Background click cancels | Force mode active | Click empty canvas | Banner disappears; no connector |
| P-FC-007 | Force-connect disabled outside BPMN | Non-BPMN diagram | Shift+Ctrl+Click element | Banner does NOT appear |

### 1.5 Auto-Connect

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-AC-001 | Auto-connect left neighbour | Task A on canvas | Drop Task B to the right of A | Sequence A→B auto-created |
| P-AC-002 | Auto-connect above/below | Task A on canvas | Drop Task B directly below | Vertical connector A→B |
| P-AC-003 | Decision gateway precedence | Decision gateway + other tasks | Drop new task | Gateway wins as auto-connect source |
| P-AC-004 | Never TO Start Event (A1) | Any source | Drop a new Start Event near existing task | No auto-connect |
| P-AC-005 | Never FROM End Event (A2) | End event on canvas | Drop new task right of end event | No auto-connect from end event |
| P-AC-006 | Never to/from Event Expanded Subprocess (A3) | Event subprocess on canvas | Drop new task near event subprocess | No auto-connect |
| P-AC-007 | Edge-mounted Start inside Expanded Sub (A4) | Expanded sub with boundary start; new task dropped inside | New task is auto-connected from the boundary start event | Dashed flash → sequence connector created |
| P-AC-008 | Siblings inside Expanded Sub (A5) | Task A inside expanded sub | Drop Task B inside same expanded sub | A→B auto-connected |
| P-AC-009 | No flash for illegal connections | Task inside event subprocess | Drop task outside | No flash to illegal targets |
| P-AC-010 | Escape cancels auto-connect | Element dropped, flash visible | Press Escape immediately | Flash cancelled; no connector |

### 1.6 Gateways

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-G-001 | Exclusive gateway (default) | New gateway on canvas | Open Properties | Element dropdown shows Exclusive |
| P-G-002 | Parallel gateway | Gateway on canvas | Properties → Element → Parallel | Gateway shows **+** marker; label auto-cleared |
| P-G-003 | Inclusive gateway | Gateway on canvas | Properties → Element → Inclusive | Circle marker inside diamond |
| P-G-004 | Event-based gateway | Gateway on canvas | Properties → Element → Event-based | Pentagon marker; label cleared |
| P-G-005 | Decision gateway outgoing label | Exclusive gateway with 2 outgoing sequences | Create 2 outgoing connectors | Label anchored to source with positive offsets |
| P-G-006 | Merge gateway attachment | Decision with 2 paths merging on a merge gateway | Create both incoming connectors | Sources enter from top/bottom, not left |
| P-G-007 | Group-connect to gateway | Select 3 tasks, double-click a gateway to their right | Action | All 3 tasks connected to gateway as merge; gateway becomes Merge |

### 1.7 Subprocesses

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-SP-001 | Convert Task ↔ Subprocess | Task on canvas | Properties → Convert → Subprocess | Changes to subprocess; size preserved |
| P-SP-002 | Expanded Subprocess Element dropdown | Expanded subprocess on canvas | Properties → Element → Normal/Call/Event/Transaction | Subprocess type changes |
| P-SP-003 | Nested expanded subprocess creation | Expanded sub on canvas | Drop another expanded sub inside | New subprocess parented to outer; rendered lighter |
| P-SP-004 | Nested shade lightens | Outer subprocess with nested child | Observe colours | Each nested level 25% lighter toward white |
| P-SP-005 | Nested shade updates dynamically | Nested subprocess being moved in/out | Drag child in and out | Colour updates in real-time |
| P-SP-006 | Orange indicator on drop-into | Drag element over expanded subprocess | Hover, don't release | Orange border flashes on target |
| P-SP-007 | Reparent to innermost | 3-level nested subprocesses; drag element over | Drag element to innermost | Element parented to smallest containing subprocess |
| P-SP-008 | Element full size inside Expanded Sub | Empty expanded sub | Drop a Task inside | Task appears at full default size (not 75%) |
| P-SP-009 | Drill into collapsed Subprocess | Collapsed subprocess with linked diagram | Double-click **+** marker | Opens linked diagram |

### 1.8 Boundary Events

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| P-BE-001 | Mount start event on subprocess edge | Expanded sub on canvas | Drag start event onto edge | Event snaps to boundary; `boundaryHostId` set |
| P-BE-002 | Mount intermediate event on task edge | Task on canvas | Drag intermediate event near edge (<25px) | Snaps to boundary |
| P-BE-003 | Boundary event moves with host | Boundary event on task | Move task | Event follows |
| P-BE-004 | Intermediate event trigger types | Boundary intermediate | Properties → Trigger → Timer | Shape changes to timer icon |
| P-BE-005 | No auto-connect from boundary end into host | Boundary end + task inside host | Drop new task inside host | No flash from boundary end event to new task |

---

## 2. BPMN Communication / Collaboration Diagrams

Multi-pool diagrams emphasising message flows between participants.

### 2.1 Pools & Lanes

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| C-PL-001 | Create Pool from palette | New BPMN diagram | Drag **Pool** to canvas | Pool created, default 1000×50; header 36px wide |
| C-PL-002 | Pool header placement on drop | Dragging pool | Drop at cursor position | Pool header centre aligns to cursor (not pool centre) |
| C-PL-003 | Pool label auto-resizes height | Empty pool | Edit label to long string | Pool height grows to fit vertical text |
| C-PL-004 | Pool label auto-resizes with lanes | Pool with 2 lanes, short label | Change label to long string | Lanes expanded evenly to accommodate |
| C-PL-005 | Pool default Black-box | Newly created pool | Properties → Element | Default `Black-box` |
| C-PL-006 | Toggle to White-box | Black-box pool | Element → White-box | Background changes; **+ Add Lane** appears |
| C-PL-007 | System checkbox (Black-box only) | Black-box pool | Properties | **System** checkbox visible |
| C-PL-008 | System checkbox hidden (White-box) | White-box pool | Properties | No System checkbox |
| C-PL-009 | Add Lane | White-box pool | Click **+ Add Lane** | Pool split into 2 lanes |
| C-PL-010 | Add second lane | Pool with 1 lane | Click + Add Lane again | 3rd lane appended |
| C-PL-011 | Delete lane | Pool with 2 lanes | Select a lane, Delete | Sibling lane expands to fill space |
| C-PL-012 | Add Sublane | Lane with no sublanes | Properties → + Add Sublane | Lane split into 2 sublanes |
| C-PL-013 | Resize lane boundary | Pool with 2 lanes | Drag boundary | Both lanes resize proportionally |
| C-PL-014 | Pool/Lane headers share width | Pool with lanes | Observe headers | Both headers 36px wide; label centred vertically & horizontally |
| C-PL-015 | Lane header doesn't obscure Pool | Pool with lane | Inspect horizontal positions | Lane starts at pool.x + 36 |
| C-PL-016 | Multi-line Pool label | Pool selected | Properties → Label textarea | Shift+Enter creates new line; textarea supports it |
| C-PL-017 | Multi-line Lane label | Lane selected | Properties → Label textarea | Same as pool |
| C-PL-018 | Delete Pool with content blocked | Pool with lanes | Select pool, Delete | Blocked with message (or empty-first required) |

### 2.2 Message Flows

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| C-M-001 | Message flow between pools | Two pools with tasks | Drag connector from task in Pool A to task in Pool B | Dashed message connector created |
| C-M-002 | Vertical alignment | Message flow between task and pool | Observe waypoints | Clean vertical line; source/target offsets aligned |
| C-M-003 | Task type auto-set Send | Task in Pool A → Customer (non-System Black-box) | Create message connector | Task A `taskType = send` |
| C-M-004 | Task type auto-set Receive | Customer → Task in Pool A | Create message connector | Task A `taskType = receive` |
| C-M-005 | System pool sets User type | Task → Salesforce (System Black-box) | Create message connector | Task `taskType = user`, not send/receive |
| C-M-006 | Message flow start event | Start event → task in another pool | Create message | Start event becomes Message trigger (catching) |
| C-M-007 | Message flow end event | Task → end event in another pool | Create message | End event becomes Message trigger (throwing) |
| C-M-008 | Message connector initial render | Newly AI-generated message connector | Open diagram | Connector displays correctly from first render (no need to move elements) |

### 2.3 Collaboration Layout

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| C-L-001 | External entity above main pool | AI-generated BPMN with customer | Observe layout | Customer pool above main pool |
| C-L-002 | System pools below main pool | AI-generated with Salesforce mentioned | Observe layout | Salesforce pool below main |
| C-L-003 | 90px pool gap | AI-generated multi-pool | Measure vertical gap | 90px between pool boundaries |
| C-L-004 | Black-box height fits name | Pool named "Customer Service Department" | Observe | Height = `label.length × 7 + 20` px |
| C-L-005 | Lane height fits name & elements | Named lane with tasks | Observe | Height accommodates vertical name and elements |

---

## 3. BPMN Hybrid Diagrams

Diagrams combining internal process flows (Section 1) with cross-pool communication (Section 2).

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| H-001 | Mixed sequence & message | 2 pools, each with tasks | Connect tasks in same pool (sequence) and across pools (message) | Both coexist; correct arrow styles |
| H-002 | Single-pool process calling external | Main pool with task sending to Customer pool | Create message flow from task to Customer | Task = send; sequence flow continues internally |
| H-003 | Message triggers start event in another pool | Pool A task → Pool B start event | Create connector | Message connector; Pool B start event becomes catching message trigger |
| H-004 | Parallel paths across pools | Decision gateway with 2 branches: one internal, one to external pool | Model both | Internal path uses sequence, external uses message |
| H-005 | Boundary event receives message | Task with intermediate event on boundary | Send message from external pool to boundary event | Message flow valid |
| H-006 | AI hybrid generation | Prompt: "Customer places order; system checks stock" | Generate | Customer pool (non-System, top), main pool, System pool (bottom); mix of connectors |

---

## 4. Admin Features

Admin-only functions accessible via **Dashboard → System menu → Admin section**.

### 4.1 AI Rules & Preferences (Admin)

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| A-R-001 | Access restricted to admins | Non-admin user | Open System menu | **AI Rules & Preferences** link NOT visible |
| A-R-002 | Admin sees link | Admin user | Open System menu | Link visible (orange, under admin section) |
| A-R-003 | View all categories | Open /dashboard/rules | Sidebar | 7 categories listed (General, BPMN, State Machine, Value Chain, Domain, Context, Process Context) |
| A-R-004 | BPMN rules load | Click BPMN in sidebar | Content loads | R01–R23 displayed; groups rendered |
| A-R-005 | Edit rule | BPMN rules open | Modify rule text → Save | Rule text updated in DB |
| A-R-006 | Colour coding — layout | Rule under "Layout" group | Observe preview | Red dot; red text |
| A-R-007 | Colour coding — non-layout | Rule under "Elements" group | Observe preview | Green dot; green text |
| A-R-008 | Preview toggle | Click Preview checkbox | Preview panel | Hides/shows coloured preview |
| A-R-009 | New rule added to rules works | Add rule "Tasks names must be nouns" to Naming group | Save | Applied in next AI generation (verify in output) |
| A-R-010 | Layout rule with code effect | Rule already in Layout group (e.g., R20 Pool height) | Generate BPMN with long pool name | Pool height adjusts accordingly |

### 4.2 AI Prompt Maintenance

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| A-P-001 | Access via System menu | Any user | System → AI Prompt Maintenance | Page loads |
| A-P-002 | Prompts grouped by diagram type | Open page | Sidebar | 6 diagram types listed with prompt counts |
| A-P-003 | Create new BPMN prompt | BPMN active in sidebar | Click **+ New Prompt** → fill name/text → Create | Prompt saved, appears in list |
| A-P-004 | Edit existing prompt | Existing BPMN prompt | Click **Edit** → modify → Save | Changes persisted |
| A-P-005 | Delete with confirmation | Existing prompt | Click **Delete** → Yes | Prompt removed; list refreshed |
| A-P-006 | Cancel delete | Delete prompt → Cancel with No | Action | Prompt preserved |
| A-P-007 | Prompt filtered to current type | BPMN diagram open, AI Generate panel | See saved prompts | Only BPMN prompts shown |

### 4.3 Backup / Restore

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| A-B-001 | Backup download | Admin user | System → Backup | `.diag` file downloads with versioned name: `Diagramatix-backup-<email>-v1.7.<build>-<date>.diag` |
| A-B-002 | Restore from backup | Backup file | System → Restore → upload file | Projects, diagrams, templates restored |
| A-B-003 | Backup preserves BPMN content | BPMN diagram with pools, lanes, message flows | Backup → delete → Restore | Full diagram restored including connectors |

### 4.4 Database Access (Admin)

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| A-DB-001 | Admin menu visible | Admin user | System → Admin | Admin link visible; DB access works |
| A-DB-002 | Non-admin blocked | Non-admin user | Navigate /dashboard/admin directly | Access denied / redirected |

---

## 5. AI Generation for BPMN

### 5.1 Prompt Input

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| AI-P-001 | Type prompt | BPMN diagram open | Click AI Generate → type "Process invoices" → Generate | Diagram generated |
| AI-P-002 | Dictate prompt | Chrome/Edge | Click **Dictate** → speak | Speech transcribed into textarea |
| AI-P-003 | Attach PDF | Any document | Click **Attach** → select PDF | Filename shown; PDF sent with prompt on generate |
| AI-P-004 | Attach text file | .txt file | Attach .txt | File content included as text block |
| AI-P-005 | Attach size limit | >10 MB file | Attach | Error: "File too large" |
| AI-P-006 | Remove attachment | Attached file | Click × next to filename | Attachment cleared |
| AI-P-007 | Save prompt | Prompt typed | Click **Save** → name → ✓ | Prompt saved; appears in list |
| AI-P-008 | Update existing prompt | Saved prompt loaded (edit mode) | Edit text → **Update** | Prompt replaced in DB |
| AI-P-009 | Save as new from edit | Edit mode active | Click **New** → type new name → Save | New prompt created; original untouched |

### 5.2 Generated Layout

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| AI-L-001 | Pools & lanes generated | Prompt mentioning customer, sales team, warehouse | Generate | White-box main pool with lanes for teams; Customer as black-box top |
| AI-L-002 | Decision gateway with merge | Prompt with "if/else" logic | Generate | Exclusive gateway diverging; Merge gateway converging (R10 enforced) |
| AI-L-003 | Send/Receive tasks | Prompt with customer interaction | Generate | Tasks sending/receiving to customer have `taskType = send/receive` |
| AI-L-004 | User task for system pool | Prompt mentioning Salesforce | Generate | Tasks to Salesforce have `taskType = user` (R23) |
| AI-L-005 | Message connectors vertical | AI-generated with cross-pool flows | Render | Message connectors are vertical from first render (no repositioning needed) |
| AI-L-006 | Pool height generous | Long pool name | Generate | Pool height accommodates vertical text with buffer |

---

## 6. General Functionality (BPMN context)

### 6.1 Canvas

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| CAN-001 | Pan canvas | BPMN diagram | Ctrl+drag or middle-click drag | Viewport pans |
| CAN-002 | Zoom via wheel | BPMN diagram | Mouse wheel | Zoom in/out |
| CAN-003 | Zoom via slider | BPMN diagram | Drag zoom slider (bottom-right) | Zoom updates; % display updates |
| CAN-004 | Manual % zoom entry | Zoom bar visible | Click % field → type 150 → Enter | Zoom set to 150% |
| CAN-005 | Zoom bar position | BPMN diagram | Observe | Bar at bottom-right corner |
| CAN-006 | 100% = opening view | Fresh diagram load | Zoom bar | Shows 100% as default |
| CAN-007 | Ctrl+click to place insert-space marker | BPMN diagram with content | Ctrl+click empty canvas | Red/blue crosshair marker appears |
| CAN-008 | Shift+drag marker to insert space | Marker placed | Shift+drag horizontally or vertically | Elements past marker move; new space inserted |

### 6.2 Labels & Editing

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| L-001 | Double-click task label | Task on canvas | Double-click | Inline editor opens; text selected |
| L-002 | Double-click Start Event | Start Event | Double-click | NO inline editor; Properties label focused instead |
| L-003 | Double-click End Event | End Event | Double-click | Same as above |
| L-004 | Double-click Intermediate Event | Intermediate Event | Double-click | Same as above |
| L-005 | Double-click Data Object | Data Object | Double-click | Same as above |
| L-006 | Double-click Data Store | Data Store | Double-click | Same as above |
| L-007 | No browser menu on double-click | BPMN diagram | Double-click any element | Browser context menu does NOT appear |
| L-008 | Select all on focus | Any label input | Click into it | Existing text selected |
| L-009 | Shift+Enter new line | Label textarea | Shift+Enter | Line break inserted |
| L-010 | Enter commits edit | Label editing | Enter (not shift) | Edit committed |
| L-011 | Esc cancels edit | Label editing | Esc | Original label restored |

### 6.3 Selection & Multi-selection

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| SEL-001 | Click to select | BPMN with elements | Click a task | Task selected; others deselected |
| SEL-002 | Shift+click multi-select | 2 tasks | Click task A, Shift+click task B | Both selected |
| SEL-003 | Lasso select | BPMN with elements | Drag rectangle on empty canvas | All elements inside selected |
| SEL-004 | Shift+lasso adds | Existing selection | Shift+drag over others | Added to selection |
| SEL-005 | Esc deselects | Selection active | Esc | Selection cleared |
| SEL-006 | Background click deselects | Selection active | Click empty canvas | Selection cleared |

### 6.4 Save & Navigation

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| SAV-001 | Manual save via button | Unsaved changes | Click Save button | Status: Saved; orange "Unsaved" cleared |
| SAV-002 | Manual save via Ctrl+S | Unsaved changes | Press Ctrl+S | Saved |
| SAV-003 | Unsaved warning on close | Unsaved changes | Try to close tab | Browser prompts to leave |
| SAV-004 | Unsaved prompt on drill-into | Unsaved changes | Double-click subprocess with linked diagram | Prompted to save first |
| SAV-005 | Undo | Element added | Ctrl+Z | Element removed |
| SAV-006 | Redo | After undo | Ctrl+Shift+Z | Element restored |

### 6.5 Export

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| EX-001 | Export JSON | BPMN diagram | Import/Export → Export JSON | `.json` downloaded; reopenable |
| EX-002 | Export XML | BPMN diagram | Import/Export → Export XML | `.xml` downloaded |
| EX-003 | Export PDF with title | BPMN with title showing | Import/Export → Export PDF | PDF with title at top; not clipped |
| EX-004 | Export PDF title always included | Title hidden on canvas | Export PDF | Title still in PDF |
| EX-005 | PDF scale setting | BPMN diagram | Export PDF → scale 150% | PDF dimensions scaled |

### 6.6 Properties Panel

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| PP-001 | Panel shows for selection | Element selected | Look right side | Panel visible with properties |
| PP-002 | Panel collapses with AI panel | Open AI Generate | Observe | Properties panel minimises |
| PP-003 | Title renamed | Pool/Subprocess/Gateway selected | See label for Type dropdown | Label reads **Element** (not "Type") |
| PP-004 | Fill colour editing | Any element | Properties → Colour | Color picker opens |
| PP-005 | Reset colour | Element with custom fill | Click Reset | Colour cleared |

### 6.7 Project Navigation Tree

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| NT-001 | Expand/collapse individual folder | Folder with subfolders | Click ▶/▼ | Folder expands/collapses |
| NT-002 | Expand all subfolders | Multi-level folders | Hover folder → click ▼ icon | All descendants expand |
| NT-003 | Collapse all subfolders | Multi-level expanded | Hover folder → click ▶ icon | All descendants collapse |
| NT-004 | Hover tooltip on truncated folder name | Long folder name | Hover | Full name shown as tooltip |
| NT-005 | Hover tooltip on diagram name | Long diagram name | Hover | Full name shown |

### 6.8 User Guide Link

| ID | Description | Preconditions | Steps | Expected Result |
|----|------|---------------|-------|-----------------|
| UG-001 | Dashboard shows link | Dashboard open | Top-right area | User Guide link visible |
| UG-002 | Diagram editor shows link | BPMN diagram open | Top bar | User Guide link visible |
| UG-003 | Project page shows link | Project detail open | Toolbar | User Guide link visible |
| UG-004 | Rules Editor shows link | /dashboard/rules | Header | Link visible |
| UG-005 | Prompt Maintenance shows link | /dashboard/prompts | Header | Link visible |

---

## 7. Test Execution Checklist

Before each BPMN test run:

- [ ] Server running via `npm run go`
- [ ] PostgreSQL service active
- [ ] Fresh BPMN diagram created as baseline
- [ ] Browser console open (F12) to catch errors
- [ ] Test user account has correct role (admin tests require admin account)

After each run:

- [ ] No errors in browser console (except known warnings)
- [ ] No errors in server terminal
- [ ] Save state verified (orange indicator clears after Save)
- [ ] Undo/redo history not corrupted

---

## 8. Known Coverage Gaps

The following are explicitly **not** in this test suite:

- State Machine diagrams (separate suite)
- Value Chain diagrams (separate suite)
- Domain Model diagrams (separate suite)
- Context Diagrams (separate suite)
- Process Context Diagrams (separate suite)
- Multi-user collaboration (not implemented)
- Version history of diagrams (not implemented)
- Stripe / subscription billing (stage 5 feature)
