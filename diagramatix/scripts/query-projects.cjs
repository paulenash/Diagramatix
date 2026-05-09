const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();
  const r = await c.query(`
    SELECT p.name as project, d.name as diagram, d.id, LENGTH(d.data::text) as size
    FROM "Diagram" d
    JOIN "Project" p ON p.id = d."projectId"
    WHERE p.name ILIKE '%test project%'
    ORDER BY p.name, d.name
  `);
  for (const row of r.rows) {
    console.log(`Project="${row.project}" | Diagram="${row.diagram}" | size=${row.size}`);
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
