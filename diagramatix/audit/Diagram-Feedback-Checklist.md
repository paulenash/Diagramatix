# Paul's diagram feedback — the testing checklist

Every item Paul raised that drove the diagram-quality work, lettered so progress
can be reported against a stable reference. **A–Z is fixed: never renumber, never
reuse.** A new item becomes AL, AM, …

**Two columns, deliberately.** *Built* is what was done and the commit that did
it. *Paul* is his verdict, and it is the only one that closes an item — Paul,
2026-09-05: *"your tick means you did something but now add pass for the ones I
pass."* H is why the distinction matters: built and measured, and still open,
because his bar is a readable diagram rather than a number.

| Paul | meaning |
|---|---|
| **PASS** | Paul has tested it and it is right |
| **open** | Paul has looked and it is not right yet |
| *(blank)* | not yet tested |

Kept in the repo rather than in a chat so it survives a new session.

---

## Prompt quality — what the generator is told to draw

| | Item | Built | Paul |
|---|---|---|---|
| **A** | A Technical Description does not terminate decisions unambiguously — *"On needs a better matching end"* | `35deb4de` | **PASS** |
| **B** | The same defect in the Process Repository master and diagram prompts | `23ad8d9d`, all 277 regenerated `c75eabc0` | **PASS** |
| **C** | Master template audited for decision termination and EMIE usage | `71f1d3bb` — six defects, two of which manufactured the diagram bugs | **PASS** |
| **D** | A prompt must never be saved half-written — *"No silent truncations!!"* | `c22b791a` | **PASS** |
| **E** | Regenerate a **subset** of prompts rather than one at a time | `28e99dec` — adds "Needs attention" | **PASS** |
| **F** | Adopt the Technical Description as the prompt standard | `6ed9cb8b`, `86bf8537` — V22.07 and V22.09 round-trip to **zero differences** | **PASS** |

## Layout — how the diagram is drawn

| | Item | Built | Paul |
|---|---|---|---|
| **G** | An EMIE's sub-path needs a row of its own | `b49b30fa`, `df05353b` | **PASS** |
| **H** | Single-pass generation must produce a **PDF-able, readable** diagram | corpus 107 → 5, 24 of 26 clean | **open** |
| **I** | V22.10: connector confusion after gateway "Reserve balance remains?" — path 1, **1.1**, 2, with path 2 pushed down | `7c976621` | **PASS** |
| **J** | V22.04: gateway connection points do not follow path order — a task below leaving by the **top** vertex | `ef82e806` |**PASS** |
| **K** | Two data-object **labels** overlapping each other | `1087cac1` | |
| **L** | Data Object labels must not overlap Gateway labels | `a81005ed`, `2bbd17fe` | |
| **M** | Long connector labels wrap rather than sprawl | `e3e58f0c` | |
| **AF** | **Merge INBOUND vertices** — V22.05 gateway "Which external assessment inputs are required?": a task BELOW the merge enters at the top vertex, one ABOVE enters at the bottom. J covered a gateway's OUTBOUND vertices; this is the mirror and was never on the list — not a mistaken pass | R6.34 — corpus facing-away arrivals 2 → 0 | **PASS** — verified on V22.04, 2026-09-05 |

## Gateway branch labels — Paul: *"vital to reading the diagram… above all others"*

| | Item | Built | Paul |
|---|---|---|---|
| **N** | Branch labels need a **tether** so you can tell which flow is which | `dc1b5059` |**PASS** |
| **O** | The tether must leave **1/3 along the main outgoing segment**, not at the vertex or mid-connector | `713a8686` |**PASS** |
| **P** | Trim the label box's empty ends — the tether leaves from that boundary | `713a8686` |**PASS** |
| **Q** | Labels **in the same vertical order as their attachment points**, and not overlapping. Ties break on the target's vertical position; **order wins** over shape clearance | R5.13 — swaps labels between vetted positions. Fixes 1 of the 4 misordered gateways; the other 3 are refused because reordering them creates overlaps | **PASS** — "Gateway connector labels are fine", 2026-09-05 |
| **R** | Home positions: right of the gateway — top-right, just above centre, bottom-right | mostly already true; completed by **Q** | |

## Crossings — Paul's move/swap examples

| | Item | Built | Paul |
|---|---|---|---|
| **S** | V22.04: swap the two connector endpoints on task "Record triage decision and allocation" | not needed as a pass — fixing the ATTACHMENT geometry (J, AF) removed it at source | **PASS** — "V22.04 … 3. Sequence connector crossing now gone!", 2026-09-05 |
| **T** | V22.07: **move** one attachment point at gateway "Endorse decline and confirm reasons" (move, not swap) | **NOT fixed** — the earlier "removed at source" claim was wrong for T. Replaying V22.07's stored plan through today's layout (`scripts/report-crossings.ts`) still finds it, and only it: gateway `gw_approver` "Delegated approver outcome?" leaves for "Endorse decline…" from its CENTRE (1844,1073) and routes LEFT to x=1787 — outside its own left edge at 1824 — before dropping, straight through the boundary timer's run to "Escalate approval…" at y=1075 | **open** |
| **U** | Swap **Data Objects** to remove association crossings | R8.37 — corpus crossings 16 → 12, no readability cost | **PASS** — no crossings left on V22.04, 2026-09-05 |
| **V** | V22.06 gateway "Investigation warranted?" — the simple swap case | **unknown** — the V22.06 export in Downloads is from 2026-09-04 18:46, minutes before plan storage shipped, so it carries no plan and cannot be replayed. Regenerate V22.06 and it becomes measurable | **open** — needs a regeneration first |
| **AG** | **V22.05**: the connector to "Record provisional quantum on best available evidence" is not in its proper path, and renders ABOVE the EMIE it connects to, crossing it | R55.6 — the exception path is re-asserted clear of its host before the connectors are built | **PASS** — V22.05 regenerated 2026-09-05: task 21px clear of its host, connector drops straight down, diagram at zero diagnostics |
| **AH** | Show the last Master Template change date/time | version + date on the master-templates card | |
| **AI** | A tile showing when each chain's prompts were last generated, with chains RED where that predates the last template change | red `pre-vN` badge per prompt; "Needs attention" now ticks stale prompts too | |
| **AJ** | A change history per Master Diagram Prompt Template — what and when; backfill BPMN; by diagram-type chip; master prompt templates only | `MD_PROMPT_TEMPLATE_HISTORY` — 7 BPMN versions backfilled from git, shown by chip | |
| **AK** | Separate, confirmed options on the .md upload — replace all / selectively update / add new — not one generic button | `7d3d75c4` — choosing a file now PREVIEWS it: per chain, what the file holds vs what the library holds and how many prompts a replace destroys. Tick per chain (New only / Everything / None), then a `ConfirmDialog` that NAMES the chains being replaced. `planLibraryImport` is the one decision the preview and the import both make, so they cannot disagree | **PASS** — "AK is fine", 2026-09-05 |

## Editing — what happens when you touch a diagram

| | Item | Built | Paul |
|---|---|---|---|
| **W** | Clicking an element must select the **element**, never the association under it | `a80bd9df` — the first fix used an SVG mask, which does not clip pointer events | |
| **X** | A cosmetic nudge must not rewire the process — moving a task spliced it into a branch and orphaned its EMIE | `ce8c859c` | |
| **Y** | The purple prompt annotation forgets its position and size after an edit | `f48d5239` | |

## Reporting and infrastructure

| | Item | Built | Paul |
|---|---|---|---|
| **Z** | The batch runner's connector counts looked wrong — *"is it reporting one diagram off?"* | `107db973` — **Paul was right**; every count and ⚠ was on the wrong row (14 of 14 positions disagreed) | **PASS** |
| **AA** | Update the XML schema and Version History | `4bad2308` — XSD already current at 46; PRODUCT_VERSION 2.4 → 2.5 | |
| **AB** | Do Process Mining diagrams benefit from these refinements? | ANSWERED — **layout yes** (same `layoutBpmnDiagram`), **master template no** (mining builds its own prompt via `DiagramRules`) | |
| **AC** | The silent fallback model should be Kimi K3, not Haiku 4.5 | `4691c5c6` | |
| **AD** | Is a small model good enough? (Haiku 4.5 vs Opus 5) | ANSWERED — Haiku gives ~⅓ the content and prolific duplicate names | **PASS** — Opus 5 set for both |
| **AE** | A standard-loop subprocess swallowed the whole process — V22.04 asked for "Repeat Until Handler Assigned", which is what the subprocess ACHIEVES, so all twelve steps fell inside it | `2df08f65` — template rule: a loop holds only the repeating steps | **PASS** — V22.04 went 13 diagnostics to 1 on regeneration; V22.05 came back at zero |

---

## Where it stands

**Passed by Paul:** A, B, C, D, E, F, G, I, J, N, O, P, Q, S, U, Z, AD, AE, AF, AG, AK — V22.04 on 2026-09-05: gateway connector labels fine, connectors to the merges fine, the sequence-connector crossing gone.

**Open by Paul:** **H** — a single pass must produce a readable diagram. Built and
measured (107 → 5 corpus defects) but not passed, and rightly: the measure is a
corpus number, the bar is a diagram Paul would send someone.

**Open, with work still to do:**

- **T** — measured on 2026-09-05 and still present. A gateway branch leaves from
  the gateway's CENTRE and routes backwards past its own left edge. Mine to fix.
- **V** — cannot be measured: the V22.06 export predates plan storage by minutes,
  so there is no plan to replay. One regeneration makes it testable.
- **W** — three fixes, still failing. Waiting on a DevTools reading of what
  actually receives the click; a fourth theory without that would be a guess.
- **H** — the umbrella. Closes when the rest do.

**Untested — waiting on Paul:** K, L, M, R, X, Y, AA, AC, AH, AI, AJ. All are
built and deployed. K, L, M and R need a regenerated diagram to show up on; X and
Y need an editing session; AH, AI and AJ are on the SuperAdmin screens and need
no regeneration at all.

## How to measure

`npx tsx scripts/layout-worklist.ts` rewrites `tests/fixtures/layout-corpus/WORKLIST.md`
with what is actually left, per diagram, by replaying stored AI plans — no AI
call, no cost. Current: **2 diagrams, 5 defects**, from 11 / 18.

That number supports **H** but does not settle it. Only Paul does.

`npx tsx scripts/report-crossings.ts "<export>.json"` replays one exported
diagram and names the connectors that cross — sequence and association reported
separately, message flows to black-box pools excluded because those cross by
design. Corpus baseline 2026-09-05: **12 sequence, 12 association** crossings
across 26 diagrams. An export made before plan storage shipped (before roughly
19:15 on 2026-09-04) says so rather than measuring its stale coordinates.
