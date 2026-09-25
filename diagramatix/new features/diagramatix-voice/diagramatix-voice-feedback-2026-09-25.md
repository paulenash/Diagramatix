# Diagramatix Voice — where a spoken voice would earn its place

**Date:** 2026-09-25 · **Status:** investigation and plan — nothing built · **Asked by:** Paul

> "Perhaps Diagramatix should have a Deepgram Speak voice!! Investigate where you
> believe this could be used effectively to enhance the product."

---

## 1. The short answer

Yes, and it should start with **Voice Assist's questions**, not its successes.

Voice Assist is half a conversation today. The user speaks, and Diagramatix answers
only in a log at the edge of the screen, while the user's eyes are on the canvas.
Some of those answers are questions that need an answer before anything happens:

- "which “Review”? say a number (1–2), or “cancel”"
- "clear the whole diagram (14 elements)? — say “yes” to confirm"
- "no room above Underwriters for a lane called “Quality Assurance” — …"

Those are exactly the lines a person needs to **hear**. Reading them means looking
away from what they are working on, which is the thing voice was supposed to remove.

Nothing in the app speaks today. The 21 September Voice Assist plan listed spoken
read-back as item **C10**, "browser `speechSynthesis`", rated small effort and low
value. With a proper voice it becomes more valuable, and it is still cheap.

---

## 2. Facts, checked 2026-09-25

From Deepgram's documentation and pricing page. **Check them again against the live
API before building.** On 25 September a new Claude model was missing from both my
training and the docs I had, and only the API knew about it.

| | |
|---|---|
| Endpoint | `POST https://api.deepgram.com/v1/speak?model=<id>` |
| Auth | `Authorization: Token <DEEPGRAM_API_KEY>`, the same key and account as the speech-to-text we already use |
| Body | `{"text": "…"}` |
| Streaming | Audio streams back; playback can start on the first byte |
| Limit | **2,000 characters per request** (Aura-1 and Aura-2) |
| Australian voices | `aura-2-theia-en` (feminine: "expressive, polite, sincere"), `aura-2-hyperion-en` (masculine: "caring, warm, empathetic") |
| British voices | `aura-2-pandora-en` (feminine), `aura-2-draco-en` (masculine) |
| Price (pay as you go) | **Aura-2 $0.030 per 1,000 characters**; Aura-1 $0.015; "Flux TTS" $0.045 (on the pricing page but not yet in the model docs, so verify it before relying on it) |

For comparison, the speech-to-text we already pay for is about $0.006 a minute.

---

## 3. What it would cost, in plain numbers

- A spoken Voice Assist reply is about 60 characters, so about **$0.0018**. A hundred
  commands cost about **18 cents**, the same order as the listening we already pay for.
- Fixed prompts ("say a number, or cancel") are generated once and cached, so after
  the first time they cost nothing.
- Reading a whole process aloud (a Staff Narrative of about 3,000 characters) costs
  about **9 cents** the first time, and nothing afterwards for the same text and voice.

Cost is not the constraint. Noise and echo are (section 5).

---

## 4. Where it earns its place, ranked

| # | Where | What it says | Why it matters | Size |
|---|---|---|---|---|
| **V1** | **Voice Assist replies** | Every **question** (the numbered picker, the "say yes" confirmation, the rename, message and template flows) and every **refusal** ("no room above Underwriters…"). Successes only if the user asks for everything. | Closes the loop. The user keeps their eyes on the canvas. It is C10, upgraded from the browser's voice to a real one. | M |
| **V2** | **Narrated walkthrough in Animate** | Each element's name as it appears: "Customer submits claim. Check coverage. Claim approved?…" | Animate already steps through the process in order, at a set pace. With a voice it becomes a guided tour for a stakeholder who doesn't read BPMN. | M |
| **V3** | **"Read this process to me"** | The existing first-person Staff Narrative, sentence by sentence. | The prose already exists. Useful for accessibility, and for reviewing a process away from the desk. | S |
| **V4** | **Screencast voice-over** (SuperAdmin) | A typed script, spoken into the recording. | Demo and training videos without a live presenter, in one consistent voice. | M |
| **V5** | **Mobile `/m`** | Review comments and SOP steps read aloud. | For people on the floor, not at a desk. A cloud voice sounds the same on every phone. | S |
| **V6** | **Help** | A "speak" button on bubble help and User Guide sections. | Accessibility. Cheap once cached. | S |

**Not recommended:**
- Speaking every success line by default. "Added a task after Review Claim" is
  obvious from the canvas and becomes noise within a minute.
- Spoken notifications.
- Anything on the air-gapped on-prem edition. It has no cloud access, so it falls back
  to the browser's own voice, or none.

---

## 5. Design — one place for each rule

### The pieces

- **`app/lib/voice/speakParams.ts`**: the model, audio format (mp3), the voice list and
  the default voice. It is the **only** place a `/v1/speak` parameter is built. This
  mirrors `app/lib/dictation/asrParams.ts` and its guard, T4731.
- **`app/api/ai/speak/route.ts`**: takes `{ text, voice, purpose }`, calls Deepgram and
  streams `audio/mpeg` back. The key never leaves the server.
  - Gated by the `allowVoiceAi` org policy (as `app/api/ai/dictation/token/route.ts`
    is) and by a new feature key, `voice-feedback`, which fails closed like
    `voice-assist`.
  - Returns 413 over 2,000 characters; the client splits longer text by sentence.
  - Records usage through the existing `aiInvocation` path (provider
    `deepgram-tts`, character count). A new `DEEPGRAM_TTS_USD_PER_1K_CHARS` in
    `app/lib/ai/pricing.ts` prices it, so the Voice Assist **Cost** button and the AI
    Usage report both include it.
- **`app/lib/voice/spokenText.ts`** (pure, tested): turns a log line into something
  worth hearing.
  - Drops the curly quotes, reads "→" as "to", and never speaks an element id
    (`looksLikeElementId`).
  - Applies the **how-much-to-say** setting: Off / Questions only / Questions and
    problems (the default) / Everything.
- **`app/lib/voice/speaker.ts`** (browser): one queue and one voice at a time.
  - `stop()` handles barge-in, and `onSpeakingChange` drives the microphone gate.
  - Audio is cached by voice and text in IndexedDB.
  - Falls back to the browser's own voice (`speechSynthesis`) when the route is
    unavailable.

### Echo is the real risk

The microphone will hear the voice. Three layers of protection:

1. Ask the browser for echo cancellation explicitly (`echoCancellation: true` in
   `startDictation`, `app/lib/dictation/index.ts`). Today it takes the browser's
   default.
2. **While Diagramatix is speaking, ignore what the microphone hears**, except the
   stop and cancel words (`app/lib/assist/stopWords.ts`). The place for this is the
   top of the `onText` callback in the editor's `toggleAbraListening`, before anything
   else sees the transcript. The fragment buffer (`fragmentBuffer.ts`) must not stitch
   anything heard during playback onto a command.
3. **Barge-in.** "Stop", "cancel", or the user starting a new command cuts the voice
   off at once. Nobody should have to wait for a sentence to finish before they can
   correct it.

### Preferences

Kept per browser, using the fail-closed pattern of `app/lib/assist/voiceDebug.ts` (off
unless switched on):
- a **Speak replies** switch, a **voice** picker and a **how much to say** setting in
  the Voice Assist bar;
- also sayable, like gold flashing: "turn on spoken replies".

---

## 6. Slices

1. **Foundation.** The route, the parameters, the speaker, usage and pricing, and a
   "hear the voices" panel on the SuperAdmin **Test Voice Assist** page to choose
   between Theia, Hyperion, Pandora and Draco.
2. **V1.** Voice Assist questions and refusals spoken, with the microphone gate,
   barge-in and the how-much-to-say setting.
3. **V2.** Animate narration: a switch in the Animate controls, with the pace waiting
   for each sentence to finish.
4. **V3.** "Read this process" on the Staff Narrative.
5. **V4.** Screencast script to voice-over.
6. **V5 and V6.** Mobile and help.

---

## 7. How we will know it works

**Automated**
- `spokenText` tests: quotes, arrows, ids and each how-much-to-say level.
- A guard that no `/v1/speak` string is built outside `speakParams.ts`.
- Route tests: 403 without the org policy or feature, 413 over the limit, usage
  recorded.
- Speaker tests with a fake audio element: queueing, `stop()`, and the speaking flag.

**By hand**
- On speakers, not headphones, open a diagram with two tasks and say "delete the
  task". You should hear "which task? say a number…". Say "one": the right task goes,
  and the microphone did not transcribe the voice.
- Say "stop" halfway through a spoken reply. The voice stops at once.
- Re-run the recorded corpus on the Replay tab with spoken replies on. It must score
  the same as with them off.

---

## 8. Decisions for Paul

1. **Default voice:** Theia (Australian, feminine) or Hyperion (Australian, masculine)?
   The voices panel in slice 1 lets you hear both before choosing.
2. **Who gets it:** Expert and above, like Voice Assist? Or wider for the read-aloud
   features (V2, V3), which don't need a microphone?
3. **Default "how much to say":** questions and problems (recommended), or questions
   only?
4. **Flux TTS:** worth 1.5 times the price of Aura-2, once we've confirmed it's
   available and heard it?
