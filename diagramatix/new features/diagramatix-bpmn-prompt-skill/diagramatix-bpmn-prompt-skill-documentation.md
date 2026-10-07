---
title: "The Diagramatix BPMN Prompt Skill"
subtitle: "Full documentation — how it works, how it matches the Master Prompt, worked examples, and use with the Process API"
date: "7 October 2026"
---

# The Diagramatix BPMN Prompt Skill

**Version 1 · 7 October 2026 · built from Diagramatix master template v7**

## Contents

1. What it is, in one page
2. Quick start
3. How it works — the six stages
4. Alignment with the Diagramatix Master Prompt approach
5. The refinement stage in detail
6. Customising it — house rules
7. The self-check and the bundled checker
8. Sample output
9. Using the skill with the Diagramatix Process API
10. Keeping the skill current
11. Troubleshooting and questions
12. Appendix — file reference and glossary

---

## 1. What it is, in one page

The **Diagramatix BPMN Prompt Skill** is a package of instructions that you load into Claude (or any tool that supports *Agent Skills*). Once loaded, it turns a loose description of a business process — a paragraph, an SOP, interview notes, a meeting transcript — into a **Diagramatix-ready BPMN prompt**: a structured text prompt, in a fixed house format, that Diagramatix's AI Generate reads to draw a BPMN diagram.

**Why it exists.** A diagram is only as good as the prompt behind it. Diagramatix's own Process Repository holds 140 diagram prompts that were all written to one standard, and that standard has been refined — by looking at the diagrams that came out and tracing every systematic defect back to the wording that caused it. Someone writing a prompt by hand cannot be expected to know that standard. The skill carries it, so that **anyone can produce a prompt that behaves like the proven ones**.

**What it does, in order:**

1. takes whatever you have about the process;
2. **asks up to six short questions** about the gaps that would change the diagram (or assumes sensible answers if you prefer);
3. **drafts the prompt** in the seven-section house format;
4. applies **your own house rules** (naming, standard participants, vocabulary);
5. **checks** the prompt against the rules that decide whether it can be drawn; and
6. hands it back in a block ready to paste into Diagramatix, with a short note of every assumption it made.

**What it is not.** It does not draw the diagram, and it does not (today) call Diagramatix itself — it produces the prompt, which you then use in AI Generate or send to the Process API (section 9). It covers **BPMN only**; the other Diagramatix diagram types have their own templates that this skill does not include.

**Where it comes from.** It is not a paraphrase. The template inside the skill is **the application's own master template, copied verbatim by a build script**, and a test fails if the two ever differ. Section 4 sets out the alignment in full.

---

## 2. Quick start

**You need:** the file `diagramatix-bpmn-prompt.zip`, and Claude (claude.ai, the desktop app, or Claude Code) or another tool that reads Agent Skills.

**Install**

| Environment | How |
|---|---|
| **claude.ai / Claude desktop** | Settings → Capabilities (or Features) → Skills → upload the zip → switch it on. |
| **Claude Code** | Unzip into `~/.claude/skills/` (all projects) or `<project>/.claude/skills/` (one project), so that `diagramatix-bpmn-prompt/SKILL.md` exists beneath it. It loads automatically. |
| **Another Agent Skills tool** | Place the unzipped folder wherever that tool looks for skills. |

**Use**

1. Start a new conversation and say something like: *"Use the Diagramatix BPMN prompt skill. Here is the process…"* and paste or attach what you have. (Describing the process and asking for a Diagramatix prompt will normally trigger it by itself.)
2. Answer the questions it asks — or reply *"just assume"*.
3. Review the prompt it returns, with its **Assumptions** and **Checks** notes.
4. Ask for changes if you want any. It updates the prompt and re-checks it.
5. Copy the text from inside the block and paste it into **Diagramatix → AI Generate** — or send it to the **Process API** (section 9).

**No code execution is needed.** If your environment can run Node.js, the skill also uses a small bundled checker for an extra automatic check; if it cannot, the skill works through the same checklist by reading.

---

## 3. How it works — the six stages

The skill works in a fixed order. The order matters: the questions come *before* the draft, because a gap discovered after drafting costs a rewrite and a gap discovered before costs one line.

### Stage 1 — Intake

The skill takes whatever you give it and reads it all before writing. If you have given nothing yet, it asks for it in a single message and says what helps most: **who starts the process and why; the main steps in order; the decisions and what each leads to; what goes wrong; the systems involved; and how it ends.**

Privately it sorts the input into what is *stated*, what is *missing* and what *contradicts itself*.

### Stage 2 — Refine (ask before assuming)

The skill looks for gaps that would change the drawn diagram and asks about them — **at most six questions, in one message, highest-impact first**, in a reply of their own, then it waits. Each question has a short label, the question itself, whether it is single- or multiple-choice, and two to five concrete options taken from *your* process, plus **Other** and **Skip — assume it**.

If you say *"just assume"* (or skip a question) it takes **the most ordinary version** of that detail, keeps it brief, and records it in the **Assumptions** list so you can correct it. It never invents specifics that nothing supports — a system name, a time limit, an outside party.

If nothing important is missing, it says so and moves on. Section 5 describes this stage in detail.

### Stage 3 — Draft

The skill writes the prompt **exactly as the master template specifies**. It reads the template in full first, because the rules interact and are only correct together. Everything it writes is grounded in what you supplied or answered.

Because the master template was written for one subprocess of a *value chain*, the skill adapts a few things (section 4.5): the "narrative" is your description; a process code in the opening line is optional; a standalone process hands nothing on to a next process; and a set of **judgement calls** the template leaves open (who is a pool and who is a lane, which start event to use, lane order, shared outcomes, nested decisions, message flows to systems, quoting and wrapping) are settled in one place so every prompt it writes makes them the same way.

### Stage 4 — Customise

The skill reads `house-rules.md`. Any **active** rules — naming conventions, standard pools, preferred system names, vocabulary, level of detail — are applied. They refine the draft but **never override** the template's drawability rules; if a house rule would conflict, the skill follows the template and tells you which rule it could not apply. A one-off preference you state in conversation is applied the same way. Section 6 describes this.

### Stage 5 — Self-check

The skill runs the checklist in `self-check.md` against its own draft and fixes what fails. If it can run code, it also runs the bundled checker (`scripts/check_prompt.mjs`). Section 7 describes both.

### Stage 6 — Deliver

The skill replies in one fixed shape:

1. **The prompt**, in a fenced `text` block under the label *BPMN diagram prompt.* — with nothing inside the fence except the prompt itself: no preamble, no explanation, no markdown headings or bold; plain text wrapped at about 78 characters.
2. **Assumptions** — one line for each thing it chose because the description was silent.
3. **Checks** — what passed, and anything it could not resolve, stated plainly.
4. **Next** — one line: paste the block into AI Generate; or ask for adjustments, a split into several prompts, or another refinement round.

### Two rules that cut across the stages

**When a prompt is too big.** If a process has more than about 40 steps, or reads as several processes, the skill says so and offers to split it — a main prompt, plus prompts for the larger parts shown as Expanded Subprocesses or as their own diagrams. A very long single prompt risks the AI cutting its answer off partway, and the connections between steps are the part that is lost. (This is not hypothetical: see section 11.)

**Lanes are people, not phases.** A lane is *who* does the work (a role, a team, a system) — never *when* it happens. If a description is organised by stages ("Stage 1 – Gate"), the skill uses the stages as subprocess groupings and puts the roles in the lanes, asking you if it is unsure which you meant.

---

## 4. Alignment with the Diagramatix Master Prompt approach

This section is the heart of the documentation: it explains what the master prompt approach is, exactly how the skill reproduces it, where it deliberately differs, and how the two are kept from drifting apart.

### 4.1 What the master prompt approach is

Diagramatix's **Process Repository** holds a library of value chains — a value-chain diagram, a context diagram, a process-context diagram, an ArchiMate view and a set of BPMN subprocess diagrams for each — written as a Markdown document in which every diagram is described by a **prompt** that Diagramatix turns into a diagram. There are 140 such prompts: 104 BPMN, plus nine of each of the other four types.

Originally every one was hand-authored in conversation. There was no script and no master prompt. The prompts were consistent only because one author held the structure in their head — which made the standard **unauditable and unchangeable**.

The **master templates** were written to fix that. Each was **extracted from the working prompts, not invented**: it codifies the shape the existing blocks already followed, so a prompt written to it matches what is proven to produce good diagrams. The BPMN template is the most developed of the five.

Its structure rests on four decisions:

**A fixed section order, for a reason.** Pools and lanes come before anything can be placed in them; pool *properties* come before layout (black-box pools have no contents to lay out); lane contents come in flow order; edge-mounted events come after the elements they hang off; connectors come after every element they join has been named; and data objects come last because each names the task it attaches to.

**A built-in house standard plus editable additions.** The template splits into a read-only **built-in** half that ships with the application and improves for everyone when it changes, and an editable **additions** half that holds one organisation's own conventions and survives every update untouched. (The skill mirrors this split — see 4.2.)

**An output contract.** The prompt text is the *only* output: no "Here is…", no sign-off, no commentary, plain text with numbered headings. In the application this is read back by a parser; a stray opener would otherwise silently become part of the prompt and end up in the diagram.

**A version history.** Every change to the built-in template is recorded with a version number, a date, a description and the exact commit, so a prompt can be judged *stale* — written before a template change that affects it.

### 4.2 How the skill reproduces it

| Master prompt element | In the application | In the skill |
|---|---|---|
| **The template text** | `DEFAULT_MD_PROMPT_BPMN` in the application's code | `references/master-template.md` — the same text, **verbatim**, written by the build script from the code. A test fails if they differ. |
| **Seven numbered sections, fixed order** | Required by the template | Required by the skill (it *is* the template); also checked structurally by the self-check and the checker. |
| **Opening line** `BPMN: <code> <Name> — <clause>` | Required | Required; the *code* is optional in the skill (see 4.5). |
| **Output contract** (prompt only, no preamble) | Enforced for the batch generator | Applied to the text *inside the fence*; the skill's own notes go outside it. |
| **Grounding rule** — nothing invented; ordinary version of anything unstated | In the template's shared rules | Same rule; also the basis of the Assumptions list. |
| **Built-in + editable additions** | `DiagramRules` row per diagram type | `references/house-rules.md` — an editable file with an *active* and a *not active* part; it never overrides the built-in. |
| **"Refine" clarifying questions** | A step in the AI Generate screen: up to six questions, answers appended as a CLARIFICATIONS block | Stage 2, using **the same list of dimensions**, written into the skill by the build from the application's own source. |
| **Automatic gates** (`checkPromptShapes`, `checkPromptBranches`) | Deterministic and free; run on every repository prompt | `scripts/check_prompt.mjs` — **the same two checkers, transpiled**, plus structural checks; a test confirms identical findings on all 104 repository BPMN prompts. |
| **Template version history / staleness** | `MD_PROMPT_TEMPLATE_HISTORY`; the library screen flags stale prompts | `VERSION.json` and the version stamp in the skill's files (currently **v7**); a new zip is issued when the template changes. |
| **A proven example to follow** | The existing prompts | `references/example-prompt.md` — two real repository prompts, taken directly from the Process Repository by the build. |

### 4.3 The seven sections, and the rules each carries

The skill follows the template exactly; this table is a map, not a substitute. The template (`references/master-template.md`) is the authority.

| # | Section | What it holds | The rules that matter most |
|---|---|---|---|
| — | Opening line | `BPMN: <Name> — <one clause>.` | One unnumbered line. |
| 1 | **Pools & Lanes** | Every pool; the organisation's lanes top to bottom | One white-box pool for the organisation; each external party and each IT system gets its own pool. |
| 2 | **Pool properties** | Black-box / white-box, `System = true`, single instance | Exactly one pool is white-box — the one holding the flow. |
| 3 | **Layout** | Vertical order of pools | Triggering external party at the top; supporting systems at the bottom. |
| 4 | **Lane contents in flow order** | Each element, typed and labelled, in order | See below — this section carries most of the rules. |
| 5 | **Edge-mounted (boundary) events** | Events attached to an activity | Interrupting only; attached to an *activity* only; the exception path says where it goes and never returns to its host. |
| 6 | **Connectors** | Sequence flows; message flows | A message flow must cross a pool boundary; every external and system pool appears in at least one. |
| 7 | **Data objects** | Business records in flight | Never a Data Store; each attaches to a task. |
| — | Closing paragraph | What the process achieves and what it hands on | Three or four lines. |

**The rules in section 4 (lane contents), which are where diagrams usually go wrong:**

- **Every branch says where it goes**, and a destination is an *element* — never a lane, never "the next task". Either the gateway is followed by its merge line, or each branch ends with one of five forms: `(continues to exclusive merge gateway "…")`, `(continues to <type> "…")`, `End event "…"`, `(loop repeats)`, `(exits subprocess)`.
- **Every gateway says which kind it is** — exclusive, parallel or inclusive. An unqualified "Gateway" is read as exclusive, which is wrong wherever work genuinely happens at the same time.
- **A parallel split must be closed by a parallel merge**; an inclusive one by an inclusive merge. An **exclusive** merge is written *only* where two or more branches actually come back together.
- **A gateway must change where the work goes.** If every branch names the same destination, it decides nothing and is not written.
- **Repetition is a subprocess, never a loop-back.** `Expanded Subprocess "Repeat Until …" (standard loop) containing, in order: …`. It holds *only* the steps that repeat.
- **Waiting is an event, not a task** — unless it has a deadline, in which case it is a Receive task with a timer boundary event.

### 4.4 The principles the skill inherits

The master template was audited after a fortnight of chasing the same diagram defects in the *layout* engine. The finding was that **six defects in the prompt template itself had been manufacturing the bugs**, and a prompt that asks for a shape BPMN does not allow is faithfully drawn wrongly. Four lessons from that audit shape the skill:

1. **Audit the prompt before the engine.** When a defect is systematic, look at what the prompt asked for first. The skill's checker and checklist exist to catch an impossible instruction before it is used.
2. **A missing legal option is as damaging as a wrong rule.** The template once offered no way to say "and then the next task"; the model resolved the gap by inventing a merge gateway that merged one branch. The skill's judgement calls (4.5) exist to close gaps of exactly this kind.
3. **Two sections can each be right and jointly wrong.** "A wait is an event" and "a wait with a deadline is a receive task" produced a timer on an event that cannot carry one. The skill therefore tells the model to read the template end to end, not section by section.
4. **Gate, don't inspect.** Deterministic checks catch what a reader misses and cost nothing. The skill bundles the same gates the application uses.

### 4.5 Where the skill deliberately differs

| Difference | Why |
|---|---|
| **The "narrative" is the user's description**, not a value-chain narrative. | The skill is for any process, not only repository subprocesses. |
| **The process code is optional.** The opening line is `BPMN: <Name> — <clause>`; add a code (e.g. `V01.01`) only if one is supplied or the prompt is for the Process Repository. | A code is meaningful only inside a numbered chain. |
| **Hand-overs name the other process, never a code.** | The template already requires this: a code goes stale the moment a process is inserted or removed. |
| **A standalone process closes with its outcome** and says it hands nothing on. | The template's closing paragraph assumes a "next" subprocess. |
| **Answers are folded into the sections**, not appended as a separate CLARIFICATIONS block. | The application appends because it is patching a prompt the user wrote; the skill is *writing* the prompt, so a finished prompt should read as one coherent instruction. |
| **The refinement stage is interactive and bounded**, and questions come in a reply of their own. | The application's batch generator has no one to ask. |
| **Output is delivered in a fenced block with Assumptions and Checks beside it.** | The application's parser reads a bare prompt; a person reading a chat needs the notes, and the fence keeps them out of the prompt. |
| **A set of judgement calls is settled in the skill** (see below). | A first run found twelve places where the template is silent and a writer had to guess. Guessing differently each time defeats the purpose of a standard. |

The judgement calls the skill settles, so every prompt makes them the same way:

- **Pool or lane.** Someone *inside* the organisation is a lane and work passes by sequence flow (a notice to them is a Send task with no message flow). Someone *outside* it, and every IT system, gets a pool — those are the message flows.
- **The start event.** Plain start event when the process begins internally; message start only when an outside message starts it; timer start for a schedule.
- **Lane order.** Top to bottom in the order the work first reaches each lane; an escalation lane follows the lane that escalates to it.
- **Two branches with the same outcome.** If it is the same element, write it once and have the other branch continue to it by name; if it is genuinely different work, write each, named differently.
- **A decision inside a branch** is an indented gateway with its own branches; it needs its own merge only if two or more of its branches rejoin.
- **Message flows to a system.** One for each task that really exchanges information with it, in the direction it travels.
- **Quotes and wrapping.** Double quotes for every name; a long label may wrap onto an indented continuation line.

### 4.6 What is not covered

- **BPMN only.** The application has master templates for Value Chain, Context, Process Context and ArchiMate prompts too; this skill does not include them.
- **The checks catch three kinds of defect automatically** — branches that never say where they go, boundary events mounted on something that is not an activity, and message flows between two lanes — plus structural problems (sections missing or out of order, a Data Store, a loop-back, "non-interrupting", a lane named as a destination). The template's other rules — whether a wait has a deadline, whether a decision really decides, whether a party should be a pool — need judgement and are covered by the **checklist, by reading**. The application's own checks have the same limit.
- **It does not guarantee the diagram.** A good prompt makes a good diagram *likely*; the layout is the application's, and it is worth a few minutes in the editor before a diagram goes in front of anyone.

### 4.7 How the two are kept from drifting apart

The skill is **built, not written**. A script (`scripts/build-prompt-skill.ts`) reads the hand-written parts of the skill and generates the parts that must match the application:

| Generated | From |
|---|---|
| `references/master-template.md` | `DEFAULT_MD_PROMPT_BPMN` in the application |
| `references/refine-questions.md` (the dimensions list) | `BPMN_REFINE_DIMENSIONS` in the application's Refine step |
| `references/example-prompt.md` | Two prompts read directly from the Process Repository document |
| `scripts/check_prompt.mjs` | `checkPromptShapes.ts` and `checkPromptBranches.ts`, transpiled |
| `VERSION.json` and the version stamps | The newest entry in the template's change history |

A test in the application's suite (`T5275`) fails the build if any committed file differs from what the script would write now, if the template is not verbatim, if the version is wrong, **if the bundled checker disagrees with the application's checkers on any of the repository's BPMN prompts**, or if the skill stops being portable (valid frontmatter, no references to the application's code or paths). Change the template without rebuilding the skill and the build fails — which is the point.

---

## 5. The refinement stage in detail

The refinement stage is the skill's equivalent of the **Refine** button in AI Generate: interview the author for the few facts a BPMN process needs and the description lacks, then fold the answers into the prompt. It is *not* a lesson in BPMN, and it is not a questionnaire: it asks only what would change the drawing.

### What a complete description establishes

The skill checks the description against the same list the application uses:

- participants and pools (the organisations or black-box systems involved);
- roles and lanes (who performs each step — job functions, never individuals);
- the start trigger;
- the key activities, in order;
- decision points and the conditions that branch the flow;
- exception and error handling;
- external systems and the hand-offs between participants;
- the end states — success and failure.

A dimension is a *gap* only if the diagram would change depending on the answer.

### The gaps that cause bad diagrams

Beyond that list, the skill looks specifically for the points where a missing answer makes the *drawn* diagram wrong rather than merely incomplete:

- a decision whose branches are not all stated;
- where each branch goes next (ends, rejoins, or hands over);
- things that happen at the same time (parallel) versus alternatives;
- a wait — and whether it has a **deadline**;
- repetition — which steps repeat, and the condition;
- another party — a **pool or a lane**;
- which system holds each record;
- what goes wrong, and where each exception path ends;
- every way the process ends.

### How it asks

- At most **six** questions, in **one** message, highest-impact first.
- Each has a **label**, the **question**, **single or multiple choice**, and **2–5 options** drawn from your own process (the skill adds *Other* and *Skip — assume it* itself).
- Nothing already answered is asked again, in this round or an earlier one.
- Specific to *this* process. *"Who approves the credit check — the Credit Controller, the Finance Manager, or automatically?"* is a good question; *"Do you want exception handling?"* is not.

**Example of the form:**

> **1. Rejection path** — When the order fails the credit check, what happens?
> (a) It is cancelled and the customer is told · (b) It goes to the Finance Manager for an override · (c) It is held until payment arrives · (d) Other · (e) Skip — assume it

### Folding the answers in, and skipping

Each answer goes **into the section it belongs to** — a rejection path under the gateway in section 4, a named system into sections 1, 2 and 6 — so the finished prompt reads as one instruction, not a prompt plus a patch. A skipped question gets the **most ordinary version** and an entry in the Assumptions list; acceptable assumptions are of the kind *"the Reviewer approves; there is no escalation"*; unacceptable ones invent a system, a time limit or an outside party.

After the draft you may ask for changes; the skill updates, re-checks and delivers again, and offers another refinement round only if your changes opened a new gap.

---

## 6. Customising it — house rules

The template is the fixed standard: it holds the rules that decide whether a diagram can be drawn. **`references/house-rules.md` is where you add your own conventions on top**, and it is the one file you are meant to edit.

**How it works**

- A rule is **active** only while it sits under the **ACTIVE RULES** heading. Anything under **EXAMPLES — NOT ACTIVE** is ignored.
- Rules **refine** the draft — naming, vocabulary, standard participants, level of detail.
- Rules **never override** the template's drawability rules. If one conflicts, the skill follows the template and tells you which rule it could not apply, and why.
- Each rule should be one clear sentence that says what to *do*, not only what to avoid.

**The file ships with no active rules**, and a set of examples to copy from:

| Kind | Example rule |
|---|---|
| Naming | Name every task with a verb and an object in the present tense ("Approve claim"). |
| Naming | Name gateways as a question ending in a question mark. |
| Participants | The main organisation is always called "Company", with one lane per role, named by job function. |
| Systems | Refer to our ERP as "SAP ERP" and our CRM as "Salesforce CRM" in every prompt. |
| Level of detail | Keep to about 25 steps per prompt; split anything longer. |
| Vocabulary | Say "client", never "customer", in labels. |

**Illustrative effect** (not a recorded run). With the active rules *"Say 'client', never 'customer', in labels"* and *"Name every task with a verb and an object"*, a label the draft would have written as `User task "Customer order review"` becomes `User task "Review client order"`.

**Passing it on.** If you give the skill to someone else and want them to follow the same conventions, give them your edited `house-rules.md` with it. When the skill is updated, keep your copy of this file.

---

## 7. The self-check and the bundled checker

### The checklist (always applies)

Before delivering, the skill goes through `references/self-check.md` and fixes what fails. It covers, in groups:

- **Structure** — the opening line; the seven sections in order; the closing paragraph; plain text only.
- **Participants** — exactly one white-box pool; every external party and every system has a black-box pool; nothing invented; inside is a lane, outside is a pool.
- **Flow** — every gateway typed; exclusive conditions complete; every parallel or inclusive split closed by a matching merge; exclusive merges only where branches truly converge; **every branch says where it goes**; no gateway that decides nothing; repetition as a subprocess holding only the repeating steps; waits as events (or receive tasks with a deadline); first and last steps named by name.
- **Boundary events** — attached to activities only; interrupting; exception paths that never return to their host.
- **Connectors and data** — every message flow crosses a pool boundary; every external and system pool in at least one message flow; no Data Store; every data object attached to a task.

### The bundled checker (when code can run)

`scripts/check_prompt.mjs` is a small Node script with no dependencies (Node 18 or later). Save the prompt text (only the part inside the fence) to a file and run:

```
node scripts/check_prompt.mjs prompt.txt
cat prompt.txt | node scripts/check_prompt.mjs
```

It reports, with line numbers:

| Kind | What it means |
|---|---|
| `branch-without-destination` | A gateway branch that never says where it goes. |
| `boundary-on-non-activity` | A boundary event mounted on something that is not a task or subprocess. |
| `message-within-pool` | A message flow whose two ends are lanes of one pool. |
| `opening-line` / `missing-section` / `section-order` | The structure is wrong. |
| `data-store` | A Data Store appears. |
| `loop-back` | A flow back to an earlier element is described. |
| `non-interrupting` | The word appears; every edge-mounted event is interrupting. |
| `destination-not-an-element` | "Continue to the next task", or a lane named as a destination. |

It exits **0** when the prompt is clean and **1** otherwise. The first three kinds are **the application's own checkers**, transpiled; the build's test proves they give identical findings to the application on every BPMN prompt in the Process Repository. The rest are structural checks added for the skill.

**What it cannot judge** is meaning: whether a decision is really a decision, whether a wait has a deadline, whether a party should be a pool. That is the checklist's job, done by reading.

---

## 8. Sample output

### Example 1 — a complete run

This is a real run of the skill, in a test, on a short description. The "user" had no one to answer questions, so the refinement stage lists the questions it *would* have asked and proceeds on assumed answers — which is the one-shot behaviour described in stage 2.

**The input**

> *Process: Staff expense claim approval. An employee submits an expense claim with receipts through the finance portal. The line manager reviews it. If the claim is over $500 the Finance Manager must also approve it. If any approver rejects it, the employee is told why and the claim ends. If approved, Accounts Payable pays the claim into the employee's bank account through the banking system and the employee gets a remittance email. Claims not actioned by the manager within 5 working days are escalated to the manager's manager. The finance portal holds the claim record.*

**The questions it would have asked (stage 2)**

1. **Employee role** — the employee is staff, so inside the organisation: (a) a lane in the company pool, (b) a separate external pool, (c) Other, (d) Skip — assume it.
2. **Rejection notice** — when an approver rejects, is the employee told by (a) the rejecting approver, (b) Accounts Payable, (c) automatically by the portal, (d) Other, (e) Skip.
3. **Escalated outcome** — can the manager's manager (a) approve or reject like the manager, (b) only approve, (c) Other, (d) Skip.
4. **Order of approvals** — for claims over $500, does Finance Manager approval come (a) after the manager's, (b) in parallel, (c) Other, (d) Skip.
5. **Portal's role** — besides holding the claim record, does the portal (a) just store it, (b) also notify approvers, (c) Other, (d) Skip.
6. **Remittance** — is the remittance email sent by (a) Accounts Payable, (b) the banking system, (c) Other, (d) Skip.

**The delivered prompt**

**BPMN diagram prompt.**

```text
BPMN: Staff Expense Claim Approval — an employee submits an expense claim
with receipts through the finance portal, and the process runs until the
claim is paid or rejected.

1. Pools & Lanes

Pool "Organisation" — the employer running the claim process, with lanes for
  Employee, Line Manager, Manager's Manager, Finance Manager and Accounts
  Payable.
Pool "Finance Portal" — the system holding the expense claim record.
Pool "Banking System" — the system through which payments are made to
  employee bank accounts.

2. Pool properties

Pool "Organisation": white-box, single instance.
Pool "Finance Portal": black-box, System = true, single instance.
Pool "Banking System": black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Organisation
2. Finance Portal
3. Banking System

4. Lane contents in flow order (Organisation)

Employee lane:
  Start event "Employee has an expense to claim"
  User task "Submit expense claim with receipts"

Line Manager lane:
  User task "Review expense claim"
  Exclusive gateway "Manager decision?"
  - branch "Approved":
      (continues to exclusive merge gateway "Manager level approved")
  - branch "Rejected":
      Send task "Notify employee of rejection and reason (Line Manager)"
      End event "Claim rejected by Line Manager"

Manager's Manager lane:
  User task "Review escalated expense claim"
  Exclusive gateway "Escalated decision?"
  - branch "Approved":
      (continues to exclusive merge gateway "Manager level approved")
  - branch "Rejected":
      Send task "Notify employee of rejection and reason (Manager's Manager)"
      End event "Claim rejected by Manager's Manager"

Finance Manager lane:
  Exclusive merge gateway "Manager level approved"
  Exclusive gateway "Claim over $500?"
  - branch "Yes — over $500":
      User task "Review claim for Finance approval"
      Exclusive gateway "Finance decision?"
      - branch "Approved":
          (continues to exclusive merge gateway "Claim approved")
      - branch "Rejected":
          Send task "Notify employee of rejection and reason (Finance
            Manager)"
          End event "Claim rejected by Finance Manager"
  - branch "No — $500 or less":
      (continues to exclusive merge gateway "Claim approved")
  Exclusive merge gateway "Claim approved"

Accounts Payable lane:
  Service task "Pay claim into employee bank account"
  Send task "Send remittance email to employee"
  End event "Claim paid and remittance sent — process complete"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on User task "Review expense claim",
  labelled "5 working days without manager action", leading to
  (continues to User task "Review escalated expense claim").

6. Connectors

Sequence flows: work begins in the Employee lane with the start event and the
  submission task, then passes into the Line Manager lane for review. The
  "Approved" branch of "Manager decision?" continues to the exclusive merge
  gateway "Manager level approved" in the Finance Manager lane; the "Rejected"
  branch ends in its own End event. If the manager does not act within 5
  working days the timer boundary event moves the claim to the Manager's
  Manager lane, where the "Approved" branch of "Escalated decision?" also
  continues to "Manager level approved" and the "Rejected" branch ends in its
  own End event. In the Finance Manager lane, "Claim over $500?" sends the
  "Yes" branch through the Finance review, whose "Approved" branch continues
  to the exclusive merge gateway "Claim approved" and whose "Rejected" branch
  ends in its own End event; the "No" branch continues straight to "Claim
  approved". Work then passes to the Accounts Payable lane for payment,
  remittance and the final End event.

Message flows:
  User task "Submit expense claim with receipts" → Finance Portal (expense
    claim and receipts)
  Finance Portal → User task "Review expense claim" (claim record and
    receipts for review)
  Finance Portal → User task "Review escalated expense claim" (claim record
    and receipts for review)
  Finance Portal → User task "Review claim for Finance approval" (claim
    record and receipts for review)
  Service task "Pay claim into employee bank account" → Banking System
    (payment instruction)
  Banking System → Service task "Pay claim into employee bank account"
    (payment confirmation)

7. Data objects

Data Object "Expense Claim" — written by User task "Submit expense claim
  with receipts"; read by User task "Review expense claim", User task
  "Review escalated expense claim" and User task "Review claim for Finance
  approval".
Data Object "Payment Details" — written by Service task "Pay claim into
  employee bank account"; read by Send task "Send remittance email to
  employee".

This process takes an employee's expense claim from submission through line
manager review, escalation when the manager does not act in time, and
Finance Manager approval for claims over $500. It ends either with the claim
rejected and the employee told why, or with the claim paid into the
employee's bank account and a remittance email sent. It hands nothing to
another process.
```

**Assumptions** (as delivered)

- The Employee is a lane in the organisation pool, not an external pool (staff are internal), so there are no message flows to the employee; the rejection notice and remittance email are Send tasks with no message flow.
- The organisation pool is called "Organisation" (no name was given).
- The manager's manager is a lane and can approve or reject, like the manager; an approved escalated claim rejoins the normal flow after manager-level approval.
- Finance Manager approval comes after manager-level approval, and only when the claim is over $500.
- The rejecting approver notifies the employee, so there is one rejection Send task and End event per approver.
- Accounts Payable sends the remittance email; no email system was named, so none is shown.
- The portal only holds the claim record and supplies it to reviewers; no status-update steps were added.
- "Payment Details" is an invented data-object name, used only to give the remittance email something to read.
- The process starts with a plain start event, because nothing external triggers it.

**Checks** (as delivered)

- The bundled checker reported *OK — no issues found* (exit 0).
- By reading: one white-box pool; both systems black-box with System = true; every gateway typed; every branch names a destination; the exclusive merges join two or more branches; the timer is on an activity; no loops, no Data Store, no lane-to-lane message flows; both system pools appear in message flows; the data objects attach to tasks.
- Nothing unresolved.

**Next** — paste the block into Diagramatix AI Generate; adjust, split, or run another refinement round.

> **A note on this run.** It was the first test of the skill, and it exposed gaps — how to treat a shared outcome, whether the employee is a lane or a pool, which start event to use, and others. Those were answered by adding the judgement calls described in section 4.5. A later run of the skill benefits from them; this example is shown as it was produced.

### Example 2 — what the checker says about a defective prompt

A deliberately bad prompt (an opening line that is not `BPMN:`, most sections missing, a branch that goes nowhere, a Data Store, a loop-back) gives:

```
prompt    [missing-section] missing section 2. Pool properties
prompt    [missing-section] missing section 3. Layout
prompt    [missing-section] missing section 5. Edge-mounted (boundary) events
prompt    [missing-section] missing section 6. Connectors
prompt    [missing-section] missing section 7. Data objects
line 1    [opening-line] the prompt must open with one line: "BPMN: <Process Name> — <one clause>."
line 7    [branch-without-destination] gateway "OK?", branch "No" never says where it goes
line 8    [destination-not-an-element] "continue to the next task" names nothing that can be drawn — name the element
line 8    [branch-without-destination] gateway "OK?", branch "Yes" never says where it goes
line 10   [data-store] a Data Store is never used — a system of record is the system's black-box pool
line 11   [loop-back] repetition is a standard-loop subprocess, never a flow back to an earlier element

11 issues found.
```

The same checker reports `OK — no issues found.` for both example prompts the skill ships, which are real prompts from the Process Repository.

### Example 3 — the shape of the rest of the output

Before the prompt, in an interactive session, the skill's reply asks the questions in the form shown in section 5 and then waits. After it, a reply to *"just assume"* produces the block above. A request such as *"make the manager's manager optional"* produces an updated prompt and a fresh **Checks** note; the questions are not asked again.

---

## 9. Using the skill with the Diagramatix Process API

The skill produces a prompt. There are **two ways to turn that prompt into a diagram**: paste it into **AI Generate** inside Diagramatix, or send it to the **Diagramatix Process API**. This section covers the second.

> **What the skill does and does not do today.** The skill writes and checks the prompt. It does **not** itself call the API: no step in it submits anything, and it holds no key. Everything below is how you — or Claude, if you ask it to and its environment allows — use the skill's output with the API. A built-in "Generate it now" stage is a possible future addition (see 9.7).

### 9.1 What the Process API is

The **Diagramatix Process API** takes a description of a business process, or a document describing one, or both, and returns a structured model of it:

- the **pools and lanes**, including external parties and IT systems;
- an **ordered list of activities** with performer, systems touched, inputs and outputs;
- the **decisions** and the **hand-offs** between roles;
- the process as **BPMN 2.0 XML** and as **JSON**, and a **rendered diagram** as PDF or SVG.

The generated diagram is also **created in Diagramatix**, in the key's organisation, and the result carries a **deep link** to open it in the editor.

The contract is self-describing: `GET https://app.diagramatix.com.au/api/public/v1` returns it in machine-readable form and needs no key. **That live contract is the authority**; this section summarises it (the design document it is drawn from is version 2, 1 September 2026).

### 9.2 What you need

- **An API key**, issued by a SuperAdmin from the Partner API Keys screen. A key is bound to **one organisation and one service account**, fixed when it is issued; everything the key does is done as that account, so the diagrams it creates land in that organisation.
- **Treat the key like a password.** Never put it in the skill, in a prompt, or in a file you share. Keep it in an environment variable, for example `DIAGRAMATIX_API_KEY`.
- **Network access** from wherever you run the calls. Some chat environments restrict outbound calls from their code sandbox; Claude Code and your own terminal do not.
- **Confirm the key first**, which costs nothing:

```
curl -H "X-Api-Key: $DIAGRAMATIX_API_KEY" https://app.diagramatix.com.au/api/public/v1/whoami
```

A `200` confirms the key, the header, the transport and the organisation binding. The response also states the current limits and whether the key is retaining request data.

### 9.3 How the skill's output maps onto the API

| API field | What to put there |
|---|---|
| `description` | **The whole prompt text** the skill produced — the text inside the fence, starting with the `BPMN:` line. Up to 100,000 characters. |
| `name` | The process name (it names the resulting diagram). |
| `instructions` | Optional free text appended to the prompt. A good place for a short steer such as "keep to a high level"; it is **not** a substitute for the skill's house rules, which belong in the prompt itself. |
| `options.projectId` | Optional — an existing project to add the diagram to; otherwise a new one is created. |
| `callbackUrl` | Optional — a URL the result is POSTed to when done. Polling needs nothing set up. |

Send an `Idempotency-Key` header: a repeat with the same value returns the original job instead of starting a second run, so a retry after a dropped connection is safe.

**Not yet tested.** The API's description field accepts prose, and the seven-section format is prose with structure. The skill's prompts are designed for AI Generate. **How the API's generation behaves with this exact format has not been trialled**, so run a pilot of three to five processes before relying on it, and compare the diagrams with what AI Generate produces from the same prompt.

### 9.4 A complete exchange, using the skill's output

Save the prompt text to a file, `prompt.txt`.

**With `curl` and `jq` (macOS, Linux, Windows with Git Bash)**

```
# 1. Submit — the prompt becomes the description
jq -Rn --rawfile d prompt.txt '{name:"Staff Expense Claim Approval", description:$d}' |
curl -s -X POST https://app.diagramatix.com.au/api/public/v1/process-map \
  -H "X-Api-Key: $DIAGRAMATIX_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: expense-claim-001" \
  -d @-
# → 202 { "jobId": "cm…", "status": "queued", "pollAfterSeconds": 5 }

# 2. Poll every 5 seconds until status is succeeded or failed
curl -s -H "X-Api-Key: $DIAGRAMATIX_API_KEY" \
  https://app.diagramatix.com.au/api/public/v1/process-map/<jobId>
# → { "status": "running", "stage": "planning", "elapsedMs": 18400 }
# → { "status": "succeeded", "diagram": { "deepLink": "…" }, "warnings": [...], "artifacts": {...} }

# 3. Fetch the BPMN XML
curl -s -H "X-Api-Key: $DIAGRAMATIX_API_KEY" \
  https://app.diagramatix.com.au/api/public/v1/process-map/<jobId>/artifact/diagram.bpmn \
  -o expense-claim.bpmn
```

**With PowerShell (Windows)**

```
$base = "https://app.diagramatix.com.au/api/public/v1"
$h = @{ "X-Api-Key" = $env:DIAGRAMATIX_API_KEY; "Idempotency-Key" = [guid]::NewGuid().ToString() }
$body = @{ name = "Staff Expense Claim Approval"; description = (Get-Content prompt.txt -Raw) } | ConvertTo-Json
$job = Invoke-RestMethod -Method Post -Uri "$base/process-map" -Headers $h -ContentType "application/json" -Body $body

do {
  Start-Sleep -Seconds 5
  $r = Invoke-RestMethod -Uri "$base/process-map/$($job.jobId)" -Headers @{ "X-Api-Key" = $env:DIAGRAMATIX_API_KEY }
  "$($r.status) $($r.stage)"
} while ($r.status -in "queued","running")

$r.diagram.deepLink
$r.warnings
Invoke-RestMethod -Uri $r.artifacts.bpmnXmlUrl -Headers @{ "X-Api-Key" = $env:DIAGRAMATIX_API_KEY } -OutFile expense-claim.bpmn
```

**Asking Claude to do it.** In an environment that can run code and reach the network (Claude Code, for example), after the skill has delivered the prompt you can say:

> *Submit the prompt we just wrote to the Diagramatix Process API using the key in $DIAGRAMATIX_API_KEY, poll until it finishes, save the BPMN to the current folder, and tell me the deep link and any warnings.*

A typical run completes in **30 to 120 seconds**. There is no time-remaining estimate; the response carries measured `elapsedMs` and per-stage timings.

### 9.5 Reading the result

| Part of the result | What to do with it |
|---|---|
| `diagram.deepLink` | Open it: the diagram is in the Diagramatix editor, where it can be corrected, extended, simulated or exported. |
| `warnings` | Advisory, never fatal. **`single_lane`** is the one to act on: the input never said who performs each step, so everything landed in one lane. Add roles (the skill's refinement stage exists to prevent this) and run again. |
| `pools`, `activities`, `decisions`, `handoffs` | The structured model — what to rely on for anything automatic. |
| `artifacts.bpmnXmlUrl` | **BPMN 2.0 XML** — a published standard, and the recommended basis for any scoring or analysis. |
| `artifacts.jsonUrl` | Diagramatix's own structure — convenient, but ours rather than a standard. |
| `artifacts.pdfUrl` / `svgUrl` | A server-side rendering. Accurate for shapes, pools, lanes, labels and connectors; some markers are simplified compared with the editor. |

**What is dependable.** The structure — pools, lanes, ordered activities, decisions, hand-offs, and the BPMN XML — is high-dependability. The **rendered diagram** is logically correct but its *layout* is roughly nine-tenths of the way to what a person would draw: give it a few minutes in the editor before it goes in front of a client.

### 9.6 Limits, costs and errors

- **Limits are provisional**: 30 requests a minute and 50 process maps a day to start, treated as soft in the testing phase; `whoami` reports the current values for your key. Each submission uses AI capacity, so run a deliberate pilot rather than a loop.
- **Every error has one shape**, `{ "error": { "code", "message" }, "ref" }`. Quote the **`ref`** (also in the `X-Diagramatix-Request-Id` header) in any support request.
- **Codes worth knowing:** `invalid_key` and `key_revoked` (401), `rate_limited` (429 — honour `Retry-After`), `quota_exceeded` (403), `ai_plan_failed` (502 — usually a clearer description fixes it), `ai_unavailable` (503 — retry), `worker_lost` (500 — the run was interrupted, submit again).
- **Data handling.** The description is stored on the generated diagram, where it is visible to the organisation and deleted with the diagram. During an agreed **testing phase** the API keeps full request and response bodies, ending on an agreed date or when the key is moved to live; `whoami` says which mode a key is in.

### 9.7 Why the two fit together, and what could come next

The API's own design records a **multi-pass clarifying-questions** feature as *proposed for a later phase*: send a draft, get back questions, and have the answers join the prompt — "a markedly better model at the end of it". **The skill's refinement stage does exactly that on the caller's side, today**, before anything is sent. A well-refined prompt is also the best defence against the API's two known weaknesses: a thin description gives a thin model (the `single_lane` warning), and unstated team names are invented.

A possible next step is a **"Generate it now" stage in the skill**, which would offer — never automatically — to submit the finished prompt, poll, and return the deep link and the BPMN. To stay safe it would:

- read the key only from an environment variable, and never store or print it;
- ask before every call, because each uses AI capacity;
- work only where the environment can reach the network, with the skill continuing to work without it elsewhere;
- return the `warnings` and the deep link, and offer a refinement round if there is a `single_lane` warning.

A hosted connector (an MCP server) could later give the same ability in environments whose sandbox blocks outbound calls. Neither is built; both are recorded here so the option is known.

---

## 10. Keeping the skill current

**The skill is rebuilt from the application, never edited by hand where it must match it.**

| To change… | Do this |
|---|---|
| The master template, the Refine dimensions, the checkers, or the Process Repository examples | Make the change in the application as usual, then run `npx tsx scripts/build-prompt-skill.ts` from the `diagramatix` folder. It rewrites `skills/dist/diagramatix-bpmn-prompt/` and the zip. Commit the result. |
| The skill's own wording (stages, judgement calls, question guidance, README) | Edit the files in `skills/src/diagramatix-bpmn-prompt/`, then rebuild. |
| What you give to others | Send the new `skills/dist/diagramatix-bpmn-prompt.zip`. Recipients replace the folder and **keep their own `house-rules.md`**. |

**What stops it drifting.** The application's test suite (`tests/skills/prompt-skill.test.ts`, reference T5275) fails if the committed skill is not exactly what the build writes now, if the template is not verbatim or its version is wrong, if the bundled checker disagrees with the application's on any repository BPMN prompt, or if the skill stops being a valid portable Agent Skill.

**When the template changes,** its version increases and the change is recorded in the template's history. A skill built from an older version still works, but it is *stale*: it will write prompts to the older rules. The version is stamped in `VERSION.json`, in `SKILL.md` and in the template file, so it is easy to see which a recipient has.

---

## 11. Troubleshooting and questions

**The skill did not start when I described a process.** Name it: *"Use the Diagramatix BPMN prompt skill."* Check it is switched on in your environment's skill settings.

**It asked me nothing and went straight to a draft.** Either the description was complete, or you said to assume. It tells you which, and lists its assumptions.

**The checker did not run.** Your environment cannot run Node.js or code. That is expected in some chat environments; the skill does the same checks by reading and says so under **Checks**.

**The diagram has elements stacked in a column at the left, with no connections.** This is the symptom of a generation whose **connection list was cut off** — the AI produced all the elements but ran out of room before listing the flows between them. It happened on a very large, many-lane prompt: of 142 elements, the connection list stopped partway and the last three lanes had almost no connections. The remedy is on the prompt side: **split a big process** into a main prompt and prompts for its larger parts (the skill offers this above about 40 steps), and keep **lanes as roles, not phases**.

**It would not apply one of my house rules.** The rule conflicted with a drawability rule in the template, and the skill said so under Checks. The template wins by design.

**Can I use the prompt for something other than AI Generate?** Yes: it is plain text in the format of the Process Repository's prompts, so it can also be pasted into a repository Markdown document (add the process code to the opening line and the `**BPMN diagram prompt.**` label with the text in a fence), or sent to the Process API as described in section 9.

**Does it work for other diagram types?** No — BPMN only.

**Where do I report a problem with a prompt it wrote?** Send Paul the prompt, the diagram it produced, and what you expected. If the cause is a gap in the template, the fix is made in the application and the skill is rebuilt, so everyone benefits.

---

## 12. Appendix

### 12.1 Files in the skill

```
diagramatix-bpmn-prompt/
  SKILL.md                      the instructions — this is the skill
  README.md                     installation and use
  VERSION.json                  the template version it was built from
  references/
    master-template.md          the seven-section house template (verbatim, generated)
    refine-questions.md         how to find the gaps and ask (dimensions generated)
    house-rules.md              YOUR conventions — the file to edit
    self-check.md               the checklist run before delivery
    example-prompt.md           two real repository prompts (generated)
  scripts/
    check_prompt.mjs            optional checker; Node 18+, no installs (generated)
```

In the application repository (under `diagramatix/`): the hand-written sources in `skills/src/diagramatix-bpmn-prompt/`; the build in `skills/dist/` (folder and zip); the build script `scripts/build-prompt-skill.ts`; the test `tests/skills/prompt-skill.test.ts`.

### 12.2 Template version history (BPMN)

| Version | Date | What changed |
|---|---|---|
| 1 | 2026-08-26 | The master templates become editable: a built-in house standard per diagram type, plus your own additions. |
| 2 | 2026-08-27 | Stopped asking for a shape the layout strips out again. |
| 3 | 2026-08-27 | Cross-references name the process, never its code. |
| 4 | 2026-08-29 | No Data Stores: a system of record is the black-box IT system pool. |
| 5 | 2026-09-02 | Every gateway branch must say where it goes, in one of four accepted closing forms. |
| 6 | 2026-09-03 | Six defects that were manufacturing diagram bugs: the missing "continues to <element>" form; the wait rule contradicting the boundary-event rule; merges only where two or more branches converge; a parallel split's join made mandatory; exception paths must terminate; the non-interrupting flavour withdrawn. |
| 7 | 2026-09-05 | A loop subprocess holds only the steps that repeat; its condition is about the repeating work, not the outcome. |

### 12.3 Glossary

| Term | Meaning |
|---|---|
| **Agent Skill** | A folder of instructions (and optional scripts and reference files) that an AI assistant loads when a task matches. |
| **Master template** | Diagramatix's house standard for writing a diagram prompt; for BPMN, seven numbered sections. |
| **Built-in / additions** | The read-only house standard shipped with the application / an organisation's own editable conventions. In the skill, `master-template.md` / `house-rules.md`. |
| **Refine** | The AI Generate step that asks clarifying questions and adds the answers to the prompt. |
| **White-box / black-box pool** | A pool whose internal flow is drawn / one drawn as a closed box (an outside party or a system). |
| **Lane** | A role or team *inside* a pool — who performs the work. |
| **Gateway** | A decision or split in the flow: exclusive (one path), parallel (all paths), inclusive (one or more). |
| **Merge** | The gateway where split paths rejoin. |
| **Boundary event** | An event attached to the edge of an activity, such as a timer that fires if the activity takes too long. |
| **Standard-loop subprocess** | The accepted way to write repetition: a subprocess named for its loop condition that holds only the repeating steps. |
| **Process API** | Diagramatix's public service that turns a process description into BPMN XML, JSON, a rendering and a diagram in the editor. |
| **Deep link** | A URL that opens the generated diagram in the Diagramatix editor. |
