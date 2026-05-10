const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();
  const r = await c.query(`
    SELECT d.data
    FROM "Diagram" d JOIN "Project" p ON p.id = d."projectId"
    WHERE p.name = 'My Test Project 2' AND d.name LIKE '%Standard BPMN%'
    ORDER BY d."updatedAt" DESC LIMIT 1
  `);
  const data = typeof r.rows[0].data === 'string' ? JSON.parse(r.rows[0].data) : r.rows[0].data;
  console.log("ALL ELEMENTS:");
  for (const e of data.elements) {
    console.log(`  ${e.type.padEnd(14)} "${e.label||''}" x=${Math.round(e.x)} y=${Math.round(e.y)} w=${Math.round(e.width)} h=${Math.round(e.height)} parent=${e.parentId?.slice(0,4)||'-'}`);
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
