# "Update Everything" — the canonical release / version procedure

This is the exact, repeatable sequence to run whenever Paul says **"update everything"**.
It guarantees the version number lands in every place at once and that every release is
recorded. Do the steps in order; do not improvise.

> **Trigger phrase:** "update everything" (also "let's update everything", "bump the version").

---

## The version model (read once) — TWO independent numbers (split 2026-08-10)

Both are manual constants in [`../app/lib/diagram/types.ts`](../app/lib/diagram/types.ts):

- **`SCHEMA_VERSION`** — a standalone **integer** (currently `"45"`) = the **XSD schema version**.
  Bumped ONLY on an XSD export-shape change (the original criterion). Stamped as `schemaVersion`
  in every export and carried on `<xs:schema version=…>`. Shown in the editor's `XSD (schema v45)`
  export leaf and inside the XSD.
- **`PRODUCT_VERSION`** — the **Diagramatix product version**, a two-tier `major.minor` line
  (currently `"2.2"`; 2026-08-13, per Paul). **MINOR increments on ANY physical DB table/column
  change** or a notable release; major is a manual headline/breaking call. There is **no patch** —
  the header badge shows `v{major.minor}.{build}` where the git commit count IS the third part
  (e.g. `v2.2.487`). Exports stamp the bare two-tier `PRODUCT_VERSION` as `appVersion`.

Derived / automatic:
- The **third part of the header badge IS the git commit count** (`v{PRODUCT_VERSION}.{build}`, e.g.
  `v2.2.487`) — the count comes from `GIT_COMMIT_COUNT` baked at deploy and advances every push by
  itself. It is display-only and is **not** part of the stamped `appVersion` (the bare two-tier
  `PRODUCT_VERSION`).
- The XSD `version="{{SCHEMA_VERSION}}"` attribute and the `{{APP_VERSION}}` annotation are
  **placeholders** swapped at runtime in [`../app/api/schema/route.ts`](../app/api/schema/route.ts)
  (`{{SCHEMA_VERSION}}`→the integer, `{{APP_VERSION}}`→`PRODUCT_VERSION`) — never write a number there.
- Legacy exports carry the old `1.NN` `schemaVersion`; importers read it via
  `structuralSchemaVersion()` (the `1.NN` minor == the new integer). Use `checkSchemaCompatibility()`
  for import gating — never a raw `.split(".")` major-compare.

**Never hand-edit** the git build count, the XSD `version=` line, the header badge, or `package.json`
`"version"` (vestigial; leave at `0.1.0`).

---

## Step 0 — Decide which number(s) bump

> **Policy (Paul, 2026-08-10 — TWO numbers).** The single `major.minor` version was split. Ask the
> two questions below independently; either, both, or neither can move on a release.

### Q1 — Did the **physical database** change? → bump **PRODUCT_VERSION.minor**
Any table, column, enum, or relation added / removed / renamed / retyped **anywhere** in
`prisma/schema.prisma` — operational, auth, billing, telemetry, mining, connection tables all count
(NOT just the curated `ddlGenerate.ts` DDL). Source of truth = the Prisma schema.
- **Bump the MINOR** of `PRODUCT_VERSION` (`2.2 → 2.3`). Major (`2 → 3`) is a manual headline/breaking
  call. There is **no patch**: within a `major.minor`, the build count (the badge's third part)
  advances by itself on every push.
- New **rows** in existing tables are data, not structure → no bump.

### Q2 — Did the **XSD export shape** change? → bump **SCHEMA_VERSION** (the integer)
A new/removed/renamed **first-class** XSD element or attribute, or a new value in a **typed enum**
(`SymbolType`, `ConnectorType`, `GatewayType`, `EventType`, `DiagramType`, …). This is the ORIGINAL
criterion — the narrow one.
- **Increment the integer** (`45 → 46`).
- A change that persists ONLY as a new open `element.properties.*` / `data.*` key (no first-class
  XSD field) is **not** an XSD-shape change → it does NOT bump the schema integer. (It usually rides
  a DB change, i.e. Q1, or nothing.)

### What each answer triggers
- **Q1 yes** → Step 1 (PRODUCT_VERSION), Step 3 (`ddlGenerate.ts` only if the *diagram-model* DDL
  changed), Step 4, Step 5.
- **Q2 yes** → Step 1 (SCHEMA_VERSION integer), Step 2 (XSD shape + history), Step 4, Step 5.
- **Both** → do both. **Neither** → Step 5 only (feature-only release; the build count still advances).

**❌ Neither counts** for: behaviour/UI/routing/rendering with identical persisted fields; runtime-only
state; a TS-type field that is never persisted.

---

## Step 1 — `app/lib/diagram/types.ts`  *(on any bump)*
- **Q1 (DB change):** bump `PRODUCT_VERSION` (minor: `2.2 → 2.3`) and add a history-comment note.
- **Q2 (XSD change):** increment the `SCHEMA_VERSION` integer and prepend a `schema N:` history entry.
Both constants live side by side near the bottom of the file.

## Step 2 — `public/diagramatix-export.xsd`  *(bump only)*
Edit the actual shape if fields/enums changed (add the element/attribute/`<xs:enumeration>` with
a `<!-- schema N -->` marker). Add a `vN — <title>` block to the inline history comment.
**Do not** touch the `version=` line — it is a placeholder.

## Step 3 — `app/lib/diagram/ddlGenerate.ts`  *(bump only)*
Update the Logical DDL **only if** the physical DB structure changed this release, keeping it
matching the real schema.

## Step 4 — `schema/SCHEMA_CHANGELOG.md`  *(bump only)*
Update `Current version: N`, add a **summary-table row** (newest first, with the "Schema shape
change? Yes/No" verdict) **and** a **detail section** for vN.

## ⭐ Step 5 — `VERSION_HISTORY.md`  *(ALWAYS — every release)*

> **The rule (Paul, 2026-08-24).** Every release gets an entry. Not every commit
> needs its own — if one issue took five commits to fix, a single entry covering
> it is right. But a **new feature, or any change to the product, belongs in the
> entry for the release it shipped in**, as far as is possible: the log is what
> someone reads to find out when something appeared, and a feature folded into a
> later summary loses that.
>
> **And record a fix in the version where it PASSED, not where it was attempted**
> — actively REMOVING the claim from any earlier entry that said it was fixed and
> was wrong. A reader consults this log to decide which build to trust; a fix
> listed against a release where it did not work makes it answer the wrong
> question. The checker can verify an entry exists; only you can verify it is
> true. The release checker compares the newest entry's build number against
> HEAD, so "five commits unlogged" is reported, not discovered later.
Prepend one entry, newest first. This is the **only** place feature-only releases are recorded,
so it runs whether or not Step 0 bumped:

```
## 1.44.<build> — YYYY-MM-DD — <short title>
- <one-line bullets of what shipped>
- Schema: no bump (feature-only)          ← or "Schema: 1.44 → 1.45 (new EventType enum)"
```
- `<build>` = `git rev-list --count HEAD` **+ 1** at the moment you write it (this release's
  commit becomes the next count). Confirm the final number matches after the commit if precision
  matters; being off by the count of files in one commit is acceptable for a human log.

## Step 6 — Verify the build
```
export PATH="$PATH:/c/Program Files/nodejs"; cd /c/Git/Diagramatix/diagramatix; rm -f .next/lock; npm run build
```
Confirms `/api/schema` still renders and the placeholders resolve.

## Step 7 — Commit ATOMICALLY (the key discipline)
**One commit** that carries the feature code **and** every touched version file together, so the
number is never half-applied across files. On a bump that is Steps 1–5; feature-only, it is at
least Step 5. Message names the version, e.g.
`chore(schema): bump to N — <title>` or `docs(version): 1.44.<build> — <title>`.

## Step 8 — Push / deploy
`git push` → GitHub Actions computes `GIT_COMMIT_COUNT` → Azure stamps
`appVersion = N.<count>` **everywhere at runtime** (header badge, `/api/schema`, every export).
No further edits. (After pushing to main, just say "pushed".)

## Step 9 — Post-deploy verify
On `https://dgx-prod-app.azurewebsites.net`:
- `/api/schema` shows `version="N"` and `appVersion N.<count>`,
- the header badge reads `N.<count>`,
- a fresh diagram export carries `schemaVersion="N"`.

---

## Content / documentation updates — DB-backed, edited in the running app

These live in the **database** (per-environment content), so they are edited via the live
admin UI — **not** in the git commit — and normally done against **prod after Step 9**, so users
see docs that match the shipped feature. Record in `VERSION_HISTORY.md` (Step 5) which were
touched.

## Step 10 — User Guide
- **10a. Version number — ALWAYS on a version-bearing release.** Update the version number in the
  **Overview** section of the User Guide to the just-deployed `appVersion` = **`N.<build>`**. The
  Overview text is hand-edited content (it does **not** pull the runtime value), and the build
  number is only known post-deploy — read it off the live header badge / `/api/schema` after
  Step 9, then edit via `/dashboard/admin/user-guide`.
- **10b. Feature docs — if applicable.** Add/update the relevant User Guide page(s) for the new
  feature via the admin editor (`/dashboard/admin/user-guide`).

## Step 11 — Features catalog — if applicable
Add/update the feature entry and **publish** it to the public `/features` page (draft → publish).

## Step 12 — Technical Design Notes — if applicable
Record the technical/architecture note for the release via the SuperAdmin Document Editor
(`/tech-notes`).

> **This group's rule:** 10a is **mandatory** whenever the version changes; 10b / 11 / 12 are
> **"if applicable"** — skip them when a release has nothing user-visible to document (e.g. a pure
> bug-fix or internal-docs release).

---

## Also checked (changed 2026-08-24, per Paul)
- **`tests/TESTS_SUMMARY.md`** — the append-only `Tnnnn` numbering is still orthogonal to the
  VERSION, but the document must be **up to date whenever a test is added**, and is now **checked on
  every release**. Excluding it meant nothing ever looked: 107 entries went missing and the header
  carried three contradictory suite totals while reading as authoritative.
  Enforced by `tests/config/tests-summary-coverage.test.ts` (every suite run) and reported by the
  release checker below.

## Not part of this procedure
- **`package.json` `"version"`** — vestigial; do not sync it.

---

## The checklist, and the checker

The step-by-step above is the PROCEDURE. The CHECKLIST — what must be true before
and after a release, and which parts are verified automatically — lives in
[`../PUSH_EVERYTHING.md`](../PUSH_EVERYTHING.md).

Run it at the start and end of every "update everything" / "push everything":

```
cd diagramatix
npx tsx scripts/check-push-everything.ts                                    # local
DATABASE_URL="<prod url>" npx tsx scripts/check-push-everything.ts --prod   # + live + DB
```

It reports each item as OK / BEHIND / check / skip and exits non-zero if anything
is behind. `skip` means it could not be checked (no network, no DATABASE_URL) —
that is not a pass.
