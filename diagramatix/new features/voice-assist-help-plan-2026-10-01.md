# Voice Assist Help — plan

Written for: Paul (product owner) — to review before anything is built. Nothing has been changed in the code; this follows a read-only investigation (2026-10-01). On approval it is saved as `diagramatix/new features/voice-assist-help-plan-2026-10-01.md` (plus the `.gitignore` allow-list lines the other new-features documents use), committed and pushed — documentation only.

## Context

Paul wants a **new Voice Assist Help, completely separate from the existing Bubble Help** (the canvas cloud that is currently switched off). When Voice Assist is on it shows what he can say *next*, word by word:

1. First, the first words of every command (add, align, assign, connect, convert, delete, insert, move, make, nudge, put, rename, … — plus the few extra that exist only when Assist ghost suggestions are showing).
2. He says one; the list becomes the words that can follow it.
3. And so on until the command is complete.

Names and labels are shown as **variables**, not real names: `<existing_element_name>`, `<existing_label_name>`, `<new_element_name>`, `<new_label_name>`. Optional words are shown in `[ ]`. A SuperAdmin tile defines these conventions and the next-word lists, and lets the admin **type or speak** a command and watch the help work. The idea should also make parsing more reliable.

### Decisions already taken (Paul, 2026-10-01)

| Question | Decision |
|---|---|
| Where it appears | A floating panel by the Assist bar (the "What you can say" card pattern), not a canvas cloud |
| Relation to the parser | A **lens first**: the tree drives the help and position-aware mis-hear repair; the existing parser keeps acting on commands. A **consistency report** in the tile shows where tree and parser disagree |
| Who edits the tree | SuperAdmin, in the tile, stored in the database over a code default, with Reset |
| Recogniser hints | **None in v1.** Display and parser only (boosting has caused mis-hears before: "ten" for "turn"; `COMMAND_KEYWORDS` is deliberately empty) |

## What I found (why the design looks like this)

- **The parser cannot be read as a grammar.** `parseCommand` (`app/lib/assist/commandGrammar.ts`) is ~50 hand-written, order-sensitive regexes with greedy guards; it never sees the diagram and has 51 ops. There is no table of first words or next words anywhere. What *is* shared data: `commandVerbs.ts` (verbs), `containerWords.ts`, `placeWords.ts`, `SYMBOL_SYNONYMS` (`ops.ts`), `elementSubtypes`, `refKinds.ts`, `spokenNumber.ts`. So the next-word tree must be **authored**, reusing those lists for its vocabularies — never a second copy.
- **There are strong guards to keep an authored tree honest:** the catalog card test (T4395, every example must parse), the generator round trip (T4727, 600 cases), the frozen answer key `catalogCorpus.expected.json`, and `commandScore.ts` which names the layer that failed.
- **No word-by-word state exists today.** The parser sees the whole sentence once. The only "what can come next" logic is `incompleteCommand.ts` (a regex per verb that decides whether to wait for more). That is where a tree helps parsing most.
- **Interim words are available live** (`voiceInterim` from the hook), so the help can follow each word as it is recognised. The recogniser's vocabulary is fixed when the socket opens, so per-step hints are out (decision above).
- **Guided flows already know their next words** (`renameFlow`, `messageFlow`, `pickFlow`, `dividerFlow`, `templateFlow` in `useVoiceSession.ts`); the panel can show their sub-grammars when one is open ("`<number>` [`<new_label_name>`] | done", "`<number>` up|down [`<distance>`] | done").
- **The existing Bubble Help is separate in every layer** (global `AppSetting` `bubbleHelp.enabled`, per-user localStorage, `BubbleHelp` table, canvas SVG cloud), so nothing here touches it.
- **Admin tile precedent:** tiles are one array (`ADMIN_TILES` in `admin/AdminClient.tsx`); Text to Speech is the model for a DB-held setting with a code default (`parseTtsSettings` + `AppSetting` upserts). The existing Voice Assist test page is a generated-corpus harness with **no** type-a-command box and no live mic, so the tile's "type or speak" panel is new (it reuses `startDictation` and `parseCommand`).
- **No schema change is needed:** `AppSetting` (string value) holds the override, so no `PRODUCT_VERSION` bump and no `prisma db push`.

## The notation (what the tile defines)

**Command patterns** — one per line, grouped by verb, in a small notation the admin can read and edit:

```
rename {type_words}
rename <existing_element_name> to <new_element_name>
rename <existing_label_name> to <new_label_name>
rename selected [connector] [to] <new_label_name>
move <existing_element_name> [<number> {step_words}] {directions}
```

- `word` literal · `a|b` alternatives · `[x]` optional (shown in `[ ]` in the help) · `<slot>` a variable · `{list}` a named word list (my extension, so `<…>` stays for variables only).
- **Slot conventions (the tile's first table; Paul's wording):**
  - `<existing_element_name>` — the name of an activity (task, collapsed subprocess, expanded subprocess), pool, lane or sublane already on the diagram.
  - `<existing_label_name>` — the label of an event, message, connector, data object, data store or gateway already on the diagram.
  - `<new_element_name>` / `<new_label_name>` — what the user is about to name an element / label (free dictated text; ends the command).
  - Further conventions needed (to be confirmed in the tile): `<number>`, `<distance>` ("100 pixels", "2 tasks", "a bit"), `<position>` (here/there/after X).
  - **`<target>` — pointing instead of naming (added after Paul's question, 2026-10-01).** Most commands accept "this" where they accept a name, so every pattern that takes an `<existing_element_name>` or `<existing_label_name>` also accepts `<target>`: `this` · `that` · `these` · `those` · `it` · `selected [kind]` (e.g. "the selected task") · `the one under the cursor`. They are shown as one grouped item, e.g. after "rename": `… · <existing_element_name> · <existing_label_name> · <target>`. The tile defines which words belong to `<target>` (taken from `resolveRef.ts`: `SELECTION_ALL`, `SELECTION_KIND`, `DEMONSTRATIVE`, and `pointerRef.ts`), so the help and the resolver cannot disagree.
  - **Identified targets.** The panel also shows, live, **what "this" / "that" would act on right now**: a "Target:" line naming the element or label the resolver would pick, in the resolver's own order — the selection first, then the element under the cursor, then the last one added (the order fixed on 2026-10-01 so that "this" follows the cursor). It updates as the cursor moves or the selection changes, and the matching element is outlined on the canvas while the panel is open. It reuses `resolveRef` / `elementUnderPointer` unchanged — no second copy of the rule — and makes a wrong target visible *before* the command is spoken. With several things selected it reads "n selected — say 'these'". The tile's try-it shows the same line, using a chosen element as the stand-in selection or cursor.
- **Named lists** are filled from the existing shared vocabularies (verbs, type nouns, directions, container words), so a word added to the parser's lists appears in the help with no second edit.
- **Worked example — after "rename":** `pools · lanes · sublanes · tasks · activities · subprocesses · gateways · events · messages · connectors · <existing_element_name> · <existing_label_name> · selected`. After `rename <existing_element_name>`: `to`. After `to`: `<new_element_name>`.
- **Optional words** are declared in the patterns with `[ ]` and described in the tile's "Optional words" table, so the help can show them dimmed.
- **First words:** the union of every pattern's first token (with the parser's synonyms grouped, e.g. add/insert/create). **Assist-only extras** (accept, take, use — the ghost-suggestion words) appear only when ghost suggestions are on screen.

## How it works at run time

1. **State is a pure function of the words heard so far in this utterance** (the interim transcript), recomputed on every update — so a recogniser revision never leaves it stuck. It resets when a command is applied, on "stop/done/cancel", or after an idle gap.
2. `nextWords(tokens)` walks all patterns at once and returns the **union** of what can follow, each marked required / optional, plus which slot is open. A name slot stays open across several words (multi-word names), showing `[to]`/continue as the next options.
3. Each token is first passed through the **same mis-hear repairs the parser uses** (`repairHeardWords`, `containerWords`, `spokenNumber`), so "mood" counts as "move".
4. **No tokens → first words.** A guided flow open → that flow's sub-grammar instead.
5. Display only; it never changes what the parser does with a command (except the optional repair step below).

## Making parsing more reliable (item 5) — honest scope

The tree does **not** replace the parser (decision above). It helps in three bounded ways:
- **Position-aware repair:** when a token is not in the expected set but is a near-homophone of exactly one expected word, repair it — "the"→"one" where a number is due (today's special case in `dividerFlow.ts`), "to"→"two", "mood"→"move". This generalises today's scattered one-off repairs. **Behind a flag; adopted only if the replay corpus scores better** (the lesson of the keyword-boost history).
- **Hold decisions:** a prefix that is a valid unfinished command means "wait for more" — a data-driven replacement for the regex list in `incompleteCommand.ts` (later, optional).
- **Drift guard:** a test and the tile report prove the tree and the parser agree on the catalog, the frozen key and the generator corpus.

## Slices (each ships on its own, suite green before each push)

| # | Slice | Contents | Size |
|---|---|---|---|
| 1 | Grammar engine (pure) | Notation parser; `firstWords()`, `nextWords(tokens, ctx)`; sub-grammars for the guided flows; default patterns + conventions authored from the catalog families and `ops.ts` (≈60–80 lines); unit tests; consistency tests against the catalog and frozen key | M |
| 2 | Settings, API, tile | `AppSetting` keys `voiceAssistHelp.enabled`, `.grammar`, `.conventions` (absent = code default; Reset deletes); `GET/PUT/DELETE /api/admin/voice-assist-help` (SuperAdmin + `blockReadOnlyImpersonation`); read route for the editor; tile `voice-assist-help` in `ADMIN_TILES`; page with: on/off, conventions table, patterns editor with line-level validation, optional-words table, auto-generated next-word summary, **typed try-it** with the live bubble and "does the parser accept it?" | L |
| 3 | Editor panel | `VoiceAssistHelpPanel` using `FloatingPanel`, hosted next to `VoiceAssistBar` (BPMN, `voice-assist` available, global switch on); per-user on/off pill (localStorage, like the existing one, separate key); fed by `voiceInterim`, the flow states and `nextStepRef` (ghost words); the live "Target:" line and canvas outline come from `resolveRef` plus the pointer and selection refs | M |
| 4 | Speak it + consistency report | Mic in the tile via `startDictation` (interim words walk the tree); "Check against parser" runs the catalog, frozen key and `commandGenerator` corpus **both ways** and lists disagreements | M |
| 5 | Reliability uses | Position-aware repair (flagged), measured over the recorded clips via the existing Replay harness; hold decisions if it pays | M |
| 6 | Later | Phone `/m` panel; DB-held User Guide / Features catalog / Technical Notes text (SQL, as for release 2.13) | S |

## Critical files

- New: `app/lib/assist/commandTree/` (notation parser, walker, defaults), `app/components/canvas/VoiceAssistHelpPanel.tsx`, `app/lib/voice/voiceAssistHelpSetting.ts` (modelled on `ttsSettings.ts`), `app/api/admin/voice-assist-help/route.ts`, `app/(dashboard)/dashboard/admin/voice-assist-help/{page,VoiceAssistHelpClient}.tsx`.
- Edited: `admin/AdminClient.tsx` (tile), `DiagramEditor.tsx` + `VoiceAssistBar.tsx` (host the panel), `useVoiceSession.ts` (expose the heard-so-far tokens and flow state — much already exported).
- Reused, not copied: `commandVerbs.ts`, `containerWords.ts`, `placeWords.ts`, `SYMBOL_SYNONYMS`, `elementSubtypes`, `repairHeardWords` (`selectedWord.ts`), `leadingSpokenNumber`, `FloatingPanel.tsx`, `commandScore.ts`/`corpusSets.ts` for the consistency report, `getBubbleHelpEnabled`-style AppSetting helpers.

## Risks and how they are handled

- **Tree drifts from the parser** → the consistency test and the tile report; the tree is a lens, so a stale tree misleads the display but never breaks a command.
- **Interim words flicker** → pure recompute each update, small debounce.
- **Long name lists** → variables only (as Paul specified); no real names are listed.
- **A SuperAdmin edit breaks the tree** → line-level validation; Reset to default; the editor falls back to the code default if the stored text does not parse.
- **Panel clutter** → optional words dimmed; panel hidden when Voice Assist is off; own on/off pill.

## Verification

- Unit: notation parser, `firstWords`, `nextWords` for rename/move/connect/add/delete and the flows; optional and slot handling; mis-hear repair.
- Consistency: every `COMMAND_CATALOG` sentence is accepted by the tree; the tree's first words match the verbs the parser starts commands with; the generator round trip, both ways.
- Admin API tests (SuperAdmin only, read-only impersonation blocked, mutating-route ratchet satisfied, Reset restores the default).
- Manual: switch on in the tile; in the editor turn Voice Assist on; the first-words list shows; say "rename" and the list becomes the rename list with the four variables; say a name and "to"; try "move dividers" and a numbered pick to see the flow sub-grammars.
- Replay measurement before the repair flag is ever turned on.

## Open points for the review

1. The exact **slot conventions** beyond Paul's four (`<number>`, `<distance>`, `<position>`, and the new `<target>` group) — proposed above, to be confirmed in the tile.
2. Whether the help should **group synonyms** (add/insert/create) or list each — proposed: grouped, expandable.
3. Whether this needs its own **feature-availability key** (proposed: no; it rides on `voice-assist` plus the global switch).
