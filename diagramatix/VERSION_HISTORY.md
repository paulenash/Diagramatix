# Diagramatix — Version History

Running, human-readable log of **every** release — feature-only *and* schema-bearing. This is
the single place a feature-only release is recorded (the schema-scoped histories in
[`schema/SCHEMA_CHANGELOG.md`](schema/SCHEMA_CHANGELOG.md), the XSD, and `types.ts` only move on
a `schemaVersion` bump). Newest first.

- **Version shown** = `appVersion` = `schemaVersion` + `.` + git commit count (the build number).
- Maintained per [`schema/UPDATE_EVERYTHING.md`](schema/UPDATE_EVERYTHING.md) Step 5, on every
  release.
- Earlier history (pre-`1.44` feature window, v1.0 → v1.43) lives in
  [`schema/SCHEMA_CHANGELOG.md`](schema/SCHEMA_CHANGELOG.md).

---

## 1.44.2129 — 2026-08-08 — True-to-layout Word preview (LibreOffice)
- SOP and Diff-Processes **Preview** now renders the real `.docx` → PDF via headless LibreOffice
  (`soffice`), reproducing styled headings, org Word-template branding, page breaks, and the
  landscape figure page — replacing the mammoth content-only approximation.
- New `app/lib/documents/docxToPdf.ts` (per-call temp profile, concurrency-safe, 60s timeout);
  SOP route gains `?format=pdf`, the Diff route gains `mode:"pdf"` (live + saved runs).
- Robust fallback: if conversion fails (e.g. local dev without LibreOffice) Preview
  automatically falls back to the mammoth content preview, so it never breaks. Download stays
  `.docx`.
- Docker: runner image adds `libreoffice` + `ttf-liberation` + `font-noto`, `HOME=/tmp`.
- Schema: no bump (infra + route param only).

## 1.44.2128 — 2026-08-08 — Export menu: Preview / Download flyouts
- Every File ▸ Export format (PDF, SVG, JSON, XML, XSD, BPMN, Visio) now opens a small flyout with
  two explicit choices — **👁 Preview** (the in-app pop-up) and **⬇ Download** (export as usual) —
  replacing the easily-missed inline eye icon (JSON preview was there but hard to spot).
- New standalone **XSD (schema)** leaf: Preview renders the live `/api/schema` XSD; Download saves
  the `.xsd` (it also rides along with the XML download).
- Schema: no bump (menu UI only).

## 1.44.2127 — 2026-08-08 — Version-tracking process + history
- Added [`schema/UPDATE_EVERYTHING.md`](schema/UPDATE_EVERYTHING.md) — the canonical, repeatable
  "update everything" procedure (Steps 0–12: version bump decision, the four schema-sync files,
  this history, atomic commit/deploy, and the DB-backed User Guide / Features / Tech-Notes
  updates).
- Added this `VERSION_HISTORY.md`, seeded from git.
- Schema: no bump (docs-only; no persisted-data-structure change).

## 1.44.2126 — 2026-08-08 — File Preview pop-ups
- In-app preview for exports so they can be shown on camera during screencasts (no download):
  PDF, SVG, JSON, XML, BPMN, DOCX (via mammoth), and DDL, plus a cosmetic **fake-Visio** window
  (blue ribbon + BPMN Shapes stencil + diagram SVG on a Visio grid).
- Peaceful-JSON syntax highlighting for JSON/XML/BPMN/DDL on a dark code panel; `data-no-capture`
  so the preview never leaks into a screen capture.
- Wired into File ▸ Export, the Diff Processes report + saved-run screens, the SOP editor, and
  the SuperAdmin DDL generator.
- Schema: no bump (feature-only).

## 1.44.2122 — 2026-08-08 — Screencast recording resilience
- Never lose a recording: persist chunks during capture and recover after an interruption
  (e.g. navigating to the Portal mid-record).
- Schema: no bump (feature-only).

## 1.44.2121 — 2026-08-08 — Mobile phone UI
- Dedicated `/m` route tree: auth entry, Projects list + create, and a read-only pan/zoom
  diagram viewer for phones.
- Schema: no bump (feature-only).

## 1.44.2119 — 2026-08-08 — Diff Processes run history + management
- Persisted Diff Processes runs (schema + API); run history surfaced on both diagrams'
  properties; OrgAdmin + SuperAdmin management screens; "View Before/After process" buttons;
  reusable `ProcessDiffResults` with Save / auto-save.
- Schema: no bump (rode on 1.44; predates this formalized procedure).

## 1.44.2112 — 2026-08-08 — Backups & export carry simulation configuration
- Scoped user + org backups and project JSON export/import now include the full simulation
  configuration; JSON + AI bundle are full-fidelity (always include annotations).
- Schema: no bump (rode on 1.44).

## 1.44.2110 — 2026-08-08 — Diff Processes analysis depth
- Diff BPMN message flows, dedicated Data Objects section, task-marker → automation-shift
  interpretation, intermediate + boundary events, and a Review-status section
  (Comments / Pain Points / Issues / Bottlenecks); Merge folds cherry-picked differences into a
  new diagram (SuperAdmin); AI summary in the Word export.
- Schema: no bump (rode on 1.44).

## 1.44.2099 — 2026-08-07 — Diff Processes (initial)
- Diagram ▾ menu: tabular comparison of two BPMN process versions (who / systems / what) → table
  + CSV / .docx + optional AI narrative; reuses the SOP skeleton extractor.
- Schema: no bump (rode on 1.44).

## 1.44.2097 — 2026-08-07 — Visio export Error-275 fix
- Dedupe Visio master IDs (a Pool/Lane collision caused Visio Error 275 on open); review-comment
  no longer drops a spurious tether on placement; opaque rich-text editor.
- Schema: no bump (fix release).
