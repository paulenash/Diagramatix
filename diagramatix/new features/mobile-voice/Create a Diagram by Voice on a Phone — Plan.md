# Create a Diagram by Voice on a Phone — Plan

**Date:** 28 September 2026 · **Status:** planned, not built · **Decisions:** approved for the initial version (Paul, 28 September: "Your decisions are fine for initial version.")

> Paul, 28 September 2026: "Now I want to plan for using Voice Assist to create a diagram by voice on a mobile phone. What would be involved?"

This plan came from a read-only investigation of the code: three parallel maps (Voice Assist's ties to the desktop editor, the phone surface, and generating by voice), then one planner. File references are to `diagramatix/` as of commit `71da953d`.

---

## 1. The short answer

It is doable, and cheaper than it sounds, because **the engine that turns words into diagram edits already runs outside the desktop editor**. The command pipeline (`parseCommand` → `validateOps` → `applyAssistOps` → the `useDiagram` reducer) needs no browser; the test harness (`headlessDiagram.ts`) already drives it with none. What the phone needs is a screen of its own, plus the *voice session* moved out of the desktop editor so both can share it.

There are two ways to create a diagram by voice, and they should be built in this order:

1. **Describe it, and the AI draws it** (medium effort). Dictate the whole process, or photograph a whiteboard, and get a saved diagram. The server already does nearly all of it (`app/lib/ai/generateDiagramData.ts:80-112`; the Partner worker `app/lib/partner/worker.ts:61-256` already runs generate → save → record usage on the server). It is already inside the locked mobile scope as "slice 3", and the phone's empty diagram already promises it (`MobileDiagramScreen.tsx:245-249`: "Generating from a prompt is coming in the next update").
2. **Voice Assist on the phone, one command at a time** (large effort). "Add task Check invoice after Receive order", see it appear, "undo that". The engine carries over as it is; the live session (microphone loop, numbered "which one?" questions, command router) is welded into `DiagramEditor.tsx:2889-3740` and has to be moved out first.

**Why this order:** a first draft from one dictation is what voice on a phone does best; (1) stays inside decisions already made; and (2) then has something to edit. The extraction (2) needs is the riskiest step and must not hold up (1).

---

## 2. Decisions (approved for the initial version)

| # | Decision | Chosen |
|---|---|---|
| 1 | Lift the rule that the phone never edits a diagram's content (locked 8 August)? | **Yes, for voice only, Expert+.** Touch stays select-only. |
| 2 | Generate on the phone through a **server job** (the phone polls) rather than the planned in-browser one-shot call? | **Yes.** A phone that locks during the 30–120 s wait would otherwise lose a diagram whose tokens are already spent. |
| 3 | Gate phone generation? | **The same as desktop AI** (`allowAi`, attempts) now; wire the feature keys `ai-generate-dictated` / `-image` / `mobile` (read by nothing yet, `registry.ts:33-38,72`) in Feature Availability Phase 2. |
| 4 | Model picker on the phone? | **No** — the default model, as the Partner worker uses. |
| 5 | Diagram view: the simplified phone renderer, or the full editor canvas? | **Simplified first**, with fixes; decide after a real-phone test. |
| 6 | Spoken replies in the first version? | **Off** until stage 8. |
| 7 | A photo plus a spoken correction — which wins? | **The voice.** |

---

## 3. Stages

Each stage ends with something a user can do, and is tested on a **real phone** before the next begins.

### Stage 1 — Generate from speech on the phone (M)

**At the end:** on an empty BPMN diagram, tap **Generate**; dictate, type, or pick a saved prompt; optionally **Tidy** it and answer its questions by voice; get the diagram.

- **Reused:** `startDictation` (`app/lib/dictation/index.ts:98`, with its https guard); the recording path `transcribeAudioBlob` / `refineTranscript` (`audioInput.ts:9,78`; AI Tidy returns `openQuestions`); `appendClarifications` (`app/lib/diagram/clarifications.ts:9`); saved prompts `GET/POST /api/prompts`; `generateDiagramData`; `useAiAllowed` (works in `/m` — the root layout has a SessionProvider); save `PUT /api/diagrams/[id]` with its version check.
- **New:**
  - A phone **prompt sheet** — dictate or type, pick a saved prompt, Tidy, answer questions, Generate — reached from the empty state and a header button.
  - A **server generate-and-save job** with polling, e.g. `POST /api/m/diagrams/[id]/generate`, following the Partner API's job pattern (`app/api/public/v1/process-map/route.ts:7-9`, `maxDuration` 300; Azure cuts requests at about 230 s).
  - **One library function for the "link the prompt and save the result" rules**, today only inside the desktop editor (`DiagramEditor.tsx:1653-1765`: link an unchanged saved prompt or reuse this diagram's auto-named one; keep the plan, `source`, `freeForm`, `fromImage`; `relaxedLayout`; strip the prompt note). Desktop and phone both call it. Copies already drift: the Partner worker writes an `aiGeneration` with no `promptId` (`worker.ts:167-174`).
  - A **`canEdit`** flag on `GET /api/diagrams/[id]` — today only `canReview`, true for editors and reviewers alike, so reviewers would be offered Generate.
  - A **prose dictation mode**: since 25 September live dictation is tuned for commands (`smart_format=false`, `punctuate=false`, `asrParams.ts:125-156`), so dictated prompts arrive unpunctuated — on desktop too.
  - A **one-speaker preamble**: the desktop `TRANSCRIPT_PREAMBLE` is for meetings ("each distinct speaker as a role / lane") and would turn one person into one lane.
- **Risk:** the rule move touches the desktop apply path. **Do not use the one-shot `/api/ai/generate-bpmn`** — it returns no plan (`route.ts:114-120`), so the diagram would lose `aiGeneration.plan` (needed for offline replay).

### Stage 2 — Photograph a whiteboard (S–M)

**At the end:** take a photo of a whiteboard or sketch and get a diagram; the photo is kept ("View source image"), as on desktop.

- **Reused:** the source-image store (`POST /api/diagrams/[id]/source-image`), the BPMN image path.
- **New:** camera input; **resize on the phone to ≤ 2576 px JPEG** (also avoids iPhone HEIC and the raw-versus-base64 10 MB mismatch, `sourceImage.ts:43-45`); whiteboard wording in the prompt; the spoken correction outranks the photo (`planBpmn.ts:603`); Free Form off for photos.

### Stage 3 — "Add a correction" and re-generate (S)

**At the end:** say what's wrong ("the approval happens before payment") and re-generate. Appends to the prompt; warns that the whole diagram, and its review comments, will be replaced.

### Stage 4 — Move the voice session out of the desktop editor (L, desktop only)

**No visible change.** Move the utterance router, the flow handlers and their state, the microphone/fragment loop, and `useAutoSave` (`DiagramEditor.tsx:318-512`) into shared hooks; switch the desktop to them.

- **Risk: the riskiest step.** About 360 lines of carefully ordered logic where many earlier bugs were fixed. **Ship it alone**, prove it on the desktop (the full suite, the voice test sets, the Replay tab), then start stage 5.

### Stage 5 — Voice Assist commands on the phone, Expert+ (M)

**At the end:** tap the mic and say "add task Check invoice after Receive order"; see it; say "undo that"; or type the command instead.

- **Reused:** `useDiagram` (grouped undo, element limit), `applyAssistOps`, the AI fallback `/api/ai/command` (the server builds the diagram summary itself, `route.ts:189`).
- **New:** a phone screen driving `useDiagram`; a **bottom sheet** with a big mic, a live caption, the current question, a 16 px text input and the command list; a blank canvas when the diagram is empty; the view **follows the last edit** instead of re-fitting (`MobileDiagramView.tsx:81-100`); autosave; the element limit and the Voice Assist gate on `/m`; lazy loading; phone wording for the "move the mouse" messages (`applyAssistOps.ts:515,1818`).

### Stage 6 — Numbered picks, tap to select, "this" and "here" (M)

**At the end:** "which one?" questions work on the phone; a tap selects; the last tap stands in for the mouse.

- **Reused:** `badgesOnScreen` (`debugCapture.ts:39-47`), `RenameTarget`.
- **New:** one overlay for badges, divider rulers and the gold flash, given the zoom scale; the same numbers as **large chips in the sheet**, to say or tap; a multi-select toggle; a connector hit-test; a visible marker for the last tap.

### Stage 7 — Hands-free sessions that survive real use (M)

A **wake lock** keeps the screen on; a hidden page stops the mic, runs any buffered command, and shows "tap to resume"; **one Deepgram reconnect** (`index.ts:244-245`); **resample to 16 kHz** (48 kHz PCM is about 350 MB an hour of mobile data; 16 kHz cuts it to a third).

### Stage 8 — Spoken replies (M, desktop too)

Wire the existing but unused `useVoiceAssist` / `speaker.ts` with `/api/ai/speak`; unlock audio in the mic tap (iPhone needs a user gesture); **ignore anything transcribed while a reply plays** and briefly after, so the phone doesn't hear itself.

### Later

The template window as a bottom sheet (M); the real editor canvas on the phone (L), only if the device test says the simplified view can't be read.

---

## 4. The hard problems, and how each is handled

- **Reading the diagram as it grows.** The phone draws a simplified version (`templateThumbnail.ts`): pool/lane headers a fixed 18 px (`:193`); connector labels at the line's midpoint, not where they're stored (`:282-287`); no task markers (`:202-205`); labels capped at 3 lines (`:97,127`). Labels are **not** cut at 16 characters (`fullLabels`, `MobileDiagramView.tsx:39`). First version: follow the last edit, a **Fit** button, suggest landscape, add task markers.
- **Numbered picks on a small screen.** Badges keep their size at any zoom, and the same numbers appear as large chips in the sheet.
- **"This", "these", "here" without a mouse.** A tap selects; the last tap stands in for the pointer, with a marker; a toggle selects several; a command that needs a selection says so in phone words.
- **Listening continuously.** Tap to start; "stop", a tap, or 2 minutes of silence ends it. Wake lock; a hidden page stops the mic. iPhone has no browser speech engine, so it needs Deepgram (as the app already does). The keyboard's own dictation key is a free fallback, because typed text takes the same path (`DiagramEditor.tsx:6674`).
- **Spoken replies heard as commands.** Off in the first version; when on, transcripts during playback are ignored.
- **Autosave and conflicts.** The shared autosave: 1.5 s debounce, three-way merge on a 409, a history row per save (`api/diagrams/[id]/route.ts:252+`). The phone's current Save **collapses all review comments** (`MobileDiagramScreen.tsx:179-199`) — voice autosave must not.
- **Waiting for the AI.** A server job the phone polls, with stage-by-stage progress (the Partner pattern), so a locked phone loses nothing.
- **Who can use it.** Generate: `allowAi` and attempts. Dictation token: `allowVoiceAi` (fails closed). Voice Assist: `voice-assist`, Expert+ — note that *missing* tier rows default to "available" (`availability.ts:76-88`); the prod rows were not checked.

---

## 5. Cost and time

- **Per generated diagram:** about **$0.12–0.20**, plus about **$0.03** with a photo — from the `pricing.ts` constants, **not measured**. Opus 5 thinks adaptively by default (no thinking/effort setting is sent), which may push time and cost up; the real figures are in `AiInvocation`.
- **Time:** the code disagrees — the consoles say 15–30 s; the Partner route says 30–120 s. Azure cuts requests at about 230 s. The phone needs a progress display either way.
- **Live transcription:** Deepgram, **$0.0059 a minute**.
- **Voice Assist commands:** grammar-first, so nothing beyond the audio; the AI fallback uses Haiku.

---

## 6. Reused unchanged — why this is cheaper than it looks

- The command pipeline: `parseCommand`, `validateOps`, `applyAssistOps`, the pure helpers in `app/lib/assist`, the `useDiagram` reducer with grouped undo.
- The AI fallback `/api/ai/command`.
- Dictation: `startDictation`, `probeDictation`, the token route, keyterms.
- Generation: `generateDiagramData`, plan / apply-layout, transcribe, Tidy, clarifications, `/api/prompts`, source-image storage.
- Saving: `PUT /api/diagrams/[id]` with its version check.
- The `/m` shell: phone redirect, pan/pinch viewer, tap hit-test (`MobileDiagramScreen.tsx:104-126`), the review-overlay pattern.
- The headless harness — phone command sequences can be tested with no phone.

---

## 7. Found in passing — a server gap, not phone-specific

`PUT /api/diagrams/[id]` lets an **assigned reviewer** save the whole diagram's `data` (by design, because review comments travel inside it — `app/api/diagrams/[id]/route.ts` ~104-125), but the server **does not check that only review comments changed**. A crafted request from a reviewer could rewrite the diagram. Recommended as a separate fix: accept from a reviewer only changes to review-comment elements and their links.

---

## 8. Not verified

- Nothing has been tried on an **iPhone**; voice is confirmed only on Samsung/Chrome.
- iPhone behaviour on screen lock or an incoming call; wake-lock support; whether an open Deepgram socket outlives the 10-minute token (`token/route.ts:15`); whether the AudioContext is still created inside the tap (`index.ts:179-181`); whether iOS plays spoken replies through the earpiece.
- The prod feature-availability rows and the `ai.generate.model` setting.
- Real generation times, token counts and bundle size.

---

## 9. Testing, per stage

- **Every stage:** the full suite; a real Android phone and a real iPhone; the relevant voice test set in Voice Assist Test.
- **Stage 1:** a server test of the generate-and-save job (a locked phone mid-generation still gets its diagram); the shared "link and save" function tested once for both callers; reviewers are not offered Generate.
- **Stage 4:** the desktop voice test sets and the Replay tab score exactly as before the move.
- **Stages 5–6:** phone command sequences through the headless harness; a device test of legibility before deciding on the full canvas.
- **Stage 7:** a 10-minute hands-free session on each phone, including a screen lock and resume.
