# Diagramatix — User Guide Audit

| | |
|---|---|
| **Audited** | 2026-06-26 |
| **Guide source** | `app/(dashboard)/help/chapters.tsx` (36 chapters, ~4,674 lines, hardcoded JSX) |
| **Method** | Cross-referenced the 36 current chapters/sections against the full inventory of diagram types (`types.ts`, `symbols/definitions.ts`) and user-facing features (`app/(dashboard)`, `app/api`, `app/lib`). Each gap is rated and, for the priorities, drafted ready-to-paste content. |
| **Severity** | **High** = a whole diagram type or headline feature users will actively look for is missing/wrong · **Medium** = present but thin/under-documented · **Low** = minor/polish |

> **Context:** the guide is maintainable only by a developer editing JSX + redeploying, so it has drifted behind the product. This audit feeds two things: (1) the content fixes below, and (2) the in-app SuperAdmin guide editor (separate plan) that will let these be authored without code changes.

---

## Findings summary

| ID | Sev | Area | Finding |
|---|---|---|---|
| UG-01 | High | Diagram type | **ArchiMate** has no dedicated section — only named in the Diagram-Types intro, while every other type has its own section |
| UG-02 | High | Feature | **Voice Dictation / Record** (Deepgram + AI-Tidy → seeds AI Generate) is undocumented |
| UG-03 | High | Feature | **Simulator as-is vs to-be comparison** (baseline vs to-be scenarios + the verdict matrix) is not covered — the Simulator chapter documents running, not comparing |
| UG-04 | High | Feature | **Publishing & business-user distribution** — Publish Version, lifecycle (DRAFT→PUBLISHED), Publication **Bundles**, and the **Process View** for business users — has no chapter |
| UG-05 | Medium | Feature | **Subscription tiers & usage limits** (what each tier allows, the usage popover, hitting a cap) — no chapter |
| UG-06 | Medium | Feature | **Diagram History / snapshots** (preview + restore a prior version) — not documented |
| UG-07 | Medium | Feature | **Staff Narrative** generation (business-friendly rewrite under an editable briefing) — not documented in the AI chapter |
| UG-08 | Medium | Feature | **AI Clarification / open-questions round** — not documented in the AI chapter |
| UG-09 | Medium | Feature | **Review Comments** (pink sticky notes + link on the canvas during review) — verify; appears undocumented in the Collaboration chapter |
| UG-10 | Medium | Feature | **Simulation Examples gallery** (adopt a built-in example study) — not documented |
| UG-11 | Low | Feature | **Process Owner** metadata, **Scan for Links**, the **Matrix** toggle — minor, confirm/short notes |
| UG-12 | Cond. | Diagram type | **Flowchart Parallel-bar + Comment** symbols — document **when/if** that parked feature ships |
| UG-13 | Med | Maintenance | No **version stamp** / "last updated", and **14 screenshots** are placeholders (`«Diagram: …»`) — many sections promise an image that isn't present |
| UG-14 | Low | Accuracy | Cross-check that covered chapters are still accurate post-feature-changes (e.g. backup per-table restore, lane swap, alignment-attachment) |

**Confirmed already covered (no action):** Send-for-Review & Reviewing (ch. "Collaboration & Review"), Entity Lists & Pool/Lane naming (ch. 35), SharePoint connect/save/open/link (ch. "Import & Export"), Visio import/export incl. bulk (ch. "Import & Export"), DDL import/generate, Bubble Help (ch. "Properties Panel"), Diagram Type colour/codes (ch. "Diagram Types → Colour identity").

---

## Detailed findings & recommendations

### UG-01 — ArchiMate diagram type (High)
The Diagram-Types intro lists "…Value Chain and ArchiMate", but there is **no ArchiMate section** — unlike BPMN, Context, Process Context, State Machine, Flowchart, Domain, Value Chain, which each have one. ArchiMate is a full type with a live shape catalogue and **11 connector types** in 4 groups. **Action:** add an "ArchiMate" section to the Diagram-Types chapter (draft below). Also feeds the separate ArchiMate connector-review reminder.

### UG-02 — Voice Dictation / Record (High)
The "AI Diagram Generation" chapter documents the prompt box but not the **Record / Audio** entry point: live mic → Deepgram (diarized) or a `.vtt` Teams/Zoom transcript → optional **AI Tidy** (cleans the transcript into a process description + surfaces open questions) → the result seeds the prompt. This is "the new record feature" Paul flagged. **Action:** add a "Turning a meeting into a diagram (Record & Dictation)" section to the AI chapter (draft below).

### UG-03 — Simulator as-is vs to-be (High)
The "Simulating Processes" chapter covers setup, running, the Operator, the Team library, and "Studies, scenarios & what-ifs" — but **not the comparison framing** that is the simulator's headline value: mark one scenario the **baseline (as-is)**, build **to-be** variants, run both, and read the **verdict** (% faster, throughput gain, cost/case saved, FTE freed on the bottleneck) plus the side-by-side metrics matrix (`ScenarioCompare`). **Action:** add an "As-is vs to-be: comparing scenarios" section (draft below).

### UG-04 — Publishing, lifecycle & bundles (High)
No chapter covers the publish lifecycle. Missing: **Publish Version** (release notes + next-review cadence), the **DRAFT → PUBLISHED** lifecycle, **Publication Bundles** (package a root diagram + linked diagrams for a business audience), and the **Process View** business users see. **Action:** new chapter "Publishing & sharing with business users".

### UG-05 — Subscription tiers & usage (Medium)
Users hit AI/export/import caps with no guide explanation. Missing: what each tier includes, the **usage popover**, what happens at a limit, the trial expiry. **Action:** new short chapter "Plans & usage" (note: keep tier numbers out of hardcoded copy — reference the live tiers).

### UG-06–UG-10 (Medium)
Add concise sections: **Diagram History** (History panel → preview a snapshot → restore); **Staff Narrative** + **AI Clarification** (extend the AI chapter); **Review Comments** (verify current behaviour, then a short note in the Collaboration chapter); **Simulation Examples** (adopt a built-in study, in the Simulator chapter).

### UG-11–UG-14
- **UG-11:** one-line notes for Process Owner (Diagram Properties), Scan for Links, the Matrix toggle.
- **UG-12:** when the Flowchart Parallel-bar/Comment symbols ship, add them to the Flowchart section (long-face attachment rule; comment = dotted association; BPMN translation → parallel gateway / text-annotation).
- **UG-13:** add a "Guide version / last updated" stamp; capture the 14 missing screenshots (list below).
- **UG-14:** re-verify covered chapters against recent changes — backup **per-table restore**, **lane swap**, alignment **attachment-to-face**, the new **rate-limited** auth flows.

**Screenshots to capture (placeholders today):** dashboard-overview, project-folders, bpmn-example, palette-bpmn, quick-add, properties-panel, title-block, smart-align, templates-dropdown, insert-space, drop-on-connector, boundary-event, value-display, bottleneck — plus new: archimate-example, ai-record-button, simulator-compare, publish-bundle.

**Audience tags:** new sections inherit the 2-way model. Mark **adminOnly** only the SuperAdmin-specific bits (none of UG-01..03 are admin-only; UG-04 bundle *admin capture* and any SuperAdmin tools are).

---

## Drafted content (ready to paste into the editor — GFM Markdown)

> These are written in the guide's voice and use the `:sym[type]:` symbol shortcode and standard glyphs. Refine wording on review.

### ▶ UG-01 — Diagram Types → **ArchiMate** (new section)

```markdown
### ArchiMate

Enterprise-architecture diagrams following the ArchiMate notation (aligned with
TOGAF). Drop a generic ArchiMate element and pick its type; the shape is drawn
from the live ArchiMate catalogue, so the palette stays current.

ArchiMate's value is its **relationship set** — Diagramatix supports all eleven,
grouped as the standard does:

| Group | Relationships |
|-------|---------------|
| **Structural** | Composition, Aggregation, Assignment, Realisation |
| **Dependency** | Serving, Access, Influence, Association |
| **Dynamic** | Triggering, Flow |
| **Other** | Specialisation |

Draw a connector between two elements, then set its relationship from the
connector's properties. Each renders with its correct ArchiMate line/arrow style
(e.g. a filled diamond for Composition, an open arrowhead for Triggering, a dashed
line for Access/Influence).

> **Tip:** like every type, ArchiMate has a 2-character code and colour you'll see
> on tiles and in the editor top bar (SuperAdmin → Diagram Types to change it).
```

### ▶ UG-02 — AI Diagram Generation → **Turn a meeting into a diagram (Record & Dictation)** (new section)

```markdown
### Record a discussion (Dictation)

You don't have to type the prompt — you can talk through the process, or feed in
a meeting transcript, and let Diagramatix draft the description for you.

In the **AI** panel:

- **:sym[record] Record** — captures your microphone and transcribes live. Speakers
  are labelled automatically ("Speaker 0 / Speaker 1 …") when the cloud engine is
  available; otherwise the browser's built-in speech engine is used.
- **Audio / transcript** — upload an audio file, or a Microsoft Teams / Zoom
  **`.vtt`** transcript (parsed in your browser, no upload).

**AI Tidy** (on by default) runs the raw transcript through a clean-up pass that
turns rambling discussion into a structured process description **and** pulls out
open questions — which appear in the **Ask for clarification** step so you can
resolve ambiguities before generating. Turn Tidy off to keep the raw transcript.

The tidied text lands in the prompt box; review it, then **Generate** as usual.
```

### ▶ UG-03 — Simulating Processes → **As-is vs to-be: comparing scenarios** (new section)

```markdown
### As-is vs to-be: comparing scenarios

The point of a simulation is usually to answer *"is the new way better, and by how
much?"* Diagramatix does this with **scenarios** inside a **Study**:

1. **Baseline (as-is).** Mark one scenario as the **baseline** — your current
   process as it runs today.
2. **To-be variants.** Add one or more scenarios for the changes you're testing
   (more capacity on a team, a re-routed gateway, an automated task, a different
   arrival rate). Each is a full copy you tweak independently.
3. **Run both** (Monte-Carlo, multiple replications with a fixed seed for
   repeatability).
4. **Read the verdict.** The comparison view puts the scenarios **side by side** —
   Completed, Flow time (p50 / p95), top resource utilisation, cost per case,
   total cost — and prints a plain-English **verdict** for each to-be against the
   baseline, e.g. *"23% faster, +8% throughput, frees ≈1.2 FTE of Sales, −$4/case"*.

The **bottleneck** (the highest-utilised team) is called out, so you can see not
just *that* a to-be is better but *where* the improvement comes from.

> **Tip:** keep one Study per question. Within it, the baseline never changes —
> add a new to-be scenario for each "what-if" so the comparisons stay honest.
```

---

## Recommended sequencing
1. **Land the editor first** (separate plan) so these can be authored in-app and kept current.
2. Apply **UG-01, UG-02, UG-03** (the three Paul named) using the drafts above.
3. Then **UG-04, UG-05**, then the Medium set (UG-06–UG-10).
4. Capture screenshots; add the version stamp (UG-13).
5. Re-verify covered chapters (UG-14) against recent feature changes.

_This report is a living document — once the in-app editor exists, treat it as the backlog and tick items off as sections are authored/updated._
