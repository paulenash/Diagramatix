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
| **Extend the pool** | "extend the pool to include all elements", "grow the pool to include everything" | **Grows the existing pool** (never adds a second) |
| **Compress a pool** | "compress the Customer pool", "shrink Sales", "collapse the pool", "tighten Finance" | White‑box → shrinks pool + lanes to content ± ½ Task; black‑box / empty → shrinks to just fit the name |

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
| **Rename a message** | "rename 'Email Details' to 'Send the invoice'", "rename message Email Details to Get Approval" | Matches the message by its current label |
| **Delete a message** | "delete 'Email Details'", "remove message Email Details" | Matches the message by its label |

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

---

## Variants the parser already accepts

- **Verbs:** add · insert · create · put · make · draw · split (context‑dependent).
- **Homophones** (common Deepgram mishears): **pool** ← poll / pull; **lane** ← line.
- **Counts:** digits ("3") or words ("three"); "a/an" = 1; "some" = 1.
- **Fillers:** "new / another / extra" before a lane/pool; "the/a/an"; a trailing "on the diagram".
- **Names:** `called / named / labelled X`, or a comma/"and" list ("A, B and C", Oxford comma ok).
- **Numbers in names:** "Lane 2" ≡ "lane two".

## What Deepgram can and can't do

Deepgram **transcribes**; it can't be constrained to only emit valid commands (streaming ASR has no
grammar mode). What we do instead: **keyword‑boost** the command vocabulary and set **en‑AU** so it
*hears* the command words better. The "check for a designated command" step is our **parser**, not
Deepgram. Novel phrasing the parser doesn't cover is handled by the **AI fallback**, which returns the
same op vocabulary — so anything the AI understands is still applied through the same validated path.

> **Maintenance:** this list, the grammar, and the tests move together. Add a command → add its row
> here, a grammar rule, and a test asserting the parse.
