# Diagramatix — Quick Reminder Sheet 12

## AI Generation for Domain Diagrams

Diagramatix can build a Domain (UML class) diagram two ways: from a written description of the domain, or by **reproducing an uploaded image** of an existing class diagram. Both open from the AI panel, which also supports saved prompts, dictation, and attachments.

### From a description

Type what the domain contains — the entities, their attributes, and how they relate — and press **Generate**. The model returns the entities and relationships, and Diagramatix lays them out on the canvas. The generator understands the full domain vocabulary:

- **Elements**: entities (classes), enumerations, packages, and notes (plus pain-point markers).
- **Relationships**: association, aggregation, composition, generalisation, dependency, realisation, containment, and note-anchor.
- It applies UML rules for abstract classes, multiplicities, role names vs. association names, navigability, and arrow direction automatically.

### From an image (image ingestion)

This is the fastest way to digitise an existing diagram:

- Use **Attach** to add an image of a UML class diagram — a photo, screenshot, or export (PNG, JPEG, WebP, or GIF, up to 10 MB).
- The panel auto-fills a "reproduce the attached diagram exactly" prompt. The image is sent to the model as a vision input, which reads (OCRs) the classes, attributes, operations, and connectors and treats the picture as the source of truth.

### Layout preservation

Rather than re-flowing the diagram onto a grid, the model reports each element's **position and size as fractions of the image**, plus package nesting and which side each connector attaches to. Diagramatix rebuilds the diagram keeping the **original proportions and arrangement**, so the result looks like the picture you supplied. Association-end roles default to public `+`, and constraint boxes are placed outboard of the roles and multiplicities.

### Models

Domain generation uses the same default model as the rest of the app — **Haiku 4.5** — overridable by the SuperAdmin AI-model setting.

---
*Tip: After an image import, check role visibility and multiplicities against the original — the model reads them well, but a quick pass catches anything faint in the source image.*
