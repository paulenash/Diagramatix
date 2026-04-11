/**
 * Generate a Domain Diagram from the Diagramatix relational DDL (v2).
 * Uses database: "postgres" mode with PK/FK/NOT NULL attribute markers.
 * Stereotype: <<table>> for entities, <<enumeration>> for ref tables.
 */

const PROJECT_ID = "cmne9q5ow0003os1kj0cmkqcz"; // "My Test Project 2"

// ─── DDL DEFINITIONS ────────────────────────────────────────────────

const enumerations = [
  { name: "ref_org_entity_type", values: ["ADI","Insurer","LifeInsurer","HealthInsurer","RSE","Other"] },
  { name: "ref_org_role", values: ["Owner","Admin","RiskOwner","ProcessOwner","ControlOwner","InternalAudit","BoardObserver","Viewer"] },
  { name: "ref_diagram_type", values: ["context","basic","process-context","state-machine","bpmn","domain","value-chain"] },
  { name: "ref_symbol_type", values: ["task","gateway","start-event","intermediate-event","end-event","use-case","actor","team","state","initial-state","final-state","pool","lane","subprocess","subprocess-expanded","system-boundary","system-boundary-body","hourglass","composite-state","composite-state-body","system","data-object","data-store","group","text-annotation","external-entity","process-system","uml-class","uml-enumeration","sublane","fork-join","submachine","chevron","chevron-collapsed","process-group"] },
  { name: "ref_bpmn_task_type", values: ["none","user","service","script","send","receive","manual","business-rule"] },
  { name: "ref_gateway_type", values: ["none","exclusive","inclusive","parallel","event-based"] },
  { name: "ref_gateway_role", values: ["decision","merge"] },
  { name: "ref_event_type", values: ["none","message","timer","error","signal","terminate","conditional","escalation","cancel","compensation","link"] },
  { name: "ref_repeat_type", values: ["none","loop","mi-sequential","mi-parallel"] },
  { name: "ref_flow_type", values: ["none","catching","throwing"] },
  { name: "ref_connector_type", values: ["sequence","message","association","transition","associationBPMN","messageBPMN","flow","uml-association","uml-aggregation","uml-composition","uml-generalisation"] },
  { name: "ref_side", values: ["top","right","bottom","left"] },
  { name: "ref_direction_type", values: ["directed","non-directed","open-directed","both"] },
  { name: "ref_routing_type", values: ["direct","rectilinear","curvilinear"] },
  { name: "ref_diagram_status", values: ["draft","final","production"] },
  { name: "ref_display_mode", values: ["normal","hand-drawn"] },
  { name: "ref_label_anchor", values: ["midpoint","source"] },
  { name: "ref_label_mode", values: ["informal","formal"] },
  { name: "ref_reading_direction", values: ["none","to-source","to-target"] },
  { name: "ref_pool_type", values: ["black-box","white-box"] },
  { name: "ref_subprocess_type", values: ["normal","call","event","transaction"] },
  { name: "ref_interruption_type", values: ["interrupting","non-interrupting"] },
  { name: "ref_annotation_color", values: ["black","green","orange","red","purple"] },
  { name: "ref_annotation_font_style", values: ["normal","italic"] },
  { name: "ref_value_analysis", values: ["none","VA","NNVA","NVA"] },
  { name: "ref_time_unit", values: ["none","sec","min","hrs","days","other"] },
  { name: "ref_uml_visibility", values: ["+","-","#"] },
  { name: "ref_data_role", values: ["none","input","output"] },
  { name: "ref_data_multiplicity", values: ["single","collection"] },
];

// attr flags: pk, nn (not null), fk (foreign key target table), fkCol (fk column, default "id"/"code")
const tables = [
  { name: "org", attrs: [
    { name: "id", type: "TEXT", pk: true, nn: true },
    { name: "name", type: "TEXT", nn: true },
    { name: "entity_type", type: "TEXT", nn: true, fk: "ref_org_entity_type", fkCol: "code" },
    { name: "created_at", type: "TIMESTAMPTZ", nn: true },
  ]},
  { name: "app_user", attrs: [
    { name: "id", type: "TEXT", pk: true, nn: true },
    { name: "email", type: "TEXT", nn: true },
    { name: "name", type: "TEXT" },
    { name: "password", type: "TEXT", nn: true },
    { name: "reset_token", type: "TEXT" },
    { name: "reset_token_expiry", type: "TIMESTAMPTZ" },
    { name: "created_at", type: "TIMESTAMPTZ", nn: true },
  ]},
  { name: "org_member", attrs: [
    { name: "id", type: "TEXT", pk: true, nn: true },
    { name: "org_id", type: "TEXT", nn: true, fk: "org", fkCol: "id" },
    { name: "user_id", type: "TEXT", nn: true, fk: "app_user", fkCol: "id" },
    { name: "role", type: "TEXT", nn: true, fk: "ref_org_role", fkCol: "code" },
    { name: "created_at", type: "TIMESTAMPTZ", nn: true },
  ]},
  { name: "project", attrs: [
    { name: "id", type: "TEXT", pk: true, nn: true },
    { name: "name", type: "TEXT", nn: true },
    { name: "description", type: "TEXT", nn: true },
    { name: "owner_name", type: "TEXT", nn: true },
    { name: "user_id", type: "TEXT", nn: true, fk: "app_user", fkCol: "id" },
    { name: "org_id", type: "TEXT", nn: true, fk: "org", fkCol: "id" },
    { name: "created_at", type: "TIMESTAMPTZ", nn: true },
    { name: "updated_at", type: "TIMESTAMPTZ", nn: true },
  ]},
  { name: "diagram", attrs: [
    { name: "id", type: "TEXT", pk: true, nn: true },
    { name: "name", type: "TEXT", nn: true },
    { name: "type", type: "TEXT", nn: true, fk: "ref_diagram_type", fkCol: "code" },
    { name: "display_mode", type: "TEXT", nn: true, fk: "ref_display_mode", fkCol: "code" },
    { name: "user_id", type: "TEXT", nn: true, fk: "app_user", fkCol: "id" },
    { name: "project_id", type: "TEXT", fk: "project", fkCol: "id" },
    { name: "org_id", type: "TEXT", nn: true, fk: "org", fkCol: "id" },
    { name: "created_at", type: "TIMESTAMPTZ", nn: true },
    { name: "updated_at", type: "TIMESTAMPTZ", nn: true },
  ]},
  { name: "diagram_template", attrs: [
    { name: "id", type: "TEXT", pk: true, nn: true },
    { name: "name", type: "TEXT", nn: true },
    { name: "diagram_type", type: "TEXT", nn: true, fk: "ref_diagram_type", fkCol: "code" },
    { name: "template_type", type: "TEXT", nn: true },
    { name: "user_id", type: "TEXT", nn: true, fk: "app_user", fkCol: "id" },
    { name: "created_at", type: "TIMESTAMPTZ", nn: true },
    { name: "updated_at", type: "TIMESTAMPTZ", nn: true },
  ]},
  { name: "diagram_settings", attrs: [
    { name: "diagram_id", type: "TEXT", pk: true, nn: true, fk: "diagram", fkCol: "id" },
    { name: "viewport_x", type: "NUMERIC", nn: true },
    { name: "viewport_y", type: "NUMERIC", nn: true },
    { name: "viewport_zoom", type: "NUMERIC", nn: true },
    { name: "font_size", type: "NUMERIC" },
    { name: "connector_font_size", type: "NUMERIC" },
    { name: "title_font_size", type: "NUMERIC" },
  ]},
  { name: "diagram_title", attrs: [
    { name: "diagram_id", type: "TEXT", pk: true, nn: true, fk: "diagram", fkCol: "id" },
    { name: "version", type: "TEXT" },
    { name: "authors", type: "TEXT" },
    { name: "status", type: "TEXT", fk: "ref_diagram_status", fkCol: "code" },
    { name: "show_title", type: "BOOLEAN" },
  ]},
  { name: "element", attrs: [
    { name: "id", type: "TEXT", pk: true, nn: true },
    { name: "diagram_id", type: "TEXT", nn: true, fk: "diagram", fkCol: "id" },
    { name: "type", type: "TEXT", nn: true, fk: "ref_symbol_type", fkCol: "code" },
    { name: "x", type: "NUMERIC", nn: true },
    { name: "y", type: "NUMERIC", nn: true },
    { name: "width", type: "NUMERIC", nn: true },
    { name: "height", type: "NUMERIC", nn: true },
    { name: "label", type: "TEXT", nn: true },
    { name: "parent_id", type: "TEXT" },
    { name: "boundary_host_id", type: "TEXT" },
    { name: "task_type", type: "TEXT", fk: "ref_bpmn_task_type", fkCol: "code" },
    { name: "gateway_type", type: "TEXT", fk: "ref_gateway_type", fkCol: "code" },
    { name: "event_type", type: "TEXT", fk: "ref_event_type", fkCol: "code" },
    { name: "repeat_type", type: "TEXT", fk: "ref_repeat_type", fkCol: "code" },
    { name: "flow_type", type: "TEXT", fk: "ref_flow_type", fkCol: "code" },
    { name: "linked_diagram_id", type: "TEXT" },
  ]},
  { name: "uml_attribute", attrs: [
    { name: "id", type: "BIGSERIAL", pk: true, nn: true },
    { name: "element_id", type: "TEXT", nn: true, fk: "element", fkCol: "id" },
    { name: "ordinal", type: "INT", nn: true },
    { name: "visibility", type: "TEXT", fk: "ref_uml_visibility", fkCol: "code" },
    { name: "name", type: "TEXT", nn: true },
    { name: "type", type: "TEXT" },
    { name: "multiplicity", type: "TEXT" },
    { name: "default_value", type: "TEXT" },
    { name: "property_string", type: "TEXT" },
    { name: "is_derived", type: "BOOLEAN" },
  ]},
  { name: "uml_operation", attrs: [
    { name: "id", type: "BIGSERIAL", pk: true, nn: true },
    { name: "element_id", type: "TEXT", nn: true, fk: "element", fkCol: "id" },
    { name: "ordinal", type: "INT", nn: true },
    { name: "visibility", type: "TEXT", fk: "ref_uml_visibility", fkCol: "code" },
    { name: "name", type: "TEXT", nn: true },
  ]},
  { name: "uml_enum_value", attrs: [
    { name: "id", type: "BIGSERIAL", pk: true, nn: true },
    { name: "element_id", type: "TEXT", nn: true, fk: "element", fkCol: "id" },
    { name: "ordinal", type: "INT", nn: true },
    { name: "value", type: "TEXT", nn: true },
  ]},
  { name: "connector", attrs: [
    { name: "id", type: "TEXT", pk: true, nn: true },
    { name: "diagram_id", type: "TEXT", nn: true, fk: "diagram", fkCol: "id" },
    { name: "source_id", type: "TEXT", nn: true, fk: "element", fkCol: "id" },
    { name: "target_id", type: "TEXT", nn: true, fk: "element", fkCol: "id" },
    { name: "type", type: "TEXT", nn: true, fk: "ref_connector_type", fkCol: "code" },
    { name: "direction_type", type: "TEXT", nn: true, fk: "ref_direction_type", fkCol: "code" },
    { name: "routing_type", type: "TEXT", nn: true, fk: "ref_routing_type", fkCol: "code" },
    { name: "source_side", type: "TEXT", nn: true, fk: "ref_side", fkCol: "code" },
    { name: "target_side", type: "TEXT", nn: true, fk: "ref_side", fkCol: "code" },
  ]},
  { name: "connector_waypoint", attrs: [
    { name: "id", type: "BIGSERIAL", pk: true, nn: true },
    { name: "connector_id", type: "TEXT", nn: true, fk: "connector", fkCol: "id" },
    { name: "ordinal", type: "INT", nn: true },
    { name: "x", type: "NUMERIC", nn: true },
    { name: "y", type: "NUMERIC", nn: true },
  ]},
  { name: "project_color", attrs: [
    { name: "id", type: "BIGSERIAL", pk: true, nn: true },
    { name: "project_id", type: "TEXT", nn: true, fk: "project", fkCol: "id" },
    { name: "symbol_type", type: "TEXT", nn: true, fk: "ref_symbol_type", fkCol: "code" },
    { name: "color", type: "TEXT", nn: true },
  ]},
  { name: "diagram_color", attrs: [
    { name: "id", type: "BIGSERIAL", pk: true, nn: true },
    { name: "diagram_id", type: "TEXT", nn: true, fk: "diagram", fkCol: "id" },
    { name: "symbol_type", type: "TEXT", nn: true, fk: "ref_symbol_type", fkCol: "code" },
    { name: "color", type: "TEXT", nn: true },
  ]},
  { name: "project_folder", attrs: [
    { name: "id", type: "TEXT", pk: true, nn: true },
    { name: "project_id", type: "TEXT", pk: true, nn: true, fk: "project", fkCol: "id" },
    { name: "name", type: "TEXT", nn: true },
    { name: "parent_id", type: "TEXT" },
    { name: "collapsed", type: "BOOLEAN" },
    { name: "ordinal", type: "INT" },
  ]},
  { name: "diagram_folder_map", attrs: [
    { name: "diagram_id", type: "TEXT", pk: true, nn: true, fk: "diagram", fkCol: "id" },
    { name: "project_id", type: "TEXT", nn: true, fk: "project", fkCol: "id" },
    { name: "folder_id", type: "TEXT", nn: true },
    { name: "ordinal", type: "INT" },
  ]},
  { name: "template_element", attrs: [
    { name: "id", type: "TEXT", pk: true, nn: true },
    { name: "template_id", type: "TEXT", nn: true, fk: "diagram_template", fkCol: "id" },
    { name: "type", type: "TEXT", nn: true, fk: "ref_symbol_type", fkCol: "code" },
    { name: "x", type: "NUMERIC", nn: true },
    { name: "y", type: "NUMERIC", nn: true },
    { name: "width", type: "NUMERIC", nn: true },
    { name: "height", type: "NUMERIC", nn: true },
    { name: "label", type: "TEXT", nn: true },
  ]},
  { name: "template_connector", attrs: [
    { name: "id", type: "TEXT", pk: true, nn: true },
    { name: "template_id", type: "TEXT", nn: true, fk: "diagram_template", fkCol: "id" },
    { name: "source_id", type: "TEXT", nn: true, fk: "template_element", fkCol: "id" },
    { name: "target_id", type: "TEXT", nn: true, fk: "template_element", fkCol: "id" },
    { name: "type", type: "TEXT", nn: true, fk: "ref_connector_type", fkCol: "code" },
  ]},
  { name: "template_connector_waypoint", attrs: [
    { name: "id", type: "BIGSERIAL", pk: true, nn: true },
    { name: "connector_id", type: "TEXT", nn: true, fk: "template_connector", fkCol: "id" },
    { name: "ordinal", type: "INT", nn: true },
    { name: "x", type: "NUMERIC", nn: true },
    { name: "y", type: "NUMERIC", nn: true },
  ]},
];

// ─── SIZING ─────────────────────────────────────────────────────────
const CHAR_W = 6.5, LINE_H = 14, BASE_HEADER_H = 28, PAD = 4, MIN_W = 80, MIN_H = 40, STEREO_H = 11;

function computeClassSize(t) {
  const headerH = BASE_HEADER_H + STEREO_H;
  let maxW = Math.max(`«table»`.length * CHAR_W * 0.8, t.name.length * CHAR_W);
  for (const a of t.attrs) {
    let s = `+ ${a.name} : ${a.type}`;
    if (a.nn) s += " [1]";
    if (a.pk) s += " {PK}";
    if (a.fk) s += ` {FK → ${a.fk}}`;
    maxW = Math.max(maxW, s.length * CHAR_W);
  }
  const w = Math.max(MIN_W, maxW + PAD * 2);
  const h = Math.max(MIN_H, headerH + t.attrs.length * LINE_H + 18);
  return { w: Math.ceil(w), h: Math.ceil(h) };
}

function computeEnumSize(e) {
  const headerH = BASE_HEADER_H + STEREO_H;
  let maxW = Math.max(`«enumeration»`.length * CHAR_W * 0.8, e.name.length * CHAR_W);
  for (const v of e.values) maxW = Math.max(maxW, v.length * CHAR_W);
  const w = Math.max(MIN_W, maxW + PAD * 2);
  const h = Math.max(MIN_H, headerH + e.values.length * LINE_H);
  return { w: Math.ceil(w), h: Math.ceil(h) };
}

// ─── LAYOUT ─────────────────────────────────────────────────────────
let nextId = 1;
const mkId = () => `el-${nextId++}`;
const mkConnId = () => `cn-${nextId++}`;

const elements = [];
const connectors = [];
const elementMap = {};

const tableSizes = tables.map(t => ({ ...t, ...computeClassSize(t) }));
const enumSizes = enumerations.map(e => ({ ...e, ...computeEnumSize(e) }));

// Place tables in 4-column grid
let col = 0, curX = 100, curY = 100, rowH = 0;
for (const t of tableSizes) {
  if (col >= 4) { col = 0; curX = 100; curY += rowH + 40; rowH = 0; }
  const id = mkId();
  elementMap[t.name] = id;
  elements.push({
    id, type: "uml-class",
    x: curX, y: curY, width: t.w, height: t.h,
    label: t.name,
    properties: {
      showAttributes: true, showOperations: false,
      stereotype: "table", showStereotype: true,
      attributes: t.attrs.map(a => ({
        visibility: "+",
        name: a.name,
        type: a.type,
        ...(a.nn ? { notNull: true } : {}),
        ...(a.pk ? { primaryKey: true } : {}),
        ...(a.fk ? { foreignKey: true, fkTable: a.fk, fkColumn: a.fkCol ?? "id" } : {}),
      })),
    },
  });
  rowH = Math.max(rowH, t.h);
  curX += t.w + 60;
  col++;
}

// Place enumerations in 5-column grid to the right
let enumCol = 0, enumX = 2200, enumY = 100, enumRowH = 0;
for (const e of enumSizes) {
  if (enumCol >= 5) { enumCol = 0; enumX = 2200; enumY += enumRowH + 40; enumRowH = 0; }
  const id = mkId();
  elementMap[e.name] = id;
  elements.push({
    id, type: "uml-enumeration",
    x: enumX, y: enumY, width: e.w, height: e.h,
    label: e.name,
    properties: { stereotype: "enumeration", showStereotype: true, values: e.values },
  });
  enumRowH = Math.max(enumRowH, e.h);
  enumX += e.w + 60;
  enumCol++;
}

// Create FK connectors with multiplicities
for (const t of tables) {
  const srcId = elementMap[t.name];
  for (const a of t.attrs) {
    if (!a.fk || !elementMap[a.fk] || srcId === elementMap[a.fk]) continue;
    const tgtId = elementMap[a.fk];
    const isToEnum = a.fk.startsWith("ref_");
    connectors.push({
      id: mkConnId(),
      sourceId: srcId, targetId: tgtId,
      sourceSide: isToEnum ? "right" : "right",
      targetSide: isToEnum ? "left" : "left",
      type: "uml-association",
      directionType: "non-directed",
      routingType: "rectilinear",
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints: [],
      sourceMultiplicity: a.pk ? "1" : "*",
      targetMultiplicity: "1",
    });
  }
}

// ─── BUILD & INSERT ─────────────────────────────────────────────────
const diagramData = {
  elements, connectors,
  viewport: { x: 0, y: 0, zoom: 0.5 },
  title: { version: "1.5", authors: "Generated from DDL", status: "draft", showTitle: true },
  fontSize: 12, connectorFontSize: 10, titleFontSize: 14,
  database: "postgres",
};

async function main() {
  const pg = await import("pg");
  const pool = new pg.default.Pool({ connectionString: "postgresql://postgres:postgres@localhost:51214/postgres" });
  const id = "ddl-domain-v2-" + Date.now();
  await pool.query(
    `INSERT INTO "Diagram" (id, name, type, data, "colorConfig", "displayMode", "userId", "projectId", "orgId", "createdAt", "updatedAt")
     SELECT $1, $2, $3, $4::jsonb, '{}'::jsonb, 'normal', u.id, $5, om."orgId", NOW(), NOW()
     FROM "User" u JOIN "OrgMember" om ON om."userId" = u.id
     WHERE u.email = 'paul@nashcc.com.au' LIMIT 1`,
    [id, "DDL Schema v1.5 (Postgres)", "domain", JSON.stringify(diagramData), PROJECT_ID]
  );
  console.log(`Created: ${id}`);
  console.log(`  ${elements.length} elements (${tables.length} tables + ${enumerations.length} enums)`);
  console.log(`  ${connectors.length} connectors`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
