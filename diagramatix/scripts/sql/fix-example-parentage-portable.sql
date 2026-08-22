-- Repair container ownership (B47 parentage) in the example catalogues.
-- PORTABLE: elements are found by id, not by array position, so this is safe to
-- run on any environment regardless of how its packages are ordered.
-- Idempotent: each fix only applies while the element still has the OLD parent.
-- Wrapped in a transaction; RAISE NOTICE reports what it did.
BEGIN;

DO $$
DECLARE
  f       RECORD;
  pkg     jsonb;
  di      int;
  ei      int;
  changed boolean;
  applied int := 0;
  skipped int := 0;
BEGIN
  FOR f IN
    SELECT * FROM (VALUES
      ('SimulationExample', 'aardwolf-loan-comparison', 'Loan Application Process (as-is)', 'gxType', 'lAssess', 'lHome'),  -- gateway "Determine Loan Type"
      ('SimulationExample', 'aardwolf-loan-comparison', 'Loan Application Process (as-is)', 'gxTypeMerge', 'lAssess', 'lHome'),  -- gateway "Loan Type Resolved"
      ('SimulationExample', 'aardwolf-loan-comparison', 'Loan Application Process (to-be)', 'gw_type', 'lAI', 'lHome'),  -- gateway "Determine Loan Type"
      ('SimulationExample', 'aardwolf-loan-comparison', 'Loan Application Process (to-be)', 'gw_type_merge', 'lPers', 'lHome'),  -- gateway "Loan Type Processed"
      ('RiskControlExample', 'order-to-cash-grc', 'V01.01 Receive Order - Narrative Process', 'gwComplete', 'lCSR', 'lOP'),  -- gateway "Order Complete?"
      ('RiskControlExample', 'order-to-cash-grc', 'V01.01 Receive Order - Narrative Process', 'gwMergeComplete', 'lCSR', 'lOP')  -- gateway "Order Ready"
    ) AS t(tbl, slug, diagram_name, el_id, old_parent, new_parent)
  LOOP
    EXECUTE format('SELECT package FROM %I WHERE slug = $1', f.tbl) INTO pkg USING f.slug;
    IF pkg IS NULL THEN
      RAISE NOTICE 'SKIP  %.% — row not found', f.tbl, f.slug;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    changed := false;
    FOR di IN 0 .. COALESCE(jsonb_array_length(pkg -> 'diagrams'), 0) - 1 LOOP
      -- Element ids are unique only WITHIN a diagram, so match the diagram by
      -- name too: two diagrams in one package can legitimately share an id.
      CONTINUE WHEN pkg #>> ARRAY['diagrams', di::text, 'name'] IS DISTINCT FROM f.diagram_name;
      FOR ei IN 0 .. COALESCE(jsonb_array_length(pkg -> 'diagrams' -> di -> 'data' -> 'elements'), 0) - 1 LOOP
        IF pkg #>> ARRAY['diagrams', di::text, 'data', 'elements', ei::text, 'id'] = f.el_id
           AND pkg #>> ARRAY['diagrams', di::text, 'data', 'elements', ei::text, 'parentId']
               IS NOT DISTINCT FROM f.old_parent
        THEN
          IF f.new_parent IS NULL THEN
            pkg := pkg #- ARRAY['diagrams', di::text, 'data', 'elements', ei::text, 'parentId'];
          ELSE
            pkg := jsonb_set(pkg,
                     ARRAY['diagrams', di::text, 'data', 'elements', ei::text, 'parentId'],
                     to_jsonb(f.new_parent), true);
          END IF;
          changed := true;
        END IF;
      END LOOP;
    END LOOP;

    IF changed THEN
      EXECUTE format('UPDATE %I SET package = $1, "updatedAt" = NOW() WHERE slug = $2', f.tbl)
        USING pkg, f.slug;
      applied := applied + 1;
      RAISE NOTICE 'FIXED %.% / % — % : % -> %', f.tbl, f.slug, f.diagram_name, f.el_id,
        COALESCE(f.old_parent, '(none)'), COALESCE(f.new_parent, '(none)');
    ELSE
      skipped := skipped + 1;
      RAISE NOTICE 'NO-OP %.% / % — % (already correct, or parent differs)', f.tbl, f.slug, f.diagram_name, f.el_id;
    END IF;
  END LOOP;

  RAISE NOTICE '--- applied % fix(es), % skipped ---', applied, skipped;
END $$;

COMMIT;
