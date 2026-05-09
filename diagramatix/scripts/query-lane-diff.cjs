const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();
  const r = await c.query(`
    SELECT d.id, d.name, d.data, p.name as project_name
    FROM "Diagram" d
    JOIN "Project" p ON p.id = d."projectId"
    WHERE d.name = 'Lane Diff Test'
    AND p.name = 'My Test Project 2'
  `);
  if (r.rows.length === 0) {
    console.log('NO DIAGRAM FOUND');
  } else {
    for (const row of r.rows) {
      console.log('Diagram:', row.name, 'in', row.project_name);
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      const poolsAndLanes = (data.elements || []).filter(e => e.type === 'pool' || e.type === 'lane' || e.type === 'sublane');
      console.log(JSON.stringify(poolsAndLanes, null, 2));
    }
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
