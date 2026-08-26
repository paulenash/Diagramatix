# Process Repository v2 — catalogue, editable prompt templates, APQC integration

**Status as at 2026-08-26** — kept current as parts land, so this file never
claims more or less than the repo actually contains.

| Part | State |
|---|---|
| **1** — catalogue + V10–V26 narratives | **not built** |
| **2** — editable prompt templates + generator | **SHIPPED** `542a7141` |
| **3a** — PCF grounding no-op | **not fixed** — still `groundRulesWithPcf(prisma, rules, undefined)` |
| **3b/3c** — `**APQC:**` codes → `DiagramData.pcf` → coverage | **not built** |
| **3d/3e** — one generator for both builders; APQC benchmarks | design conversations, not scheduled |

Part 2 is now the cheapest reason to do Part 1: the 17 new chains can have their
prompts **generated** rather than hand-authored, which is what made the first
nine expensive.
**Source document:** [`Process Repository Final.md`](./Process%20Repository%20Final.md) (9,496 lines)

---

## Why

Three things came out of reviewing the Process Repository and how it feeds the
SuperAdmin "Create Project Diagrams from .md" batch tool.

**1. The catalogue is short and unnumbered.** It opens with a 15-row table and a
grouped breakdown, then names 9 chains (V01–V09) which are the only ones
described in full. Eight areas of a typical organisation have no chain at all:
demand generation before the lead exists, customer onboarding after the sale,
reverse logistics, running maintenance (as opposed to asset lifecycle),
security/privacy response, application and claims decisioning, policy and access
governance, and analytics.

**2. Nobody controls how the diagram prompts are written.** The document holds
**140 prompt blocks** — 104 BPMN plus 9 each of Value Chain / Context / Process
Context / ArchiMate. They were **hand-authored by Claude in conversation**,
following a 6-section structure that exists only as convention. There is no
script and no master prompt. The single `> **Prompt used for the next section:**`
block at line 80 produced the *narrative*, not the diagram prompts.

The app only **consumes** them: `app/lib/valueChain/parseValueChainMd.ts` pulls
each fenced ` ```text ` block out from under a `**X diagram prompt.**` label and
`app/api/admin/md-diagrams/run/route.ts` hands the verbatim text to
`generateDiagramData`.

So the structure is consistent but unauditable and unchangeable.

**3. APQC PCF is built, and disconnected from all of it.** Details in Part 3 —
including a live bug.

---

## Part 1 — `Process Repository Final 2.md`

New file beside the original. **V01–V09 bodies copied byte-identical** — they are
reviewed content carrying the 140 working prompts.

### Catalogue changes

- **"A Common Set" table** — add the 17 new chains; gain a **Status** column:
  `Described + prompts` / `Described` / `Catalogued`.
- **"A Useful Way to Group Them"** — add a sixth group, *Risk, governance and
  security*; slot the new chains into the existing five.
- **Replace "The Most Common Big Name Process Chains"** with one numbered
  catalogue, ordered by group.

### Numbering

| Range | Content state |
|---|---|
| **V01–V09** | Unchanged — described in full, with diagram prompts |
| **V10–V26** | The 17 new chains — seven-part narrative, no prompts yet |
| **V27–V36** | Already listed but never numbered — catalogued only |

V27–V36 are: Lead to Order, Quote to Order, Forecast to Stock, Design to Launch,
Contract to Renewal, Service Request to Fulfilment, Concept to Customer,
Warehouse to Deliver, Change to Release, Budget to Forecast, Risk to Compliance.

> **Open question for tomorrow.** This leaves V27+ thinner than V10–V26 purely
> because of the order the work was requested in. If the pre-existing chains
> should be numbered *before* the new ones it is a one-pass renumber — but it
> moves numbers that may already be referenced elsewhere. Decide before writing.

### The 17 new chains (V10–V26)

Each gets the seven-part narrative matching the V01–V09 template: teams and roles
· external participants · high-level subprocesses · IT systems · policies and
procedures · information flow to/from external participants · information flow
to/from IT systems.

| Group | Chains |
|---|---|
| Customer-facing | **Market to Lead** · **Sign to Onboard** · **Renew to Retain** |
| Supply chain | **Return to Refund** · **Dock to Stock** · **Detect to Repair** |
| Risk, governance & security | **Detect to Respond** · **Audit to Action** · **Draft to Publish** · **Request to Access** · **Matter to Resolution** |
| Decisioning | **Application to Decision** · **Claim to Settlement** |
| Finance & information | **Meter to Cash** · **Transaction to Return** · **Data to Insight** · **Concept to Commissioning** |

**Deliberately excluded** as subsets of existing chains: Recruit to Onboard
(inside Hire to Retire), Invoice to Pay (Procure to Pay), Tender to Award (Source
to Contract), Demand to Supply (Forecast to Stock / Plan to Produce). Adding
subsets makes a repository harder to navigate, not richer.

**Sector-specific, if wanted later** — better as a separate appendix than mixed
into the core: Referral to Discharge (health), Enquiry to Enrolment (education),
Case to Outcome (social services), Grant to Acquittal (funded programmes),
Permit to Occupy (planning).

---

## Part 2 — SuperAdmin-editable prompt templates + an in-app generator

### The pattern to copy

Not "Create Prompt From Diagram — Technical Description": that
(`buildPromptFromDiagram`) is a deterministic hardcoded walker with nothing
editable.

**Staff Narrative**, the button beside it, is the right model. It splits its
brief into a **read-only built-in template in code** plus **editable "Additional
Rules" stored as a `DiagramRules` row** (`category="staff-narrative"`), shown
together in the rules editor. See `app/lib/ai/staffNarrative.ts` and
`StaffNarrativeEditor` in `app/(dashboard)/dashboard/rules/RulesEditor.tsx`.

### 2a. The templates — `app/lib/valueChain/promptTemplates.ts` (new)

Five built-in master templates, one per parsed diagram type:

- `DEFAULT_MD_PROMPT_BPMN` — codifies the canonical 6-section structure (Pools &
  Lanes · Pool properties · Layout · Lane contents in flow order · Edge-mounted
  events · Connectors). **Extract it from the 104 existing prompts rather than
  inventing it** — they are proven to generate well. Also recorded in the
  `reference_bpmn_prompt_structure` note.
- `DEFAULT_MD_PROMPT_VALUE_CHAIN`, `_CONTEXT`, `_PROCESS_CONTEXT`, `_ARCHIMATE`.
- An `extractAdditionalRules()` / signature split copied from `staffNarrative.ts`
  so a stored row holds only the editable additions.

New `DiagramRules` categories: `md-prompt-bpmn`, `md-prompt-value-chain`,
`md-prompt-context`, `md-prompt-process-context`, `md-prompt-archimate`.
**No schema change** — `DiagramRules.category` is a free string.

### 2b. Surface them in the rules editor

Both files hardcode the staff-narrative special case and need generalising:

- `app/api/bpmn-rules/route.ts` — `decorate()` checks
  `category === "staff-narrative"`. Replace with a `BUILTIN_BY_CATEGORY` map.
- `app/(dashboard)/dashboard/rules/RulesEditor.tsx` — the render site does the
  same. Rename `StaffNarrativeEditor` → `BuiltinPlusAdditionsEditor` and select
  it whenever the row has a non-null `builtin`. Add the five categories to the
  list.

### 2c. The generator — `/dashboard/admin/md-prompts` (new)

Modelled on the existing `/dashboard/admin/md-diagrams`
(`MdDiagramsClient.tsx` + `app/api/admin/md-diagrams/run/route.ts`), which
already streams NDJSON progress over a long multi-call AI job.

- **Input:** upload the `.md`, pick a chain (reuse `parseValueChainMd` to list
  chains and subprocess headings), pick which diagram types to generate.
- **Per diagram:** call the AI with that type's master template + the chain
  narrative + the subprocess heading.
- **Output:** assembled `**X diagram prompt.**` + fenced blocks, to paste into
  the `.md` or download as a patch for that chain's section.
- **It must round-trip:** what comes out must parse back through
  `parseValueChainMd` unchanged.
- Reuse `resolveGenerateModel` / `chooseModel` / `aiApiKey` and the
  `enterAiContext` telemetry wrapper exactly as the run route does.

### 2d. What this closes  *(shipped — see the note at the end of Part 2)*

The `.md` stops being hand-authored:

```
template  →  generator  →  .md  →  parseValueChainMd  →  batch tool  →  diagrams
   ↑
SuperAdmin edits here — one place controlling all 140+ prompts
```

---

### What Part 2 actually shipped — `542a7141`

Built as planned, with the file names above. Two findings worth carrying forward:

**The model must not see the existing prompts.** `chainSource.chainNarrative()`
strips every fenced block and its label before the narrative is sent. Left in,
the model copies the nearest prompt almost verbatim — so a template edit appears
to do nothing while the generator launders its input and *looks successful*. On
the real document a chain section is 41–57 KB of which only 6–7 KB is narrative:
85% of what would otherwise be sent is prompts.

**The round trip is a column in the UI, not a one-off check.** Every generated
block is parsed back with `parseValueChainMd` before it is shown, and the results
table reports it per prompt. `T2893` pins it.

Two departures from the plan as written:

- **No legacy-signature detection.** The five categories are new, so a stored row
  can only ever hold additions — the one part of the Staff Narrative split that
  did not need copying.
- **The built-in registry is its own module** (`app/lib/ai/builtinRuleCategories.ts`)
  rather than a map inside the API route, because the hardcoding being removed
  existed in *two* places — the route and the editor's render site — and a map in
  one of them would have left the other still naming categories itself.

Verified against the live model, not only in tests: with the built-in alone,
V01.03 names an IT pool `"ERP / Credit System"`; adding one house rule about
naming systems product-then-vendor renames it `"ERP / Credit System (SAP)"`.

---

## Part 3 — Integrating APQC PCF

PCF and the Process Repository are the two standard views of the same
organisation, and they are complementary rather than competing: **PCF is a
functional decomposition** (what processes exist — 13 categories, L1→L5),
**value chains are end-to-end flows** (how work crosses those functions).

Nearly all the machinery to join them is already built. Almost none of it is
connected to the `.md` pipeline.

### 3a. Fix first — PCF grounding is switched OFF for the batch tool

`app/lib/ai/loadAiRules.ts:31` calls
`groundRulesWithPcf(prisma, rules, undefined)` — **hardcoded `undefined`**.

The editor's routes do it properly (`generate-bpmn/route.ts:61`,
`generate-diagram/route.ts:57` both pass a real `pcfNodeId`), so a classified
diagram generated in the editor gets APQC's decomposition and terminology
injected into its prompt.

The batch runner goes through `loadAiRulesForType(type)` and therefore does not.
**All 140 diagrams in the current repository were generated with PCF grounding
disabled.** The plumbing exists and was never fed.

**Fix:** `loadAiRulesForType(diagramType, pcfNodeId?)`, threaded from the parsed
chain. Small change; it is the difference between diagrams that look APQC-ish and
diagrams grounded in the standard.

### 3b. Classify the catalogue — the join that unlocks the rest

Add an optional PCF line per chain and subprocess, which `parseValueChainMd`
reads into `ParsedDiagram.pcfHierarchyId`:

```
### V01.03 — Check Credit & Pricing
**APQC:** 9.2.2  (Invoice customer)
```

The batch runner resolves the code to a `PcfNode`, writes `DiagramData.pcf` (the
existing `PcfClassification` shape, keyed on the stable `pcfId`) and passes the
node to grounding.

### 3c. What that turns on immediately, with no new machinery

| Existing feature | What it gives the repository |
|---|---|
| `app/lib/pcf/coverage.ts` | Which PCF processes the repository actually models — per node, with category and level roll-ups. Answers "what is missing?" against the standard rather than against opinion. |
| PCF grounding (3a) | Generated diagrams use APQC's own decomposition and vocabulary |
| Stable `pcfId` keying | Classification survives an APQC release bump via `versionDiff.ts` |
| `attribution.ts` | ©APQC attribution rides exports automatically once content is tagged |

### 3d. Two builders that should meet

There are already **two** ways to build a project of diagrams, and they do not
know about each other:

- **PCF-driven** — `folderSeed.ts` seeds a folder tree from a PCF branch;
  `bulkFolders.ts` walks it deepest-first, AI-generating leaves and linking
  parents to children.
- **Narrative-driven** — the `.md` value-chain tool.

Same operation, different inputs. The honest end state is one generator taking
either: **structure from PCF, prose and prompts from the `.md`**. Worth designing
toward rather than doing now — but Part 2's generator should take a
`{ name, type, prompt, pcfHierarchyId? }` list regardless of origin, so this
stays open.

### 3e. APQC benchmarks as simulation defaults

`PcfNode.metricsAvailable` already flags nodes carrying APQC Open Standards
Benchmarking measures, and the BOD workbook joins to `pcfId` via its Metrics
sheet. Nothing consumes it.

A classified subprocess could offer **industry benchmark cycle times as the
simulation default** instead of the flat `triangular(3,5,8)` — replacing an
invented number with a sourced one. That is the strongest possible answer to
"where did this figure come from?", and it connects directly to the simulator
resource/fill work.

> **Licensing check before building.** The schema is deliberate: `PcfNode` stores
> `metricsAvailable` as a *"flag only, never OSB values"*. Whether measured
> values may be embedded is a licensing question, not a technical one. Confirm
> before designing anything that stores them.

### Suggested order

1. **3a** — small fix, immediate quality gain on every future batch run
2. **3b** — the `**APQC:**` line, parser support, classification write-back
3. **3c** — free once 3b lands; add a coverage view for the repository
4. **3d / 3e** — design conversations, not this piece of work

---

## Files

| File | Change |
|---|---|
| `new features/Process Repository Final 2.md` | new — catalogue + V10–V26 narratives |
| `app/lib/valueChain/promptTemplates.ts` | new — 5 built-ins + additions split |
| `app/lib/valueChain/parseValueChainMd.ts` | read the optional `**APQC:**` line |
| `app/lib/ai/loadAiRules.ts` | accept and pass `pcfNodeId` |
| `app/api/bpmn-rules/route.ts` | generalise `decorate()` to a builtin map |
| `app/(dashboard)/dashboard/rules/RulesEditor.tsx` | builtin-aware editor; 5 new categories |
| `app/(dashboard)/dashboard/admin/md-prompts/` | new page + client |
| `app/api/admin/md-prompts/route.ts` | new — streamed prompt generation |
| `app/api/admin/md-diagrams/run/route.ts` | resolve PCF codes; pass the node to grounding |
| `app/(dashboard)/dashboard/admin/AdminClient.tsx` | tile for the new page |

## Verification

- **Round-trip is the real test.** Generate prompts for one chain, paste into a
  `.md`, and assert `parseValueChainMd` returns the expected diagram names, types
  and non-empty prompts. That is what stops a template edit silently producing
  blocks the batch tool cannot read.
- Template resolution: no `DiagramRules` row → built-in; with a row → built-in +
  additions; a legacy full-briefing row detected by signature.
- Rules editor: the five categories appear, show the read-only built-in, save and
  reset (`action: "reset"`) correctly.
- PCF: a chain carrying `**APQC:** 9.2.2` produces a diagram whose
  `DiagramData.pcf` resolves, and `coverage.ts` counts it as modelled.
- End-to-end by hand: edit `md-prompt-bpmn` additions → regenerate one subprocess
  prompt → confirm the change appears → run the batch tool on it.
- `npx tsx scripts/check-push-everything.ts` before pushing; add `Tnnnn` rows to
  `tests/TESTS_SUMMARY.md` (T2874 fails the suite otherwise).
