# Diagramatix — User Guide Audit

**Date:** 2026‑08‑01 · **Author:** engineering audit · **Deliverable:** differences between the live User Guide and the actual app, with draft copy for every change.

**Method.** The live guide (43 chapters) was pulled from the production‑parity database and captured in [`CURRENT_GUIDE_SNAPSHOT.md`](./CURRENT_GUIDE_SNAPSHOT.md). It was compared against a full feature inventory read from the current codebase — the diagram editor (toolbar, canvas gestures, palette, properties, connectors), the dashboard and project screen, the SOP feature, the entity‑structure tools, SharePoint, account/navigation, and the **38 SuperAdmin tiles + 14 OrgAdmin cards**, AI models/providers, and AI Usage.

**Approach for every item (as requested):**
> **1. What it is & its intention** · **2. How it's implemented (from the user's perspective)** · **3. How the user uses it**

For **additions**, the three parts are draft copy in the guide's voice — ready to paste. For **changes**, the current (wrong) text and the corrected replacement are given.

---

## Executive summary

The guide is broad and largely current for the *classic* editor (canvas, connectors, BPMN, domain/UML, value chain, simulation, mining, risk & controls, APQC, portal, entity lists, backup, collaboration). The gaps cluster in **two places**: (1) whole feature areas shipped in the last ~6 weeks that were never documented, and (2) the **admin surface** — roughly **half of the 38 SuperAdmin tiles and most OrgAdmin cards are undocumented or only glancingly covered**. A handful of existing statements are now factually wrong.

### Priority index

| # | Item | Type | Guide today |
|---|---|---|---|
| 🔴1 | **SOP generation** (generate / scopes / hand‑offs / editor / .docx / Word templates / figure) | ADD — new chapter | none |
| 🔴2 | **ArchiMate diagrams** (palette v3.2, layers, box/icon, junctions, relationship picker + 3.2 matrix, relationship editing) | ADD — new chapter | ch2 names the type only |
| 🔴3 | **AI model & provider choice** — ch31 hard‑codes "Sonnet"; the model is configurable across 5 providers | CHANGE ch31 | wrong |
| 🟠4 | **AI Usage** analytics (Raw/User Attempts, tokens, cost, invocation points incl. *SOP Generate*) | ADD | none |
| 🟠5 | **AI Models Selection** admin page + provider catalogue (Claude/Kimi/Gemini/GPT/Ollama) + cost catalog | ADD | none |
| 🟠6 | **SuperAdmin chapter is ~⅓ of the surface** — ~20 undocumented tiles (see §A6 table) | ADD/EXPAND ch29 | thin |
| 🟠7 | **"Add missing from BPMN"** (non‑destructive entity merge) + reconcile the 4 entity buttons | ADD — section ch34/41 | none |
| 🟠8 | **Procedure Document** now *generates* SOPs (was: paste a link) | CHANGE | wrong |
| 🟡9 | **Account**: GDPR self‑delete; password min is **8** (guide implies 6); org rename is Owner/Admin‑only | CHANGE ch30 | wrong/thin |
| 🟡10 | **Palette**: Pain Points & Issues on **every** diagram type; **drag‑only** placement; on‑screen labels ≠ canonical names | CHANGE ch4 | inaccurate |
| 🟡11 | **Canvas power gestures** — force‑connect, group‑connect‑to‑gateway, diamond‑connect, right‑click quick‑add, ArchiMate tree‑highlight, Ctrl‑click Space | ADD/EXPAND ch3/6/7/15 | partial |
| 🟡12 | **Project screen** — the two ↻ refreshes, the full File▾ import/export matrix, "sharing is on the Dashboard", backup is org‑level | CLARIFY ch1/12/13 | partial |
| 🟢13 | View‑mode tiers · Feature Colours · Feature entitlements/catalog · Document Editor/Image Library/Tech Notes · Screencast Studio · Subscriptions/Stripe · Enterprise (audit/GDPR/SSO/policy) | ADD | none |
| ⚪ | Cosmetic **code** drift ("ArchiMate 3.1" comments, "11 relationship types", password placeholder "min 6") — not guide content | note | — |

---

# PART 1 — ADDITIONS REQUIRED

## A1 · NEW CHAPTER — "Standard Operating Procedures (SOPs)"  🔴
*Zero coverage today. Biggest single gap. Suggested placement: after ch31.*

**A1.1 Generating an SOP**
1. **Intention.** Turn a BPMN process into a written, followable SOP. A deterministic reader walks the diagram (so steps, roles, systems and hand‑offs are never invented), then AI writes it up under your house style. You choose how much of the process the SOP covers.
2. **Implementation.** On a BPMN diagram **in a project**, the toolbar shows **Generate SOP**, opening a dialog with four scopes: **Whole diagram**; **A Lane (role SOP)** — only that role's steps, with hand‑offs (greyed if no lanes); **A Pool**; **A Subprocess** (its linked child diagram if linked). Scoped options add a **"Which …?"** picker.
3. **Use.** Open a BPMN diagram in a project → **Generate SOP** → pick a scope (and the element) → **Generate SOP**. ~15–30 s later the editable SOP opens, with a picture of the diagram embedded.

**A1.2 Role (Lane) SOPs & hand‑offs**
1. **Intention.** A role‑specific procedure that keeps **global step numbers** (so a lane SOP legitimately reads "step 1 … 3 … 7", never renumbered) and spells out what the role **receives from** and **hands off to** other lanes.
2. **Implementation.** Choosing **A Lane (role SOP)** / **A Pool** inserts a **Hand‑offs** section (after "Procedure") with **Receives** and **Hands off** lists.
3. **Use.** Pick **A Lane (role SOP)**, choose the lane, Generate.

**A1.3 Editing an SOP**
1. **Intention.** Review/refine before sharing.
2. **Implementation.** Full‑page editor: **← Project** back link, a **Draft/Published** dropdown, **Export .docx** and **Save**. Each section card has an editable heading and a rich‑text body (the same editor used to write this guide). Default sections: Purpose, Scope, Roles & Responsibilities, Procedure, [Hand‑offs — role scope], Inputs & Outputs, Systems, Risks & Controls, Related Processes & Documents, Revision History, and **Process Diagram** (the figure).
3. **Use.** Edit title/sections; reorder **↑/↓**; delete **✕**; **+ Add section**; **Remove figure**; set **Published**; **Save**. *(No in‑editor regenerate — to regenerate, use Generate SOP again on the diagram.)*

**A1.4 Export to Word (.docx)** — 1. Download a Word doc in your house style. 2. The **Export .docx** header link downloads `{Title}.docx` immediately; the figure embeds; fonts/heading styles come from your org/project Word template. 3. Click **Export .docx**.

**A1.5 SOP Word templates (per Org and per Project)**
1. **Intention.** Upload your organisation's SOP **Word template** once; every export adopts its **fonts and heading styles**. A project template overrides the org default.
2. **Implementation.** **Org:** *OrgAdmin → SOP Templates* tile. **Project:** a **SOP Templates** link in the project header. Both host the same manager: **Add a template** (name, a **.docx/.dotx** ≤ 8 MB, **Default** checkbox, **Add**), and a list with a green **Default** badge, `📄 filename`, **Set default**, **Delete → Confirm**. Empty file = name‑only template (built‑in look). Resolution: **project → org default → built‑in**.
3. **Use.** Go to the SOP Templates page → name it, choose the `.docx`, tick **Default**, **Add**.

**A1.6 AI Usage note.** Each SOP generation is a metered AI attempt shown in **AI Usage** as **"SOP Generate"**.

> **State honestly:** there's no project‑screen *list* of generated SOPs and no in‑app *delete* yet; a **whole‑diagram** SOP reopens via the diagram's **Properties → Procedure Document** link; lane/pool/subprocess SOPs are reachable from the editor right after generating. A "group/suite" scope exists internally but isn't offered in the dialog.

## A2 · NEW CHAPTER — "ArchiMate Diagrams"  🔴
*ch2 lists ArchiMate as a type; otherwise no content, despite a full ArchiMate 3.2 surface.*

**A2.1 The ArchiMate palette (v3.2).** 1. A category accordion (header **"ARCHIMATE v3.2"**) because the language has ~60 elements across seven layers. 2. Collapsible, colour‑themed sections — **Business** (open), **Motivation, Strategy, Application, Technology, Implementation & Migration, Composite** — each a 2‑column grid; the layer prefix is dropped for display (so "Business Service" reads "Service"); categories reorder with **▲/▼** (saved per browser). 3. Expand a category, **drag** an element onto the canvas (drag‑only). *(Draft the per‑layer element list from the palette inventory: Business Actor…Representation; Motivation Stakeholder…Value; Strategy Resource/Capability/Course of Action/Value Stream; Application …; Technology Node…Material; Implementation Work Package…Gap; Composite Grouping/Location/And‑Junction/Or‑Junction.)*

**A2.2 Box vs icon.** Actor, Service, Event, Application Component, Node, Value Stream draw as a **box** (glyph in the corner) or **icon‑only** (the glyph *is* the shape). Drag the box or the **"(icon)"** row, or switch on an existing shape via **Properties → Representation → Box/Icon**.

**A2.3 Junctions.** And‑Junction = filled dot, Or‑Junction = open ring (in **Composite**). Composition, Aggregation, Realisation and every directed relationship may point **into** a junction.

**A2.4 Choosing a relationship (the 3.2 matrix).** 1. ArchiMate limits which relationships are valid between two elements; Diagramatix enforces the authoritative **3.2** matrix. 2. Drag a connector between two shapes → a **"ArchiMate relationship"** picker opens, grouped **Structural / Dependency / Dynamic / Other**, 12 types with live preview glyphs; disallowed ones greyed ("not permitted between {source} and {target}"), permitted ones "permitted by ArchiMate 3.2"; **Influence** then asks a strength. 3. Drag → pick (Enter/Esc) → Influence strength. To change later: **Properties → Relationship Group / Relationship Type** (also matrix‑filtered). *(Include the style table: Composition = filled diamond+open arrow; Aggregation = open diamond+open arrow; Assignment = ball+filled arrow; Realisation = dotted+hollow triangle; Serving = open arrow; Access = dotted+open arrow; Influence = dashed+open arrow+strength; Association = plain; Directed Association = half arrow; Triggering = filled arrow; Flow = dashed+filled arrow; Specialisation = hollow triangle.)*

**A2.5 Layout aids & related tools.** **Space** (Insert/Remove) and **Auto Layout** work on ArchiMate; there's no per‑symbol colour panel (layer‑themed). **Shift‑click** grows a related‑element **tree highlight** (Shift‑click to prune, double‑click empty canvas to clear). The SuperAdmin **ArchiMate Icon Library**, **Icon Maintenance**, and **Relationship Explorer** tools are covered in the SuperAdmin chapter (§A6).

## A3 · CHANGE + EXPAND — AI model/provider (ch31) — see **C1**.

## A4 · NEW SECTION — "AI Usage"  🟠
1. **Intention.** See how much AI the org consumes and how many **User Attempts** each member has used against their monthly allowance.
2. **Implementation.** *OrgAdmin → AI Usage* (SuperAdmin has the same tile, plus per‑org/top‑user tables and a rate editor). Filters: Range, Provider, Model, **Invocation point**, (SuperAdmin) Organisation. Cards: **Raw Attempts** (every call incl. AI Tidy/Compare/failures), **User Attempts** (quota‑metered successes), **Diagrams (AI)**, **Est. cost**, tokens, retries, successes/failures. Charts: over time, by invocation point, by model, by provider, reliability. Invocation points include BPMN Plan/Generate/Refine, Diagram Generate, Mining ×3, Staff Narrative, **SOP Generate**, Dictation Refine, Icon Vectorize. AI Tidy / Vectorize / Compare are counted for stats but **not** against User Attempts.
3. **Use.** Open **AI Usage**, set the period/filters, read the per‑member attempts and cost breakdown.

## A5 · NEW SECTION — "AI Models & Providers" (SuperAdmin) + expand ch31  🟠
1. **Intention.** One admin setting picks the model used for AI generation for everyone, with a cost comparison.
2. **Implementation.** *SuperAdmin → AI Models Selection* (`/dashboard/admin/ai-model`): a **Default model** dropdown, an optional **Vision model** (for dropped images), warnings (Moonshot is slow/times out on Azure; a text‑only default needs a vision model), and a **Cost comparison** table ($/1M in‑out + "≈ / generation"). Providers, each gated on keys: **Anthropic** (Fable 5, Opus 5, Opus 4.8, Sonnet 5, **Haiku 4.5 = default**), **Kimi/Moonshot** (K3/K2.6/K2.7‑Code), **Google Gemini** (2.5 Pro/Flash), **Microsoft GPT** (prod: GPT‑5‑mini / GPT‑5.4‑mini), **Ollama** (local), plus custom gateways. An editable **cost‑rate catalog** (in AI Usage) drives cost figures.
3. **Use.** Admin → **AI Models Selection** → set the default (and optional vision) model → review costs → Save. Edit per‑model rates in **AI Usage**.

## A6 · EXPAND — SuperAdmin & OrgAdmin chapters (ch28/ch29)  🟠
ch29 covers only a fraction of the **38** SuperAdmin tiles (drag‑reorderable grid, "SuperAdmin Tools"). The following are **undocumented or thin** — add a short 3‑part entry each (the "what to add" line is the seed of part 1):

| Tile | Status | What to add |
|---|---|---|
| **AI Models Selection** | MISSING | pick the org‑wide model + vision model + cost table (§A5) |
| **AI Usage** | MISSING | the analytics dashboard (§A4) |
| **ArchiMate Icon Library** | MISSING | upload image → AI‑vectorise → edit primitives → save → assign to an element type |
| **ArchiMate Icon Maintenance** | MISSING | per‑element corner‑glyph offset/size (px or %) |
| **ArchiMate Relationship Explorer** | MISSING | pick Source+Target → see box shapes + every permitted 3.2 relationship, either direction |
| **Feature Colours** | MISSING | per‑feature Background+Text colours applied to menus/tiles/AI controls/entity‑drift ring |
| **Features Catalog** | MISSING | edit the public feature list, draft→publish to `/features` |
| **Subscription Prices & Limits** | MISSING | tier pricing + per‑tier feature limits |
| **Document Editor** | MISSING (meta) | authors the User Guide / Tech Design Notes / Other Documents; .docx + .diag‑guide export/import |
| **Technical Design Notes (read‑only)** `/tech-notes` | MISSING | read‑only design notes |
| **Image Library** | MISSING | upload/replace‑everywhere/delete guide & notes images |
| **Database Access** | MISSING | inspect DB / run maintenance queries |
| **Schema Validation** | MISSING | Diagram‑JSON validation findings (observability) |
| **Audit Log** | MISSING | privileged‑action trail (impersonation/exports/restores/deletes/policy) |
| **System Archive** | MISSING | system‑wide archived projects/diagrams (restore) |
| **BPMN Scanner Rules** | MISSING | rules for the diagram issue scanner |
| **Bubble Help** | MISSING | edit the in‑editor help‑cloud topics |
| **APQC PCF Hierarchy Colours** | MISSING | two‑tone colour per PCF level |
| **Simulator / Mining / Risk‑Control Examples** (3 tiles) | MISSING | curate adoptable sample catalogues |
| **AI Plan Formats** | MISSING | saved 2‑phase plan‑format templates |
| **Project Org Maintenance** | PARTIAL (ch39) | re‑home a project's owning Org (renumbers RCM) |
| **Diagram Types / Sort Order** | PARTIAL (ch2) | 2‑char codes + colours; global type order |
| **Registered Users** | PARTIAL (ch29) | roster sort/filter, comp/trial badges, two‑stage delete, View/Edit impersonation |
| **DDL Generation (admin)** | PARTIAL (ch27) | Logical vs **Physical** (introspects live DB) schema dump |

**OrgAdmin (ch28)** — of the 14 cards, add coverage for: **SOP Templates**, **AI Usage** (org totals), **Notifications & Feedback**, **Backup & Restore** (selective per‑member restore — verify vs ch13), **Team Membership**; note feature‑gated cards grey out ("Not included in your subscription").

## A7 · NEW SECTION — "Add missing from BPMN" (ch34/ch41)  🟠
1. **Intention.** Non‑destructively enrich a project's Entity Structure from its BPMN — add **only what's missing**, keep everything else (incl. manual additions). Counterpart to **Populate from BPMN** (which mints a new master you then Adopt = a full replace).
2. **Implementation.** In **Process Structure**, next to **Populate from BPMN**, an **Add missing from BPMN** button; runs immediately and reports "Added N missing entries … (your existing entries were kept)" or "Nothing missing…". Needs edit access.
3. **Use.** Expand **Process Structure** → **Add missing from BPMN**.

> **Reconcile the four buttons in this chapter:** **Adopt a structure** (clone a master → full replace on re‑adopt), **Populate from BPMN** (mint a new master; doesn't change the current structure until you Adopt), **Add missing from BPMN** (merge into the current structure), **Sync updates** (pull master changes, keep additions).

## A8 · NEW — Collaboration dialogs (verify/expand ch32)
ch32 should cover, with the real controls: **Publish to business users** (bundle a root diagram + its link closure, invite by email, next‑review cadence), **Publish version v‑n** (freeze a snapshot; keep editing the live draft), **Send for Review** (to Collaboration Groups, per‑reviewer, objective + due date), the **Feedback** panel (open/acknowledged/resolved/dismissed triage), and **History** (last 50 auto‑snapshots; Preview/Restore). Also the editor's **Send to support** dialog (emails support with an SVG + JSON).

## A9 · NEW — the P4 tail
Short chapters/sections for: **Screencast Studio** (record a diagram walkthrough), **Subscriptions / self‑serve Stripe checkout** (AU$50/$120/$200 tiers — note the open "double subscription on upgrade" caveat), **Enterprise** (audit log, GDPR self‑erasure, `Org.requireSso`, the policy engine), **Feature entitlements per tier** (which of simulator/mining/riskControl/apqc a tier gets), and the **View‑mode preview cycle** (below).

**View‑mode preview cycle (SuperAdmin).** 1. Preview/demo the app as each customer tier. 2. Double‑click the top‑left logo to cycle **superadmin → orgadmin → expert → professional → introductory**; the chrome, entitlements and tier chip change live (persists per browser; resets to superadmin each build). 3. Double‑click the logo repeatedly.

---

# PART 2 — CHANGES REQUIRED (existing chapters now inaccurate)

## C1 · ch31 "AI Diagram Generation" — the model is configurable, not "Sonnet"  🔴
**Current (wrong, ~5×):** "sent to **Sonnet** … **Re‑send to Sonnet** … **Sonnet** reverse‑engineers … **Sonnet** rewrites …".
**Replacement (3‑part):**
> **1. Intention.** Describe a process in plain English (or attach a document/screenshot) and Diagramatix drafts the diagram.
> **2. Implementation.** The **AI Generate** panel (or **AI Plan (2‑phase)** for BPMN) sends your prompt + rules to **the AI model your administrator has selected** (default *Haiku 4.5*; your org may offer Claude, Kimi, Gemini, Microsoft GPT or a local model). When several are available, an **AI Model** dropdown lets you choose per generation. The panel also has **✨ Refine prompt** (AI asks clarifying questions first), **AI Tidy Questions** (cleans a dictated/attached transcript), **Dictate**, **Attach** (PDF/image), and — for SuperAdmins — **Compare all/selected models**.
> **3. Use.** Type/dictate → optionally **Refine** → pick a **model** → **Generate** (single‑phase) or **Plan → Apply Layout** (2‑phase BPMN). Save the prompt (and, for BPMN, its plan) to reuse.

Replace every "Sonnet" with "the configured AI model"; add a "Which model?" pointer to *SuperAdmin → AI Models* and *AI Usage*.

## C2 · "Procedure Document" — now generates SOPs  🟠
**Current:** "paste a link — a SharePoint/OneDrive file … or any URL".
**Change:** keep paste‑a‑link, add: *"Or click **Generate SOP** in the toolbar to have Diagramatix write an editable Standard Operating Procedure from the diagram (see the SOP chapter). A whole‑diagram SOP automatically fills in this Procedure Document link."* Cross‑link A1.

## C3 · ch30 "Account Settings"  🟡
- **Add GDPR self‑delete:** a **Delete my account…** danger zone — type your exact email to confirm; erases you and all your projects/diagrams/templates (published items survive with no author). **Not available to SuperAdmins** (contact support) or while impersonating.
- **Password minimum is 8**, not 6 (the field hint says "min 6"; the server enforces 8). Document 8.
- **Org rename requires Owner/Admin** — a plain member can type a new name but the save is rejected.

## C4 · ch4 "Palette & Elements"  🟡
- **Pain Points & Issues are on *every* diagram type** (not UML‑only).
- **Placement is drag‑only** — no click‑to‑add, **no palette search**. Fix any wording implying otherwise.
- **On‑screen labels differ from canonical names:** "Process" is reused by four symbols; a UML class shows as **"Entity"**; the container is **"Process Group Header"**; the scheduler is **"Auto Scheduler"**; a pool is **"Pool/Lane"** (drag onto a pool to add a lane). Use the on‑screen labels.

## C5 · Canvas gestures (ch3/ch6/ch7/ch15) — add the power moves  🟡
Verify and add where missing: **Force‑connect** (Shift+Ctrl+Click source → click target, bypasses BPMN validity); **Group‑connect to a merge gateway** (multi‑select activities, **double‑click** the gateway); **Diamond‑connect** (select decision + activities + merge, double‑click any to wire the whole split/merge); **right‑click quick‑add** shape grid on empty canvas and the **element type‑picker** right‑click menu; **Insert/Remove Space via Ctrl‑click** (as well as the Space button); **ArchiMate tree‑highlight** (Shift‑click). ch6/7 likely cover the basic Select‑&‑Connect + Auto‑Connect; confirm the two‑state auto‑connect pill ("Auto‑connect: ON/OFF", incoming‑only) is described accurately.

## C6 · Project screen (ch1/ch12/ch13) — clarify  🟡
- **Two refreshes:** the sidebar **↻** ("Refresh the navigation tree") force‑syncs *and* clears the 30 s router cache; the root‑row **↻** only re‑fetches. The screen also auto‑refreshes on mount/focus/tab‑visible.
- **File▾ import/export matrix:** Export → Local/SharePoint (JSON, XML & XSD, Visio .vsdx all‑BPMN, Visio Stencil); Import → Local/SharePoint (JSON *appends into this project*, **XML creates a new "(imported)" project**, Visio multi‑page, BPMN, and SuperAdmin **AI Diagram Bundle**). Document the append‑vs‑new‑project distinction and the Visio import dialog.
- **Sharing is initiated from the Dashboard**, not the project screen (cross‑link). **Per‑project "backup"** = File▾ → Export → JSON (Project); true backup/restore is **org‑level** (OrgAdmin → Backup & Restore).

## C7 · ch2/ch5 — ArchiMate specifics
Confirm ch2 says **ArchiMate 3.2**; in ch5 note ArchiMate relationships are **matrix‑filtered** and **Composition/Aggregation are drawn directed** (whole‑end diamond + arrow into the part). Details live in A2.

---

# PART 3 — DELETIONS / CORRECTIONS
No whole chapters are obsolete. Remove/reframe these **stale statements**:
1. "Procedure Document is only a pasted link" → reframe (C2).
2. "Sonnet" as the fixed model → configurable (C1).
3. "min 6 characters" password → **8** (C3).
4. Any palette **search** or **click‑to‑add** wording → neither exists (C4).
5. Any "Pain Points are UML‑only" wording → every type (C4).

*(No stale infrastructure references — PGlite/Node 20/Turbopack — appear in the guide.)*

---

# Appendix — non‑guide (code) drift found during the audit
Cheap fixes, **not** guide issues:
- Several comments / `definitions.ts` still say **"ArchiMate 3.1"** though the catalogue/header are **3.2**.
- `archimateConnectorStyle.ts` header says **"11 relationship types"**; there are **12** (Directed Association).
- The Account modal password placeholder says **"min 6 characters"**; the API enforces **8**.

---

# Suggested execution order
1. **SOP chapter (A1)** + **AI‑model change (C1)** + **Procedure Document (C2)** — highest impact / most out‑of‑date.
2. **ArchiMate chapter (A2)** — largest single undocumented surface.
3. **Add‑missing (A7)** + **Account (C3)** + **Palette (C4)** — quick, high‑accuracy wins.
4. **AI Usage (A4)** + **AI Models (A5)** + **SuperAdmin/OrgAdmin expansion (A6)** — the admin backlog.
5. **Canvas gestures (C5)** + **Project screen (C6)** + **Collaboration (A8)** + the **P4 tail (A9)**.

_The live guide is DB‑backed — author the actual chapters through **SuperAdmin → Document Editor**. This file is the specification + first‑draft copy, not the live guide. A full content snapshot of today's guide sits alongside it in [`CURRENT_GUIDE_SNAPSHOT.md`](./CURRENT_GUIDE_SNAPSHOT.md)._
