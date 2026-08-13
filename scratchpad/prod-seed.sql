-- Enterprise tier + FeatureAvailability matrix (generated from local).
-- Idempotent: safe to re-run. Does NOT touch users or other tiers.
BEGIN;

-- 1) Enterprise SubscriptionLevel row
INSERT INTO "SubscriptionLevel" ("id", "name", "priceMonthly", "sortOrder", "maxProjects", "maxDiagramsPerTypePerProject", "maxArchimateDiagramsTotal", "maxNonBpmnElementsPerDiagram", "maxBpmnElementsPerDiagram", "maxAiAttempts", "aiAttemptsResetMonthly", "maxIndividualExports", "individualExportsResetMonthly", "maxIndividualImports", "individualImportsResetMonthly", "maxBulkExports", "maxBulkImports", "createdAt", "updatedAt", "trialDays", "stripePriceId", "hasApqc", "hasProcessMining", "hasRiskControl", "hasSimulator", "hasCollaboration") VALUES ('enterprise', 'Enterprise', 0, 4, NULL, NULL, NULL, NULL, NULL, NULL, TRUE, NULL, TRUE, NULL, TRUE, NULL, NULL, '2026-08-09T18:30:13.897Z', '2026-08-09T21:14:03.320Z', NULL, NULL, TRUE, TRUE, TRUE, TRUE, FALSE)
  ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "priceMonthly" = EXCLUDED."priceMonthly", "sortOrder" = EXCLUDED."sortOrder", "maxProjects" = EXCLUDED."maxProjects", "maxDiagramsPerTypePerProject" = EXCLUDED."maxDiagramsPerTypePerProject", "maxArchimateDiagramsTotal" = EXCLUDED."maxArchimateDiagramsTotal", "maxNonBpmnElementsPerDiagram" = EXCLUDED."maxNonBpmnElementsPerDiagram", "maxBpmnElementsPerDiagram" = EXCLUDED."maxBpmnElementsPerDiagram", "maxAiAttempts" = EXCLUDED."maxAiAttempts", "aiAttemptsResetMonthly" = EXCLUDED."aiAttemptsResetMonthly", "maxIndividualExports" = EXCLUDED."maxIndividualExports", "individualExportsResetMonthly" = EXCLUDED."individualExportsResetMonthly", "maxIndividualImports" = EXCLUDED."maxIndividualImports", "individualImportsResetMonthly" = EXCLUDED."individualImportsResetMonthly", "maxBulkExports" = EXCLUDED."maxBulkExports", "maxBulkImports" = EXCLUDED."maxBulkImports", "createdAt" = EXCLUDED."createdAt", "updatedAt" = EXCLUDED."updatedAt", "trialDays" = EXCLUDED."trialDays", "stripePriceId" = EXCLUDED."stripePriceId", "hasApqc" = EXCLUDED."hasApqc", "hasProcessMining" = EXCLUDED."hasProcessMining", "hasRiskControl" = EXCLUDED."hasRiskControl", "hasSimulator" = EXCLUDED."hasSimulator", "hasCollaboration" = EXCLUDED."hasCollaboration";

-- 2) FeatureAvailability matrix (165 rows)
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhk002mhw1kf7tqpfvp', 'enterprise', 'abracadabra', 'available', '2026-08-09T20:51:08.377Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfu0013hw1k7nacsnpu', 'enterprise', 'ai-generate-audio', 'available', '2026-08-09T20:51:08.338Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfd000ohw1klw8b7sl4', 'enterprise', 'ai-generate-dictated', 'available', '2026-08-09T20:51:08.325Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglf8000jhw1ky63zsc7j', 'enterprise', 'ai-generate-image', 'available', '2026-08-09T20:51:08.321Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgq001xhw1kcu8gvcsx', 'enterprise', 'ai-generate-record', 'available', '2026-08-09T20:51:08.359Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglg7001dhw1kkqhb2deb', 'enterprise', 'ai-generate-refine', 'available', '2026-08-09T20:51:08.345Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglep0004hw1kooo8kw5p', 'enterprise', 'ai-generate-typed', 'available', '2026-08-09T20:51:08.308Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgm001shw1k5qwyihmc', 'enterprise', 'apqc', 'available', '2026-08-09T20:51:08.356Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglew0009hw1k47tpol37', 'enterprise', 'bpmn-templates', 'available', '2026-08-09T20:51:08.313Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglj00045hw1k1j5r4e32', 'enterprise', 'choice-of-llms', 'available', '2026-08-09T20:51:08.414Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgh001nhw1kk84nqvv0', 'enterprise', 'co-authoring', 'available', '2026-08-09T20:51:08.353Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfi000thw1ktq826msd', 'enterprise', 'collaboration-groups', 'available', '2026-08-09T20:51:08.329Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfp000yhw1ka1ej1o13', 'enterprise', 'diff-processes', 'available', '2026-08-09T20:51:08.333Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglj6004ahw1ka37p14mt', 'enterprise', 'local-llm', 'available', '2026-08-09T20:51:08.417Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgliw0040hw1krouivbyo', 'enterprise', 'mobile', 'available', '2026-08-09T20:51:08.411Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglf1000ehw1kwxmasgtf', 'enterprise', 'nl-assist', 'available', '2026-08-09T20:51:08.317Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglic003ghw1kdf5r1114', 'enterprise', 'process-mining-examples', 'available', '2026-08-09T20:51:08.398Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgljg004khw1ke5mtwal4', 'enterprise', 'process-mining-ocel', 'available', '2026-08-09T20:51:08.424Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgv0022hw1kk0nnp6i9', 'enterprise', 'process-portal', 'available', '2026-08-09T20:51:08.363Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglil003qhw1k52zoikt6', 'enterprise', 'process-review', 'available', '2026-08-09T20:51:08.404Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglha002chw1kd411vav8', 'enterprise', 'processMining', 'available', '2026-08-09T20:51:08.370Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglih003lhw1kmm1dp2d1', 'enterprise', 'risk-control-examples', 'available', '2026-08-09T20:51:08.401Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhf002hhw1k6qydy12p', 'enterprise', 'riskControl', 'available', '2026-08-09T20:51:08.373Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli30036hw1knyrdyx0h', 'enterprise', 'sharepoint', 'available', '2026-08-09T20:51:08.392Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgc001ihw1kgoqc39jw', 'enterprise', 'sharing', 'available', '2026-08-09T20:51:08.349Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglh20027hw1kho3r3fx6', 'enterprise', 'simulator', 'available', '2026-08-09T20:51:08.366Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli7003bhw1k7ntk1vci', 'enterprise', 'simulator-examples', 'available', '2026-08-09T20:51:08.395Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgljb004fhw1k6xuz492t', 'enterprise', 'soc2', 'available', '2026-08-09T20:51:08.421Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglir003vhw1khe32siqj', 'enterprise', 'sop-generation', 'available', '2026-08-09T20:51:08.407Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglht002whw1kixr9k6r3', 'enterprise', 'visio-export-bulk', 'available', '2026-08-09T20:51:08.385Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhz0031hw1kw5mth6c6', 'enterprise', 'visio-export-individual', 'available', '2026-08-09T20:51:08.389Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglho002rhw1kqoz3twix', 'enterprise', 'visio-import-bulk', 'available', '2026-08-09T20:51:08.381Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfz0018hw1k2fmvbxyi', 'enterprise', 'visio-import-individual', 'available', '2026-08-09T20:51:08.342Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhj002lhw1k7wz66hr6', 'expert', 'abracadabra', 'available', '2026-08-09T20:51:08.376Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglft0012hw1khtim8mtg', 'expert', 'ai-generate-audio', 'available', '2026-08-09T20:51:08.337Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfc000nhw1k3i92nrcn', 'expert', 'ai-generate-dictated', 'available', '2026-08-09T20:51:08.324Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglf7000ihw1ki84inwuu', 'expert', 'ai-generate-image', 'available', '2026-08-09T20:51:08.320Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgq001whw1k4d1sw6bh', 'expert', 'ai-generate-record', 'available', '2026-08-09T20:51:08.358Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglg5001chw1kp8o7p7mu', 'expert', 'ai-generate-refine', 'available', '2026-08-09T20:51:08.345Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglen0003hw1ktr517jgr', 'expert', 'ai-generate-typed', 'available', '2026-08-09T20:51:08.307Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgl001rhw1knidofcae', 'expert', 'apqc', 'available', '2026-08-09T20:51:08.355Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglev0008hw1k7tojoce0', 'expert', 'bpmn-templates', 'available', '2026-08-09T20:51:08.312Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgliz0044hw1k9phx19sy', 'expert', 'choice-of-llms', 'hidden', '2026-08-09T20:51:08.414Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgg001mhw1kt1gnnq6b', 'expert', 'co-authoring', 'available', '2026-08-09T20:51:08.352Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfh000shw1kpuq7dxp0', 'expert', 'collaboration-groups', 'available', '2026-08-09T20:51:08.328Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfo000xhw1knsogf5c9', 'expert', 'diff-processes', 'available', '2026-08-09T20:51:08.332Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglj50049hw1kw55m7dqh', 'expert', 'local-llm', 'hidden', '2026-08-09T20:51:08.417Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgliv003zhw1k3dli6s5v', 'expert', 'mobile', 'available', '2026-08-09T20:51:08.411Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglf0000dhw1kix8poti5', 'expert', 'nl-assist', 'available', '2026-08-09T20:51:08.317Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglib003fhw1k01tb7v93', 'expert', 'process-mining-examples', 'available', '2026-08-09T20:51:08.397Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgljf004jhw1k0izbzk2n', 'expert', 'process-mining-ocel', 'hidden', '2026-08-09T20:51:08.424Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgu0021hw1kgy0dzar7', 'expert', 'process-portal', 'available', '2026-08-09T20:51:08.362Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglik003phw1k7fc51emg', 'expert', 'process-review', 'available', '2026-08-09T20:51:08.403Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglh8002bhw1khoyihy9o', 'expert', 'processMining', 'available', '2026-08-09T20:51:08.369Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglig003khw1kk15kuq78', 'expert', 'risk-control-examples', 'available', '2026-08-09T20:51:08.401Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhe002ghw1k2bpjo9vr', 'expert', 'riskControl', 'available', '2026-08-09T20:51:08.373Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli20035hw1ko18naszi', 'expert', 'sharepoint', 'available', '2026-08-09T20:51:08.392Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgb001hhw1kh9j65z3u', 'expert', 'sharing', 'available', '2026-08-09T20:51:08.349Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglh10026hw1kbb3twjz3', 'expert', 'simulator', 'available', '2026-08-09T20:51:08.365Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli7003ahw1kogyky1vh', 'expert', 'simulator-examples', 'available', '2026-08-09T20:51:08.395Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglja004ehw1khmi9opwc', 'expert', 'soc2', 'hidden', '2026-08-09T20:51:08.420Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglip003uhw1khngv4cu5', 'expert', 'sop-generation', 'available', '2026-08-09T20:51:08.407Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhs002vhw1k4s234s0g', 'expert', 'visio-export-bulk', 'available', '2026-08-09T20:51:08.384Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhy0030hw1k84u1nmhd', 'expert', 'visio-export-individual', 'available', '2026-08-09T20:51:08.388Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhn002qhw1kawp6o04m', 'expert', 'visio-import-bulk', 'available', '2026-08-09T20:51:08.380Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfy0017hw1kum2khv5y', 'expert', 'visio-import-individual', 'available', '2026-08-09T20:51:08.341Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhh002ihw1kitvsic4q', 'free', 'abracadabra', 'hidden', '2026-08-09T20:51:08.374Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfq000zhw1ksautsuja', 'free', 'ai-generate-audio', 'hidden', '2026-08-09T20:51:08.334Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglf9000khw1kewbk4sos', 'free', 'ai-generate-dictated', 'hidden', '2026-08-09T20:51:08.322Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglf3000fhw1koeoryvf1', 'free', 'ai-generate-image', 'hidden', '2026-08-09T20:51:08.318Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgn001thw1kok054mvl', 'free', 'ai-generate-record', 'hidden', '2026-08-09T20:51:08.356Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglg10019hw1k4drkrq2x', 'free', 'ai-generate-refine', 'hidden', '2026-08-09T20:51:08.343Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglee0000hw1kqt8dw70v', 'free', 'ai-generate-typed', 'available', '2026-08-09T20:51:08.301Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgi001ohw1km4znhq8k', 'free', 'apqc', 'hidden', '2026-08-09T20:51:08.353Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgler0005hw1k6gllyn4c', 'free', 'bpmn-templates', 'available', '2026-08-09T20:51:08.309Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglix0041hw1k1px5fyet', 'free', 'choice-of-llms', 'hidden', '2026-08-09T20:51:08.412Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgd001jhw1kv85w92x3', 'free', 'co-authoring', 'hidden', '2026-08-09T20:51:08.350Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfe000phw1k15bpj9xf', 'free', 'collaboration-groups', 'hidden', '2026-08-09T20:51:08.326Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfj000uhw1k193lv3x5', 'free', 'diff-processes', 'hidden', '2026-08-09T20:51:08.330Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglj10046hw1klwo8lnob', 'free', 'local-llm', 'hidden', '2026-08-09T20:51:08.415Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglis003whw1k4rdabr2v', 'free', 'mobile', 'hidden', '2026-08-09T20:51:08.408Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglex000ahw1k0xgwrtqb', 'free', 'nl-assist', 'available', '2026-08-09T20:51:08.314Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli8003chw1kai06vl30', 'free', 'process-mining-examples', 'hidden', '2026-08-09T20:51:08.396Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgljc004ghw1k6vhj1l0b', 'free', 'process-mining-ocel', 'hidden', '2026-08-09T20:51:08.421Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgr001yhw1k7yxpgkk9', 'free', 'process-portal', 'hidden', '2026-08-09T20:51:08.360Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglii003mhw1kvg7ds6h1', 'free', 'process-review', 'hidden', '2026-08-09T20:51:08.402Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglh40028hw1k7e6bpzcd', 'free', 'processMining', 'hidden', '2026-08-09T20:51:08.367Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglid003hhw1k1qqjw8m5', 'free', 'risk-control-examples', 'hidden', '2026-08-09T20:51:08.399Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhb002dhw1kqfuy31wh', 'free', 'riskControl', 'hidden', '2026-08-09T20:51:08.371Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli00032hw1k22eys0x4', 'free', 'sharepoint', 'hidden', '2026-08-09T20:51:08.390Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglg8001ehw1kdxdt3wca', 'free', 'sharing', 'hidden', '2026-08-09T20:51:08.346Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgw0023hw1kxhhjmykd', 'free', 'simulator', 'hidden', '2026-08-09T20:51:08.363Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli40037hw1kq01jxw9s', 'free', 'simulator-examples', 'hidden', '2026-08-09T20:51:08.393Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglj7004bhw1k7m88um60', 'free', 'soc2', 'hidden', '2026-08-09T20:51:08.418Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglim003rhw1k2qc7rk40', 'free', 'sop-generation', 'hidden', '2026-08-09T20:51:08.405Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhp002shw1kzmuvnywy', 'free', 'visio-export-bulk', 'hidden', '2026-08-09T20:51:08.382Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhu002xhw1ksu696you', 'free', 'visio-export-individual', 'hidden', '2026-08-09T20:51:08.386Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhl002nhw1kz50o84xu', 'free', 'visio-import-bulk', 'hidden', '2026-08-09T20:51:08.378Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfv0014hw1kbie1n0l6', 'free', 'visio-import-individual', 'hidden', '2026-08-09T20:51:08.339Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhh002jhw1kh9qj0rt8', 'introductory', 'abracadabra', 'hidden', '2026-08-09T20:51:08.375Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfr0010hw1k2mhw0pym', 'introductory', 'ai-generate-audio', 'hidden', '2026-08-09T20:51:08.335Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfa000lhw1kzvq0xdx1', 'introductory', 'ai-generate-dictated', 'available', '2026-08-09T20:51:08.323Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglf5000ghw1kp13mf5en', 'introductory', 'ai-generate-image', 'available', '2026-08-09T20:51:08.319Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgo001uhw1k4xfeufdp', 'introductory', 'ai-generate-record', 'hidden', '2026-08-09T20:51:08.357Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglg3001ahw1kx41uc4qr', 'introductory', 'ai-generate-refine', 'hidden', '2026-08-09T20:51:08.343Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglej0001hw1kxf6avsom', 'introductory', 'ai-generate-typed', 'available', '2026-08-09T20:51:08.304Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgj001phw1k38p5mmqy', 'introductory', 'apqc', 'hidden', '2026-08-09T20:51:08.354Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgles0006hw1k7hur2ynd', 'introductory', 'bpmn-templates', 'available', '2026-08-09T20:51:08.310Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgliy0042hw1k67l8qg23', 'introductory', 'choice-of-llms', 'hidden', '2026-08-09T20:51:08.413Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglge001khw1kyfc1ek6r', 'introductory', 'co-authoring', 'hidden', '2026-08-09T20:51:08.351Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglff000qhw1k4a4ljnfw', 'introductory', 'collaboration-groups', 'available', '2026-08-09T20:51:08.327Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfl000vhw1k4mizponf', 'introductory', 'diff-processes', 'available', '2026-08-09T20:51:08.330Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglj30047hw1kj9e6ntn3', 'introductory', 'local-llm', 'hidden', '2026-08-09T20:51:08.415Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglit003xhw1kql15w0y8', 'introductory', 'mobile', 'hidden', '2026-08-09T20:51:08.409Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgley000bhw1kwwd3ajii', 'introductory', 'nl-assist', 'available', '2026-08-09T20:51:08.315Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli9003dhw1kdkbli7bd', 'introductory', 'process-mining-examples', 'hidden', '2026-08-09T20:51:08.396Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgljd004hhw1kvgw9wgqj', 'introductory', 'process-mining-ocel', 'hidden', '2026-08-09T20:51:08.422Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgs001zhw1kfowjlxej', 'introductory', 'process-portal', 'hidden', '2026-08-09T20:51:08.360Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglii003nhw1krdaziala', 'introductory', 'process-review', 'hidden', '2026-08-09T20:51:08.402Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglh50029hw1ko57u239s', 'introductory', 'processMining', 'hidden', '2026-08-09T20:51:08.368Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglie003ihw1kxjuzb42t', 'introductory', 'risk-control-examples', 'hidden', '2026-08-09T20:51:08.399Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhc002ehw1kvpq5eijz', 'introductory', 'riskControl', 'hidden', '2026-08-09T20:51:08.371Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli10033hw1k4iy5bwf1', 'introductory', 'sharepoint', 'hidden', '2026-08-09T20:51:08.390Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglg9001fhw1k9zr1k8ir', 'introductory', 'sharing', 'hidden', '2026-08-09T20:51:08.347Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgx0024hw1k4cyt3qzm', 'introductory', 'simulator', 'hidden', '2026-08-09T20:51:08.364Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli50038hw1kpuxmjoj3', 'introductory', 'simulator-examples', 'hidden', '2026-08-09T20:51:08.394Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglj7004chw1kd3dgc5gh', 'introductory', 'soc2', 'hidden', '2026-08-09T20:51:08.419Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglin003shw1k8vil86jk', 'introductory', 'sop-generation', 'hidden', '2026-08-09T20:51:08.406Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhq002thw1kmzl9ptdl', 'introductory', 'visio-export-bulk', 'hidden', '2026-08-09T20:51:08.383Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhw002yhw1khxl60rl4', 'introductory', 'visio-export-individual', 'hidden', '2026-08-09T20:51:08.386Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhl002ohw1kosgkwflq', 'introductory', 'visio-import-bulk', 'hidden', '2026-08-09T20:51:08.379Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfw0015hw1kmzpes81t', 'introductory', 'visio-import-individual', 'hidden', '2026-08-09T20:51:08.339Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhi002khw1ka5ch6js3', 'professional', 'abracadabra', 'hidden', '2026-08-09T20:51:08.375Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfs0011hw1k5q8lmrtc', 'professional', 'ai-generate-audio', 'available', '2026-08-09T20:51:08.336Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfb000mhw1kvxswg64j', 'professional', 'ai-generate-dictated', 'available', '2026-08-09T20:51:08.324Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglf6000hhw1k8ped9t4z', 'professional', 'ai-generate-image', 'available', '2026-08-09T20:51:08.320Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgp001vhw1k9rsa0l4a', 'professional', 'ai-generate-record', 'available', '2026-08-09T20:51:08.358Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglg4001bhw1k1j08zfnr', 'professional', 'ai-generate-refine', 'available', '2026-08-09T20:51:08.344Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglel0002hw1k906wzp4q', 'professional', 'ai-generate-typed', 'available', '2026-08-09T20:51:08.306Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgk001qhw1k8n2iizy4', 'professional', 'apqc', 'available', '2026-08-09T20:51:08.355Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglet0007hw1kzutcxluq', 'professional', 'bpmn-templates', 'available', '2026-08-09T20:51:08.311Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgliy0043hw1kav65apmf', 'professional', 'choice-of-llms', 'hidden', '2026-08-09T20:51:08.413Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgf001lhw1k5id997vp', 'professional', 'co-authoring', 'available', '2026-08-09T20:51:08.351Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfg000rhw1kkxzxfklc', 'professional', 'collaboration-groups', 'available', '2026-08-09T20:51:08.327Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfn000whw1kkjb3x0p7', 'professional', 'diff-processes', 'available', '2026-08-09T20:51:08.332Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglj30048hw1knttcvtzf', 'professional', 'local-llm', 'hidden', '2026-08-09T20:51:08.416Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgliu003yhw1kex8qh357', 'professional', 'mobile', 'hidden', '2026-08-09T20:51:08.410Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglez000chw1ky12omb6f', 'professional', 'nl-assist', 'available', '2026-08-09T20:51:08.316Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglia003ehw1kmernpdki', 'professional', 'process-mining-examples', 'hidden', '2026-08-09T20:51:08.397Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglje004ihw1kzrcc38wd', 'professional', 'process-mining-ocel', 'hidden', '2026-08-09T20:51:08.423Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgt0020hw1k8c9se6w8', 'professional', 'process-portal', 'available', '2026-08-09T20:51:08.361Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglij003ohw1khyp9u6wb', 'professional', 'process-review', 'hidden', '2026-08-09T20:51:08.403Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglh7002ahw1knpu7wllo', 'professional', 'processMining', 'hidden', '2026-08-09T20:51:08.368Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglif003jhw1kbfmm436n', 'professional', 'risk-control-examples', 'hidden', '2026-08-09T20:51:08.400Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhd002fhw1kb71bg527', 'professional', 'riskControl', 'hidden', '2026-08-09T20:51:08.372Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli20034hw1krn9uqvwp', 'professional', 'sharepoint', 'hidden', '2026-08-09T20:51:08.391Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglga001ghw1kom79jkhp', 'professional', 'sharing', 'available', '2026-08-09T20:51:08.348Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglgz0025hw1kjmd862hl', 'professional', 'simulator', 'hidden', '2026-08-09T20:51:08.365Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqgli60039hw1kb1zhtic6', 'professional', 'simulator-examples', 'hidden', '2026-08-09T20:51:08.394Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglj8004dhw1k4kf2p614', 'professional', 'soc2', 'hidden', '2026-08-09T20:51:08.419Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglio003thw1kcrrxdeez', 'professional', 'sop-generation', 'hidden', '2026-08-09T20:51:08.406Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhr002uhw1kuo67kp5s', 'professional', 'visio-export-bulk', 'hidden', '2026-08-09T20:51:08.384Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhx002zhw1k0pj8tpq5', 'professional', 'visio-export-individual', 'hidden', '2026-08-09T20:51:08.387Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglhm002phw1kz1xvvrrl', 'professional', 'visio-import-bulk', 'hidden', '2026-08-09T20:51:08.379Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt") VALUES ('cmsmqglfx0016hw1kzphgglgl', 'professional', 'visio-import-individual', 'available', '2026-08-09T20:51:08.340Z')
  ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt";

COMMIT;
