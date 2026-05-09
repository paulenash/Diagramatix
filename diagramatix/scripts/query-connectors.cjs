const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();
  const r = await c.query(`
    SELECT d.id, d.name, d.data, d."updatedAt"
    FROM "Diagram" d
    JOIN "Project" p ON p.id = d."projectId"
    WHERE p.name = 'My Test Project 2'
    AND d.name = 'Test Visio BPMN Diagram for Diagamatrix v1.02'
    ORDER BY d."updatedAt" DESC
    LIMIT 1
  `);
  if (r.rows.length === 0) { console.log('NOT FOUND'); process.exit(1); }
  const row = r.rows[0];
  console.log('Diagram:', row.name, '| updated', row.updatedAt);
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  // Build a label map for elements
  const elById = new Map();
  for (const e of (data.elements || [])) elById.set(e.id, e);
  console.log('\n=== ELEMENTS (id, type, label) ===');
  for (const e of (data.elements || [])) {
    console.log(`  ${e.id.padEnd(12)} ${e.type.padEnd(20)} "${e.label || ''}" @(${Math.round(e.x)},${Math.round(e.y)}) ${Math.round(e.width)}x${Math.round(e.height)}`);
  }
  console.log('\n=== CONNECTORS ===');
  for (const con of (data.connectors || [])) {
    const src = elById.get(con.sourceId);
    const tgt = elById.get(con.targetId);
    const srcLbl = src ? `${src.type}"${src.label||''}"` : `?missing(${con.sourceId})`;
    const tgtLbl = tgt ? `${tgt.type}"${tgt.label||''}"` : `?missing(${con.targetId})`;
    console.log(`  ${con.type.padEnd(18)} ${srcLbl.padEnd(30)} → ${tgtLbl}`);
    console.log(`    label="${con.label||''}" sides=${con.sourceSide}/${con.targetSide} offsets=${con.sourceOffsetAlong?.toFixed(2)}/${con.targetOffsetAlong?.toFixed(2)}`);
    console.log(`    waypoints=${JSON.stringify(con.waypoints)}`);
    console.log(`    leaders=${con.sourceInvisibleLeader}/${con.targetInvisibleLeader}`);
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
