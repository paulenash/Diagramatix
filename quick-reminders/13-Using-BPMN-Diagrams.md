# Diagramatix — Quick Reminder Sheet 13

## Using BPMN Diagrams

Practical techniques for building and maintaining BPMN models in the Diagramatix editor.

### Pools, Lanes & Sublanes

Drag the **Pool/Lane** palette symbol onto empty canvas to create a pool (it auto-switches between black-box and white-box as you add content). There is no "Add Lane" button — instead **drop the same Pool/Lane symbol onto an existing pool or lane**, and where you drop decides the result: near the **top or bottom edge** adds a sibling lane above/below; onto the **middle of a lane** splits it into sublanes. Reorder lanes with the **↑ Up / ↓ Down** buttons in the lane's Properties. The pool auto-grows and everything below shifts down, so contained elements and boundary events move with their lane.

### Templates (starting point or fragments)

Use the **Templates** dropdown on the BPMN toolbar to reuse work. **Select** some elements and **Save as Template** to capture them (with their connectors); **Apply** a template to drop a fresh copy centred on the canvas. Apply into a **blank diagram** to use it as a *starting point*, or into an **existing diagram** to insert a *fragment*. Templates come in **User** and **Built-In** scopes, can be grouped, and export/import as a `.diag_tems` file to share.

### Inserting Space

On the toolbar, open **Space ▾ → Insert Space** to open up room in a crowded diagram. A green marker appears at the centre of the view — position it where you want the gap, then **Shift+drag** to push the surrounding elements apart. (Available on BPMN and state-machine diagrams.)

### Deleting Space

**Space ▾ → Remove Space** closes a gap. Two red markers define the zone to remove; reposition them, then press **Enter** to collapse it (**Esc** cancels). A dialog lets you choose, per element in the zone, whether to delete, preserve, or shrink it.

### Linking to Other Diagrams

Give an element a **Linked Diagram** in its Properties (a **subprocess** links to another BPMN diagram; a **package** links to a domain diagram). **Double-click** the linked element to drill in — Diagramatix keeps a breadcrumb stack so you can navigate back out. You can also convert an expanded subprocess's contents into a new linked child diagram.

### Expanded Subprocesses — Loops & Interrupting Events

Model a repeating block with an **Expanded Subprocess** and set its **Repeat** to `loop`, `mi-sequential`, or `mi-parallel` (a loop/multi-instance marker appears). To break out of the loop, attach a **boundary event**: drag an event onto the subprocess **edge** (or tick *Edge-mounted*), then set its **Interruption** to *interrupting* so the event cancels the loop, or *non-interrupting* to fire without stopping it.

---
*Tip: Save a recurring pool-and-lane skeleton as a Built-In template so every new process starts from your house style.*
