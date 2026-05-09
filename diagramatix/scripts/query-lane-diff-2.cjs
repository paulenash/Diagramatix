const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();

  // Find both diagrams across all projects
  const r = await c.query(`
    SELECT d.id, d.name, d.data, p.name as project_name
    FROM "Diagram" d
    JOIN "Project" p ON p.id = d."projectId"
    WHERE d.name IN ('Lane Diff Test', 'Test Visio BPMN Diagram for Diagramatix v1.02')
    ORDER BY d.name, p.name
  `);

  for (const row of r.rows) {
    console.log('========================================');
    console.log('Diagram:', row.name, '| Project:', row.project_name);
    console.log('========================================');
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const poolsAndLanes = (data.elements || []).filter(e => e.type === 'pool' || e.type === 'lane' || e.type === 'sublane');
    console.log(JSON.stringify(poolsAndLanes, null, 2));
    console.log('');
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
