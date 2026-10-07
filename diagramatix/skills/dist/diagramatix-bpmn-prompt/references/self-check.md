# Self-check — run before you deliver

A prompt that asks for a shape BPMN does not allow is drawn faithfully and wrongly: no layout or AI cleverness downstream can repair an impossible instruction. These checks catch that before the prompt is used. Go through every item; fix what fails; then say in the Checks note what passed and what could not be resolved.

## Structure
- [ ] Opens with one unnumbered line: `BPMN: <Process Name> — <one clause>.`
- [ ] Has the seven numbered sections, in this order, each with its heading: **1. Pools & Lanes · 2. Pool properties · 3. Layout · 4. Lane contents in flow order (<pool>) · 5. Edge-mounted (boundary) events · 6. Connectors · 7. Data objects**.
- [ ] Ends with a short paragraph (three or four lines) saying what the process achieves and what it hands to the next.
- [ ] Plain text only: no markdown headings, no bold, no bullet characters other than `-`; lines wrapped at about 78 characters; no preamble or sign-off inside the fence.

## Participants
- [ ] Exactly **one** white-box pool: the organisation whose process this is, with its lanes listed top to bottom.
- [ ] Every external party and every IT system has its own black-box pool, and IT system pools say `System = true`.
- [ ] No system or party was invented: each appears in what the user supplied or answered.
- [ ] A role inside the organisation is a lane, not a pool; a party outside it is a pool, not a lane.

## Flow
- [ ] Every **gateway** says which kind it is — exclusive, parallel or inclusive — on its own line.
- [ ] Every **exclusive** gateway's conditions cover every case, with an "otherwise" branch where needed.
- [ ] Every **parallel** or **inclusive** split is closed by a matching **merge** of the same kind. This is mandatory.
- [ ] An **exclusive merge** appears only where two or more branches actually come back together. A merge with one flow in and one flow out is forbidden.
- [ ] **Every branch says where it goes**, in one of the accepted forms — and a destination is always an **element**, never a lane and never "the next task":
  - the gateway is followed by its merge line; **or** each branch ends with one of
  - `(continues to exclusive merge gateway "<name>")`
  - `(continues to <BPMN type> "<name>")`
  - `End event "<name>"`
  - `(loop repeats)` — inside a standard-loop subprocess
  - `(exits subprocess)` — leaves the subprocess at its end
- [ ] No gateway has every branch going to the same place (it decides nothing).
- [ ] **Repetition is a subprocess**: `Expanded Subprocess "<loop condition>" (standard loop) containing, in order: …`. No "then back to <task>", no sequence flow returning to an earlier element, no gateway testing a loop condition.
- [ ] A loop holds **only the steps that repeat** — not the End event, not the task that records the outcome, not a gateway that routes the main flow.
- [ ] A **wait** is an intermediate catch event (timer, message, signal, conditional) — unless it has a **deadline**, in which case it is a **Receive task** with a timer boundary event on it. Never a task called "Wait for …".
- [ ] The first step names where the work **arrives from** and the last names where it **goes next**, by name, never by code.

## Boundary events (section 5)
- [ ] Each is attached to an **activity** (a task or an Expanded Subprocess) — never to an event, a gateway, or another boundary event.
- [ ] A boundary event on a step **inside an Expanded Subprocess** (a loop included) leads only to another step **inside that same subprocess** — never to the main flow, an End event outside, or a reminder outside it. If the path has to leave, the event is mounted on **the Expanded Subprocess itself**, and a path that returns comes back to the subprocess by name, never to a step inside it.
- [ ] Each is **interrupting**; the word "non-interrupting" does not appear.
- [ ] Each exception path says where it goes (same forms as a branch) and **never returns to the activity it left**; it ends in its own End event or rejoins the flow after that activity.
- [ ] Written "None." if there are none — none were invented.

## Connectors and data (sections 6 and 7)
- [ ] Every **message flow crosses a pool boundary**: it names a pool at one end or both. Never one lane of a pool to another lane of the same pool (that is a sequence flow).
- [ ] Every external pool and every system pool appears in at least one message flow, in the direction the information really travels.
- [ ] **No Data Store** anywhere. A system of record is the system's pool.
- [ ] Every Data Object names at least one **task** it attaches to — never a pool or a lane.

## The bundled checker (optional)

`scripts/check_prompt.mjs` is a small, dependency-free Node script. It runs three of the checks above exactly as Diagramatix itself runs them, plus a few structural ones:

```
node scripts/check_prompt.mjs prompt.txt        # a saved file
cat prompt.txt | node scripts/check_prompt.mjs  # or from standard input
```

It reports: branches that never say where they go; boundary events mounted on something that is not an activity; boundary events on a step inside a subprocess whose path leads out of it; message flows between two lanes; missing or misordered sections; a Data Store; a loop-back phrase; "non-interrupting". It exits 0 when the prompt is clean and 1 otherwise. Paste only the prompt text (the part inside the fence) into the file.

It cannot judge meaning — whether a decision is really a decision, whether a wait has a deadline, whether a party should be a pool. The checklist above covers those; do them by reading.
