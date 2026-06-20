-- Diagramatix Simulator example catalog seed (generated).
-- Idempotent: re-runnable; ON CONFLICT(slug) refreshes content.
-- Paste into the Azure Postgres query editor (or any psql client).

INSERT INTO "SimulationExample"
  ("id","slug","title","concept","description","difficulty","sortOrder","published","package","createdAt","updatedAt")
VALUES (
  'seedex_single-bottleneck', 'single-bottleneck', 'Single bottleneck', 'One team can''t keep up — watch the queue build, then add a person.',
  'A claims team handles one task. Work arrives faster than one person can clear it,
so a queue forms and wait time climbs.

**Demo:** Run the *Baseline* — Analysts sit near 100% utilisation with a growing queue.
Then compare with *Add an analyst* (capacity 2) to see the wait collapse. Launch the
Replay to watch tokens stack at the task, or the Heatmap to see it glow.', 'intro', 10, true,
  '{"version":1,"teams":[{"name":"Analysts","capacity":1}],"diagrams":[{"key":"claims","name":"Claims handling","type":"bpmn","data":{"viewport":{"x":0,"y":0,"zoom":1},"elements":[{"id":"start","type":"start-event","x":60,"y":140,"width":48,"height":48,"label":"Work arrives","properties":{"sim":{"arrival":{"kind":"exponential","mean":10}}}},{"id":"assess","type":"task","x":200,"y":140,"width":120,"height":64,"label":"Assess claim","properties":{"sim":{"cycleTime":{"kind":"exponential","mean":8},"teamId":"Analysts"}}},{"id":"end","type":"end-event","x":400,"y":140,"width":48,"height":48,"label":"Done","properties":{}}],"connectors":[{"id":"c_start_assess","sourceId":"start","targetId":"assess"},{"id":"c_assess_end","sourceId":"assess","targetId":"end"}],"name":"Claims handling"}}],"study":{"name":"Can one analyst cope?","rootKeys":["claims"]},"scenarios":[{"name":"Baseline (1 analyst)","isBaseline":true,"runConfig":{"clockUnit":"minute","horizon":2000,"warmUp":200,"replications":12,"seed":1,"collectQueues":true}},{"name":"Add an analyst","runConfig":{"clockUnit":"minute","horizon":2000,"warmUp":200,"replications":12,"seed":1,"collectQueues":true},"overrides":{"teams":{"Analysts":{"capacity":2}}}}]}'::jsonb, now(), now()
)
ON CONFLICT ("slug") DO UPDATE SET
  "title"=EXCLUDED."title", "concept"=EXCLUDED."concept", "description"=EXCLUDED."description",
  "difficulty"=EXCLUDED."difficulty", "sortOrder"=EXCLUDED."sortOrder",
  "published"=EXCLUDED."published", "package"=EXCLUDED."package", "updatedAt"=now();

INSERT INTO "SimulationExample"
  ("id","slug","title","concept","description","difficulty","sortOrder","published","package","createdAt","updatedAt")
VALUES (
  'seedex_shared-team-two-processes', 'shared-team-two-processes', 'Shared team, two processes', 'Two processes draw on the same pool — cross-process contention you can''t see in one diagram.',
  'Onboarding and Support both rely on the same *Case Workers* pool. Each process looks
fine alone, but together they overload the shared team.

**Demo:** Run the *Baseline* and note Case Workers are the top bottleneck across BOTH
processes. Then *Hire two more* and compare — the portfolio view is the point: capacity
planning across processes, not per-diagram.', 'core', 20, true,
  '{"version":1,"teams":[{"name":"Case Workers","capacity":3}],"diagrams":[{"key":"onboarding","name":"Customer onboarding","type":"bpmn","data":{"viewport":{"x":0,"y":0,"zoom":1},"elements":[{"id":"start","type":"start-event","x":60,"y":140,"width":48,"height":48,"label":"Work arrives","properties":{"sim":{"arrival":{"kind":"exponential","mean":12}}}},{"id":"verify","type":"task","x":200,"y":140,"width":120,"height":64,"label":"Verify identity","properties":{"sim":{"cycleTime":{"kind":"triangular","min":4,"mode":6,"max":10},"teamId":"Case Workers"}}},{"id":"setup","type":"task","x":400,"y":140,"width":120,"height":64,"label":"Set up account","properties":{"sim":{"cycleTime":{"kind":"exponential","mean":7},"teamId":"Case Workers"}}},{"id":"end","type":"end-event","x":600,"y":140,"width":48,"height":48,"label":"Done","properties":{}}],"connectors":[{"id":"c_start_verify","sourceId":"start","targetId":"verify"},{"id":"c_verify_setup","sourceId":"verify","targetId":"setup"},{"id":"c_setup_end","sourceId":"setup","targetId":"end"}],"name":"Customer onboarding"}},{"key":"support","name":"Support tickets","type":"bpmn","data":{"viewport":{"x":0,"y":0,"zoom":1},"elements":[{"id":"start","type":"start-event","x":60,"y":140,"width":48,"height":48,"label":"Work arrives","properties":{"sim":{"arrival":{"kind":"exponential","mean":9}}}},{"id":"triage","type":"task","x":200,"y":140,"width":120,"height":64,"label":"Triage ticket","properties":{"sim":{"cycleTime":{"kind":"exponential","mean":5},"teamId":"Case Workers"}}},{"id":"end","type":"end-event","x":400,"y":140,"width":48,"height":48,"label":"Done","properties":{}}],"connectors":[{"id":"c_start_triage","sourceId":"start","targetId":"triage"},{"id":"c_triage_end","sourceId":"triage","targetId":"end"}],"name":"Support tickets"}}],"study":{"name":"Can the team carry both?","rootKeys":["onboarding","support"]},"scenarios":[{"name":"Baseline (3 workers)","isBaseline":true,"runConfig":{"clockUnit":"minute","horizon":2000,"warmUp":200,"replications":12,"seed":1,"collectQueues":true}},{"name":"Hire two more","runConfig":{"clockUnit":"minute","horizon":2000,"warmUp":200,"replications":12,"seed":1,"collectQueues":true},"overrides":{"teams":{"Case Workers":{"capacity":5}}}}]}'::jsonb, now(), now()
)
ON CONFLICT ("slug") DO UPDATE SET
  "title"=EXCLUDED."title", "concept"=EXCLUDED."concept", "description"=EXCLUDED."description",
  "difficulty"=EXCLUDED."difficulty", "sortOrder"=EXCLUDED."sortOrder",
  "published"=EXCLUDED."published", "package"=EXCLUDED."package", "updatedAt"=now();

INSERT INTO "SimulationExample"
  ("id","slug","title","concept","description","difficulty","sortOrder","published","package","createdAt","updatedAt")
VALUES (
  'seedex_surge-intervention', 'surge-intervention', 'Surge staffing intervention', 'Schedule a timed capacity surge and compare it to leaving the team as-is.',
  'A processing line is overloaded for the whole run. The *Surge* scenario schedules a
planned intervention: at t=120 add capacity for 600 minutes, then revert.

**Demo:** Compare *Baseline* vs *Surge at t=120* — the surge clears the backlog for a
window. This is the deterministic cousin of the live Operator ''fork the timeline''.', 'core', 30, true,
  '{"version":1,"teams":[{"name":"Processors","capacity":1}],"diagrams":[{"key":"line","name":"Processing line","type":"bpmn","data":{"viewport":{"x":0,"y":0,"zoom":1},"elements":[{"id":"start","type":"start-event","x":60,"y":140,"width":48,"height":48,"label":"Work arrives","properties":{"sim":{"arrival":{"kind":"exponential","mean":6}}}},{"id":"process","type":"task","x":200,"y":140,"width":120,"height":64,"label":"Process item","properties":{"sim":{"cycleTime":{"kind":"exponential","mean":5},"teamId":"Processors"}}},{"id":"end","type":"end-event","x":400,"y":140,"width":48,"height":48,"label":"Done","properties":{}}],"connectors":[{"id":"c_start_process","sourceId":"start","targetId":"process"},{"id":"c_process_end","sourceId":"process","targetId":"end"}],"name":"Processing line"}}],"study":{"name":"Does a surge help?","rootKeys":["line"]},"scenarios":[{"name":"Baseline (no surge)","isBaseline":true,"runConfig":{"clockUnit":"minute","horizon":1500,"warmUp":200,"replications":12,"seed":1,"collectQueues":true}},{"name":"Surge at t=120","runConfig":{"clockUnit":"minute","horizon":1500,"warmUp":200,"replications":12,"seed":1,"collectQueues":true,"interventions":[{"id":"surge1","t":120,"kind":"capacity","target":"Processors","value":4,"duration":600}]}}]}'::jsonb, now(), now()
)
ON CONFLICT ("slug") DO UPDATE SET
  "title"=EXCLUDED."title", "concept"=EXCLUDED."concept", "description"=EXCLUDED."description",
  "difficulty"=EXCLUDED."difficulty", "sortOrder"=EXCLUDED."sortOrder",
  "published"=EXCLUDED."published", "package"=EXCLUDED."package", "updatedAt"=now();
