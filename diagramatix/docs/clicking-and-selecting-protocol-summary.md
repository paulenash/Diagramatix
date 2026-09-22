# Clicking and selecting — protocol summary

**Status as at 22 September 2026.** Paul's draft, checked line by line against
the code, corrected where the code differs, and extended with the cases the
draft did not reach. **Nothing here has been implemented from this document** —
it is a specification for review. Items marked **PROPOSED** differ from what
ships today; everything else is a description of current behaviour with the
file and rule that produces it.

**Item 4 was decided on 22 September 2026** (see [The one conflict](#the-one-conflict)):
the second press on a selected element draws a connector, as drafted.

---

## 0 — Hover

The cursor scheme is **G05**, and it is not inline styles: a grabbable thing
carries the class `.dgx-grab`, so CSS `:active` can swap grab → grabbing while
the button is down. Inline `style={{ cursor }}` cannot reach `:active`, which
is why the two live in `app/globals.css` (lines 69–73).

| | Over | Cursor today | CSS | Draft said | Note |
|---|---|---|---|---|---|
| ✋ | An element (unselected) | open hand, closing to ✊ | `grab` / `grabbing` | "Hand" | Agrees. `.dgx-grab` on the element's `<g>`. |
| ✛ | An element **once selected** | crosshair | `crosshair` | "+" | Agrees — the next press here draws a connector (item 4, decided 22 Sep). |
| ✊ | **Anywhere, while moving** | closed hand | `grabbing` | "Grab" | **Added 2026-09-22** — `.dgx-dragging` on the canvas root for the whole move. Without it, pressing an unselected element selected it, the connect overlay appeared under the pointer mid-drag, and its ✛ won: item 3's "+ during a move". |
| ✛ | **Anywhere, while drawing a connector** | crosshair | `crosshair` | "+" | **Added 2026-09-22** — `.dgx-connecting` on the canvas root while targets are highlighted. |
| ✋ | An element or connector **label** | open hand, closing to ✊ | `grab` / `grabbing` | — | **Fixed 2026-09-22.** Was an inline `grab`, which cannot reach `:active` and outranked the body's `grabbing` during a drag. |
| ✋ | A pool **header strip** | open hand, closing to ✊ | `grab` / `grabbing` | — | **Fixed 2026-09-22.** It was an inline style, which cannot reach `:active`, so it never closed to ✊. Now `.dgx-grab`. |
| ↖ | A white-box pool **body** | arrow | `default` | — | Deliberate: the body is click-through so you can reach what is inside. |
| 👆 | A connector | pointing finger | `pointer` | "Finger" | Agrees. |
| ↔ | A message flow | horizontal arrows | `ew-resize` | "↔" | Agrees — its spine slides sideways. |
| ✋ | A connector endpoint, waypoint or label | open hand | `grab` | — | Not in the draft. |
| ↕ ↔ | A pool edge, lane or sub-lane divider | resize arrows | `ns-resize` / `ew-resize` | — | Not in the draft. |
| ⤡ ⤢ | A corner handle | diagonal arrows | `nwse-resize` / `nesw-resize` | — | Not in the draft. |
| ↖ | A boundary event | arrow | `default` | — | Selection only; it is pinned to its host's edge. |
| ✋ | **Empty canvas** | open hand, closing to ✊ | `grab` / `grabbing` | "Arrow" | **Draft is wrong.** Dragging the background PANS, so it must advertise that. |

---

## 1 — First click and release: select

Correct as drafted. The cursor over the **selected** element becomes `crosshair`
(the "+"), because a transparent connect overlay is laid over it once it is
selected — see item 4.

**A correction to an earlier answer of mine.** I wrote that "elements already
do grab → grabbing on hover and press". That is true only while the element is
**unselected**. The moment it is selected the connect overlay covers it and
wins, so hover and press both read ✛. Paul is right that he sees "+"; the
sentence was incomplete, not the code. Two further things worth knowing when
testing this:

- **A right-click does not fire `:active`** in most browsers, so grab never
  closes to grabbing under the right button however the element is set up.
- **A stale build shows the old cursors.** The pool header only became ✋ in
  `77122bb3` (21 Sep) and only closes to ✊ from 22 Sep — a dev server started
  before those needs restarting.

### 1a — Escape, or a click elsewhere, clears the selection

Correct, and Escape does more than the draft says. It is a **cascade**, in this
order: cancel a removal confirmation → cancel a toolbar space-insert gesture →
otherwise clear everything at once (in-progress connector drag, endpoint drag,
label edit, pending palette drop, element selection, connector selection,
auto-connect flash, connection-creation mode).

### 1b — Shift-click an unselected element: add it to the selection

Correct. Every element in a multi-selection keeps its own `grab` cursor.

**PROPOSED — a group drag cursor.** The draft asks for `grab` while over any
member of the group, and `grab`/`grabbing` on the drag itself. The first half
already happens; a group drag currently inherits each element's own
`.dgx-grab:active`, so it does show `grabbing`. No change needed unless a
distinct group cursor is wanted.

### 1c — Shift-click a selected element: remove it from the selection

Correct. The draft's refinement — that the cursor returns to `+` when exactly
one element remains — follows automatically, because the connect overlay is
drawn only when the selection is a single element.

---

## 2 — Double-click: zoom and edit

Correct, with detail worth recording:

- The zoom **aims at the region you type into**, not the shape's middle. An
  expanded subprocess is hundreds of pixels wide, and aiming at the whole box
  made the computed zoom tiny enough that the "only zoom in" guard skipped it.
- A **pool or lane** opens its label editor only when the double-click lands on
  the **header strip**, read at its real width rather than the 36px default.
- An element with a linked diagram (subprocess, submachine, collapsed chevron,
  use case, ArchiMate shape, UML package, EPC interface) **drills into that
  diagram** instead of editing its label.
- Escape cancels the edit; the focus zoom is released on commit or cancel.

---

## 3 — Click and hold, then drag: move the element

**PROPOSED, and narrower than the draft suggests.** An **unselected** element
already moves on click-and-drag, with `grab` → `grabbing`, via `.dgx-grab`.

What the draft is really reporting is a **selected** element: the connect
overlay sits on top of it with `cursor: crosshair`, so the "+" persists through
the drag. Making the cursor read `grabbing` there means either suppressing the
overlay's cursor once movement has started, or not covering the element with a
crosshair at all — which is item 4's decision, not this one.

There is also a 4px threshold before any drag starts, so a click that wobbles
still registers as a click.

**Fixed on 2026-09-22, for containers.** Pressing the header of an
ALREADY-SELECTED pool or lane used to deselect it and return, so the drag never
began — and since clicking the header is also how you select it, every attempt
after the first did nothing. Paul: "It would be good if it did grab and
reliably then move the pool." The deselect is now a CLICK rather than a press:
under 4px it deselects as before, past 4px the container moves.

---

## 4 — Click, then click-and-hold: create a connector

**This is where the conflict is.** What the draft describes — a second press on
an already-selected element beginning a connector, with valid targets
highlighted — is exactly what shipped **until 21 September 2026**.

### The one conflict

**DECIDED 2026-09-22 — item 4 as drafted.** Paul: "1. click and press → Drag
cursor. 2. click, click and press → connector creation mode, and when the
targets are highlighted, the cursor should change to '+'." The move-on-drag
rule from `77122bb3` is reverted for selected elements; the pool-header rule
from the same commit stays, since the header is a handle and never connects.
What follows is the record of how the question stood.

On 21 September Paul reported:

> "The gesture for moving a Pool is not quite right. If I click on a Task, wait
> a bit and then move, the Task moves. It seems with Pools that I can't do that
> reliably — they almost immediately go into connector creation mode."

`77122bb3` changed the overlay so that **moving the mouse more than 4px moves
the shape**, and only a **300ms hold without moving** starts a connector. Under
this document's item 4, that change is wrong and should be reverted.

Both readings are defensible and they cannot both be built:

| | Item 4 as drafted | As shipped in `77122bb3` |
|---|---|---|
| Drag a **selected** element | draws a connector | moves the element |
| Draw a connector from a selected element | drag it | press and hold 300ms, then drag |
| Move a selected element | click empty space first, then drag it | just drag it |
| Matches the 21 Sep report | no | yes |
| Matches this document | yes | no |

**A third option, which may be what both messages are really after:** keep item
4's drag-to-connect, but only where the pointer is *not* over a grab handle —
so a pool header always moves (already true since `77122bb3`), and the
reported pool problem is fixed without changing how tasks behave. That would
mean reverting only the 4px move rule and keeping the header exclusion.

Paul to choose. Nothing will be changed until he does.

### What is true of connector creation either way

- Valid targets highlight as you drag, and the highlight is already gated by
  `canConnect` — an invalid target simply never lights up.
- A white-box pool is never a connector source.
- An end event is never a source; an initial state is never a target.
- Releasing over empty canvas cancels; so does Escape.

---

## 5 — Click elsewhere: deselect

Correct, and it is the same path as 1a. Worth noting the two exceptions:

- A click on a **white-box pool body** passes through to whatever is underneath
  — a lane, an element, or the canvas — so it deselects only if it reaches the
  canvas.
- A click on a **pool or lane header** selects that container rather than
  deselecting.

---

## 6 — Cases the draft did not cover

**Containers select from their header only.** A white-box pool and every lane
and sub-lane are selected by their header strip, not their body. A black-box
pool has no body to speak of and selects anywhere. A white-box pool also
selects from within 8px of any of its four edges.

**A second click on a container header deselects it** — the toggle exists
because a large container is otherwise hard to get rid of.

**Boundaries and dividers are their own targets.** A pool's four edges, and the
dividers between lanes and between sub-lanes, are separate hit zones drawn
*above* the connector and element layers so nothing crossing them can steal the
press. Which edges a shape offers is one rule, in `resizeEdges.ts` — a pool
offers all four, the left one having been reinstated on 2026-09-21.

**An edge press decides by direction, not distance.** Within an edge band,
moving *across* the edge resizes and moving *along* it moves the shape. A press
that never moves falls through to selection.

**Multi-selection overrides header-only selection.** When a pool or lane is
part of a multi-selection, a press anywhere on it drags the group — otherwise a
freshly-stamped template could not be dragged without hunting for a non-pool
element.

**Arrow keys nudge**, 5px, or 1px with Shift, and each press is its own undo
entry.

**Read-only and feedback modes** suppress every gesture that would change the
diagram; selection still works.

**Scrolling and zooming.** Scroll over the canvas zooms the diagram, the same as
the zoom control at the bottom right. **Ctrl + scroll, or a trackpad pinch,
over a panel zooms the whole browser page** — every panel around the canvas
resizes with it. That is the browser's own zoom, not a Diagramatix gesture: the
canvas keeps scroll for itself, a panel does not, so it reaches the browser.
**Ctrl + 0** puts the page back. Left as it is on purpose (Paul, 2026-09-22:
"No change for scrolling over a panel. Just add it to the list of commands so
users know it exists") and listed in Canvas Help under *Zooming*.

**One zoom readout.** The status bar no longer shows a percentage (removed
2026-09-22). It showed the true scale while the zoom control shows the scale
relative to how the diagram opened, so the two disagreed on almost every
diagram; the zoom control is the one to read.

---

## Open questions for Paul

1. ~~**Item 4 versus `77122bb3`**~~ — **decided 2026-09-22**: the second press on
   a selected element draws a connector (item 4 as drafted).
2. ~~**Item 3's cursor**~~ — **resolved 2026-09-22**: the cursor follows the
   gesture, not the shape. The canvas shows ✊ for the whole of a move and ✛ for
   the whole of a connector draw, whatever the pointer passes over.
3. **A distinct group-drag cursor** — or is inheriting each element's
   `grab`/`grabbing` enough? *Still open.*
