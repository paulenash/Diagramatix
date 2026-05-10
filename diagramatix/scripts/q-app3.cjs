const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();
  const r = await c.query(`
    SELECT p.name as proj, d.name, d."updatedAt", LENGTH(d.data::text) as size, d.id
    FROM "Diagram" d JOIN "Project" p ON p.id = d."projectId"
    WHERE p.name = 'My Test Project 2'
    AND LENGTH(d.data::text) > 1000
    ORDER BY d."updatedAt" DESC LIMIT 10
  `);
  for (const row of r.rows) console.log(`${row.updatedAt} | "${row.name}" size=${row.size}`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
