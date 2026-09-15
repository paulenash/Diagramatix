# Abracadabra Mode — Command Reference

The **definitive list** of voice/typed commands. Every command here is recognised by the
**deterministic parser** (`app/lib/assist/commandGrammar.ts`) — instant, free, offline — and is
covered by a test in `tests/diagram/assist-command.test.ts` (the local refinement harness). Anything
not matched here falls back to the **metered AI interpreter** (`/api/ai/command`).

**How it flows:** 🎙 speak → **Deepgram** transcribes (biased toward this vocabulary via keyword
boosting, en‑AU) → fragments are **buffered** into one sentence → **parser** checks for a designated
command (with variants) → if none, the **AI** interprets it → ops apply live, undoable.

**Referring to things:** by **name** ("Review"), by **type** ("the gateway", "the pool"), by **position**
("the middle pool", "the left lane"), by **number** ("Lane 2" / "lane two" both work), or with
**pronouns** ("it", "the last one", "the previous one"). A leading/trailing kind word is tolerated
("the Sales lane" → the lane named Sales).

---

## Pools

| Intent | Say (any variant) | Notes |
|---|---|---|
| **Add a pool** | "add a pool", "create a pool", "add a new pool", "add a pool called Finance" | New **empty** pool, **no starter lane**; auto‑sized to just fit the pool name in the header |
| **Add a black‑box pool** | "add a black‑box pool", "add a black box pool above/below existing pools" | Bare participant box, no lanes; positions relative to existing pools |
| **Wrap everything in a pool** | "put a pool around everything", "add a pool to all elements on the diagram", "wrap everything in a pool" | Wraps all loose (un‑pooled) elements |
| **Extend the pools** | "extend the pools to include all elements", "widen the pools", "lengthen the pool", "include all elements" | **Widens every pool rightward** to cover all elements and sets **all pools to the same width** (kept aligned). Aliases: extend · lengthen · widen (· expand · grow · stretch) |
| **Compress a pool** | "compress the Customer pool", "shrink Sales", "reduce Finance", "collapse the pool" | White‑box → shrinks pool + lanes (and sub‑lanes) to content ± ½ Task; black‑box / empty → fits the name in height and takes the **white‑box pool's width** (participant boxes stay aligned). Aliases: compress · shrink · reduce · shorten · compact · collapse |
| **Nudge a pool** | "nudge pool down", "nudge the IT System up", "bump Customer down by 40", "move the pool up" | Moves a pool a small step (default 20px); its lanes/contents ride along. Bare "nudge pool" → the most‑recent black‑box pool. Aliases: nudge · bump · inch · shift · move (move only when a pool is named). Follow with **"again"** to repeat |

## Lanes

| Intent | Say | Notes |
|---|---|---|
| **Add lane(s) to a pool** | "add a lane to the pool", "add 2 lanes to the middle pool called Sales and Marketing", "add a new lane" | Names optional (default Lane 1..N); target defaults to "the pool" |
| **Insert a lane by position** | "add a lane above Lane 2", "add a lane below the Sales lane", "insert a lane below Sales called Support" | Inserts a band above/below the reference lane and grows the pool |
| **Delete a lane** | "delete Lane 2", "remove the Sales lane" | Neighbour lane grows to fill the gap; elements kept |
| **Swap two lanes** | "swap Sales with Marketing", "swap lane Sales and lane Support" | Adjacent lanes |

## Sub‑lanes

| Intent | Say | Notes |
|---|---|---|
| **Add sub‑lane(s)** | "add 3 sublanes to the Marketing lane called Manager, Assistant and Staff", "add sublanes to Sales" | Equal size; names optional (default Sublane 1..N) |
| **Delete a sub‑lane** | "remove the sublane Marketing Assistant", "delete sublane Staff" | Neighbour grows; pool keeps its size |

## Messages (between an activity and a pool / participant)

| Intent | Say | Notes |
|---|---|---|
| **Add a message flow** | "add message from Task 1 to IT System labelled Email Details", "send a message from Approve to Customer", "add a message to IT System from Task 1 saying Get Approval" | Direction follows the *from → to* order (either word order accepted); label optional |
| **Rename a message/connector** | "rename connector Email Details to Send Invoice", "rename 'Email Details' to 'Send the invoice'" | Matches the connector by its current label; a leading connector/message/arrow/link noun is stripped |
| **Delete a message/connector** | "delete connector Email Details", "delete 'Email Details'", "remove message Email Details" | Matches the connector by its label |

## Elements & flow (non‑container, for completeness)

| Intent | Say |
|---|---|
| Add an element | "add a task called Approve after Review", "add a decision", "insert a parallel gateway" |
| Boundary event | "add a boundary event called Cancel to the Repeat‑Until subprocess" |
| Connect / disconnect | "connect Send Invoice to Receive Payment", "connect them", "disconnect Review from Approve" |
| Rename | "rename the gateway to Approved?", "rename Lane 2 to Sales" |
| Move | "move the gateway two elements to the right" |
| Delete (+ compact) | "delete Prepare", "remove Prepare and compact" |
| Diagram | "clear the diagram", "export the diagram to JSON", "undo that", "stop" |
| Again | "again", "do it again", "once more", "repeat" — repeats the last command (e.g. another nudge) |

---

## The selection as a reference (multi-modal — the mouse says *which*, the voice says *what*)

Select something on the canvas, then refer to it instead of naming it — a selected element can't be
mis-heard and is never ambiguous. Works with **every** command that takes a reference.

| Say | Resolves to |
|---|---|
| "this", "that" | the selection when something is selected; otherwise the last element added (as before) |
| "these", "those", "the selection", "the selected elements" | everything selected |
| "the selected task" / "the selected pool" / "the selected lanes" | the selected elements of that kind |

Examples: "rename the selected pool to Customer" · "delete these" · "connect this to Approve" ·
"move the selected task right" · "add a boundary event called Timeout to this". A command that takes
**one** target with several selected asks you to select just one; `delete` accepts many.

## Messages by number (15 September 2026)

- **"add a message"** (no ends) — green numbers appear on every task, collapsed subprocess and
  black-box pool. Say **"3 to 7 labelled Order Placed"** (or "from 3 to 7"). "done" walks away.
- **"add a message to the selected"** / "from this" — select a task or collapsed subprocess and the
  black-box pools are numbered; select a black-box pool and the tasks / collapsed subprocesses are.
  Say **"to 2 labelled Order Placed"** or **"from 2 labelled …"**.
- "add a message to IT System" (one named end) still goes to the AI, as before.

## "stop" versus "done"

- **stop** (also "stop listening", "that's enough", "abracadabra off") — **always stops the
  microphone**, and drops any numbered pick or parked confirmation with it. Typed or spoken.
- **done** (also "cancel", "finished", "stop rename") — ends a numbered pick (rename by number,
  message by number) and **keeps listening**. Escape does the same.

## While Abracadabra is open

- The bar can be **dragged by its header**; the Symbols palette and the Properties panel fold away
  when Abracadabra opens and come back as they were when it closes.
- The mic header says **connecting…** until the recogniser is live, then **listening…** — speech
  during the handshake is captured and sent once the connection opens, so the first word is no
  longer lost.
- **"put a pool around everything"** creates one pool and adopts the elements into it — no lane.
- **"nudge X up"** moves 20 px (any element); **"move X up"** moves one element-span. The log line
  says which was heard.

## The bar's buttons

- **Commands** — a movable, scrollable reminder card of everything on this page, grouped by family
  (`app/lib/assist/commandCatalog.ts`; every example on it is tested to parse). Drag it by its title.
- **Cost** — what this session has cost so far: AI fallback calls at the rate catalogue's list prices,
  plus microphone minutes at a per-minute Deepgram estimate (the open mic session is counted live; a
  closed one is counted from its usage row). An **estimate** — the provider's invoice is the truth, and
  browser-engine voice is free.

## Confirmation and undo

- Commands that would remove **more than one thing** ask first and wait for the next utterance:
  "clear the diagram", deleting a pool or lane (and what is inside it), "delete these" with several
  selected, and "delete X and compact". Say **"yes"** (or "go ahead", "ok") to run it, **"no"**
  ("cancel", "never mind") to drop it; any other command drops it and runs instead. A single named
  element still deletes immediately.
- **One command is one undo.** However many changes a command makes (a task plus its label plus its
  connector plus a pool that grew), "undo that" — or Ctrl+Z — reverts the whole command. Moves and
  nudges are undoable like everything else.

## Variants the parser already accepts

- **Verbs:** add · insert · create · put · make · draw · split (context‑dependent).
- **Homophones** (common Deepgram mishears): **pool** ← poll / pull; **lane** ← line.
- **Counts:** digits ("3") or words ("three"); "a/an" = 1; "some" = 1.
- **Fillers:** "new / another / extra" before a lane/pool; "the/a/an"; a trailing "on the diagram".
- **Names:** `called / named / labelled X`, or a comma/"and" list ("A, B and C", Oxford comma ok).
- **Numbers in names:** "Lane 2" ≡ "lane two".

## Container naming rules (always enforced)

These run in the reducer, so they hold for **every** create/rename path (voice, palette, AI) — not just spoken commands:

- **Never the bare kind word.** A pool called just "Pool", or a lane called just "Lane", is auto‑numbered → "Pool 1", "Lane 2", etc.
- **Always unique.** A new or renamed Pool / Lane / Sub‑lane may not duplicate the name of any existing Pool or Lane on the diagram; a numeric suffix is appended until it is unique ("Sales" → "Sales 2").
- Applies across a batch too: "add 3 lanes" never yields two "Lane 1"s.

## What Deepgram can and can't do

Deepgram **transcribes**; it can't be constrained to only emit valid commands (streaming ASR has no
grammar mode). What we do instead: **keyword‑boost** the command vocabulary and set **en‑AU** so it
*hears* the command words better. The "check for a designated command" step is our **parser**, not
Deepgram. Novel phrasing the parser doesn't cover is handled by the **AI fallback**, which returns the
same op vocabulary — so anything the AI understands is still applied through the same validated path.

> **Maintenance:** this list, the grammar, and the tests move together. Add a command → add its row
> here, a grammar rule, and a test asserting the parse.
