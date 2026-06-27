# Suggested User Guide — revamped content

> **Purpose:** a complete, up-to-date rewrite of the Diagramatix User Guide, ready to replace the
> current content. Structure maps directly to the in-app editor: each `##` is a **chapter**, each
> `###` is a **section**. Complex features have numbered step-by-step instructions. Items marked
> **(SuperAdmin)** or **(OrgAdmin)** should be tagged *admin-only* in the editor.
>
> Drafting notes are in blockquotes like this and should be removed before publishing.

---

## 1. Getting Started

### Welcome to Diagramatix
Diagramatix is a web-based diagramming tool for business processes and enterprise models. It pairs
smart, rule-driven layout with AI generation, a process simulator, and publishing for business
audiences. Everything is saved automatically as you work.

### Signing in
1. Go to your Diagramatix URL and enter your **email** and **password**, or click **Sign in with
   Microsoft** to use your work account.
2. New here? Click **Register**, enter your email and a password (at least 8 characters), and you're
   in — a personal workspace (Organisation) is created for you automatically.
3. Forgot your password? Use **Forgot password** on the sign-in screen; you'll get a reset link by
   email.

### The dashboard
After signing in you land on the **dashboard**: your projects and diagrams as colour-coded tiles, a
search box, the notification **🔔 bell**, and your account menu. Each tile's colour and 2-letter code
indicate its diagram type.

### Quick start
1. Click **New project**, give it a name.
2. Open the project and click **New diagram**, choose a **diagram type** (e.g. BPMN), and name it.
3. The editor opens. Drag a symbol from the **palette** onto the canvas, or use **AI Generate** to
   draft the whole diagram from a description.
4. There's no Save button for content — edits **auto-save**. Use **Publish** when you're ready to
   release a version.

---

## 2. Projects & Folders

### Creating a project
On the dashboard click **New project**, name it, and open it. Projects hold diagrams and can be
shared with colleagues.

### Folders inside a project
Inside a project you can create **folders** to organise diagrams: use **New folder**, then drag
diagrams into folders, rename, or reorder them. Folder layout is saved automatically.

### Deleting a project
Right-click a project tile → **Delete**. Diagrams in the project are moved to *Unorganised* (or, with
the cascade option, archived) — published diagrams are safely demoted to draft rather than lost.

### Scan diagrams for issues
A project-level scan checks every BPMN diagram against the structural rule set and lists errors
(red) and warnings (amber) so you can fix modelling problems in bulk.

### Scan diagrams for links
Scans the project for cross-diagram links (subprocess → linked diagram) so navigation and
parent/child relationships stay consistent.

---

## 3. Diagram Types

> *Each type has its own symbol palette, connector rules, and colour. Tag none of these as admin-only.*

### Overview & colour identity
Diagramatix supports **BPMN, Flowchart, Context, Process Context, State Machine, Domain, Value Chain,
and ArchiMate**. Every type has a **2-character code** and a pastel colour (e.g. **BP** for BPMN,
**CO** for Context) shown on tiles, in the navigation tree, and in the editor's tinted top bar.
**(SuperAdmin)** can change any code or colour at *SuperAdmin → Diagram Types*.

### BPMN
Full Business Process Model & Notation: tasks (user, service, script, send, receive, manual,
business-rule), gateways (exclusive, inclusive, parallel, event-based), start / intermediate / end
events with triggers (message, timer, error, signal, terminate, conditional, escalation, cancel,
compensation, link), pools, lanes & sublanes, collapsed/expanded subprocesses, data objects, data
stores, groups, and text annotations. BPMN supports **auto-connect**, **smart alignment**, AI
generation (two-phase), and the **process simulator**.

### Flowchart
Standard ISO 5807 flowcharts: terminator, process, decision, input/output, document, predefined
process, preparation, manual input/operation, display, delay, database, on-/off-page connectors, and
swimlanes. A flowchart can be **translated to BPMN** from the File menu.

### Context Diagram
A central system with the external entities that interact with it — ellipses for the system,
rectangles for entities, joined by bi-directional flows. Per-diagram font controls size entity
names, process names, and flow labels independently.

### Process Context Diagram
Use-case style: processes (use cases) surrounded by actors, teams, systems, and "hourglass"
connectors, optionally within a system boundary. Good for showing who interacts with which process.

### State Machine
States and transitions: initial/final states, composite states, **submachines** (link to another
state machine), **fork/join** bars, and guard-labelled transitions including self-transitions.

### Domain Model
Entity-relationship / database schemas: UML classes, enumerations, and foreign-key relationships.
Set a **database type** (PostgreSQL / MySQL / SQL Server) to tailor it, **import a DDL** script to
generate a model, or **generate DDL** from the model **(SuperAdmin)**.

### Value Chain
End-to-end value delivery: chevron processes (collapsed or expanded), value-chain containers, and
description boxes, with horizontal snapping for a clean left-to-right flow.

### ArchiMate
Enterprise-architecture diagrams in ArchiMate notation. Drop a generic ArchiMate element and choose
its type from the live catalogue. ArchiMate's strength is its **relationship set** — all eleven are
supported:

| Group | Relationships |
|---|---|
| **Structural** | Composition, Aggregation, Assignment, Realisation |
| **Dependency** | Serving, Access, Influence, Association |
| **Dynamic** | Triggering, Flow |
| **Other** | Specialisation |

Draw a connector between two elements, then set its relationship in the connector's properties; each
renders with its correct ArchiMate line/arrow style.

---

## 4. The Canvas

### Panning
Drag an empty part of the canvas, or hold **Space** and drag, to pan. The background motif scrolls
with you.

### Zooming
Use the mouse wheel (or trackpad pinch) to zoom toward the cursor, or the zoom controls. Set the
**Initial Zoom** for newly-opened diagrams from *Dashboard → File → Initial Zoom*.

### Selecting, moving, resizing, deleting
- **Select:** click an element; **Shift+click** or drag a marquee to multi-select.
- **Move:** drag a selected element (or group). Connectors re-route automatically.
- **Resize:** drag a selection handle. The Resize menu offers preset sizes.
- **Delete:** press **Delete**/**Backspace**, or use the element's **✕**. Connectors to a deleted
  element are cleaned up automatically.

---

## 5. Building a Diagram

### Adding elements from the palette
Drag a symbol from the left **palette** onto the canvas. The palette shows only the symbols valid for
the current diagram type.

### Right-click quick-add
- **On empty canvas:** right-click → pick a symbol to drop it there.
- **On an existing element:** right-click → **change its type** (e.g. Task ↔ Subprocess), or quick-add
  a connected next element.

### Drawing connectors
Hover an element's edge until the connection cursor appears, then drag to the target element and
release. The connector type is chosen automatically for the diagram type (e.g. sequence flow in
BPMN, flowline in a flowchart, association for data/comments).

### Connector types & routing
Connectors route **orthogonally** with smart obstacle avoidance. You can:
- Edit a connector's **label** (double-click it).
- Drag a connector's **endpoint** to reattach it to another element or side.
- Drop an element **onto** a connector to insert it inline (the connector heals into two).

### The Select-and-Connect protocol
The cursor tells you what a click will do — move vs. connect vs. add. In short: click the **body** to
select/move; hover the **edge** to start a connector; click empty canvas to deselect. Pool, lane, and
subprocess boundaries have their own move/resize behaviour.

### Auto-Connect
A three-state toggle that automatically connects elements as you add them, following the diagram
type's rules (e.g. BPMN sequence-flow direction, decision-gateway branching, boundary-event
attachment sides, self-avoidance). Use the **force-connect** override when you need a connection the
rules wouldn't make, or cancel an in-progress auto-connect with **Esc**.

---

## 6. Editing Tools

### Smart Alignment
Select two or more elements and choose an alignment (top, bottom, left, right, centre). **Smart
Align** also nudges the connectors between aligned elements so they meet face-to-face and run
straight.

### Insert & Remove Space
- **Insert space:** one green marker; drag to push everything past the marker apart (direction-aware).
- **Remove space:** two red markers; drag to pull elements together.
- Press **Esc** to step back through the modes.

### Drop onto connector & delete-healing
Drop an element onto a connector to splice it in (the connector becomes two). Delete an in-line
element and the connector **heals** back into one.

### Resize menu & element conversion
The Resize menu offers preset sizes. **Convert** elements in place: Task ↔ Subprocess and event-type
changes (BPMN), or Process ↔ Collapsed Process (Value Chain).

---

## 7. BPMN Essentials

### Pools, lanes & sublanes
Pools represent participants; lanes (and sublanes) divide a pool by role/team. Drag elements between
lanes; use the lane header's **↑ / ↓** arrows to **swap adjacent lanes** (children move with the
lane). Name pools and lanes from governed **Entity Lists** (see chapter 15).

### Gateways
Exclusive (×), inclusive (○-in-diamond), parallel (+), and event-based (⬠) gateways. Decision
gateways branch with labelled outgoing flows; the layout engine places branch labels for you.

### Events & boundary (edge-mounted) events
Start, intermediate, and end events carry triggers (message, timer, error…). **Boundary events**
mount on a task/subprocess edge:
1. Drag an intermediate event onto the edge of a task or subprocess — it snaps to the boundary.
2. It exits to the side the rules choose; draw its outgoing flow to the exception path.
3. Drag it off the edge to detach it back into a free intermediate event.

### Subprocesses & linked diagrams
- **Collapsed subprocess:** a single box with a **+** marker; link it to another diagram to drill in.
- **Expanded subprocess (EP):** a container you drop elements into; it's isolated from the
  surrounding pool/lanes and renders above lane backgrounds.

### Message flows
Message (dashed) connectors run between pools. The editor enforces valid message rules and keeps
their labels in the inter-pool gap.

---

## 8. Properties & Styling

### Properties panel
Select an element or connector to edit its properties on the right: label, description (rich text),
type-specific fields, and links. Select nothing to see **Diagram Properties** (title, fonts,
database, process owner) in nested sub-sections.

### Bubble Help
Click the **help cloud** on supported elements for a contextual tip. **(SuperAdmin)** edits these at
*SuperAdmin → Bubble Help*.

### Fonts, colour themes & process owner
Control typography independently per diagram. Apply a **process colour theme** to recolour the whole
diagram (and clear it again). Set a **Process Owner** (name + email) in Diagram Properties — it shows
on the published view.

### Voice dictation into any field
You can dictate into **any text box** in Diagramatix — element names, descriptions, the AI prompt, the
properties panel, dialogs, and more — using the floating **🎤 mic** button at the bottom-left of every
screen.

1. Click into the text field you want to fill.
2. Click the **🎤 mic** button (bottom-left) to open the dictation panel — it confirms which field
   it will type into.
3. Click **Dictate** and speak; your words are inserted at the cursor as you talk. The status shows
   the engine in use — **Deepgram** (blue, high quality) where available, otherwise the **browser**
   fallback (red).
4. Click **Stop** when finished.

**Test your mic first:** in the same panel, click **Test mic** to see a live level meter and a short
recording you can replay, so you can confirm the browser is hearing the right microphone. (Allow
microphone access if your browser prompts.)

---

## 9. AI Diagram Generation

> *The single most powerful feature. BPMN uses a two-phase Plan flow; other types use one-click
> Generate. Mark "Create Prompt from Diagram" admin-only.*

### Opening the AI panel
In the editor, click **AI Generate** (or, for BPMN, **AI Plan**) in the right sidebar.

### Generate from a description (all types)
1. In **Describe the process**, type what the process does (e.g. *"A customer places an order. The
   Sales team checks it…"*).
2. Choose **Replace** (replace the canvas) or **Add to diagram** (append).
3. Click **Generate**. A progress banner appears; in 15–30 s the canvas updates and a status line
   reports *"Generated X elements, Y connections"*.

> *Your BPMN rules are applied automatically — there's a note to that effect in the panel.*

### BPMN: the two-phase Plan flow
BPMN uses a review step so you can check the structure before it's drawn:
1. Type your description, then click **Plan**. Sonnet returns a structured plan (15–30 s).
2. Review and edit the plan in the tabs: **Pools / Lanes**, **Elements**, **Connectors**, or **Raw
   JSON**. Rename, delete, or re-group items.
3. Click **Apply Layout**. The layout engine positions everything and renders the diagram.
4. To revise, edit the plan and **Apply Layout** again, or change the description and **Re-send to
   Sonnet** (it asks before discarding plan edits).

### Record & Dictation
Turn a spoken description or a meeting transcript into a draft:
1. **Dictate** — click **Dictate**, speak, and your words stream into the description box; click
   **Stop** when done. (Uses high-quality cloud transcription where available, otherwise the
   browser's engine.)
2. **Record a meeting** — click **Record** to capture audio in the browser; **Stop** transcribes it.
3. **Upload** — click **Audio / VTT** to upload an audio file, or a Microsoft Teams / Zoom **.vtt**
   transcript (parsed in your browser).
4. Leave **AI tidy** ticked to clean the raw transcript into an ordered process description (and
   surface open questions). Untick it to keep the raw text.

### Answer the AI's questions (Clarification)
If the AI flags open questions, an **Ask for Clarification (N)** button appears:
1. Click it. Each question has an optional answer box.
2. Answer the ones you can (leave others blank), then click **Apply & Regenerate**. Your answers are
   added to the prompt and the diagram regenerates.

### Attach a document or image
Click **Attach** to add a **PDF** or text file (max 10 MB) as context. For BPMN you can also attach
an **image** of a process diagram — the AI reverse-engineers BPMN from it.

### Saved prompts
Click **Save** to store the current prompt (and, for BPMN, its plan) under a name; reload it later
from **Saved Prompts**, **Update** it, or delete it with the **✕**.

### Create Prompt from Diagram **(SuperAdmin)**
- **Technical Description** — instantly turns the current diagram into a structured text description.
- **Staff Narrative** — rewrites it as a plain-English, first-person narrative (uses the editable
  briefing at *AI Rules & Preferences*).

---

## 10. Process Simulation

> *BPMN-only. The simulator predicts flow time, throughput, utilisation, queues, and cost, and
> compares an as-is process against to-be redesigns.*

### Opening the simulator
Open a **BPMN** diagram and click **◈ Simulator** in the toolbar (it only appears on BPMN). The
full-screen simulator console opens.

### Step 1 — Define teams (resources)
In the **Teams** panel, add the resource pools your process uses:
1. Type a team name (e.g. *analysts*), set its **capacity** (head-count), and click **+ Add**.
2. Optionally set a **cost/hour** so results include cost-per-case.
Teams are shared across every scenario in a study.

### Step 2 — Add simulation data to elements
In the **Simulation Data** panel, set timings and routing (or click **⚙ Fill missing** to
auto-populate sensible defaults):
- **Start/intermediate events:** an **inter-arrival** distribution (Fixed, Uniform, Triangular,
  Normal, or Exponential) and an optional max-arrivals cap.
- **Tasks:** a **cycle time** distribution, optional **wait**, a **team**, and **units** (how many
  team members one instance occupies).
- **Gateways:** a **probability %** per outgoing branch (summing to ~100), a **default** branch, or a
  condition **expression**.

A red **●** flags anything missing.

### Step 3 — Create a study and scenarios
In **Studies & Scenarios**:
1. Name a **Study** and click **+ Study**, then tick the **root diagram(s)** to simulate (linked
   subprocesses are pulled in automatically).
2. Add a **scenario** (**+ Scenario**) — the first becomes the **baseline (as-is)**.
3. Add more scenarios for the changes you want to test (the **to-be** variants). A scenario can even
   run a **structurally different diagram** (its own redesigned process).
4. Set each scenario's **run config**: clock unit, horizon, warm-up, replications (Monte-Carlo runs),
   and seed. Optionally schedule **planned interventions** (timed capacity surges, arrival
   multipliers, branch-probability shifts, token injections, or outages).

> **Shortcut:** with ≥2 diagrams, click **⇄ set up As-is vs To-be** to create a baseline+to-be pair
> in one click.

### Step 4 — Run
Click **▶ Run** on a scenario. The engine assembles the network, applies the scenario, runs the
replications, and shows a quick summary (completed cases, flow-time p50/p95, top bottleneck).

### Step 5 — Compare as-is vs to-be
With ≥2 scenarios, click **⇄ compare scenarios**:
- A plain-English **verdict** per to-be scenario, e.g. *"23% faster, +18% throughput, $120 less per
  case, frees ≈1.2 FTE of analysts."*
- A side-by-side **metrics table** (completed, flow p50/p95, top utilisation, cost/case, total cost)
  with deltas against the baseline (◆).
For detail, open **▸ full results**: per-team utilisation & queues and the busiest tasks.

### Live Operator — intervene mid-run
Click **▶ Launch replay** to watch tokens flow through the diagram. From the **Operator** bar you can,
at any moment, surge a team's **capacity**, **inject** a backlog of tokens, shift a branch, or trigger
an outage — the run **forks** from that instant so you can see the "what-if" play out. Adjust playback
speed, pause, or **↺ Reset** to the baseline.

### Simulation Examples gallery
*Dashboard → Simulator Examples* has worked examples. Click **▶ Load & open** to copy one into a new
project and learn from a complete setup. **(SuperAdmin)** can capture a study as a new example.

---

## 11. Value & Analysis

### Value classification
Set each activity's value classification (e.g. value-add / non-value-add) in its properties to
support value-stream analysis.

### Cycle time & wait time
Record cycle and wait times on activities and show them on the canvas to spot delays.

### Bottleneck highlighting
Mark a connector as a **bottleneck** and enable bottleneck display to make constraints visually
obvious.

### Value Chain analysis
Value Chain diagrams summarise the end-to-end flow; collapsed chevrons link to the detailed
sub-processes.

---

## 12. Publishing & Sharing

> *How a finished diagram reaches reviewers and business users. All of these are for the Diagram /
> Project owner — not admin-only.*

### Publish a version
1. Click **Publish version [N]** in the editor.
2. Add optional **release notes**.
3. Set **Next review**: a **cadence** (every N months → shows the next date), a **specific date**, or
   **none**.
4. Click **Publish v[N]**. The diagram moves **DRAFT → PUBLISHED** and the version appears in History.

### Version history (preview & restore)
Click **History** to see auto-saved snapshots (last 50) and published versions:
- **Preview** loads a snapshot onto the canvas to look at (it won't be saved).
- **Restore** rolls back to that version — your current state is first saved as a new history entry.
  (Save any unsaved changes first; the panel warns you.)

### Publish to business users (Bundles)
Package a process and its linked diagrams for a read-only business audience:
1. Click **Publish to business users**. Name the bundle.
2. Tick the **root** diagrams (entry points). The **closure preview** lists every linked diagram that
   will be included; if any are still drafts, click **Publish all to v_next** to publish them.
3. Resolve any **cross-project link** warning (tick *I understand* to proceed).
4. Add the **audience** — search existing users, or type an email to **invite** someone without an
   account (they'll get an email).
5. Optionally add release notes and a next-review date, then click **Publish bundle**.

### What business users see (Process View)
Audience members open a clean, read-only **Process View**: the published version, the Process Owner
and Diagram Owner, and click-through navigation into linked sub-processes. They can send **feedback**
(optionally pinned to a specific element), which appears in your **Feedback** panel to acknowledge,
resolve, or dismiss.

### Send for review
Ask colleagues to review before publishing:
1. Click **Send for Review**. Enter an **Objective** and a **Due date**.
2. Tick one or more **collaboration groups** and choose the **reviewers** within them.
3. Click **Send for Review**. Reviewers are notified and can open the diagram, leave **review
   comments** (sticky notes on the canvas), and submit their review. Track progress on your dashboard.

### Share a project
1. On a project tile, open **Manage Sharing**.
2. Search a person and add them as **View** or **Edit** (or pick a group). Change a role inline, or
   remove a share. Use **Stop Sharing** to revoke everyone.

---

## 13. Import & Export

> *All from the editor's **File ▾** menu. Each can target your computer (**Local**) or **SharePoint**.*

### Export
- **PDF** — choose a scale (100/75/50/25%); the PDF includes the title, status, version, and authors.
- **SVG** — a clean vector image.
- **JSON** — the diagram in Diagramatix's portable format (round-trips via Import).
- **XML** *(BPMN)* — Diagramatix XML plus its `.xsd` schema.
- **Visio** *(BPMN)* — a `.vsdx` for the Diagramatix v1.6 stencil (recipient installs the stencil);
  download the **Visio Stencil** (`.vssx`) from the same menu. **(SuperAdmin)** also has the BPMN_M
  variant. Bulk-export a whole project's diagrams to Visio from the project view.
- **Templates** — export your template set (`.diag_tems`).

### Import
- **JSON** / **XML** *(BPMN)* — replaces the current diagram (you'll confirm first).
- **Visio (.vsdx)** — imports a Visio drawing; a result panel reports shapes created/skipped and any
  warnings. You can create a new diagram or replace the current one.
- **BPMN (.bpmn)** — imports OMG BPMN 2.0 XML (subprocess nesting and event gateways preserved).
- **DDL** — paste/upload a SQL `CREATE TABLE` script to generate a Domain model (PostgreSQL, MySQL,
  and SQL Server dialects).
- **Templates** — import a `.diag_tems` set (duplicates are skipped).

### Generate DDL **(SuperAdmin)**
From a Domain diagram, generate PostgreSQL / MySQL / SQL Server DDL for download.

### SharePoint
- **Connect** your Microsoft account once (the File → SharePoint options light up when connected).
- **Save to SharePoint** — File → Export → SharePoint → pick a format → choose a folder.
- **Open from SharePoint** — File → Import → SharePoint → pick a file.
- **Link a Data Object/Store to a SharePoint file** so the diagram points at the live document; a
  badge shows on the canvas and an embedded preview is available.

---

## 14. Backup & Restore

> *Personal export is for everyone; org and full backups are admin-only.*

### Your data
Your diagrams auto-save continuously and are versioned (History). For a portable copy, export
diagrams/projects as JSON (chapter 13).

### Org backup & restore **(OrgAdmin)**
*Dashboard → Admin → Backup & Restore*:
1. **Download Org backup** produces a `.diag-full` file containing your whole org (treat it as
   sensitive).
2. **Selective restore:** upload a `.diag-full`, click **Inspect**, tick the members / projects /
   diagrams / templates to bring back, and click **Restore**. Restored items are **added** alongside
   live data (never overwritten) and re-attached to their original owner by email.

### Full backup & restore **(SuperAdmin)**
*Dashboard → Admin → Database*:
- **FULL Backup** downloads every row of every table (includes credentials — treat as secret).
- **Full & Selective Restore** offers three modes: **Additive** (tick orgs/users/projects to merge),
  **Wipe** (type *WIPE* to truncate and reload everything from a snapshot), and **Per-table** (type
  *RESTORE* to restore chosen tables only — advanced).
- **Rules & Prompts** and **Built-In Templates** can be exported/imported between environments from
  the same page.

---

## 15. Entity Lists & Pool/Lane Naming

### Governed name sources
Entity Lists provide consistent names for BPMN pools and lanes: **External Participants**, **IT
Systems**, and **Organisation Structures** (Organisation → Org Unit → Team → Role). An org keeps a
**master** library; a project adopts its **own editable copy** — so changing the project copy never
touches the org master.

### Naming a pool or lane
When naming a pool or lane, pick from the relevant Entity List instead of free-typing, keeping names
consistent across diagrams. **(OrgAdmin/SuperAdmin)** maintain the master lists at *Admin → Entity
Lists*.

---

## 16. Collaboration & Notifications

### Collaboration groups
Create groups (org-wide or project) of colleagues to send diagrams to for review. Invite members,
track accept/decline status, and transfer ownership.

### Notifications & feedback inbox
The **🔔 bell** opens your inbox: review requests, shares, bundle invites, and feedback. Open an item
to jump straight to the diagram; mark items read individually or in bulk.

---

## 17. Account, Plans & Settings

### Profile & organisation
From the account menu: edit your **profile**, view your **organisation**, change your **password**,
and **sign out**.

### Plans & usage
Your subscription tier sets monthly limits for AI generations, exports, and imports. The **usage**
indicator shows how much you've used; if you hit a cap, upgrade your plan to continue. Free tiers
include a trial window.

---

## 18. OrgAdmin **(OrgAdmin)**

### The OrgAdmin menu
OrgAdmins (shown in **orange**) get an Admin menu to manage their organisation: registered users,
project sharing oversight, entity lists, and org backup.

### Registered Users
A table of members with status, subscription, and the diagram they're currently viewing.

---

## 19. SuperAdmin **(SuperAdmin)**

### SuperAdmin tools
SuperAdmins (shown in **red**) get the full admin grid: Database access, full backup/restore, AI
Rules & Preferences, BPMN Scanner Rules, Diagram Types, Features catalog, Bubble Help, Subscriptions,
Org Settings, Simulation Examples, and the **User Guide editor** (where this guide is maintained).

### Editing the User Guide
*SuperAdmin → User Guide* opens a WYSIWYG editor: add/rename/reorder chapters and sections, edit each
section's content (with tables and a symbol picker), and toggle **SuperAdmin-only** visibility per
chapter or section. Changes go live immediately.

### Capturing screenshots for the guide
SuperAdmins see a **camera button** at the bottom-left of every screen for capturing illustrations:

1. (Optional) Open the menu or panel you want to show — it will be included in the shot.
2. Click the **camera** button (or press **Alt+Shift+C**). The screen freezes with the menu still open.
3. Drag the **crop rectangle** (or use **Whole screen** / **Canvas**) to frame the area, add an
   optional caption, and click **Save to library**.
4. The image is stored in the guide's **image library**, named by the screen (and diagram, if you're
   in the editor). In a guide section's **Image → Choose from library**, pick it to illustrate that
   section.

### Exporting the guide
On the **Guide** tab, **Export ▾** offers two Markdown exports: a **bundle (.zip)** — `User-Guide.md`
plus an `images/` folder — and a **self-contained .md** with images embedded. Both contain every
chapter and section.

### Product Updates & Release Notes
The **Documents** tab is for standalone Markdown documents. Click **New document**, choose **Release
Notes** or **Product Update** to start from a template, edit it in the same WYSIWYG editor, then
**Save to SharePoint** (pick a folder). Re-open any document later with **Open from SharePoint** to
keep editing. (Requires your Microsoft account to be connected.)

---

## 20. Tips & Troubleshooting

### Auto-save
There's no Save button for content — everything saves automatically. **Ctrl/Cmd+S** forces a save;
**Ctrl/Cmd+Z / Ctrl/Cmd+Y** undo/redo.

### Connection mode
If clicks start drawing connectors unexpectedly, press **Esc** to leave connection mode.

### Common fixes
- **Elements not lining up?** Select them and use **Smart Align**.
- **Connector crossing a shape?** Move the shape slightly, or drag the connector's endpoint to a
  different side.
- **Boundary event won't attach?** Drop the intermediate event directly onto the host's edge.

### Keyboard shortcuts (reference)

| Action | Shortcut |
|---|---|
| Save now | Ctrl / Cmd + S |
| Undo / Redo | Ctrl / Cmd + Z / Y |
| Delete selection | Delete / Backspace |
| Multi-select | Shift + click / drag marquee |
| Pan | Space + drag |
| Leave connection mode | Esc |

---

> **Coverage check (remove before publishing):** Getting Started · Projects/Folders · all 8 Diagram
> Types incl. ArchiMate · Canvas · Building (palette, connectors, select-and-connect, auto-connect) ·
> Editing tools · BPMN essentials · Properties/styling/bubble-help · **AI (incl. Record/Dictation,
> Clarification, two-phase, Staff Narrative)** · **Simulator (incl. as-is/to-be, Operator,
> examples)** · Value/analysis · **Publishing (versions, bundles, Process View, review, sharing)** ·
> **Import/Export (all formats, SharePoint, DDL)** · **Backup/Restore (user/org/full)** · Entity
> Lists · Collaboration/Notifications · Account/Plans · OrgAdmin · SuperAdmin (incl. this editor) ·
> Tips/Shortcuts. Add screenshots per section as captured.
