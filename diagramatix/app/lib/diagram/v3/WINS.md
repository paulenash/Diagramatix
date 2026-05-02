# Visio V3 Export — Wins

Running ledger of what works, why it was hard, and the non-obvious tricks
that got us here. V3 lives at `app/lib/diagram/v3/exportVisioV3.ts` and is
admin-gated behind `paul@nashcc.com.au`.

The goal: re-export a Diagramatix BPMN diagram into a `.vsdx` that opens
cleanly in Microsoft Visio with **the right body shape, the right body
colour, the right markers, and the right text** — without Visio silently
substituting our shapes for its built-in `BPMN_M.VSSX` versions.

## The five-line pitch

V3 doesn't reuse the template's masters at instance level — it **clones
each master per instance** with a fresh BaseID/UniqueID, bakes the
Diagramatix colour and (where needed) instance dimensions into the master
copy, then references the per-instance master from `page1.xml`. This is
the same trick Visio's own template uses for Pool/Lane and is the only way
we found to keep our edits intact through Visio's master-substitution
heuristics.

---

## Wins

### Architecture

- **V3 is fully separated from V2.** Independent fork (`exportVisioV3.ts`,
  `visioMasterMapV3.ts`, `/api/export/visio-v3/route.ts`,
  `scripts/buildVisioStencilV3.cjs`). V2 is untouched and can be reverted
  to instantly via toggle.
- **Per-instance master pattern.** `createInstanceMaster(srcMasterId,
  colour, w?, h?)` clones a template master into `master1000+.xml`,
  registers it in `masters.xml` / `masters.xml.rels` /
  `[Content_Types].xml`, and returns the new master ID. Each diagram
  element gets its own master copy, immune to Visio's
  "this looks like a built-in master, let me swap it" behaviour.
- **GUID regeneration.** Every clone gets fresh `BaseID` and `UniqueID`
  GUIDs — a single shared GUID is enough for Visio to merge clones and
  discard our edits.

### Body colour

- **Coloured bodies for all body-fill types.** Tasks, Subprocess,
  ExpandedSubprocess, Events, Gateway, Data Object, Data Store, Pool, Lane
  all carry the user's colour from Diagramatix to Visio.
- **`bakeColourIntoMaster` is scoped to `MasterShape 6` only.** That
  protects every marker sub-shape from being re-painted with the body
  colour. The function rewrites `V='1' F='GUARD(...)'` cells, swaps
  `FillStyle='7'` for `'3'`, and injects `FillForegnd` if the master
  doesn't already have one.
- **`FillStyle='7' → '3'` was load-bearing.** `FillStyle='7'` falls
  through to the document theme (white). `'3'` lets our `FillForegnd`
  actually render.

### Labels

- **Vertical single-character labels render correctly.** Required `Txt*`
  cells (`TxtPinX`, `TxtPinY`, `TxtAngle`, `TxtWidth`, `TxtHeight`,
  `TxtLocPinX`, `TxtLocPinY`) on the instance plus a complete
  `Control.Row_1` section (the anchor for the master's `TxtPinY` formula
  inheritance).
- **Cached `TxtWidth` sized to label length.** Visio uses the cached `V=`
  on first paint — a too-small natural-size cache wraps long labels
  prematurely. We size `TxtWidth V=` from `longestLine.length × 0.075″ +
  padding`, capped to a sensible max.
- **Font sizes propagated.** Diagramatix's element/connector font sizes
  reach Visio via `<Section N='Character'>` rows on each instance.

### Markers — events

All 11 event triggers render the correct icon inside the event ring:

| Trigger | MasterShape | Geom IX |
|---|---|---|
| Message | 10 | 0,1,2 |
| Link | 11 | 0 |
| Timer | 12 | 0..13 |
| Signal | 13 | 0 |
| Compensation | 15 | 0,1 |
| Escalation | 16 | 0 |
| Terminate | 8 | 0 |
| Error | (root Shape 5 geom) | n/a |
| Cancel | (root Shape 5 geom) | n/a |
| Conditional | (root Shape 5 geom) | n/a |

The trick: emit per-shape **stubs** in the instance with
`<Section N='Geometry' IX='X'><Cell N='NoShow' V='0' F='Inh'/></Section>`,
plus the `Actions.<Trigger>.Checked='1'` row, plus `IsCustomNameU='1'`
and `IsCustomName='1'` on the instance attributes. Without all four
pieces present, Visio either hides the marker or falls back to a generic.

### Markers — tasks

User, Service, Send, Receive, Manual, Script, Business Rule all render
inside the Task body. Two non-obvious findings:

1. **User and Script share `Shape 18`.** They're distinguished by which
   Geometry IX rows are visible — User uses IX 0,1; Script uses IX 2.
   Mapping `User → [0,1]` and `Script → [2]` separately fixed the
   "User and Script show the same icon" bug.
2. **Send is two leaf shapes (21 and 22) inside Group 20.** Marking only
   one shape made the icon partial.

### Marker positioning

- **Per-shape nudge.** Task type markers sit at the master's hardcoded
  `3MM` offset, which lands them on the top edge after our body resize.
  `nudgeMarkerShapeBlock` rewrites `3MM → 4.58MM` (X, +6px) and
  `3MM → 3.26MM` (Y, +1px) inside marker shape blocks **only** —
  IDs 18, 19, 20, 21, 22, 23, 25, 26 in the Task master. The same
  `3MM` constant is reused by other body sub-shapes for body-relative
  positioning, so a global replace would shift the body too.
- **Stack-walking helper for shape blocks.** `nudgeMarkerShapeBlock`
  walks `<Shape>`/`</Shape>` opens-and-closes to find the matching
  close, since shapes nest and a non-greedy regex would mis-match.

### Body geometry alignment with selection rectangle

The big one. Visible body now matches Visio's selection rectangle for
Task, Subprocess, ExpandedSubprocess.

The full set of cached `V=` values that must be rescaled when an
instance's dimensions differ from the template's natural dimensions:

1. **Root Shape 5's own** Width / Height / LocPinX / LocPinY (explicit
   replacement — these are Sheet.5 itself, not a reference to it).
2. **Body sub-shapes (6, 7, 8, 9)** — every cell whose F contains
   `Sheet.[57]!Width` or `Sheet.[57]!Height`. Sheet.7 inherits from
   Sheet.5; without matching both, Shapes 8 and 9 stay at template size.
3. **LocPinX / LocPinY** with `F='Width*0.5'` / `F='Height*0.5'` — local
   refs that don't match the Sheet.5 regex but still need scaling, or
   sub-shapes draw with their pin off-centre.
4. **`<Section N='Geometry'><Row><Cell N='X' F='Width*1'/></Row></Section>`**
   cached V's. Easy to miss because they're nested two levels deep, and
   they're what Visio actually draws on first paint. *This was the final
   missing piece — six rounds of "still wrong" before we found it.*

`scaleLocalLocPin` covers cases 3 and 4 in a single per-shape walk: for
each Shape whose own Width F contains `Sheet.[57]!Width`, scale every
local-Width-ref V (LocPinX, Geometry X) by the same width ratio. Marker
shapes are correctly skipped because their Width F uses
`GUARD(10PT)*Sheet.5!DropOnPageScale` — no `Sheet.5!Width` match.

### Pool / Lane

- **`isResizable` includes Pool (master 19)** alongside Task (9) and
  Subprocess (33). Resize logic and per-instance master both apply.
- **Pool and Lane were the **proof of concept** for per-instance master
  cloning** — they worked first; everything else was made to mirror them.

---

## How we achieved it — design level

### The per-instance master pattern

**Problem.** Visio aggressively substitutes built-in masters. If we
modify `master2.xml` (the template Task) and reference it from the page,
Visio looks at the master's `BaseID` GUID and sees "this is the
BPMN_M Task I already have installed locally" — and silently reverts our
edits to its installed version.

**Alternatives considered.**
1. *Modify in place* with a fresh master file but reuse the original
   GUID — Visio still merged. Rejected.
2. *Drop our master and use Visio's built-in* — works but leaves no
   place to inject Diagramatix-specific colour/dimensions. Rejected.
3. *Clone per instance with fresh GUIDs* — what we did.

**Why cloning works.** Each instance gets `master1000+.xml` with a fresh
`BaseID` and `UniqueID`. Visio doesn't recognise the GUID, so it treats
the master as new content and renders exactly what we wrote. The cost is
a slightly larger `.vsdx` (one master per body-fill instance) — at
typical diagram sizes this is <100 KB extra, not a concern.

**Implementation.** `createInstanceMaster(srcMasterId, colour, w, h)`:
1. Find the source master block in `mastersXml` and its `Rel r:id`.
2. Look up the target file from `masters.xml.rels`.
3. Read the file content.
4. Bake colour into Shape 6.
5. Rescale cached V's if instance dimensions differ from natural.
6. Allocate a new master ID (1000+).
7. Clone the `<Master>` block with fresh `ID`, `UniqueID`, `BaseID`,
   `r:id`.
8. Append the cloned block to `mastersXml`, append the new
   `Relationship` to `masters.xml.rels`, append the `Override` to
   `[Content_Types].xml`, and write the cloned file content to
   `master<newId>.xml`.

This mirrors what Visio's own template does for Pool/Lane (which is what
gave us the idea — Pool/Lane was the only thing that worked end-to-end
in the early V3 rounds).

### Body colour — why scoped to Shape 6

**Problem.** Inject a `FillForegnd` cell into the master to pick up the
Diagramatix colour. The master has hundreds of `FillForegnd` cells —
inside marker shapes, inside icon sub-shapes, inside theme rows. A
global rewrite paints every marker the body colour.

**Design.** `bakeColourIntoMaster(content, colour)`:
1. Find Shape 6's block via `<Shape ID='6'[^>]*>...</Shape>` (Shape 6 is
   the body outline / fill across all body-fill masters).
2. Within that block only, rewrite cells matching
   `<Cell N='(FillForegnd|FillBkgnd)' V='..' F='GUARD(...)'/>` to use
   the new RGB.
3. Change `FillStyle='7'` to `FillStyle='3'` (theme-fallthrough → solid).
4. If the block has no `FillForegnd` cell at all, inject one plus a
   matching `FillPattern V='1' F='RGB(0,0,0)*0+1'/>` ahead of the
   geometry.

Marker shapes (IDs 10+) keep their own colours intact because the
function never touches them.

### Trigger marker map

**Problem.** Each event trigger maps to a different MasterShape and a
different subset of that shape's Geometry IX rows. Picking the wrong
subset shows the wrong icon (User vs Script bug) or a partial icon
(Send missing one half of its envelope).

**Design.** `TRIGGER_MARKER_MAP: Record<string, MarkerSpec[]>` where
each spec is `{shapeId, geomIxs[]}`. A trigger can map to multiple shape
IDs (Send → Group 20 with leaves 21, 22), and each spec carries which
specific Geometry rows to make visible via `NoShow='0' F='Inh'`.

Why arrays of `geomIxs`: the master has all icons baked in but hidden by
default (`NoShow='1' F='OR(NOT(Sheet.5!Actions.X.Checked), ...)'`). To
show one, we override that specific Row's `NoShow` to `'0'` on the
instance — which means we need to know exactly which Rows to override.
A trigger that touches three Rows needs three Geometry sections in the
instance stub.

### Stub generation — recursive tree walk

**Problem.** The body-fill instance needs to register every nested sub-
shape that the master contains, mirroring its Group/Shape hierarchy
exactly. A flat list misses nested children; a recursive descent that
allocates IDs in the wrong order produces ID collisions
(e.g. Group 404 and Shape 404 in the same diagram).

**Design.** A two-phase tree walk:
1. **Parse.** Iterate `<Shape ID='X' Type='...'>`/`</Shape>`/`<Shapes>`/
   `</Shapes>` tags inside the master's root Shape 5 with depth
   tracking, building a `StubNode` tree of `{id, type, children[]}`.
2. **Emit.** Recursively walk the tree. **Allocate the parent's instance
   ID first**, then recurse into children — otherwise the recursion
   advances the ID counter past the parent's intended ID and parent and
   leaf collide.

Each stub gets a single `<Cell N='LayerMember' V=''/>` plus, if the
node's master shape ID matches a trigger marker spec, the appropriate
`<Section N='Geometry' IX='X'><Cell N='NoShow' V='0' F='Inh'/></Section>`
rows to force the marker visible.

Stubs deliberately do **not** carry Width/Height/PinX/PinY/LocPinX/
LocPinY — those come from the per-instance master. (Earlier iterations
emitted instance-level dimension overrides and broke marker positioning;
the current design pushes all geometry into the master and keeps
instance stubs minimal.)

### Cached V rescaling — three layers

The core challenge: Visio paints from cached `V=` on first frame, then
re-evaluates formulas on later frames. We need cached V's to match the
formula's evaluated value at instance dimensions, or the user sees a
template-sized body until they interact with the shape.

**Layer 1 — direct Sheet refs.** Cells whose F contains
`Sheet.[57]!Width|Height` get V scaled by `instanceW / naturalW` (or H).
This catches Shapes 6, 7, 8, 9 and any other sub-shape that references
the body chain. Marker shapes use `Sheet.5!DropOnPageScale` and are
correctly skipped — the regex requires `Width|Height` directly after
`!`.

**Layer 2 — root Shape 5.** Shape 5's own `Width`/`Height`/`LocPinX`/
`LocPinY` don't reference Sheet.5 (they *are* Sheet.5), so a separate
explicit replacement targets them by name within Shape 5's block.

**Layer 3 — local refs (the missing piece).** Cells with `F='Width*X'`
or `F='Height*Y'` reference the local shape's Width/Height. After
Layer 1 updated a body shape's Width to `instanceW`, the LocPinX V was
still cached at `naturalW × 0.5`, drawing the body off-centre. Worse,
**Geometry-row X/Y cells** (`<Section N='Geometry'><Row><Cell N='X'
F='Width*1'/></Row></Section>`) cached at natural drew the body outline
at template size while the selection painted at instance size.

`scaleLocalLocPin` solves Layer 3 with a per-shape walk:
1. For each `<Shape ID='N'>`, slice out the "direct body" — content
   between the opening tag and either the next nested `<Shape ID='` or
   this shape's own `</Shape>`. Direct body excludes nested children's
   cells.
2. Inspect the shape's own `Width F` and `Height F` for `Sheet.[57]!`
   refs. If absent, this shape wasn't rescaled (it's a marker, an icon,
   or has constant size) — skip.
3. If rescaled, scan the direct body for any cell with
   `F='Width*X'`/`F='Height*Y'` and scale V proportionally.

The "direct body" boundary is what makes this safe — we never touch a
marker's local-ref cells because we never enter marker shapes from
inside a body-shape walk.

### Per-shape marker nudge

**Problem.** Task type markers anchor at `GUARD(3MM*Sheet.5!DropOnPageScale)`
in the master. After the body resize, that lands them on the top edge
of the resized body. Nudging requires `3MM → 4.58MM` (X, +6px) and
`3MM → 3.26MM` (Y, +1px). But the same `3MM` constant is reused by
other task body sub-shapes for body-relative positioning, so a global
replace shifts the body too.

**Design.** `nudgeMarkerShapeBlock(content, shapeId)` walks Shape
opens-and-closes to find the matching `</Shape>` for the given shape
ID, slices out exactly that block, and applies the `3MM → 4.58MM`
replacement inside the block only. Called per-shape for IDs 18, 19, 20,
21, 22, 23, 25, 26 in the Task master.

The walk is necessary because Shape elements nest. A naïve regex
`<Shape ID='18'[\s\S]*?</Shape>` would match the first `</Shape>` it
finds — which could be a child Shape inside Shape 18, not Shape 18's
own close.

---

## Non-obvious technical insights

- **Visio paints the first frame from cached `V=`, not from formulas.**
  Formulas (`F='Sheet.5!Width*1'`) are only evaluated on
  re-render/recalc — first paint uses whatever `V=` says. Get the cached
  V right or live with a flash of mis-sized geometry until the user
  touches the shape.

- **`Sheet.7` inherits from `Sheet.5` in BPMN_M Task masters.** Body
  sub-shapes 8 and 9 reference `Sheet.7!Width|Height`, so a regex that
  only matches `Sheet.5!` will miss them entirely. Match `Sheet.[57]!`.

- **Geometry-row X/Y cached V's must be rescaled too.** They live inside
  `<Section N='Geometry'><Row>...</Row></Section>` and their formulas
  (`F='Width*1'`, `F='Height*0.66'`) reference local Width/Height — but
  the cached V is at template natural size. Ignore them and the body
  outline draws at template size while the selection rectangle is at
  instance size.

- **Per-instance instance-level overrides break markers.** Putting
  `<Cell N='PinX' V='..' F='Inh'/>` on instance sub-shapes (the v9
  approach) does fix body alignment but kills the master's marker
  positioning, dumping markers on the top edge. Per-instance master with
  cached-V rescaling is the only path that gives both.

- **The same constant in a master can mean different things.**
  `GUARD(3MM*Sheet.5!DropOnPageScale)` appears as a marker offset
  *and* as a body-shape position cell. A global replace shifts both;
  scope it to specific Shape ID blocks.

- **GUIDs matter.** Per-instance masters need fresh `BaseID` and
  `UniqueID` GUIDs, or Visio merges them and discards everything we
  baked in.

---

## Outstanding work

- **Data Object** body still doesn't match its selection rectangle
  (the only non-event element where the alignment fix doesn't yet stick).
- **Gateway markers** — Exclusive / Inclusive / Parallel / EventBased —
  need the same NoShow + Actions + IsCustomName treatment that events
  and tasks now have.
- **Subprocess plus marker** — same.
- **Inner event ring** — Intermediate and End events have a double ring;
  the inner ring should pick up the body colour, not stay white.
- **Connector attachment points** — sequence flows don't always land on
  the shape's connection points.
- **Manual marker** — Visio's Manual icon is cleaner than Diagramatix's;
  optional swap deferred.

---

*Last updated 2026-05-02, build v1.8.579.*
