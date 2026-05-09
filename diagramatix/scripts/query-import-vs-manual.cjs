const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();

  // Get latest imported (highest size) and the manual one
  const r = await c.query(`
    SELECT d.id, d.name, d.data, d."updatedAt"
    FROM "Diagram" d
    JOIN "Project" p ON p.id = d."projectId"
    WHERE p.name = 'My Test Project 2'
    AND d.name IN ('Test Visio BPMN Diagram for Diagamatrix v1.02', 'Lane Diff Test')
    ORDER BY d.name, d."updatedAt" DESC
  `);

  // Pick most recent import
  const imported = r.rows.find(x => x.name.startsWith('Test Visio'));
  const manual = r.rows.find(x => x.name === 'Lane Diff Test');

  for (const [tag, row] of [['IMPORTED (most recent)', imported], ['MANUAL', manual]]) {
    if (!row) { console.log(tag, 'not found'); continue; }
    console.log('========================================');
    console.log(tag, '|', row.name, '| updated', row.updatedAt);
    console.log('========================================');
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const poolsAndLanes = (data.elements || []).filter(e => e.type === 'pool' || e.type === 'lane' || e.type === 'sublane');
    console.log(JSON.stringify(poolsAndLanes, null, 2));
    console.log('');
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
