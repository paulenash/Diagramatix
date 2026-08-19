-- Add the "Choosing a distribution" section to the User Guide Simulation chapter.
-- Run on PROD via SuperAdmin -> Database Access. Idempotent (fixed section id).
DELETE FROM "HelpSection" s USING "HelpChapter" c
  WHERE s."chapterId"=c.id AND c.collection='user-guide' AND c.slug='simulation'
    AND s.heading='Choosing a distribution (arrivals & cycle times)' AND s.id<>'ughelp_sim_distributions';
INSERT INTO "HelpSection" ("id","chapterId","collection","heading","bodyMarkdown","adminOnly","sortOrder","createdAt","updatedAt")
SELECT 'ughelp_sim_distributions', c.id, 'user-guide', 'Choosing a distribution (arrivals & cycle times)', $md$Every time value in a simulation — an **Arrival** element's inter-arrival gap and a **Task**'s cycle time — is drawn from a probability *distribution*, so the model captures real variation instead of a single fixed number. Pick the one that best matches what you know about the step, and enter its parameters in the scenario's **clock unit** (e.g. minutes).

| Distribution | Parameters | What it does | Use it for |
| --- | --- | --- | --- |
| **Fixed** | `value` | Always exactly `value` — no variation | A step that always takes the same time; a constant delay |
| **Uniform** | `min`, `max` | Every value between `min` and `max` is equally likely | You only know the range and nothing about the middle |
| **Triangular** | `min`, `mode`, `max` | Peaks at the most-likely `mode`, tapering to a `min` and `max` | Expert estimates (worst / most-likely / best case) — a solid default |
| **Normal** | `mean`, `sd` | Symmetric bell curve around `mean`, spread by `sd` (never below 0) | Natural, symmetric variation around an average |
| **Exponential** | `mean` (= 1 / rate) | Many short gaps and a few long ones; "memoryless" | Random arrivals (a Poisson process) — the classic inter-arrival choice |

**How to use them**

- **Arrivals — inter-arrival time** is the *gap between successive cases*. **Exponential** is the standard choice for genuinely random demand (e.g. `exponential mean 12` ≈ a new case every 12 minutes on average). Use **Fixed** for a steady, scheduled feed, and **Triangular** / **Uniform** when demand varies within known bounds. An arrival source can also be tied to a **calendar** so cases only arrive during working hours.
- **Tasks — cycle time** is how long the work takes *once a resource starts it*. **Triangular** and **Normal** are the usual choices (real work varies around a typical duration); use **Fixed** for deterministic steps.
- **More spread → more queueing.** A wider `min…max` or a larger `sd` produces more variable queues and flow times. Start simple (Fixed or Triangular), then add variation to see how sensitive the process is.
- All values are read in the scenario's **clock unit**, so keep arrivals and cycle times in the same unit.$md$, false, 900, now(), now()
FROM "HelpChapter" c WHERE c.collection='user-guide' AND c.slug='simulation'
ON CONFLICT ("id") DO UPDATE SET
  "chapterId"=EXCLUDED."chapterId", "heading"=EXCLUDED."heading",
  "bodyMarkdown"=EXCLUDED."bodyMarkdown", "sortOrder"=EXCLUDED."sortOrder", "updatedAt"=now();
