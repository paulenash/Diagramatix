const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/diagramatix' });
  await c.connect();
  const r = await c.query(`
    SELECT d.name, d.data
    FROM "Diagram" d
    JOIN "Project" p ON p.id = d."projectId"
    WHERE p.name = 'My Test Project 2'
    AND d.name LIKE 'Test Visio BPMN Diagram for Diaga%v1.02%'
    ORDER BY d."updatedAt" DESC
  `);
  const broken = r.rows.find(x => !x.name.endsWith('(corrected)'));
  const corrected = r.rows.find(x => x.name.endsWith('(corrected)'));
  function load(row) {
    const d = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const elById = new Map();
    for (const e of (d.elements || [])) elById.set(e.id, e);
    return { data: d, elById };
  }
  const C = load(corrected);
  console.log('=== CORRECTED label fields per connector ===');
  for (const c of (C.data.connectors||[])) {
    const s = C.elById.get(c.sourceId)?.label || '?';
    const t = C.elById.get(c.targetId)?.label || '?';
    if (!c.label) continue;
    console.log(`  ${c.type.padEnd(18)} "${(s||'').replace(/\n/g,'/')}"→"${(t||'').replace(/\n/g,'/')}" label="${c.label.replace(/\n/g,'/')}"`);
    console.log(`    labelOffsetX=${(c.labelOffsetX??'-')} labelOffsetY=${(c.labelOffsetY??'-')} labelWidth=${(c.labelWidth??'-')} labelAnchor=${c.labelAnchor||'-'}`);
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
