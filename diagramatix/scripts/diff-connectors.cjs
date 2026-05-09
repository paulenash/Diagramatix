const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();
  const r = await c.query(`
    SELECT d.name, d.data, d."updatedAt"
    FROM "Diagram" d
    JOIN "Project" p ON p.id = d."projectId"
    WHERE p.name = 'My Test Project 2'
    AND (d.name = 'Test Visio BPMN Diagram for Diagamatrix v1.02'
      OR d.name = 'Test Visio BPMN Diagram for Diagamatrix v1.02 (corrected)')
    ORDER BY d."updatedAt" DESC
  `);
  const broken = r.rows.find(x => x.name === 'Test Visio BPMN Diagram for Diagamatrix v1.02');
  const corrected = r.rows.find(x => x.name.endsWith('(corrected)'));
  if (!corrected) { console.log('CORRECTED diagram NOT FOUND. Found rows:', r.rows.map(x=>x.name)); process.exit(1); }

  function load(row) {
    const d = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const elById = new Map();
    for (const e of (d.elements || [])) elById.set(e.id, e);
    return { data: d, elById };
  }
  const B = load(broken);
  const C = load(corrected);
  function key(con, elById) {
    const s = elById.get(con.sourceId)?.label || '?';
    const t = elById.get(con.targetId)?.label || '?';
    return `${con.type}|${s}→${t}|${con.label || ''}`;
  }
  const Bcons = new Map();
  for (const c of (B.data.connectors || [])) Bcons.set(key(c, B.elById), c);
  const Ccons = new Map();
  for (const c of (C.data.connectors || [])) Ccons.set(key(c, C.elById), c);
  console.log('Total in BROKEN:', Bcons.size, ' Total in CORRECTED:', Ccons.size);
  console.log('\n--- IN CORRECTED BUT MISSING FROM BROKEN ---');
  for (const [k, c] of Ccons) {
    if (!Bcons.has(k)) {
      console.log('  ★ MISSING:', k);
      console.log('    waypoints:', JSON.stringify(c.waypoints));
      console.log('    sides=' + c.sourceSide + '/' + c.targetSide + ' offsets=' + c.sourceOffsetAlong?.toFixed(2) + '/' + c.targetOffsetAlong?.toFixed(2));
      console.log('    leaders=' + c.sourceInvisibleLeader + '/' + c.targetInvisibleLeader);
    }
  }
  console.log('\n--- IN BROKEN BUT MISSING FROM CORRECTED ---');
  for (const [k, c] of Bcons) if (!Ccons.has(k)) console.log('  ★ EXTRA:', k);
  console.log('\n--- DIFFERS (waypoints/sides/offsets) ---');
  for (const [k, ccon] of Ccons) {
    const bcon = Bcons.get(k); if (!bcon) continue;
    const wpsame = JSON.stringify(bcon.waypoints) === JSON.stringify(ccon.waypoints);
    const sideSame = bcon.sourceSide === ccon.sourceSide && bcon.targetSide === ccon.targetSide;
    const offSame = Math.abs((bcon.sourceOffsetAlong||0)-(ccon.sourceOffsetAlong||0))<0.01 && Math.abs((bcon.targetOffsetAlong||0)-(ccon.targetOffsetAlong||0))<0.01;
    const ldrSame = bcon.sourceInvisibleLeader === ccon.sourceInvisibleLeader && bcon.targetInvisibleLeader === ccon.targetInvisibleLeader;
    if (wpsame && sideSame && offSame && ldrSame) continue;
    console.log('  Δ', k);
    if (!sideSame) console.log('     sides: BROKEN=' + bcon.sourceSide + '/' + bcon.targetSide + ' → CORRECTED=' + ccon.sourceSide + '/' + ccon.targetSide);
    if (!offSame) console.log('     offsets: BROKEN=' + (bcon.sourceOffsetAlong?.toFixed(2)) + '/' + (bcon.targetOffsetAlong?.toFixed(2)) + ' → CORRECTED=' + (ccon.sourceOffsetAlong?.toFixed(2)) + '/' + (ccon.targetOffsetAlong?.toFixed(2)));
    if (!ldrSame) console.log('     leaders: BROKEN=' + bcon.sourceInvisibleLeader + '/' + bcon.targetInvisibleLeader + ' → CORRECTED=' + ccon.sourceInvisibleLeader + '/' + ccon.targetInvisibleLeader);
    if (!wpsame) {
      console.log('     wpsBROK :', JSON.stringify(bcon.waypoints));
      console.log('     wpsCORR :', JSON.stringify(ccon.waypoints));
    }
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
