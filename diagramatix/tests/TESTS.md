# Diagramatix — Test Suite

Auto-generated inventory of the automated test suite (Vitest). Regenerate with `npm run test:list`.

- **Total tests:** 197
- **Test files:** 37
- **Last generated:** 2026-06-26

> Run all: `npm test`. Run one file: `npx vitest run <path>`.

---

## Contents

- [tests/_setup/infrastructure.test.ts](#tests-setup-infrastructure-test-ts) — 4 tests
- [tests/backup/coverage.test.ts](#tests-backup-coverage-test-ts) — 4 tests
- [tests/backup/roundtrip.test.ts](#tests-backup-roundtrip-test-ts) — 1 test
- [tests/bpmn/clean-layout.test.ts](#tests-bpmn-clean-layout-test-ts) — 6 tests
- [tests/bpmn/layout-rules.test.ts](#tests-bpmn-layout-rules-test-ts) — 17 tests
- [tests/bpmn/structural-rules.test.ts](#tests-bpmn-structural-rules-test-ts) — 5 tests
- [tests/bpmn/type-coverage.test.ts](#tests-bpmn-type-coverage-test-ts) — 5 tests
- [tests/diagram-type-styles/order.test.ts](#tests-diagram-type-styles-order-test-ts) — 3 tests
- [tests/dictation/parse-vtt.test.ts](#tests-dictation-parse-vtt-test-ts) — 5 tests
- [tests/editor/obstacle-sweep.test.ts](#tests-editor-obstacle-sweep-test-ts) — 1 test
- [tests/editor/routing.test.ts](#tests-editor-routing-test-ts) — 4 tests
- [tests/flowchart/layout-decision-merge.test.ts](#tests-flowchart-layout-decision-merge-test-ts) — 3 tests
- [tests/flowchart/layout-parallel-database.test.ts](#tests-flowchart-layout-parallel-database-test-ts) — 5 tests
- [tests/flowchart/layout-swimlane-crossing.test.ts](#tests-flowchart-layout-swimlane-crossing-test-ts) — 5 tests
- [tests/simulation/assemble-hier.test.ts](#tests-simulation-assemble-hier-test-ts) — 5 tests
- [tests/simulation/autofill.test.ts](#tests-simulation-autofill-test-ts) — 5 tests
- [tests/simulation/bpsim.test.ts](#tests-simulation-bpsim-test-ts) — 9 tests
- [tests/simulation/cost.test.ts](#tests-simulation-cost-test-ts) — 4 tests
- [tests/simulation/engine.test.ts](#tests-simulation-engine-test-ts) — 4 tests
- [tests/simulation/eventsub.test.ts](#tests-simulation-eventsub-test-ts) — 3 tests
- [tests/simulation/examplePackage.test.ts](#tests-simulation-examplepackage-test-ts) — 6 tests
- [tests/simulation/exampleSeeds.test.ts](#tests-simulation-exampleseeds-test-ts) — 9 tests
- [tests/simulation/expr-pool.test.ts](#tests-simulation-expr-pool-test-ts) — 8 tests
- [tests/simulation/foundation.test.ts](#tests-simulation-foundation-test-ts) — 11 tests
- [tests/simulation/interventions.test.ts](#tests-simulation-interventions-test-ts) — 6 tests
- [tests/simulation/overrides.test.ts](#tests-simulation-overrides-test-ts) — 5 tests
- [tests/simulation/portfolio.test.ts](#tests-simulation-portfolio-test-ts) — 5 tests
- [tests/simulation/replay.test.ts](#tests-simulation-replay-test-ts) — 4 tests
- [tests/simulation/runner.test.ts](#tests-simulation-runner-test-ts) — 4 tests
- [tests/simulation/splice-links.test.ts](#tests-simulation-splice-links-test-ts) — 5 tests
- [tests/simulation/subprocess.test.ts](#tests-simulation-subprocess-test-ts) — 6 tests
- [tests/staffNarrativeBriefing.test.ts](#tests-staffnarrativebriefing-test-ts) — 4 tests
- [tests/translate/flowchart-parallel-comment.test.ts](#tests-translate-flowchart-parallel-comment-test-ts) — 4 tests
- [tests/translate/flowchartToBpmn.test.ts](#tests-translate-flowcharttobpmn-test-ts) — 9 tests
- [tests/translate/prompt-mapping.test.ts](#tests-translate-prompt-mapping-test-ts) — 4 tests
- [tests/translate/refine-merge.test.ts](#tests-translate-refine-merge-test-ts) — 4 tests
- [tests/visio/export-matrix.test.ts](#tests-visio-export-matrix-test-ts) — 5 tests

---

## tests/_setup/infrastructure.test.ts

_4 tests_

### test infrastructure

- connects to the test database (DATABASE_URL was overridden)
- can create and read back a user via the real Prisma client
- creates a user-with-Org bundle with an Owner-role membership
- truncateAll wipes every row between tests

## tests/backup/coverage.test.ts

_4 tests_

### backup coverage

- the full backup enumerates every catalog table with a working delegate
- orders all tables and defers the Diagram↔PublishedVersion cycle
- scoped backups account for every catalog table (covered or consciously omitted)
- deliberately omits the Simulator tables from scoped backups (asserted, not just commented)

## tests/backup/roundtrip.test.ts

_1 test_

### full backup round-trip

- restores every table, re-links the publish cycle, and rebuilds an entity tree

## tests/bpmn/clean-layout.test.ts

_6 tests_

### BPMN clean-layout global invariants

- linear flow — lays out with no global-invariant breaches
- decision split + merge with labels — lays out with no global-invariant breaches
- rework loop-back (R8.04) under a forward flow — lays out with no global-invariant breaches
- two pools + bidirectional messages — lays out with no global-invariant breaches
- data objects + store around a task — lays out with no global-invariant breaches
- dense — 3-way decision, merge, boundary event, rework loop — lays out with no global-invariant breaches

## tests/bpmn/layout-rules.test.ts

_17 tests_

### BPMN layout rules (code-enforced)

- registry is pinned — every rule has a unique id and an executable check
- R5.09 — gateway labels sit top-left of the diamond, never on the right
- R8.04 — right-to-left loop-back flows route via top/bottom, never the left face
- R8.11 — sequence connectors on the same element+face never share a connection point
- R3.06 — a flow to/from an Event attaches on the event's facing side
- R6.16 — a decision gateway takes its incoming flow on the LEFT face
- R3.10 — a decision gateway's branches fan out across distinct faces
- R6.19 — a merge gateway emits its outgoing flow from the RIGHT face
- R6.25 — a merge gateway is placed to the RIGHT of all its source elements
- R8.10 — a boundary intermediate event emits from its OUTER face (away from the host)
- R5.06 — two message flows on the same pool/task face don't share a connection point
- R5.08 — every generated pool is rendered at the same (uniform) width
- R6.18 — event-based gateway branches enter the target event on its LEFT face
- R6.17 — a decision gateway's top/bottom branches map to its top/bottom-most targets
- R8.02-input — an INPUT data object (data → element) is placed to the LEFT of its element
- R8.02-output — an OUTPUT data object (element → data) is placed to the RIGHT of its element
- R8.03 — a single-link Data Store is centred above/below its element, not beside it

## tests/bpmn/structural-rules.test.ts

_5 tests_

### BPMN structural rules (generative)

- registry is pinned — every rule has a unique id and an executable check
- R6.13 — a white-box pool with no start/end event gets a process-level start + end injected
- R6.23 — a label-less exclusive decision gateway defaults to a "Decision?" question
- R3.08 — a process start event is forced into the pool's topmost lane
- R6.12 — a connector pointing at a non-existent element is dropped

## tests/bpmn/type-coverage.test.ts

_5 tests_

### BPMN type coverage

- every BPMN palette + AI element type has a symbol definition (size/label)
- every BPMN palette type is the AI schema can emit (or consciously palette-only)
- every BPMN element type is handled by the renderer
- every BPMN element type has an XSD export mapping (or a conscious exclusion)
- every BPMN event-trigger type is handled by the renderer (the Cancel-bug guard)

## tests/diagram-type-styles/order.test.ts

_3 tests_

### diagram type sort order

- default order is CO, VC, PC, AM, BP, FC, SM, DM
- resolveDiagramTypeStyle returns the override sortOrder when present
- a project-style comparator orders mixed diagrams by configured order then name

## tests/dictation/parse-vtt.test.ts

_5 tests_

### parseVtt

- extracts speaker names from <v> voice tags and merges consecutive cues
- handles a leading 'Name:' convention and numeric cue indices
- parses a Zoom cloud-recording transcript (WebVTT, 'Name:' prefix + indices)
- strips stray markup and keeps unlabelled lines
- isVttFile recognises .vtt by name or mime

## tests/editor/obstacle-sweep.test.ts

_1 test_

### editor routing — obstacle-avoidance sweep

- re-route never produces a non-crossing violation, and crossings stay ≤ 10

## tests/editor/routing.test.ts

_4 tests_

### editor routing — characterisation

- baseline — fresh layouts route cleanly
- re-route — moving a task DOWN keeps its connectors clean
- re-route — moving a task UP and back keeps its connectors clean
- obstacle — moving a branch task across the diagram re-routes around obstacles

## tests/flowchart/layout-decision-merge.test.ts

_3 tests_

### flowchart layout — decision branches + merge convergence

- F4.02 — decision branches exit the left and right diamond points
- F4.05 — merge inputs attach to the top edge, fanned apart
- every connector still has a non-empty waypoints array

## tests/flowchart/layout-parallel-database.test.ts

_5 tests_

### flowchart layout — F4.06 / F4.07 Parallel bar

- F4.06 — keeps its default creation thickness
- F4.07 — flowlines attach to the long (top/bottom) faces only

### flowchart layout — F4.08 Database placement

- places the database to the side of its anchor, vertically centred
- connects the database with a horizontal flowline
- keeps the main flow vertical — the database is not in the spine

## tests/flowchart/layout-swimlane-crossing.test.ts

_5 tests_

### flowchart layout — F4.01 swimlanes

- creates one column per lane, left-to-right in first-appearance order
- parents each flow element to its lane column
- positions each element within its lane column's x-range
- columns share the same top and height (one rigid band)

### flowchart layout — F4.03 crossing minimisation

- places the re-converging node between its peers (not left-most as DFS would)

## tests/simulation/assemble-hier.test.ts

_5 tests_

### hierarchical assembler

- maps the EP to a subprocess node with a body + event sub
- scope-tags the body + makes the body start a pass-through
- skips the event-sub container + its trigger start event
- actually runs: body + the non-interrupting handler both execute

### lane → team inheritance

- a teamless task inherits its lane's team; explicit team wins

## tests/simulation/autofill.test.ts

_5 tests_

### autofillSimulation

- fills the source arrival
- fills task cycle time + assigns the lane team, keeps units
- preserves user-entered values
- splits decision branch probabilities to 100
- reports how many attributes it filled

## tests/simulation/bpsim.test.ts

_9 tests_

### BPSim import — Car Repair (property/condition-driven)

- reads the scenario run config
- reads the InterTriggerTimer as an inter-arrival (PT24M → 24 min)
- reads a TruncatedNormal property init (noOfIssues ~ N(2, 1))
- reads expression assignments + a routing Condition
- reads branch probabilities (FloatingParameter)

### BPSim import — Technical Support (time/resource-driven)

- reads ProcessingTime distributions (TruncatedNormal + Duration)
- reads resource Quantity and a Selection expression

### BPSim export → re-import round-trip

- preserves every parameter category losslessly
- emits a valid BPSimData wrapper

## tests/simulation/cost.test.ts

_4 tests_

### cost modelling

- per-team cost = busy-hours × costPerHour
- totalCost sums teams and costPerCase divides by completed
- unpriced teams cost nothing
- converts the clock unit correctly (minutes)

## tests/simulation/engine.test.ts

_4 tests_

### engine — M/M/1 analytic check

- matches utilisation, Wq and Lq for ρ=0.8

### engine — determinism + snapshot/resume

- two fresh runs with the same seed are identical
- snapshot mid-run + resume reproduces the uninterrupted result bit-identically

### engine — token properties + condition loop (Car Repair shape)

- loops a decision on a token property until it reaches zero

## tests/simulation/eventsub.test.ts

_3 tests_

### non-interrupting event subprocess

- fires a handler alongside the parent while the scope is active
- is missed if the scope has already finished when the timer fires

### interrupting event subprocess

- cancels the parent's in-flight work, releases its resource, and diverts

## tests/simulation/examplePackage.test.ts

_6 tests_

### validateExamplePackage

- accepts a well-formed package
- rejects a wrong/missing version
- flags a study root that doesn't match a diagram key
- flags duplicate diagram keys and team names
- requires at least one diagram and at most one baseline
- emptyPackage is structurally sound except for the no-diagram rule

## tests/simulation/exampleSeeds.test.ts

_9 tests_

### starter examples are operational

- there is a non-trivial starter set with unique slugs
- every diagram is EDITOR-valid (connectors fully formed, not just engine-valid)
- staffing up relieves the busiest pool (baseline vs add-staff)

### starter examples are operational › Loan origination

- has a valid package
- assembles its study portfolio with shared team pools
- every scenario runs and completes work

### starter examples are operational › Car repair — rework loop

- has a valid package
- assembles its study portfolio with shared team pools
- every scenario runs and completes work

## tests/simulation/expr-pool.test.ts

_8 tests_

### expr — BPSim conditions & property assignments

- evaluates the actual Car Repair expressions
- respects arithmetic precedence + parentheses
- handles booleans, comparisons and string concat
- is safe — no host access, errors on unknowns

### resource pool — contention

- grants up to capacity, queues the rest, FIFO on release
- computes time-weighted utilisation
- setCapacity is the live Operator lever — grants queued work
- serialises + restores identically (SimState snapshot)

## tests/simulation/foundation.test.ts

_11 tests_

### rng

- is deterministic for a given seed
- snapshot/restore reproduces the continuation exactly (Operator fork basis)
- derives independent streams per replication

### distributions

- fixed is exact; uniform + triangular stay in bounds
- sample means converge to the analytic mean

### ISO-8601 durations

- parses common BPSim example values
- round-trips seconds → ISO → seconds
- converts to/from a base unit
- rejects malformed input

### event calendar

- pops in time order, FIFO on ties
- serialises + restores preserving order (SimState snapshot)

## tests/simulation/interventions.test.ts

_6 tests_

### planned interventions

- capacity surge raises throughput on a saturated line
- a time-boxed capacity surge reverts (less throughput than a permanent one)
- arrival scaling increases the number of arrivals
- branchProb override forces routing, and reverts after its duration
- inject spawns tokens at a node
- is deterministic with interventions across replications

## tests/simulation/overrides.test.ts

_5 tests_

### applyOverrides

- treats an absent / empty override set as a no-op clone
- sparsely overrides node params, edge probability and team capacity
- never mutates the baseline
- creates a pool when a node override retargets to an unknown team
- ignores unknown ids

## tests/simulation/portfolio.test.ts

_5 tests_

### assemblePortfolio

- merges per-teamId into a single shared pool and namespaces ids
- two processes saturate one shared capacity-1 pool (contention)
- a bigger shared pool relieves the same offered load

### portfolioClosure

- follows in-set forward links from the roots, cycle-safe
- ignores links that point outside the supplied set

## tests/simulation/replay.test.ts

_4 tests_

### trace recording

- emits a coherent, time-ordered token-movement log

### Operator intervention fork

- is deterministic — same intervention + seed ⇒ identical fork
- intervening (more capacity) clears more work than leaving it alone

### diagram → network assembler

- maps BPMN types to engine nodes, teams and branch routing

## tests/simulation/runner.test.ts

_4 tests_

### runMonteCarlo

- is deterministic for the same network + config
- reports ordered percentiles and a non-degenerate range under variance
- recovers the M/M/1 utilisation ρ≈0.8 across replications
- collapses to a zero-width range for a fully deterministic model

## tests/simulation/splice-links.test.ts

_5 tests_

### linked-subprocess roll-up

- flattens a linked subprocess into an inline body and simulates it
- subMode 'summary' keeps it a black box (not rolled up)
- two parallel linked subprocesses stay isolated and contend on a shared team
- rolls up NESTED links (A → B → C)
- a cyclic link terminates (no infinite loop)

## tests/simulation/subprocess.test.ts

_6 tests_

### subprocess recursion

- runs the inline body once and returns to the parent flow
- nested EPs recurse two levels

### loop / multi-instance

- standard loop repeats the body a fixed number of iterations
- sequential multi-instance runs N body instances serially
- parallel multi-instance seizes concurrently and joins before continuing

### subprocess snapshot/resume

- is bit-identical across a looping subprocess

## tests/staffNarrativeBriefing.test.ts

_4 tests_

### staff-narrative briefing assembly

- uses the built-in default when there are no additional rules
- appends additional rules to the built-in default
- treats a legacy full-briefing row as the whole briefing (no doubling)
- extractAdditionalRules hides legacy full briefings but keeps real additions

## tests/translate/flowchart-parallel-comment.test.ts

_4 tests_

### flowchart → BPMN: parallel + comment

- maps both parallel bars to parallel gateways (the pair)
- keeps the concurrent branches as sequence flow through the gateways
- maps the comment to a text-annotation attached by association, not sequence
- lays out through the BPMN engine with waypoints on every connector

## tests/translate/flowchartToBpmn.test.ts

_9 tests_

### translateFlowchartToBpmn

- maps a linear terminator→process→terminator into start/task/end with a pool
- maps a decision to an exclusive gateway and preserves Yes/No branch labels
- splices a document out of the sequence and attaches it by association
- maps a database to a data-store
- splices on/off-page connector jump pairs so flow stays connected
- maps vertical swimlanes to a pool + lanes and assigns nodes by centre-x
- is deterministic — identical input yields identical output
- swimlanes survive layout as pool lanes with the flow spread left-to-right
- lays out through the real BPMN engine with non-empty waypoints on every connector

## tests/translate/prompt-mapping.test.ts

_4 tests_

### renderFlowchartMappingForPrompt

- includes every distinct promptText from the table
- opens with the TRANSLATE instruction and closes with the pool-wrap rule
- emits the shared on/off-page connector phrase only once
- is embedded verbatim in the BPMN system prompt

## tests/translate/refine-merge.test.ts

_4 tests_

### mergeRefinement (structure lock)

- applies whitelisted label / taskType / gatewayType + connection label
- ignores attempts to change id / type / pool
- ignores added or removed elements and connections (count is preserved)
- is a no-op when the model returns nothing useful

## tests/visio/export-matrix.test.ts

_5 tests_

### Visio export — BPMN structure matrix

- linear flow — exports a structurally valid VSDX
- pool with two lanes — exports a structurally valid VSDX
- gateways + events — exports a structurally valid VSDX
- expanded subprocess with internals — exports a structurally valid VSDX
- data objects, store + cross-pool message — exports a structurally valid VSDX
