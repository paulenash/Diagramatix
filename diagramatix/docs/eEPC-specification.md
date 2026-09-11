# Event-driven Process Chain (eEPC) — Specification

What Diagramatix implements, where each rule is enforced, and what it deliberately
does not do.

> **The tables in this document are GENERATED from the code** — the symbol set, the
> colours and sizes, and the BPMN mapping all come from `app/lib/diagram/epcSpecTables.ts`,
> which reads the live definitions. Run `npm run spec:epc` after changing a symbol
> or a mapping. `tests/epc/spec-doc.test.ts` fails if this file is stale, so it
> cannot quietly disagree with the product.
>
> The prose between the tables is written by hand and is the part worth reading.

---

## 1. Why the notation is here

An EPC is ARIS's signature notation, and a prospect with an ARIS repository has
hundreds of them and no way to bring them anywhere. *"We also have EPC"* is not a
reason to switch tools; *"import your models and convert them to BPMN"* is.

So the notation is the vehicle and **Convert to BPMN is the product**. Everything
below is shaped by that: the rules matter because a converter that guesses is
worse than one that refuses, and the import matters because a migration that
quietly discards half a customer's model is not a migration.

---

## 2. What an EPC is

An EPC alternates **passive** and **active**:

- an **event** is a state that has come about — *"Invoice received"*, *"Credit
  approved"*. It is passive; it does nothing.
- a **function** is work being done — *"Verify invoice"*. It is active, and it is
  the only element that carries assignments.

They take turns: event → function → event → function. Everything else in the
notation hangs off a function.

---

## 3. The symbol set

Ten symbols carry the notation.

<!-- GENERATED:core-symbols -->
| Symbol | `SymbolType` | Shape | Size | Colour | Meaning |
|---|---|---|---|---|---|
| **Event** | `epc-event` | Elongated hexagon — flat top and bottom, points left and right | 160×50 | `#ffd6e7` | A passive state that has come about — "Invoice received". An EPC starts and ends with one (hexagon) |
| **Function** | `epc-function` | Rounded rectangle | 160×70 | `#c5e17a` | An active step — "Verify invoice". Carries the organisation and data assignments (rounded rectangle) |
| **XOR** | `epc-xor` | Circle containing × | 44×44 | `#ffffff` | Exclusive: exactly one branch is taken. Only a function may precede it — an event cannot decide |
| **AND** | `epc-and` | Circle containing ∧ | 44×44 | `#ffffff` | Parallel: every branch is taken. May follow an event, because it is not a choice |
| **OR** | `epc-or` | Circle containing ∨ | 44×44 | `#ffffff` | Inclusive: one or more branches are taken. Only a function may precede it |
| **Organisational Unit** | `epc-org-unit` | Rectangle with a half-ellipse left edge and a vertical divider | 150×50 | `#ffe699` | Who is responsible — "Accounts Payable". Becomes a BPMN lane on conversion |
| **Position** | `epc-position` | The same outline, with a person glyph in the cap | 150×50 | `#ffe699` | A role rather than a department — "Credit Officer". Also becomes a lane |
| **Information Object** | `epc-data` | Rectangle with a vertical bar down the left edge | 150×50 | `#cce5ff` | Data a function reads or writes — "Invoice". Direction of the arc says which |
| **Application System** | `epc-application` | Rectangle with vertical bars at both sides | 150×50 | `#e5ccff` | The system the work happens in — "SAP". Converts to a black-box system pool |
| **Process Interface** | `epc-interface` | Chevron — pointed right, notched left | 160×50 | `#e5e5e5` | A link to another EPC, standing at the start or end of a chain (chevron) |
<!-- /GENERATED:core-symbols -->

### 3.1 Descriptive Objects

Ten more symbols describe a function rather than carrying the flow. They live in
their own palette section, **collapsed by default** — a real EPC uses two or
three of them, and showing all ten beside the core ten would bury the symbols
that carry the process.

They exist for the **migration** case. A real repository is full of them, and an
import that dropped them would be discarding half of what somebody modelled.

<!-- GENERATED:descriptive-symbols -->
| Symbol | `SymbolType` | Shape | Size | Colour | Meaning |
|---|---|---|---|---|---|
| **KPI** | `epc-kpi` | Rounded rectangle with a corner glyph | 150×50 | `#dbeafe` | A measure the function is judged by — "Order cycle time" |
| **Risk** | `epc-risk` | Rounded rectangle with a corner glyph | 150×50 | `#fecaca` | Something that can go wrong in this step — "Credit assessed on stale data" |
| **Product / Service** | `epc-product` | Rounded rectangle with a corner glyph | 150×50 | `#d9f2e6` | What the function delivers — "Approved credit limit" |
| **Knowledge Category** | `epc-knowledge` | Rounded rectangle with a corner glyph | 150×50 | `#ede9fe` | What a person must know to do the work — "Credit policy" |
| **Business Rule** | `epc-business-rule` | Rounded rectangle with a corner glyph | 150×50 | `#fef3c7` | A policy the function must obey — "Orders over $10k need two approvals" |
| **Screen** | `epc-screen` | Rounded rectangle with a corner glyph | 150×50 | `#e0f2fe` | The screen the work is done on — an application system's front end |
| **Objective** | `epc-objective` | Rounded rectangle with a corner glyph | 150×50 | `#fae8ff` | The business goal this step serves — "Reduce days sales outstanding" |
| **Machine / Resource** | `epc-machine` | Rounded rectangle with a corner glyph | 150×50 | `#e5e7eb` | Physical equipment the function uses — a press, a vehicle, a scanner |
| **Location** | `epc-location` | Rounded rectangle with a corner glyph | 150×50 | `#dcfce7` | Where the work happens — a site, a plant, a region |
| **Requirement** | `epc-requirement` | Rounded rectangle with a corner glyph | 150×50 | `#ffe4e6` | Something the function must satisfy — regulatory, contractual or internal |
<!-- /GENERATED:descriptive-symbols -->

### 3.2 What is deliberately absent

Nothing in the notation stands for a **swimlane**, and nothing stands for a
**data store**. Responsibility is an explicit relationship (§4.3) rather than a
band on the page, which is the single reason an EPC import produces better BPMN
lanes than a BPMN import does; and a system of record **is** the black-box IT
system pool, per the house convention, never a data store.

---

## 4. The three arc kinds

Only one of them carries sequence. This is the part most implementations get
wrong, and getting it right is where the value of a correct converter comes
from.

### 4.1 Control flow — `epc-control-flow`

Rectilinear, **open** arrowhead. The only arc that means *"and then"*. It
connects events, functions, the three connectors and process interfaces to each
other, and nothing else.

### 4.2 Information flow — `epc-information-flow`

Direct, horizontal, **open** arrowhead. Between a Descriptive Object or an
information carrier and a **function**. Direction is the semantics:

| Drawn | Means |
|---|---|
| data → function | the function **reads** it |
| function → data | the function **writes** it |
| both | reads and updates |

### 4.3 Organisation assignment — `epc-org-assignment`

Direct, horizontal, **no arrowhead** — assignment is not a direction. Between an
Organisational Unit or Position and a **function**.

> **Why control and information flow share an arrowhead.** They are told apart by
> ROUTING, not by the head: control flow is rectilinear and runs down the spine,
> an information arc is direct and runs horizontally out of it. That is how an
> EPC distinguishes them on paper, and it is why the Properties panel offers no
> arrowhead choice on an EPC arc (§6).

---

## 5. The rules — E1 to E7

Each rule is enforced in **two places**, because there are two ways an EPC comes
into being.

- **Drawing** — `canConnect` vetoes it, so the editor will not let you make the
  mistake.
- **Generating or importing** — an AI plan never passes through `canConnect`;
  `layoutEpcDiagram` builds the arcs itself. So every rule is unenforced on that
  path unless the layout checks it too. The layout **reports and does not
  repair**: inserting the missing event between two functions would produce a
  valid-looking chain containing a state nobody described, which is worse than a
  chain that says which two steps are wrong.

| # | Rule | Drawing | Generating | Diagnostic |
|---|---|---|---|---|
| **E1** | **Strict alternation.** Two functions may never be directly connected, nor two events. | Veto | Reported | `epc-alternation` |
| **E2** | An EPC **begins and ends with an event**. A Process Interface may stand in for one at either end. | — | Reported | `epc-not-event-bounded` |
| **E3** | **An event may not decide.** An XOR or OR split must be preceded by a *function*. An AND split after an event is fine — it is not a choice. | Veto | Reported | `epc-event-decides` |
| **E4** | A connector is **either a split or a join**, never both. | Veto | Reported | `epc-connector-both-ways` |
| **E5** | A split **should** be matched by a join of the same type. Real EPCs violate this constantly. | — | Reported | `epc-unbalanced-connector` |
| **E6** | Assignments and Descriptive Objects **never sit on the control flow**. They attach to functions only. | Veto | Reported | `epc-assignment-not-on-function` |
| **E7** | A function has **at most one** responsible organisational unit. | — | Reported | `epc-multiple-org` |

### 5.1 E3 is the one that matters

*An event cannot decide.* It is the rule most implementations miss, and the
reason is that it looks arbitrary until you see what it protects: an event is a
state that has come about, so a chain that puts an XOR after one has **nothing
in it that says what the gateway tests**. The condition is simply absent from
the model. That is why the converter refuses such a gateway rather than
inventing a question for it (§7.4).

### 5.2 Two rules are gone rather than enforced

The AI plan format carries assignments as **attributes on a function** — `org` is
a single string; `data`, `system` and each Descriptive Object are lists on the
function itself. So on the generated path:

- **E6 cannot be violated**: there is nowhere in the plan to hang an assignment
  off an event.
- **E7 cannot be violated**: `org` holds one value.

They are checks that cannot fail, because the shape of the data removed the
possibility. A hand-built or imported plan can still carry satellites as real
elements, and *that* path is checked.

### 5.3 One rule needed no code at all

`canConnect`'s control-flow test is a **whitelist** — it names the six types that
may carry sequence rather than listing what is banned. When the ten Descriptive
Objects were added, E6 refused them on the flow the moment they existed, with no
new line written. An earlier explicit satellite veto was deleted after planting
an offender proved it could never fail: the whitelist below it had already
refused.

---

## 6. Layout

**Vertical, top to bottom.** An EPC drawn left-to-right reads as wrong to anyone
who has used ARIS.

**Three columns per branch.** A function carries assignments on *both* sides —
information carriers left, organisational units and Descriptive Objects right.
Lay branches out on their own widths and branch A's right-hand org unit lands on
top of branch B's left-hand data object, because neither branch knows about the
other's boxes. So every element in the spine is given the same band:

```
[  left gutter  ][  spine  ][  right gutter  ]
```

sized from the widest assignment anywhere in the diagram. Uniform bands line the
columns up down the page as well as across it. The cost is horizontal space when
only one function carries an assignment; a wide diagram is readable and an
overlapping one is not.

**Names wrap, then the shape grows.** A name wraps inside its own shape and, up
to **two lines**, nothing moves. Past that the box grows **downward only** —
widening it would move the assignment gutters, so one long function name would
shove every branch's satellites out of column. A **Process Interface** holds
**one** line, because the bottom of its box belongs to its drill-down marker.

**Back edges do not rank.** A rework loop is the most common thing an EPC draws,
and a loop-back looks like forward progress to a longest-path ranker. Back edges
are excluded from ranking only — they remain real arcs and still count for every
rule check; they just do not decide which row something sits in.

**What deflects an arc.** The spine is solid: control flow may not run through an
event or a function. The three connectors are excluded because they sit *on* the
flow, as intermediate events do; assignments are excluded for the same reason
Data Objects are — an arc may pass one without detouring.

---

## 7. Convert to BPMN

One table, two consumers: it drives both the code translator and the AI
image→BPMN prompt, so a translation rule cannot exist in one and not the other.

<!-- GENERATED:conversion -->
| EPC | BPMN | How | Notes |
|---|---|---|---|
| Function | `task` | Becomes a task — the only EPC element that is unambiguously work. | — |
| Event | `start-event` | Resolved by POSITION: start, end, a label on a flow, or dropped. See the two rules below. | — |
| XOR | `gateway` (exclusive) | Becomes a gateway of the matching type. | — |
| AND | `gateway` (parallel) | Becomes a gateway of the matching type. | — |
| OR | `gateway` (inclusive) | Becomes a gateway of the matching type. | — |
| Organisational Unit | `lane` | Becomes a lane, derived from the assignment relationship rather than from geometry. | — |
| Position | `lane` | Becomes a lane, derived from the assignment relationship rather than from geometry. | — |
| Information Object | `data-object` | Spliced out of the sequence and re-attached by association. | — |
| Application System | `pool` | Becomes a black-box IT system pool — never a data store. | — |
| Process Interface | `subprocess` (call) | Becomes a call activity: the chain continues in another EPC. | process interface mapped to a call activity |
| KPI | `text-annotation` | Spliced out of the sequence and re-attached by association. | Label prefixed `KPI: ` KPI kept as a text annotation — BPMN has no equivalent object *Approximate.* |
| Risk | `text-annotation` | Spliced out of the sequence and re-attached by association. | Label prefixed `Risk: ` Risk kept as a text annotation — BPMN has no equivalent object *Approximate.* |
| Product / Service | `text-annotation` | Spliced out of the sequence and re-attached by association. | Label prefixed `Product: ` Product kept as a text annotation — BPMN has no equivalent object *Approximate.* |
| Knowledge Category | `text-annotation` | Spliced out of the sequence and re-attached by association. | Label prefixed `Knowledge: ` Knowledge kept as a text annotation — BPMN has no equivalent object *Approximate.* |
| Business Rule | `text-annotation` | Spliced out of the sequence and re-attached by association. | Label prefixed `Rule: ` Rule kept as a text annotation — BPMN has no equivalent object *Approximate.* |
| Screen | `text-annotation` | Spliced out of the sequence and re-attached by association. | Label prefixed `Screen: ` Screen kept as a text annotation — BPMN has no equivalent object *Approximate.* |
| Objective | `text-annotation` | Spliced out of the sequence and re-attached by association. | Label prefixed `Objective: ` Objective kept as a text annotation — BPMN has no equivalent object *Approximate.* |
| Machine / Resource | `text-annotation` | Spliced out of the sequence and re-attached by association. | Label prefixed `Resource: ` Resource kept as a text annotation — BPMN has no equivalent object *Approximate.* |
| Location | `text-annotation` | Spliced out of the sequence and re-attached by association. | Label prefixed `Location: ` Location kept as a text annotation — BPMN has no equivalent object *Approximate.* |
| Requirement | `text-annotation` | Spliced out of the sequence and re-attached by association. | Label prefixed `Requirement: ` Requirement kept as a text annotation — BPMN has no equivalent object *Approximate.* |
<!-- /GENERATED:conversion -->

### 7.1 Most events disappear, and that is the point

An EPC alternates event → function → event, so a faithful import puts a round
shape between every two tasks. That is unreadable, and it is not what the process
means: the events in the middle are **states**, not things that happen to the
process from outside.

First event becomes a start event, last an end event, and the rest are dropped —
each one **named in the report**, so nothing vanishes without saying so.

### 7.2 Events after a decision are branch conditions

*"Credit approved"* and *"Credit refused"* become the **labels on the gateway's
outgoing sequence flows**. This single rule is the difference between a converted
EPC you would publish and one you would delete.

### 7.3 Lanes are derived, not guessed

EPC records who does the work as an **explicit relationship**, so the lane comes
from the model rather than from inferring which horizontal band a box happens to
sit in. A department drawn beside four functions is **one lane**, not four —
identity is the name, not the box. The same holds for an application system: one
black-box pool per system.

### 7.4 What it refuses

Four things, each a question only a person can answer and each with a tempting
wrong answer:

| Refusal | Why it will not guess |
|---|---|
| An **unbalanced split** | Closing it is a decision about the process, not about the drawing. |
| A connector that **both splits and joins** | Which happens first is not recorded, so there is no correct pair of gateways. |
| An **event that decides** | The gateway's condition is nowhere in the model (§5.1). |
| A function owned by **two departments** | Only one can be the lane. It uses the first and says so. |

They are shown before you commit, under **Needs a person**, and the Create button
stays disabled until they are acknowledged. A migration tool that quietly tidies
an unbalanced branch hands you a model that looks finished and is wrong somewhere
you will not look.

### 7.5 The optional AI pass

Two jobs, and **structure is locked by construction** — the merge starts from the
deterministic plan and overlays only whitelisted fields matched by id, so nothing
can be added, removed, re-typed or re-parented whatever the model returns.

1. **Task names.** EPC functions are conventionally **nouns** (*"Invoice
   verification"*); BPMN tasks are **verbs** (*"Verify invoice"*).
2. **Gateway decisions.** An EPC connector is an unlabelled circle, so a converted
   gateway arrives nameless with its branches carrying the outcome wording. BPMN
   says it the other way round: the gateway asks *"Credit approved?"* and the
   flows answer *"Yes"* / *"No"*. **The mapping must not move** — putting the
   answer on the wrong branch inverts the process while leaving a diagram that
   looks correct, so the pass is told to leave a gateway alone when it is not
   certain, and the merge matches each flow by `(sourceId, targetId)`.

Joins and parallel gateways are left unlabelled: a join has nothing to ask, and a
parallel gateway takes every branch.

**Not in scope:** judging whether a dropped intermediate event was really a timer
or a message and reinstating it. Reinstating an element is a structural change —
the one thing the safety story forbids. Those events are named in the report
instead, where a person can put them back deliberately.

### 7.6 One-way

BPMN → EPC is **not** in scope and is not implied anywhere in the UI copy.

---

## 8. ARIS AML import

`app/lib/diagram/aris/importAml.ts` reads an AML export into a neutral
`EpcModel`, which becomes the **same plan shape** the AI path produces — so an
imported model gets the identical layout, satellite placement and rule
diagnostics. An importer with its own layout would be a second thing to keep
right.

> **The importer was written against a hand-built sample**
> (`public/ARIS Order to Cash eEPC.aml`), because AML's schema is large and
> version-dependent. It is therefore built to be wrong about the details without
> being wrong about the process:
>
> - it keys off **object type codes** (`TypeNum`), the stable part of AML, not
>   off nesting or document order;
> - it classifies a connection by **the types at its two ends** first and the
>   `CxnDef.Type` code second. An org unit joined to a function is an assignment
>   whatever the export calls the connection;
> - attribute lookup is case-insensitive and tolerates `.ID` / `.Id` / `.id`;
> - anything unrecognised is **reported**, never dropped in silence.
>
> When a real ARIS export arrives, diff it against the sample. **Where they
> differ, the real file is right.**

Non-EPC models in the same export — organisational charts, data models — are
named and skipped rather than mangled into a process.

---

## 9. Where each thing lives

| Concern | File |
|---|---|
| Types, `SCHEMA_VERSION` | `app/lib/diagram/types.ts` |
| Symbol definitions, palette, Descriptive Objects | `app/lib/diagram/symbols/definitions.ts` |
| Colours | `app/lib/diagram/colors.ts` |
| Shapes | `app/components/canvas/SymbolRenderer.tsx` |
| Palette previews + the collapsed section | `app/components/canvas/Palette.tsx` |
| Rules E1/E3/E6 as vetoes | `app/lib/diagram/canConnect.ts` |
| Rules E1–E7 as diagnostics, and the layout | `app/lib/diagram/layoutEpc.ts` |
| Name wrapping and growth | `app/lib/diagram/textMetrics.ts` (`epcFitSize`) |
| The editable rule set (green/red) | `scripts/seed-diagram-rules.cjs`, category `epc` → **/dashboard/rules** |
| AI generation | `app/lib/ai/planEpc.ts`, `/api/ai/epc/{plan,apply-layout}` |
| BPMN mapping | `app/lib/diagram/translate/epcBpmnMap.ts` |
| The conversion | `app/lib/diagram/translate/epcToBpmn.ts` |
| The AI tidy pass | `app/lib/ai/refineEpcBpmn.ts`, `/api/ai/epc-to-bpmn/refine` |
| AML import | `app/lib/diagram/aris/importAml.ts`, `/api/import/aml` |
| Export shape | `public/diagramatix-export.xsd`, `schema/SCHEMA_CHANGELOG.md` |
| Tests | `tests/epc/` |
