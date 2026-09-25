# Voice Assist — Command Reference

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
| **Move a pool boundary** | "move the pool left boundary right", "nudge the Warehouse pool's top boundary up by 40", "shift the bottom edge of the Customer pool down" | Moves ONE edge of a pool — a resize, not a move (default 20px). A left/right boundary only takes **left/right**; a top/bottom one only **up/down** — an impossible pairing is refused rather than guessed. Obeys every rule a mouse drag does: it stops at the first element any locked pool meets, the lanes and sub-lanes follow, and nothing inside moves. Aliases: move · nudge · shift · bump · drag · pull · push · slide |

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
| Convert in place | "make this a user task", "turn the selected gateway into a parallel gateway", "make Review a service task", "make the selected event a timer event" |
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

- **"add a message"** (no ends) — green numbers appear on everything a message can start or end at:
  tasks, subprocesses, black-box pools and events (a Message event, or a plain one, which becomes a
  Message event). Say **"3 to 7 labelled Order Placed"** (or "from 3 to 7"). "done" walks away.
- **"add a message to the selected"** / "from this" — select anything a message can start or end at
  and what can exchange a message with it is numbered. Say **"to 2 labelled Order Placed"** or
  **"from 2 labelled …"** — only the one that can work is offered for an element that can only send
  or only receive.
- The numbers follow the same rule as the mouse (updated 25 September 2026): the two ends are in
  different pools; a start event only receives and an end event only sends; a catching event (or
  one with no Flow Type that already receives a message) only receives, and a throwing one (or one
  that already sends) only sends; gateways, lanes, white-box pools and events with any other
  trigger never take a message. Said the wrong way round ("12 to 1" where 12 only receives), it is
  refused with the reason and the numbers stay up.
- "add a message to IT System" (one named end) still goes to the AI, as before.

## Nudge, move, label, swap (15 September 2026)

- **Nudge** — "nudge the selected task left", "bump Approve right", "nudge these down": **20 px** in
  any direction, only the element named (plus its own boundary events; a pool brings its lanes). A
  selection nudges together.
- **Move** — a selection moves together, **100 px per step**: "move these right", "move the selected
  task two steps up". A named single element still moves past the next element as before.
- **Label selected** — "label selected Yes" labels the selected **connector**; bare "label selected"
  waits for the text. **Label connectors** / "label messages" numbers them, then "3 No".
- **Swap** connection points on the **selected gateway(s)** — every selected gateway is swapped — "swap top and bottom", "swap bottom and
  middle": the outgoing points of a decision gateway, the incoming points of a merge. Any pair of
  **top / bottom / middle / left / right**, in either order ("centre" = middle). "Middle" is the side
  in the flow direction (right for outgoing, left for incoming); left and right are literal sides.
  Both points must have a connector; the two connectors trade sides and re-route.

## Surround the selection with an expanded subprocess (16 September 2026)

- **"surround selected with an expanded subprocess called Check Stock"** (also "wrap these in a
  subprocess", "put an expanded subprocess around the selected elements called …"). Select the
  elements first; they must sit in the one lane (or pool) and have **exactly one flow in and one
  flow out** — otherwise the log says how many it found and nothing changes.
- What happens: room is made **in that lane only** — the selection moves 90 px right and everything
  to its right in the same lane moves 180 px; the neighbouring lanes are untouched and the pools
  widen to fit (all to one width). The subprocess is drawn around the elements **exactly as they
  were** with their internal flows; the flow in now enters the subprocess and the flow out leaves it;
  a **Start** faces the entry element and an **End** faces the exit element inside it, on short
  straight flows. An unselected element that would end up inside the area is refused by name, never
  adopted silently.
- **"delete selected"** on an expanded subprocess (or "unwrap / dissolve the selected subprocess")
  is the reverse: the shell and its Start/End go, the contents stay and are spliced back into the
  flow, and the room is given back — the elements return to exactly where they were. Works on any
  expanded subprocess, not only one made this way (the flow re-enters at the leftmost element and
  leaves from the rightmost when there is no Start/End). The two round-trip without undo, and not
  necessarily straight after one another. An empty subprocess is deleted as before.

## Wrap the selection in a pool or a lane (17 September 2026)

- **"wrap these in a pool called Finance"** — a new pool around the selected
  elements. Refused when a **sequence flow would cross the boundary**, because
  BPMN does not allow that: the log names what is on the other side so you can
  include it or disconnect it. Also refused if the elements are already in a
  pool, since pools do not nest.
- **"surround selected with a lane called Picking"** — a new lane in the pool
  the selection already sits in. A lane is a full-width band, so anything
  unselected that is level with the selection would be swept in; that is
  refused by name rather than done quietly. Needs the elements to be in a pool.
- Both take the same phrasings as the subprocess wrap, and both accept what the
  recogniser usually returns instead: "poll"/"pull" for pool, "line" for lane.

## Rearranging a gateway's connection points (21 September 2026)

Select a gateway — or a decision **and** a merge together — then:

- **"swap top and bottom"** — exchanges the two connectors. Needs a connector
  at **both** points.
- **"move top to bottom"** — moves one connector to a point that is **free**.

Any pair of **top / bottom / middle / left / right**, in either order. "Middle"
means the side in the flow direction: the right point of a decision, the left
of a merge. With two gateways selected, one connector on **each** is affected.

**Naming the gateway is optional but now allowed** — "swap selected gateway,
top and bottom" works as well as the bare form. It used to fall through to the
*lane* swap and answer "couldn't find 'selected gateway, top'", which made the
whole feature look missing.

If you say the wrong one of the pair, the log tells you which you meant: asking
to move onto an occupied point suggests the swap, and swapping where one point
is empty says which one.

## Merge gateways gather the branches (21 September 2026)

A merge reads as a funnel, so a flow **into** one meets the vertex nearest
where it came from:

| The branch comes from | It meets |
|---|---|
| above the gateway | the **top** point |
| level with it | the **left** point |
| below it | the **bottom** point |

This is the mirror of the rule a **decision** gateway's outgoing branches have
always followed, and it uses the same test, so the two never disagree. Before
it, every incoming flow landed on the same vertex and the lines crossed each
other to get there.

It applies to sequence flows, on every path — spoken, drawn by hand, or from
the AI. An endpoint you deliberately drag to a particular vertex is left where
you put it.

## Saying a command in two breaths (21 September 2026)

Say **"add a task called Receive Order"**, then, as an afterthought,
**"after the start"** — the task is connected to the start event. A tail on its
own means *make the thing I just added follow this*; **"before X"** is the
reverse. This is interpreted by the rules, instantly and free.

Before, a tail like that had no sentence in front of it any more (the first half
was a complete command and had already run), so it went to the AI — which saw
the diagram, reconstructed the whole sentence, and added a **second** copy of
the element. Two commands later there were two things with the same name and
every reference to it was ambiguous.

A whole sentence that merely begins with the word — "after Review add a task
called Approve" — is still treated as the command it is.

**A named anchor that cannot be found now stops the command.** "Add a task
called Check Stock after Receive Order" with two Receive Orders numbers them and
asks; it no longer reports the ambiguity and then adds the task anyway, anchored
to whatever happened to be last.

## Names start with a capital (21 September 2026)

**Activity, gateway and event labels always start with a capitalised word.** Say
"add a task called receive order" and the task is named **Receive order** — so a
dictated name does not sit on the diagram looking like a typo beside every name
that was typed.

- **The first word only**, never title case: "Send to customer for approval",
  not "Send To Customer For Approval".
- **A deliberate capital is left alone** — iPhone, eCommerce, mRNA stay as they
  are, and a name starting with a digit ("3rd party check") is untouched.
- It applies on **every** path — the palette, editing a label in place, a spoken
  command, an AI apply — because the rule lives in the reducer.
- **Pools and lanes are not included**: they already have their own rules (never
  the bare kind word, always unique).

## Align, and take a suggestion (21 September 2026)

- **"align these"** — tidies the selection, the same as the Alignment ▾ menu's
  smart option. Also **"align these in a row"** (one horizontal line),
  **"line these up in a column"**, and the four edges: **"align their left
  edges"**, right, tops, bottoms.
  - **"align these horizontally" is not accepted**, on purpose. Half of people
    mean "lay them along a horizontal line" and half mean "move them
    horizontally"; rather than be wrong half the time with a green tick, it
    goes to the AI, which can ask. Say a row, a column, or an edge.
  - *"Space these evenly"* and *"same size as this"* are **not** built — those
    reducers do not exist yet, and distributing badly is worse than not
    distributing, because it looks finished.
- **"accept the suggestion"** — takes the 👻 Assist ghost, the same as pressing
  **Tab**. Also **"take the gateway"** (by what it is), **"take the second
  one"**, **"accept ghost 2"**. Needs Assist on and one element selected.
  - **"Yes" is not an accept word.** It already means *go ahead* for a parked
    destructive command, and a word that changes meaning depending on whether a
    ghost happens to be showing is how a diagram gets cleared by accident.
  - A bare number is left alone too — that answers a numbered pick.

## Fill the selection, and point instead of naming (21 September 2026)

**Say several things at once.** Select a group, then:

- **"name these Receive, Check and Ship"** — the names land in **reading order**:
  rows top to bottom, each row left to right, the way you read the diagram. The
  counts must match; three names for four selected elements is refused rather
  than filling three of them and leaving one looking finished.
- **"assign these to the Finance team"** · "put the selected tasks in the Sales
  team" — the simulation team. A team belongs to an activity, so anything else
  in the selection is named and skipped rather than quietly given one.
- **"attach risk R-012 to these"** · "attach control C-3 to the selected task" —
  from the project's Risk & Control library, by code or by name. Codes are
  matched loosely on how they are dictated ("R-012", "r 012", "are 012" are one
  thing), but **names are never matched fuzzily**: attaching the wrong control
  survives into an audit, so a near miss is reported rather than guessed.

**Point instead of naming.**

- **"put a task here"** · "add a gateway over there" — at the **mouse position**.
  It is still nudged clear of anything already there, and no connector is drawn,
  because you said where rather than what it follows. If the mouse has never
  been over the canvas you are told so rather than given one at the far corner.
- **"the one under the cursor"** — the element the mouse is over. Also "this one
  here", "that one there", "the one I'm pointing at". Works with any command
  that takes a reference: "rename the one under the cursor to Approve".
- **"this" and "that" are unchanged** — they still mean the selection. What is
  new is the fallback: with nothing selected and nothing added yet, they now
  mean whatever the mouse is resting on, which is a better guess than the last
  element in the document.

> The review plan asked for *"connect this to that"*, with *that* meaning the
> pointer. That is not what shipped: "this" and "that" already mean the
> selection, and that sentence needs the two words to mean different things in
> one breath. Say **"connect the selected task to the one under the cursor"**.

## Convert in place (20 September 2026)

Everything the right-click type-picker offers can now be said instead:

- **"make this a user task"** · "make Review a business rule task" · "make the selected task plain"
- **"turn the selected gateway into a parallel gateway"** · "make it exclusive" · "make this a merge"
- **"make the selected event a timer event"** · "make this an error event"
- **"make the subprocess a call subprocess"** · "make this a transaction" · "make it a loop"
- **"make this an input data object"**

This sets a **marker on the element it is already** — it does not turn a task
into a gateway. That is a different operation (the shape is replaced and
properties would be dropped), so asking for it is refused by name rather than
done approximately.

The wording comes from the same table the menu draws, so the two can never
offer different things. Say the kind word when the word alone could mean two
things — "parallel" is only a gateway, but if a subtype ever became ambiguous
you are asked which rather than guessed at.

## The number one, during a numbered pick (17 September 2026)

Saying **"one"** used to come back as **"lane"**. That was our own doing: the
recogniser is told to favour BPMN words, and `lane` carried the strongest
weight, so on a one-word utterance it won against the number. Fixed at both
ends — the number words are now boosted too, and the pick corrects a known
mishearing on the first word only. "One", "lane", "line", "won" and "juan" all
pick item 1; a name that begins with "Lane" still works, because only the
leading word is ever rewritten.

## Pausing mid-command

Deepgram finalises a segment after ~0.8 s of silence, so "Swap … top and bottom" can arrive as two
pieces. The bar holds a piece that is clearly unfinished — a lone verb ("Swap."), a dangling "to" /
"and" / "called", a rename without its "to" — and waits up to three grace periods for the rest. A
comma straight after the verb ("Swap, top and bottom.") is ignored. Speaking the whole command in
one breath is still the surest way; the hold is the safety net.

## The green numbers

- **Where they sit:** below an activity; **above** an event; for a **pool or lane**, in the header
  just before the start of the name — and they move as the name changes length.
- **Selection protocol:** a rename or move by voice never leaves the item selected — after
  "3 Approve Order" the badges renumber and nothing stays highlighted. (Only the moment between
  saying a bare number and saying the name keeps the picked item selected, as the cue.)

## "stop" versus "done"

- **stop** (also "stop listening", "that's enough", "voice-assist off") — **always stops the
  microphone**, and drops any numbered pick or parked confirmation with it. Typed or spoken.
- **done** (also "cancel", "finished", "stop rename") — ends a numbered pick (rename by number,
  message by number) and **keeps listening**. Escape does the same.

## While Voice Assist is open

- The bar can be **dragged by its header**; the Symbols palette and the Properties panel fold away
  when Voice Assist opens and come back as they were when it closes.
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
- Under the cost, **how the session got on**: how many commands, how many did not land, and how many
  were fixed on a re-try — split into **misheard** (you said it again and it worked, so the recogniser
  lost the words) and **rephrased** (you said it differently and it worked, so the grammar was short).
  A command you had to say twice is a cost the dollar figure does not show. Nothing is stored or sent;
  it is read from the log already on screen.

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

- **Verbs, by what they do** (they are not interchangeable — checked against the grammar 2026‑09‑20):
  - *add* — add · insert · create · put · place · drop in · give me · new
  - *connect* — connect · link · join · draw (a line/arrow/flow)
  - *convert in place* — make · turn · convert · change · set
  - *split* is context‑dependent.
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
