# Voice Assist — updated plan, 21 September 2026

**Status as at 2026-09-21** — read from the repository and the commit history,
not from memory, so this file never claims more or less than the code contains.

This supersedes `Voice Assist — Review Plan and Status.md`, which is kept as the
record of what the plan looked like before this pass. The original review plan
is reproduced verbatim in the appendix, so every item can still be cited by id.

---

## Where it stands

| Part | State |
|---|---|
| **Session 1 — the undo and reference bugs** (B1, B2, B3, D4) | **SHIPPED** `a49a8006` |
| **Confirmation before destructive commands** (R1) | **SHIPPED** `a49a8006` |
| **Selection as a reference** (M1) | **SHIPPED** `a49a8006` |
| **Wrap the selection** (M2) | **SHIPPED** `9eb28faf`, `94e02a47` — subprocess, pool and lane |
| **The gate** (C9 / decision 1) | **SHIPPED** `66e0d890` — registry key at Expert and above |
| **Renamed to Voice Assist** | **SHIPPED** `b2975716` — 301 replacements, five file renames, DB half as idempotent SQL |
| **Cheaper fallback, capped and timed out** (C5 + R4 / decision 3) | **SHIPPED** `fb4dc71d` |
| **Busy enforced on every path** (B4) | **SHIPPED** `0fa62276` |
| **Destructive commands do not guess** (R3) | **SHIPPED** `0fa62276` |
| **An ambiguity names what it found** (R2a) | **SHIPPED** `0fa62276` |
| **The greedy regexes** (B5) | **SHIPPED** `ae30cef8` |
| **The disambiguation picker** (R2b) | **SHIPPED** `8e1f13fd` |
| **Diagram names fed to the recogniser** (V1) | **SHIPPED** `2b30eefc` |
| **Phonetic reference matching** (V2) | **SHIPPED** `2b30eefc` |
| **AI prompt op list** (B7) | **SHIPPED** `8c370014`, completed 21 Sep — `renameByType`, then `addPool.relativeTo` so "above" has an anchor |
| **Tests for the untested half** (D3) | **PARTIAL** — pure modules extracted and covered; no `apply.ts`, no mocked-client route test |
| **Release-log entries** (D2) | **SHIPPED** `496969a8` — twelve entries covering the 72 commits since `a49a8006` |
| **Dead sub-lane checks** (B6) | **SHIPPED** `496969a8` — one rule in `laneKind.ts`, five call sites |
| **Silent voice degrade** (B8) | **SHIPPED** `496969a8` — a 403 refuses and says why; 503 falls back and says so |
| **Auto-connect respects `canConnect`** (R7) | **SHIPPED** `496969a8` |
| **Richer log entries** (R5) | **SHIPPED** `496969a8` — the flash diff now sees a subtype change. Per-entry undo buttons remain unbuilt |
| **Better failure messages** (R6) | **SHIPPED** `496969a8` — "did you mean …?" from the words AND the sound |
| **Scanner feedback per command** (R8) | **not started** |
| **Capability extensions** (C1–C4, C6–C8, C10) | **not started** |
| **Convert in place** (M3) | **SHIPPED** `496969a8` — the menu's own subtype table, said out loud |
| **Fill the selection** (M4) | **SHIPPED** `2fe89dcb` — names in reading order, simulation team, Risk/Control attach |
| **Pointer as a reference** (M5) | **SHIPPED** `2fe89dcb` — "here" places at the mouse; "the one under the cursor" resolves to it. See the note on "connect this to that" below |
| **Align the selection** (M7, the align half) | **SHIPPED** 21 Sep — the Alignment ▾ menu's seven modes, said out loud. Distribute and "same size" are NOT built: those reducers do not exist |
| **Ghost + voice** (M8) | **SHIPPED** 21 Sep — "accept the suggestion", by position or by kind. "Yes" deliberately left to the confirmation flow |
| **Marquee, properties** (M6, M9) | **not started** |
| **Personal phrase book** (V3) | **HALF** `1da089b4` — the measurement ships; the phrase book itself waits on it (see below) |
| **Publish the guide, tech-notes and feature rows** (D1) | **SHIPPED** `496969a8` — **run on production by Paul, 2026-09-20.** Verified from the public `/features` page: both rows published with the September wording, zero occurrences of the old name |
| **Delivered from live use** (L1–L10) | **SHIPPED** — never in the backlog; added to it afterwards so the plan is a complete record |

---

## What changed on 20 September

Paul asked what mattered most next. The answer began with an operational item
rather than a plan item, and that is worth recording because it was nobody's
backlog entry:

**Voice Assist was OFF in production and no one had noticed.** The rename
(`b2975716`) changed the feature-registry key from `abracadabra` to
`voice-assist` and deployed. Production's `FeatureAvailability` rows still
carried the old key, and `isFeatureAvailable` fails CLOSED — so the wand was
hidden for every Expert and Enterprise user and `/api/ai/command` answered 403.
The migration SQL carries the states across; Paul ran it. The lesson is in the
SQL's own docblock: a key rename is a data migration, not a rename.

Then, in order:

1. **C5 + R4** — the fallback moved to Haiku, the payload was capped, and a
   timeout was added. Safe here and not for generation because the model
   rewrites ONE sentence against a listed vocabulary and the deterministic
   grammar re-parses the result: a poor rewrite fails to parse rather than
   corrupting the diagram.
2. **B4** — the voice path now queues instead of racing. `voiceBusy` was React
   state, which is not true until the next render — far too late to stop the
   next utterance, which arrives whenever the speaker pauses for breath.
3. **R3 and R2a** — a destructive command no longer takes the most recent of a
   kind, and an ambiguity names its candidates.
4. **B5** — four over-greedy rules now decline. The insight worth keeping: a
   match BLOCKS the fallback, so declining is the fix, not cleverness.
5. **R2b** — the picker, built on the numbered-badge flow the product already
   had for rename and message.
6. **V1 and V2** — fewer mis-hears at the recogniser, and repair for the rest in
   the parser, without an AI call.

**Three bugs were found by measuring rather than by reading**, and none was on
any list:

- `"add a task before Review"` created a task *named* "before Review" — the most
  ordinary sentence of B5's four, and not in the plan.
- A token-overlap TIE was settled by document order: `"shop order"` scored 0.5
  against both "Back Order" and "Ship Order" and took whichever came first,
  silently, with a green tick.
- A bare quoted name is not an escape hatch — `clean()` strips the trailing
  quote before the quoted-name branch runs, so `called …` is the only one. Left
  as it is (you cannot say quote marks) but now recorded.

---

## Also on 21 September — M7's align half, M8, and B7

Three items that are all the M3 shape: the machinery existed, only the way to
reach it was missing. Together they close **every defect (B1–B8)** and **every
reliability item (R1–R7)** except R8.

- **M7 (align).** `ALIGN_ELEMENTS` has driven the Alignment ▾ menu all along, so
  "align these" is grammar plus a dispatch. The plan's note that no
  align/distribute reducers exist was written before that landed and is stale.
  **A bare axis word is refused rather than guessed:** "align these
  horizontally" means *lay them along a horizontal line* to some people and
  *move them horizontally* to others, so the parser declines and the AI can
  ask. Say a row, a column, or an edge.
  *Not built:* "space these evenly" and "same size as this" — those reducers
  really do not exist, and distributing badly is worse than not distributing,
  because it looks finished.
- **M8 (ghost).** `acceptNextStep` was already exposed through a ref the voice
  layer could read. **"Yes" is deliberately not an accept word** — it already
  confirms a parked destructive command, and a word that changes meaning
  depending on whether a ghost happens to be showing is how a diagram gets
  cleared by accident. A bare number is left alone too, because it answers a
  numbered pick.
- **B7.** `addPool.relativeTo` was in the op type and the apply branch the whole
  time; the AI prompt never mentioned it, so the model could say *above* with
  nowhere to put the anchor and the pool landed relative to the existing stack.

One guard was added that is not about any of them: **T4600 checks every op in
the union has a `validateOp` case.** An op added to the union and the grammar
but not the validator works when typed and vanishes when the AI returns it —
a failure that shows only on the expensive path, and only sometimes.

---

## What changed on 21 September — M4 and M5 (`2fe89dcb`)

Both extend what M1 started. M4 pushes it as far as it goes in one direction —
the voice says several things at once, and the selection plus the READING ORDER
says which is which. M5 pushes it in the other — the mouse says WHERE, which a
name cannot express at all.

**M4's three commands all name no target**, because the selection is the target,
so each begins by insisting on one rather than falling back to recency.

- *"name these Receive, Check and Ship"* fills in reading order: rows top to
  bottom, each row left to right. Sorting by x alone interleaves two lanes and
  lands one lane's names on the other's elements, which is why the ordering is
  its own tested module. A **count mismatch is refused, not truncated** —
  renaming three of four leaves a diagram that looks finished and is wrong.
- *"assign these to the Finance team"*. The word "team" must actually appear, or
  "move these right" and "wrap these in a pool" would be swallowed. A team
  belongs to an activity, so anything else selected is named and skipped.
- *"attach risk R-012 to these"*. Codes are normalised on both sides because
  they are the worst thing to dictate; **names are never matched fuzzily**,
  because attaching the wrong control survives into an audit and a near miss
  reported beats a plausible neighbour applied. This is the one reference in the
  product that deliberately does *not* use the phonetic pass.

**M5** places at the mouse (*"put a task here"*) — still nudged clear of what is
already there, no connector drawn, and refused with a reason when the pointer
has never been over the canvas rather than dropped at (0,0).

### The one departure from the plan: "connect this to that"

The plan asked for that sentence with *that* meaning the element under the
pointer. It is not what shipped, deliberately.

"This" and "that" already mean the selection — M1, shipped in `a49a8006` and
tested. Redefining one of them regresses that. Worse, the sentence needs the two
demonstratives to mean **different things inside one utterance**: a rule nobody
could remember, and one that would make every existing "delete that" ambiguous.

What ships keeps the selection winning and adds the pointer where it costs
nothing:

| Say | Means |
|---|---|
| "here", "there" | the pointer POSITION — placement only |
| "the one under the cursor", "this one here", "the one I'm pointing at" | the ELEMENT under the pointer |
| "this", "that" | the selection, as before; then the last added; and now the hovered element before falling back to document order |

That last row is the part that delivers the plan's intent without breaking
anything — pointing at something with nothing selected is a better guess than
"the last element in the document" ever was.

So the plan's sentence is said as **"connect the selected task to the one under
the cursor"**. T4595 pins this so it cannot be quietly undone.

---

## What to do next, in order

Paul's list of 20 September was D1, D2, B8, M3, R7, B6, R5/R6 and V3 — all done,
and D1 was run on production on the 20th. M4, M5, M7's align half, M8 and B7's
remainder followed on the 21st. Every defect (B1–B8) and every reliability item
(R1–R7) is now closed. What is left:

1. **R8 — scanner feedback per command.** Run `checkDiagram` on the new state
   and append "+N issues" to the log line. **The last of the R family, and the
   only remaining item with a real design question:** whether to report every
   violation or only those touching the ids this command changed. Reporting
   pre-existing problems after every unrelated command is noise; the gold flash
   already knows what a command touched, so the second option is cheap.
2. **M7's other two thirds** — "space these evenly" and "same size as this".
   These genuinely need new reducers, unlike the align half.
3. **M6** — marquee + voice. M5's pointer plumbing has now landed, which was
   its blocker.
4. **M9** — properties-panel context. **Last regardless of value:** letting bare
   fragments become commands is how the parser starts guessing, and that cost a
   session once already (B5). It would need those guards designed in, not
   retrofitted.
5. **V3's second half — the phrase book itself.** Gated on its own measurement
   (below), not on effort.

Deferred deliberately: C1–C4, C6–C8 and C10 are capability extensions rather
than defects, and D3's `apply.ts` extraction is now much less pressing — the
apply layer's rules have been extracted into tested pure modules one at a time
(`greedyGuards`, `disambiguate`, `phonetic`, `messageLabel`, `emieLabel`,
`workingSet`, `laneKind`, `convertPhrase`, `elementSubtypes`, `tokenOutcome`,
`correctionPairs`, `fillSelection`, `pointerRef`, `riskCatalogRef`) as each was
worked on.

### V3 — why only half of it shipped

Paul's own wording: V3 is "worth doing only after V1 and V2 have been used
enough to say whether they left anything". V1 and V2 shipped the same morning,
so there is no such data yet — and building the phrase book now would be
guessing at the shape of a problem V1 and V2 may already have removed.

So what shipped (`1da089b4`) is the measurement the phrase book would be built
on, which is also the V0 tally the original review asked for and never got.
Under the Cost readout the bar now says how the session went, splitting the
commands that had to be said twice into:

- **misheard** — said the same thing again and it worked. The words were right
  in the user's mouth and wrong on the wire. A phrase book could learn this.
- **rephrased** — said something different and it worked. The user changed their
  words to suit the grammar. No amount of phonetic learning helps; the grammar
  or the AI prompt is what is short.

Nothing is stored or sent — it is read from the log already on screen.

**The decision this feeds.** After a week of real use: if the sessions carry
real `misheard` counts, build the phrase book as planned. If they are mostly
`rephrased`, V3 is the wrong answer and the same effort belongs in the grammar
and the AI prompt instead. A phrase book built on a mostly-rephrased log would
learn the wrong lesson and add a layer of aliases nobody needed.

---

## Decisions — both settled

**Who gets it, and when.** SETTLED 2026-09-17 (`66e0d890`): the registry key
`voice-assist` at Expert and above — the plan's own recommendation (b). The
editor decides which buttons to draw; `/api/ai/command` enforces it, because the
route is reachable directly.

**What the AI fallback should cost.** SETTLED 2026-09-20 (`fb4dc71d`): the plan's
option (b). Haiku by default, the payload capped at 120 elements keeping the
selection first, and a 20s abort. Overridable in AI Model settings, where blank
means "use the default" and names it.

---

## Outstanding on production

Seeds and rows that exist only as unrun scripts. Per the standing rule they need
an idempotent SQL file for the in-app database tile rather than a script run:

- ✅ **D1 — RUN ON PRODUCTION by Paul, 2026-09-20.** Files (note the doubled
  folder name — the repo root is `c:\Git\Diagramatix` and the app is one level
  down, so there is no `scripts\` at the root):
  `…\diagramatix\scripts\sql\check-voice-assist-content.sql` then
  `…\diagramatix\scripts\sql\seed-voice-assist-content.sql`.

  **Verified independently, not taken on trust:** the public `/features` page
  now carries both rows *with the September wording* ("Point at it instead of
  naming it", "Built to mishear gracefully") — text that exists only in the new
  seed — and zero occurrences of the old name. The seed publishes as well as
  inserts, which none of the `.ts` seeds ever did, so a database where those had
  run would still have shown nothing there.

  The guide content is what Voice Assist is *today*. The `.ts` seeds describe
  the 4 August feature: SuperAdmin-only, no confirmations, no numbered picks, no
  selection references, half the vocabulary. They stay useful locally and are no
  longer the route to production.

  The same run **repaired a latent data-loss bug**: `HelpSection.collection` is
  a denormalised copy of its chapter's, and the User Guide's bulk save is
  `deleteMany({ collection: "user-guide" })`. Five `add-tech-notes-*.ts` seeds
  omitted the field, so Technical Notes sections were labelled `user-guide` —
  saving the User Guide would have deleted them. 33 rows on local dev; row 5 of
  the verdict table says how many there were on prod. The code half is fixed and
  guarded (T4578).

- `seed-intent-keywords.ts` and `seed-builtin-templates.ts` — both outstanding
  since before the Suggestion chip work.
- `seed-diagram-rules.cjs` — publishes the assist defaults.

Already run by Paul via the database tile: the Suggestion chip's SQL, and
`rename-abracadabra-to-voice-assist.sql`.

---

## The walkthrough — a current script (~2 hours)

The appendix still carries the 14 September script. **Do not use it.** Most of
what it asks you to watch for is fixed, so it now tests a product that no longer
exists: block 5 tells you a voice move creates no undo entry, block 6 tells you
a batch cannot see its own additions, and block 4 tells you an ambiguous name is
a dead end. All three were the point of the work. It is kept because it is the
record of what was wrong on the day, and because Part 5's item ids are cited
throughout this document.

This is the replacement. It covers everything that has shipped, in the order it
is easiest to test, and it is written so a line that behaves differently from
its **E** column is a finding worth reporting rather than a puzzle.

### Before you start

- A **throwaway BPMN diagram** — `Voice Assist Review 2026-09-21`. `clear` and
  `delete` are real, and although everything is one undo away, do not do this on
  something you care about.
- Sign in as a user whose subscription is **Expert or above**, or stay
  SuperAdmin. If the 🪄 button is missing on a BPMN diagram, that is the gate,
  not a bug.
- Open **DevTools → Network**, filtered on `command`. Every fuchsia **✨ AI** log
  entry should have exactly one request beside it. Counting them is how you tell
  a cheap session from an expensive one.
- Blocks 1–9 can be **typed**, which removes the recogniser from the equation
  and makes a failure unambiguous. Blocks 10–12 need the microphone.

Legend: **E** = expected · **W** = what to watch for. Tick each line.

---

### Block 1 — The shape of a process (10 min, typed)

| # | Say or type | E | W |
|---|---|---|---|
| 1.1 | `add a start event` | Start event near (240, 200) | log tagged **rule**, not ✨ AI |
| 1.2 | `add a task called Receive Order after the start` | Added and connected | — |
| 1.3 | `add a task called Check Stock after Receive Order` | Added and connected | — |
| 1.4 | `insert an exclusive gateway called In Stock after Check Stock` | Gateway, connected | the trailing `?` is stripped if you add one |
| 1.5 | `add a task called Pick Items after the gateway` | Branch 0 | — |
| 1.6 | `add a task called Back Order after the gateway` | Branch 1, ½-task below | fan-out spacing, not overlap |
| 1.7 | `add an end event called Done after Pick Items` | End event, connected | — |
| 1.8 | **R7 probe:** `add a task called Oops after Done` | Task added, **not connected**, log says a sequence flow from Done is not legal | this used to draw a flow **out of an end event** with a green tick |
| 1.9 | `delete Oops` | Gone, no confirmation asked | a single named element deletes at once — deliberate |
| 1.10 | **B5 probe:** `insert a parallel gateway between Check Stock and Pick Items` | Goes to ✨ AI | it must **not** create a gateway named "between Check Stock and Pick Items" |
| 1.11 | **B5 probe:** `add a task before Review` | Goes to ✨ AI | not a task *named* "before Review" |

### Block 2 — Containers (12 min, typed)

| # | Say or type | E | W |
|---|---|---|---|
| 2.1 | `put a pool around everything` | One pool, **no lane**, adopting the loose elements | — |
| 2.2 | `rename the pool to Warehouse` | Header reads Warehouse | — |
| 2.3 | `add three lanes to Warehouse called Sales, Picking and Shipping` | Three equal lanes; elements stay put | lane membership is geometric |
| 2.4 | `add a lane below Picking called Packing` | Four lanes, pool grows | — |
| 2.5 | `swap Sales with Picking` | Swapped | — |
| 2.6 | `swap Sales with Shipping` | Refused — lanes must be adjacent | the message should say why |
| 2.7 | `add two sublanes to Shipping called Domestic and International` | Two sub-lanes | — |
| 2.8 | **B6 probe:** `delete the sublane Domestic` | Deleted, or asks naming only the **sub-lanes** | it must not answer "which lane? there are 4" — that counted top-level lanes as siblings |
| 2.9 | **B6 probe:** `rename the middle sublane to Overseas` | Resolves | — |
| 2.10 | `add a black box pool above Warehouse called Customer` | Black-box participant above | — |
| 2.11 | `compress Warehouse` then `extend the pools to include all elements` | Shrinks, then all pools one width | — |
| 2.12 | **B7 probe:** `create a participant box for the courier above Customer` | Goes to ✨ AI; the new pool lands **above Customer** | the prompt now carries `relativeTo`; without it the model named a position with no anchor and the pool went relative to the whole stack |

### Block 3 — Messages and boundary events (8 min, typed)

| # | Say or type | E | W |
|---|---|---|---|
| 3.1 | `add a message from Receive Order to Customer labelled Order Placed` | Vertical message flow | — |
| 3.2 | `add a message from Customer to Receive Order labelled Confirmation` | Second flow, ≥20px apart | spacing |
| 3.3 | `rename connector Order Placed to Order Received` | Label changes | — |
| 3.4 | `add a boundary event called Timeout to Check Stock` | Clipped to the edge, no connector | — |
| 3.5 | `add a task called Escalate after Timeout` | Placed below/above-right, connector exits the outer face | R7 boundary-follow |
| 3.6 | `delete connector Confirmation` | Removed | — |

### Block 4 — Right-click the black-box pool (4 min, mouse)

| # | Do | E | W |
|---|---|---|---|
| 4.1 | Right-click **Customer**'s header | **No** "Generate SOP for this pool"; IT System / Collection toggles instead | there is no procedure inside a participant box |
| 4.2 | Tick **IT System** | Any Send/Receive task messaging it becomes a **User** task | the rule runs in the reducer, so Properties and the menu agree |
| 4.3 | Untick it | A User task with messages only **to** the pool → Send; only **from** → Receive; a mix → None | — |
| 4.4 | Right-click a **lane header** | "Generate SOP …" is offered | — |
| 4.5 | Right-click the **lane body** | The element matrix instead — Pool/Lane after the gateway, Pain Point / Issue / Review Comment at the end | — |

### Block 5 — The selection as a reference, M1 (8 min, mouse + typed)

| # | Do, then say | E | W |
|---|---|---|---|
| 5.1 | Select **Pick Items** · `rename this to Pick Line` | Renamed, **nothing left selected** | the selection protocol |
| 5.2 | `rename Pick Line to Pick Items` | Back | **B5**: "Line" must not trigger the lane rule |
| 5.3 | Select three tasks · `move these right` | All three move together, 100px | — |
| 5.4 | `nudge these down` | 20px, together | nudge is 20, move is 100 — the log says which |
| 5.5 | Select the pool · `rename the selected pool to Depot` | Renamed | — |
| 5.6 | Select two tasks · `delete these` | **Asks first** | more than one thing → confirmation |
| 5.7 | Say `no` | Dropped, nothing deleted | — |

### Block 6 — Wrapping the selection, M2 (10 min)

| # | Do, then say | E | W |
|---|---|---|---|
| 6.1 | Select two adjacent tasks in one lane · `surround selected with an expanded subprocess called Quality Check` | Room made **in that lane only**; contents kept with their internal flows; Start and End inside; the one flow in and out re-point at the shell | neighbouring lanes untouched; pools widen to one width |
| 6.2 | `delete selected` on that subprocess | Shell and Start/End go, contents splice back, everything slides back to where it was | it should round-trip **without undo** |
| 6.3 | Select elements with a flow to something outside · `wrap these in a pool called Finance` | **Refused**, naming what is on the other side | a sequence flow may not cross a pool boundary — it must not silently become a message flow |
| 6.4 | Select tasks in a pool · `surround selected with a lane called Picking` | New band in that pool, or refused by name if something unselected is level with them | — |

### Block 7 — Convert in place, M3 (6 min)

| # | Do, then say | E | W |
|---|---|---|---|
| 7.1 | Select a task · `make this a user task` | User marker appears | **R5**: it should **flash gold** — a subtype change moves nothing, and used to flash nothing |
| 7.2 | `make it a service task` | Changes | — |
| 7.3 | Select the gateway · `turn the selected gateway into a parallel gateway` | Parallel | — |
| 7.4 | `make this a merge` | Role changes | — |
| 7.5 | Select an event · `make the selected event a timer event` | Timer | — |
| 7.6 | Select a task · `make this a gateway` | **Refused or sent to AI** — a shape change is a different operation | it must not half-do it |
| 7.7 | `make this a plain task` | Marker cleared | — |

### Block 8 — Fill the selection, M4 (8 min)

| # | Do, then say | E | W |
|---|---|---|---|
| 8.1 | Select three tasks across **two lanes** · `name these Alpha, Bravo and Charlie` | Names land in **reading order** — rows top to bottom, each row left to right | the lanes must not interleave; this is the whole design problem |
| 8.2 | Select four · `name these One, Two and Three` | **Refused**, naming both counts | it must not rename three and leave the fourth |
| 8.3 | Select two tasks · `assign these to the Finance team` | Both get the team | check Properties → Simulation |
| 8.4 | Select a task **and a gateway** · `assign these to the Sales team` | Task assigned, gateway **named and skipped** | a team belongs to an activity |
| 8.5 | `move these right` | A **move**, not a team assignment | the word "team" must actually be said |
| 8.6 | Select tasks · `attach risk R-012 to these` | Attached if the project has a library; otherwise says there is none | — |
| 8.7 | `attach risk R-99 to these` | Not found, says so | — |
| 8.8 | `attach risk duplicate paymnt to these` (typo) | **Not found** | names are never matched fuzzily — the wrong control survives into an audit |

### Block 8b — Align the selection, M7 (5 min)

| # | Do, then say | E | W |
|---|---|---|---|
| 8b.1 | Select three untidy tasks · `align these` | Tidied — the Alignment ▾ menu's smart mode | one dispatch, one undo |
| 8b.2 | `undo that` · then `align these in a row` | All three on one **horizontal** line | — |
| 8b.3 | `undo that` · then `line these up in a column` | One **vertical** line | — |
| 8b.4 | `align their left edges` | Left edges flush | the four edge forms are never ambiguous |
| 8b.5 | **The deliberate refusal:** `align these horizontally` | Goes to **✨ AI**, which should ask what you mean | it must **not** silently pick one — half of people mean "along a horizontal line", half mean "move them horizontally" |
| 8b.6 | `space these evenly` | Not understood / ✨ AI | **not built** — no distribute reducer exists, and a bad distribute looks finished |
| 8b.7 | Select **one** element · `align these` | "Select two or more elements to align" | — |

### Block 8c — Take the ghost, M8 (5 min)

Turn **👻 Assist** on for this block.

| # | Do, then say | E | W |
|---|---|---|---|
| 8c.1 | Select a task with ghosts showing · `accept the suggestion` | The first ghost is applied — same as **Tab** | — |
| 8c.2 | Select another · `take the gateway` | The gateway ghost, whichever position it is in | by kind, not position |
| 8c.3 | `take the second one` | The second ghost | — |
| 8c.4 | `take the subprocess` when no subprocess is offered | "That isn't on offer — Task, Decision, End" | it names what IS offered; the ghosts are translucent and easy to misread |
| 8c.5 | With **no** ghost showing · `accept` | "No suggestion showing — select an element with Assist on" | — |
| 8c.6 | **The "yes" probe:** say `clear the diagram`, then with a ghost showing say `yes` | **The diagram clears** — "yes" belongs to the confirmation, not the ghost | this is why "yes" was not made an accept word |
| 8c.7 | `undo that` | Everything back in one step | — |
| 8c.8 | During `rename tasks`, say `3` | Picks item **3**, not ghost 3 | a bare number answers a numbered pick |

### Block 9 — Point instead of naming, M5 (6 min, mouse + typed)

| # | Do, then say | E | W |
|---|---|---|---|
| 9.1 | Move the mouse to empty canvas · type `put a task here` | Task appears **at the pointer**, no connector | nudged clear if something is close |
| 9.2 | Hover a task · `rename the one under the cursor to Spotted` | That task renamed | — |
| 9.3 | Deselect everything, hover a task · `delete this` | The hovered task | with **nothing** selected, the pointer beats document order |
| 9.4 | **Select** a different task, hover another · `rename this to Chosen` | The **selected** one renames, not the hovered one | the selection always wins — this is the M1 guarantee |
| 9.5 | Hover a pool's bare area · `rename the one under the cursor to Depot Two` | The pool | a pointer inside a pool over a task finds the task |
| 9.6 | `add a task called Here` | A task named "Here" | the position word must not eat the name |

### Block 10 — Numbered picks and the picker, R2/R3 (8 min, voice from here)

| # | Say | E | W |
|---|---|---|---|
| 10.1 | Click 🎙 | Header says **connecting…** then **listening…**, with no "(browser)" | "(browser)" means cloud voice is unavailable — it should now say why |
| 10.2 | `rename tasks` | Green numbers on every task, **below** activities | — |
| 10.3 | `3 Approve Order` | Renamed in one breath; badges renumber; **nothing stays selected** | — |
| 10.4 | `5` … pause … `Verify Goods` | Two-step pick works | between number and name the item **stays** highlighted — that is the cue |
| 10.5 | `done` | Pick ends, **mic stays on** | — |
| 10.6 | Make two tasks called Review · `rename Review to Final Review` | **The picker appears** on the two candidates | it used to be a dead end that threw the list away |
| 10.7 | Say the number | Renamed | — |
| 10.8 | **R3 probe:** `delete the task` with several present | **Asks which** | it used to take the most recent with a green tick |
| 10.9 | `add a message` | Numbers every task, collapsed subprocess and black-box pool | — |
| 10.10 | `3 to 7 labelled Order Placed` | Message drawn | — |

### Block 11 — Undo, confirmation, and failure messages (8 min, voice)

| # | Say | E | W |
|---|---|---|---|
| 11.1 | `add a task called Ship Order after Approve Order` then `undo that` | **The whole command** reverts in one step | **B3** — this used to take 3–5 Ctrl+Z |
| 11.2 | `nudge Ship Order up` then `undo that` | The nudge reverts | **B2** — a voice move used to create no history entry at all |
| 11.3 | Drag any element by hand, release, Ctrl+Z | Only the drag reverts | **B2** — the drag and the voice move used to revert together |
| 11.4 | `clear the diagram` | **Asks first** | — |
| 11.5 | `no` | Nothing cleared | — |
| 11.6 | **R6 probe:** `rename Eskalate to Chase` | "Couldn't find … — did you mean *Escalate*?" | it used to say only "couldn't find" |
| 11.7 | **R6 probe:** `delete Pick Crates` | Suggests *Pick Items* | from shared words as well as sound |
| 11.8 | `again` after a nudge | Repeats it | — |

### Block 12 — Voice reliability, V1/V2/B4/B8 (12 min, voice)

| # | Do | E | W |
|---|---|---|---|
| 12.1 | Say a task's **own name** — an unusual one like *Reconciliation* | Heard correctly | **V1** primes the recogniser with this diagram's labels when the mic opens |
| 12.2 | Deliberately mispronounce a name slightly — "eskalayt" for Escalate | Resolves anyway, tagged **rule**, no AI call | **V2** matches by sound |
| 12.3 | Say a name that sounds like two others | **Asks**, does not guess | sounding alike is exactly when you should choose |
| 12.4 | Say `rename Quality Gate to` … pause 2s … `Inspect Goods` | Held and applied as **one** command | the split-command hold |
| 12.5 | Say `Swap,` then `top and bottom` | One command | the comma after the verb is ignored |
| 12.6 | **B4 probe:** start a long ✨ AI command, and while "thinking…" shows, say another | The second **queues**, does not act on stale state; log lines do not interleave | — |
| 12.7 | **B8 probe (needs an OrgAdmin):** turn off **allowVoiceAi** in Org Settings, drop out of SuperAdmin view, click 🎙 | A **policy message**, and voice does not start | it used to silently use the browser engine, ignoring the policy |
| 12.8 | Leave the mic idle 2 minutes | Closes itself, says so | an open socket is billed by the minute |
| 12.9 | Say `stop` | Mic off | — |

### Block 13 — What it cost, and what to report (6 min)

| # | Do | E |
|---|---|---|
| 13.1 | Click **Commands** | The card lists everything by family; drag it by its title |
| 13.2 | Click **Cost** | One line: AI calls at list price + microphone minutes, labelled an estimate |
| 13.3 | Read the line **under** Cost | "N commands · M didn't land · K fixed on a re-try (x misheard, y rephrased)" |
| 13.4 | Count fuchsia ✨ AI entries against Network requests | They should match exactly |

**13.5 — the number that decides V3.** Write down the misheard/rephrased split
from 13.3, and from any other real session you run this week.

- Mostly **misheard** → the recogniser is still losing words, and a personal
  phrase book (V3) has something to learn. Build it.
- Mostly **rephrased** → you were changing your words to suit the grammar. No
  amount of phonetic learning helps; the same effort belongs in the grammar and
  the AI prompt instead, and V3 should be dropped.

That is the whole reason V3 shipped as a measurement rather than a feature, and
this line is how the decision gets made from evidence instead of impressions.

### What to report back

For each ticked line that did **not** match its **E** column: the block number,
what you said, what the log said, and what the diagram did. A log line and a
screenshot is enough — the log records what was heard *and* what was done, which
separates a recogniser problem from a grammar problem straight away.

---

## A note on how this went

Two thirds of what has been delivered since the plan was written was **not in
the plan**. It came from Paul using the feature and saying what was wrong.

That is not a criticism of the plan — it found real defects, and Session 1 fixed
the ones that mattered most. But a backlog written by reading code predicted the
wrong next steps twice over: the live sessions surfaced a lost first word, an
ambiguous stop word, and a need to address things by number, none of which
appear anywhere in it; and this pass found three more by measuring rather than
by reading.

The pattern worth carrying forward is the measuring. V2 was designed *after*
running real mis-hears through the resolver, which showed that the multi-word
cases already worked and narrowed the whole feature to the two shapes that
didn't. Had it been built from the plan's description it would have been much
larger and would have fixed less.

---

# Appendix — the original review plan (14 September 2026)

*Reproduced verbatim. Read-only findings; nothing had been changed at the time
of writing. Confidential feature — no external sharing.*

### Context

Voice Assist is the voice/typed live-editing feature for BPMN: say or type "add a task called Approve after Review" and the diagram edits itself, undoably, with a visible log of what was heard and what was done. It shipped in five stages on 4–5 August 2026 (`d57eaafc` → `7c164eeb`), Paul confirmed it "very reliable now", it was locked to SuperAdmin "for the time being", and **it has not been touched since 5 August** — the only later changes were to the separate ghost-suggestion feature. Six weeks on, Paul wants a complete review. This document is the brief: what it does today (read from the code, not the memory), what is wrong with it, what could make it better, and a script to test it live tomorrow.

Confidential feature — no external sharing (Paul's standing instruction).

---

### Part 1 — What it does today

#### The pipeline

```
🪄 toggle (BPMN diagram, SuperAdmin only)
   └─ VoiceAssistBar: 🎙 mic (Deepgram nova-2 en-AU streaming, browser fallback) + typed input + command log
        └─ fragment buffering (2.2 s silence; 3.2 s if the sentence looks unfinished, max 3 waits)
             └─ runVoiceCommand(utterance)
                  ├─ parseCommand()  — deterministic regex grammar, 23 op kinds, instant, free   → tagged "rule"
                  └─ (null) POST /api/ai/command {instruction, whole diagram}                   → tagged "✨ AI"
                          returns {canonical, ops}; canonical is re-parsed by the grammar
                               └─ applyAssistOps(ops) → granular undoable reducer helpers
                                    → command log line "heard → did" (✓ or amber)
```

Key files: `app/lib/assist/{ops,commandGrammar,resolveRef,renameTargets,serializeDiagram}.ts` · `app/(dashboard)/diagram/[id]/DiagramEditor.tsx` (`applyAssistOps` ~2669–3036, `runVoiceCommand` ~3090–3130, voice ~3140–3240) · `app/components/canvas/VoiceAssistBar.tsx` · `app/api/ai/command/route.ts` · `app/lib/dictation/index.ts` · reference doc `docs/voice-assist-commands.md`.

#### The vocabulary (23 ops)

| Family | Ops | Example |
|---|---|---|
| Elements & flow | `add` (after X, called Y), `connect`, `disconnect`, `rename`, `renameByType` (say "rename tasks" → green numbers appear → say a number → dictate the name), `move` (N elements left/right/up/down), `delete` (+ "and compact"), `addBoundary` | "add a task called Approve after Review" · "connect them" · "remove Prepare and compact" |
| Pools | `addPool` (black/white box, above/below a named pool), `wrapInPool` ("put a pool around everything"), `compressPool`, `extendPools`, `nudgePool` | "add a black box pool above Customer" |
| Lanes | `addLanes` (N named), `addLaneAt` (above/below X), `addSublanes`, `swapLanes`, `moveLane` | "add 2 lanes to the middle pool called Sales and Marketing" |
| Messages | `addMessage` (from/to, labelled) | "add message from Task 1 to IT System labelled Email Details" |
| Diagram | `clear`, `export` (json), `undo`, `again` | "clear the diagram" · "do it again" |

References resolve by: exact / kind-stripped / substring / token-fuzzy name; bare nouns ("the gateway" → most recent of that type); pronouns ("it", "the last", "the previous"); positional for containers only ("the middle pool"); spoken numbers normalised ("lane two" → Lane 2).

#### What only the AI fallback adds
Connector types other than sequence, typed boundary events (error/timer), a label on wrap-in-pool, mis-hear correction (poll→pool, line→lane), and — in principle — multi-op batches. The AI runs on the **global generate model (Opus 5)** and receives the **entire diagram** every time; it is a raw AI invocation, deliberately not counted against the user's AI-attempt quota.

#### Guards and metering
Org policy `allowAi` on the route; `allowVoiceAi` on the Deepgram token (but see defect 9); per-session `DictationSession` row + AI Usage "Voice dictation" card; 2-minute idle auto-close because an open Deepgram stream is billed by the minute; spoken "stop" / "that's enough" / "thank you Gort" ends the session.

#### Docs and gating status (found, not assumed)
- `docs/voice-assist-commands.md` is complete and current.
- The User Guide chapter "AI Assist & Voice Assist" and the Tech Notes chapter exist **only as unrun seed scripts** (`scripts/add-guide-ai-assist.ts`, `add-tech-notes-ai-assist.ts`); the 10 Sep guide snapshot has no such chapter. Features rows (`add-features-ai-assist.ts`) insert as DRAFT.
- Feature registry keys `voice-assist` and `nl-assist` exist but **nothing reads them**; the real gate is `isActingAdmin && diagramType === "bpmn"`.
- No `VERSION_HISTORY.md` entry — the feature predates the file by two days.
- Tests: T2212–T2215 (grammar, resolveRef, validateOps) + T2207–T2211 (placement geometry). **Nothing** tests the API route, `applyAssistOps`, `runVoiceCommand` or the voice buffering.

---

### Part 2 — Defects found in the code (to confirm live tomorrow)

| # | Defect | Where | Symptom |
|---|---|---|---|
| 1 | Multi-op AI batches resolve every ref against the **elements snapshot taken before the batch** | `applyAssistOps` captures `const els = data.elements` once | "add a task called X and connect it to Y" via AI: the connect can't find X (or silently connects the previous element) |
| 2 | `move` / `nudgePool` call `moveElements` but never `elementsMoveEnd` | `applyAssistOps` move branches | No undo entry for a move; "undo that" reverts the *previous* command; a later mouse drag commits a stale snapshot |
| 3 | One utterance → up to 5 history entries | every reducer helper pushes its own snapshot | "undo that" after "add a task called X after Y" removes only the connector |
| 4 | `e.type === "sublane"` checks are dead (sublanes are `type: "lane"` with a lane parent) | `applyAssistOps` 2697/2786/2810 | "which sublane?" guard and move-band exclusion never apply to sublanes |
| 5 | Over-greedy regexes | `commandGrammar.ts` 101, 106, 167 | "collapse the subprocess" → compressPool; "swap Task A with Task B" → swapLanes; "move the Assembly Line task up" → moveLane |
| 6 | Bar's docblock promises per-entry undo that doesn't exist | `VoiceAssistBar.tsx:5` | Stale comment / unbuilt feature |
| 7 | `renameByType` and `addPool.relativeTo` missing from the AI prompt's op list | `route.ts` 59–80 | AI can't reach the guided rename or "add pool above X" |
| 8 | `voiceBusy` gates the Run button, not the voice path | `flushVoiceBuffer` | Two spoken commands during one AI call both act on stale state; log lines interleave |
| 9 | `allowVoiceAi` 403 silently falls back to browser speech | `startDictation` treats any non-ok token as "not configured" | An org that forbids cloud voice still gets voice |
| 10 | Enter in the text box ignores `busy` | `VoiceAssistBar.tsx:106` | Double submission |

---

### Part 3 — Gaps (no bug, but the feature is less than it could be)

- **No confirmation** for `clear` / `delete` — executes immediately (undo recovers).
- **No disambiguation picker** except inside the rename flow: an ambiguous ref → terse error, candidate list thrown away; bare nouns silently pick the most recent with a green ✓.
- **Undo is per reducer call**, not per command (defect 3 is the symptom; the fix is a `beginBatch/endBatch` in `useDiagram`).
- **`canConnect` is not consulted** for the auto-connect in `add` (only for explicit `connect`).
- **Whole-diagram re-serialisation** per AI call, no cap; **no timeout/abort/streaming**; runs on the expensive generate model.
- **Grammar is regex-only** — an admin-editable phrase overlay pattern already exists for rich-text dictation (`app/lib/dictation/commands.ts` + `/api/ai/dictation/commands`) but Voice Assist doesn't use it; only the AI prompt gets the green "assist" rules.
- **Unconnected neighbours that are already imported into the same file**: the scanner (`checkDiagram`) never runs after a command, so "that leaves Task X unconnected" is never said; Entity Lists never validate a spoken lane/pool name; ghost suggestions (`suggestNextSteps`) and spoken commands don't know about each other; `closeFlowVoids` could be a safe no-AI "tidy up" but is only called inside the layout engine.
- **No macros** (a SavedPrompt store exists for generation prompts; the `canonical` string the route returns is the natural recordable unit).
- **No TTS** anywhere in the app — feedback is the visual log only.
- **BPMN-only** in five places (toggle, `SYMBOL_SYNONYMS`, `CONNECTOR_VALUES`, the prompt, `renameTargets`); EPC/flowchart would need per-type synonym tables and `diagramType` threaded through.
- **Deepgram keyword boosts are a hard-coded list** — could be fed the current diagram's labels + entity names to fix mis-hears at the recogniser rather than in the AI.

---

### Part 4 — Review walkthrough script (~85 min, tomorrow)

**Do this on a throwaway diagram** — `clear` and `delete` have no confirmation. Create a new blank BPMN diagram `Abra Review 2026-09-14`. The 🪄 button only shows while the logo view is SuperAdmin (not "hidden"). Type blocks 1–6 (deterministic timing); use voice in block 7. Open DevTools → Network filtered on `/api/ai/command` to count fallbacks and see payload size and latency.

Legend: **E** = expected · **W** = watch for (defect/gap numbers from Part 2). Tick pass/fail per line.

#### Block 1 — Core adds and connects (10 min)
| # | Type | E | W |
|---|---|---|---|
| 1.1 | `add a start event` | start event near (240,200); log "rule ✓" | — |
| 1.2 | `add a task called Receive Order` | placed right of the start, **not connected** | auto-connect only happens with "after X" — is that what you want? |
| 1.3 | `connect the start to Receive Order` | flow drawn | bare noun "the start" resolves |
| 1.4 | `add a task called Check Stock after Receive Order` | added + connected | — |
| 1.5 | `add a gateway called In Stock? after Check Stock` | gateway labelled **In Stock** — trailing `?` stripped | punctuation loss in labels |
| 1.6 | `add a task called Pick Items after the gateway` | branch 0 | branch geometry |
| 1.7 | `add a task called Back Order after the gateway` | branch 1, ½-task below | fan-out spacing |
| 1.8 | `add an end event called Done after Pick Items` | end event, connected | — |
| 1.9 | `connect Done to Back Order` | **rejected** "can't connect Done → Back Order" | then `add a task called Oops after Done` — does auto-connect draw a flow *out of an end event*? (gap: `canConnect` not applied to auto-connect) |

#### Block 2 — Containers (15 min)
| # | Type | E | W |
|---|---|---|---|
| 2.1 | `put a pool around everything` | pool wraps all | — |
| 2.2 | `rename the pool to Warehouse` | header = Warehouse | — |
| 2.3 | `add three lanes to Warehouse called Sales, Picking and Shipping` | 3 equal lanes; elements stay put | lane membership is geometric |
| 2.4 | `add a lane below Picking called Packing` | 4 lanes | — |
| 2.5 | `swap Sales with Picking` | swapped | — |
| 2.6 | `swap Sales with Shipping` | error "lanes must be next to each other" | message gives no way forward |
| 2.7 | `add two sublanes to Shipping called Domestic and International` | two sublanes | sublanes are `type:"lane"` — [4] |
| 2.8 | `add a black box pool above Warehouse called Customer` | black-box Customer above | [7] only matters via AI |
| 2.9 | `move the Sales lane up` then `again` | two 32px shifts, two log entries | — |
| 2.10 | `compress Warehouse` then `extend the pools to include all elements` | shrink, then all pools same width | — |
| 2.11 | `add a subprocess called Quality Check after Back Order` then `collapse the subprocess` | **[5]** parses as `compressPool` → "Quality Check isn't a pool"; never reaches AI | confirm greedy compress regex |
| 2.12 | `rename Pick Items to Pick Line` then `move Pick Line up` | **[5]** "Line" triggers the lane rule → `moveLane` → "isn't a lane"; task doesn't move | then `rename Pick Line to Pick Items` |

#### Block 3 — Messages and boundary events (10 min)
| # | Type | E | W |
|---|---|---|---|
| 3.1 | `add a message from Receive Order to Customer labelled Order Placed` | vertical message to Customer | — |
| 3.2 | `add a message from Customer to Receive Order labelled Order Confirmation` | second message ≥20px apart | spacing |
| 3.3 | `rename connector Order Placed to Order Received` | label changes | `messageLabelKey` strips "connector" |
| 3.4 | `add a boundary event called Timeout to Check Stock` | boundary on Check Stock | — |
| 3.5 | `add a boundary event to Check Stock called Out of Stock` | second boundary, other corner | placement |
| 3.6 | `add a task called Escalate after Timeout` | task below/above-right; connector exits outer face (R7) | — |
| 3.7 | `delete message Order Confirmation` | removed | no confirmation — gap |
| 3.8 | **AI #1**: `add a message to Customer` | grammar bails → fuchsia AI; canonical `add a message from <last> to Customer` | latency; payload = whole diagram |

#### Block 4 — Guided rename and ambiguity (8 min)
| # | Type | E | W |
|---|---|---|---|
| 4.1 | `rename tasks` | green numbers on every task | — |
| 4.2 | `<n> Pack Boxes` (pick Escalate's number) | renamed in one breath; badges renumber; loop stays open | — |
| 4.3 | `<n>` then `Verify Goods` | two-step pick then name | — |
| 4.4 | `stop` | "rename finished" | — |
| 4.5 | `add a task called Review after Pack Boxes` then `add a task called Review after Verify Goods` | two tasks named Review | — |
| 4.6 | `rename Review to Final Review` | **gap**: "Review is ambiguous", candidates discarded, no picker — even though 4.1's badge flow exists | evidence for the disambiguation picker |
| 4.7 | `rename tasks` → pick one Review → `Final Review` → `stop` | workaround | — |

#### Block 5 — Delete, compact, undo (12 min) — defects [2] and [3]
| # | Type | E (ideal) | Actual / W |
|---|---|---|---|
| 5.1 | `delete Escalate and compact` | removed, gap closed | — |
| 5.2 | `undo that` | both restored | **[3]** only the compaction reverts; the task stays deleted |
| 5.3 | `add a task called Ship Order after Pack Boxes` then `undo that` | task gone | **[3]** one utterance pushed 3–5 entries; one undo removes only the connector/extend. Count the Ctrl+Z presses needed |
| 5.4 | `move Back Order right` then `undo that` | moves back | **[2]** nothing happens — no history entry for a voice move |
| 5.5 | now **drag any element by hand** a few px, release, Ctrl+Z | only the drag reverts | **[2]** the drag *and* the voice move revert together |
| 5.6 | `nudge Customer down by 40` then `again` then `undo that` | — | same as 5.4 |
| 5.7 | `delete the task` | should ask which | **gap**: silently deletes the most recent task with a green ✓ |
| 5.8 | `delete the lane` | — | container guard fires: "which lane? there are N" — contrast with 5.7 |
| 5.9 | `export the diagram to JSON` | download | keep it for 8.1 |

#### Block 6 — AI fallback (10 min) — defect [1]
| # | Type | E | W |
|---|---|---|---|
| 6.1 | **AI #2**: `Please rename the gateway to Stock Available` | fuchsia AI; canonical re-parsed; renamed | latency on Opus 5; request body size |
| 6.2 | **AI #3**: `The customer needs to know when we ship, add a message for that` | canonical `add a message from Ship Order to Customer labelled …` | does the AI pick a sensible source? |
| 6.3 | **[1] probe**: `After Pack Boxes add a task called Label Parcel and connect it to Verify Goods` | added *and* connected | if two ops come back, "it" resolves against the stale snapshot → wrong link or "can't connect"; if one canonical comes back, the connect is silently dropped. Either is the defect |
| 6.4 | `insert a parallel gateway between Check Stock and Pick Items` | should be AI | **actual**: green rule — the add rule creates a gateway literally labelled "between Check Stock and Pick Items" — more [5] |
| 6.5 | `what does this diagram do` | not an edit | "didn't understand that" — but a full Opus call was made (Network tab) |

#### Block 7 — Voice (12 min)
1. Click 🎙. Header "listening…" with **no** "(browser)" suffix → Deepgram. "(browser)" = the silent degrade path [9].
2. Say **"add a task called Quality Gate after Verify Goods"** → applies ~2.2 s after you stop; watch the italic interim caption.
3. Say **"rename Quality Gate to"** … pause 2 s … **"Inspect Goods"** → held (3.2 s grace) and applied as one command. Early firing → "couldn't rename".
4. Say **"nudge Customer up"**, **"again"**, **"again"** → three entries, 60px. Ctrl+Z: nothing — [2].
5. Say **"rename lanes"** → badges instantly; **"two"** → instant pick; **"Fulfilment"**; **"stop"** → loop ends, mic stays on.
6. **[8]/[10] probe**: say **"Please rename the gateway to Inventory Check"** and while "thinking…" shows, type `delete Inspect Goods` + Enter. Ideal: queued or refused. Actual: Enter bypasses busy; the AI result then applies over pre-delete state. Repeat by voice for [8].
7. Say **"stop"** → mic off.
8. Optional [9]: Org Settings → allowVoiceAi off → hide SuperAdmin so policy binds → 🎙. Ideal: a policy message. Actual: silently "(browser)".
9. Optional: leave the mic 2 min → "closed — 2 minutes idle".

#### Block 8 — Wrap-up (5 min)
| # | Type | E / W |
|---|---|---|
| 8.1 | `clear the diagram` | wipes immediately, **no confirmation**; then `undo that` — one undo should restore everything |
| 8.2 | count fuchsia entries vs Network requests; note the slowest latency | evidence for C5 |
| 8.3 | run the BPMN scanner manually | issues surface only now, never during editing — evidence for R8 |

---

### Part 5 — Ranked improvement backlog

Effort S/M/L · Value H/M/L · Evidence = script line.

#### Bugs to fix regardless
| # | Title | Fix | E | V | Evidence |
|---|---|---|---|---|---|
| B1 | Stale snapshot across a multi-op batch | In `applyAssistOps` keep a mutable working copy of `els`: after each `add`/`addBoundary` push a synthetic element so `resolve1` and `lastAddedId` see it; splice on delete | M | H | 6.3 |
| B2 | `move`/`nudgePool` skip `elementsMoveEnd` | Call `elementsMoveEnd()` right after `moveElements(...)` (two sites) | S | H | 5.4–5.6, 7.4 |
| B3 | One utterance = up to 5 undo entries | `beginHistoryGroup()/endHistoryGroup()` in `useDiagram.ts` (one snapshot on begin, suppress `pushHistory` until end); wrap each `applyAssistOps` call; fix the VoiceAssistBar docblock [6] in the same change | M | H | 5.2, 5.3 |
| B4 | Busy not enforced (Enter, voice); AI result applied to a stale closure | Gate Enter on `busy`; `voiceBusyRef` + FIFO queue drained in `finally`; read `data.elements` through a ref after the await | S | M | 7.6 |
| B5 | Over-greedy grammar | compress requires a pool word or bails; lane rule requires "lane" adjacent to the ref; add rule bails on `between/before/instead of/replace`; swap type-mismatch → retry via AI | M | M | 2.11, 2.12, 6.4 |
| B6 | Dead `"sublane"` checks | `isSublane(e, els)` (lane whose parent is a lane), as `resolveRef` already does | S | L | 2.7 |
| B7 | AI prompt op list incomplete | Add `renameByType` and `addPool.relativeTo` + canonical "add a pool called X above/below Y" to `SYSTEM` | S | M | 2.8 |
| B8 | allowVoiceAi 403 degrades silently | Surface the policy message through `onError`; don't auto-start the browser engine (or label it) | S | L | 7.8 |

#### Reliability / UX
| # | Title | Fix | E | V | Evidence |
|---|---|---|---|---|---|
| R1 | Confirmation for destructive commands | `pendingConfirmRef` like the rename flow: "say yes to clear the diagram"; next utterance yes/confirm executes, anything else cancels | S | H | 5.7, 8.1 |
| R2 | Disambiguation picker | On `{ambiguous}` park the op, show numbered badges for the candidates (the rename-flow mechanism), next number resumes | M | H | 4.6 |
| R3 | Bare type noun on destructive ops | delete/rename with a bare noun and >1 candidate → R2, not most-recent | S | M | 5.7 vs 5.8 |
| R4 | Timeout/abort + smaller payload | `AbortController` (20 s); serialise without geometry, cap element count with a "…" marker | S | M | 6.1, 8.2 |
| R5 | Richer log entries | Flash/zoom the affected ids; per-entry undo once B3 exists | M | M | 5.3 |
| R6 | Better failure messages | "couldn't find X — did you mean Y?" from the token-overlap pass | S | M | 2.6 |
| R7 | Auto-connect respects `canConnect` | Check before `addConnector` in the add branch | S | M | 1.9 |
| R8 | Scanner feedback per command | Run `checkDiagram` on the new state; append "+N issues" to the log line | M | M | 8.3 |

#### Capability extensions
| # | Title | Sketch | E | V |
|---|---|---|---|---|
| C1 | `redo` + "undo the last two" | grammar + `redo()`; needs B3 | S | M |
| C2 | Entity-list validation | fuzzy-match spoken lane/pool names against the project's entity lists: "did you mean Warehouse Team?" | M | M |
| C3 | Ghost bridge | "accept the suggestion" / "add ghost 2" → `acceptNextStep` | M | M |
| C4 | Tidy/align ops | `tidy up` → `closeFlowVoids` (pure, already in the codebase); `align X with Y` | M | M |
| C5 | Cheaper command model + prompt caching | new `aiCommandModel` setting (Haiku-class); `cache_control` on the system block; streaming not worth it for ~100 tokens | S | H |
| C6 | Admin phrase overlay + macros | reuse the DB-backed pattern from `app/lib/dictation/commands.ts`; macros = a store of `canonical` utterance lists | M/L | M |
| C7 | Select / annotation / colour ops | `select X`, `add a note to X saying …`, `colour X red` | M | L |
| C8 | EPC / flowchart | `SYMBOL_SYNONYMS` per `diagramType`; placement is already generic | L | M |
| C9 | Non-SuperAdmin gating via entitlements | read registry key `voice-assist` + plan entitlement instead of `isActingAdmin`; voice also behind `allowVoiceAi` | S/M | H |
| C10 | TTS read-back of the summary | browser `speechSynthesis` | S | L |

#### Multi-modal — selection + voice (Paul, 14 Sep: "Add an Expanded Subprocess around the selected elements", "Change the name of the selected Pool to Customer")
The selection is state the editor already holds (`selectedElementIds` / `selectedConnectorId` in `DiagramEditor.tsx`; `selectedIds` in `useDiagram.ts`). Treating it as a **reference modality** removes the whole class of name-mis-hear failures for the referent: the mouse says *which*, the voice says *what*. Verified: "Collapse to Subprocess" at `DiagramEditor.tsx:6316` collapses an existing EP into a linked diagram — it is not selection→subprocess, so M2 is a new reducer action modelled on `WRAP_IN_POOL`.

| # | Title | Sketch | E | V |
|---|---|---|---|---|
| M1 | Selection as a reference | `resolveRef` learns `the selected <kind>`, `the selection`, `these`, `this`, `the highlighted one(s)`: resolve to `selectedElementIds` (filtered by kind when given; ambiguity impossible). Every existing op gains it for free — "rename the selected pool to Customer", "delete these", "connect this to Approve", "move the selected task right", "add a boundary event to this" | S | H |
| M2 | Wrap the selection | `wrapSelection {container: subprocess-expanded \| pool \| lane, label?}` — "put an expanded subprocess around the selected elements", "wrap these in a pool called Finance". New reducer action modelled on `WRAP_IN_POOL` (bounding box + ½-task margin, reparent, keep connectors) | M | H |
| M3 | Convert in place | "make this a user task / service task / parallel gateway / timer event" → the type-conversion actions the right-click `ElementContextMenu` already offers (Task kinds, gateway kinds, event kinds, loop / MI markers). Grammar: `make (this\|the selected …) (a\|an) <subtype>` | S | H |
| M4 | Fill the selection | "name these Receive, Check and Ship" (labels in reading order over the selection), "assign the selected tasks to the Finance team" (simulation team), "attach risk R-012 to these" (GRC) | M | M |
| M5 | Pointer as a reference | "put a task here" / "add a gateway there" at the last canvas pointer position; "connect this to that" where *that* = the element under the pointer at the end of the utterance. Needs a `lastPointerRef` on the Canvas (does not exist yet — only `hovered`) | M | M |
| M6 | Marquee + voice | drag a marquee, say "select all the tasks in here" / "these are the Finance lane" (create a lane sized to the marquee and adopt) | M | M |
| M7 | Selection-scoped tidy | "align these", "space these evenly", "same size as this" — needs new align/distribute reducers (none exist today) | M | M |
| M8 | Ghost + voice | with a ghost showing: "yes" / "take the gateway" / "the second one" → `acceptNextStep` (same as C3) | S | M |
| M9 | Properties-panel context | while an element is selected, bare fragments become property edits: "cycle time 4 minutes", "team Assessors", "50 percent" on a selected flow — the panel is already the context, the voice fills the field | M | M |

Order: M1 → M3 → M2 (one session; M1 is the enabler and tiny), then M4/M9, then M5–M7. Confirm at the review whether the selection survives clicking the command bar's text box (if focus clears it, the bar needs to preserve the last selection — a one-line ref).

#### Voice reliability (Paul, 14 Sep: "Would voice training help?" — not as speaker enrolment, which neither engine offers; as vocabulary and learning from corrections, yes)
| # | Title | Sketch | E | V |
|---|---|---|---|---|
| V1 | Dynamic keyword boosting | Replace the hard-coded dozen boosts in `startDictation` (`app/lib/dictation/index.ts` ~150) with the current diagram's element labels + the project's Entity List names, sent per session; then move nova-2 `keywords` → nova-3 keyterm prompting (up to ~100 terms, better on proper nouns) | S | H |
| V2 | Phonetic matching in `resolveRef` | Add a Double Metaphone pass after token-overlap: "pic items" / "ware house" / "poll" resolve to the right element instantly and free, instead of via an Opus call. Same pass feeds V3 | S | H |
| V3 | Personal phrase book (learn from corrections) | Persist `(heard → canonical, ok)` pairs per user from the command log — a failed command followed by a working re-issue is a training pair. Use them (a) as extra boosts for V1 and (b) as aliases the grammar checks before the AI fallback. Reuse the admin-editable overlay pattern from `app/lib/dictation/commands.ts` + `/api/ai/dictation/commands`, keyed per user | M | H |
| V0 | Measure first | During the review tally log failures as ASR (wrong words) vs grammar (right words, wrong parse) — only the first is a voice problem; the audit suggests the second is the larger share once names are boosted | — | — |

Order: V0 during the review → V1 → V2 → V3.

#### Docs / ops
| # | Title | E | V |
|---|---|---|---|
| D1 | Publish the guide, tech-notes and features rows (diff the three seed scripts against `docs/voice-assist-commands.md`, then run them) | S | M |
| D2 | VERSION_HISTORY entry for the 2026-08-05 feature + the fix sessions | S | M |
| D3 | Tests for the untested half: extract the op-apply loop into `app/lib/assist/apply.ts` with an injected command interface; route test with a mocked client; fake-timer tests for `isIncompleteCommand`/flush | M/L | H |
| D4 | Fix the stale docblock and the memory note ("NEXT: Tier-2 NL command bar, AI route" — both shipped) | S | L |

#### Delivered from live use — the L family (added 2026-09-17, after the fact)

These were not in the backlog above. They came out of Paul using the feature
and saying what was wrong, and they account for roughly two thirds of
everything shipped since the plan was written. They are given ids here so the
plan is a complete record rather than only a record of what was predicted, and
so later work can cite them.

The pattern worth keeping: every one of these is an *interaction* defect —
something that made the feature feel unreliable in the hand — and none of them
were visible from reading the code, which is what the backlog above was built
from.

| # | Title | Commit | Tests |
|---|---|---|---|
| L1 | **The first word was lost.** Audio was wired to the recogniser only once the socket opened, while the bar already said "listening" — so whatever was said during the handshake went nowhere. Audio is now buffered through the handshake and the mic opens in parallel, with a "connecting…" state that tells the truth | `49b13eb1` | T4400–T4407 |
| L2 | **"Stop" was ambiguous** — it ended a numbered pick and the microphone at once. Mic words are now separate from flow words: "stop" always ends the mic, "done"/"cancel"/Escape end a pick and keep listening | `49b13eb1` | T4400–T4407 |
| L3 | **Messages by number.** "Add a message" numbers every valid end and takes "3 to 7 labelled Order Placed"; with a selection it numbers only the valid counterparts | `49b13eb1` | T4400–T4407 |
| L4 | **Nudge was a jump.** 20 px, in any direction, on the named element only; the log line says whether a nudge or a move was heard. Wrap-in-pool stopped adding a lane | `49b13eb1`, `f51a2c7d` | T4400–T4415 |
| L5 | **Green numbers by kind, and nothing left selected.** Badges sit below an activity, above an event, and in the header for a pool or lane; a voice rename or move never leaves the item selected. Paul's rule, to apply to every future rename or move | `ab40d0ed` | T4408–T4410 |
| L6 | **Group nudge and move, label selected, label by number, swap gateway points** — including every ordered pair of top/bottom/middle/left/right, and later every *selected* gateway at once | `f51a2c7d`, `8c370014` | T4411–T4418 |
| L7 | **A command split by a pause is held.** A lone verb, a dangling connective or a half rename waits for the rest instead of being guessed at by the AI; a comma straight after the verb is ignored | `8c370014` | T4416–T4418 |
| L8 | **Surround the selection with an expanded subprocess, and dissolve one back.** Room is made in the lane only, the flow in and out re-attach to the subprocess, a Start and End go inside; the inverse restores every position, and the two round-trip without undo | `9eb28faf` | T4419–T4422 |
| L10 | **"One" was heard as "lane" on every numbered pick.** A bias we created: `lane` carried the strongest keyword boost, so on the shortest utterance a user makes it beat the number. Numbers are now boosted to match, and the pick corrects a known substitution on the leading token only | `94e02a47` | T4447–T4450 |
| L9 | **Knowing what you can say and what it costs.** A movable Commands card whose every example is tested to parse, a cost-so-far button, and a SuperAdmin tile. Plus the "Suggestion" chip rename with a real target | `b00e3c7b`, `2117e392` | T4394–T4399 |

**What this changes about the backlog.** L1–L9 are evidence that the next most
valuable items are the ones that show up in use, not the ones that read worst in
the source. R2, R3 and R6 (ask which, don't guess; say what you couldn't find)
are the remaining entries of that kind, which is why they lead the order below.
B5's greedy regexes are the other: every one of its symptoms is something a user
hits mid-sentence.

#### Order of attack
- **Session 1 — bugs** (all in `DiagramEditor.tsx` + `useDiagram.ts`): B2 → B3 → B1 → B4 → B6 → B7 → B8 → R7. Do D3's `apply.ts` extraction first if tests for B1/B3 are wanted, otherwise after. End with the D2 entry. — **done** `a49a8006`, except B4 (half), B6, B7 (half), B8, R7.
- **Session 2 — safety + cost + voice**: R1 → R3 → R2 (share the badge flow) → B5 → C5 + R4 → V1 → V2 → D1 → D4. — **R1 and D4 done** `a49a8006`; the rest stands.
- **Session 3**: C9 (the gate for any wider rollout), V3 (phrase book, once V0's tally says ASR errors are worth it), then C2/C3 depending on decision 1.
- **Unplanned, and it kept winning:** the L family above. Worth budgeting a live session per round rather than treating it as interruption.

---

### Part 6 — Three decisions only Paul can make

1. **Rollout — who gets Voice Assist, and when?** (a) stay SuperAdmin-only as a demo/power tool; (b) gate via registry key + plan entitlement (C9) after sessions 1–2; (c) open to all BPMN editors now behind `allowVoiceAi`. *Recommendation: (b).* Defects 1–3 and the missing confirmation make (c) unsafe today; (a) wastes a differentiator.
2. **Undo semantics — what does "undo that" mean?** (a) atomic per utterance (B3), Ctrl+Z matches; (b) keep granular history and add per-entry undo buttons; (c) both. *Recommendation: (a)* — it is what the docblock and the user's mental model already assume.
3. **AI fallback spend — which model, how much diagram?** (a) keep Opus 5 with full serialisation; (b) dedicated cheap command model + system-prompt caching + geometry-stripped payload (C5, R4); (c) no AI by default — grammar + admin phrase overlay (C6), AI opt-in per org. *Recommendation: (b)* — 6.5 shows even a non-edit burns a full Opus call, and the job is canonicalising one sentence that the grammar re-validates anyway.

---

### Verification (for whichever sessions follow)
- Every bug fix lands with a test that fails with the defect planted: B1 (batch add+connect resolves the new element), B2 (a voice move creates exactly one history entry and `groupDraggingRef` is false after), B3 (one utterance = one Ctrl+Z), B5 (the three greedy phrasings parse to the right op or null).
- `npx vitest run tests/diagram/assist-*.test.ts` after each change; full suite before push (redirected to a file, exit code read from vitest).
- Re-run Blocks 5 and 6 of the script live after Session 1; Blocks 4, 5.7 and 8.1 after Session 2.
