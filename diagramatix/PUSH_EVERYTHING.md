# "Push everything" — the release checklist

Everything that must be true before and after a release, in one place.

> **Run the checker, don't read the list.**
>
> ```
> export PATH="$PATH:/c/Program Files/nodejs"
> cd diagramatix
> npx tsx scripts/check-push-everything.ts                              # local checks
> DATABASE_URL="<prod url>" npx tsx scripts/check-push-everything.ts --prod   # + live site + prod DB
> ```
>
> It prints one line per item and exits non-zero if anything is behind. A list
> only a person checks is a list that quietly stops being true: three different
> suite totals once coexisted inside `TESTS_SUMMARY.md`, and `VERSION_HISTORY.md`
> went five releases without an entry — both because nothing ever looked.
>
> The prod URL comes from Key Vault, not the app setting (the setting is only a
> reference):
> `az keyvault secret show --vault-name dgx-kv --name database-url --query value -o tsv`

The mechanics of *what to change and when* live in
[`schema/UPDATE_EVERYTHING.md`](schema/UPDATE_EVERYTHING.md) — the version model,
the two bump questions, and the step-by-step. **This file is the checklist; that
file is the procedure.** Keep them consistent.

---

## The checklist

| # | Item | Must be true | Checked by |
|---|---|---|---|
| 0 | Bump decision | Q1 (physical DB changed?) → `PRODUCT_VERSION.minor`; Q2 (XSD export shape changed?) → `SCHEMA_VERSION` | you |
| 1 | `app/lib/diagram/types.ts` | Both constants present and current | auto |
| 2 | `public/diagramatix-export.xsd` | A `vN` history block for the current schema, and **no enum drift** — every typed-union value the app exports is declared | auto |
| 3 | `app/lib/diagram/ddlGenerate.ts` | Logical DDL matches the physical schema — only when prisma changed | auto (flags for review) |
| 4 | `schema/SCHEMA_CHANGELOG.md` | "Current XSD schema version" matches the constant; a summary row **and** a detail section for the version | auto (version), you (content) |
| 5 | **`VERSION_HISTORY.md`** | **An entry covering every commit since the last one.** See the rule below. | auto |
| 6 | Build | `npm run build` clean | you |
| 7–8 | Commit + push | Nothing uncommitted, nothing unpushed | auto |
| 9 | Post-deploy | Live `/api/schema` reports the current schema version | auto (`--prod`) |
| 10a | User Guide **version** | The Overview's "covers version" equals the deployed `PRODUCT_VERSION.build` | auto (`--prod`) |
| 10b | User Guide **feature docs** | New/changed features documented | you |
| 11 | Features catalog | No unpublished drafts, no empty rows | auto (`--prod`) |
| 12 | Technical Design Notes | Recorded for the release; **every section's `collection` matches its chapter's** | auto (`--prod`) |
| T | **`tests/TESTS_SUMMARY.md`** | **Every `Tnnnn` in the tree has a row; the header and numbering note state the true highest ref.** | auto (also a test) |

---

## VERSION_HISTORY — the rule

*Set by Paul, 2026-08-24.*

**Every release gets an entry.** Not every *commit* needs its own: if one issue
took five commits to fix, one entry covering it is right.

**But a new feature, or any change to the product, belongs in the entry for the
release it shipped in** — as far as is possible. The log is what someone reads to
find out when something appeared and why; a feature folded into a later summary
loses that.

The checker compares the newest entry's build number against `HEAD`, so "five
commits unlogged" is reported rather than discovered months later.

## TESTS_SUMMARY — the rule

*Set by Paul, 2026-08-24.*

**It must be up to date whenever a test is added** — not at release time, not in
a periodic sweep. A new test takes the next `Tnnnn` after the current highest
(append-only, never renumbered) and gets a row the same day.

This is enforced twice: `tests/config/tests-summary-coverage.test.ts` runs with
every suite and fails if any id in the tree has no row, or if the header's stated
highest ref disagrees with reality; and the checker above reports it at release
time.

> **Why it is enforced rather than trusted:** `UPDATE_EVERYTHING.md` used to
> exclude this file from the release procedure as "an orthogonal system, not the
> version". That was defensible for versioning and it meant no step ever checked
> it — so 107 entries went missing and the header carried three mutually
> contradictory totals. The document read as authoritative the entire time, which
> is worse than being visibly partial.

---

## What "up to date" means

The checker distinguishes four states, and the distinction matters:

| | Meaning |
|---|---|
| `OK` | Verified current |
| `BEHIND` | Verified out of date — fix before release |
| `check` | Needs a human decision (e.g. prisma changed → does the Logical DDL need updating?) |
| `skip` | **Could not be checked** — no network, no `DATABASE_URL`. Not a pass. |

A check that could not run has not passed, and the report says so rather than
staying silent.
