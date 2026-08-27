# Diagramatix — Version History

Running, human-readable log of **every** release — feature-only *and* schema-bearing. This is
the single place a feature-only release is recorded (the schema-scoped histories in
[`schema/SCHEMA_CHANGELOG.md`](schema/SCHEMA_CHANGELOG.md), the XSD, and `types.ts` only move on
a `schemaVersion` bump). Newest first.

- **Version shown** = `PRODUCT_VERSION` (two-tier `major.minor`) + `.` + git commit count (the build
  number) — e.g. `2.2.2185`. The build IS the third part (2026-08-13); there is no patch. The stamped
  `appVersion` in exports is the bare two-tier `PRODUCT_VERSION`.
- Maintained per [`schema/UPDATE_EVERYTHING.md`](schema/UPDATE_EVERYTHING.md) Step 5, on every
  release.
- Earlier history (pre-`1.44` feature window, v1.0 → v1.43) lives in
  [`schema/SCHEMA_CHANGELOG.md`](schema/SCHEMA_CHANGELOG.md).

---

## 2.3.2333 — 2026-08-27 — Generated-diagram tidy-ups, and sort order becomes a property of the project

Four pieces of feedback from reviewing the regenerated V03 diagrams.

**The "AI Generated" annotation is gone.** It was stamped above the start event of
every generated diagram, naming the prompt, because that was once the only way to
see where a diagram came from. It is not any more — a generated diagram stores its
prompt on `data.aiGeneration` and the editor shows it on demand — so the
annotation was duplicating that in ink, permanently, on every diagram. Diagrams
generated before this keep theirs: nothing rewrites stored data.

**Every edge-mounted intermediate event is now interrupting**, enforced in the
layout rather than asked for in the prompt. The subtlety worth recording is the
exception: the non-interrupting START event that R6.11 places INSIDE an Event
Expanded Subprocess is not edge-mounted, and its non-interrupting flavour is what
says its tasks run in parallel with the outer ones. A blanket rule would have
silently changed the meaning of every event subprocess, so `T2897` pins that case
alongside `T2896`.

**Diagram sort order moved onto the project.** It lived in a per-browser
`localStorage` key, which meant a generated project could not be handed over
already sorted and the choice did not survive a change of machine. It is now
`Project.diagramSort` — a property of the project, which is what it always was in
intent. A project saved before the field existed migrates that browser's value in
on first open.

**A value-chain run now finishes the job.** When the batch generator completes it
sets the new project's diagram order to *type* and runs the link scan, linking
diagrams whose names match. Only DEFINITE matches are applied — the scan also
returns fuzzy candidates, and those are reported for review rather than adopted,
because an automatic run has nobody watching it and a wrong link is worse than a
missing one.

Worth noting for anyone expecting an extension here: **the link scan already spans
Value Chain, Process Context, ArchiMate and BPMN** — `LINKABLE_DIAGRAM_TYPES` has
covered all four for some time. What was missing was only the automatic
invocation, not the coverage.

*Not in this release:* activity boxes still do not size to their text, especially
inside an Expanded Subprocess. That needs `wrapText` extracted from the canvas so
the layout and the renderer measure identically, and it moves layout expectations
across many existing tests — it deserves its own change rather than riding along
with these.

---

## 2.2.2332 — 2026-08-27 — The BPMN master template asked for a shape the code strips

**The defect.** The template shipped saying *"say explicitly where a branch
rejoins **or loops back to**"*. `R3.14` forbids exactly that — *"do not use a
gateway for the loop condition or a sequence connector going back to the first
activity"* — and loop-back pruning is code-enforced, so the connector is removed
from the diagram anyway. The repository document duly carries
`then back to "Capture order details"` in its V01.01 prompt. **That repetition
was asked for and silently discarded, across 104 BPMN prompts.**

Repetition is now written the way the diagram layer accepts it: an Expanded
Subprocess named with the loop condition, carrying a standard-loop marker, with a
timer boundary event where there is a deadline.

**Four more changes went in with it**, each measured on a real generation before
being adopted rather than argued for:

- **Every diverging gateway gets a named merge**, written as its own line rather
  than implied by "continue to" (`R3.03`).
- **Waiting is an intermediate catch event on the flow**, with the trigger the
  narrative implies — not a task called "Wait for …" (`R4.04`).
- **Cross-references at both ends**: the start event names where work arrives
  from, as the end event already named where it goes.
- **A seventh section, Data objects.** There was none, so `R4.06`/`R4.07` had
  nothing to act on and a repository diagram could never carry a data object.

**Measured, from the built-in alone.** Generating V01.01 and V01.03 with no stored
additions: no loop-back in either, a standard-loop subprocess in both, named
merges, wait events, and section 7 with 3 and 6 data objects. V01.03 also carries
a start-event cross-reference, which V01.01 correctly does not — it is the first
subprocess of its chain, so its start names the external trigger instead. Both
still parse back through `parseValueChainMd`.

Two candidate improvements were deliberately **not** adopted — a size/lane target
and guidance on task markers. Neither was ever measured, and they are the first
real work for the comparison workbench: something to earn or drop rather than a
settled question to re-litigate.

Existing prompts in the repository document are unchanged; regenerating them is a
content run, not this release.

---

## 2.2.2331 — 2026-08-26 — The Process Repository v2 plan joins the repo

`new features/Process Repository v2 — Plan.md` is now tracked. It sat outside the
repo because `/new features/*` is gitignored with a single allow-listed
exception; there are now two, so the file stays tracked without needing `-f`
again.

Its status block said "plan only — nothing built", which stopped being true when
Part 2 shipped this morning. Replaced with a per-part table that says what is in
the repo and what is not, plus a note recording what Part 2 actually built and the
two places it departed from the plan (no legacy-signature detection, because the
categories are new; and the built-in registry as its own module, because the
hardcoding being removed lived in two places rather than one).

---

## 2.2.2330 — 2026-08-26 — The Process Repository prompts become editable

**The problem this closes.** The Process Repository document holds **140 diagram
prompts** — 104 BPMN plus 9 each of Value Chain, Context, Process Context and
ArchiMate — and every one was hand-authored in conversation. There was no script
and no master prompt behind them: the structure is consistent because one author
held it in their head. The app only ever CONSUMED them. So nobody could change
how prompts are written, and nobody could audit why they are written that way.

**Five master templates, extracted from the prompts that work.** Not invented —
each codifies the shape the existing blocks already follow, including the
canonical BPMN six-section order (Pools & Lanes → Pool properties → Layout → Lane
contents in flow order → Edge-mounted events → Connectors), which is deliberate:
pools before anything can be placed in them, properties before layout because
black-box pools have no contents to lay out, and connectors last because every
connector names elements the earlier sections introduced.

Each template is a **read-only built-in in code plus editable additions stored as
a `DiagramRules` row** — the Staff Narrative pattern. The two halves have
different lifetimes: the built-in is a house standard that should improve for
everyone on a deploy, the additions are one organisation's conventions that must
survive every deploy untouched. Editable in the Rules editor under five new
"Repository Prompt — …" categories.

That editor arrangement was hardcoded to `category === "staff-narrative"` in two
places — the API that decorates a row and the render site that picks a component
— so a sixth built-in category meant editing both and finding out at runtime if
you missed one. Both now ask a registry.

**A generator, at `/dashboard/admin/md-prompts`.** Upload the `.md`, pick a chain
and the diagram types, and the finished blocks come back ready to paste. It is
the other end of "Create Project Diagrams from .md": that tool consumes the
blocks, this one writes them, so the loop closes — template → generator → `.md` →
`parseValueChainMd` → batch tool → diagrams.

**Two details that decide whether it actually works.**

The model never sees the existing prompts. `chainNarrative` strips them, which
matters more than it sounds: leave them in and the model copies the nearest one
almost verbatim, so a template change appears to do nothing while the generator
launders its input and looks successful. On the real document a chain section is
41–57 KB of which only 6–7 KB is narrative — 85% of what would otherwise be sent
is prompts.

And **every generated block is parsed straight back with `parseValueChainMd`**,
the batch runner's own reader, before it is shown. The results table has a
"Parses" column for exactly this. A prompt that reads beautifully but the batch
tool cannot find is worse than no prompt, because the failure would otherwise
surface only when someone asked for 140 diagrams.

**Verified end to end against the live model**, not just in unit tests: generating
V01.03 with the built-in alone names an IT pool `"ERP / Credit System"`; adding
one house rule about naming systems product-then-vendor renames it
`"ERP / Credit System (SAP)"`. The editable half demonstrably reaches the output.
All generated blocks parsed back.

---

## 2.2.2329 — 2026-08-26 — Mastermind, played as information rather than guesswork

A new SuperAdmin tile. The code setter configures **6–10 colours** and a **3–6 peg**
hidden code (repeats allowed) and then either holds the code, hands it to the
tile, or answers from outside while you type the pegs in. The breaker plays it —
and sees, at every turn, the two things nobody can work out in their head.

**What this guess is worth.** Every guess sorts the codes still standing into
buckets, one per peg answer it could draw; the setter's answer says which bucket
the code is in. Shannon's entropy over those bucket sizes is the expected number
of **bits** that answer will hand over. The panel shows the number, the split it
comes from as a bar per answer, the expected and worst-case field left, and
whether the guess could simply win outright. Beside it, the sharpest questions
available, ranked.

**What is left.** Not a list — there may be 300,000 — but a picture: how many
codes survive, how many bits that still is, and a position × colour grid showing
where the survivors agree. A column collapsed to one colour is a peg already
settled even though no black peg ever said so.

Each played row then compares the bits the guess **promised** against the bits the
answer **delivered**. They differ every turn, because entropy is an average over
answers you did not get, and watching them differ is the clearest way to see what
the number means.

**Two results the engine reproduces rather than asserts**, both on the classic
6 × 4 game and both checked in `T2889`: Knuth's minimax opening is two pairs, with
a worst answer leaving 256 codes; the maximum-**entropy** opening is four
different colours, at 3.0567 bits. They are *different guesses*, and getting both
— including their disagreement — is stronger evidence than any self-consistency
check. Playing the highest-entropy consistent guess every turn breaks all 1,296
codes in **4.4653 turns on average, worst case 6** (`T2890`).

**The opening is exact even at a million codes.** Before any answer is known the
candidate set survives both renaming the colours and reordering the positions, so
only a guess's *shape* matters — 5 genuinely different openings on 6 × 4 and 11 on
10 × 6, rather than the whole space. The one turn where sampling would be worst is
the one turn it is not needed. `T2887` pins the claim. Later turns say plainly
when a ranking is estimated, and from how large a sample.

Also: the Nimb tile description was corrected — it still advertised the old 1–4
move cap and a 2–4 board.

---

## 2.2.2328 — 2026-08-26 — Clearing stale example flags without Node

`scripts/clear-stale-example-flags.sql` — the SQL twin of the existing TypeScript
repair, for reaching prod with `psql` when the Node route is not available (the
prod `DATABASE_URL` is a Key Vault reference, so the script's usual invocation
needs a secret read).

It touches exactly the fingerprint of a wrong flag — `exampleType` set with
`sourceExampleId` NULL — and leaves genuine adoptions alone. It prints both lists
before writing anything, wraps the update in a transaction with `RETURNING` so the
output records what actually changed, and ends with an after-check. Rehearsed
against a real database with the `COMMIT` swapped for `ROLLBACK`.

---

## 2.2.2327 — 2026-08-26 — Nimb: a catalogue of the shapes worth handing over

**Shape enquiry.** Pick a number of squares and see every distinct form that many
empty squares can take on the current board, coloured by what happens to the
player who faces it **alone**: green they win, red they lose. Rotations,
reflections and translations are collapsed, so one drawing stands for every way a
form can sit.

The red ones come first, because they are the point: a shape that loses for
whoever faces it is a shape you want to **hand over**. They are also the rare
ones — on a 5 × 5 at 16 squares, 2,244 forms out of 48,353 — and at 3, 5 and 7
squares there are none at all.

**Every connected form counts, and that turned out to be provable rather than
searched for.** A single square is always a legal move, so a player can fill the
board one square at a time; every subset of the board is therefore reachable, and
every connected region of empty squares is a shape the game can actually produce.
The previous implementation established this by searching all reachable positions
breadth-first — work that could only ever return everything.

Two measurements shape the rest. Verdicts are read off the solved table (fill in
every square except the shape, ask who wins) rather than run through the shape
solver, which is what makes 48,353 forms possible at all; `T2884` checks the two
against each other on **every one of the 1,280 forms that fit a 4 × 4**. And the
cap is on DRAWING, never on counting: the totals are exact, and the panel says how
many it left undrawn.

Worst case on 5 × 5 is ~580 ms, at 16 squares — under 100 ms up to 10 squares, and
nothing at all on a repeat.

---

## 2.2.2326 — 2026-08-26 — Nimb solves 5×5, and a move may take a whole line

**The move cap now scales with the board.** "1–4 ✕" was the rule as first written;
it is now **1..n** — up to a whole line — which is the same rule on every board
up to 4 × 4 (a run was always bounded by the board too) and a genuinely different
game at 5 × 5, where a full row of five becomes legal. The series was recomputed
under the new rule rather than carried over: 2 × 2 loses (0 of 2 openings win),
3 × 3 wins (3 of 7), 4 × 4 loses (0 of 11), **5 × 5 wins (3 of 24)**.

**5 × 5 is now solved, exactly.** The recursive solver dies there — 33.5 million
positions in a `Map`. A retrograde sweep over a flat `Uint8Array` builds the same
answers in 33.6 MB and ~3.5 s, because a move only ever SETS bits: `pos | mask` is
always greater than `pos`, so one descending loop visits every successor before
its position. Guarded by comparing it against the recursive solver on **every**
position of 1 × 1 through 4 × 4.

Three seconds cannot sit in a click handler, so the sweep is **resumable** and the
page runs it in slices sized to fit a frame, with a live progress bar. A Web
Worker was built first and abandoned on evidence: Turbopack does not compile
`new Worker(new URL("./x.ts", import.meta.url))` — it copies the TypeScript file
into `static/media` verbatim, so the browser would have fetched raw TS as a
script. A `blob:` worker would have worked but needs `blob:` in `script-src`.
Slicing costs neither.

**The 5 × 5 answer is worth stating:** of 24 genuinely different openings only
three win, and all three are **centred on the middle line** — the centre square,
the middle three of it, and the whole of it. Advice can now name a centre line on
a full odd square, so that reads as "take the centre square" instead of "see the
shaded squares".

Also in this release, from the preceding commits:

- **`2.2.2320`–`2.2.2323` — the Nimb tile itself.** A SuperAdmin explorer for the
  misère placement game: every genuinely different move (rotations and
  reflections collapsed) split into winning and losing columns, the opponent's
  replies to a selected move, any move playable directly on the board including
  a deliberately losing one, the position decomposed into independent shapes, and
  shape-level advice stated only where it is true of every move it covers.
- **`2.2.2324` — example flags stopped reappearing.** The Azure deploy ran
  `backfill-example-types.ts` on every push, which re-flagged projects whose
  example flag had been deliberately cleared. Two prod projects had it come back
  twice. The backfill was a one-off migration and no longer runs on deploy.
- **`2.2.2325`** — a scratch file removed from the previous commit.

---

## 2.2.2319 — 2026-08-24 — Replay actually replays; error triggers stop at 5pm

**"Launch replay" showed a clock ticking and nothing happening.** Two causes, both
about the window rather than the engine:
- The cold-start replay horizon is four hours from t=0 — and **t=0 is Monday
  00:00** — so a team working 09:00–17:00 had a replay window containing no
  working hours at all. Measured on P01: horizon 240 gave 0 service events, 480
  gave 0, 1440 gave 397. The window is now stretched past the first open moment
  plus a shift; a 24/7 model keeps the short window.
- **"Replay uses your last scenario run" was only true within one session.** The
  config lived in React state set by the Run button, so a returning session had
  none and fell back to that dead default. It was on disk the whole time
  (`SimulationRun.configSnapshot`); a new `last-run` endpoint hands it back.

**Edge-mounted triggers that are not timers now stop when the team does.** An
error, escalation, conditional, signal or message boundary event represents
something arising DURING the work, and none of them can happen while nobody is
working — an error firing at 2am cancelled a case no one had touched. Those
accrue only through the host team's open hours. A TIMER is a deadline and keeps
the label rule: unqualified means elapsed, because a customer's "2 days"
includes the nights. Say "2 working days" to gate it.

Tests T2875–T2876. Full suite green.

## 2.2.2316 — 2026-08-24 — Simulation semantics: waits, working timers, and renaming things

**Waiting on someone else is neither work nor free.**
- A **Receive task** and a **Message catch event** now fill as *exponential*, not
  triangular. An external reply is memoryless and long-tailed; triangular claims it
  always arrives inside a narrow band, which deletes the tail that makes timeouts,
  chasing and escalation paths worth drawing.
- **WaitTime is now actually simulated.** It was declared as a non-seizing delay,
  editable in the panel and round-tripped through BPSim — and the engine never read
  it, so every wait entered there silently changed no result. It now delays the case
  without holding the resource: on a 10-minute task with a 30-minute wait, flow time
  15.0 → 45.0 and utilisation unchanged.

**A boundary timer means what its label says.**
- The label sets the value, and the `working`/`business` qualifier sets the clock.
  Unqualified stays ELAPSED. Boundary timers previously ignored the label entirely
  and took a flat exponential default, so a timer drawn as "7 working days" ran as a
  random hour.
- **BREAKING (semantics): "N working days" now counts DAYS, not N × 8 hours.** Per
  Paul: seven working days is seven 24-hour periods with the closed days stepped
  over, so a 3pm deadline still falls due at 3pm and the shift length is irrelevant.
  Sub-day working periods are unchanged — "5 working hours" still consumes open time,
  so from Friday 3pm on a 9–5 week it lands Monday noon.
- **Existing diagrams carry the old values** (no migration needed — per Paul, every
  simulation to date is a test). A saved working-day timer holds MINUTES under the
  old rule (e.g. `4800` for "10 working days"); under the new rule that value reads
  as 4,800 days. Fill never overwrites an existing value, so these do not
  self-correct — re-enter any working-day timer you want to keep.
- `timerDelayMinutes()` returns null for a working-DAY label: a day count has no
  minute magnitude, the same as "until".

**An imported bundle is not an example.**
- `/api/simulation/import` shared its code with catalog adoption, which hardcoded
  `exampleType`. Your own imported bundle was flagged as an example you could not
  find in the Examples list, and was refused for sharing and publishing — each
  refusal advising a rename the UI did not offer. The flag now follows
  `sourceExampleId`, which is what separates adoption from import.
- **Rename a project** — ✎ in Project Properties (owner-only), the missing escape
  hatch those three refusals pointed at.
- **Rename a scenario** — ✎ in the scenario row; previously duplicate-and-delete,
  which cost the original's run history.

**Documentation discipline.**
- New [`PUSH_EVERYTHING.md`](PUSH_EVERYTHING.md) — the release checklist — and
  `scripts/check-push-everything.ts`, which verifies it and exits non-zero if
  anything is behind. `skip` (could not check) is reported distinctly from `OK`.
- `TESTS_SUMMARY.md`: **107 missing rows backfilled** and three contradictory suite
  totals corrected (820 vs 436 tests; T0676 vs T0650 vs "next is T0377"). A guard
  now fails if any `Tnnnn` lacks a row or the stated highest ref is wrong.
- Tech Design Notes sections written on 2026-08-23 were filed under the wrong
  `collection` and rendered as empty chapters; repaired on prod.

Schema: no bump — no XSD export-shape change. Product version: unchanged at **2.2**
(no physical DB change). Tests T2865–T2874. Full suite 2,069 passing.

## 2.2.2310 — 2026-08-23 — Simulator repair + XSD enum catch-up (schema 46)

**Simulation — the model the user can see is the model that runs.**
- **Fill reaches the whole drill-down tree.** A run splices linked sub-processes in, so their
  tasks are real work in the result; filling only the open diagram left every level below it
  empty and the assembler quietly substituted its own defaults. Each level now takes its own lane
  as its resource, and values the user set are never overwritten.
- **A start event that is *entered* rather than *triggered* reads `fixed 0`** — a linked child's
  top-level start, and any start inside an expanded sub-process at any level including the root.
  Event-sub-process starts keep their trigger semantics.
- **Resources are seeded from the process tree, not the whole project.** Opening one process was
  provisioning the teams of every unrelated process beside it. Also fixes the race that made
  harvesting a coin toss (seeding ran before any diagram had loaded, then marked itself done).
- **Drill-down keeps an ancestor stack**, so back climbs one level and names where it is going.
- **Trace Table:** a blank cell now means only *never visited*; a zero-time visit shows `0`, set
  back visually so it does not out-shout the times that carry magnitude.
- **Runaway guard.** An unstable model — work arriving faster than the resources can finish it —
  grew live tokens until it exhausted the server, taking the whole app down rather than one tab.
  A run now stops at 50,000 live cases **and says so above every figure in the report**: stopping
  alone would present a part-run as a finished answer.

**Schema: 45 → 46 (SHAPE CHANGE — enum catch-up + drift repair).**
- `SymbolTypeEnum` + `history-state` / `deep-history-state` and the 21 `flowchart-*` shapes;
  `ConnectorTypeEnum` + `flowline` / `flowchart-association`; `DiagramTypeEnum` + `flowchart`.
- These were being **exported without being declared**. The XSD enumerations are closed and
  `@type` is required, so every Standard Flowchart export (since June) and every history-state
  State Machine (since August) was *invalid* against the published schema. No migration is needed
  — the files were always this shape; only the declaration was missing.
- Also formally records `Connector/@branchPercent`, added to the XSD on 2026-08-14 with the
  gateway branch-share work and deliberately deferred to this batch.
- A drift guard (`tests/xml/xsd-enum-drift.test.ts`) now compares the TypeScript unions against
  the schema directly, so a new value cannot ship undeclared again.

Product version: unchanged at **2.2** — no physical DB change this release.

## 2.2.2185 — 2026-08-13 — Version scheme: build count becomes the third part
- **Version numbering tweak (Paul):** kept the two-tier `major.minor` line (`2.2`) and made the
  **git commit count the third part** of the displayed version — the header badge now reads
  `v2.2.<build>` (e.g. `v2.2.2185`) instead of `v2.2.0 (build 2185)`. The unused hand-maintained
  patch is gone; the build advances automatically on every push. `PRODUCT_VERSION` is now `"2.2"`;
  exports still stamp the bare two-tier line as `appVersion`. Docs (`UPDATE_EVERYTHING.md` Step 0) and
  the `T2258` shape test updated. Schema integer unchanged (45); no DB change.
- Also shipped this window: Screencast Studio mic/camera hardening — raw-mic capture, reliable webm
  audio muxing, sensitive + clipping-aware level meter, recording-volume (gain) slider, webcam
  exposure/image controls with a flicker-free live preview, and a 4-second test-and-replay. Deploy
  pipeline hardened against slow builds (post-build Azure re-login).

## 2.2.0 (build 2165) — 2026-08-10 — Mobile viewer: subprocess/gateway/event/connector fidelity
- **Expanded subprocesses** are now drawn as **containers** (behind their contents) with the name at the **top**,
  so their child elements **and the connectors inside them** render on top instead of being hidden behind the fill
  (fixes #1 name-in-middle and #2 missing inner connectors).
- **Gateway & event markers** now render — gateway type (exclusive ✕ / parallel + / inclusive ○ / event-based /
  complex ✳) and event type (message envelope, timer, signal, error, terminate, else a trigger dot) (#3).
- **Message flows** fixed (#4): dropped the invisible-leader segment that drew a spurious line to the pool centre
  (same trim the desktop router uses), and rendered in the proper BPMN style — **dashed, dark grey, hollow circle
  at the source, open arrowhead at the target**. Associations render dashed with no arrowhead.
- **Sequence flows** get a clear filled **arrowhead** at the target (#5). Schema: no change.

## 2.2.0 — 2026-08-10 — Feature Availability by Subscription Level (3-state, editable, per-user + per-org)
- New **Feature Availability** system from *Feature by Subscription Level v1.4.xlsx* — a **33-feature × 5-level**
  (Free / Introductory / Professional / **Enterprise** new) matrix with **three states** per cell: **Available**,
  **Disabled** (shown, not selectable — selectable in the editor, not seeded yet), **Not Available** (hidden).
  SuperAdmin edits the grid at **/dashboard/admin/feature-availability**; seeded from the xlsx (1→hidden, 80→
  available) via `scripts/seed-feature-availability.ts`.
- **Unified** — this matrix is now the single source of truth: the old 4 boolean entitlements
  (`getEntitlements`) derive from it, and `gateFeature` blocks anything not `available`. Resolution
  (`app/lib/features/availability.ts`): SuperAdmin → all available; else effective level's matrix overlaid with
  **per-user overrides** (SuperUser sets them from the Registered-Users "Features" button).
- **Enterprise Organizations** (Paul): a SuperAdmin can assign a whole **Org** to a subscription level — every
  member, including anyone in the org's claimed email domains (e.g. getai.com.au), resolves to at least that
  level. Managed on the same admin screen; new `Org.subscriptionLevelId`.
- Client gate helpers `useFeatureStates()` + `<FeatureGate>` + `/api/features`; SuperAdmin view-mode gains an
  **Enterprise** preview. **Schema: DB change → product version 2.1.1 → 2.2.0** (XSD schema integer 45 unchanged).
  Tests T2264-T2266. **Prod post-deploy:** run `seed-subscriptions.ts` (adds Enterprise) then
  `seed-feature-availability.ts`.
- *Phase 2 (follow-ups):* wire the remaining ~28 features' menus/routes to `FeatureGate`/`gateFeature`; make the
  view-mode preview fully data-driven; retire the now-legacy `has*` checkboxes in the Subscriptions editor.

## 2.1.1 (build 2162) — 2026-08-10 — Mobile viewer: wrapped labels, annotation icons, message arrows
- **Wrapped text (#1):** element labels now **wrap to the shape width** (reusing the desktop `wrapText`) and
  pool/lane/sublane names wrap into rotated columns — long names/labels are readable instead of overflowing.
- **Annotations (#2):** text annotations (which rendered as dark, unreadable boxes) now show as a tappable
  **📝 amber icon** tethered to their element — tap to read the full text in a sheet, like review comments.
- **Message flows (#3):** connectors without a stored route now **land on the element boundary** (so a
  message flow meets the pool edge, not its centre) with a direction **arrowhead** at the target.
- **List names:** Project-list and Diagram-list names (and the project header) now **wrap** so the full name
  is visible instead of being truncated.
- Schema: no change.

## 2.1.1 (build 2161) — 2026-08-10 — Mobile viewer fidelity: real colours, labels, rotate, pan-anywhere
- **Real colours (#1):** the mobile viewer now renders the diagram's ACTUAL colours (per-element
  `properties.fillColor`, else the project `colorConfig`, else the type default — same resolution as the
  desktop) instead of the generic preview palette. `renderTemplateThumbnailSvg` gained a `{ trueColors,
  colorConfig, fullLabels }` option; the template-menu / mining thumbnails keep the compact look.
- **Labels (#3):** pool / lane / sublane **names** (rotated in the header strip), **connector & message
  labels** (at the line midpoint with a white halo), and full task labels now render — tiny when zoomed out,
  readable when you zoom in.
- **Rotate (#4):** the viewer re-fits on a portrait↔landscape flip (aspect-change detection in a
  ResizeObserver) without disturbing your manual zoom on incidental URL-bar resizes.
- **Pan anywhere (#5):** the diagram backdrop is now `pointer-events:none`, so a pan/pinch that starts ON a
  shape scrolls too (previously only empty canvas panned). Schema: no change.

## 2.1.1 (build 2159) — 2026-08-10 — Mobile fix: diagram now displays (height chain + fit)
- **Fix:** the `/m` diagram viewer showed the ＋Comment/Save controls but a blank/off-centre canvas. The
  shell root was `min-h-[100dvh]` (a *min* height), which broke the `h-full` percentage chain so the viewer
  container collapsed to zero height → `fit()` bailed and parked the transform on an empty corner. Switched
  to a definite `h-[100dvh]` app-shell, and replaced run-once `fit()` with a **ResizeObserver** that centres
  the diagram as soon as the container has a real size (re-fits on rotation; preserves manual zoom).

## 2.1.1 (build 2158) — 2026-08-10 — Mobile fixes: route diagrams to /m + hide desktop overlays
- **Fix:** opening a diagram on a phone showed the **desktop editor** (Matrix/Camera/Video toolbar + a
  mouse-oriented canvas that didn't display well) because the phone auto-redirect only fired on exactly
  `/dashboard`. Now phones are also redirected `/diagram/[id]` → `/m/diagram/[id]` and
  `/dashboard/projects/[id]` → `/m/project/[id]` (still honouring the "Desktop version" opt-out).
- **Fix:** the global floating tools (**Matrix screensaver toggle, screenshot, screencast** — rendered in the
  root layout) leaked onto the `/m` mobile screens. They're now hidden on the `/m` route tree
  (`GlobalOverlays`).
- Hardened `MobileDiagramView`: the review overlay is a separate transformed layer, so the diagram backdrop
  renders exactly as the read-only viewer did (guards against a blank canvas). Schema: no change.

## 2.1.1 (build 2157) — 2026-08-10 — Mobile: view a diagram + add/save Review Comments
- The `/m` mobile diagram screen goes from read-only to **reviewable**: pan/zoom stays, and owners/editors/
  **assigned reviewers** can now **tap ＋ Comment → tap an element → type or dictate a Review Comment**, then
  **Save**. Review comments are **always collapsed on mobile save** (38×32 icons) so they open tidily on desktop.
- **Dictation** reuses the shared `startDictation` primitive (Deepgram streaming, auto-falling back to the
  phone's native speech-to-text) via a 🎤 mic in the comment sheet; added an iOS `AudioContext.resume()`.
- Existing review comments show as tappable pink pins tethered to their element (read sheet on tap); honours
  the `showReviewComments` toggle. Save uses the optimistic-concurrency `PUT` (409 → reload prompt); the
  diagram itself stays view-only. Pure viewers get no ＋/Save.
- Engine: `MobileReviewLayer` + `MobileCommentSheet`; `MobileDiagramView` gains an aligned overlay + tap-pick
  (shared `thumbnailTransform`); pure `reviewCollapse.ts` + `reviewComment.ts` (desktop-identical note/tether
  shape); GET `/api/diagrams/[id]` returns `canReview` + viewer. Tests T2261-T2263.
- **Schema: no change** (only `review-comment` elements/links in existing diagram JSON — Q1 no, Q2 no →
  feature-only; product version stays 2.1.1).

## 2.1.1 — 2026-08-10 — Version model split (product version 2.1.1 + XSD schema v45) + Visio/preview
- **Two independent version numbers now** (per Paul). `PRODUCT_VERSION` (`major.middle.patch`, restarted
  at **`2.1.1`**) is the Diagramatix product version — its **middle increments on any physical DB
  table/column change**, patch on fixes, major manually. The header badge shows `v2.1.1 (build <commit
  count>)`. `SCHEMA_VERSION` is now a standalone **integer `45`** (the old `1.45` minor) = the XSD schema
  version, bumping **only** on an XSD export-shape change (the original criterion). Exports stamp
  `schemaVersion="45"` + `appVersion="2.1.1"`; legacy `1.NN` files still import via
  `structuralSchemaVersion()` / `checkSchemaCompatibility()`. Rule rewritten in
  [`schema/UPDATE_EVERYTHING.md`](schema/UPDATE_EVERYTHING.md) Step 0 (Q1 DB→product middle; Q2 XSD→schema
  integer).
- **XSD (schema v45)** export leaf now shows the version; **Preview pop-ups** for XSD *and* DDL get
  **Cancel / Export** buttons (Export primary) — the colour, scrollable modal already existed.
- **Visio Stencil fix:** the shipped `public/BPMN Diagramatix Shapes v1.6.vssx` displayed **v1.4** in Visio
  because its internal `docProps` (title/description/Template) were never renamed past v1.4. Patched those
  to **v1.6** (no GUID churn) and hardened `scripts/build-v16-from-v15.cjs` so future regenerations remap
  v1.4 too. The stencil is a static repo file served directly — not DB, not runtime-generated.
- Tests T2258-T2260 (version split + legacy-tolerant compat). **Schema integer: unchanged (still 45)** —
  pure renumbering, no XSD shape change.

## 1.45.2153 — 2026-08-10 — Schema-version policy widened + catch-up bump
- **Policy (Paul):** `schemaVersion` now bumps on ANY change to the **entire physical database**
  (any table/column/enum/relation anywhere — operational/auth/billing/telemetry/mining/connection
  tables included, not just the curated diagram Logical DDL) **and** on ANY **in-DB JSON structure**
  change (a new persisted diagram/project attribute — including an `element.properties.*` key — or a
  change to an attribute's allowed values). Previously the rule was export-shape-only + curated-DDL-only,
  so operational tables and open `properties` keys rode without a bump — which is why the number sat at
  1.44 for so long. Rule rewritten in [`schema/UPDATE_EVERYTHING.md`](schema/UPDATE_EVERYTHING.md) Step 0
  and [`schema/SCHEMA_CHANGELOG.md`](schema/SCHEMA_CHANGELOG.md).
- **Catch-up bump 1.44 → 1.45** accounting for structure added since 1.44 without one: new tables
  (`MicrosoftConnection`, `ProcessDiffRun`, `IntentKeywordMap`), new columns
  (`ProcessMiningRun.analytics`/`kpiConfig`, `DiagramTemplate.description`/`thumbnailSvg`), and new
  diagram `properties` attributes (`sharepointLink`, `fillColor`, review-comment fields).
- **No export-XSD shape change** — the diagram `.xml`/`.json` interchange is unchanged; the bump is
  driven by DB tables/columns + open-`properties` attributes. `types.ts` SCHEMA_VERSION + the four
  schema-sync files updated together. Going forward, each such change bumps on its own release.

## 1.44.2153 — 2026-08-09 — SharePoint for web users (bring-your-own, multi-tenant)
- **New:** any signed-in web user can now **Connect SharePoint** with their own Microsoft 365 — regardless of
  how they logged in (email/password or Microsoft) and regardless of org. Previously SharePoint was welded to
  *logging in* with Microsoft in the single nashcc tenant, so most web users got 403 everywhere.
- A **standalone delegated-OAuth "connect" flow** (`app/api/microsoft/{connect,callback,disconnect,status}`),
  separate from login, targeting the multi-tenant `organizations` authority (PKCE + CSRF state cookie). Because
  it runs after the user is already signed in, it also **sidesteps the parked multi-tenant *login* home-realm
  bug** — login stays single-tenant and unchanged.
- Tokens are persisted per-user in a new **`MicrosoftConnection`** table, **AES-256-GCM encrypted at rest**
  (`app/lib/crypto/tokenCrypto.ts`, new env `MS_TOKEN_ENC_KEY`); a DB-backed accessor
  (`getMsAccessTokenForUser`) refreshes transparently and the three `/api/sharepoint/*` routes now read from it.
  Tokens never reach the client (status endpoint returns booleans + UPN only).
- `hasMicrosoft` now means "has a connection" (DB), fed to the existing prop unchanged; Microsoft-login users are
  **auto-connected** (seamless migration). Connect/disconnect lives in **Account Settings**; the picker's empty
  state now starts the connect flow.
- Tests T2252-T2257 (crypto round-trip/tamper, PKCE/authorize/id_token/returnTo). **Schema: no bump** (operational
  token store, outside export XSD + ddlGenerate — same precedent as `ProcessMiningRun.analytics`).
- **Azure follow-up (Paul):** set the existing app registration to **Multitenant**, add redirect URI
  `<origin>/api/microsoft/callback` (local + prod), set `MS_TOKEN_ENC_KEY` (local + prod). See `.env.example`.

## 1.44.2152 — 2026-08-09 — Screencast: fix audio/video sync drift
- **Fix (Paul):** recorded audio drifted slightly out of sync with the video. Two independent clocks were
  to blame — audio runs on the real-time audio clock, but the video was generated by a `requestAnimationFrame`
  draw loop feeding `canvas.captureStream`, whose frame clock jitters/drops under load, so audio slowly
  pulled ahead.
- **Direct-track capture when the webcam PiP is off:** the recorder now records the `getDisplayMedia` screen
  track **directly** (hardware/OS-clocked → tight, drift-free A/V) instead of routing through the canvas.
  Canvas compositing is kept only when the inset webcam is actually on (camOn is fixed at record start).
- **Transcode hardened for variable frame rate:** `ffmpegWebmToMp4Args`/`ffmpegToWebmArgs` now pass
  `-fps_mode passthrough` (preserve MediaRecorder's real VFR timestamps instead of forcing a constant rate
  that shifts alignment) + `-af aresample=async=1:first_pts=0` (lock audio to the video timeline). Tests
  T2251. Schema: no bump.
- **Fix (Paul):** states weren't matching in the **Conformance Check** when a label carried an internal
  **newline** (a long multi-word state like *"Level 1 In Progress"* wrapped across lines in the reference).
  The comparison only `.trim()`-med — stripping leading/trailing whitespace but leaving an embedded newline
  intact — so *"Level 1 In\nProgress"* ≠ *"Level 1 In Progress"* and every case read as an illegal transition.
- Now every label comparison in the conformance path **collapses internal whitespace** (`\s+`→single space)
  before matching: `checkTransitionConformance`, `flagIllegalTransitions` (the red-badge pass),
  `stateMachineCoverage`, and `referenceScope`. **Activities** are the transition labels (conformance itself
  matches by state) — those, plus states, are now also **cleaned at ingestion** (`parseEventLog`) so a value
  never stores an embedded newline in the first place. Test T2250. Schema: no bump.

## 1.44.2150 — 2026-08-09 — Mining: generated State Machine must cover the whole log
- **Rule (Paul):** any *generated* reference State Machine must show **every state and activity that is in
  the event log** — else conformance replays the log against a partial model and reports a flood of false
  **illegal transitions**. Enforced in **code** (not just the prompt) on both generation paths via a new pure
  `reconcileStateMachineCoverage`: after discovery it adds back any observed state, entry, transition or
  terminal the generator left out (matched case-insensitively by state label, transition labelled with its
  triggering activity).
- The **AI-curated** path previously told the model to *merge near-duplicate states* and *omit anomalies as
  noise* — the exact cause. That instruction is replaced with a **completeness-mandatory / keep-exact-labels**
  brief, and the code pass guarantees it regardless of what the model returns.
- The deterministic `discoverStateMachine` was already complete → the pass is an idempotent no-op there, but
  both paths now flow through the single enforced coverage guarantee. Tests T2247-T2249 (incl. a 100%-fitness
  conformance guard). Schema: no bump.

## 1.44.2149 — 2026-08-09 — Mining: view / filter the imported event log
- New **🔍 View / filter log** button in the import staging area (shown once a CSV/XES log is loaded) →
  a full-screen table of exactly what's being imported: **free-text search** across all columns plus a
  **per-column dropdown filter** on low-cardinality columns (activity / resource / state / …). Render-
  capped at 2,000 rows (narrow the filters to see more); Esc or Close to return. Lets you verify the
  parse before committing the run.
- New `app/components/mining/MiningLogViewer.tsx` (pure, `data-no-capture`). Schema: no bump.

## 1.44.2148 — 2026-08-09 — Mining Insights: per-activity summary + fixes
- New **📋 Activities** tab (now the default) — **one row per activity type** with its cases, events,
  median / total time, and the **team(s) + state(s)** it carries (normally one each; multiples flagged
  amber). Plus an all-**states** and all-**teams** chip summary so every distinct state/team is visible.
  Analytics now capture per-activity resources + states.
- **Fix:** the enrichment "✨ Filled N of M…" message no longer lingers — it clears on each new
  file/scenario load and only shows while a fill table is actually open (so a log that already has the
  resource/state columns won't show it).
- Runs imported before this show a "re-import to populate teams/states" hint (analytics predates it).
- Schema: no bump.

## 1.44.2147 — 2026-08-09 — Mining: enrich a sparse log from the project's models
- On import, when the log has **no resource** and/or **no state** column, the console now offers to
  fill them from the project's own models: **teams from a Process Diagram** (activity → task → lane)
  and **states from a State Machine** (activity → transition → target state), matched by label
  (exact, then fuzzy). Result is an **editable table** you confirm before import — never silent.
  So a minimal (case/activity/timestamp) log can climb to full fidelity without editing the log.
- Engine: `app/lib/mining/enrich.ts` (pure), `LogMapping.activityResource` (mirrors the existing
  `activityState` fallback in `buildEventLog`), a project-diagrams list route. Tests T2243-T2246.
- Schema: no bump (the maps ride in the import mapping JSON).

## 1.44.2146 — 2026-08-09 — Mining Insights: mined time + team caption under each task
- The Insights model now shows the mined **"simulation data" under each task** — its median
  time-in-step + dominant team — as a caption (toggle **🏷 time · team**, on by default), matched to
  each activity from the log. Visible immediately after Discover (no need to calibrate first), and
  carried into the expanded/zoom view. Schema: no bump.

## 1.44.2145 — 2026-08-09 — Mining: calibratable AI process, in-context variant/case highlight, fixes
- **Variants / Cases** now highlight the selected path **in context** — the whole discovered model
  is shown with everything off the path **faded**, and the path's count badges stand out (no more
  isolating/fragmenting). The variant-path resolver walks **through gateways** so the highlight stays
  connected; the highlight now carries into the **expanded** view and is driven by the selected case
  *or* the variant filter (fixes Cases selection not reaching the expanded view).
- **AI-discovered process is now calibratable:** the AI keeps the log's exact activity names, and the
  mined directly-follows frequencies are re-attached to its edges — so cycle times, teams AND gateway
  branch probabilities calibrate onto the AI model too. Tests T2241-T2242.
- **Readiness warning** now identifies an unrouted gateway by its neighbours (`Decision after "X"
  (→ A / B)`) instead of a cryptic id.
- **Fix:** the deterministic (non-AI) discovered process is no longer stamped with an "AI Generated"
  annotation.
- Schema: no bump.

## 1.44.2144 — 2026-08-09 — Fix: gateway branch probabilities calibrate from badged edges
- The digital-twin calibrator read the gateway split from the edge `label`, but the edge-count
  badge fix (1.44.2143 below) moves that number into `transitionCount` and clears the label — so a
  freshly discovered process would calibrate with **no branch probabilities**. `calibrateSimulation`
  now reads the mined count from `transitionCount` (falling back to `label`). Test T2240.

## 1.44.2143 — 2026-08-09 — Fix: spurious auto-connect on click in generated diagrams
- **Root cause:** the auto-fuse feature (drop an element onto a connector to splice it in, creating
  an in + out connector) ran on **every** `MOVE_END` with no move-distance check. Generated / AI
  layouts place tasks and gateways exactly on the centre-line of skip/branch (gateway) edges, so a
  plain **click** (a zero-move drop) spliced the element into the through-connector and spawned
  spurious connectors to/from it — usually to the nearby gateway.
- **Fix:** the splice now only fires when the element was actually **dragged** a meaningful distance
  (`MOVE_END` carries the pre-drag position; a click is ignored). Also enlarged the transition-count
  badges so multi-digit numbers fit inside the circle. Tests T2238-T2239.

## 1.44.2140 — 2026-08-08 — DiagramatixMINER Insights — feedback pass 1
- **Expand to full-screen** on the Insights / Variants / Cases tabs — the discovered process gets
  maximum space with the tables underneath, **click-to-zoom** on the diagram (Esc resets to fit) and
  a **Return** button. Path isolation carries over into the big view.
- Discovered **BPMN edge frequencies** now render as the same green **count badge** the discovered
  state machine uses (not a plain number floating by the line).
- **Explain results** no longer spins with nothing to show — on an AI failure it falls back to the
  deterministic summary so a result always returns.
- Schema: no bump. Tests T2237.

## 1.44.2137 — 2026-08-08 — DiagramatixMINER Insights (Process Mining v2)
- New **Insights** workbench in the mining run console — closes the biggest gaps vs Apromore:
  - **🔥 Heat** — colour the discovered model by Total time (bottleneck) / Frequency / Avg time,
    with a legend + top-steps table.
  - **🔀 Variants** — frequency Pareto, click-to-isolate a variant's path, multi-select overlay,
    two-variant activity compare.
  - **🎞 Cases** — per-case list (sortable by cycle time, filter by variant) + drill-down, plus a
    self-contained log-**replay** animating real cases over the model (no simulator engine touched).
  - **🎯 Outcomes** — set a case **SLA** → on-time vs late split + the activities/variants that
    **drive lateness** (lift).
  - **⬇ Export** — the whole analysis as Word / Excel / PDF.
- Foundations: pure `computeAnalytics` (per-activity/edge metrics + capped per-case index) persisted
  to new nullable `ProcessMiningRun.analytics`; `kpiConfig` (case SLA) persisted per run. Computed at
  import + live refresh. `SymbolRenderer` now honours `properties.fillColor` on task/state/gateway/
  event shapes (enables the non-destructive heat overlay).
- Mining **examples** carry `analytics` + a demo SLA so the features land on adoption (regenerated
  `miningExampleData.json`).
- **Schema: no bump** — the two new `ProcessMiningRun` columns are operational mining tables, outside
  the export XSD and the curated Logical DDL (`ddlGenerate.ts`), so the tracked data structure is
  unchanged. Tests T2226-T2236.
- **Prod follow-up:** re-run `scripts/seed-mining-examples.ts` so the adoptable examples carry the
  new analytics + SLA.

## 1.44.2129 — 2026-08-08 — True-to-layout Word preview (LibreOffice)
- SOP and Diff-Processes **Preview** now renders the real `.docx` → PDF via headless LibreOffice
  (`soffice`), reproducing styled headings, org Word-template branding, page breaks, and the
  landscape figure page — replacing the mammoth content-only approximation.
- New `app/lib/documents/docxToPdf.ts` (per-call temp profile, concurrency-safe, 60s timeout);
  SOP route gains `?format=pdf`, the Diff route gains `mode:"pdf"` (live + saved runs).
- Robust fallback: if conversion fails (e.g. local dev without LibreOffice) Preview
  automatically falls back to the mammoth content preview, so it never breaks. Download stays
  `.docx`.
- Docker: runner image adds `libreoffice` + `ttf-liberation` + `font-noto`, `HOME=/tmp`.
- Schema: no bump (infra + route param only).

## 1.44.2128 — 2026-08-08 — Export menu: Preview / Download flyouts
- Every File ▸ Export format (PDF, SVG, JSON, XML, XSD, BPMN, Visio) now opens a small flyout with
  two explicit choices — **👁 Preview** (the in-app pop-up) and **⬇ Download** (export as usual) —
  replacing the easily-missed inline eye icon (JSON preview was there but hard to spot).
- New standalone **XSD (schema)** leaf: Preview renders the live `/api/schema` XSD; Download saves
  the `.xsd` (it also rides along with the XML download).
- Schema: no bump (menu UI only).

## 1.44.2127 — 2026-08-08 — Version-tracking process + history
- Added [`schema/UPDATE_EVERYTHING.md`](schema/UPDATE_EVERYTHING.md) — the canonical, repeatable
  "update everything" procedure (Steps 0–12: version bump decision, the four schema-sync files,
  this history, atomic commit/deploy, and the DB-backed User Guide / Features / Tech-Notes
  updates).
- Added this `VERSION_HISTORY.md`, seeded from git.
- Schema: no bump (docs-only; no persisted-data-structure change).

## 1.44.2126 — 2026-08-08 — File Preview pop-ups
- In-app preview for exports so they can be shown on camera during screencasts (no download):
  PDF, SVG, JSON, XML, BPMN, DOCX (via mammoth), and DDL, plus a cosmetic **fake-Visio** window
  (blue ribbon + BPMN Shapes stencil + diagram SVG on a Visio grid).
- Peaceful-JSON syntax highlighting for JSON/XML/BPMN/DDL on a dark code panel; `data-no-capture`
  so the preview never leaks into a screen capture.
- Wired into File ▸ Export, the Diff Processes report + saved-run screens, the SOP editor, and
  the SuperAdmin DDL generator.
- Schema: no bump (feature-only).

## 1.44.2122 — 2026-08-08 — Screencast recording resilience
- Never lose a recording: persist chunks during capture and recover after an interruption
  (e.g. navigating to the Portal mid-record).
- Schema: no bump (feature-only).

## 1.44.2121 — 2026-08-08 — Mobile phone UI
- Dedicated `/m` route tree: auth entry, Projects list + create, and a read-only pan/zoom
  diagram viewer for phones.
- Schema: no bump (feature-only).

## 1.44.2119 — 2026-08-08 — Diff Processes run history + management
- Persisted Diff Processes runs (schema + API); run history surfaced on both diagrams'
  properties; OrgAdmin + SuperAdmin management screens; "View Before/After process" buttons;
  reusable `ProcessDiffResults` with Save / auto-save.
- Schema: no bump (rode on 1.44; predates this formalized procedure).

## 1.44.2112 — 2026-08-08 — Backups & export carry simulation configuration
- Scoped user + org backups and project JSON export/import now include the full simulation
  configuration; JSON + AI bundle are full-fidelity (always include annotations).
- Schema: no bump (rode on 1.44).

## 1.44.2110 — 2026-08-08 — Diff Processes analysis depth
- Diff BPMN message flows, dedicated Data Objects section, task-marker → automation-shift
  interpretation, intermediate + boundary events, and a Review-status section
  (Comments / Pain Points / Issues / Bottlenecks); Merge folds cherry-picked differences into a
  new diagram (SuperAdmin); AI summary in the Word export.
- Schema: no bump (rode on 1.44).

## 1.44.2099 — 2026-08-07 — Diff Processes (initial)
- Diagram ▾ menu: tabular comparison of two BPMN process versions (who / systems / what) → table
  + CSV / .docx + optional AI narrative; reuses the SOP skeleton extractor.
- Schema: no bump (rode on 1.44).

## 1.44.2097 — 2026-08-07 — Visio export Error-275 fix
- Dedupe Visio master IDs (a Pool/Lane collision caused Visio Error 275 on open); review-comment
  no longer drops a spurious tether on placement; opaque rich-text editor.
- Schema: no bump (fix release).
