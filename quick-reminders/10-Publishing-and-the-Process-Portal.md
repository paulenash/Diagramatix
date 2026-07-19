# Diagramatix — Quick Reminder Sheet 10

## Publishing and the Process Portal

Publishing turns a working diagram into a frozen, versioned "process of record" that your audience reads in a clean, read-only viewer. It is a two-stage model: publish individual diagrams into immutable versions, then optionally bundle published diagrams for a specific audience. The Process Portal is where people discover and read what has been published.

### Publishing a diagram

- Only the **Diagram Owner** can publish it — this preserves clear accountability for the published content.
- Publishing creates a new immutable **Published Version**: a frozen snapshot of the name, type, content, colours, and display mode, with an auto-incrementing version number. The previous version is superseded, the diagram's lifecycle becomes **Published**, and a next-review date/cadence is set. You can add release notes.

### The process viewer

- A published diagram opens **read-only** at its latest version, showing a version pill, the published date and author, the **Process Owner** and **Diagram Owner**, any linked procedure document, and APQC attribution.
- **Drill-down**: clicking a linked subprocess navigates into that diagram, with a Back stack to return — so readers can move through a whole linked process hierarchy.
- Readers can submit **Feedback** (optionally pinned to a specific element) straight to the diagram owner.

### Bundles

- A **bundle** packages one or more **root** published diagrams *plus their full set of linked diagrams* and grants them to an **audience** (org members, or people invited by email who are enrolled when they sign up).
- You must own every root diagram, every linked diagram must already be published, and a bundle cannot span projects. Each audience member is notified.

### The Process Portal

- The **Portal** is an organisation-scoped, read-only place to **discover** published diagrams you already have access to — search, filter, and sort by diagram type, APQC (PCF) category, entity, or "involving me".
- It never widens visibility: you only ever see what you already have rights to. Login is required; nothing on the Portal is public.

---
*Tip: Publish the Value Chain as a root and bundle its linked detail — readers get one entry point that drills all the way down.*
