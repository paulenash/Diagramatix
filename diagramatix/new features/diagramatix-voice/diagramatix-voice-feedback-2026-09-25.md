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

## 6. Who gets it, the SuperAdmin tile, and the cost

Paul, 2026-09-25: "Include a SuperAdmin tile to manage text to speech usage, and
include it in the AI costs. In particular SuperAdmin must have control to turn it on
for selected Users. Default is on for SuperAdmin users, off for everyone else."

### Who gets it: built from what already exists

- A new feature key, **`voice-feedback`**, in `app/lib/features/registry.ts`, set to
  **off at every subscription level**. That makes it off for everyone by default, and
  it fails closed like `voice-assist`.
- **SuperAdmins have it automatically.** `app/lib/features/availability.ts` already
  gives SuperAdmins every feature, so nothing new is needed for "on for SuperAdmin".
- **Turning it on for a selected user** uses the existing per-user override,
  `User.featureOverrides`, written by `app/api/admin/users/[id]/features/route.ts`.
  The tile is a focused front end for that one key. No new permission model.
- The speech route checks the same state on every request, so switching a user off
  takes effect on their next sentence, not their next login.
- The level rows go to production as an **idempotent SQL file for the Database tile**,
  proven on `diagramatix_test` first, never a script run against production.

### The SuperAdmin tile: "Text to Speech"

A new tile on the SuperAdmin grid, at `/dashboard/admin/text-to-speech`, with four
parts:

1. **Master switch.** An `AppSetting` (`tts.enabled`, on by default). Off means nobody
   hears the Deepgram voice, SuperAdmins included. It is the brake if costs or quality
   go wrong. The route returns 503, and the browser stays silent rather than falling
   back to its own voice, so switching it off is never mistaken for a fault.
2. **Who can hear it.** Every SuperAdmin is listed as "on (SuperAdmin)" and can't be
   switched off here. Below them, the users switched on individually, each with an
   off switch, and a search by name or email to add another.
3. **Usage.** For this month and the last 30 days:
   - characters spoken and estimated cost, by user and by use (V1 to V6);
   - how much came from the cache, which is the money not spent.
4. **Voice.** The default voice, chosen by ear in the side-by-side comparison below.

### Side-by-side comparison (Paul, 2026-09-25)

A panel on the tile for hearing two voices say **the same sentence**, one after the
other, before choosing. SuperAdmin only.

- **What can be compared:** any two of the Aura-2 voices (Theia, Hyperion, Pandora,
  Draco) and the Flux TTS voices (for example Jack and Rufus, the British ones; Flux has
  no Australian voice). Flux is included so the question "is Flux worth 1.5 times the
  price?" is answered by listening, not by reading its brochure.
- **What they say:** a ready-made set of real Diagramatix lines, and a box to type your
  own. The ready-made set covers the hard cases: a picker question ("which Review? say
  a number, one or two, or cancel"), a refusal with names in it ("no room above
  Underwriters for a lane called Quality Assurance"), element names ending in digits
  ("rename Task 1 to Review Email"), a code ("attach R-012"), and a paragraph of a Staff
  Narrative.
- **How:** play A, play B, or play both one after the other. An optional **blind**
  mode hides which is which until you pick the one you prefer.
- **What it shows beside each:** time to first sound (the delay a user would feel),
  total length, characters, and what that sentence cost.
- **Choosing:** "use this voice" sets the default from the panel.

**Flux is a different connection.** It is a live streaming session
(`wss://api.deepgram.com/v2/speak`) built for voice agents, not a one-off request. For
the comparison only, the server opens a short Flux session, sends the one sentence,
collects the audio and returns it like an Aura-2 reply, so the panel handles both the
same way. That path lives in the same `speakParams.ts`, is SuperAdmin-only, and is
**not** used for users' replies unless Flux is chosen later. Comparison plays are
recorded in the usage figures under their own use (`voice.speak.compare`), so testing
never hides in the real numbers.

### In the AI costs

Speech is billed **per character**, not per token or minute, so it gets its own usage
record, the same way listening does:

- A new **`SpeechSession`** row per spoken reply, mirroring `DictationSession`. It holds
  the user, organisation, voice, use (V1 to V6), character count, and whether it came
  from the cache (a cached reply costs nothing and is recorded as such).
- An **`AiInvocation`** row as well, as `app/api/ai/dictation/usage/route.ts` does for
  listening (provider `deepgram-tts`, model = the voice id, invocation point
  `voice.speak.<use>`). Speech then appears in the **AI Usage** report's by-provider,
  by-model, by-user and by-organisation breakdowns, and in its totals.
- **Price:** `DEEPGRAM_TTS_USD_PER_1K_CHARS = 0.030` in `app/lib/ai/pricing.ts`,
  editable in the AI Usage rate catalog as a **per-1,000-characters** row. The catalog
  follows the 25 September fix: a row that only copies the default is never stored, so
  a later price change in `pricing.ts` is not silently shadowed.
- The Voice Assist **Cost** button includes speech alongside listening.

---

## 7. Slices

1. **Foundation.**
   - The route, the parameters, the speaker, usage recording and pricing.
   - The `voice-feedback` key, off at every level, with the production SQL file.
   - The **Text to Speech** SuperAdmin tile: master switch, who can hear it, usage,
     and the side-by-side comparison of the Aura-2 and Flux voices.
   - Speech in the **AI Usage** report and the Cost button.
2. **V1.** Voice Assist questions and refusals spoken, with the microphone gate,
   barge-in and the how-much-to-say setting.
3. **V2.** Animate narration: a switch in the Animate controls, with the pace waiting
   for each sentence to finish.
4. **V3.** "Read this process" on the Staff Narrative.
5. **V4.** Screencast script to voice-over.
6. **V5 and V6.** Mobile and help.

---

## 8. How we will know it works

### Automated

- `spokenText` tests: quotes, arrows, ids and each how-much-to-say level.
- A guard that no `/v1/speak` string is built outside `speakParams.ts`.
- **Who can hear it:**
  - an ordinary user gets 403 from the speech route;
  - a SuperAdmin gets audio with no override;
  - the same ordinary user gets audio once the tile switches them on, and 403 again
    once it switches them off;
  - with the master switch off, everyone gets 503, SuperAdmins included.
- **Comparison:** the Flux path answers SuperAdmins only (403 for anyone else), is
  never reached by an ordinary reply, and records its plays as `voice.speak.compare`;
  blind mode does not reveal the voice names until a pick is made.
- Route tests: 413 over 2,000 characters, and exactly one `SpeechSession` and one
  `AiInvocation` row per reply (cached replies recorded as cached, at no cost).
- **Cost:** the AI Usage totals include speech at the catalog rate; a catalog row equal
  to the default is not stored.
- Speaker tests with a fake audio element: queueing, `stop()`, and the speaking flag.

### By hand

- On speakers, not headphones, open a diagram with two tasks and say "delete the
  task". You should hear "which task? say a number…". Say "one": the right task goes,
  and the microphone did not transcribe the voice.
- Say "stop" halfway through a spoken reply. The voice stops at once.
- Re-run the recorded corpus on the Replay tab with spoken replies on. It must score
  the same as with them off.
- In the tile, switch on one test user, sign in as them and hear a reply; switch them
  off and hear nothing on the next command. Check the characters appear against them
  in the tile and in AI Usage.

---

## 9. Decisions for Paul

**Decided 2026-09-25:** who gets it. On for SuperAdmins, off for everyone else, and a
SuperAdmin switches it on for selected users from the Text to Speech tile (section 6).
This replaces the earlier question about tiers.

Still open:

1. **Default voice:** Theia (Australian, feminine) or Hyperion (Australian, masculine)?
   The side-by-side comparison on the tile lets you hear both before choosing.
2. **Default "how much to say":** questions and problems (recommended), or questions
   only?
3. **A monthly limit per user:** none (recommended while it is SuperAdmin-granted), or
   a character cap set on the tile?
4. **Flux TTS:** worth 1.5 times the price of Aura-2? Recommended answer for now: no.
   Flux has no Australian voice, and it is built for live voice-agent sessions, while
   five of our six uses are one-off reads. Its interruption tracking could help Voice
   Assist replies (V1) later. Decide by ear, in the side-by-side comparison.
