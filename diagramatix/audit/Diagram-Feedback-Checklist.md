# Paul's diagram feedback — the testing checklist

Every item Paul raised that drove the diagram-quality work, lettered so progress
can be reported against a stable reference. **A–Z is fixed: never renumber, never
reuse.** A new item becomes AA, AB, …

Status is one of:
- **SHIPPED** — fixed and pushed, with the commit that did it
- **OPEN** — not yet built
- **ANSWERED** — a question, not a defect

Kept in the repo rather than in a chat so it survives a new session.

---

## Prompt quality — what the generator is told to draw

| | Item | Status |
|---|---|---|
| **A** | A Technical Description does not terminate decisions unambiguously — *"On needs a better matching end"* | SHIPPED `35deb4de` |
| **B** | The same defect in the Process Repository master and diagram prompts | SHIPPED `23ad8d9d`, all 277 prompts regenerated `c75eabc0` |
| **C** | Master template audited for decision termination and EMIE usage | SHIPPED `71f1d3bb` — six defects, two of which manufactured the diagram bugs |
| **D** | A prompt must never be saved half-written — *"No silent truncations!!"* | SHIPPED `c22b791a` |
| **E** | Regenerate a **subset** of prompts rather than one at a time | SHIPPED `28e99dec` — adds "Needs attention" |
| **F** | Adopt the Technical Description as the prompt standard | SHIPPED `6ed9cb8b`, `86bf8537` — six losses fixed; V22.07 and V22.09 round-trip to **zero differences** |

## Layout — how the diagram is drawn

| | Item | Status |
|---|---|---|
| **G** | An EMIE's sub-path needs a row of its own | SHIPPED `b49b30fa`, `df05353b` |
| **H** | Single-pass generation must produce a **PDF-able, readable** diagram | SHIPPED — corpus defects 107 → 5, 24 of 26 diagrams clean |
| **I** | V22.10: connector confusion after gateway "Reserve balance remains?" — path 1, **1.1**, 2, with path 2 pushed down | SHIPPED `7c976621` |
| **J** | V22.04: gateway connection points do not follow path order — a task below leaving by the **top** vertex | SHIPPED `ef82e806` |
| **K** | Two data-object **labels** overlapping each other | SHIPPED `1087cac1` |
| **L** | Data Object labels must not overlap Gateway labels | SHIPPED `a81005ed`, `2bbd17fe` |
| **M** | Long connector labels wrap rather than sprawl | SHIPPED `e3e58f0c` |

## Gateway branch labels — Paul: *"vital to reading the diagram… above all others"*

| | Item | Status |
|---|---|---|
| **N** | Branch labels need a **tether** so you can tell which flow is which | SHIPPED `dc1b5059` |
| **O** | The tether must leave **1/3 along the main outgoing segment**, not at the vertex or mid-connector | SHIPPED `713a8686` |
| **P** | Trim the label box's empty ends — the tether leaves from that boundary | SHIPPED `713a8686` |
| **Q** | Labels **in the same vertical order as their attachment points**, and not overlapping. Ties break on the target's vertical position; **order wins** over shape clearance | **OPEN** ← the one Paul called vital |
| **R** | Home positions: right of the gateway — top-right, just above centre, bottom-right | Mostly already true; completed by **Q** |

## Crossings — Paul's move/swap examples

| | Item | Status |
|---|---|---|
| **S** | V22.04: swap the two connector endpoints on task "Record triage decision and allocation" | **OPEN** |
| **T** | V22.07: **move** one attachment point at gateway "Endorse decline and confirm reasons" (move, not swap) | **OPEN** |
| **U** | Swap **Data Objects** to remove association crossings | **OPEN** |
| **V** | V22.06 gateway "Investigation warranted?" — the simple swap case | **OPEN** |

## Editing — what happens when you touch a diagram

| | Item | Status |
|---|---|---|
| **W** | Clicking an element must select the **element**, never the association under it | SHIPPED `a80bd9df` — the first fix used an SVG mask, which does not clip pointer events |
| **X** | A cosmetic nudge must not rewire the process — moving a task spliced it into a branch and orphaned its EMIE | SHIPPED `ce8c859c` |
| **Y** | The purple prompt annotation forgets its position and size after an edit | SHIPPED `f48d5239` |

## Reporting and infrastructure

| | Item | Status |
|---|---|---|
| **Z** | The batch runner's connector counts looked wrong — *"is it reporting one diagram off?"* | SHIPPED `107db973` — **Paul was right**; every count and ⚠ was on the wrong row (14 of 14 positions disagreed) |
| **AA** | Update the XML schema and Version History | SHIPPED `4bad2308` — XSD already current at 46; PRODUCT_VERSION 2.4 → 2.5 |
| **AB** | Do Process Mining diagrams benefit from these refinements? | ANSWERED — **layout yes** (same `layoutBpmnDiagram`), **master template no** (mining builds its own prompt via `DiagramRules`) |
| **AC** | The silent fallback model should be Kimi K3, not Haiku 4.5 | SHIPPED `4691c5c6` |
| **AD** | Is a small model good enough? (Haiku 4.5 vs Opus 5) | ANSWERED — Haiku gives ~⅓ the content and prolific duplicate names; **Opus 5 for both prompts and diagrams** |

---

## Still open

**Q** — gateway branch label vertical order. Paul's stated priority.
**S, T, U, V** — the crossing-minimisation pass (one pass, two operations: move a
gateway attachment point, swap a pair of endpoints or data objects).

Wiring **Q** as a check will take the corpus from 5 defects to 8 before it comes
down, because V17.01 is clean today and the new rule finds a fault in it. The
number going up is the check working.

## How to test

`npx tsx scripts/layout-worklist.ts` rewrites `tests/fixtures/layout-corpus/WORKLIST.md`
with what is actually left, per diagram, replaying stored AI plans — no AI call,
no cost. Current state: **2 diagrams, 5 defects**, from 11 / 18.
