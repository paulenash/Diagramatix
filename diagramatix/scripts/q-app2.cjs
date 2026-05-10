const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();
  const r = await c.query(`
    SELECT p.name as proj, d.name, d."updatedAt", LENGTH(d.data::text) as size
    FROM "Diagram" d JOIN "Project" p ON p.id = d."projectId"
    WHERE d.name LIKE '%Application%'
    ORDER BY d."updatedAt" DESC LIMIT 5
  `);
  for (const row of r.rows) console.log(`${row.updatedAt} | proj="${row.proj}" diag="${row.name}" size=${row.size}`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
