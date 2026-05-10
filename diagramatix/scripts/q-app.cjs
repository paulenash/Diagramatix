const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();
  const r = await c.query(`
    SELECT d.data, d."updatedAt"
    FROM "Diagram" d JOIN "Project" p ON p.id = d."projectId"
    WHERE p.name = 'My Test Project 2' AND d.name = 'Application Process'
    ORDER BY d."updatedAt" DESC LIMIT 1
  `);
  if (!r.rows.length) { console.log("not found"); process.exit(0); }
  const data = typeof r.rows[0].data === 'string' ? JSON.parse(r.rows[0].data) : r.rows[0].data;
  console.log("updated:", r.rows[0].updatedAt);
  console.log("\n=== ELEMENTS ===");
  for (const e of (data.elements||[])) {
    console.log(`  ${e.type.padEnd(14)} "${(e.label||'').replace(/\n/g,'/')}" x=${Math.round(e.x)} y=${Math.round(e.y)} w=${Math.round(e.width)} h=${Math.round(e.height)} parent=${e.parentId?.slice(0,4)||'-'}`);
  }
  console.log(`\n=== ${(data.connectors||[]).length} CONNECTORS by type ===`);
  const byType = new Map();
  for (const c of (data.connectors||[])) byType.set(c.type, (byType.get(c.type)||0)+1);
  for (const [t,n] of byType) console.log(`  ${t.padEnd(20)} ${n}`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
