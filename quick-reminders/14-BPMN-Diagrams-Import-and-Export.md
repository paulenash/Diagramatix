# Diagramatix — Quick Reminder Sheet 14

## BPMN Diagrams — Import & Export

Diagramatix reads and writes BPMN diagrams in several interchange formats, so you can bring in models from other tools and hand yours off to them. Import and export live under the editor's **File** menu.

### Importing

**BPMN 2.0 XML** (`.bpmn` / `.xml`) — *File ▸ Import ▸ BPMN.* Reads standard OMG BPMN 2.0 interchange XML and is namespace-agnostic, so files from Signavio, Camunda, and bpmn.io all load. A multi-participant collaboration comes in as **multiple pools** on one canvas, and the original pixel positions are preserved. Shapes or flows it can't classify are dropped and listed in a warnings report.

**Visio VSDX** (`.vsdx`) — *File ▸ Import ▸ Visio.* Parses a Visio drawing including Microsoft **Cross-Functional Flowchart** pools and lanes (detected from Visio's own lane metadata, not master names). Decorative helper shapes are ignored; anything unrecognised is dropped and reported.

**Visio VSDX — bulk / multi-page** — From a project's page, the bulk-Visio dialog lets you pick pages from a multi-page `.vsdx` and creates **one diagram per page** into the project.

**JSON / Diagramatix XML** — *File ▸ Import ▸ JSON/XML* loads a diagram previously exported from Diagramatix (replaces the current diagram).

*Note: uploading a photo or screenshot of a diagram to the AI panel **generates** a new diagram — it is AI reconstruction, not a fidelity-preserving file import.*

### Exporting

**Visio VSDX** — *File ▸ Export ▸ Visio.* The standard BPMN export, built against the shipped Visio stencil. Colours follow your layered colour configuration (defaults → project → diagram), and connectors and shape outlines are written with cached geometry so the diagram renders correctly the instant Visio opens it. A whole project can be exported as one **multi-page** `.vsdx` (non-BPMN diagrams are skipped).

**PDF** — *File ▸ Export ▸ PDF*, with a scale option (100 / 75 / 50 / 25%).

**SVG** — *File ▸ Export ▸ SVG*, a crisp vector image for documents and slides.

**JSON** — a single-diagram file that round-trips back through *Import ▸ JSON*.

**Diagramatix XML (+ XSD)** — a schema-validated XML export of the BPMN diagram, with its matching XSD.

*There is no PNG export — use SVG or PDF for images.*

### Round-trip notes

- BPMN travels **both ways** through Visio VSDX (import and export); Visio export covers BPMN diagrams only.
- Colours survive to Visio via the diagram's colour configuration; per-shape colours carried in from a foreign file are kept only internally, not re-emitted.

---
*Tip: For a clean hand-off to a Visio user, set your colours in Diagramatix first — the export bakes them into the stencil so the file opens on-brand.*
