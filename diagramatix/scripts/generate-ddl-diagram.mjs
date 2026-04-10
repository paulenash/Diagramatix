/**
 * Generate a Domain Diagram from the Diagramatix relational DDL.
 * Creates uml-class elements for tables and uml-enumeration elements for ref_ tables.
 * POSTs the diagram to the API.
 */

const PROJECT_ID = "cmne9q5ow0003os1kj0cmkqcz"; // "My Test Project 2"
const API_BASE = "http://localhost:3000";

// ─── DDL DEFINITIONS ────────────────────────────────────────────────

// Reference/lookup tables → UML enumerations
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

// Entity tables → UML classes
// Each attribute: { name, type, pk?, fk? (target table name) }
const tables = [
  {
    name: "org",
    attrs: [
      { name: "id", type: "TEXT", pk: true },
      { name: "name", type: "TEXT" },
      { name: "entity_type", type: "TEXT", fk: "ref_org_entity_type" },
      { name: "created_at", type: "TIMESTAMPTZ" },
    ],
  },
  {
    name: "app_user",
    attrs: [
      { name: "id", type: "TEXT", pk: true },
      { name: "email", type: "TEXT" },
      { name: "name", type: "TEXT" },
      { name: "password", type: "TEXT" },
      { name: "reset_token", type: "TEXT" },
      { name: "reset_token_expiry", type: "TIMESTAMPTZ" },
      { name: "created_at", type: "TIMESTAMPTZ" },
    ],
  },
  {
    name: "org_member",
    attrs: [
      { name: "id", type: "TEXT", pk: true },
      { name: "org_id", type: "TEXT", fk: "org" },
      { name: "user_id", type: "TEXT", fk: "app_user" },
      { name: "role", type: "TEXT", fk: "ref_org_role" },
      { name: "created_at", type: "TIMESTAMPTZ" },
    ],
  },
  {
    name: "project",
    attrs: [
      { name: "id", type: "TEXT", pk: true },
      { name: "name", type: "TEXT" },
      { name: "description", type: "TEXT" },
      { name: "owner_name", type: "TEXT" },
      { name: "user_id", type: "TEXT", fk: "app_user" },
      { name: "org_id", type: "TEXT", fk: "org" },
      { name: "created_at", type: "TIMESTAMPTZ" },
      { name: "updated_at", type: "TIMESTAMPTZ" },
    ],
  },
  {
    name: "diagram",
    attrs: [
      { name: "id", type: "TEXT", pk: true },
      { name: "name", type: "TEXT" },
      { name: "type", type: "TEXT", fk: "ref_diagram_type" },
      { name: "display_mode", type: "TEXT", fk: "ref_display_mode" },
      { name: "user_id", type: "TEXT", fk: "app_user" },
      { name: "project_id", type: "TEXT", fk: "project" },
      { name: "org_id", type: "TEXT", fk: "org" },
      { name: "created_at", type: "TIMESTAMPTZ" },
      { name: "updated_at", type: "TIMESTAMPTZ" },
    ],
  },
  {
    name: "diagram_template",
    attrs: [
      { name: "id", type: "TEXT", pk: true },
      { name: "name", type: "TEXT" },
      { name: "diagram_type", type: "TEXT", fk: "ref_diagram_type" },
      { name: "template_type", type: "TEXT" },
      { name: "user_id", type: "TEXT", fk: "app_user" },
      { name: "created_at", type: "TIMESTAMPTZ" },
      { name: "updated_at", type: "TIMESTAMPTZ" },
    ],
  },
  {
    name: "diagram_settings",
    attrs: [
      { name: "diagram_id", type: "TEXT", pk: true, fk: "diagram" },
      { name: "viewport_x", type: "NUMERIC" },
      { name: "viewport_y", type: "NUMERIC" },
      { name: "viewport_zoom", type: "NUMERIC" },
      { name: "font_size", type: "NUMERIC" },
      { name: "connector_font_size", type: "NUMERIC" },
      { name: "title_font_size", type: "NUMERIC" },
    ],
  },
  {
    name: "diagram_title",
    attrs: [
      { name: "diagram_id", type: "TEXT", pk: true, fk: "diagram" },
      { name: "version", type: "TEXT" },
      { name: "authors", type: "TEXT" },
      { name: "status", type: "TEXT", fk: "ref_diagram_status" },
      { name: "show_title", type: "BOOLEAN" },
    ],
  },
  {
    name: "element",
    attrs: [
      { name: "id", type: "TEXT", pk: true },
      { name: "diagram_id", type: "TEXT", fk: "diagram" },
      { name: "type", type: "TEXT", fk: "ref_symbol_type" },
      { name: "x", type: "NUMERIC" },
      { name: "y", type: "NUMERIC" },
      { name: "width", type: "NUMERIC" },
      { name: "height", type: "NUMERIC" },
      { name: "label", type: "TEXT" },
      { name: "parent_id", type: "TEXT", fk: "element" },
      { name: "boundary_host_id", type: "TEXT", fk: "element" },
      { name: "task_type", type: "TEXT", fk: "ref_bpmn_task_type" },
      { name: "gateway_type", type: "TEXT", fk: "ref_gateway_type" },
      { name: "event_type", type: "TEXT", fk: "ref_event_type" },
      { name: "repeat_type", type: "TEXT", fk: "ref_repeat_type" },
      { name: "flow_type", type: "TEXT", fk: "ref_flow_type" },
      { name: "gateway_role", type: "TEXT", fk: "ref_gateway_role" },
      { name: "pool_type", type: "TEXT", fk: "ref_pool_type" },
      { name: "subprocess_type", type: "TEXT", fk: "ref_subprocess_type" },
      { name: "interruption_type", type: "TEXT", fk: "ref_interruption_type" },
      { name: "ad_hoc", type: "BOOLEAN" },
      { name: "linked_diagram_id", type: "TEXT", fk: "diagram" },
      { name: "data_role", type: "TEXT", fk: "ref_data_role" },
      { name: "data_multiplicity", type: "TEXT", fk: "ref_data_multiplicity" },
      { name: "data_state", type: "TEXT" },
      { name: "label_offset_x", type: "NUMERIC" },
      { name: "label_offset_y", type: "NUMERIC" },
      { name: "label_width", type: "NUMERIC" },
      { name: "value_analysis", type: "TEXT", fk: "ref_value_analysis" },
      { name: "cycle_time", type: "NUMERIC" },
      { name: "wait_time", type: "NUMERIC" },
      { name: "time_unit", type: "TEXT", fk: "ref_time_unit" },
      { name: "time_unit_custom", type: "TEXT" },
      { name: "annotation_color", type: "TEXT", fk: "ref_annotation_color" },
      { name: "annotation_font_style", type: "TEXT", fk: "ref_annotation_font_style" },
      { name: "stereotype", type: "TEXT" },
      { name: "show_stereotype", type: "BOOLEAN" },
      { name: "show_attributes", type: "BOOLEAN" },
      { name: "show_operations", type: "BOOLEAN" },
      { name: "fill_color", type: "TEXT" },
      { name: "description", type: "TEXT" },
      { name: "show_description", type: "BOOLEAN" },
    ],
  },
  {
    name: "uml_attribute",
    attrs: [
      { name: "id", type: "BIGSERIAL", pk: true },
      { name: "element_id", type: "TEXT", fk: "element" },
      { name: "ordinal", type: "INT" },
      { name: "visibility", type: "TEXT", fk: "ref_uml_visibility" },
      { name: "name", type: "TEXT" },
      { name: "type", type: "TEXT" },
      { name: "multiplicity", type: "TEXT" },
      { name: "default_value", type: "TEXT" },
      { name: "property_string", type: "TEXT" },
      { name: "is_derived", type: "BOOLEAN" },
    ],
  },
  {
    name: "uml_operation",
    attrs: [
      { name: "id", type: "BIGSERIAL", pk: true },
      { name: "element_id", type: "TEXT", fk: "element" },
      { name: "ordinal", type: "INT" },
      { name: "visibility", type: "TEXT", fk: "ref_uml_visibility" },
      { name: "name", type: "TEXT" },
    ],
  },
  {
    name: "uml_enum_value",
    attrs: [
      { name: "id", type: "BIGSERIAL", pk: true },
      { name: "element_id", type: "TEXT", fk: "element" },
      { name: "ordinal", type: "INT" },
      { name: "value", type: "TEXT" },
    ],
  },
  {
    name: "connector",
    attrs: [
      { name: "id", type: "TEXT", pk: true },
      { name: "diagram_id", type: "TEXT", fk: "diagram" },
      { name: "source_id", type: "TEXT", fk: "element" },
      { name: "target_id", type: "TEXT", fk: "element" },
      { name: "type", type: "TEXT", fk: "ref_connector_type" },
      { name: "direction_type", type: "TEXT", fk: "ref_direction_type" },
      { name: "routing_type", type: "TEXT", fk: "ref_routing_type" },
      { name: "source_side", type: "TEXT", fk: "ref_side" },
      { name: "target_side", type: "TEXT", fk: "ref_side" },
      { name: "source_invisible_leader", type: "BOOLEAN" },
      { name: "target_invisible_leader", type: "BOOLEAN" },
      { name: "source_offset_along", type: "NUMERIC" },
      { name: "target_offset_along", type: "NUMERIC" },
      { name: "label", type: "TEXT" },
      { name: "bottleneck", type: "BOOLEAN" },
    ],
  },
  {
    name: "connector_waypoint",
    attrs: [
      { name: "id", type: "BIGSERIAL", pk: true },
      { name: "connector_id", type: "TEXT", fk: "connector" },
      { name: "ordinal", type: "INT" },
      { name: "x", type: "NUMERIC" },
      { name: "y", type: "NUMERIC" },
    ],
  },
  {
    name: "project_color",
    attrs: [
      { name: "id", type: "BIGSERIAL", pk: true },
      { name: "project_id", type: "TEXT", fk: "project" },
      { name: "symbol_type", type: "TEXT", fk: "ref_symbol_type" },
      { name: "color", type: "TEXT" },
    ],
  },
  {
    name: "diagram_color",
    attrs: [
      { name: "id", type: "BIGSERIAL", pk: true },
      { name: "diagram_id", type: "TEXT", fk: "diagram" },
      { name: "symbol_type", type: "TEXT", fk: "ref_symbol_type" },
      { name: "color", type: "TEXT" },
    ],
  },
  {
    name: "project_folder",
    attrs: [
      { name: "id", type: "TEXT", pk: true },
      { name: "project_id", type: "TEXT", pk: true, fk: "project" },
      { name: "name", type: "TEXT" },
      { name: "parent_id", type: "TEXT" },
      { name: "collapsed", type: "BOOLEAN" },
      { name: "ordinal", type: "INT" },
    ],
  },
  {
    name: "diagram_folder_map",
    attrs: [
      { name: "diagram_id", type: "TEXT", pk: true, fk: "diagram" },
      { name: "project_id", type: "TEXT", fk: "project" },
      { name: "folder_id", type: "TEXT" },
      { name: "ordinal", type: "INT" },
    ],
  },
  {
    name: "template_element",
    attrs: [
      { name: "id", type: "TEXT", pk: true },
      { name: "template_id", type: "TEXT", fk: "diagram_template" },
      { name: "type", type: "TEXT", fk: "ref_symbol_type" },
      { name: "x", type: "NUMERIC" },
      { name: "y", type: "NUMERIC" },
      { name: "width", type: "NUMERIC" },
      { name: "height", type: "NUMERIC" },
      { name: "label", type: "TEXT" },
    ],
  },
  {
    name: "template_element_property",
    attrs: [
      { name: "id", type: "BIGSERIAL", pk: true },
      { name: "element_id", type: "TEXT", fk: "template_element" },
      { name: "property_name", type: "TEXT" },
      { name: "property_value", type: "TEXT" },
    ],
  },
  {
    name: "template_connector",
    attrs: [
      { name: "id", type: "TEXT", pk: true },
      { name: "template_id", type: "TEXT", fk: "diagram_template" },
      { name: "source_id", type: "TEXT", fk: "template_element" },
      { name: "target_id", type: "TEXT", fk: "template_element" },
      { name: "type", type: "TEXT", fk: "ref_connector_type" },
      { name: "direction_type", type: "TEXT", fk: "ref_direction_type" },
      { name: "routing_type", type: "TEXT", fk: "ref_routing_type" },
      { name: "source_side", type: "TEXT", fk: "ref_side" },
      { name: "target_side", type: "TEXT", fk: "ref_side" },
    ],
  },
  {
    name: "template_connector_waypoint",
    attrs: [
      { name: "id", type: "BIGSERIAL", pk: true },
      { name: "connector_id", type: "TEXT", fk: "template_connector" },
      { name: "ordinal", type: "INT" },
      { name: "x", type: "NUMERIC" },
      { name: "y", type: "NUMERIC" },
    ],
  },
];

// ─── SIZING CONSTANTS ───────────────────────────────────────────────

const CHAR_W = 6.5;
const LINE_H = 14;
const BASE_HEADER_H = 28;
const PAD = 4;
const MIN_W = 80;
const MIN_H = 40;
const STEREO_H = 11;

function computeClassSize(t) {
  const headerH = BASE_HEADER_H + STEREO_H; // entity stereotype always shown
  const labelMaxW = t.name.length * CHAR_W;
  const stereoW = `«entity»`.length * CHAR_W * 0.8;
  let maxW = Math.max(stereoW, labelMaxW);
  for (const a of t.attrs) {
    const s = `+ ${a.name} : ${a.type}`;
    maxW = Math.max(maxW, s.length * CHAR_W);
  }
  const w = Math.max(MIN_W, maxW + PAD * 2);
  const attrsH = t.attrs.length * LINE_H + 8; // SECTION_PAD
  const h = Math.max(MIN_H, headerH + attrsH + 10); // BOTTOM_PAD
  return { w: Math.ceil(w), h: Math.ceil(h) };
}

function computeEnumSize(e) {
  const headerH = BASE_HEADER_H + STEREO_H;
  const stereoW = `«enumeration»`.length * CHAR_W * 0.8;
  const labelMaxW = e.name.length * CHAR_W;
  let maxW = Math.max(stereoW, labelMaxW);
  for (const v of e.values) {
    maxW = Math.max(maxW, v.length * CHAR_W);
  }
  const w = Math.max(MIN_W, maxW + PAD * 2);
  const h = Math.max(MIN_H, headerH + e.values.length * LINE_H);
  return { w: Math.ceil(w), h: Math.ceil(h) };
}

// ─── LAYOUT ─────────────────────────────────────────────────────────

let nextId = 1;
function mkId() { return `el-${nextId++}`; }
function mkConnId() { return `cn-${nextId++}`; }

const elements = [];
const connectors = [];
const elementMap = {}; // name → element id

// Layout tables in a grid — left columns for entities, right columns for enums
const TABLE_GAP_X = 60;
const TABLE_GAP_Y = 40;
const ENUM_START_X = 2200; // enums start further right

// Place entity tables
let col = 0, row = 0;
const MAX_COLS = 4;
let curX = 100, curY = 100;
let colWidths = [0, 0, 0, 0];
let rowH = 0;

// First pass: compute sizes
const tableSizes = tables.map(t => ({ ...t, ...computeClassSize(t) }));
const enumSizes = enumerations.map(e => ({ ...e, ...computeEnumSize(e) }));

// Place tables in grid
for (const t of tableSizes) {
  if (col >= MAX_COLS) { col = 0; curX = 100; curY += rowH + TABLE_GAP_Y; rowH = 0; }
  const id = mkId();
  elementMap[t.name] = id;
  elements.push({
    id,
    type: "uml-class",
    x: curX, y: curY, width: t.w, height: t.h,
    label: t.name,
    properties: {
      showAttributes: true,
      showOperations: false,
      stereotype: "entity",
      showStereotype: true,
      attributes: t.attrs.map((a, i) => ({
        visibility: "+",
        name: a.name,
        type: a.type,
        ...(a.pk ? { propertyString: "{PK}" } : {}),
      })),
    },
  });
  rowH = Math.max(rowH, t.h);
  curX += t.w + TABLE_GAP_X;
  col++;
}

// Place enumerations in a separate grid to the right
let enumCol = 0, enumRow = 0;
let enumX = ENUM_START_X, enumY = 100;
const ENUM_MAX_COLS = 5;
let enumRowH = 0;

for (const e of enumSizes) {
  if (enumCol >= ENUM_MAX_COLS) { enumCol = 0; enumX = ENUM_START_X; enumY += enumRowH + TABLE_GAP_Y; enumRowH = 0; }
  const id = mkId();
  elementMap[e.name] = id;
  elements.push({
    id,
    type: "uml-enumeration",
    x: enumX, y: enumY, width: e.w, height: e.h,
    label: e.name,
    properties: {
      stereotype: "enumeration",
      showStereotype: true,
      values: e.values,
    },
  });
  enumRowH = Math.max(enumRowH, e.h);
  enumX += e.w + TABLE_GAP_X;
  enumCol++;
}

// Create connectors for FK relationships
for (const t of tables) {
  const srcId = elementMap[t.name];
  for (const a of t.attrs) {
    if (!a.fk) continue;
    const tgtId = elementMap[a.fk];
    if (!tgtId) { console.warn(`FK target not found: ${a.fk} from ${t.name}.${a.name}`); continue; }
    // Self-reference? skip connector visual for now
    if (srcId === tgtId) continue;

    const isToEnum = a.fk.startsWith("ref_");
    const connType = isToEnum ? "uml-association" : "uml-association";

    // Determine multiplicities
    // FK to ref table: many-to-one (source: *, target: 1)
    // FK to entity: many-to-one or one-to-one depending on PK
    const srcMult = a.pk ? "1" : "*";
    const tgtMult = "1";

    connectors.push({
      id: mkConnId(),
      sourceId: srcId,
      targetId: tgtId,
      sourceSide: isToEnum ? "right" : "right",
      targetSide: isToEnum ? "left" : "left",
      type: "uml-association",
      directionType: "non-directed",
      routingType: "rectilinear",
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints: [],
      sourceMultiplicity: srcMult,
      targetMultiplicity: tgtMult,
    });
  }
}

// ─── BUILD DIAGRAM DATA ─────────────────────────────────────────────

const diagramData = {
  elements,
  connectors,
  viewport: { x: 0, y: 0, zoom: 0.5 },
  title: { version: "1.5", authors: "Generated from DDL", status: "draft", showTitle: true },
  fontSize: 12,
  connectorFontSize: 10,
  titleFontSize: 14,
};

// ─── POST TO API ────────────────────────────────────────────────────

async function main() {
  // First, authenticate
  const loginRes = await fetch(`${API_BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      email: "paul@nashcc.com.au",
      password: "password",
      redirect: "false",
      json: "true",
      csrfToken: "",
    }),
    redirect: "manual",
  });

  // Use direct DB insert instead
  const pg = await import("pg");
  const pool = new pg.default.Pool({ connectionString: "postgresql://postgres:postgres@localhost:51214/postgres" });

  const id = "ddl-domain-diagram-" + Date.now();
  await pool.query(
    `INSERT INTO "Diagram" (id, name, type, data, "colorConfig", "displayMode", "userId", "projectId", "orgId", "createdAt", "updatedAt")
     SELECT $1, $2, $3, $4::jsonb, '{}'::jsonb, 'normal',
            u.id, $5, om."orgId", NOW(), NOW()
     FROM "User" u
     JOIN "OrgMember" om ON om."userId" = u.id
     WHERE u.email = 'paul@nashcc.com.au'
     LIMIT 1`,
    [id, "DDL Schema v1.5", "domain", JSON.stringify(diagramData), PROJECT_ID]
  );

  console.log(`Created diagram: ${id}`);
  console.log(`  Elements: ${elements.length} (${tables.length} entities + ${enumerations.length} enumerations)`);
  console.log(`  Connectors: ${connectors.length}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
