const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();
  const r = await c.query(`
    SELECT d.name, d."updatedAt", d."createdAt"
    FROM "Diagram" d JOIN "Project" p ON p.id = d."projectId"
    WHERE p.name = 'My Test Project 2' AND d.name LIKE '%Standard BPMN%'
    ORDER BY d."updatedAt" DESC LIMIT 3
  `);
  for (const row of r.rows) console.log(`updated=${row.updatedAt} created=${row.createdAt} name=${row.name}`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
