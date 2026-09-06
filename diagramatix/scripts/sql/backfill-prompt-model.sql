-- Attribute every PUBLISHED repository prompt to Opus 5.
--
--   Paul, 2026-09-06: "Assume Opus 5 for all currently published Value Chains."
--
-- ValueChainPrompt.model records which AI model wrote a prompt. It arrived after
-- the prompts did, so every existing row is NULL — and NULL means genuinely
-- unknown, which for a chain imported from a .md it will always be.
--
-- RUN AFTER THE DEPLOY that adds the column, once per environment. Idempotent:
-- a second run updates 0 rows.
--
-- Narrow on purpose, and the narrowness is what makes the claim honest:
--   * published chains only — an unpublished draft carries no such guarantee;
--   * NULL models only      — never overwrites a real attribution;
--   * anything imported later stays NULL.
--
-- Verified against a real database before being written down: 13 rows set, 1
-- existing attribution preserved, 367 unpublished prompts left alone, second run
-- a no-op.

-- ── 1. What it WOULD do. Run this first. ────────────────────────────────────
SELECT l.code,
       l."publishedAt"::date                      AS published,
       count(*) FILTER (WHERE p.model IS NULL)    AS would_set,
       count(*)                                   AS prompts
FROM   "ValueChainLibrary" l
JOIN   "ValueChainPrompt"  p ON p."chainId" = l.id
WHERE  l."publishedAt" IS NOT NULL
GROUP  BY l.code, l."publishedAt"
HAVING count(*) FILTER (WHERE p.model IS NULL) > 0
ORDER  BY l.code;

-- ── 2. Do it. ───────────────────────────────────────────────────────────────
UPDATE "ValueChainPrompt" p
SET    model = 'claude-opus-5'
FROM   "ValueChainLibrary" l
WHERE  p."chainId" = l.id
  AND  l."publishedAt" IS NOT NULL
  AND  p.model IS NULL;

-- ── 3. Confirm. Published rows should read claude-opus-5; unpublished stay NULL.
SELECT l."publishedAt" IS NOT NULL AS published,
       coalesce(p.model, '(unknown)') AS model,
       count(*) AS prompts
FROM   "ValueChainPrompt" p
JOIN   "ValueChainLibrary" l ON l.id = p."chainId"
GROUP  BY 1, 2
ORDER  BY 1 DESC, 2;
