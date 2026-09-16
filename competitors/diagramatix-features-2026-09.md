# Diagramatix — Complete Feature Guide

**Date: 16 September 2026** · September 2026 edition · product 2.11 (build 2591)

*A full description of what Diagramatix does, written for people outside the company: prospective
customers, partners, evaluators and reviewers. Features are ordered with the most significant first,
so the opening sections are the reasons organisations choose the product and the later ones describe
the everyday and administrative capabilities that surround them. Everything described here is
built and running today; a short roadmap section at the end lists what is not.*

---

## What Diagramatix is

Diagramatix is a web-based business process platform that covers the whole life of a process: draw
it, generate it with AI, discover it from your own system data, simulate the redesign, write the
procedure, govern the risks and publish it to the people who do the work. Nine diagram notations are
supported, BPMN 2.0 and EPC among them, and the entire product runs either as a hosted service or
inside your own network on your own database.

Three things set it apart from the enterprise suites it competes with. Diagrams lay themselves out
to a publishable standard, so AI-generated and imported models are usable the moment they appear.
The AI shows you a structured plan you can edit before a single shape is positioned, and it runs on
whichever language model your organisation approves, including one hosted entirely on your own
hardware. And the analysis layers are built to be defended in a meeting: every mined figure states
whether it describes the whole dataset or a slice, and every simulated improvement can be tested for
whether it survived the noise.

**How to read this guide.** Sections 1 to 10 are the major capabilities. Sections 11 to 17 cover
collaboration, discovery, integration, security and administration. A complete index of every
feature appears at the end.

---

# Part A — The major capabilities

## 1. AI diagram generation you can actually control

Describe a process in plain English and Diagramatix produces a finished, correctly laid out diagram.
What makes this different from every other text-to-diagram feature is what happens in between.

**You edit the plan before anything is drawn.** The AI first returns a structured plan — the pools,
the lanes, the activities, the decisions and the connections between them — presented across
synchronised tabs that include the raw data if you want it. You correct a role, rename a step,
delete a branch or restructure the whole thing, and only then do you apply it. No geometry is
calculated until you are happy with the content. No competing product exposes this intermediate
stage; everywhere else the diagram simply lands on the canvas and you edit the picture instead of
the plan.

**Every notation, not just BPMN.** The same generator produces BPMN, EPC, ArchiMate, Standard
Flowchart, Value Chain, State Machine, Domain models, Context and Process Context diagrams.
BPMN and EPC both use the editable-plan flow; the others generate in a single pass.

**Describe it however suits you.** Type the description, dictate it by voice, attach a PDF or a text
document for the AI to read, or supply a picture.

**From a picture to an editable model.** Photograph a whiteboard, screenshot a colleague's diagram
or scan a decade-old flowchart, and vision and text recognition rebuild it as a real, editable
diagram. Rectangles become activities, diamonds become decision gateways, ovals become start and end
events, cylinders become data stores. A plain flowchart image can be converted directly into proper
BPMN, which is the quickest route off a legacy drawing standard. If the picture is too rough to
place shapes precisely, the import still succeeds using the standard automatic layout rather than
failing.

**Reproduce a diagram as it was drawn.** When you need the imported model to look like the original
rather than like a Diagramatix diagram, tick "reproduce original layout" and the positions from the
source are preserved.

**Your choice of AI provider.** Generation runs on any of seven providers: Anthropic Claude, Moonshot
Kimi, Google Gemini, Microsoft Azure OpenAI, DeepSeek, OpenRouter, and Ollama or LM Studio for a
model running entirely on your own hardware. An administrator chooses the model your organisation
uses, and individual users can supply their own API key where that suits your billing.

**House conventions, enforced.** Administrators edit the generation rules per diagram type. Guidance
rules steer the model's choices about sub-process splitting, gateway types and naming. Structural
rules are enforced by the layout engine itself rather than being requested of the AI, so they always
hold.

**A record of what was tried.** Every diagram keeps its generation history, so you can run several
prompts and keep the best result rather than losing the earlier attempts.

**Voice input throughout.** Dictate the prompt in the AI panel of any notation. Transcription is
real-time and continuous, carrying on through natural pauses rather than cutting off between
phrases. An indicator shows which speech engine is live, there is a built-in microphone test, and if
the premium service is unavailable the browser's own recogniser takes over so dictation always
works. Your credentials are never exposed to the browser.

## 2. Diagrams that lay themselves out to a publishable standard

This is the capability customers notice first and value longest. More than fifty codified layout
rules position every element, and the result is intended to go straight into a document with no
manual tidying. Readability is treated as a measurable property rather than an aspiration: a library
of stored AI plans is re-laid-out automatically on every build, and the release is blocked if
overlaps increase.

**Connectors that route themselves.** Orthogonal, curved and direct routing are available per
connector. Lines find their way around obstacles, cross each other with a clean hop rather than a
collision, and attach to sensible points on every side of a shape. You can still drag a waypoint
when you want a specific path, without losing the automatic routing underneath.

**Connections that obey the notation.** A sequence flow will not run into a start event, out of an
end event or across a pool boundary. Gateway branches carry their own option labels. The same rules
govern manual drawing, AI generation and assisted suggestions, so an illegal connection is not
something you can accidentally create.

**Wiring shortcuts.** New activities, gateways and events connect themselves to their natural
neighbours as you drop them, with the behaviour switchable between full, incoming-only and off.
Select a cluster of loose shapes and stitch them into a properly connected process fragment in one
action. Double-click a gateway to fan a whole group of branches out from it. Drop an element onto an
existing connector and the flow splits to admit it.

**Room when you need it.** An insert-space marker pushes everything below or to the right to make
space, in any of four directions, without disturbing what you have already arranged.

## 3. A process simulator that can defend its answer

Run your BPMN model as a discrete-event simulation and find out where work queues, who the real
bottleneck is and whether a redesign pays for itself. The engine follows the OMG and WfMC BPSim
standard, and models import and export in that format for interchange with other tools.

**How the engine works.** Work items flow over a simulated clock. Activities seize limited team
capacity, so queues and waiting times emerge from genuine contention rather than being assumed. Per
element you set arrival rates, cycle times and waiting times as statistical distributions, edited
either in the properties panel or in a single table covering the whole model.

**Full process behaviour.** Decision probabilities and conditions, loops, multi-instance activities,
expanded and event sub-processes, and interrupting and non-interrupting boundary events are all
executed. A sub-process linked to its own diagram is drilled into and its activities, teams and
durations roll up into the parent, through nested links and parallel instances.

**Distributions that match reality.** Alongside fixed, uniform, triangular, normal and exponential
timings, service times can be lognormal, which is the right-skewed shape real durations actually
have: most cases cluster and a minority run far longer. That tail is what makes a queue form, and a
symmetric distribution cannot produce it. Where you have mined data you can go further and use the
observed values themselves, resampled, rather than laying a curve over evidence that does not
support one.

**Resources you can see.** Every team in a simulation comes from something you drew: a swim-lane, or
a team named on an activity, across the process you opened and every sub-process it links into.
Nothing is invented in the background. If work is charged to a name that is not in the library, the
results say so and warn that the work ran without a capacity limit, so its waiting times are
understated. A misspelled team appears beside the correctly spelled one rather than being silently
absorbed, so you can see and fix the discrepancy.

**Systems and people in the same lane.** Service, script and business-rule activities are charged to
a shared automation resource running around the clock, while user and manual activities draw on the
swim-lane's team. You can therefore draw systems and people together without the flow zig-zagging
into a separate automation lane and back on every step. Automation is an ordinary visible resource
with a capacity and a cost you control.

**Working hours.** A reusable calendar library defines weekly open windows per weekday, with presets
for common patterns. Assign a calendar to a team and it is staffed during open windows and stands
down when closed. Work in progress at the end of a shift finishes; new work waits and starts the
moment the shift reopens. Arrival sources get their own operating hours with an optional rate
multiplier for peak and off-peak demand. Utilisation is measured against staffed time rather than
against the clock.

**Repeating work.** A repeating activity takes a distribution for how many passes it makes, because
the number of repetitions varies as much as the durations do. Sequential multi-instance holds the
resource throughout, which is how a person actually works through a list. Parallel multi-instance
runs as many at once as capacity allows and queues the remainder. A parallel marker on a one-person
team behaves sequentially, and the simulator says so rather than pretending otherwise. An
implausible repeat count is reported before the run rather than quietly trimmed afterwards.

**Urgent work that interrupts.** Priority alone only decides who is served next, which is powerless
at exactly the moment it matters, when everybody is busy. Here an urgent case can interrupt work
already in progress, and the interrupted case keeps the work already done and finishes the
remainder. Because this moves waiting rather than removing it, results are reported per segment as
well as pooled, showing both halves instead of a flattering average.

**Costs that do not scale with time.** A per-run charge on an activity — a bureau check, a courier,
a card-scheme fee — is modelled separately from resource cost, because the two have different
remedies. One falls when the work gets faster; the other only falls when the work stops happening.
An activity with no price reports as not measured, because "nothing was charged" and "nothing was
counted" are different claims.

**Queue discipline and service levels.** First-in-first-out, priority and shortest-job-first, with
service levels reported per segment as well as pooled, because a healthy overall figure can conceal
a segment missing its target entirely.

**Skills and cross-skilling.** A master skills list is maintained per organisation. Named people
hold skills, activities require them, and the same skills read as capabilities in the ArchiMate
operating-model view. This is the middle ground between assuming nobody can help and assuming
everybody can do everything.

**Scenarios and interventions.** Duplicate a baseline, override a capacity or a rate, or schedule a
timed capacity surge, outage, demand spike or injection of work. Pin scenarios to different process
variants and compare them side by side with a plain-language verdict such as "28% faster, 12% more
throughput, $4,200 less per case, frees about 1.4 full-time equivalents".

**Ranges, not a single misleading number.** Repeated replications produce mean, median and
95th-percentile ranges with a ranked list of bottlenecks.

**Honest runs.** A model whose queues never drain is a finding about your process, not a crash. The
run stops, states how many cases were still in progress and that the number was still climbing, and
labels the partial results as partial. Presenting part of a run as a finished answer is the most
dangerous kind of wrong number. It then tells you what to change: add capacity at the named
bottleneck, lower the arrival rate or shorten the longest activity.

**The analysis layer.** This is what turns a simulation into a decision, and it is where Diagramatix
goes furthest beyond its competitors.

- **Is the difference real, or is it noise?** A statistical test across replication means reports the
  improvement as a confidence interval. When the result is not significant it says so, and offers to
  run the further replications that would settle it.
- **Where does the staffing curve bend?** A parameter sweep marks the point at which one more person
  stops buying much, and refuses to invent an elbow in a curve that does not have one.
- **Which assumption is load-bearing?** A sensitivity analysis pushes every input up and down by a
  fifth and ranks how far the answer moves, telling you where better data is worth buying and where
  a rough guess is safe.
- **How do we know the model is right?** The simulated flow-time distribution is compared against the
  one the business actually had, with a table of key percentiles and a verdict. Model validity stops
  being a matter of judgement and becomes a number.
- **When does it pay back?** A business case gives cost per case before and after, annual saving,
  one-off cost and the payback month, narrated and exportable to Word, Excel or PDF. A missing input
  is reported as missing rather than treated as zero, and a change that never pays back says so.
- **What should we try next?** Suggested next steps are drawn from the study's own run history, each
  with its evidence, and negative results are reported as plainly as promising ones.

**Watch it run.** A live replay shows work flowing through the model and stacking at bottlenecks,
with a utilisation heatmap. You can intervene mid-run and re-run deterministically from that point
to compare what would have happened. A trace table gives the whole run as a grid, one row per case,
showing where the time went and what waited, exportable to spreadsheet. A blank cell means the case
never went there; a zero means it did and took no time.

**Worked examples.** Load a complete example such as loan origination or a car-repair rework loop
into your own project and demonstrate the whole capability in two clicks.

## 4. Diagramatix Miner — process mining that reads the data you actually have

Feed in event data from your systems and Diagramatix reconstructs the process you really run, shows
where reality departs from your documented model, and hands the result to the simulator as a
calibrated twin. It is part of the same product and the same licence, not a separate module.

### Getting your data in

Most organisations do not have a purpose-built event log. They have a spreadsheet, and it is rarely
the shape a mining tool expects.

- Excel workbooks are read directly, alongside CSV, tab-separated files and the IEEE and
  object-centric event log standards. When a workbook holds several sheets you are asked which one.
- A "one row per case" export, with state and date repeating across the row, is detected and offered
  for expansion, rather than being read as a single step per case with the rest discarded.
- Several systems' extracts of the same cases merge into one lifecycle, so the front half from your
  CRM and the back half from your ERP become a single process. Records are linked on a shared
  business key, or through an explicit crosswalk when the two systems do not agree on an identifier.
- The wait between two systems is then measurable, a delay that neither export contains on its own
  and usually the largest in the process.
- A merge that cannot work is refused. If no case appears in more than one file you are told, rather
  than being handed twice as many half-length cases, which looks exactly like a successful import.
- You choose which spare columns to keep, hash or drop at import, and the ones you keep become the
  dimensions you can later slice by.

Competing products solve these problems with extract-and-transform tooling and a connector
catalogue, which is a project. Diagramatix solves the common cases in the import screen, which is an
afternoon.

### Reading the result

- **Discovery** produces the implied process as a real, editable BPMN diagram, with gateways at every
  branch, loops included, and a detail slider that moves between the happy path and the full picture.
- **The entity's lifecycle** is proposed as a state machine — the real life of an invoice, an
  employee, a registration — with each transition labelled by the activity that triggers it.
- **Conformance** scores the log against a reference lifecycle and reports a fitness percentage,
  undocumented transitions, unknown states, unexpected entries and exits, and transitions that are
  never used, each weighted by how many cases it affects.
- **Slicing** filters the run by date range, team or any column you kept, with the arrivals chart
  doubling as the date selector.
- **Every figure declares its own exactness.** A number says whether it describes the filtered slice,
  whether it is an estimate from a sampled run, or whether the run cannot support filtering at all
  and why. Nothing is quietly averaged into a plausible-looking figure. This is what makes a number
  citable, and no competing product was found to do it.
- **Between the steps.** Transitions are ranked by how much elapsed time they account for, because
  most delay in a process sits between the steps rather than inside them. Click a row to light the
  arrow on the model, or an arrow to find its row.
- **Hand-offs and rework.** A team hand-off map, workloads, cases passed back and forth between
  teams, and steps repeated within a case with their rate, such as "credit check runs 2.4 times per
  case". These are built from the resource on each event rather than from each activity's dominant
  team, and are labelled approximate when exactness is not possible.
- **Deviations resolve to evidence.** A deviation gives you the actual case identifiers, each with
  its own timeline, and states how many of the affected cases it is able to name rather than showing
  a quietly shortened list. The complete per-case index exports to spreadsheet, honouring the filter
  you applied, rather than only the rows on screen.
- **What to do next.** Ranked recommendations are computed deterministically from the evidence, each
  with a button that shows you the cases, narrows to that slice, or calibrates a simulation twin and
  tries more capacity in the team concerned. It can say that nothing stands out, and it names what it
  could not assess — no service level defined, no reference model — rather than staying silent.
- **Reports** to Word and Excel state the slice they were run under, with summary counts that match
  the tables beneath them.

### Watching it, rather than visiting it

Nobody mines a process once.

- Runs link into a series, so a process has a history rather than a scattering of similarly named
  copies. A live source keeps its own history automatically, bounded to one snapshot a day.
- Two periods can be compared: cases, cycle times, variants, conformance, which steps got slower and
  which deviations appeared or cleared.
- A comparison between two runs whose activities barely overlap is refused. They are different
  processes, and every difference between them would read as a dramatic regression.
- Alerts lead with the one nobody else leads with: **the source stopped sending**. A dead feed raises
  no error anywhere, and stale figures look exactly like stable ones. Conformance falling, a new
  deviation appearing and the late rate doubling are also reported.
- Nothing fires on a first observation, and a condition is announced once. A condition that worsens
  is raised again; one that merely persists is not.

### Task mining

Desktop and application activity can be mined as well as system logs, producing the same discovery
and analysis over how work is actually performed at the keyboard, with an automation view that
identifies the repetitive sequences worth automating first.

### Feeding the simulator

One click writes the mined durations, arrival rates, branch probabilities, teams, capacities and
working-hours calendars onto the discovered process and opens it in the simulator. The loop closes:
mine, discover, check conformance, simulate, improve — so a proposed redesign is compared against a
baseline calibrated from real data rather than from guesses.

Two safeguards make the twin trustworthy. You can hold back the most recent share of cases at
import, so the twin is tested against data it was never fitted to instead of marking its own
homework. And calibration fits the observed values behind a standard outlier fence, with a cap on
how much may be trimmed — so a single case that sat over a long weekend cannot set the tail for
every future run, while a genuinely slow tenth of your cases is recognised as the process rather
than dismissed as noise. A twin whose underlying log has moved on is marked stale, with the date,
and is never silently re-calibrated over edits you have made.

### Ready-made studies

A gallery of published examples loads a real event log and its reference lifecycle into a new
project in one click, so discovery, conformance and the calibrated simulator all work immediately
with no setup. The accounts-payable starter carries a month of around two hundred invoices with both
a permissive lifecycle and a strict one that flags dozens of undocumented rework cases.
Administrators can capture any real mining run as a new example and publish it.

## 5. Modelling by voice, and assistance while you draw

**Abracadabra Mode** is live voice-driven diagram editing, and no other business process tool offers
it. Speak or type an instruction and the diagram changes as you watch.

- Say "add a task called Approve after Review", "put a pool around everything", "add three sub-lanes
  to the Marketing lane", "move the gateway two elements right", "delete Prepare and close the gap",
  or "surround the selected steps with an expanded sub-process called Check Stock".
- Refer to things by name, by type ("the gateway"), by position ("the middle pool"), by number, or
  with ordinary pronouns. You can also simply select shapes with the mouse and say what to do with
  them, which removes any chance of a name being misheard.
- Every change is undoable, and one spoken command is one undo. A running log shows what was heard
  and what was done.
- Common phrasings are recognised instantly and free of charge by a deterministic parser; only
  unusual wording falls back to a metered AI call, and the log colour-codes which handled each
  command. That makes it cheap enough to leave switched on all day.
- A numbered-badge mode puts green numbers on the canvas for renaming or connecting things by number,
  which is faster and more reliable than pronouncing a name.
- An on-screen reference card lists everything you can say, and a running cost display shows what the
  session has used.

**Assist while you draw** offers suggestions as you work, and every one is validated by the same
rules engine that governs AI generation, so nothing illegal or badly placed ever appears.

- Select an element and translucent suggestions for the next step appear. Press Tab or click to
  accept, and the new element is placed and connected for you.
- Boundary events and saved template fragments are suggested in context.
- Suggestions are content-aware. Name an activity "Approve invoice" and the matching approval
  template is offered; imply a document and an output data object is offered; imply a policy and an
  instruction input is offered.
- Administrators tune the keyword-to-suggestion catalogue; the geometry rules are shown read-only.

## 6. Authoring across nine notations

One workspace covers every diagram type a process team needs, each with its own palette so only
relevant symbols are offered.

- **BPMN 2.0** with the full orchestration palette: every activity, event and gateway type,
  interrupting and non-interrupting boundary events, event, transaction and ad-hoc sub-processes,
  loop and multi-instance markers, data inputs, outputs and collections, and compensation. Event
  triggers cover message, timer, error, signal, escalation, cancel, compensation, conditional, link,
  multiple and parallel-multiple. Compensation is not merely drawn but executed in the simulator.
- **EPC**, the notation ARIS made standard, implemented in full: events, functions, the three
  connector types, organisational units and positions, information objects, application systems,
  process interfaces, and ten descriptive objects covering measures, risk, product, knowledge,
  business rules, screens, objectives, resources, location and requirements. The rules are enforced
  as you draw — events and functions alternate, and an event may not make a decision — and reported
  on generated or imported chains. Layout follows the vertical ARIS convention.
- **ArchiMate**, updated to version 3.2, with the full element set, relationship compatibility
  including directed association and cross-level realisation, and-junctions and or-junctions,
  grouping containers that behave as proper containers, and a relationship explorer.
- **Standard Flowchart**, **Value Chain**, **State Machine** with composite states and guarded
  transitions, **Domain models** in UML class and relational forms, **Context** and **Process
  Context** diagrams.

**Organisational structure.** Multi-pool, multi-lane and sub-lane models for matrix organisations.
Lanes auto-fit, containers grow to hold what you add and never shrink unexpectedly, and lane fonts,
header widths and label rotation are independently adjustable. Black-box pools represent either an
external participant or an IT system.

**Editing that keeps up with you.** Snap-to alignment guides while dragging, a quick-add menu at the
cursor, double-click on a label to zoom and centre it for typing, and a properties panel that edits
everything about the selected element without leaving the canvas — name, type, size, colour,
activity and gateway and event subtypes, UML attributes and operations, and connector waypoints,
labels and direction.

**Hierarchy.** Sub-processes link to their own nested diagrams, collapsed symbols can link to a
diagram of any type, a one-click arrow returns you to the parent, and every diagram lists the
diagrams that link to it.

**Custom ArchiMate iconography.** Upload a picture of an icon and have it traced into editable
vector shapes, then refine it in a full vector editor with lines, curves, rectangles, triangles,
circles, ellipses, arcs and orientable arrowheads. Assign a glyph to an element type and it renders
everywhere, recoloured to suit the layer it appears in and crisp at any zoom, with per-element
position and size adjustment. Changes apply live for every user.

**Reusable content.** Save your own templates per diagram type, organise them under collapsible
named groups, and draw on the built-in library that ships with the product.

## 7. Procedure documents generated from the model

Turn a diagram into a written standard operating procedure in Word, grounded in the model itself
rather than in a recording or a conversation, so the words always match the process.

- Generate from a whole diagram, a single lane for a role-specific procedure, a pool, a sub-process
  or a linked group of diagrams.
- A deterministic extract of the model is handed to the AI to write the prose, so steps are never
  invented.
- A role procedure documents hand-offs in both directions — what this role receives and from whom,
  what it passes on and to whom — with a cropped figure of that lane and labelled boundaries.
- Edit in the application: reorder sections, lock the ones you have written yourself, and regenerate
  the rest. Regeneration is non-destructive, so your edits and added sections survive when the
  diagram changes.
- Export to Word adopting your organisation's own template, so fonts and heading styles match your
  house documents.
- Every generated procedure records who produced it, when and with which model, shown in the
  project's procedure list.
- A written procedure that lives elsewhere can be linked to its diagram instead, appearing as a
  prominent link in the published view and travelling with the diagram through publication and
  export.

## 8. Risk and control, alongside the process

Model governance where the work is, and get an auditable matrix out of it, without buying a separate
governance product.

- Maintain a risk and control catalogue for the project or the organisation, and attach entries to
  individual process steps by code.
- Export a risk-control matrix carrying your organisation's numbering and codes.
- Model control effectiveness and compliance structures against the catalogue.
- Automatic checks flag a segregation-of-duties breach where one lane holds both an originating and
  an authorising activity, and flag a risk that has no mitigating control.
- Where mined data carries governance identifiers on its events, control operating effectiveness is
  measured from what actually happened rather than from an assessment.
- A ready-made order-to-cash library of risks and controls ships with the product, aligned to the
  mining example so the two demonstrate together.

## 9. Classification against the APQC framework

Position your processes in the language the industry recognises.

- Browse the full APQC Process Classification Framework, both cross-industry and industry variants
  including banking, healthcare, retail, telecommunications and utilities, as a searchable five-level
  hierarchy.
- Classify any diagram against a framework element.
- Create a project pre-seeded with a folder structure mirroring a chosen branch, to whatever depth
  you choose.
- Generate a standard process in one click: higher-level processes decompose into collapsed
  sub-processes, task-level processes are AI-generated with the framework branch as grounding, and
  framework numbering can be applied to every step.
- Coverage analytics show which processes are modelled and where the gaps are, by category and level.
- Compose your own tailored framework from one or more industry variants, extend it with your own
  processes, curate the terminology and scope it to divisions or business units.
- Import a new framework version and receive an automatic difference report of what was added,
  renamed and removed. Classifications key on the framework's stable identifiers, so they carry
  forward across version updates.
- Conformance and control effectiveness can be reported by framework category, tying the standard to
  your live models and your mined data.
- The framework is used under its royalty-free licence with attribution preserved throughout,
  including in exports.

Behind this sits a database-backed process repository of twenty-six value chains, two hundred and
seventy-seven processes and three hundred and eighty-one editable prompts, each recording how it was
produced.

## 10. Bringing your existing work with you

Migration is where most process tools fail, so it is treated as a first-class capability.

**Microsoft Visio, in both directions.** Export any BPMN diagram as a native Visio file, using a
dedicated Diagramatix stencil with correct BPMN markers, and re-import a Visio-edited file with its
styling preserved. A multi-page Visio file can be imported as separate diagrams, with a tick-list of
exactly which pages you want and a destination project and folder. An import report shows what was
created, what was skipped and a breakdown per shape master, so nothing lands silently. A whole
project exports as a single multi-page Visio file, one page per diagram. The recipient's stencil is
free to download.

**ARIS.** Import an ARIS AML export and every EPC model in the file becomes a real diagram.
Non-EPC models are named and skipped rather than mangled, and unrecognised objects and connection
codes are reported rather than dropped.

**EPC to BPMN, deterministically.** Convert an EPC chain into BPMN with a preview and, more
importantly, a refusal list. Events following a decision become the gateway's branch labels, and
organisational units become lanes derived from the model rather than guessed from the picture. An
optional AI pass writes the gateway's question and turns noun-style function names into verb-style
task names, with the structure locked so it cannot be altered. What makes the conversion worth
trusting is what it declines: an unbalanced split, a connector that both splits and joins, an event
with no decision behind it, a function owned by two departments. It names the places that need a
human decision instead of quietly tidying them.

**BPMN XML.** Standard BPMN 2.0 import covering pools, lanes, activities, gateways, events, message
flows and sub-processes, with layout heuristics positioning elements when the file carries no
coordinates and a validation report flagging anything unsupported. Export round-trips against a
versioned schema.

**Another vendor's BPMN, as it looks.** A per-diagram setting lets pools be any size and sit
anywhere rather than being forced into stacked full-width bands, and lets message flows run between
elements that are not vertically aligned. The layout validation that enforces Diagramatix's own
conventions is relaxed for these diagrams, so an imported foreign model does not arrive buried in
warnings. It remains a fully editable diagram.

**Legacy flowcharts to BPMN.** Translate a Standard Flowchart into a new BPMN diagram in one
deterministic step, leaving the original untouched. Processes become activities, decisions become
exclusive gateways keeping their branch labels, terminators become start and end events, predefined
processes become sub-processes and delays become timer events. Documents and databases become proper
BPMN data objects and stores, attached to the right activity by an association rather than left in
the control flow. Vertical swimlanes become a pool with one lane each, and off-page connectors are
followed through and spliced away so the flow stays connected. A preview report shows what was
mapped, approximated or spliced before the diagram is created, and an optional AI pass refines
labels and types without ever changing the structure.

---

# Part B — Everyday capability

## 11. Working together

**Real-time co-authoring.** Several people edit the same diagram at once. Coloured initials show who
is present, live cursors show where they are working, and an element someone else is editing carries
their coloured ring so you cannot clash on it. A version guard means two people saving at once never
lose a document between them, and edits to different elements merge automatically — only a genuine
same-element clash is ever raised. Available to anyone with edit access.

**Review rounds.** Circulate a diagram for comment and sign-off without leaving the product. Invite
colleagues into collaboration groups by name or email, with in-app notifications and the usual
accept, decline, leave and transfer-ownership controls. Send a diagram to one or more groups with an
objective and a due date. Reviewers drag a comment marker onto any element and it links itself to
that element and is tagged with their name. Dashboard collections track diagrams received and sent,
colour-coded by due date, with live reviewer status and approve, submit and decline actions. Owners
can filter comments by reviewer, re-submit for a fresh round and close the review when done.
Read-only recipients can leave notes that arrive in the owner's panel.

**Project sharing.** Share a project with any registered user as viewer or editor. Viewers see it
read-only; editors change diagrams but cannot delete the project or its diagrams. Shared projects
appear on the recipient's dashboard marked with the owner's name. Everyone in a share can see who
else is in it. A per-diagram owner field assigns accountability without changing access, and
cross-organisation sharing is permitted or blocked centrally.

## 12. Publishing, and helping people find the process

**A publication lifecycle.** Publishing snapshots an immutable version. Readers always see the
latest current version and the history is retained. Related diagrams — a root process and the
sub-processes it links to — publish together as one release with release notes. Share a release with
named colleagues or invite people by email, and an invitee joins the audience automatically when
they sign up. Audience members open a clean read-only viewer and drill across linked diagrams. Set a
next-review date or a recurring cadence and the system raises a reminder when a process is due for
re-review, so published maps do not silently go stale. A new version supersedes the previous one,
and archiving a release withdraws its audience access.

**A portal for everyone else.** A search-first portal lets anyone in your organisation find the
published processes they are entitled to see, without knowing which project holds them. Search by
name, owner, framework category or the systems and teams involved. Browse by facet with live counts
that combine to narrow the list instantly. Recently viewed and recently updated shortcuts get people
back to what matters, and a badge flags anything overdue or approaching its review date. The portal
adds discovery only; you never see a process you could not already open.

**Where-used.** Answer "which processes use this system?" and "what is my team involved in?" Pools
and lanes are matched against your maintained organisational lists, so choosing a team also surfaces
processes that name only a role beneath it. Labels that are not yet in your lists still appear,
flagged as uncatalogued, so nothing is hidden and you can see what to add. One click shows every
process that involves a team or role you belong to.

## 13. Governed naming and organisational structure

**Entity lists.** Maintain three reusable lists per organisation: external participants, IT systems,
and a hierarchy of organisation, unit, team and role. Each project adopts a copy it can tailor
without touching the master. Renaming a pool pre-fills the default organisation name and shows the
whole indented structure, so you can filter by typing and accept at any level. Lanes draw from the
same hierarchy and black-box pools from the participant or systems lists. A brand-new name asks
where it belongs and is saved into the structure on the spot. Drift between a project's copy and the
master is highlighted.

**Build the structure from what you have drawn.** One action reads every BPMN diagram in a project
and assembles the organisational hierarchy from it: pools become organisations, lanes become units,
sub-lanes become teams. Names are de-duplicated across diagrams, so one Finance unit emerges however
many diagrams mention it. The merge is non-destructive and keeps your own additions. Entries can
then be promoted, demoted and reordered, with the moved branch re-levelling automatically, and the
result immediately drives naming suggestions on the canvas.

## 14. Keeping a project correct and consistent

**Health check.** Scan a whole project against shared correctness rules and fix issues one at a
time, each highlighted on its own diagram. It catches connectors illegally attached to pools or
lanes, hanging message flows, single-lane pools, duplicate names and other structural slips. Issues
are grouped by diagram and carry the offending identifiers so they light up on the canvas. The scan,
fix and re-scan cycle remembers where you were. It is particularly useful after a Visio import,
where connector attachment is the most common thing to repair, and administrators choose which
checks run so it matches your house conventions. More than forty live rules cover structure,
overlap, segregation of duties and boundary-event flow.

**Automatic linking.** Find every unlinked sub-process across a project and match it to the diagram
that details it. Exact name matches are treated as definite and pre-selected; looser matches are
offered for confirmation, using heuristics built for real naming — a shared leading process code,
matching text after the code, one name contained in another, or a close spelling match. Review
everything in one dialog and apply in a single step, turning a freshly imported set of diagrams into
a navigable hierarchy in seconds.

**Consistent numbering.** Give a whole project hierarchical numbers across folders, diagrams and
activities, either preserving an existing framework structure or renumbering from the root with your
own prefix. Framework mode keeps its codes and renumbers activities contiguously, so new steps slot
in and gaps from deleted steps close. Preview every change before committing. Re-running produces
the same result, so numbers never stack up, and a toggle highlights everything added outside the
framework.

**Compare two versions.** Point at an as-is and a to-be and get what actually changed: steps added,
removed, renamed or moved between lanes, together with connectors, gateways and properties. It reads
the two models rather than the two pictures, so a renamed activity is reported as a rename and not
as a deletion plus an addition. Export as a spreadsheet or a Word change pack, and optionally
generate a plain-English narrative grounded in the table rather than invented.

## 15. Integration and interoperability

**Microsoft 365.** Sign in with a Microsoft account alongside email and password. Save a diagram's
data files, including the Visio version for BPMN, straight into SharePoint or OneDrive, and open
them back again through a built-in file browser covering your sites, libraries and personal storage.
Link a data object or data store to a live document, preview it embedded in the editor, and see a
link badge on the shape.

**A partner process API.** A third party posts a description or a document — a procedure, a PDF, an
image — along with volumetrics, and receives back pools, lanes, an ordered activity list, a finished
PDF and a real project someone can open. Jobs run asynchronously with run history, comparison
between two runs and audit records.

**Standards.** BPMN 2.0 XML, Visio, the BPSim simulation interchange standard, the IEEE event log
standard and the object-centric event log standard all import and export. Database schemas
round-trip against domain models for PostgreSQL, MySQL and SQL Server.

**Documents.** PDF and SVG export throughout, Word export for procedures, technical notes and change
packs, and spreadsheet export for case data, trace tables and matrices.

---

# Part C — Running the platform

## 16. Security, governance and where your data goes

**Your policy, enforced by the platform.** Your own administrators control an organisation policy
panel, and the platform enforces it rather than merely hiding buttons. Disable all AI generation;
stop audio being sent for transcription; block export to external storage; disable the SharePoint
connector entirely; prevent diagrams being attached to support requests. A single enterprise-mode
switch turns all of these off at once, together with cross-organisation sharing, as a safe default
for regulated tenants.

**AI on your terms.** Three deployment choices, none of them a code change. Use the managed hosted
models and run nothing yourself. Route everything through your own gateway or private endpoint so
traffic stays inside your data-residency and data-loss-prevention controls. Or point the product at
a model running entirely inside your network, so diagram content never leaves it, which suits
air-gapped and highly regulated environments. You can also switch AI off completely and keep the
full deterministic platform, with mining, simulation and risk and control all still working.
Whichever mode you choose, AI uses a single centrally chosen model your administrators approve.

**Accountability.** An append-only audit log records every privileged action: administrator
impersonation with a required reason and a time-boxed session, exports and backups, deletions and
policy changes.

**Access and isolation.** Role-scoped administration separating organisation administrators from
platform operators, tenant-isolated data, cross-organisation sharing off by default, configurable
session lifetime, and the option to require Microsoft single sign-on for your organisation together
with a self-registration domain allowlist.

**Privacy.** Self-service account deletion that removes your data and cleans up behind it. Prompt
text is not retained by default, and names can optionally be pseudonymised before a prompt leaves
your tenant.

**Organisation administration.** A dedicated administrator role with oversight of every shared
project in the organisation, including inline editing of share lists. Administrators act as project
owners for share management without appearing in any share list, and can open a shared project as a
full editor. Organisation settings control cross-organisation sharing.

**Domain-managed membership.** An organisation claims one or more email domains, and anyone
registering with a matching address joins it automatically at a configured role, without being able
to create a stray personal organisation. Everyone else keeps their own personal organisation as
before.

**AI usage and cost.** Every member sees how many AI attempts remain this month, when they reset and
how many diagrams they have generated. An administrative dashboard separates raw calls, successes
and failures, quota-consuming attempts and diagrams produced, broken down per user and per
organisation with charts over time, token counts and estimated cost. Counting is fair: clean-up
operations and failed calls are tracked for analytics but never consume a member's allowance.
Monthly allowances follow the subscription tier and are enforced automatically. Voice minutes appear
alongside AI usage.

## 17. Everyday platform features

**Projects and organisation.** Multiple projects per user, nested folders within each, drag-and-drop
reordering or sorting by name or date, with each project remembering your preference. A filterable
navigation tree narrows by type, by name or by the badges that mark AI-generated, simulated, mined,
classified and reviewed diagrams.

**Presentation.** Switch any diagram between a polished presentation style and a hand-drawn sketch
style, set per diagram so some can be final while others read as drafts, and the choice carries into
exports. Colour themes are configurable per symbol type, inherited across a project and overridable
on a single diagram. Every diagram type carries a two-letter code and a distinct colour that appears
in the navigation tree, on dashboard tiles and in the editor's top bar, all of it editable centrally.

**Title blocks.** Stamp a diagram with a version string, an author list and a status of draft, final
or production, shown as a badge, toggled per diagram and rendered into exports.

**Backup and restore.** Capture an entire account — every project, diagram, template and preference
— into one portable file and restore it as it was, for archiving, moving between accounts or trying
something on a copy. Guided backups show a preview of exactly what will be captured before you
commit, let administrators choose which members to include, stream live progress as the file is
built and finish with a report of what was written. Restores are additive and all-or-nothing, so a
half-restored set is never possible.

**Subscriptions.** A thirty-day free trial covering every feature, three paid tiers with
progressively higher limits, self-serve checkout and self-serve cancellation with no support call
required.

---

## On the roadmap

Listed for completeness, because an honest feature guide should say what is not built yet: a
customer-supplied identity provider using SAML or OIDC with multi-factor authentication; dedicated
single-tenant and in-region instances; SOC 2 Type II certification; and a phone-optimised interface.
Formal decision notations, CMMN and DMN, are not supported.

---

## Complete feature index

**AI and generation** — editable-plan generation · text to any of nine notations · image and sketch
to diagram · reproduce original layout · document and PDF prompt attachments · voice-dictated
prompts · seven AI providers including on-premises · bring-your-own API key · administrator-editable
generation rules · generation history · AI usage and cost insights

**Layout and editing** — rules-based publish-ready layout · obstacle-avoiding connector routing ·
orthogonal, curved and direct connectors · rule-checked connections · auto-connect on drop · group
auto-connect · gateway branch fan-out · drop-on-connector insertion · four-way insert space ·
alignment guides · quick-add menu · focus-edit zoom · properties panel

**Notations** — BPMN 2.0 · EPC · ArchiMate 3.2 · Standard Flowchart · Value Chain · State Machine ·
Domain (UML and relational) · Context · Process Context · pools, lanes and sub-lanes ·
drill-down hierarchy · custom ArchiMate icon designer · reusable template library

**Assistance** — Abracadabra voice-driven editing · selection-aware voice commands · numbered-badge
picking · on-screen command reference · session cost display · ghost next-step suggestions ·
boundary-event and template suggestions · content-aware suggestions · tunable suggestion catalogue

**Simulation** — discrete-event engine · statistical distributions including lognormal and empirical
· visible resources · automation resource for system tasks · working-hours calendars · repeats and
multi-instance · preemption with resume · non-time-scaling costs · queue disciplines · skills and
cross-skilling · scenarios and timed interventions · Monte-Carlo ranges · significance testing ·
parameter sweep with knee detection · sensitivity analysis · validation against reality · payback
business case · suggested next steps · honest partial runs · live replay and mid-run intervention ·
trace table · worked examples · BPSim interchange

**Process mining** — Excel, CSV, IEEE and object-centric log import · wide-format expansion ·
multi-system merge with crosswalk · cross-system hand-off timing · refusal on unmergeable data ·
column retention control · BPMN discovery · state-machine lifecycle discovery · conformance scoring ·
slicing with declared exactness · between-step analysis · hand-off, workload, ping-pong and rework
analysis · case-level deviation evidence · full case index export · deterministic recommendations ·
Word and Excel reports · run series · period comparison with refusal · live source monitoring ·
feed-stopped and conformance alerts · task mining and automation candidates · one-click calibrated
twin · out-of-sample hold-back · outlier-fenced calibration · staleness marking · example studies

**Documents and governance** — procedure generation from whole diagram, lane, pool or group ·
role procedures with hand-offs · non-destructive regeneration · Word template style adoption ·
provenance records · linked external procedures · risk and control catalogue · risk-control matrix
export · control effectiveness and compliance · segregation-of-duties and coverage checks ·
mining-measured control effectiveness · APQC classification, project and process creation · coverage
analytics · tailored frameworks · version-difference import

**Migration and interoperability** — Visio import and export, single and bulk · multi-page Visio
page selection with import report · free stencil · ARIS AML import · deterministic EPC to BPMN
conversion with refusal list · BPMN 2.0 XML import and export · foreign-layout mode · flowchart to
BPMN translation · SharePoint and OneDrive save, open and document linking · partner process API ·
database schema round-trip · PDF, SVG, Word and spreadsheet export

**Collaboration and publishing** — real-time co-authoring with presence, cursors and soft locks ·
version-guarded saves with automatic merge · collaboration groups · review rounds with statuses and
sign-off · on-diagram review comments · project sharing with roles · per-diagram owner · versioned
publishing · publication bundles · read-only business viewer · scheduled re-review · process portal
with faceted search · where-used by system and team · personal process view

**Project quality** — project-wide health check · administrator-editable scan rules · automatic
sub-process linking · hierarchical renumbering with preview · version comparison with narrative

**Administration** — organisation policy enforcement · enterprise mode · flexible AI deployment ·
audit log · role-scoped administration · Microsoft single sign-on and SSO-required policy ·
domain-managed membership · organisation administrator oversight · entity lists and governed naming
· structure built from diagrams · projects and nested folders · filterable navigation · display
modes · colour themes · diagram-type identity · title blocks · portable backup and restore · guided
backups with live progress · tiered self-serve subscriptions

---

*Prepared 16 September 2026 from the shipping product, version 2.11. Feature descriptions in this
document are written for external readers and may be quoted. Figures describing framework content
and repository size were current at the date of preparation.*
