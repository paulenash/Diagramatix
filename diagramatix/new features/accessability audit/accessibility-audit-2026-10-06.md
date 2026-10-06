---
title: "Diagramatix — Accessibility Audit"
subtitle: "WCAG 2.2 Level AA, static code review — 6 October 2026"
date: "6 October 2026"
---

# Diagramatix — Accessibility Audit

**Date:** 6 October 2026 · **Standard:** WCAG 2.2 Level AA (the benchmark behind Australia's Disability Discrimination Act 1992 guidance and AS EN 301 549:2020) · **Method:** static review of the code in `diagramatix/app/` (392 `.tsx` files)

## 1. Read this first — what this audit is and is not

This is a **code review**, not a conformance test. It was done by searching and reading the source, measuring colour contrast arithmetically from the Tailwind colours the code uses, and reading the shared components in full. It did **not** include:

- an automated scan with axe-core or Lighthouse against running screens;
- testing with a screen reader (NVDA, JAWS, VoiceOver) or with keyboard-only use of the real application;
- testing at 200% / 400% zoom, at 320 px width, or with Windows High Contrast;
- testing with real users who have a disability.

So every number below is a **count of how often a pattern appears in the code**, not a count of confirmed failures on a screen. Where a finding rests on a count alone, the text says so. Treat the conformance table in section 6 as **provisional** until the checks above have been done. Nothing here is legal advice.

## 2. Summary

Diagramatix has a better starting point than most diagramming tools, and four serious gaps.

**What is already good**

- Every `<img>` has a text alternative; the document language is declared (`lang="en"`); there are 50 `<main>`, 10 `<nav>`, 59 `<header>` and 91 `<h1>` elements, so landmarks and headings exist.
- The sign-in and registration forms use real `<label>` elements with `htmlFor`, correct `autocomplete` values, and do not block paste (so password managers work — WCAG 3.3.8).
- The drawing canvas takes keyboard focus and has arrow-key nudging for elements and connectors.
- Animations (the Matrix backdrop, the heal and gold flash overlays) honour `prefers-reduced-motion`.
- There is a screen **brightness and contrast** control (System ▸ Display), applied before first paint.
- The app never uses browser `alert` / `confirm` / `prompt` dialogs, which are poorly handled by some assistive technology.
- Voice editing, the editable AI plan (a structured text view of a diagram) and SOP generation (a written procedure from a diagram) are real alternatives to mouse drawing, even though none is presented as an accessibility feature today.

**The four serious gaps**

1. **Text contrast.** The commonest secondary-text colour, `text-gray-400`, is used 883 times and measures **2.54:1** on white (4.5:1 is required). White text on green-600 buttons is **3.30:1**. The Matrix-styled screens use 132 low-opacity text tints, some below 3:1.
2. **Dialogs.** About 97 files draw their own full-screen overlay; only 9 mark it as a dialog. The shared `ConfirmDialog` has no dialog role, no accessible name, no Escape key, no focus containment — and it **focuses the destructive button by default**.
3. **Keyboard and naming holes in common controls.** The show/hide password buttons on the sign-in and registration pages are removed from the tab order (`tabIndex={-1}`) and have no label; 15 of 20 icon-only "✕" buttons have no accessible name; the canvas hides its focus outline.
4. **The canvas itself.** The drawing area is a single focusable element with no role, name or description; individual shapes cannot be reached or announced. This is the hardest problem and is partly inherent to a graphical editor — but it is also where the existing text-based alternatives matter most.

Section 4 lists 22 findings; section 5 is a four-phase plan whose first phase (about two days) fixes most of the shared-component problems.

## 3. How severity is rated

| Rating | Meaning |
|---|---|
| **High** | Blocks a task entirely for some users, or fails a Level A criterion in a core path (sign-in, dialogs, the canvas). |
| **Medium** | Makes a task hard, or fails a Level AA criterion widely, with a workaround. |
| **Low** | A defect that is real but rarely stops anyone. |

## 4. Findings

Columns: **#** · **WCAG criterion** · **Severity** · **Where / evidence** · **Fix** · **Effort** (S = under a day, M = a few days, L = a week or more).

### 4.1 Perceivable

| # | Criterion | Sev. | Where / evidence | Fix | Effort |
|---|---|---|---|---|---|
| A1 | **1.4.3 Contrast (Minimum)** | **High** | `text-gray-400` ×883 = **2.54:1** on white, 2.43:1 on gray-50; `text-gray-300` ×58 = 1.47:1. `bg-green-600` with white text ×27 = **3.30:1**. (`text-gray-500` = 4.83:1 passes; so do blue-600/700, green-700, red-600, amber-700, orange-700.) Many of the 883 are hints and secondary labels that carry real information. | Replace informational `text-gray-400` with `text-gray-500` (a mechanical sweep, then review the genuinely decorative uses); use `green-700` for solid green buttons; add a lint rule that bans `text-gray-300/400` on text. | M |
| A2 | **1.4.3 Contrast** — Matrix and Miner screens | **High** | 132 uses of `text-green-*/30–50` and `text-amber-*/30–50` on black or stone. Measured: green-400 at 50% on black = **3.43:1**, at 40% = **2.53:1**; both fail. (The unfaded colour is 12:1 and fine.) | Set a floor of about 65% opacity for any text that carries meaning; keep lower opacity only for decoration. | S |
| A3 | **1.4.4 Resize text / 1.4.12 Text spacing** | Medium | 1,399 uses of fixed-pixel text `text-[8px]`, `[9px]`, `[10px]`. Pixel sizes do not follow the browser's text-size setting, and 8–10 px is hard to read before any zoom. (Tailwind's `text-xs` and larger are in `rem` and do follow it.) Count only — not tested at zoom. | Make 12 px (`text-xs`) the floor for readable text; convert the rest to `rem`; test at 200% zoom. | M–L |
| A4 | **1.4.11 Non-text contrast** | Medium | Not measured. Likely candidates: `border-gray-200` controls and the `ring-1` selected-tile outlines against white. | Measure borders of inputs, buttons and focus rings against 3:1; darken to `gray-400` or stronger where they fail. | S |
| A5 | **1.4.13 Content on hover or focus** | Medium | 1,168 `title=` tooltips; 37 buttons have a `title` and no `aria-label`. Native tooltips appear on mouse hover only — not on keyboard focus, not on touch — and cannot be dismissed or hovered. | For icon-only controls, give an `aria-label` as well; for important help, use a tooltip component that opens on focus and on hover and closes on Escape. | M |
| A6 | **1.1.1 Non-text content** — the canvas | **High** | The drawing is one SVG with `tabIndex=0` but no `role`, no accessible name, no `<title>`/`<desc>` describing the diagram. 166 `<svg>` icons in the app, only 43 marked `aria-hidden` (decorative icons are announced as noise). | Give the canvas `role="application"` (or `img`) with an `aria-label` naming the diagram and a one-line summary ("BPMN diagram, 24 elements, 2 pools"); hide decorative icons. See also A12. | S |
| A7 | **1.3.1 Info and relationships** — form labels | **High?** | 572 `<input>`, 200 `<select>`, 56 `<textarea>`; only 4, 2 and 0 carry an `aria-label`. Many may be labelled by a wrapping `<label>` or sit beside text that is **not** programmatically associated (placeholder-only fields are the usual failure). The sign-in and registration forms are correct. **Count only — not confirmed per field.** | Run axe-core over the dashboard, project screen, editor properties panel and admin screens to find the unlabelled fields; add `<label htmlFor>` or `aria-label`. | M |
| A8 | **1.3.1** — tables | Low | 299 `<th>` elements, 9 with `scope`. Modern assistive technology infers column headers inside `<thead>`, so this seldom fails in practice. | Add `scope="col"` in the shared table pattern. | S |

### 4.2 Operable

| # | Criterion | Sev. | Where / evidence | Fix | Effort |
|---|---|---|---|---|---|
| A9 | **2.1.1 Keyboard** — show/hide password | **High** | `app/(auth)/login/page.tsx:102` and the registration page: the toggle button has `tabIndex={-1}` and no `aria-label`. A keyboard or screen-reader user cannot reveal the password. | Remove `tabIndex={-1}`; add `aria-label="Show password"` / `"Hide password"` and `aria-pressed`. | S |
| A10 | **2.1.2 No keyboard trap / 2.4.3 Focus order / 4.1.2** — dialogs | **High** | ~97 files draw `fixed inset-0` overlays; 9 declare `role="dialog"` or `aria-modal`. There is **no focus trap** anywhere, so Tab walks out of an open dialog into the page behind it. `ConfirmDialog` (used widely) has no role, no name, no Escape handling, no focus return, and `autoFocus` on the **destructive** confirm button — one stray Enter deletes. `RenameDialog` and `MoveToProjectDialog` are better (role, name, Escape). | Build one accessible `Modal` base (role, `aria-modal`, `aria-labelledby`, focus trap, Escape, return focus to the opener) and move `ConfirmDialog` onto it first; make **Cancel** the default focus for destructive confirms; then migrate the other overlays gradually. | M |
| A11 | **2.4.7 Focus visible** | **High** | `outline-none` ×154; 19 of those lines have no replacement ring on the same line. The **canvas root** (`tabIndex=0`, `outline-none`) shows no focus indicator at all. No global `:focus-visible` rule exists in `globals.css`. (105 uses of `focus:ring` / `focus-visible` show good practice in places.) | Add a global `:focus-visible { outline: 2px solid …; outline-offset: 2px }` in `globals.css`; stop using bare `outline-none` (use `focus-visible:ring-*`); give the canvas a visible focus ring. | S |
| A12 | **2.1.1 Keyboard** — the canvas | **High** | The canvas handles arrow-key nudging of the *selected* element or connector. But shapes are SVG groups with no `tabIndex`, so there is no keyboard way to **select** one (no Tab / arrow traversal), nothing is announced when selection changes, and creating a shape needs a drag (A13). | Add roving-focus traversal (Tab / arrow keys move selection between elements), an `aria-live` region announcing "Task 'Check enquiry' selected, in lane Front Office", and Enter to open properties. | L |
| A13 | **2.5.7 Dragging movements** (new in 2.2) | Medium–High | 42 files use `draggable`. The palette places shapes by dragging, the Image Library replaces images by drag-and-drop, lanes and palette categories reorder by drag (categories also have ▲/▼ buttons — good). No click-to-place alternative was found for the palette; the voice command "put a task here" is an alternative but not a documented one. **Needs verification in the running app.** | Add click-to-add (select a shape, then click the canvas, or press Enter to place it at the viewport centre); add a "Replace…" button beside Image Library drag-and-drop. | M |
| A14 | **4.1.2 Name, role, value** — icon-only buttons | Medium | 15 of 20 "✕ / × / ✖" close buttons have no `aria-label` (some dialogs, e.g. `MoveToProjectDialog`, do label theirs). Screen readers announce "multiplication x". | Add `aria-label="Close"`; make a shared `<IconButton label>` so it cannot be omitted. | S |
| A15 | **4.1.2** — custom widgets | **High?** | `role="tree"`, `treeitem`, `tab`, `tablist`, `listbox`, `combobox`: **zero** uses. The navigation tree, the Properties tab strip and the cascading menus are built from plain `div` / `button`. Only `ContextMenuPopup` has `role="menu"`, and it has no arrow-key navigation. 73 `<div>` / `<span>` elements carry `onClick` (one declares `role="button"`). **Count only.** | Give the tree, tabs and menus their ARIA roles and arrow-key behaviour; convert clickable `div`s to `<button>`. | L |
| A16 | **2.4.1 Bypass blocks** | Medium | No "Skip to main content" link anywhere; the 50 `<main>` landmarks are an acceptable alternative technique, but a skip link is cheap and expected. | Add a skip link to the root layout, visible on focus. | S |
| A17 | **2.4.2 Page titled** | Medium | Only 38 of 94 `page.tsx` files set a title; the rest — including **sign-in, register and password reset** — show the generic "Diagramatix". Client-side screens never update `document.title` (0 uses). | Export `metadata` from every page; update `document.title` for the diagram and project screens ("Order to Cash — Diagramatix"). | S–M |
| A18 | **2.5.8 Target size (Minimum)** (new in 2.2) | Medium | Many controls are small text buttons (`text-[10px]` with `px-1.5 py-0.5` ≈ 16–20 px tall). The 24×24 px minimum applies unless spacing or an equivalent control exists. **Not measured.** | Measure with the browser's accessibility tools; give small controls a larger hit area. | M |

### 4.3 Understandable

| # | Criterion | Sev. | Where / evidence | Fix | Effort |
|---|---|---|---|---|---|
| A19 | **3.3.1 Error identification / 3.3.3 / 4.1.3 Status messages** | **High?** | `aria-live` appears once in the app and `role="alert"` never; `role="status"` 7 times; `aria-invalid` / `aria-describedby` once in total. Errors ("Registration failed", "Incorrect password", save failures) are plain text and not announced; fields are not marked invalid. | Put `role="alert"` on error summaries; set `aria-invalid` and `aria-describedby` on the offending field; announce save / import / generation outcomes through one shared live region. | M |

### 4.4 Robust and general

| # | Criterion | Sev. | Where / evidence | Fix | Effort |
|---|---|---|---|---|---|
| A20 | **1.4.10 Reflow** | Medium | Not tested. The editor is a fixed multi-panel layout and cannot reflow to 320 px by nature; the `/m` mobile viewer and reviewer may. Single-page screens (dashboard, project, admin) are likely to scroll in two directions at narrow widths. | Test the non-editor screens at 320 px and 400% zoom; record the editor as an accepted exception with the mobile viewer as the alternative. | M |
| A21 | **1.4.1 Use of colour** | Medium | Not assessed in depth. Example-project tiles are tinted by feature colour but also carry a text badge (good); validation markers and status chips need checking for a non-colour cue. | Review red/green status indicators for a text, icon or pattern cue. | S |
| A22 | **Process** — no automated check | Medium | There is a Playwright e2e suite and many CI ratchets, but nothing runs an accessibility scanner. | Add `@axe-core/playwright` to the e2e suite for the main screens, with a ratchet that fails the build if serious violations rise (the same approach as the overlap ratchet). | M |

## 5. Remediation plan

The aim is to fix the shared pieces first, so one change repairs many screens.

**Phase 1 — shared components and quick wins (about 2 days).** A9 show/hide password · A11 global focus ring and a visible canvas focus · A10 an accessible `Modal` base, `ConfirmDialog` moved onto it, Cancel focused for destructive confirms · A14 an `IconButton` with a required label and the 15 unlabelled close buttons · A16 a skip link · A17 titles for the auth and admin pages · A6 a name and summary on the canvas · A19 `role="alert"` on the sign-in and registration error blocks · A2 the opacity floor on the Matrix screens.

**Phase 2 — contrast and text size (about 3 days).** A1 the `text-gray-400` → `gray-500` sweep and a lint rule · green-600 → green-700 buttons · A3 a 12 px minimum for readable text · A4 non-text contrast measured and fixed.

**Phase 3 — widgets and forms (about 1–2 weeks).** A7 an axe pass over every main screen and the labels it finds · A15 ARIA roles and arrow keys for the navigation tree, tab strips and menus; clickable `div`s become buttons · A5 an accessible tooltip · A13 click-to-add and a Replace button · A18 target sizes · A19 a shared live region for save and generation outcomes.

**Phase 4 — the canvas (about 2–4 weeks, and the hardest).** A12 keyboard selection traversal, announcements and Enter-to-open-properties · a text **Structure** view of the diagram beside the canvas (the AI plan tree already does most of this) so that a screen-reader user can read and edit the model without the picture · publish the existing voice, SOP and plan features as the documented accessible routes.

**Alongside:** A22 add axe-core to the e2e suite as a ratchet; test with NVDA and with keyboard only; then publish an Accessibility Conformance Report (the VPAT format) and a short accessibility statement.

## 6. Provisional conformance table (WCAG 2.2 A and AA)

"Not evaluated" means this review did not test it — not that it passes.

| Criterion | Status | Notes |
|---|---|---|
| 1.1.1 Non-text content | Partially supports | Images have alt text; the canvas and decorative icons do not (A6). |
| 1.2.x Time-based media | Not evaluated | Screencast Studio output not reviewed. |
| 1.3.1 Info and relationships | Partially supports | Landmarks and headings present; custom widgets and some form labels missing (A7, A15). |
| 1.3.2 Meaningful sequence | Not evaluated | |
| 1.3.4 Orientation | Not evaluated | |
| 1.3.5 Identify input purpose | Supports (auth forms) | Correct `autocomplete`; other forms not reviewed. |
| 1.4.1 Use of colour | Not evaluated | A21. |
| 1.4.3 Contrast (Minimum) | **Does not support** | A1, A2. |
| 1.4.4 Resize text | Not evaluated | A3. |
| 1.4.10 Reflow | Not evaluated | A20. |
| 1.4.11 Non-text contrast | Not evaluated | A4. |
| 1.4.12 Text spacing | Not evaluated | A3. |
| 1.4.13 Content on hover or focus | **Does not support** | A5. |
| 2.1.1 Keyboard | Partially supports | Canvas nudging works; password toggle, selection and placing shapes do not (A9, A12). |
| 2.1.2 No keyboard trap | Not evaluated | No trap found, but dialogs do not contain focus (A10). |
| 2.2.2 Pause, stop, hide | Partially supports | Decorative animations honour reduced motion. |
| 2.3.1 Three flashes | Not evaluated | |
| 2.4.1 Bypass blocks | Partially supports | Landmarks, no skip link (A16). |
| 2.4.2 Page titled | Partially supports | A17. |
| 2.4.3 Focus order | Not evaluated | Dialogs (A10). |
| 2.4.6 Headings and labels | Partially supports | |
| 2.4.7 Focus visible | **Does not support** | A11. |
| 2.4.11 Focus not obscured | Not evaluated | |
| 2.5.7 Dragging movements | **Does not support** (to verify) | A13. |
| 2.5.8 Target size (Minimum) | Not evaluated | A18. |
| 3.1.1 Language of page | Supports | `lang="en"`. |
| 3.2.6 Consistent help | Not evaluated | |
| 3.3.1 Error identification | Partially supports | A19. |
| 3.3.2 Labels or instructions | Partially supports | A7. |
| 3.3.7 Redundant entry | Not evaluated | |
| 3.3.8 Accessible authentication (Minimum) | Supports | No paste blocking, no cognitive test; password manager works. |
| 4.1.2 Name, role, value | Partially supports | A10, A14, A15. |
| 4.1.3 Status messages | **Does not support** | A19. |

## 7. Why this matters here

The Disability Discrimination Act 1992 applies to services provided over the web, SaaS included, and a complaint would be judged against WCAG. Government and large-enterprise buyers will ask for an Accessibility Conformance Report as part of procurement, and a vendor that cannot supply one loses the tender before the product is looked at. Phases 1 and 2 are small enough to do before any customer asks; Phase 4 is the work that would make the product genuinely usable without a mouse.

## Appendix — measurements

Contrast ratios (WCAG relative luminance, computed from the Tailwind hex values):

| Colour | On white | On gray-50 |
|---|---|---|
| gray-300 `#d1d5db` | 1.47 | 1.41 |
| gray-400 `#9ca3af` | 2.54 | 2.43 |
| gray-500 `#6b7280` | 4.83 | 4.63 |
| gray-600 `#4b5563` | 7.56 | 7.23 |
| blue-600 `#2563eb` | 5.17 | 4.95 |
| green-600 `#16a34a` | 3.30 | 3.15 |
| green-700 `#15803d` | 5.02 | 4.80 |
| red-600 `#dc2626` | 4.83 | 4.62 |
| amber-700 `#b45309` | 5.02 | 4.81 |

On black: green-400 at full strength 12.05:1; at 50% opacity 3.43:1; at 40% 2.53:1. White text on blue-600 is 5.17:1; on green-600 it is 3.30:1.

Counts across `diagramatix/app` (`.tsx`, plus `.css` where noted): `aria-label` 111 · `role="dialog"` or `aria-modal` 9 · `role="alert"` or `aria-live` 1 · `role="status"` 7 · `focus:ring` or `focus-visible` 105 · `outline-none` 154 · `prefers-reduced-motion` 4 · `tabIndex={-1}` 5 · `sr-only` 4 · `title=` 1,168 · files with `fixed inset-0` overlays 97 · `<img>` without `alt` 0 · `text-gray-400` 883 · `text-gray-300` 58 · fixed 8–10 px text 1,399 · `<input>` 572 · `<select>` 200 · `<textarea>` 56 · `<th>` 299 (with `scope` 9) · pages with a title 38 of 94 · skip links 0.
