const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();
  const r = await c.query(`
    SELECT d.name, d.data, d."updatedAt"
    FROM "Diagram" d
    JOIN "Project" p ON p.id = d."projectId"
    WHERE p.name = 'My Test Project 2'
    AND d.name LIKE '%Standard BPMN%'
    ORDER BY d."updatedAt" DESC
    LIMIT 1
  `);
  if (!r.rows.length) { console.log("no diagram"); process.exit(1); }
  const data = typeof r.rows[0].data === 'string' ? JSON.parse(r.rows[0].data) : r.rows[0].data;
  const pl = (data.elements||[]).filter(e => ["pool","lane","sublane"].includes(e.type));
  console.log("Pools/Lanes:", JSON.stringify(pl, null, 2));
  console.log("\nConnector count:", data.connectors?.length);
  console.log("First 2 connectors:", JSON.stringify((data.connectors||[]).slice(0,2), null, 2));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
