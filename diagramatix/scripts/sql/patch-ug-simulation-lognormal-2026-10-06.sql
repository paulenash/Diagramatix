-- User Guide › Simulation › "Choosing a distribution (arrivals & cycle times)": add the Lognormal distribution to the table, with when and
-- why to prefer it.
--
-- Paul, 6 October 2026: "In the User Guide section on Simulation there is a table listing the distributions. It needs to include the
-- Lognormal distribution. Also include when and why it might be preferred." The simulator has supported lognormal for some time
-- (app/lib/simulation/distributions.ts); the help text still listed only Fixed, Uniform, Triangular, Normal and Exponential.
--
-- Idempotent and safe on the live database: three guarded text insertions into ONE existing section, each skipped once its new wording
-- is there (or if the section was edited in the app so the anchor text is gone). Nothing is deleted. Run from the in-app Database tile
-- (SuperAdmin → Database). Read-only report at the end, AFTER the commit.

BEGIN;

-- 1. The table row, after Exponential.
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(s."bodyMarkdown",
      $A$| Random arrivals (a Poisson process) — the classic inter-arrival choice |$A$,
      $B$| Random arrivals (a Poisson process) — the classic inter-arrival choice |
| **Lognormal** | `mean`, `sd` | Skewed to the right: most values cluster below the mean, with a long tail of the occasional very long one (never below 0). `mean` and `sd` are those of the times themselves, not of their logarithms | Real work and service times — the usual best choice for a task's cycle time when some cases drag on (see *When to prefer Lognormal*, below) |$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'user-guide' AND c.slug = 'simulation'
  AND s.heading = 'Choosing a distribution (arrivals & cycle times)'
  AND s."bodyMarkdown" NOT LIKE '%| **Lognormal** |%'
  AND s."bodyMarkdown" LIKE '%Random arrivals (a Poisson process) — the classic inter-arrival choice |%';

-- 2. When and why to prefer it, before "How to use them".
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(s."bodyMarkdown",
      $A$**How to use them**$A$,
      $B$**When to prefer Lognormal**

- **Why.** Real task times are *right-skewed*: most cases take about the usual time, and a few take far longer — a complicated claim, a missing document, a customer who calls back. A **Normal** curve is symmetric, so it cannot produce that long tail; a **Triangular** curve has a hard ceiling at its `max`, so it cuts the tail off. Both therefore *understate the rare long cases* — and those are exactly the cases that make a queue form, which is what a simulation is run to find out. Lognormal has the tail, is never negative, and needs only the two numbers you can usually measure: the average and the spread.
- **When.** Use it for a task's **cycle time** when you have the average and spread of measured durations (from a mined log or a time study) and a histogram of them leans to the right; or when the work varies in complexity — reviews, approvals, investigations, assessments, support calls. It is the sensible default for knowledge work.
- **How.** Enter the `mean` and the `sd` of the *times themselves* — for example `lognormal mean 30, sd 20` minutes. The larger the `sd` is relative to the `mean`, the longer the tail: when `sd` is about the size of the `mean`, the longest cases run several times the average.
- **When not.** If the spread is small compared with the average (say, `sd` under about a quarter of the `mean`), Lognormal looks like a Normal and a simple **Normal** or **Triangular** is fine. If there is a hard limit — a fixed duration or a cut-off — use **Fixed**, **Uniform** or **Triangular**. For the *gaps between arrivals* of genuinely random demand, **Exponential** remains the classic choice.

**How to use them**$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'user-guide' AND c.slug = 'simulation'
  AND s.heading = 'Choosing a distribution (arrivals & cycle times)'
  AND s."bodyMarkdown" NOT LIKE '%When to prefer Lognormal**%'
  AND s."bodyMarkdown" LIKE '%**How to use them**%';

-- 3. The Tasks bullet points at it.
UPDATE "HelpSection" s
SET "bodyMarkdown" = replace(s."bodyMarkdown",
      $A$**Triangular** and **Normal** are the usual choices (real work varies around a typical duration); use **Fixed** for deterministic steps.$A$,
      $B$**Triangular** and **Normal** are the usual choices when the variation is symmetric or you only have a worst / most-likely / best estimate; **Lognormal** when real work has a long tail of slow cases; use **Fixed** for deterministic steps.$B$),
    "updatedAt" = NOW()
FROM "HelpChapter" c
WHERE c.id = s."chapterId" AND c.collection = 'user-guide' AND c.slug = 'simulation'
  AND s.heading = 'Choosing a distribution (arrivals & cycle times)'
  AND s."bodyMarkdown" LIKE '%**Triangular** and **Normal** are the usual choices (real work varies around a typical duration); use **Fixed** for deterministic steps.%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit.
-- ════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Choosing a distribution (arrivals & cycle times)' AND "bodyMarkdown" LIKE '%| **Lognormal** |%') AS has_row,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Choosing a distribution (arrivals & cycle times)' AND "bodyMarkdown" LIKE '%When to prefer Lognormal**%') AS has_guidance,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Choosing a distribution (arrivals & cycle times)' AND "bodyMarkdown" LIKE '%**Lognormal** when real work has a long tail%') AS has_bullet,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'Choosing a distribution (arrivals & cycle times)' AND "bodyMarkdown" LIKE '%| **Lognormal** |%'
          AND "bodyMarkdown" LIKE '%When to prefer Lognormal**%' AND "bodyMarkdown" LIKE '%**Lognormal** when real work has a long tail%') = 1
    THEN 'OK — the table row, the "When to prefer Lognormal" guidance and the Tasks bullet are all there'
    ELSE 'CHECK — one of the three is missing: the section was edited in the app, so the anchor text was not found; add the Lognormal row and guidance by hand in the User Guide editor'
  END AS verdict;
