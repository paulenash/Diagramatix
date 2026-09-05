# Paul's diagram feedback — the testing checklist

Every item Paul raised that drove the diagram-quality work, lettered so progress
can be reported against a stable reference. **A–Z is fixed: never renumber, never
reuse.** A new item becomes AF, AG, …

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
| **J** | V22.04: gateway connection points do not follow path order — a task below leaving by the **top** vertex | `ef82e806` | |
| **K** | Two data-object **labels** overlapping each other | `1087cac1` | |
| **L** | Data Object labels must not overlap Gateway labels | `a81005ed`, `2bbd17fe` | |
| **M** | Long connector labels wrap rather than sprawl | `e3e58f0c` | |

## Gateway branch labels — Paul: *"vital to reading the diagram… above all others"*

| | Item | Built | Paul |
|---|---|---|---|
| **N** | Branch labels need a **tether** so you can tell which flow is which | `dc1b5059` | |
| **O** | The tether must leave **1/3 along the main outgoing segment**, not at the vertex or mid-connector | `713a8686` | |
| **P** | Trim the label box's empty ends — the tether leaves from that boundary | `713a8686` | |
| **Q** | Labels **in the same vertical order as their attachment points**, and not overlapping. Ties break on the target's vertical position; **order wins** over shape clearance | **not built** | |
| **R** | Home positions: right of the gateway — top-right, just above centre, bottom-right | mostly already true; completed by **Q** | |

## Crossings — Paul's move/swap examples

| | Item | Built | Paul |
|---|---|---|---|
| **S** | V22.04: swap the two connector endpoints on task "Record triage decision and allocation" | **not built** | |
| **T** | V22.07: **move** one attachment point at gateway "Endorse decline and confirm reasons" (move, not swap) | **not built** | |
| **U** | Swap **Data Objects** to remove association crossings | **not built** | |
| **V** | V22.06 gateway "Investigation warranted?" — the simple swap case | **not built** | |

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
| **AE** | A standard-loop subprocess swallowed the whole process — V22.04 asked for "Repeat Until Handler Assigned", which is what the subprocess ACHIEVES, so all twelve steps fell inside it | template rule added: a loop holds only the repeating steps | |

---

## Where it stands

**Passed by Paul:** A, B, C, D, E, F, G, I, Z, AD.

**Open by Paul:** **H** — a single pass must produce a readable diagram. Built and
measured (107 → 5 corpus defects) but not passed, and rightly: the measure is a
corpus number, the bar is a diagram Paul would send someone.

**Not built:** **Q** (his stated priority), and **S, T, U, V** — the
crossing-minimisation pass, one pass with two operations: move a gateway
attachment point, or swap a pair of endpoints or data objects.

**Untested:** J, K, L, M, N, O, P, X, Y, AA, AC. **W is under investigation** — three fixes, still failing; waiting on a DevTools reading of what actually receives the click. Most landed after Paul's
last regeneration, so a fresh run is what will move them.

## How to measure

`npx tsx scripts/layout-worklist.ts` rewrites `tests/fixtures/layout-corpus/WORKLIST.md`
with what is actually left, per diagram, by replaying stored AI plans — no AI
call, no cost. Current: **2 diagrams, 5 defects**, from 11 / 18.

That number supports **H** but does not settle it. Only Paul does.
