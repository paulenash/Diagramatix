# Diagramatix — Menu & Action Reference

Every menu option, button, and action available on the three main screens — **Dashboard**, **Project**, and **Diagram editor** — with a short description of what each one does.

**Conventions**
- **SA** = SuperAdmin‑only · **OrgAdmin** = Org Owner/Admin only · **Owner** = project/diagram owner only · **BPMN** = BPMN diagrams only · **RO‑hidden** = hidden in a view‑only share / impersonation · **entitlement** = gated by subscription tier / view mode · **Microsoft** = requires a Microsoft/SharePoint sign‑in.
- **Export / Import / Save destinations:** most Export, Import, and Save actions branch into a **Local** (download / file picker) or **SharePoint** (OneDrive/SharePoint folder) destination. Each format is described **once** below — the destination is simply where the file goes. SharePoint options are greyed unless Microsoft/SharePoint is connected.

---

# 1. Dashboard screen

## Top bar — left
- **Logo (double‑click)** — cycles a SuperAdmin through the presentation view‑mode tiers (superadmin → orgadmin → expert → professional → introductory) to preview each subscription tier's feature gating. *(SA effect only.)*
- **Version label** — static build version `v{schema}.{commit}`.
- **Subscription chip** — opens the Usage popover: your effective usage vs plan limits and the upgrade path.

## Top bar — right
- **📚 Portal** — opens `/portal`, the org‑wide read‑only Process Portal to browse/search every published process you can access. *(RO‑hidden.)*
- **SuperAdmin** — opens the SuperAdmin dashboard. *(SA.)*
- **OrgAdmin** — opens the Org Admin area (Registered Users, Org Settings, Project Sharing). *(OrgAdmin.)*
- **Notifications bell** — opens the Notifications & Feedback panel; the red badge shows unread count.
- **System ▾** — the unified import/backup/settings menu:
  - **Import ▸** — bring in an external file as a **new project**: **JSON (Project)**, **XML** (both Diagramatix project exports), **Visio** (`.vsdx`, pick pages → one diagram per page), **BPMN** (a folder of `.bpmn` files → one diagram each), or **DDL** (SQL DDL → a Domain/UML diagram, *SA*).
  - **AI Prompt Maintenance** — opens the AI generation prompt library editor.
  - **Deleted Diagrams** — the archive of soft‑deleted diagrams (recover them here).
  - **◈ Simulator Examples / ⛏ Process Mining Examples / ⚖ Risk & Control Examples** — adopt a ready‑made example. *(each an entitlement.)*
  - **Backup…** — downloads a complete `.diag` backup of all your projects, diagrams and templates, with live progress.
  - **Restore…** — restores a `.diag` backup alongside your existing content.
  - **Zoom ▸ Initial Zoom…** — sets the zoom used when opening any diagram (default 70%). **Zoom ▸ Edit Zoom…** — sets the focus‑edit label zoom fraction and its on/off toggle.
  - **Matrix Screensaver…** — sets the idle seconds before the katakana‑rain screensaver activates.
  - **Collaboration Groups** — manage collaboration groups (used for review routing and sharing).
- **Features** — opens the public `/features` page in a new tab.
- **Org name chip** — read‑only active organisation name.
- **Account** — opens Account Settings (see below).

## Reviews (shown only when you have reviews)
- **Diagrams Received for Review** — a tile opens the diagram in **Review Mode**; per‑tile **Approve** (sign‑off), **Submit comments**, **Decline**.
- **Diagrams Sent for Review** — **Show/Hide reviewers**, **Re‑submit for final approval** (resets reviewers + re‑notifies), **Finish review** (closes it).

## Projects
- **Hide / Show Examples** — hides adopted example‑project tiles (per‑browser).
- **+ New Project** — creates a project and opens it.
- **◎ Create APQC Project** — creates a project pre‑seeded with an APQC PCF folder structure. *(entitlement.)*
- **Project tile** — single‑click **selects** (shows the Project Properties sidebar); double‑click **opens** the project; right‑click opens the tile context menu; drag a Sandpit diagram onto it to move it in. Hover actions: **⧉ Clone project**; **Shared (N)** popover for owners of a shared‑out project.
- **Project tile context menu** — **Open**; **⛏ Process Mining** *(entitlement)*; **Clone project**; **x — Delete (diagrams → Sandpit)** *(owner/OrgAdmin/SA)*; **x+ — Delete (diagrams → Archive)** *(OrgAdmin)*; **x++ — Hard delete: project + all diagrams** *(SA + owner; permanent)*.

## Published / Sandpit
- **Published by me** — tiles open the published diagram; **Bundles I've published** have **Archive** (revokes audience access).
- **Published to me** — bundles/diagrams shared into an audience you belong to.
- **Sandpit** — unorganised diagrams (no project): **+ New Diagram**, per‑card **↗ Move to** a project, **✕** delete (→ archive).

## Project Properties sidebar (project selected)
- **✕** close · **Description** (editable by owner) · **Shared with N** (recipient list + roles) · **Manage Sharing…** (add/remove recipients, change View/Edit roles — *owner, non‑example*).

## Account Settings
- Edit **Name / Email / Organisation Name**, **Change Password**, **Delete my account…** *(GDPR erasure; hidden for SA)*, **Sign Out**, **Save**.

---

# 2. Project screen

## Header
- **Dashboard** — back to the dashboard.
- **Project name** — click to rename inline (owner). *(RO‑hidden.)*
- **Version chip / Org Owner chip** — read‑only.
- **SuperAdmin** — SuperAdmin dashboard. *(SA.)*

## Project ▾
- **Configuration** — the project‑wide colour + font config editor (affects every diagram's thumbnails and defaults).
- **Scan BPMN Diagrams for Issues** — scans **every BPMN diagram** in the project for structural/layout problems (connectors on a Pool/Lane, duplicate Pool/Lane names, single‑lane pools, hanging messages, BPMN rule violations) and opens a results report (issues also show red on the canvas).
- **Scan Diagrams for Links** — finds drill‑down elements (subprocesses, and Value Chain / Process Context / ArchiMate link shapes) whose name matches another diagram and links parent → child, placing a return marker on the child. Confirms definite (exact/prefix) and probable (fuzzy) matches before applying.

## File ▾ (Export / Import — Local or SharePoint)
**Export**
- **JSON (Project)** — the whole project (all diagrams' data + folder structure + metadata) as one Diagramatix JSON file.
- **XML & XSD** — the same payload as one Diagramatix **XML** file **plus its matching XSD** so the XML validates. The multi‑diagram sibling of a single diagram's XML export.
- **Visio (.vsdx) — all BPMN** — all BPMN diagrams as one multi‑page Visio `.vsdx`. *(disabled if the project has no BPMN diagram.)*
- **Visio Stencil** *(Local)* — downloads the BPMN Diagramatix Shapes v1.6 `.vssx` stencil to install in Visio.

**Import**
- **JSON (Project Diagrams)** — **appends** a JSON export's folders/diagrams into the **current** project under a new "(imported)" folder (preview first).
- **XML** — creates a **new** sibling project from a Diagramatix XML file.
- **Visio (.vsdx)** — pick pages from a `.vsdx` and import them as diagrams (into this or a new project).
- **BPMN** — imports a `.bpmn` file as a new diagram (into an "Imported BPMN Diagrams" folder).
- **AI Diagram Bundle** — recreates a diagram plus its AI prompt/plan/comparison matrix/per‑model diagrams from a `.bundle.json`. *(SA.)*

## Header action buttons
- **+ New Diagram** — opens the New Diagram dialog (name + type: Context, Process Context, State Machine, BPMN, Domain/UML, Value Chain, ArchiMate, Standard Flowchart).
- **◎ Create APQC Process** — pick a standard APQC PCF process → AI‑generates its BPMN and opens it. *(entitlement + AI enabled.)*
- **◈ Simulator** — the process simulation console (As‑is/To‑be). *(entitlement.)*
- **⛏ Process Mining** — discover the real process from event logs + conformance check; can hand off to the Simulator. *(entitlement.)*
- **◆ Risk & Controls** — the risk/control catalogue + Risk‑Control Matrix. *(entitlement.)*
- **SOP Templates** — upload a Word template used for this project's SOP exports.
- **User Guide** — the in‑app user guide.

## Left sidebar — folder tree
- **Sort selector** — per‑folder diagram order (Manual/Name/Modified/Type).
- **Refresh navigation tree (↻)** — re‑fetch diagrams + folders.
- **Folder row** — collapse/expand; **rename**; **add subfolder**; **expand/collapse all subfolders**; **delete** *(only when empty)*.
- **Diagram row** — click selects (multi‑select with Ctrl/Shift); **double‑click opens**; drag to a folder to move; **rename**; **delete** (→ archive); Shift+↑/↓ reorders.
- **Project Structure** — adopt/sync an Entity/Organisation Structure, or build one from the project's BPMN pools/lanes/systems.
- **Project SOPs** — the generated SOP documents for the project.
- **Bulk panel** (when ≥1 diagram selected) — **Move to folder…**, **Delete N…**, **Clear selection**.

## Main pane — diagram tiles
- **Single‑click** a tile — selects it and shows the **Diagram Properties** aside; **double‑click** opens the editor.
- Per‑tile: **→BP (Translate to BPMN)** *(flowchart tiles only, one‑way)*; **Clone**; **Move to project (↗)**; **Delete (✕)** (→ archive).

## Diagram Properties aside (tile single‑clicked)
- **Open ↗** / **✕**. Editable, saved back to the diagram: **Title** (Name/Version/Authors), **Diagram Details** (Purpose + rich‑text Description); **BPMN**: Process Owner, Procedure Document. **Diagram Owner** and **PCF** are read‑only here (edited in the diagram). *(read‑only in a view‑only share.)*

## Project Properties panel (whole project selected)
- **Name / Description / Owner** (editable). **APQC Framework** — Link/Change/Unlink a PCF framework, **◑ View APQC coverage…**. **Process Numbering** — **＃ Configure / Renumber…** (APQC‑preserving or Full) and a **Show non‑APQC (highlight)** toggle.

---

# 3. Diagram editor screen

## File ▾
- **Save As…** — clones the diagram into the same project under a new name.
- **Translate to BPMN…** — *(flowchart only)* creates a new BPMN diagram from this flowchart (one‑way).

**Export (Local or SharePoint)**
- **PDF** — opens an export dialog (choose **scale** and **which annotations to include** — Review Comments / Pain Points / Issues, all off by default), then renders the diagram to PDF.
- **SVG** — the diagram as an `.svg` vector (same annotation dialog).
- **JSON** — the diagram as a single‑diagram Diagramatix JSON (same annotation dialog); round‑trips via Import ▸ JSON.
- **XML (Diagramatix)** — *(BPMN)* the diagram's Diagramatix XML **plus its XSD**; annotations always excluded.
- **BPMN 2.0 XML** — *(BPMN)* standard OMG BPMN 2.0 (`.bpmn`) with a full BPMNDI layout section, so it opens laid‑out in Camunda / bpmn.io / Signavio; round‑trips via Import ▸ BPMN. Annotations always excluded.
- **Visio (for stencil v1.6)** — *(BPMN)* a Visio `.vsdx` built against the Diagramatix v1.6 stencil. **Visio (for stencil BPMN_M)** *(BPMN, SA)* and **Visio (UML)** *(Domain, SA)* are maturing variants. **Visio Stencil** downloads the `.vssx` to install.
- **Diagram Bundle (AI)** *(Local, SA)* — the diagram + its AI prompt/plan/comparison matrix/per‑model diagrams as one `.bundle.json`; annotations always excluded.
- **Templates** *(Local, BPMN)* — exports your templates as a `.diag_tems` file.

**Import (Local or SharePoint)**
- **JSON** — replaces the current diagram's contents with the first diagram in a JSON file.
- **XML** — *(BPMN)* replaces contents from a Diagramatix XML file.
- **Visio** — *(BPMN)* imports a Visio `.vsdx` as a new diagram.
- **BPMN** — *(BPMN)* imports an OMG BPMN 2.0 `.bpmn` as a new diagram.
- **Templates** *(Local, BPMN)* — imports templates from a `.diag_tems` file. **Visio (UML)** *(Local, Domain, admin)* imports a Visio UML `.vsdx` as a new domain diagram.

## Header controls
- **← Back** — returns to the point of invocation. **Logo double‑click** cycles SA view‑mode chrome.
- **Diagram name + type badge + version** — display only.
- **+ New Diagram** — confirm unsaved, then the project's New Diagram dialog. **SuperAdmin** — SA dashboard.
- **Lifecycle pill** — Published/Draft/Archived state (read‑only for non‑owners).
- **Publish ▾** *(owner, non‑example)* — **Publish v{n}…** (publish a new immutable version), **Publish bundle…** (publish the diagram + linked descendants to business users).
- **Feedback** *(owner, once Published)* — the panel of business‑user feedback.
- **PresenceBar** *(co‑authoring)* — avatars of others in the diagram.
- **Sync (⇄)** *(co‑authoring, 2+ present)* — pull everyone's committed changes + push yours (3‑way merge).
- **Active / Viewer** *(live cursors, 2+ present)* — toggle broadcasting your cursor/edits vs just watching.
- **Save** — ● Unsaved / Saving… / ✓ Saved (Ctrl+S). **Prev/Next folder nav (« »)** — jump to the previous/next diagram in the folder. **Undo / Redo** — Ctrl+Z / Ctrl+Shift+Z.
- **Generate SOP** *(BPMN, in a project)* — generate a Standard Operating Procedure from the whole diagram or a lane/pool/subprocess.
- **Space ▾** *(BPMN/state‑machine/ArchiMate)* — **Insert Space** / **Remove Space** to push elements apart or close a band.
- **Alignment ▾** *(2+ selected)* — Align Centres Horizontally / Vertically / **Smart!**.
- **Resize ▾** *(2+ selected)* — match selection to Tallest / Shortest / Widest / Thinnest.
- **Templates ▾** *(BPMN)* — Create User/Built‑In Template + apply/edit/delete template lists.
- **AI Comparison Results** *(SA, when present)* — the multi‑model comparison modal.
- **Highlight** *(Process Context)* — dim all but the selected element and its connections. **Entity Drift** — ring names not in the adopted Entity Structure. **Comments:** — filter shown review comments by reviewer.
- **✨ AI Generate** — the AI plan/generation panel *(hidden when AI is disabled or read‑only)*.
- **👻 Assist** *(BPMN)* — opt‑in ghost next‑step suggestions. **🪄 Abracadabra** *(BPMN, SA)* — live voice/typed command editing.
- **Diagram ▾** — **◈ Simulator** *(BPMN)*, **▸ Animate!**, **Send for Review**, **Get help**, **Clear Diagram**, **Clear All but Selected**, **History** (view/restore versions), **Configuration** (see below), **Process description** (deterministic plain‑language, no AI), **Scan Diagram for Issues** *(BPMN)*.
- **User Guide** — opens `/help`.

**Banners:** view‑only **Feedback** banner (drop a Review note → **Send Feedback** to the owner) and the **Review Mode** banner (**Approve / Submit comments / Decline**).

## Canvas corner controls
- **Zoom bar** — −, slider (25–250%), +, editable %. **Auto‑connect toggle** *(BPMN/flowchart)* — auto‑connect dropped shapes. **Bubble help ON/OFF** — the "how to connect" help clouds. Live **zoom %** readout bottom‑left.

## Configuration modal (Diagram ▾ ▸ Configuration)
- **Display mode** (hand‑drawn / normal), colour config, **Debug mode** *(admin)*, **Show value display**, **Show bottleneck**, and per‑role **font sizes** (element, connector, title, pool, lane, process, value‑chain, description).

## Properties panel (right)
Shows **Diagram Properties** at the top in every context. Collapsible sub‑sections (open when populated):
- **Title** — show‑title toggle, status, version, authors, created/modified.
- **Diagram Details** — Purpose + rich‑text **Description**.
- **Database** *(Domain)* — DB type. **Free‑form / imported layout** *(BPMN)* — relax pool/message rules for imported diagrams.
- **Pain Points / Issues** — display toggles + per‑item description/delete. **Review Comments** — display toggle + note list.
- **Diagram Owner** — assign a registered user. **Process Owner** — Name/Email. **Procedure Document** — SOP URL/label (+ Open SOP link). **Process Classification (PCF)** — APQC classify widget.
- Selecting an **element** or **connector** switches the lower panel to that item's editable properties (label, type‑specific fields, Risk & Controls, Simulation, SharePoint file link).

## Left palette
The per‑diagram‑type symbol palette — the draggable shapes for the current diagram type (BPMN, flowchart, ArchiMate, Domain/UML, Process Context, State Machine, Context). In a view‑only feedback share it's replaced by the single pink "Give Feedback" (Review note) tool.

---

*Export/Import/Save actions that offer a **Local** or **SharePoint** destination are listed once above; SharePoint requires a connected Microsoft account and an org with SharePoint enabled.*
